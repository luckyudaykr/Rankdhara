import { MCQQuestion, MCQOptionMap } from '../types';

export interface RawMCQSchemaItem {
  question_number: string;
  question?: string;
  question_hindi?: string;
  question_english?: string;
  options: {
    a?: string;
    b?: string;
    c?: string;
    d?: string;
    e?: string;
    A?: string;
    B?: string;
    C?: string;
    D?: string;
    E?: string;
    [key: string]: string | undefined;
  };
  answer?: string | number;
  explanation?: string;
  examName?: string;
  year?: string | number;
  subject?: string;
  chapter?: string;
  passage?: string;
  data?: string;
  passageImage?: string;
}

/**
 * Checks if the raw text contains more than one top-level JSON array.
 * If so, the user is pasting multiple arrays instead of one single array.
 */
export function hasMultipleTopLevelArrays(rawText: string): boolean {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith('[')) return false;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '[') {
      depth++;
    } else if (char === ']') {
      depth--;
      if (depth === 0) {
        // First top-level array closed. Check if another array follows.
        const remainder = trimmed.slice(i + 1).trim();
        const cleanedRemainder = remainder.replace(/^,\s*/, '');
        if (cleanedRemainder.startsWith('[')) {
          return true;
        }
      }
    }
  }

  // Also check simple regex heuristic for adjacent array blocks e.g. "]\s*\["
  if (/\]\s*(?:,\s*)?\[/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Converts simple LaTeX syntax to standard symbols:
 * \times -> ×, \div -> ÷, ^n -> superscript characters, etc.
 */
export function formatSimpleLatex(text: string): string {
  if (!text) return '';

  const superscriptMap: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'y': 'ʸ', 'a': 'ᵃ',
    'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'm': 'ᵐ',
    'k': 'ᵏ', 't': 'ᵗ'
  };

  let formatted = text
    .replace(/\\times\b/g, '×')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\div\b/g, '÷')
    .replace(/\\pm\b/g, '±')
    .replace(/\\mp\b/g, '∓')
    .replace(/\\le\b|\\leq\b/g, '≤')
    .replace(/\\ge\b|\\geq\b/g, '≥')
    .replace(/\\neq\b/g, '≠')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\degree\b|\^\\circ\b/g, '°')
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\theta\b/g, 'θ')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)');

  // Handle ^{...}
  formatted = formatted.replace(/\^\{([^}]+)\}/g, (_, content) => {
    return content
      .split('')
      .map((ch: string) => superscriptMap[ch] || ch)
      .join('');
  });

  // Handle ^([0-9a-zA-Z+-])
  formatted = formatted.replace(/\^([0-9a-zA-Z+-])/g, (_, ch) => {
    return superscriptMap[ch] || `^${ch}`;
  });

  return formatted;
}

/**
 * Evaluates whether a question requires review before publication:
 * 1. Options that are "..." or empty
 * 2. Question is only a placeholder like "(Based on Bar Graph)"
 * 3. Text ending in "..."
 * 4. Question mentions passage, graph, table, or chart but has no attached passage/data
 * 5. Answer is missing
 */
export function evaluateQuestionReview(q: MCQQuestion): {
  needsReview: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const qText = (q.question || q.questionEnglish || q.questionHindi || '').trim();

  // 1. Question is only a placeholder like "(Based on Bar Graph)"
  if (/^\s*\([^)]{1,70}\)\s*$/i.test(qText) && /based on|refer to|bar graph|pie chart|table|passage|चित्र|ग्राफ|तालिका/i.test(qText)) {
    reasons.push('Question is only a placeholder (e.g. "(Based on Bar Graph)")');
  } else if (/^\s*(based on|refer to|question\s*\d+)\s*$/i.test(qText)) {
    reasons.push('Question text is a placeholder label');
  }

  // 2. Text ending in "..."
  if (qText.endsWith('...') || qText.endsWith('…')) {
    reasons.push('Question text ends with incomplete "..."');
  }

  // 3. Options validation: empty or "..."
  const activeKeys = (['A', 'B', 'C', 'D', 'E'] as const).filter(
    (key) => q.options[key] !== undefined && q.options[key] !== null
  );

  if (activeKeys.length < 2) {
    reasons.push('Question has fewer than 2 options');
  }

  for (const key of activeKeys) {
    const optVal = (q.options[key] || '').trim();
    if (!optVal) {
      reasons.push(`Option ${key} is empty`);
    } else if (optVal === '...' || optVal === '…') {
      reasons.push(`Option ${key} is only "..."`);
    } else if (optVal.endsWith('...') || optVal.endsWith('…')) {
      reasons.push(`Option ${key} ends with "..."`);
    }
  }

  // 4. Mentions passage/graph/table/chart without attached passage or data
  const mentionsData = /\b(passage|graph|table|chart|paragraph|data interpretation|comprehension|चित्र|तालिका|ग्राफ|गद्यांश)\b/i.test(qText);
  const hasDataAttached = Boolean(
    (q.passage && q.passage.trim()) ||
    (q.data && q.data.trim()) ||
    (q.passageData && q.passageData.trim()) ||
    (q.passageImage && q.passageImage.trim())
  );
  if (mentionsData && !hasDataAttached) {
    reasons.push('Mentions passage, graph, table, or chart but has no passage/data attached');
  }

  // 5. Missing answer key
  if (!q.correctOption || q.answerStatus === 'missing') {
    reasons.push('Missing answer key');
  }

  return {
    needsReview: reasons.length > 0,
    reasons,
  };
}

/**
 * Parses user-pasted answer key in formats:
 * - "1-b", "1 b", "1. B", "1: C", "Q1: A"
 * - JSON map: {"1": "B", "2": "C"}
 */
export function parseAnswerKey(text: string): Record<string, 'A' | 'B' | 'C' | 'D' | 'E'> {
  const map: Record<string, 'A' | 'B' | 'C' | 'D' | 'E'> = {};
  const trimmed = text.trim();
  if (!trimmed) return map;

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        parsed.forEach((entry: any) => {
          const num = entry.q ?? entry.question_number ?? entry.num ?? entry.id;
          const ans = entry.ans ?? entry.answer ?? entry.option;
          if (num !== undefined && ans !== undefined) {
            const clean = String(ans).trim().toUpperCase();
            if (['A', 'B', 'C', 'D', 'E'].includes(clean)) {
              map[String(num)] = clean as any;
            }
          }
        });
        return map;
      } else if (typeof parsed === 'object') {
        Object.entries(parsed).forEach(([k, v]) => {
          const clean = String(v).trim().toUpperCase();
          if (['A', 'B', 'C', 'D', 'E'].includes(clean)) {
            map[String(k)] = clean as any;
          }
        });
        return map;
      }
    } catch {
      // Ignore JSON error and parse line-by-line below
    }
  }

  const lines = trimmed.split(/[\r\n,;]+/);
  for (const line of lines) {
    const match = line.match(/(?:Q\s*)?(\d+)\s*[-:.=\s>]+\s*([a-eA-E])/i);
    if (match) {
      const qNum = match[1];
      const opt = match[2].toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
      map[qNum] = opt;
    }
  }

  return map;
}

/**
 * Converts standard app MCQQuestions to exportable JSON
 */
export function convertMCQToRawSchema(questions: MCQQuestion[]): RawMCQSchemaItem[] {
  return questions.map((q, idx) => {
    const rawAnswer = (q.correctOption || '').toLowerCase();
    const answer = ['a', 'b', 'c', 'd', 'e'].includes(rawAnswer) ? rawAnswer : '';

    const optionsObj: Record<string, string> = {
      a: q.options?.A?.trim() ?? '',
      b: q.options?.B?.trim() ?? '',
      c: q.options?.C?.trim() ?? '',
      d: q.options?.D?.trim() ?? '',
    };
    if (q.options?.E !== undefined) {
      optionsObj.e = q.options.E.trim();
    }

    const item: RawMCQSchemaItem = {
      question_number: String(q.id || idx + 1),
      question: q.question.trim(),
      options: optionsObj,
      answer,
    };

    if (q.questionHindi || (q as any).question_hindi) {
      item.question_hindi = q.questionHindi || (q as any).question_hindi;
    }
    if (q.questionEnglish || (q as any).question_english) {
      item.question_english = q.questionEnglish || (q as any).question_english;
    }
    if (q.explanation) item.explanation = q.explanation;
    if (q.examName) item.examName = q.examName;
    if (q.year) item.year = q.year;
    if (q.subject) item.subject = q.subject;
    if (q.chapter) item.chapter = q.chapter;
    if (q.passage) item.passage = q.passage;
    if (q.data || q.passageData) item.data = q.data || q.passageData;
    if (q.passageImage) item.passageImage = q.passageImage;

    return item;
  });
}

/**
 * Normalizes and converts raw items into internal MCQQuestion format
 */
export function convertRawSchemaToMCQ(
  items: RawMCQSchemaItem[],
  defaultExplanationPrefix = 'Answer'
): MCQQuestion[] {
  return items.map((item, idx) => {
    const qNum = parseInt(item.question_number, 10) || idx + 1;

    // Bilingual support: accept question or question_hindi + question_english, question_hi/en, etc.
    let qHindi = (
      item.question_hindi ||
      (item as any).questionHindi ||
      (item as any).hindi ||
      (item as any).hindi_question ||
      (item as any).question_hi ||
      ''
    ).trim();
    let qEnglish = (
      item.question_english ||
      (item as any).questionEnglish ||
      (item as any).english ||
      (item as any).english_question ||
      (item as any).question_en ||
      ''
    ).trim();

    const rawQuestion = (item.question || '').trim();
    const hasHindiChars = (str: string) => /[\u0900-\u097F]/.test(str);

    // If question has Devanagari script and qHindi isn't set, assign it to qHindi
    if (!qHindi && hasHindiChars(rawQuestion)) {
      qHindi = rawQuestion;
    }
    // If question has English/Latin text (no Devanagari) and qEnglish isn't set, assign it to qEnglish
    if (!qEnglish && rawQuestion && !hasHindiChars(rawQuestion)) {
      qEnglish = rawQuestion;
    }
    // Cross-assignment if one was in question and the other in question_hindi/question_english
    if (qHindi && !qEnglish && rawQuestion && !hasHindiChars(rawQuestion)) {
      qEnglish = rawQuestion;
    }
    if (qEnglish && !qHindi && rawQuestion && hasHindiChars(rawQuestion)) {
      qHindi = rawQuestion;
    }

    const primaryQuestion = (rawQuestion || qEnglish || qHindi || '').trim();

    // Option keys a-e or A-E (normalize to A-E, allow 5 options)
    const rawOpts = item.options || {};
    const optA = (rawOpts.a || rawOpts.A || (item as any).option_a || (item as any).optionA || '').trim();
    const optB = (rawOpts.b || rawOpts.B || (item as any).option_b || (item as any).optionB || '').trim();
    const optC = (rawOpts.c || rawOpts.C || (item as any).option_c || (item as any).optionC || '').trim();
    const optD = (rawOpts.d || rawOpts.D || (item as any).option_d || (item as any).optionD || '').trim();
    const optE = (rawOpts.e || rawOpts.E || (item as any).option_e || (item as any).optionE || '').trim();

    const options: MCQOptionMap = {
      A: optA,
      B: optB,
      C: optC,
      D: optD,
    };
    if (optE) {
      options.E = optE;
    }

    // Optional bilingual options: options_hindi and options_english
    const rawOptsHindi = (item as any).options_hindi || (item as any).optionsHindi;
    let optionsHindi: MCQOptionMap | undefined = undefined;
    if (rawOptsHindi && typeof rawOptsHindi === 'object') {
      optionsHindi = {
        A: (rawOptsHindi.a || rawOptsHindi.A || '').trim(),
        B: (rawOptsHindi.b || rawOptsHindi.B || '').trim(),
        C: (rawOptsHindi.c || rawOptsHindi.C || '').trim(),
        D: (rawOptsHindi.d || rawOptsHindi.D || '').trim(),
      };
      if (rawOptsHindi.e || rawOptsHindi.E) optionsHindi.E = (rawOptsHindi.e || rawOptsHindi.E).trim();
    }

    const rawOptsEnglish = (item as any).options_english || (item as any).optionsEnglish;
    let optionsEnglish: MCQOptionMap | undefined = undefined;
    if (rawOptsEnglish && typeof rawOptsEnglish === 'object') {
      optionsEnglish = {
        A: (rawOptsEnglish.a || rawOptsEnglish.A || '').trim(),
        B: (rawOptsEnglish.b || rawOptsEnglish.B || '').trim(),
        C: (rawOptsEnglish.c || rawOptsEnglish.C || '').trim(),
        D: (rawOptsEnglish.d || rawOptsEnglish.D || '').trim(),
      };
      if (rawOptsEnglish.e || rawOptsEnglish.E) optionsEnglish.E = (rawOptsEnglish.e || rawOptsEnglish.E).trim();
    }

    // Answer normalization: optional (a-e, A-E or index)
    let correctOption: 'A' | 'B' | 'C' | 'D' | 'E' | '' = '';
    let answerStatus: 'found' | 'missing' = 'missing';

    const rawAns = item.answer !== undefined && item.answer !== null ? String(item.answer).trim() : '';

    if (rawAns) {
      const upper = rawAns.toUpperCase();
      if (['A', 'B', 'C', 'D', 'E'].includes(upper)) {
        correctOption = upper as 'A' | 'B' | 'C' | 'D' | 'E';
        answerStatus = 'found';
      } else {
        // Check index: 0-4 or 1-5
        const numAns = parseInt(rawAns, 10);
        if (!isNaN(numAns)) {
          if (numAns === 0) { correctOption = 'A'; answerStatus = 'found'; }
          else if (numAns === 1) { correctOption = 'A'; answerStatus = 'found'; }
          else if (numAns === 2) { correctOption = 'B'; answerStatus = 'found'; }
          else if (numAns === 3) { correctOption = 'C'; answerStatus = 'found'; }
          else if (numAns === 4) { correctOption = 'D'; answerStatus = 'found'; }
          else if (numAns === 5) { correctOption = 'E'; answerStatus = 'found'; }
        }
      }
    }

    const questionObj: MCQQuestion = {
      id: qNum,
      question: primaryQuestion,
      questionHindi: qHindi || undefined,
      questionEnglish: qEnglish || undefined,
      optionsHindi,
      optionsEnglish,
      type: 'conceptual',
      options,
      correctOption,
      answerStatus,
      explanation: item.explanation
        ? item.explanation.trim()
        : correctOption
        ? `${defaultExplanationPrefix}: Option ${correctOption} is correct.`
        : '',
      sourcePages: `Question #${qNum}`,
      examName: item.examName || undefined,
      year: item.year ? String(item.year) : undefined,
      subject: item.subject || undefined,
      chapter: item.chapter || undefined,
      passage: item.passage || undefined,
      data: item.data || undefined,
      passageImage: item.passageImage || undefined,
    };

    const reviewCheck = evaluateQuestionReview(questionObj);
    questionObj.needs_review = reviewCheck.needsReview;
    questionObj.reviewReasons = reviewCheck.reasons;

    return questionObj;
  });
}

/**
 * Validates a JSON string against supported schemas:
 * - Reject multiple top-level arrays with "Paste one array at a time"
 * - Accept question or question_hindi + question_english
 * - Accept option keys a-e or A-E (up to 5 options)
 * - Optional answer, explanation, examName, year, subject, chapter, passage, data
 */
export function validateRawMCQJson(jsonString: string): {
  valid: boolean;
  error?: string;
  data?: RawMCQSchemaItem[];
} {
  if (!jsonString || !jsonString.trim()) {
    return { valid: false, error: 'JSON content is empty.' };
  }

  // Check 1: Multiple top-level arrays
  if (hasMultipleTopLevelArrays(jsonString)) {
    return { valid: false, error: 'Paste one array at a time' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err: any) {
    return { valid: false, error: `Invalid JSON syntax: ${err.message}` };
  }

  if (!Array.isArray(parsed)) {
    return { valid: false, error: 'Root element must be a JSON Array of questions.' };
  }

  if (parsed.length === 0) {
    return { valid: false, error: 'Question array is empty. At least 1 question is required.' };
  }

  const normalized: RawMCQSchemaItem[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    const prefix = `Item at index ${i}`;

    if (!item || typeof item !== 'object') {
      return { valid: false, error: `${prefix} must be an object.` };
    }

    const qNum = item.question_number !== undefined
      ? String(item.question_number)
      : String(i + 1);

    const qText = item.question || item.question_english || item.question_hindi;
    if (!qText || typeof qText !== 'string' || !qText.trim()) {
      return {
        valid: false,
        error: `${prefix} must have at least one question field ('question', 'question_english', or 'question_hindi').`,
      };
    }

    if (!item.options || typeof item.options !== 'object' || Array.isArray(item.options)) {
      return {
        valid: false,
        error: `${prefix} must have an 'options' object with keys a-d or a-e.`,
      };
    }

    // Check at least options a & b or A & B exist
    const rawOpts = item.options;
    const hasA = rawOpts.a !== undefined || rawOpts.A !== undefined;
    const hasB = rawOpts.b !== undefined || rawOpts.B !== undefined;
    if (!hasA || !hasB) {
      return {
        valid: false,
        error: `${prefix} 'options' must contain at least options 'a' and 'b'.`,
      };
    }

    normalized.push({
      question_number: qNum,
      question: item.question ? String(item.question) : undefined,
      question_hindi: item.question_hindi ? String(item.question_hindi) : undefined,
      question_english: item.question_english ? String(item.question_english) : undefined,
      options: rawOpts,
      answer: item.answer !== undefined ? item.answer : undefined,
      explanation: item.explanation ? String(item.explanation) : undefined,
      examName: item.examName || item.exam_name ? String(item.examName || item.exam_name) : undefined,
      year: item.year !== undefined ? item.year : undefined,
      subject: item.subject ? String(item.subject) : undefined,
      chapter: item.chapter ? String(item.chapter) : undefined,
      passage: item.passage ? String(item.passage) : undefined,
      data: item.data || item.passageData ? String(item.data || item.passageData) : undefined,
      passageImage: item.passageImage || item.image ? String(item.passageImage || item.image) : undefined,
    });
  }

  return { valid: true, data: normalized };
}

/**
 * Formats data into pristine JSON with 2-space indentation
 */
export function formatRawMCQJson(data: RawMCQSchemaItem[]): string {
  return JSON.stringify(data, null, 2);
}
