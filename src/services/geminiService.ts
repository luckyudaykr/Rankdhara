import { MCQQuestion, TestSettings } from '../types';
import { getCurrentUserToken } from './authService';

export interface GenerateMCQParams {
  text?: string;
  pdfBase64?: string;
  pageImages?: string[];
  difficulty: TestSettings['difficulty'];
  language: TestSettings['language'];
  questionCount?: number;
  avoidQuestions?: string[];
}

export async function requestMCQGeneration(params: GenerateMCQParams): Promise<MCQQuestion[]> {
  const targetCount = params.questionCount || 10;
  const token = await getCurrentUserToken();

  const response = await fetch('/api/generate-mcqs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      text: params.text,
      pdfBase64: params.pdfBase64,
      pageImages: params.pageImages,
      difficulty: params.difficulty,
      language: params.language,
      questionCount: targetCount,
      avoidQuestions: params.avoidQuestions || [],
    }),
  });

  const data = await response.json().catch(() => ({
    error: 'Failed to parse server response.',
  }));

  if (!response.ok || !data.success) {
    throw new Error(data.error || `Server returned error (${response.status})`);
  }

  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error('Received an empty question set from the test generator.');
  }

  return data.questions as MCQQuestion[];
}
