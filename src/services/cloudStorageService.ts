import {
  CloudSavedTest,
  CloudTestSummary,
  MCQQuestion,
  MCQOptionMap,
  TestSettings,
  TestAttempt,
  AttemptQuestionData,
  AdminOverview,
  QuestionPdfRecord,
  ExtractionReport,
  AdminExtractionSettings,
  BookmarkedQuestion,
  QuestionReport,
  CatalogExam,
  ExamAlias,
  UnmappedExamTag,
  CustomTestFilter,
  BrowseSummary,
  ExamDetailData,
  OrganizeReport,
  AiAutoClassifyReport,
  ActiveTestProgress,
  TestLeaderboardSummary,
} from '../types';
import { getCurrentUserToken } from './authService';

export interface SaveTestPayload {
  id?: string;
  title: string;
  status?: 'draft' | 'published';
  language: string;
  difficulty: string;
  durationMinutes: number;
  markingCorrect: number;
  markingWrong: number;
  sourcePageCount: number;
  examName?: string;
  year?: string;
  sourcePdfId?: string;
  questions: MCQQuestion[];
}

export async function saveTestToCloud(
  payload: SaveTestPayload
): Promise<{ success: boolean; id: string; warning?: string }> {
  const token = await getCurrentUserToken();
  const optionKeys = ['A', 'B', 'C', 'D', 'E'] as const;

  const formattedQuestions = payload.questions.map((q, idx) => {
    const correctOpt = q.correctOption || 'A';
    const correctIndex = optionKeys.indexOf(correctOpt as any);

    return {
      question: q.question,
      options: q.options,
      correctOption: correctOpt,
      correctIndex: correctIndex >= 0 ? correctIndex : 0,
      explanation: q.explanation,
      type: q.type || 'factual',
      sourcePages: q.sourcePages || `Section ${idx + 1}`,
      examName: q.examName || payload.examName || '',
      year: q.year || payload.year || '',
      answerStatus: q.answerStatus || (correctOpt ? 'found' : 'missing'),
      questionHindi: q.questionHindi,
      questionEnglish: q.questionEnglish,
      passage: q.passage,
      data: q.data || q.passageData,
      passageImage: q.passageImage,
      ...(q.subject ? { subject: q.subject } : {}),
      ...(q.chapter ? { chapter: q.chapter } : {}),
      ...(Array.isArray(q.examTags) && q.examTags.length > 0 ? { examTags: q.examTags } : {}),
      ...(q.stage ? { stage: q.stage } : {}),
    };
  });

  const response = await fetch('/api/save-test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      id: payload.id,
      title: payload.title,
      status: payload.status || 'published',
      language: payload.language,
      difficulty: payload.difficulty,
      durationMinutes: payload.durationMinutes,
      markingCorrect: payload.markingCorrect,
      markingWrong: payload.markingWrong,
      sourcePageCount: payload.sourcePageCount,
      examName: payload.examName || '',
      year: payload.year || '',
      sourcePdfId: payload.sourcePdfId || '',
      questions: formattedQuestions,
    }),
  });

  const data = await response.json().catch(() => ({
    success: false,
    error: 'Failed to communicate with save endpoint.',
  }));

  if (!response.ok || !data.success) {
    throw new Error(data.error || `Server failed to save test (${response.status})`);
  }

  return {
    success: true,
    id: data.id,
    warning: data.warning,
  };
}

export async function togglePublishStatus(
  testId: string,
  newStatus: 'draft' | 'published'
): Promise<boolean> {
  const token = await getCurrentUserToken();
  const response = await fetch(`/api/tests/${encodeURIComponent(testId)}/publish`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ status: newStatus }),
  });

  const data = await response.json().catch(() => ({ success: false }));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to update publish status');
  }

  return true;
}

export async function fetchSavedTests(
  page = 1,
  limit = 50,
  includeDrafts = false,
  examNameFilter?: string,
  yearFilter?: string
): Promise<{ tests: CloudTestSummary[]; total: number; page: number; limit: number }> {
  const token = await getCurrentUserToken();
  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(includeDrafts ? { includeDrafts: 'true' } : {}),
    ...(examNameFilter ? { examName: examNameFilter } : {}),
    ...(yearFilter ? { year: yearFilter } : {}),
  });

  const response = await fetch(`/api/tests?${queryParams.toString()}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json().catch(() => ({
    success: false,
    tests: [],
  }));

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to load test library');
  }

  return {
    tests: data.tests || [],
    total: data.total || 0,
    page: data.page || 1,
    limit: data.limit || limit,
  };
}

export async function fetchTestById(
  id: string,
  mode?: 'mock' | 'study'
): Promise<CloudSavedTest> {
  const token = await getCurrentUserToken();
  const query = mode === 'study' ? '?mode=study' : '';
  const response = await fetch(`/api/tests/${encodeURIComponent(id)}${query}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json().catch(() => ({
    success: false,
    error: 'Failed to fetch test details',
  }));

  if (!response.ok || !data.success || !data.test) {
    throw new Error(data.error || `Could not find test with id ${id}`);
  }

  return data.test as CloudSavedTest;
}

export async function deleteTestById(id: string): Promise<boolean> {
  const token = await getCurrentUserToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`/api/tests/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  });

  const data = await response.json().catch(() => ({ success: false }));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Delete unauthorized or failed');
  }

  return true;
}

// -------------------------------------------------------------
// Question PDF Library & Extraction APIs (Admin Only)
// -------------------------------------------------------------
export async function uploadQuestionPdf(
  file: File,
  onProgress?: (msg: string) => void
): Promise<QuestionPdfRecord> {
  // Validate file size (max 50 MB)
  const MAX_SIZE_BYTES = 50 * 1024 * 1024;
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error('PDF file size exceeds the 50 MB limit.');
  }

  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    throw new Error('Invalid file format. Only PDF files (.pdf) are allowed.');
  }

  onProgress?.('Reading PDF file...');
  const token = await getCurrentUserToken();

  const arrayBuffer = await file.arrayBuffer();

  onProgress?.('Uploading PDF to Question Library...');

  const queryParams = new URLSearchParams({
    fileName: file.name,
    sizeBytes: String(file.size),
  });

  const response = await fetch(`/api/admin/pdfs/upload?${queryParams.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
      'X-File-Name': encodeURIComponent(file.name),
      'X-File-Size': String(file.size),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: arrayBuffer,
  });

  const data = await response.json().catch(() => ({ success: false }));
  if (!response.ok || !data.success || !data.pdfRecord) {
    throw new Error(data.error || 'Failed to upload PDF file to library.');
  }

  return data.pdfRecord as QuestionPdfRecord;
}

export async function fetchQuestionPdfs(): Promise<QuestionPdfRecord[]> {
  const token = await getCurrentUserToken();
  const response = await fetch('/api/admin/pdfs', {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json().catch(() => ({ success: false, pdfs: [] }));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch PDF library list.');
  }

  return data.pdfs || [];
}

export async function deleteQuestionPdf(id: string): Promise<boolean> {
  const token = await getCurrentUserToken();
  const response = await fetch(`/api/admin/pdfs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json().catch(() => ({ success: false }));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to delete PDF from library.');
  }

  return true;
}

export async function extractMcqsFromPdf(
  id: string,
  options?: {
    resume?: boolean;
    retryFailedOnly?: boolean;
    startPage?: number;
    pageSize?: number;
    targetPages?: number[];
  }
): Promise<{
  report: ExtractionReport;
  createdQuizzes: CloudSavedTest[];
  pdfRecord?: QuestionPdfRecord;
  paused?: boolean;
  message?: string;
  allFinished?: boolean;
}> {
  const token = await getCurrentUserToken();
  const response = await fetch(`/api/admin/pdfs/${encodeURIComponent(id)}/extract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(options || {}),
  });

  const data = await response.json().catch(() => ({
    success: false,
    error: 'Extraction request failed.',
  }));

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to extract MCQs from PDF.');
  }

  return {
    report: data.report as ExtractionReport,
    createdQuizzes: data.createdQuizzes || [],
    pdfRecord: data.pdfRecord,
    paused: data.paused,
    message: data.message,
    allFinished: data.allFinished,
  };
}

export async function reuploadPdfPaper(
  id: string,
  pdfBase64: string
): Promise<QuestionPdfRecord> {
  const token = await getCurrentUserToken();
  const response = await fetch(`/api/admin/pdfs/${encodeURIComponent(id)}/reupload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ pdfBase64 }),
  });

  const data = await response.json().catch(() => ({
    success: false,
    error: 'Re-upload request failed.',
  }));

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to re-upload PDF file.');
  }

  return data.pdfRecord as QuestionPdfRecord;
}

export async function fetchExtractionReport(id: string): Promise<ExtractionReport | null> {
  const token = await getCurrentUserToken();
  const response = await fetch(`/api/admin/pdfs/${encodeURIComponent(id)}/report`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json().catch(() => ({ success: false, report: null }));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch extraction report.');
  }

  return data.report as ExtractionReport;
}

export async function fetchPdfQuestions(
  id: string
): Promise<{ questions: MCQQuestion[]; rawSchema: any[] }> {
  const token = await getCurrentUserToken();
  const response = await fetch(`/api/admin/pdfs/${encodeURIComponent(id)}/questions`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json().catch(() => ({ success: false, questions: [], rawSchema: [] }));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch questions for PDF.');
  }

  return {
    questions: data.questions || [],
    rawSchema: data.rawSchema || [],
  };
}

export async function fetchExtractionSettings(): Promise<AdminExtractionSettings> {
  const token = await getCurrentUserToken();
  const response = await fetch('/api/admin/extraction-settings', {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  return data.settings || {
    maxGeminiCallsPerDay: 200,
    geminiCallsToday: 0,
    autoExtractOnUpload: true,
    publishCleanQuizzesAuto: false,
    geminiModel: 'gemini-3.5-flash',
  };
}

export async function updateExtractionSettings(
  partial: Partial<AdminExtractionSettings>
): Promise<AdminExtractionSettings> {
  const token = await getCurrentUserToken();
  const response = await fetch('/api/admin/extraction-settings', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(partial),
  });
  const data = await response.json().catch(() => ({}));
  return data.settings;
}

export async function bulkPublishCleanQuizzes(): Promise<number> {
  const token = await getCurrentUserToken();
  const response = await fetch('/api/admin/pdfs/bulk-publish-clean', {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await response.json().catch(() => ({ success: false, publishedCount: 0 }));
  return data.publishedCount || 0;
}

// -------------------------------------------------------------
// Attempts Management
// -------------------------------------------------------------
export interface SaveAttemptPayload {
  testId: string;
  testTitle: string;
  score?: number;
  maxScore?: number;
  correct?: number;
  incorrect?: number;
  unattempted?: number;
  accuracy?: number;
  timeTakenSeconds: number;
  submissionKey?: string;
  questionsData: AttemptQuestionData[];
}

export async function saveTestAttempt(
  payload: SaveAttemptPayload
): Promise<{
  success: boolean;
  attemptId: string;
  evaluatedAttempt?: TestAttempt;
  leaderboard?: TestLeaderboardSummary | null;
}> {
  const token = await getCurrentUserToken();
  const response = await fetch('/api/attempts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({
    success: false,
    error: 'Failed to save test attempt',
  }));

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to persist test attempt');
  }

  return {
    success: true,
    attemptId: data.attemptId,
    evaluatedAttempt: data.attempt,
    leaderboard: data.leaderboard || null,
  };
}

export async function fetchTestLeaderboard(
  testId: string
): Promise<TestLeaderboardSummary | null> {
  if (!testId || testId === 'custom-test' || testId === 'custom-json') return null;
  try {
    const token = await getCurrentUserToken();
    const res = await fetch(`/api/tests/${encodeURIComponent(testId)}/leaderboard`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json().catch(() => ({ success: false }));
    if (res.ok && data.success && data.leaderboard) {
      return data.leaderboard as TestLeaderboardSummary;
    }
  } catch (err) {
    console.warn('Failed to fetch test leaderboard:', err);
  }
  return null;
}

export async function fetchMyAttempts(): Promise<TestAttempt[]> {
  const token = await getCurrentUserToken();
  const response = await fetch('/api/attempts/me', {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json().catch(() => ({ success: false, attempts: [] }));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch user attempts');
  }

  return data.attempts as TestAttempt[];
}

export async function fetchAttemptById(attemptId: string): Promise<TestAttempt> {
  const token = await getCurrentUserToken();
  const response = await fetch(`/api/attempts/${encodeURIComponent(attemptId)}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json().catch(() => ({ success: false, error: 'Not found' }));
  if (!response.ok || !data.success || !data.attempt) {
    throw new Error(data.error || 'Failed to fetch attempt record');
  }

  return data.attempt as TestAttempt;
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const token = await getCurrentUserToken();
  const response = await fetch('/api/admin/overview', {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json().catch(() => ({
    success: false,
    error: 'Failed to load admin overview',
  }));

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to load admin overview metrics');
  }

  return data.overview as AdminOverview;
}

export async function cleanAndReextractPdf(
  pdfId: string
): Promise<{ success: boolean; report?: ExtractionReport }> {
  const token = await getCurrentUserToken();
  const response = await fetch(`/api/admin/pdfs/${encodeURIComponent(pdfId)}/clean-reextract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await response.json().catch(() => ({
    success: false,
    error: 'Failed to communicate with clean-reextract endpoint.',
  }));

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Clean and re-extract failed.');
  }

  return { success: true, report: data.report };
}

// -------------------------------------------------------------
// Bookmarks Client Service
// -------------------------------------------------------------
const LOCAL_BOOKMARKS_KEY = 'cbt_bookmarks_local';

function getLocalBookmarks(): BookmarkedQuestion[] {
  try {
    const raw = localStorage.getItem(LOCAL_BOOKMARKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalBookmarks(list: BookmarkedQuestion[]) {
  try {
    localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(list));
  } catch {}
}

export async function fetchMyBookmarks(): Promise<BookmarkedQuestion[]> {
  try {
    const token = await getCurrentUserToken();
    const response = await fetch('/api/bookmarks/me', {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await response.json().catch(() => ({ success: false }));
    if (response.ok && data.success) {
      saveLocalBookmarks(data.bookmarks || []);
      return data.bookmarks || [];
    }
  } catch (err) {
    console.warn('Backend bookmark fetch failed, fallback to local:', err);
  }
  return getLocalBookmarks();
}

export async function saveBookmark(payload: {
  testId?: string;
  testTitle: string;
  questionNumber: number;
  question: MCQQuestion;
}): Promise<BookmarkedQuestion> {
  const bookmarkId = `bm_local_${payload.testId || 'q'}_${payload.questionNumber}_${Date.now()}`;
  const localItem: BookmarkedQuestion = {
    id: bookmarkId,
    userId: 'me',
    testId: payload.testId,
    testTitle: payload.testTitle,
    questionNumber: payload.questionNumber,
    question: payload.question,
    createdAt: new Date().toISOString(),
  };

  try {
    const token = await getCurrentUserToken();
    const response = await fetch('/api/bookmarks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({ success: false }));
    if (response.ok && data.success && data.bookmark) {
      const current = getLocalBookmarks().filter((b) => b.id !== data.bookmark.id);
      saveLocalBookmarks([data.bookmark, ...current]);
      return data.bookmark;
    }
  } catch (err) {
    console.warn('Backend bookmark save failed, fallback to local:', err);
  }

  const current = getLocalBookmarks();
  const filtered = current.filter(
    (b) => !(b.testId === payload.testId && b.questionNumber === payload.questionNumber)
  );
  saveLocalBookmarks([localItem, ...filtered]);
  return localItem;
}

export async function removeBookmark(bookmarkId: string): Promise<boolean> {
  try {
    const token = await getCurrentUserToken();
    await fetch(`/api/bookmarks/${encodeURIComponent(bookmarkId)}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (err) {
    console.warn('Backend bookmark delete failed, removing locally:', err);
  }

  const current = getLocalBookmarks();
  saveLocalBookmarks(current.filter((b) => b.id !== bookmarkId));
  return true;
}

// -------------------------------------------------------------
// Question Reports Client Service
// -------------------------------------------------------------
const LOCAL_REPORTS_KEY = 'cbt_reports_local';

function getLocalReports(): QuestionReport[] {
  try {
    const raw = localStorage.getItem(LOCAL_REPORTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalReports(list: QuestionReport[]) {
  try {
    localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(list));
  } catch {}
}

export async function submitQuestionReport(payload: {
  testId?: string;
  testTitle?: string;
  questionNumber: number;
  questionText: string;
  reason: 'Typo' | 'Wrong answer' | 'Ambiguous explanation' | 'Other';
  comment?: string;
}): Promise<QuestionReport> {
  const localReport: QuestionReport = {
    id: `rep_${Date.now()}`,
    userId: 'me',
    testId: payload.testId,
    testTitle: payload.testTitle,
    questionNumber: payload.questionNumber,
    questionText: payload.questionText,
    reason: payload.reason,
    comment: payload.comment,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  try {
    const token = await getCurrentUserToken();
    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({ success: false }));
    if (response.ok && data.success && data.report) {
      const current = getLocalReports();
      saveLocalReports([data.report, ...current]);
      return data.report;
    }
  } catch (err) {
    console.warn('Backend report submission failed, fallback to local:', err);
  }

  const current = getLocalReports();
  saveLocalReports([localReport, ...current]);
  return localReport;
}

export async function fetchQuestionReports(): Promise<QuestionReport[]> {
  try {
    const token = await getCurrentUserToken();
    const response = await fetch('/api/reports', {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await response.json().catch(() => ({ success: false }));
    if (response.ok && data.success) {
      saveLocalReports(data.reports || []);
      return data.reports || [];
    }
  } catch (err) {
    console.warn('Backend reports fetch failed, fallback to local:', err);
  }
  return getLocalReports();
}

export async function resolveQuestionReport(reportId: string): Promise<boolean> {
  try {
    const token = await getCurrentUserToken();
    await fetch(`/api/reports/${encodeURIComponent(reportId)}/resolve`, {
      method: 'PATCH',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (err) {
    console.warn('Backend report resolve failed, updating locally:', err);
  }

  const current = getLocalReports();
  const updated = current.map((r) => (r.id === reportId ? { ...r, status: 'resolved' as const } : r));
  saveLocalReports(updated);
  return true;
}

export interface ReportQuestionContext {
  report: QuestionReport;
  testId: string;
  testTitle: string;
  questionIndex: number;
  question: MCQQuestion;
}

export async function fetchReportQuestionContext(
  reportId: string
): Promise<ReportQuestionContext> {
  const token = await getCurrentUserToken();
  const response = await fetch(
    `/api/admin/reports/${encodeURIComponent(reportId)}/question`,
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  );
  const data = await response.json().catch(() => ({
    success: false,
    error: 'Failed to load reported question from catalog.',
  }));
  if (!response.ok || !data.success || !data.question) {
    throw new Error(data.error || 'Could not load source question for this report.');
  }
  return {
    report: data.report,
    testId: data.testId,
    testTitle: data.testTitle,
    questionIndex: data.questionIndex,
    question: data.question,
  };
}

export async function fixQuestionAndResolveReport(
  reportId: string,
  payload: {
    question: string;
    options: { A: string; B: string; C: string; D: string; E?: string };
    correctOption: 'A' | 'B' | 'C' | 'D' | 'E';
    explanation: string;
    subject?: string;
    chapter?: string;
    resolutionNote?: string;
  }
): Promise<{ success: boolean; report?: QuestionReport }> {
  const token = await getCurrentUserToken();
  const response = await fetch(
    `/api/admin/reports/${encodeURIComponent(reportId)}/fix-and-resolve`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    }
  );
  const data = await response.json().catch(() => ({
    success: false,
    error: 'Failed to save question fix.',
  }));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to save question fix.');
  }

  const current = getLocalReports();
  const updated = current.map((r) =>
    r.id === reportId ? { ...r, ...(data.report || {}), status: 'resolved' as const } : r
  );
  saveLocalReports(updated);

  return { success: true, report: data.report };
}

// ==========================================
// EXAM CATALOG & BROWSING SERVICES
// ==========================================

export async function fetchCatalogExams(includeInactive = false): Promise<CatalogExam[]> {
  try {
    const res = await fetch(`/api/exams?all=${includeInactive ? 'true' : 'false'}`);
    const data = await res.json();
    if (res.ok && data.success) {
      return data.exams || [];
    }
  } catch (err) {
    console.warn('Failed to fetch catalog exams:', err);
  }
  return [];
}

export async function saveCatalogExam(exam: Partial<CatalogExam>): Promise<{ success: boolean; exam?: CatalogExam; error?: string }> {
  try {
    const token = await getCurrentUserToken();
    const res = await fetch('/api/admin/exams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(exam),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save exam' };
  }
}

export async function updateCatalogExam(id: string, updates: Partial<CatalogExam>): Promise<{ success: boolean; exam?: CatalogExam; error?: string }> {
  try {
    const token = await getCurrentUserToken();
    const res = await fetch(`/api/admin/exams/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update exam' };
  }
}

export async function deleteCatalogExam(id: string): Promise<boolean> {
  try {
    const token = await getCurrentUserToken();
    const res = await fetch(`/api/admin/exams/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json();
    return !!data.success;
  } catch (err) {
    return false;
  }
}

export async function fetchExamAliases(): Promise<ExamAlias[]> {
  try {
    const token = await getCurrentUserToken();
    const res = await fetch('/api/admin/exam-aliases', {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return data.aliases || [];
    }
  } catch (err) {
    console.warn('Failed to fetch exam aliases:', err);
  }
  return [];
}

export async function saveExamAlias(payload: { tag: string; examId: string; examName: string }): Promise<{ success: boolean; alias?: ExamAlias; error?: string }> {
  try {
    const token = await getCurrentUserToken();
    const res = await fetch('/api/admin/exam-aliases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save alias' };
  }
}

export async function deleteExamAlias(id: string): Promise<boolean> {
  try {
    const token = await getCurrentUserToken();
    const res = await fetch(`/api/admin/exam-aliases/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json();
    return !!data.success;
  } catch (err) {
    return false;
  }
}

export async function fetchUnmappedTags(): Promise<UnmappedExamTag[]> {
  try {
    const token = await getCurrentUserToken();
    const res = await fetch('/api/admin/unmapped-tags', {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return data.unmappedTags || [];
    }
  } catch (err) {
    console.warn('Failed to fetch unmapped tags:', err);
  }
  return [];
}

export async function mapTagToOneTap(tag: string, examId: string, examName: string): Promise<boolean> {
  try {
    const token = await getCurrentUserToken();
    const res = await fetch('/api/admin/map-tag', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ tag, examId, examName }),
    });
    const data = await res.json();
    return !!data.success;
  } catch (err) {
    return false;
  }
}

export async function runOrganizeQuestions(): Promise<OrganizeReport> {
  const token = await getCurrentUserToken();
  const res = await fetch('/api/admin/organize-questions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to organize questions and tests');
  }
  return data.report;
}

export async function runAiAutoClassify(): Promise<AiAutoClassifyReport> {
  const token = await getCurrentUserToken();
  const res = await fetch('/api/admin/ai-auto-classify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({ success: false }));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to run AI auto-classification');
  }
  return data.report as AiAutoClassifyReport;
}

export async function fetchBrowseSummary(): Promise<BrowseSummary> {
  const token = await getCurrentUserToken().catch(() => null);
  const res = await fetch('/api/browse/summary', {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: `Failed to parse browse summary response (${res.status})`,
  }));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Failed to load browse summary (${res.status})`);
  }
  const summary = data.summary || data;
  return {
    exams: summary.exams || [],
    subjects: summary.subjects || [],
    chapters: summary.chapters || [],
  };
}

export async function fetchExamDetail(examId: string): Promise<ExamDetailData> {
  const token = await getCurrentUserToken().catch(() => null);
  const res = await fetch(`/api/browse/exams/${encodeURIComponent(examId)}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch exam detail');
  }
  return {
    exam: data.exam,
    yearPapers: data.yearPapers || [],
    subjectTests: data.subjectTests || [],
    chapterTests: data.chapterTests || [],
  };
}

export async function buildCustomTestAPI(filters: CustomTestFilter): Promise<{ success: boolean; test: CloudSavedTest; notice?: string; totalMatching: number }> {
  const token = await getCurrentUserToken();
  const res = await fetch('/api/tests/custom-builder', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(filters),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to build custom test');
  }
  return data;
}

export async function translateQuestionOnDemand(
  question: MCQQuestion,
  targetLanguage: 'Hindi' | 'English'
): Promise<{
  questionText: string;
  options: MCQOptionMap;
}> {
  const hasHindiChars = (str?: string) => /[\u0900-\u097F]/.test(str || '');

  // If already genuinely translated and cached locally
  if (targetLanguage === 'Hindi') {
    if (question.questionHindi && hasHindiChars(question.questionHindi)) {
      return {
        questionText: question.questionHindi,
        options: question.optionsHindi || question.options,
      };
    }
  } else {
    if (question.questionEnglish && !hasHindiChars(question.questionEnglish)) {
      return {
        questionText: question.questionEnglish,
        options: question.optionsEnglish || question.options,
      };
    }
  }

  const sourceQuestionText =
    targetLanguage === 'Hindi'
      ? (question.questionEnglish || question.question)
      : (question.questionHindi || question.question);

  const sourceOptions =
    targetLanguage === 'Hindi'
      ? (question.optionsEnglish || question.options)
      : (question.optionsHindi || question.options);

  try {
    const token = await getCurrentUserToken().catch(() => null);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/translate-question', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        question: sourceQuestionText,
        options: sourceOptions,
        targetLanguage,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success && data.translatedQuestion) {
      if (targetLanguage === 'Hindi') {
        question.questionHindi = data.translatedQuestion;
        if (data.translatedOptions) question.optionsHindi = data.translatedOptions;
      } else {
        question.questionEnglish = data.translatedQuestion;
        if (data.translatedOptions) question.optionsEnglish = data.translatedOptions;
      }
      return {
        questionText: data.translatedQuestion,
        options: data.translatedOptions || question.options,
      };
    }
  } catch (err) {
    console.warn('On-demand translation call error:', err);
  }

  // Client-side quick exam translation fallback if server is unreachable
  if (targetLanguage === 'Hindi') {
    const hiMap: [RegExp, string][] = [
      [/\bIn\s+the\s+following\s+which\s+is\b/gi, 'निम्नलिखित में से कौन सी'],
      [/\bWhich\s+of\s+the\s+following\s+is\b/gi, 'निम्नलिखित में से कौन सा'],
      [/\bfundamental\s+physical\s+quantity\b/gi, 'मूल भौतिक राशि'],
      [/\bphysical\s+quantity\b/gi, 'भौतिक राशि'],
      [/\bForce\b/gi, 'बल'],
      [/\bVelocity\b/gi, 'वेग'],
      [/\bMass\b/gi, 'द्रव्यमान'],
      [/\bWork\b/gi, 'कार्य'],
      [/\bAcceleration\b/gi, 'त्वरण'],
      [/\bSpeed\b/gi, 'चाल'],
      [/\bTime\b/gi, 'समय'],
      [/\bTemperature\b/gi, 'तापमान'],
      [/\bElectric\s+current\b/gi, 'विद्युत धारा'],
      [/\bNone\s+of\s+these\b/gi, 'इनमें से कोई नहीं'],
      [/\bAll\s+of\s+the\s+above\b/gi, 'उपरोक्त सभी'],
    ];
    let qText = sourceQuestionText;
    hiMap.forEach(([pattern, repl]) => {
      qText = qText.replace(pattern, repl);
    });
    const translatedOpts: MCQOptionMap = { ...sourceOptions };
    for (const k of ['A', 'B', 'C', 'D', 'E'] as const) {
      if (translatedOpts[k]) {
        let val = translatedOpts[k]!;
        hiMap.forEach(([pattern, repl]) => {
          val = val.replace(pattern, repl);
        });
        translatedOpts[k] = val;
      }
    }
    question.questionHindi = qText;
    question.optionsHindi = translatedOpts;
    return { questionText: qText, options: translatedOpts };
  } else {
    const enMap: [RegExp, string][] = [
      [/14वीं\s+शताब्दी\s+के\s+इतिहासकार\s+जियाउद्दीन\s+बरनी\s+ने\s+अपना\s+पहला\s+वृतांत\s*(\(Chronicle\))?\s*कब\s+लिखा\s+था\?/gi, 'When did the 14th-century historian Ziauddin Barani write his first chronicle?'],
      [/सुलेमान\s+और\s+किरथर\s+पहाड़ी\s+कहां\s+पर\s+स्थित\s+है\?/gi, 'Where are the Sulaiman and Kirthar hills located?'],
      [/सुलेमान\s+और\s+किरथर\s+पहाड़ी/gi, 'Sulaiman and Kirthar hills'],
      [/कहां\s+पर\s+स्थित\s+है\?/gi, 'where is located?'],
      [/कहां\s+स्थित\s+है\?/gi, 'where is situated?'],
      [/कब\s+लिखा\s+था\?/gi, 'when was written?'],
      [/1356\s+ईस्वी/gi, '1356 AD'],
      [/1352\s+ईस्वी/gi, '1352 AD'],
      [/1354\s+ईस्वी/gi, '1354 AD'],
      [/1358\s+ईस्वी/gi, '1358 AD'],
      [/भारत/gi, 'India'],
      [/पाकिस्तान/gi, 'Pakistan'],
      [/अफगानिस्तान/gi, 'Afghanistan'],
      [/नेपाल/gi, 'Nepal'],
      [/बल/gi, 'Force'],
      [/वेग/gi, 'Velocity'],
      [/द्रव्यमान/gi, 'Mass'],
      [/कार्य/gi, 'Work'],
    ];
    let qText = sourceQuestionText;
    enMap.forEach(([pattern, repl]) => {
      qText = qText.replace(pattern, repl);
    });
    const translatedOpts: MCQOptionMap = { ...sourceOptions };
    for (const k of ['A', 'B', 'C', 'D', 'E'] as const) {
      if (translatedOpts[k]) {
        let val = translatedOpts[k]!;
        enMap.forEach(([pattern, repl]) => {
          val = val.replace(pattern, repl);
        });
        translatedOpts[k] = val;
      }
    }
    question.questionEnglish = qText;
    question.optionsEnglish = translatedOpts;
    return { questionText: qText, options: translatedOpts };
  }
}

// -------------------------------------------------------------
// Cross-Device Active Test Progress Sync Client Service
// -------------------------------------------------------------
export async function fetchActiveTestProgress(): Promise<ActiveTestProgress | null> {
  try {
    const token = await getCurrentUserToken().catch(() => null);
    if (!token) return null;
    const res = await fetch('/api/progress/active', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({ success: false }));
    if (res.ok && data.success && data.progress) {
      return data.progress as ActiveTestProgress;
    }
  } catch (err) {
    console.warn('Failed to fetch cloud active progress:', err);
  }
  return null;
}

export async function saveActiveTestProgress(progress: ActiveTestProgress): Promise<void> {
  try {
    const token = await getCurrentUserToken().catch(() => null);
    if (!token) return;
    await fetch('/api/progress/active', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(progress),
    });
  } catch (err) {
    console.warn('Failed to sync active progress to cloud:', err);
  }
}

export async function clearActiveTestProgress(): Promise<void> {
  try {
    const token = await getCurrentUserToken().catch(() => null);
    if (!token) return;
    await fetch('/api/progress/active', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.warn('Failed to clear cloud active progress:', err);
  }
}

