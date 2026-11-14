export interface MCQOptionMap {
  A: string;
  B: string;
  C: string;
  D: string;
  E?: string;
  [key: string]: string | undefined;
}

export type QuestionType = 'factual' | 'conceptual' | 'application';

export interface MCQQuestion {
  id: number;
  question: string;
  questionHindi?: string;
  questionEnglish?: string;
  optionsHindi?: MCQOptionMap;
  optionsEnglish?: MCQOptionMap;
  type: QuestionType;
  options: MCQOptionMap;
  correctOption: 'A' | 'B' | 'C' | 'D' | 'E' | '';
  explanation: string;
  sourcePages?: string;
  examName?: string;
  year?: string;
  examTags?: string[];
  stage?: 'Pre' | 'Mains' | string;
  subject?: string;
  chapter?: string;
  sourcePdfId?: string;
  answerStatus?: 'found' | 'missing';
  needs_review?: boolean;
  reviewReasons?: string[];
  passage?: string;
  data?: string;
  passageData?: string;
  passageImage?: string;
}

export type PaletteStatus =
  | 'not_visited'
  | 'not_answered'
  | 'answered'
  | 'marked_for_review'
  | 'answered_and_marked';

export interface QuestionState {
  selectedOption: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  isMarkedForReview: boolean;
  isVisited: boolean;
  timeSpentSeconds: number;
}

export interface TestSettings {
  difficulty: 'Easy' | 'Medium' | 'Hard';
  language: 'English' | 'Hindi';
  durationMinutes: number;
  positiveMarks: number;
  negativeMarks: number;
}

export interface TestResult {
  score: number;
  maxScore: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  accuracy: number;
  timeTakenSeconds: number;
  markingScheme: {
    positive: number;
    negative: number;
  };
}

export interface ExtractedPdfData {
  text: string;
  isScanned: boolean;
  pageCount: number;
  fileName: string;
  fileSizeBytes: number;
  base64Data?: string;
}

// User Profile & Roles
export interface UserProfile {
  uid: string;
  email: string;
  phoneNumber?: string;
  displayName?: string;
  role: 'admin' | 'user';
  isAdmin: boolean;
  photoURL?: string;
}

// Cloud Storage / Backend API Types
export interface CloudSavedQuestion {
  id?: string | number;
  question: string;
  questionHindi?: string;
  questionEnglish?: string;
  optionsHindi?: MCQOptionMap;
  optionsEnglish?: MCQOptionMap;
  options: MCQOptionMap;
  correctOption: 'A' | 'B' | 'C' | 'D' | 'E' | '';
  correctIndex?: number;
  explanation: string;
  type: QuestionType;
  sourcePages: string;
  examName?: string;
  year?: string;
  examTags?: string[];
  stage?: 'Pre' | 'Mains' | string;
  subject?: string;
  chapter?: string;
  sourcePdfId?: string;
  answerStatus?: 'found' | 'missing';
  needs_review?: boolean;
  reviewReasons?: string[];
  passage?: string;
  data?: string;
  passageData?: string;
  passageImage?: string;
}

export interface CloudSavedTest {
  id: string;
  title: string;
  createdAt: string;
  status: 'draft' | 'published';
  authorEmail?: string;
  language: string;
  difficulty: string;
  durationMinutes: number;
  markingCorrect: number;
  markingWrong: number;
  questionCount: number;
  sourcePageCount: number;
  examName?: string;
  year?: string;
  examTags?: string[];
  subject?: string;
  chapter?: string;
  sourcePdfId?: string;
  questions: CloudSavedQuestion[];
}

export interface CloudTestSummary {
  id: string;
  title: string;
  createdAt: string;
  status: 'draft' | 'published';
  authorEmail?: string;
  language: string;
  difficulty: string;
  questionCount: number;
  durationMinutes: number;
  markingCorrect?: number;
  markingWrong?: number;
  sourcePageCount?: number;
  examName?: string;
  year?: string;
  examNamesFound?: string[];
  yearsFound?: string[];
  subject?: string;
  chapter?: string;
  sourcePdfId?: string;
  bestScore?: number;
  latestScore?: number;
}

// Extraction Report & Question PDF Library
export interface ExtractionReport {
  totalPages: number;
  processedPages: number;
  failedPages: number[];
  notesPagesSkipped: number;
  questionsExtracted: number;
  questionsParsedByRules: number;
  questionsParsedByGemini: number;
  geminiCallsUsed: number;
  linkedExplanationsCount: number;
  endAnswerKeyMatchesCount: number;
  questionsSkipped: Array<{ pageNumber: number; reason?: string }>;
  questionsWithMissingAnswers: number;
  questionsWithMissingMetadata: number;
  quizzesCreated: number;
  quizzesPublished: number;
  quizzesNeedingReview: number;
  possibleMissingQuestions?: Array<{ pageNumber: number; questionNumber?: number; reason: string }>;
  mismatches?: Array<{ pageNumber: number; expectedMarkerCount: number; parsedCount: number }>;
  unresolvedPages?: number[];
  quizSummaries: Array<{
    id: string;
    title: string;
    questionCount: number;
    status: 'draft' | 'published';
    isClean: boolean;
  }>;
  completedAt: string;
}

export interface QuestionPdfRecord {
  id: string;
  fileName: string;
  sizeBytes: number;
  pageCount: number;
  uploadedBy: string;
  uploadedAt: string;
  status: 'uploaded' | 'running' | 'paused' | 'extracted' | 'failed' | 'waiting';
  pagesExtracted?: number;
  questionCount?: number;
  lastExtractedPage?: number;
  lastFinishedBatch?: number;
  totalBatches?: number;
  currentProgressMsg?: string;
  pauseReason?: string;
  storagePath?: string;
  hasStorageData?: boolean;
  possibleMissingQuestions?: Array<{ pageNumber: number; questionNumber?: number; reason: string }>;
  unresolvedPages?: number[];
  lastExtractionReport?: ExtractionReport;
}

export interface AdminExtractionSettings {
  maxGeminiCallsPerDay: number;
  geminiCallsToday: number;
  autoExtractOnUpload: boolean;
  publishCleanQuizzesAuto: boolean;
  geminiModel: string;
}

// Test Attempts
export interface AttemptQuestionData {
  id: number;
  question: string;
  questionHindi?: string;
  questionEnglish?: string;
  optionsHindi?: MCQOptionMap;
  optionsEnglish?: MCQOptionMap;
  type: QuestionType;
  options: MCQOptionMap;
  selectedOption: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  correctOption: 'A' | 'B' | 'C' | 'D' | 'E' | '';
  isCorrect: boolean;
  explanation: string;
  timeSpentSeconds: number;
  isMarkedForReview: boolean;
  examName?: string;
  year?: string;
  examTags?: string[];
  stage?: string;
  subject?: string;
  chapter?: string;
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  score: number;
  maxScore: number;
  accuracy: number;
  timeTakenSeconds: number;
  isCurrentUser: boolean;
}

export interface TestLeaderboardSummary {
  testId: string;
  totalParticipants: number;
  topScore: number;
  averageScore: number;
  currentUserRank: number | null;
  currentUserPercentile: number | null;
  currentUserBestScore: number | null;
  topEntries: LeaderboardEntry[];
}

export interface TestAttempt {
  id: string;
  userId: string;
  userEmail?: string;
  testId: string;
  testTitle: string;
  score: number;
  maxScore: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  accuracy: number;
  timeTakenSeconds: number;
  createdAt: string;
  questionsData: AttemptQuestionData[];
}

// Admin Overview
export interface AdminOverview {
  totalUsers: number;
  totalAttempts: number;
  perTestStats: Array<{
    testId: string;
    title: string;
    attemptCount: number;
    averageScore: number;
    averageAccuracy: number;
  }>;
}

// Bookmarked Questions
export interface BookmarkedQuestion {
  id: string;
  userId: string;
  testId?: string;
  testTitle: string;
  questionNumber: number;
  question: MCQQuestion;
  createdAt: string;
}

// Question Reports
export interface QuestionReport {
  id: string;
  userId: string;
  userEmail?: string;
  testId?: string;
  testTitle?: string;
  questionNumber: number;
  questionText: string;
  reason: 'Typo' | 'Wrong answer' | 'Ambiguous explanation' | 'Other';
  comment?: string;
  status: 'pending' | 'resolved';
  createdAt: string;
}

// -------------------------------------------------------------
// Exam Catalog, Hierarchy & Custom Test Builder Types
// -------------------------------------------------------------
export interface CatalogExam {
  id: string;
  name: string;
  shortName: string;
  categoryGroup: string;
  active: boolean;
  order: number;
  testCount?: number;
  questionCount?: number;
}

export interface ExamAlias {
  id: string;
  tag: string;
  examId: string;
  examName: string;
}

export interface UnmappedExamTag {
  tag: string;
  questionCount: number;
  sampleQuestion?: string;
}

export interface CustomTestFilter {
  examNames?: string[];
  subject?: string;
  chapters?: string[];
  yearStart?: number;
  yearEnd?: number;
  difficulty?: 'All' | 'Easy' | 'Medium' | 'Hard';
  language?: 'All' | 'English' | 'Hindi';
  questionCount: number;
  mode: 'mock' | 'practice';
  preferUnattempted?: boolean;
}

export interface BrowseSubjectSummary {
  name: string;
  testCount: number;
  questionCount: number;
  chaptersCount: number;
}

export interface BrowseChapterSummary {
  subject: string;
  name: string;
  questionCount: number;
  testCount: number;
  userAttemptedCount: number;
}

export interface BrowseSummary {
  exams: CatalogExam[];
  subjects: BrowseSubjectSummary[];
  chapters: BrowseChapterSummary[];
}

export interface ExamDetailData {
  exam: CatalogExam;
  yearPapers: CloudTestSummary[];
  subjectTests: CloudTestSummary[];
  chapterTests: CloudTestSummary[];
}

export interface OrganizeReport {
  totalQuestionsProcessed: number;
  mappedQuestionsCount: number;
  unplacedQuestionsCount: number;
  unmappedTags: UnmappedExamTag[];
  readyMadeTestsCreated: number;
  unplacedSampleQuestions: Array<{
    id: string | number;
    question: string;
    rawExamName?: string;
    rawYear?: string;
  }>;
}

export interface AiAutoClassifyReport {
  totalScanned: number;
  ruleUpdatedCount: number;
  aiUpdatedCount: number;
  updatedTestsCount: number;
  remainingUntagged: number;
  aiAvailable: boolean;
}

export interface ActiveTestProgress {
  testId?: string;
  testTitle?: string;
  currentIndex?: number;
  answeredCount?: number;
  totalCount?: number;
  secondsRemaining?: number;
  questionStates?: QuestionState[];
  eliminatedOptions?: Record<number, string[]>;
  updatedAt?: string;
}


