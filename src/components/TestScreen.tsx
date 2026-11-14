import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  FileText,
  Image as ImageIcon,
  Languages,
  Loader2,
} from 'lucide-react';
import { MCQQuestion, QuestionState, TestSettings, TestResult } from '../types';
import { QuestionPalette } from './QuestionPalette';
import { formatSimpleLatex } from '../utils/mcqSchema';
import { translateQuestionOnDemand } from '../services/cloudStorageService';

interface TestScreenProps {
  questions: MCQQuestion[];
  settings: TestSettings;
  documentName: string;
  onFinishTest: (result: TestResult, finalStates: QuestionState[]) => void;
}

export const TestScreen: React.FC<TestScreenProps> = ({
  questions,
  settings,
  documentName,
  onFinishTest,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Initialize question states for all 10 questions
  const [questionStates, setQuestionStates] = useState<QuestionState[]>(() => {
    return questions.map((_, idx) => ({
      selectedOption: null,
      isMarkedForReview: false,
      isVisited: idx === 0, // first question is visited upon start
      timeSpentSeconds: 0,
    }));
  });

  // Countdown timer in seconds
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    return Math.max(60, settings.durationMinutes * 60);
  });

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showMobilePalette, setShowMobilePalette] = useState(false);
  const [timeWarning, setTimeWarning] = useState<string | null>(null);

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

  // When navigating between questions, if active language isn't available, auto-translate smoothly
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

  const totalTimeAllowedSeconds = settings.durationMinutes * 60;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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
    const score = Math.max(0, Math.round(rawScore * 100) / 100);
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

  // Execute submission
  const executeSubmit = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const result = calculateResult();
    onFinishTest(result, questionStates);
  }, [calculateResult, onFinishTest, questionStates]);

  // Timer Countdown Effect
  useEffect(() => {
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
          // Time expired -> Auto-submit!
          if (timerRef.current) clearInterval(timerRef.current);
          executeSubmit();
          return 0;
        }

        // Warning alerts at 2 minutes
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
  }, [currentIndex, executeSubmit]);

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

    // Automatically navigate to next question if not at end (Testbook UX)
    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1;
      markAsVisited(nextIdx);
      setCurrentIndex(nextIdx);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1;
      markAsVisited(nextIdx);
      setCurrentIndex(nextIdx);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      markAsVisited(prevIdx);
      setCurrentIndex(prevIdx);
    }
  };

  const handleJumpToQuestion = (index: number) => {
    markAsVisited(index);
    setCurrentIndex(index);
    setShowMobilePalette(false);
  };

  // Keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if an input or dialog has focus
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') {
        handleNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'p' || e.key === 'P') {
        handlePrevious();
      } else if (['1', 'a', 'A'].includes(e.key)) {
        handleSelectOption('A');
      } else if (['2', 'b', 'B'].includes(e.key)) {
        handleSelectOption('B');
      } else if (['3', 'c', 'C'].includes(e.key)) {
        handleSelectOption('C');
      } else if (['4', 'd', 'D'].includes(e.key)) {
        handleSelectOption('D');
      } else if (e.key === 'm' || e.key === 'M') {
        handleToggleMarkForReview();
      } else if (e.key === 'c' || e.key === 'C') {
        handleClearResponse();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, questions.length]);

  // Format digital countdown string: MM:SS
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isTimeCritical = secondsRemaining <= 120; // 2 minutes

  // Compute breakdown for submit modal
  let modalAnswered = 0;
  let modalUnanswered = 0;
  let modalMarked = 0;
  let modalNotVisited = 0;

  questionStates.forEach((st) => {
    if (st.selectedOption) modalAnswered++;
    else if (st.isVisited) modalUnanswered++;
    else modalNotVisited++;

    if (st.isMarkedForReview) modalMarked++;
  });

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Testbook CBT Sub-Header */}
      <div className="bg-white border-b border-slate-200 shadow-xs sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
          {/* Section & Question Indicator */}
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-800 text-sm sm:text-base">
              Question {currentIndex + 1}
              <span className="text-slate-400 font-normal text-xs sm:text-sm">
                {' '}
                / {questions.length}
              </span>
            </span>
            <span className="hidden sm:inline-block h-4 w-px bg-slate-200" />
            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
              <span className="text-emerald-700">+{settings.positiveMarks.toFixed(2)}</span>
              <span className="text-slate-300">|</span>
              <span className="text-red-600">-{settings.negativeMarks.toFixed(2)}</span>
            </div>
          </div>

          {/* Center Title */}
          <div className="hidden md:block text-xs font-medium text-slate-500 truncate max-w-sm">
            Section: Full Document Test
          </div>

          {/* Right: Language Toggle & Digital Timer */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Language Toggle: English / Hindi */}
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => handleLanguageChange('English')}
                className={`px-2 py-1 rounded text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  currentLanguage === 'English'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Switch to English"
              >
                <Languages className="w-3 h-3" />
                <span>EN</span>
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('Hindi')}
                className={`px-2 py-1 rounded text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  currentLanguage === 'Hindi'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Switch to Hindi (हिन्दी)"
              >
                <Languages className="w-3 h-3" />
                <span>HI</span>
              </button>
              {isTranslating && (
                <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin ml-1" />
              )}
            </div>

            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono font-bold text-sm sm:text-base tracking-wider transition-colors ${
                isTimeCritical
                  ? 'bg-red-50 border-red-300 text-red-600 animate-pulse'
                  : 'bg-slate-900 border-slate-800 text-white'
              }`}
            >
              <Clock
                className={`w-4 h-4 ${isTimeCritical ? 'text-red-600' : 'text-blue-400'}`}
              />
              <span>{timeFormatted}</span>
            </div>

            {/* Mobile Palette Toggle */}
            <button
              type="button"
              onClick={() => setShowMobilePalette(!showMobilePalette)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              title="Toggle Palette"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Warning Toast if 2 mins remain */}
      {timeWarning && (
        <div className="bg-amber-500 text-slate-950 font-bold text-xs text-center py-1.5 px-4 animate-bounce">
          {timeWarning}
        </div>
      )}

      {/* Main Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Question Box & Action Buttons (8 cols) */}
        <div className="lg:col-span-8 flex flex-col justify-between space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 flex-1 flex flex-col justify-between">
            {/* Top metadata of question */}
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-extrabold text-sm flex items-center justify-center">
                    Q{currentIndex + 1}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Multiple Choice Question
                  </span>

                  {/* View in: English | Hindi */}
                  <div className="flex items-center gap-1.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 ml-1">
                    <span className="text-[11px] font-semibold text-slate-500 pl-1 hidden sm:inline">View in:</span>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange('English')}
                      className={`px-2 py-0.5 text-xs font-bold rounded transition cursor-pointer flex items-center gap-1 ${
                        currentLanguage === 'English'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-blue-600'
                      }`}
                    >
                      <span>English</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange('Hindi')}
                      className={`px-2 py-0.5 text-xs font-bold rounded transition cursor-pointer flex items-center gap-1 ${
                        currentLanguage === 'Hindi'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-blue-600'
                      }`}
                    >
                      <span>हिन्दी</span>
                    </button>
                    {isTranslating && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="hidden sm:inline">Translating...</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {currentQ.examName && (
                    <span className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                      {currentQ.examName}
                    </span>
                  )}
                  {currentQ.year && (
                    <span className="text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                      {currentQ.year}
                    </span>
                  )}
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                      currentQ.type === 'conceptual'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : currentQ.type === 'application'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}
                  >
                    {currentQ.type}
                  </span>
                </div>
              </div>

              {/* Reference Passage / Data / Image Section */}
              {(currentQ.passage || currentQ.data || currentQ.passageData || currentQ.passageImage) && (
                <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>Reference Passage / Data</span>
                  </div>
                  {currentQ.passage && (
                    <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-line font-serif">
                      {formatSimpleLatex(currentQ.passage)}
                    </div>
                  )}
                  {(currentQ.data || currentQ.passageData) && (
                    <div className="text-xs font-mono bg-white p-3 rounded-lg border border-slate-200 overflow-x-auto text-slate-800 whitespace-pre">
                      {formatSimpleLatex(currentQ.data || currentQ.passageData || '')}
                    </div>
                  )}
                  {currentQ.passageImage && (
                    <div className="flex justify-center p-2 bg-white rounded-lg border border-slate-200">
                      <img
                        src={currentQ.passageImage}
                        alt="Reference Graphic"
                        className="max-h-72 object-contain rounded-md"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Question Text (Bilingual support according to active language toggle) */}
              {isTranslating && (
                <div className="flex items-center gap-2 mt-4 mb-2 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg animate-pulse w-fit border border-blue-200">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Translating to {currentLanguage}...</span>
                </div>
              )}
              <div className="mt-5 text-base sm:text-lg font-medium text-slate-900 leading-relaxed select-text">
                {formatSimpleLatex(
                  currentLanguage === 'English'
                    ? currentQ.questionEnglish || currentQ.question
                    : currentQ.questionHindi || currentQ.question
                )}
              </div>

              {/* Options A, B, C, D, E */}
              <div className="mt-6 space-y-3">
                {(['A', 'B', 'C', 'D', 'E'] as const)
                  .filter((optKey) => currentQ.options[optKey] !== undefined && currentQ.options[optKey] !== '')
                  .map((optKey) => {
                    const isSelected = currentState.selectedOption === optKey;
                    const optionText =
                      (currentLanguage === 'English'
                        ? currentQ.optionsEnglish?.[optKey] || currentQ.options[optKey]
                        : currentQ.optionsHindi?.[optKey] || currentQ.options[optKey]) || '';

                    return (
                      <button
                        key={optKey}
                        type="button"
                        onClick={() => handleSelectOption(optKey)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start gap-3.5 group cursor-pointer ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/70 text-slate-900 shadow-sm ring-1 ring-blue-500'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70 text-slate-700'
                        }`}
                      >
                        {/* Option Key Badge */}
                        <span
                          className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 border transition ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-100 text-slate-700 border-slate-300 group-hover:bg-slate-200'
                          }`}
                        >
                          {optKey}
                        </span>
                        <span className="text-sm sm:text-base font-normal pt-0.5 leading-snug flex-1">
                          {formatSimpleLatex(optionText)}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Testbook Style Bottom Action Bar */}
            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              {/* Left Group */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleMarkForReview}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border ${
                    currentState.isMarkedForReview
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50'
                  }`}
                  title="Shortcut: Press [M]"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>
                    {currentState.isMarkedForReview ? 'Marked for Review' : 'Mark for Review'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleClearResponse}
                  disabled={!currentState.selectedOption}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border ${
                    currentState.selectedOption
                      ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                      : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                  }`}
                  title="Shortcut: Press [C]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear Response</span>
                </button>
              </div>

              {/* Right Group: Previous & Save & Next */}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={handlePrevious}
                  disabled={currentIndex === 0}
                  className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 border transition ${
                    currentIndex === 0
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                  title="Shortcut: [Left Arrow] or [P]"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 transition"
                  title="Shortcut: [Right Arrow] or [N]"
                >
                  <span>{currentIndex === questions.length - 1 ? 'Save & Review' : 'Save & Next'}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Desktop Keyboard Hints */}
          <div className="hidden sm:flex items-center justify-between text-[11px] text-slate-500 bg-slate-200/50 px-4 py-2 rounded-xl">
            <span>
              Keyboard navigation: <kbd className="bg-white px-1.5 py-0.5 rounded border">1-4</kbd> or{' '}
              <kbd className="bg-white px-1.5 py-0.5 rounded border">A-D</kbd> Select Option •{' '}
              <kbd className="bg-white px-1.5 py-0.5 rounded border">N</kbd> Next •{' '}
              <kbd className="bg-white px-1.5 py-0.5 rounded border">P</kbd> Prev •{' '}
              <kbd className="bg-white px-1.5 py-0.5 rounded border">M</kbd> Mark •{' '}
              <kbd className="bg-white px-1.5 py-0.5 rounded border">C</kbd> Clear
            </span>
            <span className="text-slate-400">Testbook Engine</span>
          </div>
        </div>

        {/* Right: Question Palette (Desktop view) (4 cols) */}
        <div className="hidden lg:block lg:col-span-4 h-full">
          <div className="sticky top-28 h-[calc(100vh-8.5rem)]">
            <QuestionPalette
              totalQuestions={questions.length}
              currentIndex={currentIndex}
              questionStates={questionStates}
              onSelectQuestion={handleJumpToQuestion}
              onSubmitClick={() => setShowSubmitModal(true)}
            />
          </div>
        </div>
      </div>

      {/* Mobile Palette Drawer / Modal */}
      {showMobilePalette && (
        <div className="fixed inset-0 z-50 lg:hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
          <div className="w-80 max-w-full bg-white h-full shadow-2xl flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-800 text-sm">Question Navigation</span>
              <button
                type="button"
                onClick={() => setShowMobilePalette(false)}
                className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 text-slate-600"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <QuestionPalette
                totalQuestions={questions.length}
                currentIndex={currentIndex}
                questionStates={questionStates}
                onSelectQuestion={handleJumpToQuestion}
                onSubmitClick={() => {
                  setShowMobilePalette(false);
                  setShowSubmitModal(true);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Submit Confirmation Dialog */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-scale-up">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Send className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base">Submit Test Confirmation</h3>
              </div>
              <div className="text-xs font-mono font-bold bg-slate-800 px-2.5 py-1 rounded border border-slate-700">
                {timeFormatted} left
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Please verify your examination summary before final submission:
              </p>

              {/* Summary Stats Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-200">
                  <div className="p-3 bg-slate-50 flex items-center justify-between">
                    <span className="text-slate-600">Total Questions</span>
                    <span className="font-bold text-slate-900">{questions.length}</span>
                  </div>
                  <div className="p-3 bg-emerald-50/50 flex items-center justify-between">
                    <span className="text-emerald-700 font-medium">Answered</span>
                    <span className="font-extrabold text-emerald-700">{modalAnswered}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-200">
                  <div className="p-3 bg-red-50/50 flex items-center justify-between">
                    <span className="text-red-700 font-medium">Not Answered</span>
                    <span className="font-extrabold text-red-700">{modalUnanswered}</span>
                  </div>
                  <div className="p-3 bg-purple-50/50 flex items-center justify-between">
                    <span className="text-purple-700 font-medium">Marked for Review</span>
                    <span className="font-extrabold text-purple-700">{modalMarked}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 flex items-center justify-between">
                  <span className="text-slate-500">Not Visited</span>
                  <span className="font-bold text-slate-700">{modalNotVisited}</span>
                </div>
              </div>

              {modalUnanswered > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    You have {modalUnanswered} unanswered question(s). You still have{' '}
                    <span className="font-bold">{timeFormatted}</span> remaining.
                  </span>
                </div>
              )}

              <p className="text-[11px] text-slate-500 text-center">
                Once submitted, you will immediately receive your scorecard, rank estimate, and
                detailed question-by-question solutions.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition"
              >
                Resume Test
              </button>

              <button
                type="button"
                onClick={executeSubmit}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Submit</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
