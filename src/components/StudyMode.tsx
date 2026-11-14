import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Play,
  FileJson,
  Layers,
  ArrowRight,
  Check,
  Zap,
  Printer,
  Star,
  Flag,
  X,
  Languages,
  Loader2,
} from 'lucide-react';
import { MCQQuestion, TestSettings } from '../types';
import { SearchFilterBar, FilterCriteria } from './SearchFilterBar';
import { RawJsonInspector } from './RawJsonInspector';
import {
  saveBookmark,
  removeBookmark,
  fetchMyBookmarks,
  submitQuestionReport,
  translateQuestionOnDemand,
} from '../services/cloudStorageService';

interface StudyModeProps {
  questions: MCQQuestion[];
  title: string;
  testId?: string;
  onExit: () => void;
  onStartQuiz: (questions: MCQQuestion[], settings: TestSettings, title: string) => void;
}

export const StudyMode: React.FC<StudyModeProps> = ({
  questions,
  title,
  testId,
  onExit,
  onStartQuiz,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // User selections per question in study mode
  const [userAnswers, setUserAnswers] = useState<Record<number, 'A' | 'B' | 'C' | 'D' | null>>({});
  // Explicitly revealed answers per question
  const [revealedQuestions, setRevealedQuestions] = useState<Record<number, boolean>>({});
  // Bookmarked question indices and server IDs
  const [bookmarkedSet, setBookmarkedSet] = useState<Set<number>>(() => new Set());
  const [bookmarkIdMap, setBookmarkIdMap] = useState<Record<number, string>>({});
  // Flashcard mode toggle
  const [isFlashcardView, setIsFlashcardView] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);

  // Raw JSON Inspector modal state
  const [showJsonInspector, setShowJsonInspector] = useState(false);

  // Language Toggle State: 'English' | 'Hindi'
  const [currentLanguage, setCurrentLanguage] = useState<'Hindi' | 'English'>('English');
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

  // Filters
  const [filters, setFilters] = useState<FilterCriteria>({
    searchQuery: '',
    difficulty: 'All',
    status: 'All',
  });

  // Filtered Questions mapping
  const filteredIndices = useMemo(() => {
    return questions
      .map((q, idx) => {
        const query = filters.searchQuery.toLowerCase().trim();
        const matchesQuery =
          !query ||
          q.question.toLowerCase().includes(query) ||
          q.options.A.toLowerCase().includes(query) ||
          q.options.B.toLowerCase().includes(query) ||
          q.options.C.toLowerCase().includes(query) ||
          q.options.D.toLowerCase().includes(query) ||
          q.explanation.toLowerCase().includes(query);

        const isBookmarked = bookmarkedSet.has(idx);
        const answered = userAnswers[idx];
        const isCorrect = answered === q.correctOption;
        const isIncorrect = answered && !isCorrect;

        let matchesStatus = true;
        if (filters.status === 'Bookmarked') matchesStatus = isBookmarked;
        else if (filters.status === 'Answered') matchesStatus = !!answered;
        else if (filters.status === 'Unanswered') matchesStatus = !answered;
        else if (filters.status === 'Correct') matchesStatus = isCorrect;
        else if (filters.status === 'Incorrect') matchesStatus = !!isIncorrect;

        return matchesQuery && matchesStatus ? idx : -1;
      })
      .filter((idx) => idx !== -1);
  }, [questions, filters, bookmarkedSet, userAnswers]);

  // Adjust current index if out of bounds after filtering
  useEffect(() => {
    if (filteredIndices.length > 0 && !filteredIndices.includes(currentIndex)) {
      setCurrentIndex(filteredIndices[0]);
    }
  }, [filteredIndices, currentIndex]);

  const activeQuestion = questions[currentIndex] || questions[0];
  const currentAnswer = userAnswers[currentIndex] || null;
  const isRevealed = revealedQuestions[currentIndex] || !!currentAnswer;
  const isBookmarked = bookmarkedSet.has(currentIndex);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        goToNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        goToPrevious();
      } else if (e.key === ' ' || e.key === 'Enter') {
        if (isFlashcardView) {
          setIsFlipped((prev) => !prev);
        }
      } else if (['1', 'a', 'A'].includes(e.key)) {
        handleOptionSelect('A');
      } else if (['2', 'b', 'B'].includes(e.key)) {
        handleOptionSelect('B');
      } else if (['3', 'c', 'C'].includes(e.key)) {
        handleOptionSelect('C');
      } else if (['4', 'd', 'D'].includes(e.key)) {
        handleOptionSelect('D');
      }
    },
    [currentIndex, filteredIndices, isFlashcardView]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleOptionSelect = (opt: 'A' | 'B' | 'C' | 'D') => {
    setUserAnswers((prev) => ({
      ...prev,
      [currentIndex]: opt,
    }));
    setRevealedQuestions((prev) => ({
      ...prev,
      [currentIndex]: true,
    }));
  };

  const handleToggleReveal = () => {
    setRevealedQuestions((prev) => ({
      ...prev,
      [currentIndex]: !prev[currentIndex],
    }));
  };

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
        const matchesTest = testId && b.testId ? b.testId === testId : b.testTitle === title;
        if (matchesTest) {
          const idx = b.questionNumber - 1;
          set.add(idx);
          idMap[idx] = b.id;
        }
      });
      setBookmarkedSet(set);
      setBookmarkIdMap(idMap);
    }).catch(() => {});
  }, [title, testId]);

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
          const matchesTest = testId && b.testId ? b.testId === testId : b.testTitle === title;
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
        testTitle: title,
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
        testTitle: title,
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

  const goToPrevious = () => {
    const currentPos = filteredIndices.indexOf(currentIndex);
    if (currentPos > 0) {
      setCurrentIndex(filteredIndices[currentPos - 1]);
      setIsFlipped(false);
    }
  };

  const goToNext = () => {
    const currentPos = filteredIndices.indexOf(currentIndex);
    if (currentPos !== -1 && currentPos < filteredIndices.length - 1) {
      setCurrentIndex(filteredIndices[currentPos + 1]);
      setIsFlipped(false);
    }
  };

  const handleStartQuizFromStudy = () => {
    const defaultSettings: TestSettings = {
      difficulty: 'Medium',
      language: 'English',
      durationMinutes: Math.max(5, Math.ceil(questions.length * 1.5)),
      positiveMarks: 1.0,
      negativeMarks: 0.25,
    };
    onStartQuiz(questions, defaultSettings, `${title} (Practice Quiz)`);
  };

  // Stats
  const answeredCount = Object.keys(userAnswers).length;
  const correctCount = Object.entries(userAnswers).filter(
    ([idxStr, ans]) => questions[parseInt(idxStr, 10)]?.correctOption === ans
  ).length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 font-sans">
      {/* Top Banner & Mode Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 mb-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full">
                Interactive Study Mode
              </span>
              <span className="text-xs text-slate-400">• Self-Paced Learning</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight mt-0.5">
              {title}
            </h1>
          </div>
        </div>

        {/* Quick Mode Controls */}
        <div className="flex items-center flex-wrap gap-2 w-full md:w-auto justify-end">
          {/* Language Toggle: English | Hindi */}
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => handleLanguageChange('English')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                currentLanguage === 'English'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="Switch to English"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>EN</span>
            </button>
            <button
              type="button"
              onClick={() => handleLanguageChange('Hindi')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                currentLanguage === 'Hindi'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="Switch to Hindi (हिन्दी)"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>HI</span>
            </button>
            {isTranslating && (
              <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin ml-1" />
            )}
          </div>

          {/* Flashcard Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsFlashcardView(!isFlashcardView);
              setIsFlipped(false);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
              isFlashcardView
                ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-transparent hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isFlashcardView ? 'Flashcard Active' : 'Flashcard Mode'}</span>
          </button>

          {/* Requirement 5: Export PDF / Print Solutions */}
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-700 flex items-center gap-1.5 transition cursor-pointer print:hidden"
            title="Export PDF / Print Solutions"
          >
            <Printer className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export PDF / Print Solutions</span>
          </button>

          {/* Launch Quiz Practice */}
          <button
            type="button"
            onClick={handleStartQuizFromStudy}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition shadow-xs shadow-blue-500/20 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Practice CBT Quiz</span>
          </button>

          {/* Exit */}
          <button
            type="button"
            onClick={onExit}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 transition cursor-pointer"
          >
            Exit
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <SearchFilterBar
        filters={filters}
        onFilterChange={setFilters}
        totalCount={questions.length}
        filteredCount={filteredIndices.length}
        availableStatuses={['All', 'Bookmarked', 'Answered', 'Unanswered', 'Correct', 'Incorrect']}
        placeholder="Filter study questions by topic, keyword, or option..."
        className="mb-6"
      />

      {/* Main Question Display Area */}
      {filteredIndices.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center text-slate-500">
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">
            No matching questions found
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Try adjusting your search query or status filter to see more study material.
          </p>
        </div>
      ) : isFlashcardView ? (
        /* Flashcard View Mode */
        <div className="space-y-6">
          <div
            onClick={() => setIsFlipped(!isFlipped)}
            className="bg-white dark:bg-slate-900 border-2 border-indigo-200 dark:border-indigo-900/60 hover:border-indigo-400 rounded-3xl p-8 sm:p-12 min-h-[360px] flex flex-col justify-between shadow-lg cursor-pointer transition transform duration-200 select-none relative"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 mb-4">
              <span className="font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                Question {currentIndex + 1} of {questions.length} • Click to Flip
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleBookmark();
                }}
                className={`p-2 rounded-xl transition ${
                  isBookmarked
                    ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/50'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {isBookmarked ? <BookmarkCheck className="w-5 h-5 fill-current" /> : <Bookmark className="w-5 h-5" />}
              </button>
            </div>

            <div className="my-auto text-center">
              {!isFlipped ? (
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">
                    Front / Prompt
                  </span>
                  <p className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
                    {currentLanguage === 'English'
                      ? activeQuestion.questionEnglish || activeQuestion.question
                      : activeQuestion.questionHindi || activeQuestion.question}
                  </p>
                </div>
              ) : (
                <div className="animate-in fade-in zoom-in-95 duration-200">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest block mb-2">
                    Back / Correct Answer & Explanation
                  </span>
                  <div className="inline-block px-4 py-2 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl mb-4 text-emerald-800 dark:text-emerald-200 font-black text-base sm:text-lg">
                    Option {activeQuestion.correctOption}:{' '}
                    {(currentLanguage === 'English'
                      ? activeQuestion.optionsEnglish?.[activeQuestion.correctOption as 'A' | 'B' | 'C' | 'D'] || activeQuestion.options[activeQuestion.correctOption as 'A' | 'B' | 'C' | 'D']
                      : activeQuestion.optionsHindi?.[activeQuestion.correctOption as 'A' | 'B' | 'C' | 'D'] || activeQuestion.options[activeQuestion.correctOption as 'A' | 'B' | 'C' | 'D']) || ''}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xl mx-auto leading-relaxed">
                    {activeQuestion.explanation}
                  </p>
                </div>
              )}
            </div>

            <div className="text-center text-xs text-slate-400 pt-4 border-t border-slate-100 dark:border-slate-800">
              Press <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono text-[10px]">Space</kbd> or click anywhere to flip
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={filteredIndices.indexOf(currentIndex) <= 0}
              onClick={goToPrevious}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous Card</span>
            </button>

            <span className="text-xs font-bold text-slate-400">
              Card {filteredIndices.indexOf(currentIndex) + 1} of {filteredIndices.length}
            </span>

            <button
              type="button"
              disabled={filteredIndices.indexOf(currentIndex) >= filteredIndices.length - 1}
              onClick={goToNext}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition cursor-pointer"
            >
              <span>Next Card</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Standard Interactive Study Mode */
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs">
            {/* Question Header */}
            <div className="flex items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                  {currentIndex + 1}
                </span>
                <span className="text-xs font-bold text-slate-400">
                  Question {currentIndex + 1} of {questions.length}
                </span>
                {activeQuestion.sourcePages && (
                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                    {activeQuestion.sourcePages}
                  </span>
                )}

                {/* View in: English | Hindi */}
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 ml-1">
                  <span className="text-[11px] font-semibold text-slate-500 pl-1 hidden sm:inline">View in:</span>
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('English')}
                    className={`px-2 py-0.5 text-xs font-bold rounded transition cursor-pointer flex items-center gap-1 ${
                      currentLanguage === 'English'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-blue-600'
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
                        : 'text-slate-600 dark:text-slate-400 hover:text-blue-600'
                    }`}
                  >
                    <span>हिन्दी</span>
                  </button>
                  {isTranslating && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/70 px-1.5 py-0.5 rounded-md animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="hidden sm:inline">Translating...</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleReveal}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                  title="Toggle answer and explanation"
                >
                  {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{isRevealed ? 'Hide Answer' : 'Show Answer'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleBookmark}
                  className={`p-2 rounded-xl border transition cursor-pointer flex items-center gap-1 text-xs font-bold ${
                    isBookmarked
                      ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800'
                  }`}
                  title={isBookmarked ? 'Remove Bookmark' : 'Bookmark Question'}
                >
                  <Star className={`w-4 h-4 ${isBookmarked ? 'fill-amber-500 text-amber-500' : ''}`} />
                  <span className="hidden sm:inline">{isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowReportModal(true)}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                  title="Report question error"
                >
                  <Flag className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Question Text */}
            {isTranslating && (
              <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950/60 px-3 py-1.5 rounded-lg animate-pulse w-fit border border-blue-200 dark:border-blue-800">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Translating to {currentLanguage}...</span>
              </div>
            )}
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-relaxed mb-6">
              {currentLanguage === 'English'
                ? activeQuestion.questionEnglish || activeQuestion.question
                : activeQuestion.questionHindi || activeQuestion.question}
            </h2>

            {/* Options List */}
            <div className="space-y-3">
              {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                const optText =
                  (currentLanguage === 'English'
                    ? activeQuestion.optionsEnglish?.[optKey] || activeQuestion.options[optKey]
                    : activeQuestion.optionsHindi?.[optKey] || activeQuestion.options[optKey]) || '';
                const isSelected = currentAnswer === optKey;
                const isCorrectChoice = activeQuestion.correctOption === optKey;

                // Color styling depending on whether revealed/selected
                let optionClasses =
                  'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800';

                if (isRevealed) {
                  if (isCorrectChoice) {
                    optionClasses =
                      'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/30';
                  } else if (isSelected && !isCorrectChoice) {
                    optionClasses =
                      'border-rose-400 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-100';
                  }
                } else if (isSelected) {
                  optionClasses =
                    'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-100 ring-2 ring-blue-500/30';
                }

                return (
                  <button
                    key={optKey}
                    type="button"
                    onClick={() => handleOptionSelect(optKey)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer group ${optionClasses}`}
                  >
                    <span
                      className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 transition ${
                        isRevealed && isCorrectChoice
                          ? 'bg-emerald-600 text-white'
                          : isRevealed && isSelected && !isCorrectChoice
                          ? 'bg-rose-600 text-white'
                          : isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 group-hover:border-blue-400'
                      }`}
                    >
                      {optKey}
                    </span>

                    <span className="flex-1 text-sm font-medium pt-0.5 leading-snug">
                      {optText}
                    </span>

                    {/* Status Icon */}
                    {isRevealed && isCorrectChoice && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 self-center" />
                    )}
                    {isRevealed && isSelected && !isCorrectChoice && (
                      <XCircle className="w-5 h-5 text-rose-600 shrink-0 self-center" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Explanation Drawer if Revealed */}
            {isRevealed && (
              <div className="mt-6 p-5 rounded-2xl bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-slate-800/80 dark:to-indigo-950/30 border border-blue-200/80 dark:border-slate-700 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-300 font-bold text-xs uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>Comprehensive Explanation & Analysis</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {activeQuestion.explanation}
                </p>
              </div>
            )}
          </div>

          {/* Bottom Navigation & Palette Strip */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            {/* Quick question palette pills */}
            <div className="flex items-center flex-wrap gap-1.5 overflow-x-auto max-w-full">
              {filteredIndices.map((qIdx, order) => {
                const ans = userAnswers[qIdx];
                const isCur = qIdx === currentIndex;
                const isCor = ans === questions[qIdx]?.correctOption;

                let pillColor = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
                if (ans) {
                  pillColor = isCor
                    ? 'bg-emerald-500 text-white'
                    : 'bg-rose-500 text-white';
                }

                return (
                  <button
                    key={qIdx}
                    type="button"
                    onClick={() => setCurrentIndex(qIdx)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${pillColor} ${
                      isCur ? 'ring-2 ring-blue-500 ring-offset-1 font-black scale-105' : ''
                    }`}
                  >
                    {qIdx + 1}
                  </button>
                );
              })}
            </div>

            {/* Next / Prev buttons */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                disabled={filteredIndices.indexOf(currentIndex) <= 0}
                onClick={goToPrevious}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 disabled:opacity-40 transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev</span>
              </button>

              <button
                type="button"
                disabled={filteredIndices.indexOf(currentIndex) >= filteredIndices.length - 1}
                onClick={goToNext}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 transition cursor-pointer shadow-xs"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Question Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in print:hidden">
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
        title={title}
        isOpen={showJsonInspector}
        onClose={() => setShowJsonInspector(false)}
      />
    </div>
  );
};
