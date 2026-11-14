import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  LayoutGrid,
  Send,
  Zap,
  FileJson,
  Pause,
  Play,
  Scissors,
  Search,
  Star,
  Flag,
  Maximize2,
  Minimize2,
  X,
  Languages,
  FileText,
  Loader2,
  Menu,
  LogOut,
  WifiOff,
  Wifi,
} from 'lucide-react';
import { MCQQuestion, QuestionState, TestSettings, TestResult } from '../types';
import { QuestionPalette } from './QuestionPalette';
import { RawJsonInspector } from './RawJsonInspector';
import { formatSimpleLatex } from '../utils/mcqSchema';
import {
  saveBookmark,
  removeBookmark,
  fetchMyBookmarks,
  submitQuestionReport,
  translateQuestionOnDemand,
  saveActiveTestProgress,
  clearActiveTestProgress,
} from '../services/cloudStorageService';

interface QuizPracticeProps {
  questions: MCQQuestion[];
  settings: TestSettings;
  documentName: string;
  testId?: string;
  onFinishTest: (result: TestResult, finalStates: QuestionState[], submissionKey?: string) => void;
  onSwitchToStudy?: () => void;
  onExitTest?: () => void;
}

const ACTIVE_PROGRESS_STORAGE_KEY = 'cbt_active_test_progress';

interface SavedActiveTestProgress {
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

const readSavedTestProgress = (
  expectedTestId: string | undefined,
  expectedTitle: string,
  expectedLength: number
): SavedActiveTestProgress | null => {
  try {
    const raw = localStorage.getItem(ACTIVE_PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedActiveTestProgress;
    if (!parsed || typeof parsed !== 'object') return null;

    const idMatches = Boolean(expectedTestId && parsed.testId && parsed.testId === expectedTestId);
    const titleMatches = !expectedTestId && parsed.testTitle === expectedTitle;
    if (!idMatches && !titleMatches) return null;

    if (!Array.isArray(parsed.questionStates) || parsed.questionStates.length !== expectedLength) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const QuizPractice: React.FC<QuizPracticeProps> = ({
  questions,
  settings,
  documentName,
  testId,
  onFinishTest,
  onSwitchToStudy,
  onExitTest,
}) => {
  const initialSavedProgressRef = useRef<SavedActiveTestProgress | null | undefined>(undefined);
  if (initialSavedProgressRef.current === undefined) {
    initialSavedProgressRef.current = readSavedTestProgress(testId, documentName, questions.length);
  }
  const initialSaved = initialSavedProgressRef.current;

  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (
      initialSaved &&
      typeof initialSaved.currentIndex === 'number' &&
      initialSaved.currentIndex >= 0 &&
      initialSaved.currentIndex < questions.length
    ) {
      return initialSaved.currentIndex;
    }
    return 0;
  });

  // Initialize question states
  const [questionStates, setQuestionStates] = useState<QuestionState[]>(() => {
    if (initialSaved?.questionStates && initialSaved.questionStates.length === questions.length) {
      const startIdx =
        typeof initialSaved.currentIndex === 'number' &&
        initialSaved.currentIndex >= 0 &&
        initialSaved.currentIndex < questions.length
          ? initialSaved.currentIndex
          : 0;
      return initialSaved.questionStates.map((s, idx) => ({
        selectedOption: s?.selectedOption ?? null,
        isMarkedForReview: Boolean(s?.isMarkedForReview),
        isVisited: Boolean(s?.isVisited) || idx === startIdx,
        timeSpentSeconds: typeof s?.timeSpentSeconds === 'number' ? s.timeSpentSeconds : 0,
      }));
    }
    return questions.map((_, idx) => ({
      selectedOption: null,
      isMarkedForReview: false,
      isVisited: idx === 0,
      timeSpentSeconds: 0,
    }));
  });

  // Countdown timer in seconds
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    if (
      initialSaved &&
      typeof initialSaved.secondsRemaining === 'number' &&
      initialSaved.secondsRemaining > 0
    ) {
      return Math.round(initialSaved.secondsRemaining);
    }
    return Math.max(60, settings.durationMinutes * 60);
  });

  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [starredSet, setStarredSet] = useState<Set<number>>(new Set());
  const [showMobilePalette, setShowMobilePalette] = useState(false);
  const [showJsonInspector, setShowJsonInspector] = useState(false);
  const [timeWarning, setTimeWarning] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [reconnectedNotice, setReconnectedNotice] = useState(false);

  const handleToggleStar = () => {
    setStarredSet((prev) => {
      const next = new Set(prev);
      if (next.has(currentIndex)) {
        next.delete(currentIndex);
      } else {
        next.add(currentIndex);
      }
      return next;
    });
  };

  // Language Toggle State: 'English' | 'Hindi'
  const [currentLanguage, setCurrentLanguage] = useState<'Hindi' | 'English'>(() => {
    return settings.language === 'Hindi' ? 'Hindi' : 'English';
  });
  const [isTranslating, setIsTranslating] = useState(false);
  const [, setForceUpdate] = useState(0);

  const handleLanguageChange = useCallback(async (targetLang: 'Hindi' | 'English') => {
    setCurrentLanguage(targetLang);
    const q = questions[currentIndex];
    if (!q) return;

    const hasHindiChars = (str?: string) => /[\u0900-\u097F]/.test(str || '');
    const isMissingHindi = targetLang === 'Hindi' && (!q.questionHindi || !hasHindiChars(q.questionHindi)) && !hasHindiChars(q.question);
    const isMissingEnglish = targetLang === 'English' && (!q.questionEnglish || hasHindiChars(q.questionEnglish)) && hasHindiChars(q.question);

    if (isMissingHindi || isMissingEnglish) {
      setIsTranslating(true);
      try {
        await translateQuestionOnDemand(q, targetLang);
        setForceUpdate((v) => v + 1);
      } finally {
        setIsTranslating(false);
      }
    }
  }, [currentIndex, questions]);

  // When navigating between questions, if active language isn't available on the question, auto-translate smoothly
  useEffect(() => {
    const q = questions[currentIndex];
    if (!q) return;

    const hasHindiChars = (str?: string) => /[\u0900-\u097F]/.test(str || '');
    const isMissingHindi = currentLanguage === 'Hindi' && (!q.questionHindi || !hasHindiChars(q.questionHindi)) && !hasHindiChars(q.question);
    const isMissingEnglish = currentLanguage === 'English' && (!q.questionEnglish || hasHindiChars(q.questionEnglish)) && hasHindiChars(q.question);

    if (isMissingHindi || isMissingEnglish) {
      setIsTranslating(true);
      translateQuestionOnDemand(q, currentLanguage)
        .then(() => setForceUpdate((v) => v + 1))
        .catch(() => {})
        .finally(() => setIsTranslating(false));
    }
  }, [currentIndex, currentLanguage, questions]);

  // Font Size Scaling: 'small' | 'normal' | 'large'
  const [fontLevel, setFontLevel] = useState<'small' | 'normal' | 'large'>('normal');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Bookmarks State
  const [bookmarkedSet, setBookmarkedSet] = useState<Set<number>>(new Set());
  const [bookmarkIdMap, setBookmarkIdMap] = useState<Record<number, string>>({});

  // Question Report Modal State
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<'Typo' | 'Wrong answer' | 'Ambiguous explanation' | 'Other'>('Typo');
  const [reportComment, setReportComment] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccessMsg, setReportSuccessMsg] = useState<string | null>(null);

  // Load initial bookmarks
  useEffect(() => {
    fetchMyBookmarks().then((bms) => {
      const set = new Set<number>();
      const idMap: Record<number, string> = {};
      bms.forEach((b) => {
        const matchesTest = testId && b.testId ? b.testId === testId : b.testTitle === documentName;
        if (matchesTest) {
          const idx = b.questionNumber - 1;
          set.add(idx);
          idMap[idx] = b.id;
        }
      });
      setBookmarkedSet(set);
      setBookmarkIdMap(idMap);
    }).catch(() => {});
  }, [documentName, testId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleToggleBookmark = async () => {
    const q = questions[currentIndex];
    if (!q) return;
    const isBm = bookmarkedSet.has(currentIndex);

    const nextSet = new Set(bookmarkedSet);
    if (isBm) {
      nextSet.delete(currentIndex);
      setBookmarkedSet(nextSet);

      let targetBookmarkId = bookmarkIdMap[currentIndex];
      if (!targetBookmarkId) {
        const bms = await fetchMyBookmarks().catch(() => []);
        const match = bms.find((b) => {
          const matchesTest = testId && b.testId ? b.testId === testId : b.testTitle === documentName;
          return matchesTest && b.questionNumber === currentIndex + 1;
        });
        targetBookmarkId = match?.id || `bm_local_${testId || 'q'}_${currentIndex + 1}`;
      }

      setBookmarkIdMap((prev) => {
        const updated = { ...prev };
        delete updated[currentIndex];
        return updated;
      });
      await removeBookmark(targetBookmarkId);
    } else {
      nextSet.add(currentIndex);
      setBookmarkedSet(nextSet);
      const saved = await saveBookmark({
        testId,
        testTitle: documentName,
        questionNumber: currentIndex + 1,
        question: q,
      });
      if (saved?.id) {
        setBookmarkIdMap((prev) => ({
          ...prev,
          [currentIndex]: saved.id,
        }));
      }
    }
  };

  const handleSubmitReport = async () => {
    const q = questions[currentIndex];
    if (!q) return;
    setIsSubmittingReport(true);
    try {
      await submitQuestionReport({
        testId,
        testTitle: documentName,
        questionNumber: currentIndex + 1,
        questionText: q.question,
        reason: reportReason,
        comment: reportComment,
      });
      setReportSuccessMsg('Report submitted to examination team!');
      setTimeout(() => {
        setShowReportModal(false);
        setReportSuccessMsg(null);
        setReportComment('');
      }, 1200);
    } catch {
      alert('Failed to submit report. Please try again.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Elimination / Strikethrough state per question: Record<questionIndex, Set<'A'|'B'|'C'|'D'>>
  const [eliminatedOptions, setEliminatedOptions] = useState<Record<number, string[]>>(() => {
    if (initialSaved?.eliminatedOptions && typeof initialSaved.eliminatedOptions === 'object') {
      return initialSaved.eliminatedOptions;
    }
    return {};
  });
  const [eliminationMode, setEliminationMode] = useState(false);

  const totalTimeAllowedSeconds = settings.durationMinutes * 60;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasSubmittedRef = useRef(false);
  const submissionKeyRef = useRef(`sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  const lastCloudSyncRef = useRef<number>(0);

  // Helper to mark question as visited when navigating
  const markAsVisited = useCallback((index: number) => {
    setQuestionStates((prev) => {
      const next = [...prev];
      if (next[index] && !next[index].isVisited) {
        next[index] = { ...next[index], isVisited: true };
      }
      return next;
    });
  }, []);

  // Compute test results
  const calculateResult = useCallback((): TestResult => {
    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;

    questions.forEach((q, idx) => {
      const state = questionStates[idx];
      const selected = state?.selectedOption;
      if (!selected) {
        unattemptedCount++;
      } else if (selected === q.correctOption) {
        correctCount++;
      } else {
        incorrectCount++;
      }
    });

    const pos = settings.positiveMarks ?? 1.0;
    const neg = settings.negativeMarks ?? 0.25;

    const rawScore = correctCount * pos - incorrectCount * neg;
    const score = Math.round(rawScore * 100) / 100;
    const maxScore = questions.length * pos;

    const totalAttempted = correctCount + incorrectCount;
    const accuracy =
      totalAttempted > 0
        ? Math.round((correctCount / totalAttempted) * 1000) / 10
        : 0;

    const timeTaken = Math.max(1, totalTimeAllowedSeconds - secondsRemaining);

    return {
      score,
      maxScore,
      correctCount,
      incorrectCount,
      unattemptedCount,
      accuracy,
      timeTakenSeconds: timeTaken,
      markingScheme: {
        positive: pos,
        negative: neg,
      },
    };
  }, [questions, questionStates, settings, secondsRemaining, totalTimeAllowedSeconds]);

  const latestProgressRef = useRef({
    testId,
    documentName,
    currentIndex,
    questionStates,
    secondsRemaining,
    eliminatedOptions,
    totalCount: questions.length,
  });

  latestProgressRef.current = {
    testId,
    documentName,
    currentIndex,
    questionStates,
    secondsRemaining,
    eliminatedOptions,
    totalCount: questions.length,
  };

  const buildProgressSnapshot = useCallback(() => {
    const snap = latestProgressRef.current;
    const answeredCount = snap.questionStates.filter((s) => s.selectedOption !== null).length;
    return {
      testId: snap.testId,
      testTitle: snap.documentName,
      currentIndex: snap.currentIndex,
      answeredCount,
      totalCount: snap.totalCount,
      secondsRemaining: snap.secondsRemaining,
      questionStates: snap.questionStates,
      eliminatedOptions: snap.eliminatedOptions,
      updatedAt: new Date().toISOString(),
    };
  }, []);

  const persistActiveProgress = useCallback(
    (forceCloud = false) => {
      if (hasSubmittedRef.current) return;
      const snapshot = buildProgressSnapshot();
      try {
        localStorage.setItem(ACTIVE_PROGRESS_STORAGE_KEY, JSON.stringify(snapshot));
      } catch {}

      const now = Date.now();
      if (forceCloud || now - lastCloudSyncRef.current >= 10000) {
        lastCloudSyncRef.current = now;
        saveActiveTestProgress(snapshot).catch(() => {});
      }
    },
    [buildProgressSnapshot]
  );

  // Persist immediately on answer/mark/navigation/elimination updates
  const selectionsSignature = useMemo(
    () =>
      questionStates
        .map((s) => `${s.selectedOption || ''}:${s.isMarkedForReview ? 1 : 0}:${s.isVisited ? 1 : 0}`)
        .join('|'),
    [questionStates]
  );

  useEffect(() => {
    persistActiveProgress(false);
  }, [currentIndex, selectionsSignature, eliminatedOptions, persistActiveProgress]);

  // Persist timer progress every 5 seconds and sync to cloud every 10s
  useEffect(() => {
    if (secondsRemaining % 5 === 0) {
      persistActiveProgress(secondsRemaining % 10 === 0);
    }
  }, [secondsRemaining, persistActiveProgress]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      persistActiveProgress(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setReconnectedNotice(false);
    };
    const handleOnline = () => {
      setIsOnline(true);
      persistActiveProgress(true);
      setReconnectedNotice(true);
      setTimeout(() => setReconnectedNotice(false), 3500);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      persistActiveProgress(true);
    };
  }, [persistActiveProgress]);

  // Execute submission (idempotent guard against double-taps)
  const executeSubmit = useCallback(() => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    setIsSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      localStorage.removeItem(ACTIVE_PROGRESS_STORAGE_KEY);
    } catch {}
    clearActiveTestProgress().catch(() => {});
    const result = calculateResult();
    onFinishTest(result, questionStates, submissionKeyRef.current);
  }, [calculateResult, onFinishTest, questionStates]);

  // Timer Countdown Effect
  useEffect(() => {
    if (isTimerPaused) return;

    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        // Track time spent on active question
        setQuestionStates((qPrev) => {
          const next = [...qPrev];
          if (next[currentIndex]) {
            next[currentIndex] = {
              ...next[currentIndex],
              timeSpentSeconds: next[currentIndex].timeSpentSeconds + 1,
            };
          }
          return next;
        });

        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          executeSubmit();
          return 0;
        }

        if (prev === 120) {
          setTimeWarning('2 minutes remaining in the test session!');
          setTimeout(() => setTimeWarning(null), 5000);
        }

        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, executeSubmit, isTimerPaused]);

  // Current question data
  const currentQ = questions[currentIndex] || questions[0];
  const currentState = questionStates[currentIndex] || {
    selectedOption: null,
    isMarkedForReview: false,
    isVisited: true,
    timeSpentSeconds: 0,
  };

  // Actions
  const handleSelectOption = (opt: 'A' | 'B' | 'C' | 'D' | 'E') => {
    if (eliminationMode) {
      // Toggle elimination
      setEliminatedOptions((prev) => {
        const cur = prev[currentIndex] || [];
        const next = cur.includes(opt)
          ? cur.filter((x) => x !== opt)
          : [...cur, opt];
        return { ...prev, [currentIndex]: next };
      });
      return;
    }

    setQuestionStates((prev) => {
      const next = [...prev];
      next[currentIndex] = {
        ...next[currentIndex],
        selectedOption: opt,
        isVisited: true,
      };
      return next;
    });
  };

  const handleClearResponse = () => {
    setQuestionStates((prev) => {
      const next = [...prev];
      next[currentIndex] = {
        ...next[currentIndex],
        selectedOption: null,
      };
      return next;
    });
  };

  const handleToggleMarkForReview = () => {
    setQuestionStates((prev) => {
      const next = [...prev];
      const currentlyMarked = next[currentIndex].isMarkedForReview;
      next[currentIndex] = {
        ...next[currentIndex],
        isMarkedForReview: !currentlyMarked,
        isVisited: true,
      };
      return next;
    });
  };

  const handleNavigateQuestion = (index: number) => {
    if (index >= 0 && index < questions.length) {
      markAsVisited(index);
      setCurrentIndex(index);
      setShowMobilePalette(false);
    }
  };

  const handleSaveAndNext = () => {
    if (currentIndex < questions.length - 1) {
      handleNavigateQuestion(currentIndex + 1);
    } else {
      setShowSubmitModal(true);
    }
  };

  const handleMarkForReviewAndNext = () => {
    // Mark for review
    setQuestionStates((prev) => {
      const next = [...prev];
      next[currentIndex] = {
        ...next[currentIndex],
        isMarkedForReview: true,
        isVisited: true,
      };
      return next;
    });
    if (currentIndex < questions.length - 1) {
      handleNavigateQuestion(currentIndex + 1);
    } else {
      setShowSubmitModal(true);
    }
  };

  // Format Total Timer as HH:MM:SS (e.g. 00:11:58)
  const formatTotalTimer = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Format per-question time (MM:SS, e.g. 00:01)
  const formatPerQuestionTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentEliminated = eliminatedOptions[currentIndex] || [];

  // Question text with instantaneous language toggle & fallback (no blank area)
  const rawQText =
    currentLanguage === 'English'
      ? currentQ.questionEnglish || currentQ.question
      : currentQ.questionHindi || currentQ.question;
  const qLen = (rawQText || '').length;

  const qFontSizeClass =
    qLen > 240
      ? 'text-[15.5px] sm:text-[17px] leading-[1.35]'
      : qLen > 140
      ? 'text-[17px] sm:text-[18.5px] leading-[1.38]'
      : 'text-[18px] sm:text-[20px] leading-[1.4]';

  const availableOptions = (['A', 'B', 'C', 'D', 'E'] as const).filter(
    (optKey) => currentQ.options[optKey] !== undefined && currentQ.options[optKey] !== ''
  );

  const maxOptionLength = Math.max(
    ...availableOptions.map((k) => {
      const text =
        currentLanguage === 'English'
          ? currentQ.optionsEnglish?.[k] || currentQ.options[k]
          : currentQ.optionsHindi?.[k] || currentQ.options[k];
      return (text || '').length;
    }),
    0
  );

  const optFontSizeClass =
    maxOptionLength > 75
      ? 'text-[14px] sm:text-[15px] leading-tight'
      : maxOptionLength > 45
      ? 'text-[15.5px] sm:text-[16px] leading-tight'
      : 'text-[16.5px] sm:text-[17px] leading-snug';

  return (
    <div className="h-[100dvh] max-h-[100dvh] flex-1 flex flex-col bg-white dark:bg-slate-950 overflow-hidden select-none">
      {/* 1. HEADER (one dark row, ~56px, bg #1a1d23) */}
      <header className="h-14 bg-[#1a1d23] text-white px-3 sm:px-4 flex items-center justify-between shrink-0 z-30 shadow-xs border-b border-slate-800">
        {/* Left: pause button in a circle + 2 lines: total timer & test name */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setIsTimerPaused(!isTimerPaused)}
            className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700/80 flex items-center justify-center text-slate-200 hover:text-white transition cursor-pointer shrink-0"
            title={isTimerPaused ? 'Resume test' : 'Pause test'}
          >
            {isTimerPaused ? (
              <Play className="w-4 h-4 fill-current ml-0.5 text-amber-400" />
            ) : (
              <Pause className="w-4 h-4" />
            )}
          </button>

          <div className="flex flex-col min-w-0">
            <span className="text-[19px] sm:text-[20px] font-bold font-mono text-white leading-tight tracking-tight">
              {formatTotalTimer(secondsRemaining)}
            </span>
            <span className="text-xs sm:text-[13px] text-slate-400 truncate max-w-[170px] sm:max-w-xs font-normal leading-none mt-0.5">
              {documentName || 'Test Session'}
            </span>
          </div>
        </div>

        {/* Right: language toggle icon (E|अ) and hamburger icon */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Language Toggle Chip E|अ */}
          <button
            type="button"
            onClick={() => handleLanguageChange(currentLanguage === 'English' ? 'Hindi' : 'English')}
            className="h-8 px-2.5 rounded-lg border border-slate-700 bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold flex items-center gap-1 transition cursor-pointer select-none"
            title={`Language: ${currentLanguage}. Tap to toggle English / हिन्दी.`}
          >
            <span className={currentLanguage === 'English' ? 'text-blue-400 font-extrabold' : 'text-slate-400'}>E</span>
            <span className="text-slate-500">|</span>
            <span className={currentLanguage === 'Hindi' ? 'text-blue-400 font-extrabold' : 'text-slate-400'}>अ</span>
          </button>

          {/* Hamburger icon (opens Question Palette, Exit Test, and Submit Test) */}
          <button
            type="button"
            onClick={() => setShowMobilePalette(true)}
            className="w-9 h-9 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-200 hover:text-white transition cursor-pointer shrink-0"
            title="Open Question Palette & Test Actions"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {!isOnline && (
        <div className="bg-amber-600 text-white text-[11px] sm:text-xs font-semibold px-3 py-1.5 flex items-center justify-center gap-2 shrink-0 z-20">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Connection lost — answers are safely saved on this device and will sync automatically when online.</span>
        </div>
      )}

      {isOnline && reconnectedNotice && (
        <div className="bg-emerald-600 text-white text-[11px] sm:text-xs font-semibold px-3 py-1.5 flex items-center justify-center gap-2 shrink-0 z-20">
          <Wifi className="w-3.5 h-3.5 shrink-0" />
          <span>Back online — test progress synced to your account.</span>
        </div>
      )}

      {/* 2. QUESTION INFO ROW (one row, white bg) */}
      <div className="h-10 sm:h-11 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3.5 sm:px-4 flex items-center justify-between shrink-0 z-20">
        {/* Left: Round grey badge with question number, thin vertical divider, per-question timer, marks chips */}
        <div className="flex items-center gap-2">
          {/* Round grey badge with question number e.g. "1" */}
          <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center shrink-0">
            {currentIndex + 1}
          </div>

          {/* Thin vertical divider */}
          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 shrink-0 mx-1" />

          {/* Per-question timer: clock icon + 00:01, light grey */}
          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{formatPerQuestionTime(currentState.timeSpentSeconds || 0)}</span>
          </div>

          {/* Marking scheme chips */}
          <div className="flex items-center gap-1 ml-1 sm:ml-2">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
              +{settings.positiveMarks > 0 ? settings.positiveMarks : 1}
            </span>
            <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800">
              -{settings.negativeMarks > 0 ? settings.negativeMarks : 0.25}
            </span>
          </div>
        </div>

        {/* Far right: report (flag/warning) icon, bookmark icon, star icon. All small, light grey. */}
        <div className="flex items-center gap-2 text-slate-400">
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="p-1 rounded hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Report question"
          >
            <Flag className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleToggleBookmark}
            className={`p-1 rounded transition cursor-pointer ${
              bookmarkedSet.has(currentIndex)
                ? 'text-purple-600'
                : 'hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Bookmark question"
          >
            <Bookmark className={`w-4 h-4 ${bookmarkedSet.has(currentIndex) ? 'fill-current' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleToggleStar}
            className={`p-1 rounded transition cursor-pointer ${
              starredSet.has(currentIndex)
                ? 'text-amber-500'
                : 'hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Star question"
          >
            <Star className={`w-4 h-4 ${starredSet.has(currentIndex) ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row max-w-7xl mx-auto w-full overflow-hidden relative">
        {/* Pause Test Overlay */}
        {isTimerPaused && (
          <div className="absolute inset-0 z-30 bg-slate-900/90 backdrop-blur-sm p-4 flex flex-col items-center justify-center text-center text-white animate-fade-in">
            <Pause className="w-10 h-10 text-amber-400 mb-2 animate-bounce" />
            <h3 className="text-lg font-black mb-1">Examination Paused</h3>
            <p className="text-xs text-slate-300 mb-4 max-w-xs">
              The timer is paused. Click Resume when you are ready to continue.
            </p>
            <button
              type="button"
              onClick={() => setIsTimerPaused(false)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume Test</span>
            </button>
          </div>
        )}

        {/* Question Text & Options Column */}
        <div className="flex-1 min-h-0 flex flex-col justify-between bg-white dark:bg-slate-900 overflow-y-auto sm:overflow-visible">
          <div>
            {/* Reference Passage / Data / Image Section (if present) */}
            {(currentQ.passage || currentQ.data || currentQ.passageData || currentQ.passageImage) && (
              <div className="mx-4 mt-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5 max-h-24 sm:max-h-36 overflow-y-auto">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <FileText className="w-3 h-3 text-blue-600" />
                  <span>Reference Passage</span>
                </div>
                {currentQ.passage && (
                  <div className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line font-serif">
                    {formatSimpleLatex(currentQ.passage)}
                  </div>
                )}
                {(currentQ.data || currentQ.passageData) && (
                  <div className="text-[11px] font-mono bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700 overflow-x-auto text-slate-800 dark:text-slate-200 whitespace-pre">
                    {formatSimpleLatex(currentQ.data || currentQ.passageData || '')}
                  </div>
                )}
                {currentQ.passageImage && (
                  <div className="flex justify-center p-1 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                    <img
                      src={currentQ.passageImage}
                      alt="Reference Graphic"
                      className="max-h-28 object-contain rounded"
                    />
                  </div>
                )}
              </div>
            )}

            {/* 3. QUESTION TEXT: 18-20px, left aligned, 16px side padding, directly below info row */}
            <h2 className={`font-semibold text-slate-900 dark:text-slate-100 text-left px-4 pt-3 pb-2 ${qFontSizeClass}`}>
              {formatSimpleLatex(rawQText)}
            </h2>

            {/* 4. OPTIONS: 4 full-width cards, 1px light-grey border, 10px radius, 12px gap */}
            <div className="flex flex-col gap-3 px-4 pt-1 pb-3 shrink-0">
              {availableOptions.map((optKey, idx) => {
                const optText =
                  (currentLanguage === 'English'
                    ? currentQ.optionsEnglish?.[optKey] || currentQ.options[optKey]
                    : currentQ.optionsHindi?.[optKey] || currentQ.options[optKey]) || '';
                const isSelected = currentState.selectedOption === optKey;
                const isEliminated = currentEliminated.includes(optKey);

                return (
                  <button
                    key={optKey}
                    type="button"
                    onClick={() => handleSelectOption(optKey)}
                    className={`w-full text-left min-h-[46px] sm:min-h-[50px] px-3.5 py-2.5 rounded-[10px] transition-all flex items-center cursor-pointer group shrink-0 ${
                      isEliminated
                        ? 'opacity-40 line-through bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800'
                        : isSelected
                        ? 'border-2 border-[#2563eb] bg-[#eff6ff] dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 shadow-xs'
                        : 'border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <span className="text-slate-400 italic font-serif text-[15px] mr-2.5 shrink-0 select-none">
                      {idx + 1}.
                    </span>
                    <span className={`flex-1 font-normal ${optFontSizeClass}`}>
                      {formatSimpleLatex(optText)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Palette & Legend (Desktop only) */}
        <div className="hidden lg:block w-80 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <QuestionPalette
            totalQuestions={questions.length}
            questionStates={questionStates}
            currentIndex={currentIndex}
            onSelectQuestion={handleNavigateQuestion}
            onSubmitClick={() => setShowSubmitModal(true)}
          />
        </div>
      </div>

      {/* 5. BOTTOM BAR (fixed): Row of buttons, 48px tall, 8px gap */}
      <footer className="h-12 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-3 flex items-center gap-2 shrink-0 z-30">
        {/* Prev button: small ‹ icon button */}
        <button
          type="button"
          disabled={currentIndex === 0}
          onClick={() => handleNavigateQuestion(currentIndex - 1)}
          className="h-10 w-10 sm:w-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shrink-0 transition cursor-pointer"
          title="Previous Question"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Mark & Next button: outlined */}
        <button
          type="button"
          onClick={handleMarkForReviewAndNext}
          className="h-10 px-2.5 sm:px-3 rounded-lg border border-purple-500 text-purple-600 dark:text-purple-400 bg-white dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-purple-950/40 font-semibold text-xs sm:text-sm whitespace-nowrap transition cursor-pointer shrink-0"
          title="Mark for Review and Move to Next"
        >
          Mark & Next
        </button>

        {/* Clear button: outlined */}
        <button
          type="button"
          onClick={handleClearResponse}
          disabled={!currentState.selectedOption}
          className="h-10 px-2.5 sm:px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-35 disabled:cursor-not-allowed font-semibold text-xs sm:text-sm whitespace-nowrap transition cursor-pointer shrink-0"
          title="Clear chosen option"
        >
          Clear
        </button>

        {/* Save & Next button: solid blue #3b82f6, widest */}
        <button
          type="button"
          onClick={handleSaveAndNext}
          className="flex-1 h-10 px-3 rounded-lg bg-[#3b82f6] hover:bg-blue-600 text-white font-bold text-xs sm:text-sm whitespace-nowrap shadow-xs flex items-center justify-center transition cursor-pointer"
          title={currentIndex === questions.length - 1 ? 'Save and Submit' : 'Save and Next'}
        >
          <span>Save & Next</span>
        </button>
      </footer>

      {/* Hamburger Question Palette Modal / Bottom Sheet */}
      {showMobilePalette && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div
            className="fixed inset-0"
            onClick={() => setShowMobilePalette(false)}
          />
          <div className="relative z-10 bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200 overflow-hidden">
            {/* Sheet Header */}
            <div className="flex items-center justify-between p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Question Palette & Test Menu
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMobilePalette(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Question Palette Body */}
            <div className="flex-1 overflow-y-auto">
              <QuestionPalette
                totalQuestions={questions.length}
                questionStates={questionStates}
                currentIndex={currentIndex}
                onSelectQuestion={(idx) => {
                  handleNavigateQuestion(idx);
                  setShowMobilePalette(false);
                }}
                onSubmitClick={() => {
                  setShowMobilePalette(false);
                  setShowSubmitModal(true);
                }}
              />
            </div>

            {/* Sheet Actions: Exit Test & Submit Test */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
              {onExitTest && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMobilePalette(false);
                    setShowExitModal(true);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Exit Test</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowMobilePalette(false);
                  setShowSubmitModal(true);
                }}
                className="flex-1 py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Test</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit Test Confirmation Modal */}
      {showExitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2">
              Exit Examination?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              Are you sure you want to exit? Your answers in this session will not be submitted.
            </p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowExitModal(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  persistActiveProgress(true);
                  setShowExitModal(false);
                  onExitTest?.();
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition shadow-xs cursor-pointer"
              >
                Yes, Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Question Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Flag className="w-4 h-4 text-rose-500" />
                <span>Report Question #{currentIndex + 1}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {reportSuccessMsg ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl text-center">
                {reportSuccessMsg}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Select Issue Reason
                  </label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value as any)}
                    className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl p-2.5 font-medium"
                  >
                    <option value="Typo">Typo / Spelling Error</option>
                    <option value="Wrong answer">Incorrect Answer Key</option>
                    <option value="Ambiguous explanation">Ambiguous Explanation</option>
                    <option value="Other">Other Problem</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Optional Details / Comment
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Describe what is wrong with this question..."
                    value={reportComment}
                    onChange={(e) => setReportComment(e.target.value)}
                    className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl p-2.5 focus:outline-hidden"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingReport}
                    onClick={handleSubmitReport}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingReport ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Raw JSON Inspector Modal */}
      <RawJsonInspector
        questions={questions}
        title={documentName}
        isOpen={showJsonInspector}
        onClose={() => setShowJsonInspector(false)}
      />

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 mb-2">
              Ready to submit your quiz?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              You will receive your detailed score card, question analysis, and answer explanations.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6 text-center text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Answered</span>
                <span className="text-lg font-black text-emerald-600">
                  {questionStates.filter((s) => s.selectedOption !== null).length} / {questions.length}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Remaining Time</span>
                <span className="text-lg font-black text-blue-600">
                  {formatTime(secondsRemaining)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer disabled:opacity-50"
              >
                Continue Quiz
              </button>
              <button
                type="button"
                onClick={executeSubmit}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-xs shadow-emerald-500/20 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? 'Submitting...' : 'Yes, Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
