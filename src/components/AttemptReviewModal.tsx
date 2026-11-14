import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Award,
  Sparkles,
  Flag,
  Check,
  ChevronDown,
  ChevronUp,
  Bookmark,
  Languages,
  Loader2,
} from 'lucide-react';
import { TestAttempt, AttemptQuestionData, MCQQuestion } from '../types';
import {
  submitQuestionReport,
  fetchMyBookmarks,
  saveBookmark,
  removeBookmark,
} from '../services/cloudStorageService';
import { useBilingualReview, ReviewDisplayLanguage } from '../hooks/useBilingualReview';

interface AttemptReviewModalProps {
  attempt: TestAttempt | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AttemptReviewModal: React.FC<AttemptReviewModalProps> = ({
  attempt,
  isOpen,
  onClose,
}) => {
  const [filter, setFilter] = useState<'all' | 'correct' | 'incorrect' | 'unattempted'>('all');
  const [expandedSolutions, setExpandedSolutions] = useState<Record<number, boolean>>({});

  // Bilingual display switcher & quick bookmarks
  const { reviewLang, isTranslating, switchReviewLanguage, getLocalizedQuestion } =
    useBilingualReview();
  const [bookmarkedSet, setBookmarkedSet] = useState<Set<number>>(new Set());
  const [bookmarkIdMap, setBookmarkIdMap] = useState<Record<number, string>>({});

  React.useEffect(() => {
    if (!isOpen || !attempt) return;
    fetchMyBookmarks()
      .then((bms) => {
        const set = new Set<number>();
        const idMap: Record<number, string> = {};
        bms.forEach((b) => {
          const matchesTest =
            attempt.testId && b.testId ? b.testId === attempt.testId : b.testTitle === attempt.testTitle;
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
  }, [isOpen, attempt]);

  const handleToggleBookmark = async (q: AttemptQuestionData, idx: number) => {
    if (!attempt) return;
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
      const mcqPayload: MCQQuestion = {
        id: q.id,
        question: q.question,
        questionHindi: q.questionHindi,
        questionEnglish: q.questionEnglish,
        optionsHindi: q.optionsHindi,
        optionsEnglish: q.optionsEnglish,
        type: q.type,
        options: q.options,
        correctOption: q.correctOption,
        explanation: q.explanation,
        examName: q.examName,
        year: q.year,
        examTags: q.examTags,
        stage: q.stage,
        subject: q.subject,
        chapter: q.chapter,
      };
      const saved = await saveBookmark({
        testId: attempt.testId,
        testTitle: attempt.testTitle,
        questionNumber: idx + 1,
        question: mcqPayload,
      }).catch(() => null);
      if (saved?.id) {
        setBookmarkIdMap((prev) => ({ ...prev, [idx]: saved.id }));
      }
    }
  };

  // Question Report State
  const [reportingQuestion, setReportingQuestion] = useState<{ q: AttemptQuestionData; num: number } | null>(null);
  const [reportReason, setReportReason] = useState<'Typo' | 'Wrong answer' | 'Ambiguous explanation' | 'Other'>('Wrong answer');
  const [reportComment, setReportComment] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccessMsg, setReportSuccessMsg] = useState<string | null>(null);

  if (!isOpen || !attempt) return null;

  const toggleSolution = (idx: number) => {
    setExpandedSolutions((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const handleSendReport = async () => {
    if (!reportingQuestion) return;
    setIsSubmittingReport(true);
    try {
      await submitQuestionReport({
        testId: attempt.testId,
        testTitle: attempt.testTitle,
        questionNumber: reportingQuestion.num,
        questionText: reportingQuestion.q.question,
        reason: reportReason,
        comment: reportComment,
      });
      setReportSuccessMsg('Report submitted to examination admin team!');
      setTimeout(() => {
        setReportingQuestion(null);
        setReportSuccessMsg(null);
        setReportComment('');
      }, 1400);
    } catch {
      alert('Failed to submit question report. Please try again.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const questions = attempt.questionsData || [];
  const filteredQuestions = questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q }) => {
      const isAttempted = q.selectedOption !== null && q.selectedOption !== undefined;
      if (filter === 'correct') return q.isCorrect;
      if (filter === 'incorrect') return isAttempted && !q.isCorrect;
      if (filter === 'unattempted') return !isAttempted;
      return true;
    });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] shadow-2xl flex flex-col border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-900 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded">
                Attempt Review
              </span>
              <span className="text-xs text-slate-400">
                {new Date(attempt.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold mt-1 text-white leading-tight">
              {attempt.testTitle}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Score Ribbon */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 font-bold text-slate-900">
              <Award className="w-4 h-4 text-blue-600" />
              <span>Score:</span>
              <span className="text-sm text-blue-700">
                {Number(attempt?.score ?? 0).toFixed(1)} / {Number(attempt?.maxScore ?? 0).toFixed(1)}
              </span>
            </div>
            <span className="text-slate-300">•</span>
            <div className="font-semibold text-slate-700">
              Accuracy: <strong className="text-slate-900">{attempt.accuracy}%</strong>
            </div>
            <span className="text-slate-300">•</span>
            <div className="font-semibold text-slate-700">
              Time: {Math.floor(attempt.timeTakenSeconds / 60)}m {attempt.timeTakenSeconds % 60}s
            </div>
          </div>

          {/* Language Switcher & Filter Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
              <Languages className="w-3.5 h-3.5 text-slate-500 ml-1" />
              {(['Default', 'English', 'Hindi'] as ReviewDisplayLanguage[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() =>
                    switchReviewLanguage(
                      lang,
                      filteredQuestions.map((item) => item.q)
                    )
                  }
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    reviewLang === lang ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {lang === 'Default' ? 'Orig' : lang === 'English' ? 'EN' : 'HI'}
                </button>
              ))}
              {isTranslating && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 mx-1" />}
            </div>

            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  filter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({questions.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('correct')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  filter === 'correct' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                Correct ({attempt.correct})
              </button>
              <button
                type="button"
                onClick={() => setFilter('incorrect')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  filter === 'incorrect' ? 'bg-rose-600 text-white' : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                Incorrect ({attempt.incorrect})
              </button>
              <button
                type="button"
                onClick={() => setFilter('unattempted')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  filter === 'unattempted' ? 'bg-slate-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Skipped ({attempt.unattempted})
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Question-by-Question List */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/60">
          {filteredQuestions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-500">
              <p className="font-medium text-sm">No questions in this filter.</p>
            </div>
          ) : (
            filteredQuestions.map(({ q, idx }) => {
              const isSelected = q.selectedOption !== null && q.selectedOption !== undefined;
              const isCorrect = q.isCorrect;
              const isIncorrect = isSelected && !isCorrect;
              const isSkipped = !isSelected;
              const isExpanded = expandedSolutions[idx] ?? true;
              const isBookmarked = bookmarkedSet.has(idx);
              const { questionText, options: localizedOpts } = getLocalizedQuestion(q);
              const optKeys = (['A', 'B', 'C', 'D', 'E'] as const).filter(
                (k) => k !== 'E' || Boolean(localizedOpts?.E)
              );

              return (
                <div
                  key={idx}
                  className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-xs ${
                    isCorrect
                      ? 'border-emerald-200'
                      : isIncorrect
                      ? 'border-rose-200'
                      : 'border-slate-200'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-900 font-bold text-xs flex items-center justify-center">
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
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {q.type}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {isCorrect && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md">
                          <Check className="w-3.5 h-3.5" />
                          <span>Correct</span>
                        </span>
                      )}
                      {isIncorrect && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-md">
                          <X className="w-3.5 h-3.5" />
                          <span>Incorrect</span>
                        </span>
                      )}
                      {isSkipped && (
                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                          Skipped
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleToggleBookmark(q, idx)}
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border transition cursor-pointer ${
                          isBookmarked
                            ? 'text-amber-700 bg-amber-50 border-amber-300'
                            : 'text-slate-600 bg-slate-50 hover:bg-slate-100 border-slate-200'
                        }`}
                        title={isBookmarked ? 'Remove Bookmark' : 'Bookmark Question'}
                      >
                        <Bookmark className={`w-3 h-3 ${isBookmarked ? 'fill-amber-500 text-amber-500' : ''}`} />
                        <span>{isBookmarked ? 'Saved' : 'Save'}</span>
                      </button>

                      {/* Labeled Report wrong question button */}
                      <button
                        type="button"
                        onClick={() => setReportingQuestion({ q, num: idx + 1 })}
                        className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-md transition cursor-pointer"
                        title="Report wrong question or solution"
                      >
                        <Flag className="w-3 h-3 text-rose-600" />
                        <span>Report wrong question</span>
                      </button>
                    </div>
                  </div>

                  {/* Question Text */}
                  <div className="mt-3 text-sm sm:text-base font-semibold text-slate-900 leading-relaxed">
                    {questionText}
                  </div>

                  {/* Options */}
                  <div className="mt-3.5 space-y-2">
                    {optKeys.map((optKey) => {
                      const isOfficialCorrect = q.correctOption === optKey;
                      const isUserSelected = q.selectedOption === optKey;

                      let style = 'border-slate-200 bg-slate-50/60 text-slate-800';
                      let badge = 'bg-slate-200 text-slate-700 border-slate-300';

                      if (isOfficialCorrect) {
                        style = 'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-medium ring-1 ring-emerald-400';
                        badge = 'bg-emerald-600 text-white border-emerald-600';
                      } else if (isUserSelected && !isOfficialCorrect) {
                        style = 'border-rose-400 bg-rose-50/80 text-rose-950 ring-1 ring-rose-300';
                        badge = 'bg-rose-600 text-white border-rose-600';
                      }

                      return (
                        <div
                          key={optKey}
                          className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs sm:text-sm ${style}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`w-6 h-6 rounded-md font-bold text-[11px] flex items-center justify-center shrink-0 border mt-0.5 ${badge}`}
                            >
                              {optKey}
                            </span>
                            <span className="leading-snug pt-0.5">
                              {localizedOpts ? localizedOpts[optKey] : ''}
                            </span>
                          </div>

                          <div className="shrink-0 flex items-center gap-1.5 text-xs font-bold">
                            {isOfficialCorrect && (
                              <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[11px]">
                                Correct Answer
                              </span>
                            )}
                            {isUserSelected && !isOfficialCorrect && (
                              <span className="text-rose-700 bg-rose-100 px-2 py-0.5 rounded text-[11px]">
                                Your Answer
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation Toggle */}
                  <div className="mt-3.5 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => toggleSolution(idx)}
                      className="w-full flex items-center justify-between text-xs font-bold text-blue-700 hover:text-blue-800 transition py-1"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        Explanation & Key Concept
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 text-xs sm:text-sm text-slate-800 leading-relaxed">
                        {q.explanation || 'Refer to standard textbook syllabus concepts.'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
          >
            Close Review
          </button>
        </div>
      </div>

      {/* Report Question Dialog */}
      {reportingQuestion && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Flag className="w-4 h-4 text-rose-600" />
                Report Question #{reportingQuestion.num}
              </h4>
              <button
                type="button"
                onClick={() => setReportingQuestion(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 mt-2 line-clamp-2 italic">
              &quot;{reportingQuestion.q.question}&quot;
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Issue Type
                </label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value as any)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Wrong answer">Wrong answer marked</option>
                  <option value="Typo">Typo or grammar error</option>
                  <option value="Ambiguous explanation">Ambiguous / incomplete explanation</option>
                  <option value="Other">Other issue</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Additional Details (Optional)
                </label>
                <textarea
                  value={reportComment}
                  onChange={(e) => setReportComment(e.target.value)}
                  placeholder="Explain why this answer or explanation should be reviewed..."
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 min-h-[75px]"
                />
              </div>

              {reportSuccessMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {reportSuccessMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReportingQuestion(null)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendReport}
                  disabled={isSubmittingReport}
                  className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmittingReport ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
