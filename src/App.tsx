import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { AuthScreen } from './components/AuthScreen';
import { UserDashboard } from './components/UserDashboard';
import { AdminPanel } from './components/AdminPanel';
import { PerformanceDashboard } from './components/PerformanceDashboard';
import { QuizPractice } from './components/QuizPractice';
import { StudyMode } from './components/StudyMode';
import { RawJsonInspector } from './components/RawJsonInspector';
import { ResultScreen } from './components/ResultScreen';
import {
  MCQQuestion,
  QuestionState,
  TestSettings,
  TestResult,
  UserProfile,
  AttemptQuestionData,
  TestLeaderboardSummary,
} from './types';
import {
  getCurrentUserProfile,
  signOutUser,
  onAuthStateListener,
} from './services/authService';
import {
  saveTestAttempt,
  SaveAttemptPayload,
  fetchTestById,
} from './services/cloudStorageService';
import { CheckCircle2, AlertTriangle, RotateCcw, Home, BarChart3, RefreshCw } from 'lucide-react';

interface AttemptSaveState {
  status: 'idle' | 'saving' | 'saved' | 'failed';
  message?: string;
  error?: string;
  pendingPayload?: SaveAttemptPayload;
}

export default function App() {
  // Authentication & Session
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Application Stages:
  // 'dashboard' (user tests) | 'performance' | 'admin' | 'test' (active CBT) | 'study' | 'result'
  const [stage, setStage] = useState<
    'dashboard' | 'performance' | 'admin' | 'test' | 'study' | 'result'
  >('dashboard');
  const [showAppJsonInspector, setShowAppJsonInspector] = useState(false);

  // Test Running State
  const [activeTestId, setActiveTestId] = useState<string | undefined>(undefined);
  const [docMeta, setDocMeta] = useState<{
    name: string;
    size: number;
    pageCount: number;
    isScanned: boolean;
  } | null>(null);

  const [activeSettings, setActiveSettings] = useState<TestSettings>({
    difficulty: 'Medium',
    language: 'English',
    durationMinutes: 10,
    positiveMarks: 1.0,
    negativeMarks: 0.25,
  });

  const [questions, setQuestions] = useState<MCQQuestion[]>([]);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [finalQuestionStates, setFinalQuestionStates] = useState<QuestionState[]>([]);
  const [latestLeaderboard, setLatestLeaderboard] = useState<TestLeaderboardSummary | null>(null);

  // Attempt Save State (Cloud persistence for attempt with retry fallback)
  const [attemptSaveState, setAttemptSaveState] = useState<AttemptSaveState>({
    status: 'idle',
  });

  const PENDING_SUBMISSION_STORAGE_KEY = 'cbt_pending_attempt_submission';

  // Listen to auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateListener((profile) => {
      setCurrentUser(profile);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Flush any offline-queued pending submission when user returns online
  useEffect(() => {
    if (!currentUser) return;
    const flushPending = async () => {
      try {
        const raw = localStorage.getItem(PENDING_SUBMISSION_STORAGE_KEY);
        if (!raw) return;
        const pending = JSON.parse(raw) as SaveAttemptPayload;
        if (!pending || !pending.testId) return;
        await saveTestAttempt(pending);
        localStorage.removeItem(PENDING_SUBMISSION_STORAGE_KEY);
      } catch {
        // Keep queued for next reconnect
      }
    };
    flushPending();
    window.addEventListener('online', flushPending);
    return () => window.removeEventListener('online', flushPending);
  }, [currentUser]);

  const handleAuthSuccess = (userProfile: UserProfile) => {
    setCurrentUser(userProfile);
    if (userProfile.isAdmin) {
      setStage('admin');
    } else {
      setStage('dashboard');
    }
  };

  const handleLogout = async () => {
    await signOutUser();
    setCurrentUser(null);
    setStage('dashboard');
    setQuestions([]);
    setTestResult(null);
    setFinalQuestionStates([]);
  };

  const handleStartTest = (
    testQuestions: MCQQuestion[],
    settings: TestSettings,
    title: string,
    testId?: string
  ) => {
    setQuestions(testQuestions);
    setActiveSettings(settings);
    setActiveTestId(testId);
    setDocMeta({
      name: title,
      size: 0,
      pageCount: 1,
      isScanned: false,
    });
    setAttemptSaveState({ status: 'idle' });
    setLatestLeaderboard(null);
    setStage('test');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartStudy = (
    studyQuestions: MCQQuestion[],
    title: string,
    testId?: string
  ) => {
    setQuestions(studyQuestions);
    setActiveTestId(testId);
    setDocMeta({
      name: title,
      size: 0,
      pageCount: 1,
      isScanned: false,
    });
    setStage('study');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRetakeFromTestId = async (testId: string) => {
    try {
      const fullTest = await fetchTestById(testId);
      const convertedQuestions: MCQQuestion[] = fullTest.questions.map((q, idx) => ({
        ...q,
        id: typeof q.id === 'number' ? q.id : parseInt(String(q.id || idx + 1), 10) || idx + 1,
        question: q.question,
        questionHindi: q.questionHindi,
        questionEnglish: q.questionEnglish,
        optionsHindi: q.optionsHindi,
        optionsEnglish: q.optionsEnglish,
        passage: q.passage,
        data: q.data || q.passageData,
        passageImage: q.passageImage,
        type: q.type || 'factual',
        options: q.options,
        correctOption: q.correctOption,
        explanation: q.explanation,
        sourcePages: q.sourcePages,
      }));

      const settings: TestSettings = {
        difficulty: (fullTest.difficulty as any) || 'Medium',
        language: (fullTest.language as any) || 'English',
        durationMinutes: fullTest.durationMinutes || 10,
        positiveMarks: fullTest.markingCorrect ?? 1.0,
        negativeMarks: fullTest.markingWrong ?? 0.25,
      };

      handleStartTest(convertedQuestions, settings, fullTest.title, fullTest.id);
    } catch (err: any) {
      alert(err.message || 'Failed to reload test for retake.');
    }
  };

  const hydrateAttemptEvaluation = (
    evaluatedAttempt: import('./types').TestAttempt | undefined,
    fallbackResult: TestResult
  ) => {
    if (!evaluatedAttempt) return;
    setTestResult({
      score: evaluatedAttempt.score,
      maxScore: evaluatedAttempt.maxScore,
      correctCount: evaluatedAttempt.correct,
      incorrectCount: evaluatedAttempt.incorrect,
      unattemptedCount: evaluatedAttempt.unattempted,
      accuracy: evaluatedAttempt.accuracy,
      timeTakenSeconds: evaluatedAttempt.timeTakenSeconds ?? fallbackResult.timeTakenSeconds,
      markingScheme: fallbackResult.markingScheme,
    });
    if (Array.isArray(evaluatedAttempt.questionsData) && evaluatedAttempt.questionsData.length > 0) {
      setQuestions((prev) =>
        prev.map((q, idx) => {
          const graded = evaluatedAttempt.questionsData[idx];
          if (!graded) return q;
          return {
            ...q,
            correctOption: graded.correctOption || q.correctOption,
            explanation: graded.explanation || q.explanation,
            subject: graded.subject || q.subject,
            chapter: graded.chapter || q.chapter,
            examTags: graded.examTags || q.examTags,
            stage: graded.stage || q.stage,
            examName: graded.examName || q.examName,
            year: graded.year || q.year,
          };
        })
      );
    }
  };

  const handleFinishTest = async (
    result: TestResult,
    states: QuestionState[],
    submissionKey?: string
  ) => {
    setTestResult(result);
    setFinalQuestionStates(states);
    setStage('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Format attempt questions data
    const questionsData: AttemptQuestionData[] = questions.map((q, idx) => {
      const state = states[idx];
      const selected = state?.selectedOption ?? null;
      const isCorrect = selected === q.correctOption;
      return {
        id: q.id || idx + 1,
        question: q.question,
        ...(q.questionHindi ? { questionHindi: q.questionHindi } : {}),
        ...(q.questionEnglish ? { questionEnglish: q.questionEnglish } : {}),
        ...(q.optionsHindi ? { optionsHindi: q.optionsHindi } : {}),
        ...(q.optionsEnglish ? { optionsEnglish: q.optionsEnglish } : {}),
        type: q.type || 'factual',
        options: q.options,
        selectedOption: selected,
        correctOption: q.correctOption,
        isCorrect,
        explanation: q.explanation,
        timeSpentSeconds: state?.timeSpentSeconds || 0,
        isMarkedForReview: state?.isMarkedForReview || false,
        examName: q.examName,
        year: q.year,
        examTags: q.examTags,
        stage: q.stage,
        subject: q.subject,
        chapter: q.chapter,
      };
    });

    const payload: SaveAttemptPayload = {
      testId: activeTestId || 'custom-test',
      testTitle: docMeta?.name || 'Mock Test',
      score: result.score,
      maxScore: result.maxScore,
      correct: result.correctCount,
      incorrect: result.incorrectCount,
      unattempted: result.unattemptedCount,
      accuracy: result.accuracy,
      timeTakenSeconds: result.timeTakenSeconds,
      ...(submissionKey ? { submissionKey } : {}),
      questionsData,
    };

    setAttemptSaveState({ status: 'saving' });

    try {
      const saveRes = await saveTestAttempt(payload);
      try {
        localStorage.removeItem(PENDING_SUBMISSION_STORAGE_KEY);
      } catch {}
      hydrateAttemptEvaluation(saveRes.evaluatedAttempt, result);
      if (saveRes.leaderboard) {
        setLatestLeaderboard(saveRes.leaderboard);
      }
      setAttemptSaveState({
        status: 'saved',
        message: 'Examination attempt recorded in your performance profile',
      });
    } catch (err: any) {
      console.warn('Failed to save attempt to cloud:', err);
      try {
        localStorage.setItem(PENDING_SUBMISSION_STORAGE_KEY, JSON.stringify(payload));
      } catch {}
      // Requirement 11: If saving attempt fails, show "Save failed, Retry" and keep the result visible
      setAttemptSaveState({
        status: 'failed',
        error: err.message || 'Could not save attempt',
        pendingPayload: payload,
      });
    }
  };

  const handleRetrySaveAttempt = useCallback(async () => {
    if (!attemptSaveState.pendingPayload) return;
    setAttemptSaveState((prev) => ({ ...prev, status: 'saving' }));
    try {
      const saveRes = await saveTestAttempt(attemptSaveState.pendingPayload);
      try {
        localStorage.removeItem(PENDING_SUBMISSION_STORAGE_KEY);
      } catch {}
      if (testResult) {
        hydrateAttemptEvaluation(saveRes.evaluatedAttempt, testResult);
      }
      if (saveRes.leaderboard) {
        setLatestLeaderboard(saveRes.leaderboard);
      }
      setAttemptSaveState({
        status: 'saved',
        message: 'Examination attempt successfully recorded',
      });
    } catch (err: any) {
      setAttemptSaveState((prev) => ({
        ...prev,
        status: 'failed',
        error: err.message || 'Retry failed',
      }));
    }
  }, [attemptSaveState.pendingPayload, testResult]);

  useEffect(() => {
    if (attemptSaveState.status !== 'failed' || !attemptSaveState.pendingPayload) return;
    const onOnlineRetry = () => {
      handleRetrySaveAttempt();
    };
    window.addEventListener('online', onOnlineRetry);
    return () => window.removeEventListener('online', onOnlineRetry);
  }, [attemptSaveState.status, attemptSaveState.pendingPayload, handleRetrySaveAttempt]);

  const handleRetakeCurrentTest = () => {
    setAttemptSaveState({ status: 'idle' });
    setLatestLeaderboard(null);
    setStage('test');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExitToDashboard = () => {
    setStage('dashboard');
    setQuestions([]);
    setTestResult(null);
    setFinalQuestionStates([]);
    setLatestLeaderboard(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // If initial auth check is ongoing
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center text-white space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
          <p className="text-sm font-semibold tracking-wide">
            Authenticating CBT Mock Test Portal...
          </p>
        </div>
      </div>
    );
  }

  // Requirement 1: Nothing in the app is visible without login
  if (!currentUser) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div
      className={`${
        stage === 'test'
          ? 'h-[100dvh] max-h-[100dvh] overflow-hidden'
          : 'min-h-screen'
      } bg-slate-50 text-slate-900 flex flex-col font-sans`}
    >
      {/* Navigation Header */}
      <Header
        currentStage={stage}
        documentName={docMeta?.name}
        user={currentUser}
        onNavigate={(newStage) => setStage(newStage)}
        onLogout={handleLogout}
        onExitTest={handleExitToDashboard}
        onOpenJsonInspector={() => setShowAppJsonInspector(true)}
      />

      {/* Cloud Attempt Save Banner on Result Screen */}
      {stage === 'result' && attemptSaveState.status === 'saved' && (
        <div className="bg-emerald-600 text-white text-xs py-2 px-4 text-center flex items-center justify-center gap-2 font-medium shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          <span>{attemptSaveState.message || 'Attempt saved to your performance record'}</span>
        </div>
      )}

      {stage === 'result' && (attemptSaveState.status === 'failed' || attemptSaveState.status === 'saving') && (
        <div className="bg-amber-600 text-white text-xs py-2 px-4 text-center flex items-center justify-center gap-3 font-medium shadow-xs">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-200 shrink-0" />
            <span>Attempt save failed (your score and solutions remain available).</span>
          </div>
          <button
            type="button"
            onClick={handleRetrySaveAttempt}
            disabled={attemptSaveState.status === 'saving'}
            className="underline font-bold hover:text-amber-100 flex items-center gap-1 bg-amber-700/80 px-2.5 py-1 rounded text-[11px] cursor-pointer disabled:opacity-60"
          >
            <RotateCcw className={`w-3 h-3 ${attemptSaveState.status === 'saving' ? 'animate-spin' : ''}`} />
            <span>{attemptSaveState.status === 'saving' ? 'Saving...' : 'Retry Save'}</span>
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className={stage === 'test' ? 'flex-1 flex flex-col min-h-0 overflow-hidden' : 'flex-1'}>
        {/* User Dashboard */}
        {stage === 'dashboard' && (
          <UserDashboard
            user={currentUser}
            onStartTest={(testQuestions, settings, title, testId) =>
              handleStartTest(testQuestions, settings, title, testId)
            }
            onStartStudy={handleStartStudy}
            onNavigateToPerformance={() => setStage('performance')}
            onLogout={handleLogout}
          />
        )}

        {/* Performance Dashboard */}
        {stage === 'performance' && (
          <PerformanceDashboard
            onBackToDashboard={() => setStage('dashboard')}
            onRetakeTest={handleRetakeFromTestId}
          />
        )}

        {/* Admin Panel (Admin Only) */}
        {stage === 'admin' && currentUser.isAdmin && (
          <AdminPanel
            user={currentUser}
            onStartTest={(testQuestions, settings, title, testId) =>
              handleStartTest(testQuestions, settings, title, testId)
            }
            onStartStudy={(studyQuestions, title, testId) =>
              handleStartStudy(studyQuestions, title, testId)
            }
          />
        )}

        {/* Active Quiz Practice Taking Screen */}
        {stage === 'test' && questions.length > 0 && (
          <QuizPractice
            questions={questions}
            settings={activeSettings}
            documentName={docMeta?.name || 'Document'}
            testId={activeTestId}
            onFinishTest={handleFinishTest}
            onSwitchToStudy={() => setStage('study')}
            onExitTest={handleExitToDashboard}
          />
        )}

        {/* Interactive Study Mode Screen */}
        {stage === 'study' && questions.length > 0 && (
          <StudyMode
            questions={questions}
            title={docMeta?.name || 'Study Mode'}
            testId={activeTestId}
            onExit={handleExitToDashboard}
            onStartQuiz={(testQuestions, settings, title) =>
              handleStartTest(testQuestions, settings, title, activeTestId)
            }
          />
        )}

        {/* Result Screen */}
        {stage === 'result' && testResult && (
          <ResultScreen
            result={testResult}
            questions={questions}
            questionStates={finalQuestionStates}
            documentName={docMeta?.name || 'Document'}
            testId={activeTestId}
            leaderboard={latestLeaderboard}
            onRetake={handleRetakeCurrentTest}
            onReturnToDashboard={handleExitToDashboard}
            onGenerateNewFromSamePdf={handleExitToDashboard}
            onUploadNew={currentUser.isAdmin ? () => setStage('admin') : handleExitToDashboard}
            onSwitchToStudy={() => setStage('study')}
          />
        )}
      </main>

      {/* Global Raw JSON Inspector */}
      <RawJsonInspector
        questions={questions}
        title={docMeta?.name || 'MCQ Schema'}
        isOpen={showAppJsonInspector}
        onClose={() => setShowAppJsonInspector(false)}
        onLoadCustomQuestions={(customQs, customTitle, mode) => {
          if (mode === 'editor') {
            if (currentUser.isAdmin) {
              setStage('admin');
            } else {
              handleStartStudy(customQs, customTitle, 'custom-json');
            }
          } else if (mode === 'study') {
            handleStartStudy(customQs, customTitle, 'custom-json');
          } else {
            const hasHindiChars = (str?: string) => /[\u0900-\u097F]/.test(str || '');
            const isHindi = customQs.some((q) => hasHindiChars(q.question) || hasHindiChars(q.questionHindi));
            handleStartTest(
              customQs,
              {
                difficulty: 'Medium',
                language: isHindi ? 'Hindi' : 'English',
                durationMinutes: Math.max(5, Math.ceil(customQs.length * 1.5)),
                positiveMarks: 1.0,
                negativeMarks: 0.25,
              },
              customTitle,
              'custom-json'
            );
          }
        }}
      />

      {/* Footer (Hidden during active test) */}
      {stage !== 'test' && (
        <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 py-6 text-xs text-center print:hidden mt-auto">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-200">
                <span className="text-white">Rank</span>
                <span className="text-blue-500">dhara</span>
              </span>
              <span>•</span>
              <span>Practice. Analyse. Rank.</span>
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <span>Firebase Cloud Authentication & Firestore Storage</span>
              <span>•</span>
              <span className="text-emerald-400 font-semibold">Strict Role-Based Security</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
