import * as pdfjsLib from 'pdfjs-dist';
import { MCQQuestion, TestSettings } from '../types';
import { requestMCQGeneration } from './geminiService';
import { fileToBase64 } from './pdfService';

export interface BatchProgressCallback {
  (message: string, currentStep?: number, totalSteps?: number): void;
}

export interface ProcessPdfOptions {
  file?: File;
  text?: string;
  pdfBase64?: string;
  pageCount?: number;
  fileName?: string;
  fileSizeBytes?: number;
  settings: TestSettings;
  onProgress: BatchProgressCallback;
}

interface SelectedChunk {
  index: number;
  startPage: number;
  endPage: number;
  pageCount: number;
}

// Yield execution to the browser event loop so UI and animations never freeze
function yieldToUIThread(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pick at most 10 chunks spread evenly across the document (first, last, and rest evenly spaced)
export function selectEvenChunks(totalPages: number, chunkSize = 5): SelectedChunk[] {
  const totalChunks = Math.ceil(totalPages / chunkSize);
  if (totalChunks === 0) return [];

  // If fewer than or equal to 10 chunks, use all chunks
  if (totalChunks <= 10) {
    const chunks: SelectedChunk[] = [];
    for (let c = 0; c < totalChunks; c++) {
      const start = c * chunkSize + 1;
      const end = Math.min((c + 1) * chunkSize, totalPages);
      chunks.push({
        index: c,
        startPage: start,
        endPage: end,
        pageCount: end - start + 1,
      });
    }
    return chunks;
  }

  // If more than 10 chunks, pick exactly 10 chunks:
  // First chunk (0), Last chunk (totalChunks - 1), and 8 in between spread evenly
  const selectedIndices: number[] = [];
  for (let i = 0; i < 10; i++) {
    const idx = Math.min(totalChunks - 1, Math.round((i * (totalChunks - 1)) / 9));
    if (!selectedIndices.includes(idx)) {
      selectedIndices.push(idx);
    }
  }

  // Ensure exactly 10 unique indices
  let candidate = 0;
  while (selectedIndices.length < 10 && candidate < totalChunks) {
    if (!selectedIndices.includes(candidate)) {
      selectedIndices.push(candidate);
    }
    candidate++;
  }

  selectedIndices.sort((a, b) => a - b);

  return selectedIndices.map((idx) => {
    const start = idx * chunkSize + 1;
    const end = Math.min((idx + 1) * chunkSize, totalPages);
    return {
      index: idx,
      startPage: start,
      endPage: end,
      pageCount: end - start + 1,
    };
  });
}

// Trim and balance final questions to exactly 10, keeping 4 Factual / 3 Conceptual / 3 Application mix
export function balanceQuestionsTo10(questions: MCQQuestion[]): MCQQuestion[] {
  if (questions.length === 10) {
    return questions.map((q, idx) => ({ ...q, id: idx + 1 }));
  }

  if (questions.length < 10) {
    return questions.map((q, idx) => ({ ...q, id: idx + 1 }));
  }

  // Desired target counts
  const targetCounts: Record<string, number> = {
    factual: 4,
    conceptual: 3,
    application: 3,
  };

  const currentCounts: Record<string, number> = {
    factual: 0,
    conceptual: 0,
    application: 0,
  };

  const selected: MCQQuestion[] = [];
  const excess: MCQQuestion[] = [];

  for (const q of questions) {
    const type = q.type || 'factual';
    if ((currentCounts[type] || 0) < (targetCounts[type] || 0)) {
      selected.push(q);
      currentCounts[type] = (currentCounts[type] || 0) + 1;
    } else {
      excess.push(q);
    }
    if (selected.length === 10) break;
  }

  // Fill up if any category was deficient
  while (selected.length < 10 && excess.length > 0) {
    selected.push(excess.shift()!);
  }

  return selected.slice(0, 10).map((q, idx) => ({ ...q, id: idx + 1 }));
}

/**
 * Main PDF to MCQ Processor Pipeline
 */
export async function processPdfForMCQs(options: ProcessPdfOptions): Promise<MCQQuestion[]> {
  const { file, text, pdfBase64, settings, onProgress } = options;

  // Case 1: Pre-extracted text / Sample Document
  if (!file && text) {
    onProgress('Formulating 10 balanced MCQs from sample document...');
    const questions = await requestMCQGeneration({
      text,
      pdfBase64,
      difficulty: settings.difficulty,
      language: settings.language,
      questionCount: 10,
    });
    return balanceQuestionsTo10(questions);
  }

  if (!file) {
    throw new Error('No PDF file or text content provided for test generation.');
  }

  // Load PDF with pdf.js
  onProgress('Inspecting PDF document structure...');
  await yieldToUIThread();

  const arrayBuffer = await file.arrayBuffer();
  let pdfDoc: pdfjsLib.PDFDocumentProxy;
  try {
    pdfDoc = await pdfjsLib.getDocument({
      data: arrayBuffer,
      useSystemFonts: true,
    }).promise;
  } catch (err: any) {
    throw new Error(
      `Unable to parse PDF: ${err.message || 'Corrupted or password protected file.'}`
    );
  }

  const totalPages = pdfDoc.numPages;
  if (totalPages === 0) {
    throw new Error('The uploaded PDF has 0 pages.');
  }

  // RULE 1: If 10 pages or fewer, keep the current single-pass behavior
  if (totalPages <= 10) {
    onProgress(`Reading ${totalPages} page(s)...`);
    await yieldToUIThread();

    const pageTexts: string[] = [];
    for (let p = 1; p <= totalPages; p++) {
      try {
        const page = await pdfDoc.getPage(p);
        const textContent = await page.getTextContent();
        const str = textContent.items
          .map((i: any) => ('str' in i ? i.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (str) pageTexts.push(str);
        page.cleanup();
      } catch (e) {
        console.warn(`Error reading page ${p}:`, e);
      }
    }

    const fullText = pageTexts.join('\n\n');
    const isScanned = fullText.trim().length < 150;

    let singlePassPdfBase64: string | undefined = undefined;
    if (isScanned) {
      onProgress('Scanned document detected. Preparing inline PDF for Gemini...');
      singlePassPdfBase64 = await fileToBase64(file);
    }

    onProgress('Generating 10 questions with AI test paper setter...');
    const questions = await requestMCQGeneration({
      text: isScanned ? undefined : fullText,
      pdfBase64: singlePassPdfBase64,
      difficulty: settings.difficulty,
      language: settings.language,
      questionCount: 10,
    });

    return balanceQuestionsTo10(questions);
  }

  // RULE 2 & 3: If > 10 pages, divide into 5-page chunks and pick exactly 10 chunks evenly spaced
  const selectedChunks = selectEvenChunks(totalPages, 5);

  // RULE 4: Extract text ONLY from the 10 selected chunks (skipping all other pages!)
  onProgress(`Reading sample sections across ${totalPages} pages...`);
  await yieldToUIThread();

  interface ExtractedChunk {
    chunk: SelectedChunk;
    text: string;
    firstPageImage?: string;
  }

  const extractedChunks: ExtractedChunk[] = [];
  let totalExtractedLength = 0;

  for (let i = 0; i < selectedChunks.length; i++) {
    const chunk = selectedChunks[i];
    const chunkPageTexts: string[] = [];
    let firstPageImage: string | undefined = undefined;

    for (let p = chunk.startPage; p <= chunk.endPage; p++) {
      try {
        const page = await pdfDoc.getPage(p);
        const textContent = await page.getTextContent();
        const pageStr = textContent.items
          .map((item: any) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (pageStr) {
          chunkPageTexts.push(pageStr);
        }

        // Cache first page render in case document is scanned
        if (p === chunk.startPage && !firstPageImage) {
          try {
            const viewport = page.getViewport({ scale: 1.1 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              await page.render({ canvasContext: ctx, viewport, canvas }).promise;
              firstPageImage = canvas.toDataURL('image/jpeg', 0.75).split(',')[1];
            }
          } catch (renderErr) {
            console.warn(`Render fallback failed for page ${p}:`, renderErr);
          }
        }

        page.cleanup(); // Clean up page resources immediately
      } catch (err) {
        console.warn(`Error reading page ${p}:`, err);
      }
    }

    // Trim each chunk to a reasonable length (~1800 characters) to keep request compact
    const rawChunkText = chunkPageTexts.join(' ');
    const trimmedChunkText = rawChunkText.slice(0, 1800).trim();
    totalExtractedLength += trimmedChunkText.length;

    extractedChunks.push({
      chunk,
      text: trimmedChunkText,
      firstPageImage,
    });

    // Yield every couple of chunks to keep the UI fluid
    if (i % 2 === 0) {
      await yieldToUIThread(20);
    }
  }

  const isScanned = totalExtractedLength < 100;
  let totalGeminiRequests = 0; // Hard limit: never exceed 3 total requests
  const collectedQuestions: MCQQuestion[] = [];
  let lastErrorMessage = '';

  // Helper to safely execute a request with 1 retry
  const executeWithRetry = async (
    params: Parameters<typeof requestMCQGeneration>[0],
    description: string
  ): Promise<MCQQuestion[]> => {
    if (totalGeminiRequests >= 3) return [];

    let attempt = 1;
    while (attempt <= 2 && totalGeminiRequests < 3) {
      totalGeminiRequests++;
      try {
        const res = await requestMCQGeneration(params);
        if (Array.isArray(res) && res.length > 0) {
          return res;
        }
      } catch (err: any) {
        lastErrorMessage = err?.message || String(err);
        console.warn(`${description} attempt ${attempt} failed:`, err);
        if (attempt === 1 && totalGeminiRequests < 3) {
          onProgress(`Retrying question generation (attempt 2)...`);
          await yieldToUIThread(200);
        }
      }
      attempt++;
    }
    return [];
  };

  // Helper to add unique questions
  const addQuestions = (newQuestions: MCQQuestion[]) => {
    for (const q of newQuestions) {
      const isDup = collectedQuestions.some(
        (existing) =>
          existing.question.toLowerCase().trim() === q.question.toLowerCase().trim()
      );
      if (!isDup) {
        collectedQuestions.push(q);
      }
    }
  };

  if (!isScanned) {
    // RULE 5: Text PDFs - ONE Gemini request containing the 10 excerpts asking for exactly 10 MCQs
    const combinedExcerpts = extractedChunks
      .map(
        (item, idx) =>
          `[EXCERPT ${idx + 1} OF ${extractedChunks.length} - Pages ${item.chunk.startPage}-${item.chunk.endPage}]\n${item.text}`
      )
      .join('\n\n---\n\n');

    onProgress('Generating questions (step 1 of 1)...');
    await yieldToUIThread();

    const questions = await executeWithRetry(
      {
        text: combinedExcerpts,
        difficulty: settings.difficulty,
        language: settings.language,
        questionCount: 10,
      },
      'Text excerpts 10-MCQ request'
    );

    addQuestions(questions);

    // RULE 7: If result is still short of 10, make ONE extra top-up request for the missing questions only
    if (collectedQuestions.length < 10 && totalGeminiRequests < 3) {
      const missingCount = 10 - collectedQuestions.length;
      onProgress(`Finalizing questions (topping up ${missingCount} question${missingCount > 1 ? 's' : ''})...`);
      await yieldToUIThread();

      const topUpQuestions = await executeWithRetry(
        {
          text: combinedExcerpts,
          difficulty: settings.difficulty,
          language: settings.language,
          questionCount: missingCount,
          avoidQuestions: collectedQuestions.map((q) => q.question),
        },
        'Top-up request'
      );

      addQuestions(topUpQuestions);
    }
  } else {
    // RULE 6: Scanned PDFs - send only 1-2 pages from each chunk in at most 2 requests (5 excerpts each), then merge
    const half = Math.ceil(extractedChunks.length / 2);
    const group1 = extractedChunks.slice(0, half);
    const group2 = extractedChunks.slice(half);

    let imagesGroup1 = group1
      .map((g) => g.firstPageImage)
      .filter((img): img is string => typeof img === 'string' && img.length > 0);

    let imagesGroup2 = group2
      .map((g) => g.firstPageImage)
      .filter((img): img is string => typeof img === 'string' && img.length > 0);

    let scannedPdfBase64: string | undefined = undefined;
    if (imagesGroup1.length === 0 && file) {
      onProgress('Preparing document scan data for Gemini...');
      scannedPdfBase64 = await fileToBase64(file);
    }

    // Request 1: 5 excerpts
    onProgress('Generating questions (step 1 of 2)...');
    await yieldToUIThread();

    const questions1 = await executeWithRetry(
      {
        pageImages: imagesGroup1.length > 0 ? imagesGroup1 : undefined,
        pdfBase64: imagesGroup1.length === 0 ? scannedPdfBase64 : undefined,
        difficulty: settings.difficulty,
        language: settings.language,
        questionCount: 5,
      },
      'Scanned group 1 (step 1 of 2)'
    );
    addQuestions(questions1);

    // Request 2: next 5 excerpts
    if (totalGeminiRequests < 3) {
      onProgress('Generating questions (step 2 of 2)...');
      await yieldToUIThread();

      const questions2 = await executeWithRetry(
        {
          pageImages: imagesGroup2.length > 0 ? imagesGroup2 : undefined,
          pdfBase64: imagesGroup2.length === 0 ? scannedPdfBase64 : undefined,
          difficulty: settings.difficulty,
          language: settings.language,
          questionCount: 5,
          avoidQuestions: collectedQuestions.map((q) => q.question),
        },
        'Scanned group 2 (step 2 of 2)'
      );
      addQuestions(questions2);
    }

    // Top-up if short and requests remain under 3
    if (collectedQuestions.length < 10 && totalGeminiRequests < 3) {
      const missingCount = 10 - collectedQuestions.length;
      onProgress(`Finalizing questions (topping up ${missingCount} question${missingCount > 1 ? 's' : ''})...`);
      await yieldToUIThread();

      const topUp = await executeWithRetry(
        {
          pageImages: imagesGroup1.length > 0 ? imagesGroup1.slice(0, 3) : undefined,
          pdfBase64: imagesGroup1.length === 0 ? scannedPdfBase64 : undefined,
          difficulty: settings.difficulty,
          language: settings.language,
          questionCount: missingCount,
          avoidQuestions: collectedQuestions.map((q) => q.question),
        },
        'Scanned top-up request'
      );
      addQuestions(topUp);
    }
  }

  // Show error ONLY if final total cannot reach 10
  if (collectedQuestions.length < 10) {
    const detail = lastErrorMessage ? ` (${lastErrorMessage})` : '';
    throw new Error(
      `Could only formulate ${collectedQuestions.length} valid MCQs from this document. Exactly 10 questions are required.${detail} Please ensure the document contains sufficient readable content.`
    );
  }

  onProgress('Validating questions and configuring CBT question palette...');
  await yieldToUIThread();

  return balanceQuestionsTo10(collectedQuestions);
}
