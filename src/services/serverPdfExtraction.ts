import { GoogleGenAI } from '@google/genai';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';

export interface ExtractedQuestion {
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
    E?: string;
  };
  correctOption: 'A' | 'B' | 'C' | 'D' | 'E' | '';
  explanation: string;
  type: 'factual' | 'conceptual' | 'application';
  sourcePages: string;
  examName: string;
  year: string;
  answerStatus: 'found' | 'missing';
  pageNumber: number;
  questionNumber?: number;
  explanationLinked?: boolean;
  usedEndAnswerKey?: boolean;
  parsedBy?: 'rules' | 'gemini';
  needs_review?: boolean;
  reviewReasons?: string[];
}

export interface PageParseResult {
  pageNumber: number;
  pageHash: string;
  isScanned: boolean;
  isNotesOnly: boolean;
  isComplete: boolean;
  questions: ExtractedQuestion[];
  skippedQuestions: Array<{ pageNumber: number; reason: string }>;
  rawText: string;
}

export interface BatchExtractionResult {
  questions: ExtractedQuestion[];
  skippedQuestions: Array<{ pageNumber: number; reason: string }>;
  failedPageNumbers: number[];
  notesPagesSkipped: number;
  parsedByRulesCount: number;
  parsedByGeminiCount: number;
  geminiCallsCount: number;
  linkedExplanationsCount: number;
  endAnswerKeyMatchesCount: number;
}

// Memory & Disk Hash Cache to guarantee a page is never sent to Gemini twice
const pageExtractionCache = new Map<string, { questions: ExtractedQuestion[]; skippedQuestions: any[] }>();

export function getCachedPageResult(pageHash: string) {
  return pageExtractionCache.get(pageHash) || null;
}

export function setCachedPageResult(pageHash: string, result: { questions: ExtractedQuestion[]; skippedQuestions: any[] }) {
  pageExtractionCache.set(pageHash, result);
}

export function sanitizeStr(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '')
    .trim();
}

export function mapOptionKey(raw: unknown): 'A' | 'B' | 'C' | 'D' | 'E' | '' {
  const str = String(raw || '').trim().toUpperCase();
  if (['A', 'B', 'C', 'D', 'E'].includes(str)) return str as any;
  if (str === '1' || str === '(1)' || str === 'I' || str === '(I)') return 'A';
  if (str === '2' || str === '(2)' || str === 'II' || str === '(II)') return 'B';
  if (str === '3' || str === '(3)' || str === 'III' || str === '(III)') return 'C';
  if (str === '4' || str === '(4)' || str === 'IV' || str === '(IV)') return 'D';
  if (str === '5' || str === '(5)' || str === 'V' || str === '(V)') return 'E';
  if (str === '(A)' || str === 'OPT A' || str === 'OPTION A' || str === 'A.') return 'A';
  if (str === '(B)' || str === 'OPT B' || str === 'OPTION B' || str === 'B.') return 'B';
  if (str === '(C)' || str === 'OPT C' || str === 'OPTION C' || str === 'C.') return 'C';
  if (str === '(D)' || str === 'OPT D' || str === 'OPTION D' || str === 'D.') return 'D';
  if (str === '(E)' || str === 'OPT E' || str === 'OPTION E' || str === 'E.') return 'E';
  return '';
}

/**
 * Accurately extracts page count using pdf-lib. Never falls back to arbitrary numbers.
 */
export async function getExactPageCount(pdfBuffer: Buffer): Promise<number> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const count = pdfDoc.getPageCount();
    if (count > 0) return count;
  } catch (err: any) {
    console.warn('pdf-lib failed to get page count, trying pdfjs fallback:', err?.message);
  }

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
    });
    const doc = await loadingTask.promise;
    if (doc.numPages > 0) return doc.numPages;
  } catch (err: any) {
    throw new Error(`Could not read PDF page count or invalid PDF document: ${err?.message || 'Corrupted file'}`);
  }

  throw new Error('Could not read PDF page count or invalid PDF document: 0 pages detected.');
}

/**
 * Slices only the exact pages needed for a batch. Never sends the whole PDF.
 */
export async function slicePdfPages(
  pdfBuffer: Buffer,
  pageNumbers: number[]
): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const subDoc = await PDFDocument.create();

  const totalPages = srcDoc.getPageCount();
  const validIndices = pageNumbers
    .map((p) => p - 1)
    .filter((idx) => idx >= 0 && idx < totalPages);

  if (validIndices.length === 0) {
    throw new Error('No valid page indices to slice.');
  }

  const copiedPages = await subDoc.copyPages(srcDoc, validIndices);
  copiedPages.forEach((page) => subDoc.addPage(page));

  const subPdfBytes = await subDoc.save();
  return Buffer.from(subPdfBytes);
}

interface TextItemPos {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Column-aware text extraction using text coordinate positions.
 * Splits page at vertical midline, reads left column top-to-bottom, then right column top-to-bottom.
 * Filters repeating headers, footers, watermarks, and page numbers.
 */
export async function extractColumnAwarePageText(
  pdfDoc: any,
  pageNum: number
): Promise<{ text: string; isScanned: boolean; rawItemCount: number }> {
  try {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    const items: TextItemPos[] = [];
    let totalChars = 0;

    for (const item of textContent.items) {
      if (!('str' in item) || !item.str) continue;
      const str = String(item.str).trim();
      if (!str) continue;

      totalChars += str.length;
      const tx = item.transform || [1, 0, 0, 1, 0, 0];
      const x = tx[4] ?? 0;
      const y = tx[5] ?? 0;
      const w = item.width ?? 0;
      const h = item.height ?? 10;

      // Filter repeating headers (top ~40pt) and footers (bottom ~35pt)
      const isHeaderZone = y > viewport.height - 40;
      const isFooterZone = y < 35;
      const upper = str.toUpperCase();

      if (
        (isHeaderZone || isFooterZone) &&
        (upper.includes('PREDICTABLE EBOOK') ||
          upper.includes('GENERAL STUDIES') ||
          upper.includes('PAGE ') ||
          /^[Gg]-\d+$/.test(str) ||
          /^\d+\s*of\s*\d+$/.test(str) ||
          /^\d{1,4}$/.test(str))
      ) {
        continue;
      }

      // Ignore floating watermarks
      if (upper.includes('WWW.') || upper.includes('TELEGRAM') || upper.includes('COACHING')) {
        continue;
      }

      items.push({ str: item.str, x, y, w, h });
    }

    // Scanned page check: if fewer than 50 text characters
    if (totalChars < 50 || items.length < 5) {
      return { text: '', isScanned: true, rawItemCount: items.length };
    }

    const midline = viewport.width / 2;
    const leftItems = items.filter((it) => it.x < midline);
    const rightItems = items.filter((it) => it.x >= midline);

    function sortAndBuildColumn(colItems: TextItemPos[]): string {
      if (colItems.length === 0) return '';
      // In PDF, y is 0 at bottom, increasing upwards. Sort y descending for top-to-bottom.
      colItems.sort((a, b) => {
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > 4) return yDiff;
        return a.x - b.x;
      });

      // Group into lines by y proximity
      const lines: string[] = [];
      let currentLine: string[] = [];
      let lastY = -9999;

      for (const item of colItems) {
        if (lastY === -9999 || Math.abs(item.y - lastY) <= 4) {
          currentLine.push(item.str);
          lastY = item.y;
        } else {
          if (currentLine.length > 0) {
            lines.push(currentLine.join(' '));
          }
          currentLine = [item.str];
          lastY = item.y;
        }
      }
      if (currentLine.length > 0) {
        lines.push(currentLine.join(' '));
      }

      return lines.join('\n');
    }

    const leftText = sortAndBuildColumn(leftItems);
    const rightText = sortAndBuildColumn(rightItems);

    const combinedText = [leftText, rightText].filter(Boolean).join('\n\n--- Column Break ---\n\n');
    return { text: combinedText, isScanned: false, rawItemCount: items.length };
  } catch (err: any) {
    console.warn(`Error reading column-aware text on page ${pageNum}:`, err.message);
    return { text: '', isScanned: true, rawItemCount: 0 };
  }
}

/**
 * Scans the last 3 pages and any dedicated answer key page to extract end-of-document answer keys.
 */
export async function scanEndAnswerKeys(
  pdfDoc: any,
  totalPages: number
): Promise<Map<number, 'A' | 'B' | 'C' | 'D' | 'E'>> {
  const answerMap = new Map<number, 'A' | 'B' | 'C' | 'D' | 'E'>();
  const scanPages = new Set<number>();

  for (let p = Math.max(1, totalPages - 2); p <= totalPages; p++) {
    scanPages.add(p);
  }

  for (const pageNum of scanPages) {
    try {
      const { text } = await extractColumnAwarePageText(pdfDoc, pageNum);
      if (!text) continue;

      const lower = text.toLowerCase();
      const hasKeyMarker =
        lower.includes('answer key') ||
        lower.includes('answers') ||
        lower.includes('उत्तर कुंजी') ||
        lower.includes('ans key') ||
        lower.includes('उत्तरमाला');

      // Match pairs like: "1. (b)", "24 - C", "Q.5: A", "102 (d)"
      const pairRegex = /(?:Q\.?\s*)?(\b\d{1,3}\b)\s*[:\.\-\)\s\t]+\(?([a-dA-D1-4])\)?/g;
      let match;
      let matchesOnPage = 0;

      while ((match = pairRegex.exec(text)) !== null) {
        const qNum = parseInt(match[1], 10);
        const opt = mapOptionKey(match[2]);
        if (qNum > 0 && qNum <= 300 && opt) {
          if (!answerMap.has(qNum)) {
            answerMap.set(qNum, opt);
            matchesOnPage++;
          }
        }
      }

      if (matchesOnPage > 5 || hasKeyMarker) {
        console.log(`Discovered end answer key on page ${pageNum}: ${matchesOnPage} mapped answers.`);
      }
    } catch {}
  }

  return answerMap;
}

/**
 * Counts question markers independently of the parser for per-page completeness check.
 * Evaluates answer lines like 'Ans. (c)', exam tags '[...]', and question numbers.
 */
export function countPageMarkers(pageText: string): {
  expectedCount: number;
  ansCount: number;
  examTagCount: number;
  qNumCount: number;
} {
  const ansMatches = pageText.match(/(?:Ans(?:wer)?|उत्तर)\.?\s*[:\-\.]?\s*\(?([a-dA-D1-4])\)?/gi) || [];
  const examTagMatches = pageText.match(/\[([^\]]*?(?:U\.?P|B\.?P|I\.?A|S\.?S|M\.?P|R\.?A|SI|Police|Exam|Pre|CGL|CDS|NDA|\d{4})[^\]]*?)\]/gi) || [];
  const qNumMatches = pageText.match(/(?:^|\n)\s*(?:Q\.?\s*)?(\d{1,4})\s*[\.\-\)\:]\s+/gi) || [];

  const ansCount = ansMatches.length;
  const examTagCount = examTagMatches.length;
  const qNumCount = qNumMatches.length;

  // Most reliable marker count is ansCount when present, or question number count
  const expectedCount = Math.max(ansCount, qNumCount, examTagCount);
  return { expectedCount, ansCount, examTagCount, qNumCount };
}

/**
 * Checks for sequence gaps or duplicates across extracted questions.
 */
export function findSequenceGaps(questions: ExtractedQuestion[]): Array<{
  pageNumber: number;
  questionNumber?: number;
  reason: string;
}> {
  const gaps: Array<{ pageNumber: number; questionNumber?: number; reason: string }> = [];
  if (questions.length <= 1) return gaps;

  const numbered = questions
    .filter((q) => typeof q.questionNumber === 'number' && q.questionNumber > 0)
    .sort((a, b) => a.questionNumber! - b.questionNumber!);

  for (let i = 0; i < numbered.length - 1; i++) {
    const cur = numbered[i];
    const next = numbered[i + 1];
    const diff = next.questionNumber! - cur.questionNumber!;

    if (diff === 0 && cur.question.toLowerCase() !== next.question.toLowerCase()) {
      gaps.push({
        pageNumber: next.pageNumber,
        questionNumber: next.questionNumber,
        reason: `Repeated question number Q.${next.questionNumber} on page ${next.pageNumber}`,
      });
    } else if (diff > 1 && diff <= 15) {
      for (let missing = cur.questionNumber! + 1; missing < next.questionNumber!; missing++) {
        gaps.push({
          pageNumber: cur.pageNumber,
          questionNumber: missing,
          reason: `Missing question ${missing} in sequence between Q.${cur.questionNumber} (p.${cur.pageNumber}) and Q.${next.questionNumber} (p.${next.pageNumber})`,
        });
      }
    }
  }

  return gaps;
}

/**
 * Parse regular Indian exam question format with strict rules first.
 * Supports cross-page/cross-column stitching and flags incomplete questions with needs_review: true.
 */
export function extractOptionsFromBlock(blockText: string): {
  optMap: { A: string; B: string; C: string; D: string; E?: string };
  qTextPrompt: string;
} {
  const optMap: { A: string; B: string; C: string; D: string; E?: string } = { A: '', B: '', C: '', D: '' };

  let optionTextZone = blockText;
  const cutoffMatch = blockText.match(
    /\n\s*(?:Ans(?:wer)?\b\.?|उत्तर\b\.?|Exp\.(?:\s*[:\-])?|Explanation\b\s*[:\-\.]?|व्याख्या\b\s*[:\-\.]?|Ans\s*[:\-\.])/i
  );
  if (cutoffMatch && cutoffMatch.index !== undefined) {
    optionTextZone = blockText.substring(0, cutoffMatch.index);
  }

  const markerRegex = /(?:^|[\s\n])(?:\(|\[)?([a-eA-E1-5])(?:\)|\]|\.|\:)\s+|(?:^|[\s\n])\(([a-eA-E1-5])\s+/g;
  const matches: Array<{ key: 'A' | 'B' | 'C' | 'D' | 'E'; startIdx: number; contentStartIdx: number }> = [];

  let match;
  while ((match = markerRegex.exec(optionTextZone)) !== null) {
    const rawKey = match[1] || match[2];
    const key = mapOptionKey(rawKey);
    if (key) {
      const fullMatchStr = match[0];
      const matchIndex = match.index + (fullMatchStr.length - fullMatchStr.trimStart().length);
      const contentIndex = match.index + fullMatchStr.length;
      matches.push({ key, startIdx: matchIndex, contentStartIdx: contentIndex });
    }
  }

  const cleanMatches = matches.filter((m) => {
    const beforeText = optionTextZone.substring(Math.max(0, m.startIdx - 50), m.startIdx);
    if (/\[[^\]]*$/i.test(beforeText)) return false;
    return true;
  });

  const seqKeys = ['A', 'B', 'C', 'D', 'E'] as const;
  const validSequence: Array<{ key: 'A' | 'B' | 'C' | 'D' | 'E'; startIdx: number; contentStartIdx: number }> = [];

  for (const m of cleanMatches) {
    if (validSequence.length === 0) {
      if (m.key === 'A' || m.key === 'B') validSequence.push(m);
    } else {
      const lastKey = validSequence[validSequence.length - 1].key;
      const expectedIdx = seqKeys.indexOf(lastKey) + 1;
      if (expectedIdx < 5 && m.key === seqKeys[expectedIdx]) {
        validSequence.push(m);
      }
    }
  }

  const finalMarkers = validSequence.length >= 2 ? validSequence : [];
  if (finalMarkers.length < 2) {
    const seen = new Set<string>();
    for (const m of cleanMatches) {
      if (!seen.has(m.key)) {
        seen.add(m.key);
        finalMarkers.push(m);
      }
    }
  }

  finalMarkers.sort((a, b) => a.startIdx - b.startIdx);

  let qTextPrompt = blockText;
  if (finalMarkers.length > 0) {
    qTextPrompt = optionTextZone.substring(0, finalMarkers[0].startIdx).trim();

    for (let i = 0; i < finalMarkers.length; i++) {
      const current = finalMarkers[i];
      const nextStart = i + 1 < finalMarkers.length ? finalMarkers[i + 1].startIdx : optionTextZone.length;
      const rawOptVal = optionTextZone.substring(current.contentStartIdx, nextStart).trim();
      const cleanVal = sanitizeStr(
        rawOptVal
          .replace(/[\n\r]+/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/G–\d+|#FROOHFWRUBVDKLEDD|PREDICTABLE\s+EBOOK\s+ONLINE/gi, '')
          .trim()
      );
      if (cleanVal && !optMap[current.key]) {
        optMap[current.key] = cleanVal;
      }
    }
  }

  return { optMap, qTextPrompt };
}

/**
 * Verbatim deterministic rule-based parser for Indian national exam question papers.
 */
export function parseQuestionsWithRules(
  pageText: string,
  pageNumber: number,
  previousExplanation?: string,
  previousPendingQuestion?: ExtractedQuestion
): {
  questions: ExtractedQuestion[];
  isComplete: boolean;
  isNotesOnly: boolean;
  notesReason?: string;
  hasContinuationStitched?: boolean;
} {
  const questions: ExtractedQuestion[] = [];
  const lines = pageText.split('\n').map((l) => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    return { questions: [], isComplete: false, isNotesOnly: false };
  }

  const qStartRegex = /^(?:Q\.?\s*)?(\d{1,4})\s*[\.\-\)\:]\s+(.*)$/i;

  const rawBlocks: Array<{ qNum: number; lines: string[] }> = [];
  const leadingLines: string[] = [];
  let currentBlock: { qNum: number; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.includes('--- Column Break ---')) continue;

    const startMatch = line.match(qStartRegex);
    if (startMatch) {
      const qNum = parseInt(startMatch[1], 10);
      if (qNum > 0 && qNum <= 500) {
        if (currentBlock) {
          rawBlocks.push(currentBlock);
        }
        currentBlock = { qNum, lines: [startMatch[2] || line] };
        continue;
      }
    }

    if (currentBlock) {
      currentBlock.lines.push(line);
    } else {
      leadingLines.push(line);
    }
  }

  if (currentBlock) {
    rawBlocks.push(currentBlock);
  }

  // Cross-column / Cross-page continuation stitching
  let hasContinuationStitched = false;
  if (previousPendingQuestion && leadingLines.length > 0) {
    const leadText = leadingLines.join('\n');
    const { optMap: leadOptMap } = extractOptionsFromBlock(leadText);
    for (const key of ['A', 'B', 'C', 'D'] as const) {
      if (leadOptMap[key] && (!previousPendingQuestion.options[key] || previousPendingQuestion.options[key].includes('unclear'))) {
        previousPendingQuestion.options[key] = leadOptMap[key];
        hasContinuationStitched = true;
      }
    }

    const ansMatch = leadText.match(/(?:Ans(?:wer)?|उत्तर)\.?\s*[:\-\.]?\s*\(?([a-dA-D1-4])\)?/i);
    if (ansMatch && !previousPendingQuestion.correctOption) {
      previousPendingQuestion.correctOption = mapOptionKey(ansMatch[1]);
      previousPendingQuestion.answerStatus = 'found';
      hasContinuationStitched = true;
    }

    const expMatch = leadText.match(/(?:Exp\.|Explanation\b|व्याख्या\b|Exp\s*[:\-])\s*[:\-\.]?\s*([\s\S]*)$/i);
    if (expMatch && (!previousPendingQuestion.explanation || previousPendingQuestion.explanation.includes('Refer to'))) {
      previousPendingQuestion.explanation = sanitizeStr(expMatch[1]);
      hasContinuationStitched = true;
    }

    const leadTagMatch =
      leadText.match(/(?:\[|\()([^\]\)\n]*?\b(19\d{2}|20\d{2})\b[^\]\)\n]*?)(?:\]|\))/i) ||
      leadText.match(/(?:^|\n)\s*([A-Za-z\.\s\(\)\/]{2,30}\b(19\d{2}|20\d{2})\b[^\n]*)/i);
    if (leadTagMatch && (!previousPendingQuestion.examName || !previousPendingQuestion.year)) {
      const yrMatch = leadTagMatch[0].match(/\b(19\d{2}|20\d{2})\b/);
      if (yrMatch) {
        previousPendingQuestion.year = yrMatch[1];
        previousPendingQuestion.examName = sanitizeStr(
          leadTagMatch[0].replace(yrMatch[1], '').replace(/[\(\)\[\]]/g, '')
        );
        hasContinuationStitched = true;
      }
    }

    if (previousPendingQuestion.needs_review) {
      const allFour =
        previousPendingQuestion.options.A &&
        previousPendingQuestion.options.B &&
        previousPendingQuestion.options.C &&
        previousPendingQuestion.options.D &&
        !previousPendingQuestion.options.A.includes('unclear');
      if (allFour && previousPendingQuestion.correctOption) {
        previousPendingQuestion.needs_review = false;
        previousPendingQuestion.reviewReasons = undefined;
      }
    }
  }

  if (rawBlocks.length === 0) {
    if (pageText.length > 150) {
      return {
        questions: [],
        isComplete: true,
        isNotesOnly: true,
        notesReason: 'Notes or introductory content page without MCQs',
        hasContinuationStitched,
      };
    }
    return { questions: [], isComplete: false, isNotesOnly: false, hasContinuationStitched };
  }

  let allQuestionsComplete = true;
  let lastExp = previousExplanation || '';

  for (const block of rawBlocks) {
    const blockText = block.lines.join('\n');

    // 1. Universal Option Extraction
    const { optMap, qTextPrompt } = extractOptionsFromBlock(blockText);

    // Count real non-empty options
    const foundOptions = Object.entries(optMap).filter(
      ([_, val]) => val && val.trim().length > 0 && !val.includes('missing in source') && !val.includes('unclear')
    );
    const optCount = foundOptions.length;

    // 2. Parse Answer line: e.g. "Ans. (c)", "Ans : B", "Ans : (a)", "उत्तर : (c)"
    let correctOption: 'A' | 'B' | 'C' | 'D' | 'E' | '' = '';
    const ansMatch = blockText.match(/(?:Ans(?:wer)?|उत्तर)\.?\s*[:\-\.]?\s*\(?([a-eA-E1-5])\)?/i);
    if (ansMatch) {
      correctOption = mapOptionKey(ansMatch[1]);
    }

    // Requirement 1 & 4: A question is created ONLY when there is a real question structure:
    // A question number AND at least 2 option markers, or a valid answer line ("Ans. (c)") tied to a numbered question.
    // Text without this (notes, headings, bullet points, definitions, unit tables, paragraphs) is NOT a question.
    const isRealQuestion = block.qNum > 0 && (optCount >= 2 || Boolean(correctOption));
    if (!isRealQuestion) {
      continue;
    }

    // 3. Parse Exam & Year Tag line: e.g. [U.P.P.C.S. (Pre) 2008], [B.P.S.C. 2020]
    let examName = '';
    let year = '';
    const tagMatch =
      blockText.match(/\[([^\n\]]*?(?:U\.?P|B\.?P|I\.?A|S\.?S|M\.?P|R\.?A|SI|Police|Exam|Pre|CGL|CDS|NDA)[^\n\]]*?)\]/i) ||
      blockText.match(/\[([A-Z\.\s\(\)\-]{3,30}\s*(\d{4})[^\n\]]*?)\]/i) ||
      blockText.match(/\(([A-Z\.\s\(\)\-]{3,30}\s*(\d{4})[^\n\)]*?)\)/i) ||
      blockText.match(/(?:^|\n)\s*([A-Za-z\.\s\(\)\/]{2,30}\b(19\d{2}|20\d{2})\b[^\n]*)/i);

    if (tagMatch) {
      const rawTag = tagMatch[1].trim();
      const yrMatch = rawTag.match(/\b(19\d{2}|20\d{2})\b/);
      if (yrMatch) {
        year = yrMatch[1];
        examName = sanitizeStr(rawTag.replace(year, '').replace(/[\(\)\[\]]/g, ''));
      } else {
        examName = sanitizeStr(rawTag);
      }
    }

    // 4. Parse Explanation line: e.g. "Exp. ...", "Explanation : ..."
    let explanation = '';
    let explanationLinked = false;
    const expMatch = blockText.match(/(?:Exp\.|Explanation\b|व्याख्या\b|Exp\s*[:\-])\s*[:\-\.]?\s*([\s\S]*)$/i);
    if (expMatch) {
      const rawExp = sanitizeStr(expMatch[1]);
      if (
        /see\s+the\s+explanation\s+of\s+(?:the\s+)?above\s+question/i.test(rawExp) ||
        /see\s+above\s+explanation/i.test(rawExp) ||
        /उपरोक्त\s+प्रश्न\s+की\s+व्याख्या\s+देखें/i.test(rawExp)
      ) {
        explanation = lastExp || 'Refer to the detailed explanation of the preceding question.';
        explanationLinked = true;
      } else {
        explanation = rawExp;
        if (rawExp.length > 15) {
          lastExp = rawExp;
        }
      }
    }

    // 5. Clean Question Text Prompt
    let cleanQText = qTextPrompt || block.lines[0] || '';
    cleanQText = sanitizeStr(cleanQText.replace(tagMatch ? tagMatch[0] : '', '').replace(/^\d{1,4}\s*[\.\-\)\:]\s*/, ''));

    // Requirement 2: Never put placeholder text in options! Leave missing options as empty string "".
    const reviewReasons: string[] = [];
    if (optCount < 4) {
      reviewReasons.push('Incomplete options');
      optMap.A = optMap.A || '';
      optMap.B = optMap.B || '';
      optMap.C = optMap.C || '';
      optMap.D = optMap.D || '';
    }

    // Requirement 3: If answer is missing, answerStatus is "missing" and NO option is preselected
    if (!correctOption) {
      reviewReasons.push('Missing answer key');
      correctOption = '';
    }
    if (!examName || !year) {
      reviewReasons.push('Missing exam name or year');
    }

    const needsReview = reviewReasons.length > 0;
    if (needsReview) {
      allQuestionsComplete = false;
    }

    // Save strictly real questions
    questions.push({
      question: cleanQText || `Question ${block.qNum}`,
      options: optMap,
      correctOption,
      explanation: explanation || 'Refer to the source question document.',
      type: 'factual',
      sourcePages: `Page ${pageNumber}`,
      examName,
      year,
      answerStatus: correctOption ? 'found' : 'missing',
      pageNumber,
      questionNumber: block.qNum,
      explanationLinked,
      parsedBy: 'rules',
      needs_review: needsReview,
      reviewReasons: needsReview ? reviewReasons : undefined,
    });
  }

  return {
    questions,
    isComplete: allQuestionsComplete && questions.length > 0,
    isNotesOnly: false,
    hasContinuationStitched,
  };
}

/**
 * Gemini extraction prompt: strict verbatim Indian exam question paper extractor.
 */
export const GEMINI_EXTRACTION_SYSTEM_INSTRUCTION = `You are an expert Question Paper Extractor and Digitizer for Indian National Exams (e.g. BPSC, UPPSC, SSC, Railway, Police SI).

CRITICAL DIRECTIVES:
1. DO NOT INVENT OR GENERATE SYNTHETIC MCQS. You must EXTRACT questions EXACTLY as printed on the provided document pages.
2. Keep Hindi and English bilingual text exactly as printed. Do not translate unless translating bilingual text.
3. IGNORE headers, footers, page numbers, ads, watermarks, coaching logos, and random noise.
4. MAP OPTIONS: Map 1-4, (a)-(d), (i)-(iv) to standard options A, B, C, D.
5. ANSWER KEYS:
   - Match correct answer key if printed on page or in an answer key box/table.
   - NEVER GUESS AN ANSWER. If no answer is found in the text or answer key table, set "correctOption": "" and "answerStatus": "missing".
6. EXAM & YEAR:
   - Extract "examName" (e.g. "BPSC 70th", "Bihar Police SI", "SSC CGL", "U.P.P.C.S. (Pre)") and "year" (e.g. "2024", "2023", "2008") as printed on the tag line or header.
   - If not printed in the document, leave "examName": "" and "year": "". NEVER invent or hallucinate exams or years.
7. SKIPPED QUESTIONS:
   - If a question is cut off, incomplete, or illegible, do NOT include it in "questions". Record it in "skippedQuestions" with pageNumber and reason.

RETURN STRICT JSON matching this structure:
{
  "questions": [
    {
      "question": "Exact question text verbatim...",
      "options": {
        "A": "Option A text...",
        "B": "Option B text...",
        "C": "Option C text...",
        "D": "Option D text..."
      },
      "correctOption": "A", // "A", "B", "C", "D", or "" if missing
      "answerStatus": "found", // "found" or "missing"
      "explanation": "Explanation as printed, or empty if none.",
      "type": "factual", // "factual", "conceptual", or "application"
      "examName": "U.P.P.C.S. (Pre)", // as printed, or ""
      "year": "2008", // as printed, or ""
      "pageNumber": 1
    }
  ],
  "skippedQuestions": [
    {
      "pageNumber": 1,
      "reason": "Incomplete option list cut off at bottom"
    }
  ]
}`;

/**
 * Invokes Gemini ONLY for uncertain or scanned pages, combining up to 5 uncertain pages into 1 call.
 */
export async function callGeminiForUncertainPages(
  ai: GoogleGenAI,
  slicedPdfBase64: string | null,
  textContent: string,
  uncertainPages: number[],
  modelName: string = process.env.GEMINI_MODEL || 'gemini-3.5-flash'
): Promise<{ questions: ExtractedQuestion[]; skippedQuestions: any[] }> {
  const contents: any[] = [];

  if (slicedPdfBase64) {
    contents.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: slicedPdfBase64.replace(/^data:application\/pdf;base64,/, ''),
      },
    });
  }

  const promptText = `Extract all MCQs verbatim from uncertain page(s): ${uncertainPages.join(', ')}.\n\nDocument Material:\n${textContent}`;
  contents.push(promptText);

  const candidateModels = [modelName, 'gemini-3.5-flash', 'gemini-3.8-flash'].filter(
    (v, i, a) => a.indexOf(v) === i
  );

  let response: any = null;
  let lastErr: any = null;

  for (const model of candidateModels) {
    try {
      response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: GEMINI_EXTRACTION_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      if (response && response.text) break;
    } catch (err: any) {
      lastErr = err;
      const errMsg = String(err?.message || err || '');
      const isQuota =
        err?.status === 'RESOURCE_EXHAUSTED' ||
        err?.code === 429 ||
        errMsg.includes('429') ||
        errMsg.includes('quota') ||
        errMsg.includes('RESOURCE_EXHAUSTED');

      if (isQuota) {
        const quotaErr = new Error('QUOTA_EXHAUSTED: Gemini API daily free tier quota limit reached. Falling back to rule-based verbatim extraction.');
        (quotaErr as any).code = 'QUOTA_EXHAUSTED';
        throw quotaErr;
      }
      console.warn(`Extraction model ${model} failed, trying fallback:`, errMsg);
    }
  }

  if (!response || !response.text) {
    throw new Error(lastErr?.message || 'Gemini extraction returned empty response.');
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.text);
  } catch {
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        parsed = {};
      }
    }
  }

  const rawQs = Array.isArray(parsed.questions) ? parsed.questions : [];
  const rawSkipped = Array.isArray(parsed.skippedQuestions) ? parsed.skippedQuestions : [];

  const questions: ExtractedQuestion[] = [];

  for (const q of rawQs) {
    if (!q || typeof q !== 'object') continue;
    const qText = sanitizeStr(q.question);
    if (!qText) continue;

    const opts = q.options || {};
    const optA = sanitizeStr(opts.A || q.optionA);
    const optB = sanitizeStr(opts.B || q.optionB);
    const optC = sanitizeStr(opts.C || q.optionC);
    const optD = sanitizeStr(opts.D || q.optionD);

    const reviewReasons: string[] = [];
    if (!optA || !optB || !optC || !optD) {
      reviewReasons.push('Incomplete options from scan');
    }

    const correctOption = mapOptionKey(q.correctOption || q.answer);
    const answerStatus = correctOption ? 'found' : 'missing';
    if (!correctOption) {
      reviewReasons.push('Missing answer key');
    }

    const examName = sanitizeStr(q.examName);
    const year = sanitizeStr(q.year);
    if (!examName || !year) {
      reviewReasons.push('Missing exam name or year');
    }

    const needsReview = reviewReasons.length > 0;

    questions.push({
      question: qText,
      options: {
        A: optA || '(A) [Option text unclear]',
        B: optB || '(B) [Option text unclear]',
        C: optC || '(C) [Option text unclear]',
        D: optD || '(D) [Option text unclear]',
      },
      correctOption,
      answerStatus,
      explanation: sanitizeStr(q.explanation || 'Refer to the source question document.'),
      type: 'factual',
      sourcePages: `Page ${q.pageNumber || uncertainPages[0] || 1}`,
      examName,
      year,
      pageNumber: Number(q.pageNumber) || uncertainPages[0] || 1,
      questionNumber: typeof q.questionNumber === 'number' ? q.questionNumber : undefined,
      parsedBy: 'gemini',
      needs_review: needsReview,
      reviewReasons: needsReview ? reviewReasons : undefined,
    });
  }

  const skippedQuestions = rawSkipped.map((s: any) => ({
    pageNumber: Number(s.pageNumber) || uncertainPages[0] || 1,
    reason: sanitizeStr(s.reason || 'Incomplete question format'),
  }));

  return { questions, skippedQuestions };
}

/**
 * Builds quizzes from extracted questions grouped by subject/chapter or sequential page order.
 * Ensures each quiz has min 5, max 100 questions (rebalancing last two if needed).
 */
export function groupQuestionsIntoQuizzes(
  questions: ExtractedQuestion[],
  fileName: string,
  sourcePdfId: string,
  defaultExamName?: string,
  defaultYear?: string,
  unresolvedPages: number[] = []
): any[] {
  const total = questions.length;
  if (total < 5) {
    throw new Error(
      `Fewer than 5 valid questions extracted (${total}). Minimum 5 questions required to create a quiz.`
    );
  }

  const quizChunks: ExtractedQuestion[][] = [];
  let currentChunk: ExtractedQuestion[] = [];

  for (let i = 0; i < total; i++) {
    currentChunk.push(questions[i]);
    if (currentChunk.length === 100) {
      quizChunks.push(currentChunk);
      currentChunk = [];
    }
  }

  if (currentChunk.length > 0) {
    if (quizChunks.length > 0 && currentChunk.length < 5) {
      const prevChunk = quizChunks[quizChunks.length - 1];
      const combined = [...prevChunk, ...currentChunk];
      const half = Math.floor(combined.length / 2);
      quizChunks[quizChunks.length - 1] = combined.slice(0, half);
      quizChunks.push(combined.slice(half));
    } else {
      quizChunks.push(currentChunk);
    }
  }

  const quizzes: any[] = [];
  function inferSubjectTitle(chunkQuestions: ExtractedQuestion[], rawFile: string): string {
    const combined = chunkQuestions
      .slice(0, 15)
      .map((q) => q.question + ' ' + (q.explanation || ''))
      .join(' ')
      .toLowerCase();

    if (
      combined.includes('article') ||
      combined.includes('constitution') ||
      combined.includes('parliament') ||
      combined.includes('fundamental right')
    ) {
      return 'Indian Polity & Constitution';
    }
    if (
      combined.includes('force') ||
      combined.includes('velocity') ||
      combined.includes('joule') ||
      combined.includes('watt') ||
      combined.includes('physics') ||
      combined.includes('unit of')
    ) {
      return 'General Science - Physics';
    }
    if (
      combined.includes('cell') ||
      combined.includes('vitamin') ||
      combined.includes('disease') ||
      combined.includes('biology')
    ) {
      return 'General Science - Biology';
    }
    if (
      combined.includes('acid') ||
      combined.includes('reaction') ||
      combined.includes('element') ||
      combined.includes('chemistry')
    ) {
      return 'General Science - Chemistry';
    }
    if (
      combined.includes('dynasty') ||
      combined.includes('mughal') ||
      combined.includes('revolt') ||
      combined.includes('british')
    ) {
      return 'Indian History';
    }
    if (
      combined.includes('river') ||
      combined.includes('monsoon') ||
      combined.includes('soil') ||
      combined.includes('mountain')
    ) {
      return 'Geography & Environment';
    }

    const clean = rawFile
      .replace(/\.[^/.]+$/, '')
      .replace(/_[a-f0-9]{6,12}$/i, '')
      .replace(/_first_\d+/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();

    if (!clean || clean.length < 3 || /^[a-z0-9]+$/i.test(clean)) {
      return 'General Studies & Practice Mock';
    }
    return clean;
  }

  quizChunks.forEach((chunk, idx) => {
    const partSuffix = quizChunks.length > 1 ? ` (Part ${idx + 1})` : '';

    const firstExamName = chunk.find((q) => q.examName)?.examName || defaultExamName || '';
    const firstYear = chunk.find((q) => q.year)?.year || defaultYear || '';
    const subjectTitle = inferSubjectTitle(chunk, fileName);

    const quizTitle = `${firstExamName ? firstExamName + ' ' : ''}${firstYear ? firstYear + ' ' : ''}${subjectTitle}${partSuffix}`.trim();

    // Check if clean: all questions have answers, examName and year, no needs_review, and source pages have no unresolved mismatch/gap
    const chunkPageNumbers = new Set(chunk.map((q) => q.pageNumber));
    const hasUnresolvedPage = unresolvedPages.some((p) => chunkPageNumbers.has(p));
    const isClean =
      !hasUnresolvedPage &&
      chunk.every(
        (q) => !q.needs_review && q.correctOption && q.answerStatus !== 'missing' && q.examName && q.year
      );

    const formattedQuestions = chunk.map((q) => ({
      question: q.question,
      options: q.options,
      correctOption: q.correctOption,
      correctIndex: ['A', 'B', 'C', 'D'].indexOf(q.correctOption as any),
      explanation: q.explanation,
      type: q.type,
      sourcePages: q.sourcePages,
      examName: q.examName || firstExamName,
      year: q.year || firstYear,
      answerStatus: q.answerStatus,
      explanationLinked: !!q.explanationLinked,
      usedEndAnswerKey: !!q.usedEndAnswerKey,
      parsedBy: q.parsedBy || 'rules',
      needs_review: q.needs_review,
      reviewReasons: q.reviewReasons,
    }));

    quizzes.push({
      title: quizTitle,
      status: 'draft',
      isClean,
      language: 'English',
      difficulty: 'Medium',
      durationMinutes: chunk.length,
      markingCorrect: 1.0,
      markingWrong: 0.25,
      questionCount: chunk.length,
      sourcePageCount: 1,
      examName: firstExamName,
      year: firstYear,
      sourcePdfId,
      questions: formattedQuestions,
    });
  });

  return quizzes;
}
