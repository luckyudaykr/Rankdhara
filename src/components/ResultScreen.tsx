import React, { useState } from 'react';
import {
  Trophy,
  Target,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Upload,
  ArrowRight,
  Filter,
  Check,
  X,
  Share2,
  Printer,
  ChevronDown,
  ChevronUp,
  BookOpen,
  FileJson,
  Flag,
  Home,
  Award,
  Users,
  Bookmark,
  Languages,
  Loader2,
} from 'lucide-react';
import { MCQQuestion, QuestionState, TestResult, TestLeaderboardSummary } from '../types';
import { RawJsonInspector } from './RawJsonInspector';
import {
  submitQuestionReport,
  fetchTestLeaderboard,
  fetchMyBookmarks,
  saveBookmark,
  removeBookmark,
} from '../services/cloudStorageService';
import { useBilingualReview, ReviewDisplayLanguage } from '../hooks/useBilingualReview';

interface ResultScreenProps {
  result: TestResult;
  questions: MCQQuestion[];
  questionStates: QuestionState[];
  documentName: string;
  testId?: string;
  leaderboard?: TestLeaderboardSummary | null;
  onRetake: () => void;
  onReturnToDashboard: () => void;
  onGenerateNewFromSamePdf?: () => void;
  onUploadNew?: () => void;
  onSwitchToStudy?: () => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  result,
  questions,
  questionStates,
  documentName,
  testId,
  leaderboard: initialLeaderboard,
  onRetake,
  onReturnToDashboard,
  onGenerateNewFromSamePdf,
  onUploadNew,
  onSwitchToStudy,
}) => {
  const [showJsonInspector, setShowJsonInspector] = useState(false);
  const [leaderboard, setLeaderboard] = useState<TestLeaderboardSummary | null>(initialLeaderboard || null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  React.useEffect(() => {
    if (initialLeaderboard) {
      setLeaderboard(initialLeaderboard);
      return;
    }
    if (testId && testId !== 'custom-test' && testId !== 'custom-json') {
      fetchTestLeaderboard(testId).then((res) => {
        if (res) setLeaderboard(res);
      });
    }
  }, [initialLeaderboard, testId]);
  // Bilingual display switcher & quick bookmarks
  const { reviewLang, isTranslating, switchReviewLanguage, getLocalizedQuestion } =
    useBilingualReview();
  const [bookmarkedSet, setBookmarkedSet] = useState<Set<number>>(new Set());
  const [bookmarkIdMap, setBookmarkIdMap] = useState<Record<number, string>>({});

  React.useEffect(() => {
    fetchMyBookmarks()
      .then((bms) => {
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
      })
      .catch(() => {});
  }, [documentName, testId]);

  const handleToggleBookmark = async (q: MCQQuestion, idx: number) => {
    const isBm = bookmarkedSet.has(idx);
    const nextSet = new Set(bookmarkedSet);
    if (isBm) {
      nextSet.delete(idx);
      setBookmarkedSet(nextSet);
      const targetId = bookmarkIdMap[idx];
      setBookmarkIdMap((prev) => {
        const updated = { ...prev };
        delete updated[idx];
        return updated;
      });
      if (targetId) {
        await removeBookmark(targetId).catch(() => {});
      }
    } else {
      nextSet.add(idx);
      setBookmarkedSet(nextSet);
      const saved = await saveBookmark({
        testId,
        testTitle: documentName,
        questionNumber: idx + 1,
        question: q,
      }).catch(() => null);
      if (saved?.id) {
        setBookmarkIdMap((prev) => ({ ...prev, [idx]: saved.id }));
      }
    }
  };

  // Question Report Modal State
  const [reportTargetQuestion, setReportTargetQuestion] = useState<{ q: MCQQuestion; num: number } | null>(null);
  const [reportReason, setReportReason] = useState<'Typo' | 'Wrong answer' | 'Ambiguous explanation' | 'Other'>('Typo');
  const [reportComment, setReportComment] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccessMsg, setReportSuccessMsg] = useState<string | null>(null);

  const handleSubmitReport = async () => {
    if (!reportTargetQuestion) return;
    setIsSubmittingReport(true);
    try {
      await submitQuestionReport({
        testId,
        testTitle: documentName,
        questionNumber: reportTargetQuestion.num,
        questionText: reportTargetQuestion.q.question,
        reason: reportReason,
        comment: reportComment,
      });
      setReportSuccessMsg('Report submitted to examination team!');
      setTimeout(() => {
        setReportTargetQuestion(null);
        setReportSuccessMsg(null);
        setReportComment('');
      }, 1200);
    } catch {
      alert('Failed to submit report. Please try again.');
    } finally {
      setIsSubmittingReport(false);
    }
  };
  const [filter, setFilter] = useState<'all' | 'correct' | 'incorrect' | 'unattempted' | 'marked'>(
    'all'
  );
  const [expandedSolutions, setExpandedSolutions] = useState<Record<number, boolean>>(() => {
    // Expand all by default for immediate learning
    const initial: Record<number, boolean> = {};
    questions.forEach((_, idx) => {
      initial[idx] = true;
    });
    return initial;
  });

  const toggleSolution = (idx: number) => {
    setExpandedSolutions((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  const filteredQuestions = questions.map((q, idx) => {
    const state = questionStates[idx];
    const isCorrect = state.selectedOption === q.correctOption;
    const isAttempted = state.selectedOption !== null && state.selectedOption !== undefined;
    const isIncorrect = isAttempted && !isCorrect;
    const isUnattempted = !isAttempted;
    const isMarked = state.isMarkedForReview;

    return {
      question: q,
      state,
      idx,
      isCorrect,
      isIncorrect,
      isUnattempted,
      isMarked,
    };
  }).filter((item) => {
    if (filter === 'correct') return item.isCorrect;
    if (filter === 'incorrect') return item.isIncorrect;
    if (filter === 'unattempted') return item.isUnattempted;
    if (filter === 'marked') return item.isMarked;
    return true;
  });

  // Performance Tier
  let performanceBadge = {
    title: 'Good Effort',
    bg: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'Review the detailed explanations below to strengthen your weak concepts.',
  };
  if (result.accuracy >= 80) {
    performanceBadge = {
      title: 'Outstanding Performance',
      bg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      description: 'Superb grasp of the material! Excellent accuracy across factual and conceptual questions.',
    };
  } else if (result.accuracy < 50) {
    performanceBadge = {
      title: 'Revision Recommended',
      bg: 'bg-amber-100 text-amber-800 border-amber-200',
      description: 'You missed a few critical concepts. Check the full solutions below and retake the test.',
    };
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 print:p-0">
      {/* Top Scorecard Hero (Testbook CBT style) */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider bg-blue-500/30 text-blue-300 border border-blue-400/30 px-2.5 py-0.5 rounded-full">
                  Test Summary & Scorecard
                </span>
                <span className="text-xs text-slate-400">• {documentName}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2">
                Mock Test Analysis
              </h1>
            </div>

            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save PDF</span>
              </button>
            </div>
          </div>

          {/* Primary Metric Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            {/* Net Score */}
            <div className="bg-slate-800/80 backdrop-blur-xs rounded-2xl p-4 border border-slate-700/60">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Final Score</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-black text-white">
                  {Number(result?.score ?? 0).toFixed(2)}
                </span>
                <span className="text-sm text-slate-400 font-medium">/ {Number(result?.maxScore ?? 0).toFixed(2)}</span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-1">
                Scheme: +{result.markingScheme.positive} / -{result.markingScheme.negative}
              </span>
            </div>

            {/* Accuracy */}
            <div className="bg-slate-800/80 backdrop-blur-xs rounded-2xl p-4 border border-slate-700/60">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Target className="w-4 h-4 text-emerald-400" />
                <span>Accuracy</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-black text-emerald-400">
                  {result.accuracy}%
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-1">
                {result.correctCount} of {result.correctCount + result.incorrectCount} attempted
              </span>
            </div>

            {/* Attempt Rate */}
            <div className="bg-slate-800/80 backdrop-blur-xs rounded-2xl p-4 border border-slate-700/60">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <CheckCircle2 className="w-4 h-4 text-blue-400" />
                <span>Attempted</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-black text-white">
                  {result.correctCount + result.incorrectCount}
                </span>
                <span className="text-sm text-slate-400 font-medium">/ {questions.length}</span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-1">
                {result.unattemptedCount} Skipped
              </span>
            </div>

            {/* Time Taken */}
            <div className="bg-slate-800/80 backdrop-blur-xs rounded-2xl p-4 border border-slate-700/60">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Clock className="w-4 h-4 text-purple-400" />
                <span>Time Taken</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-white">
                  {formatTime(result.timeTakenSeconds)}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-1">
                Avg ~{Math.round(result.timeTakenSeconds / questions.length)}s / question
              </span>
            </div>
          </div>

          {/* Performance Assessment & Rank Callout */}
          <div className="mt-6 p-4 rounded-xl bg-slate-800/60 border border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full border mb-1 ${performanceBadge.bg}`}>
                {performanceBadge.title}
              </span>
              <p className="text-xs text-slate-300">{performanceBadge.description}</p>
            </div>

            {leaderboard && leaderboard.totalParticipants > 0 && (
              <div className="flex flex-wrap items-center gap-3 shrink-0 bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-2.5">
                <div className="text-center pr-3 border-r border-slate-700">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-semibold">
                    Your Rank
                  </span>
                  <span className="text-base font-black text-amber-400">
                    #{leaderboard.currentUserRank ?? '—'}
                    <span className="text-xs font-medium text-slate-400">
                      {' '}/ {leaderboard.totalParticipants}
                    </span>
                  </span>
                </div>
                <div className="text-center pr-3 border-r border-slate-700">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-semibold">
                    Percentile
                  </span>
                  <span className="text-base font-black text-emerald-400">
                    {leaderboard.currentUserPercentile !== null
                      ? `${leaderboard.currentUserPercentile}%`
                      : '—'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLeaderboard((prev) => !prev)}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer print:hidden"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>{showLeaderboard ? 'Hide Ranks' : 'Leaderboard'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Performers Leaderboard Panel */}
      {showLeaderboard && leaderboard && leaderboard.topEntries.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                <span>Test Leaderboard (Top {leaderboard.topEntries.length})</span>
              </h3>
              <p className="text-xs text-slate-500">
                Topper Score: <strong>{leaderboard.topScore}</strong> • Average Score: <strong>{leaderboard.averageScore}</strong> • {leaderboard.totalParticipants} Candidate{leaderboard.totalParticipants === 1 ? '' : 's'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowLeaderboard(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2.5 py-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="py-2 px-2">Rank</th>
                  <th className="py-2 px-2">Candidate</th>
                  <th className="py-2 px-2 text-right">Score</th>
                  <th className="py-2 px-2 text-right">Accuracy</th>
                  <th className="py-2 px-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaderboard.topEntries.map((entry) => (
                  <tr
                    key={`${entry.rank}_${entry.displayName}`}
                    className={entry.isCurrentUser ? 'bg-blue-50/80 font-semibold' : 'hover:bg-slate-50/70'}
                  >
                    <td className="py-2.5 px-2 font-black text-slate-800">
                      #{entry.rank}
                    </td>
                    <td className="py-2.5 px-2 text-slate-800">
                      {entry.displayName}
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold text-blue-700">
                      {entry.score} / {entry.maxScore}
                    </td>
                    <td className="py-2.5 px-2 text-right text-emerald-700 font-semibold">
                      {entry.accuracy}%
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-500">
                      {formatTime(entry.timeTakenSeconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}



      {/* Question Review Section */}
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Question-by-Question Solution Review</h2>
            <p className="text-xs text-slate-500">
              Examine each question, your selected option, official answer, and complete conceptual rationale.
            </p>
          </div>

          {/* Filter Pills & Language Toggle */}
          <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1 print:hidden">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 mr-1">
              <Languages className="w-3.5 h-3.5 text-slate-500 ml-1" />
              {(['Default', 'English', 'Hindi'] as ReviewDisplayLanguage[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() =>
                    switchReviewLanguage(
                      lang,
                      filteredQuestions.map((item) => item.question)
                    )
                  }
                  className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                    reviewLang === lang
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lang === 'Default' ? 'Orig' : lang === 'English' ? 'EN' : 'HI'}
                </button>
              ))}
              {isTranslating && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 mx-1" />}
            </div>

            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                filter === 'all'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              All ({questions.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('correct')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                filter === 'correct'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              Correct ({result.correctCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('incorrect')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                filter === 'incorrect'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-red-700 border-red-200 hover:bg-red-50'
              }`}
            >
              Incorrect ({result.incorrectCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unattempted')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                filter === 'unattempted'
                  ? 'bg-slate-600 text-white border-slate-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Skipped ({result.unattemptedCount})
            </button>
          </div>
        </div>

        {/* Question Cards List */}
        <div className="space-y-4">
          {filteredQuestions.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm">
              No questions found for the selected filter.
            </div>
          ) : (
            filteredQuestions.map(({ question: q, state, idx, isCorrect, isIncorrect, isUnattempted }) => {
              const isExpanded = expandedSolutions[idx] ?? true;
              const isBookmarked = bookmarkedSet.has(idx);
              const { questionText, options: localizedOpts } = getLocalizedQuestion(q);
              const optKeys = (['A', 'B', 'C', 'D', 'E'] as const).filter(
                (k) => k !== 'E' || Boolean(localizedOpts?.E)
              );

              return (
                <div
                  key={idx}
                  className={`bg-white rounded-2xl border transition-shadow shadow-xs p-6 ${
                    isCorrect
                      ? 'border-emerald-200 ring-1 ring-emerald-100'
                      : isIncorrect
                      ? 'border-red-200 ring-1 ring-red-100'
                      : 'border-slate-200'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center">
                        Q{idx + 1}
                      </span>
                      {q.examName && (
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                          {q.examName}
                        </span>
                      )}
                      {q.year && (
                        <span className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                          {q.year}
                        </span>
                      )}
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {q.type}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {isCorrect && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                          <Check className="w-3.5 h-3.5" />
                          <span>+{result.markingScheme.positive.toFixed(2)} Correct</span>
                        </span>
                      )}
                      {isIncorrect && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-md">
                          <X className="w-3.5 h-3.5" />
                          <span>-{result.markingScheme.negative.toFixed(2)} Incorrect</span>
                        </span>
                      )}
                      {isUnattempted && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
                          <span>0.00 Not Attempted</span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleBookmark(q, idx)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer print:hidden ${
                          isBookmarked
                            ? 'text-amber-700 bg-amber-50 border-amber-300'
                            : 'text-slate-600 bg-slate-50 hover:bg-slate-100 border-slate-200'
                        }`}
                        title={isBookmarked ? 'Remove Bookmark' : 'Bookmark Question'}
                      >
                        <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-500 text-amber-500' : ''}`} />
                        <span className="hidden sm:inline">{isBookmarked ? 'Saved' : 'Save'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportTargetQuestion({ q, num: idx + 1 })}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer print:hidden"
                        title="Report wrong question"
                      >
                        <Flag className="w-3.5 h-3.5 text-rose-600" />
                        <span className="hidden sm:inline">Report wrong question</span>
                        <span className="sm:hidden">Report</span>
                      </button>
                    </div>
                  </div>

                  {/* Question Text */}
                  <div className="mt-3 text-sm sm:text-base font-medium text-slate-900 leading-relaxed select-text">
                    {questionText}
                  </div>

                  {/* Options List */}
                  <div className="mt-4 space-y-2">
                    {optKeys.map((optKey) => {
                      const isOfficialCorrect = q.correctOption === optKey;
                      const isUserSelected = state.selectedOption === optKey;

                      let optContainerStyle =
                        'border-slate-200 bg-slate-50/50 text-slate-700';
                      let badgeStyle =
                        'bg-slate-200 text-slate-700 border-slate-300';

                      if (isOfficialCorrect) {
                        optContainerStyle =
                          'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-medium ring-1 ring-emerald-400';
                        badgeStyle = 'bg-emerald-600 text-white border-emerald-600';
                      } else if (isUserSelected && !isOfficialCorrect) {
                        optContainerStyle =
                          'border-red-400 bg-red-50/80 text-red-950 ring-1 ring-red-300';
                        badgeStyle = 'bg-red-600 text-white border-red-600';
                      }

                      return (
                        <div
                          key={optKey}
                          className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs sm:text-sm ${optContainerStyle}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`w-6 h-6 rounded-md font-bold text-[11px] flex items-center justify-center shrink-0 border mt-0.5 ${badgeStyle}`}
                            >
                              {optKey}
                            </span>
                            <span className="leading-snug pt-0.5">{localizedOpts?.[optKey]}</span>
                          </div>

                          <div className="shrink-0 flex items-center gap-1.5 text-xs font-bold">
                            {isOfficialCorrect && (
                              <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[11px]">
                                Correct Answer
                              </span>
                            )}
                            {isUserSelected && !isOfficialCorrect && (
                              <span className="text-red-700 bg-red-100 px-2 py-0.5 rounded text-[11px]">
                                Your Choice
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Collapsible Solution & Explanation Box */}
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => toggleSolution(idx)}
                      className="w-full flex items-center justify-between text-xs font-bold text-blue-700 hover:text-blue-800 transition py-1"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        Explanation & Key Takeaway
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 p-3.5 rounded-xl bg-blue-50/60 border border-blue-100 text-xs sm:text-sm text-slate-800 leading-relaxed select-text">
                        <span className="font-bold text-blue-900 block mb-1">
                          Official Solution:
                        </span>
                        {q.explanation}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom Action Bar (Requirement 2: Exactly two buttons [Return to Dashboard] and [Retake Quiz]) */}
      <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md border border-slate-200 p-4 rounded-2xl shadow-xl flex items-center justify-between gap-4 max-w-xl mx-auto print:hidden">
        <button
          type="button"
          onClick={onReturnToDashboard}
          className="flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 text-slate-800 transition cursor-pointer flex items-center justify-center gap-2 border border-slate-200"
        >
          <Home className="w-4 h-4 text-slate-600" />
          <span>Return to Dashboard</span>
        </button>

        <button
          type="button"
          onClick={onRetake}
          className="flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm bg-blue-600 hover:bg-blue-500 text-white transition cursor-pointer shadow-blue-500/20 shadow-md flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Retake Quiz</span>
        </button>
      </div>

      {/* Question Report Modal */}
      {reportTargetQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in print:hidden">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Flag className="w-4 h-4 text-rose-500" />
                <span>Report Question #{reportTargetQuestion.num}</span>
              </h3>
              <button
                type="button"
                onClick={() => setReportTargetQuestion(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
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
                    className="w-full text-xs bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 font-medium"
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
                    className="w-full text-xs bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 focus:outline-hidden"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setReportTargetQuestion(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
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
    </div>
  );
};
