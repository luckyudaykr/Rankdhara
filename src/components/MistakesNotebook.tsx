import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertCircle,
  Zap,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  Search,
  Filter,
  RotateCcw,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ArrowRight,
  Languages,
  Loader2,
} from 'lucide-react';
import { TestAttempt, MCQQuestion } from '../types';
import { fetchMyAttempts } from '../services/cloudStorageService';
import { inferSubjectAndChapter } from '../services/examCatalogService';
import { useBilingualReview, ReviewDisplayLanguage } from '../hooks/useBilingualReview';

interface MistakesNotebookProps {
  onStartPractice: (questions: MCQQuestion[], title: string) => void;
  onExploreTests?: () => void;
}

export const MistakesNotebook: React.FC<MistakesNotebookProps> = ({
  onStartPractice,
  onExploreTests,
}) => {
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterType, setFilterType] = useState<'all' | 'incorrect' | 'skipped'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSolutions, setExpandedSolutions] = useState<Record<string, boolean>>({});
  const { reviewLang, isTranslating, switchReviewLanguage, getLocalizedQuestion } =
    useBilingualReview();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyAttempts();
      setAttempts(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load test attempts history');
    } finally {
      setLoading(false);
    }
  };

  const toggleSolution = (key: string) => {
    setExpandedSolutions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Extract all wrong and skipped questions from attempts, deduplicating by question text
  const { allMistakes, incorrectCount, skippedCount, availableSubjects } = useMemo(() => {
    const map = new Map<string, {
      question: MCQQuestion;
      userSelection: 'A' | 'B' | 'C' | 'D' | 'E' | null;
      isSkipped: boolean;
      testTitle: string;
      attemptDate: string;
      missedCount: number;
    }>();
    const subjSet = new Set<string>();

    let inc = 0;
    let skp = 0;

    for (const att of attempts) {
      if (!Array.isArray(att.questionsData)) continue;

      for (const q of att.questionsData) {
        const isAnswered = q.selectedOption !== null && q.selectedOption !== undefined;
        const isWrong = isAnswered && !q.isCorrect;
        const isSkipped = !isAnswered;

        if (isWrong || isSkipped) {
          const key = q.question.toLowerCase().trim().replace(/\s+/g, ' ');
          const inferred = !q.subject || !q.chapter
            ? inferSubjectAndChapter(q.question || '', `${q.explanation || ''} ${att.testTitle || ''}`)
            : { subject: '', chapter: '' };
          const resolvedSubject = (q.subject || inferred.subject || 'General Studies').trim();
          const resolvedChapter = (q.chapter || inferred.chapter || '').trim();
          if (resolvedSubject) subjSet.add(resolvedSubject);

          const existing = map.get(key);
          if (!existing) {
            const mcq: MCQQuestion = {
              id: q.id,
              question: q.question,
              questionHindi: q.questionHindi,
              questionEnglish: q.questionEnglish,
              optionsHindi: q.optionsHindi,
              optionsEnglish: q.optionsEnglish,
              type: q.type || 'factual',
              options: q.options,
              correctOption: q.correctOption,
              explanation: q.explanation,
              examName: q.examName,
              year: q.year,
              examTags: q.examTags,
              stage: q.stage,
              subject: resolvedSubject,
              chapter: resolvedChapter || undefined,
            };

            map.set(key, {
              question: mcq,
              userSelection: q.selectedOption,
              isSkipped,
              testTitle: att.testTitle,
              attemptDate: att.createdAt,
              missedCount: 1,
            });

            if (isWrong) inc++;
            else skp++;
          } else {
            existing.missedCount += 1;
          }
        }
      }
    }

    return {
      allMistakes: Array.from(map.values()),
      incorrectCount: inc,
      skippedCount: skp,
      availableSubjects: Array.from(subjSet).sort((a, b) => a.localeCompare(b)),
    };
  }, [attempts]);

  // Filter mistakes by tab, subject, and search
  const filteredMistakes = useMemo(() => {
    return allMistakes.filter((item) => {
      if (filterType === 'incorrect' && item.isSkipped) return false;
      if (filterType === 'skipped' && !item.isSkipped) return false;
      if (subjectFilter !== 'All' && (item.question.subject || 'General Studies') !== subjectFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesText =
          item.question.question.toLowerCase().includes(query) ||
          item.testTitle.toLowerCase().includes(query) ||
          (item.question.subject && item.question.subject.toLowerCase().includes(query)) ||
          (item.question.chapter && item.question.chapter.toLowerCase().includes(query)) ||
          (item.question.examName && item.question.examName.toLowerCase().includes(query));
        if (!matchesText) return false;
      }
      return true;
    });
  }, [allMistakes, filterType, subjectFilter, searchQuery]);

  const handleLaunchPracticeMistakes = () => {
    const practiceQuestions = filteredMistakes.map((m) => m.question);
    if (practiceQuestions.length === 0) return;
    onStartPractice(practiceQuestions, 'Mistakes Revision Notebook');
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <h3 className="font-bold text-slate-800 text-sm">Compiling your Mistake Notebook...</h3>
          <p className="text-xs text-slate-500">
            Gathering all incorrect and skipped questions from your CBT test attempts.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
          <h3 className="font-bold text-rose-900 text-base">Could not load mistakes notebook</h3>
          <p className="text-xs text-rose-700">{error}</p>
          <button
            type="button"
            onClick={loadData}
            className="px-4 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 transition cursor-pointer"
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-rose-700 via-rose-600 to-amber-700 rounded-2xl p-6 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-xs font-semibold mb-2">
            <AlertCircle className="w-3.5 h-3.5 text-rose-200" />
            <span>Targeted Weak Concept Revision</span>
          </div>
          <h1 className="text-2xl font-black text-white">Mistakes Notebook</h1>
          <p className="text-xs sm:text-sm text-rose-100 mt-1 max-w-xl">
            Automatically organized wrong and skipped questions across all your mock test attempts.
            Review explanations and re-practice them until mastery.
          </p>
        </div>

        {allMistakes.length > 0 && (
          <button
            type="button"
            onClick={handleLaunchPracticeMistakes}
            className="px-5 py-3 rounded-xl bg-white hover:bg-rose-50 text-rose-700 font-bold text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer shrink-0"
          >
            <Zap className="w-4 h-4 fill-rose-600" />
            <span>Practice Mistakes ({filteredMistakes.length})</span>
          </button>
        )}
      </div>

      {allMistakes.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Your Notebook is Clean!</h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            You don&apos;t have any recorded wrong or skipped questions yet. Take mock tests to challenge yourself and build your personal mistake revision deck.
          </p>
          {onExploreTests && (
            <button
              type="button"
              onClick={onExploreTests}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition inline-flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <span>Explore Tests</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Controls: Search & Tabs */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                All Mistakes ({allMistakes.length})
              </button>

              <button
                type="button"
                onClick={() => setFilterType('incorrect')}
                className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  filterType === 'incorrect'
                    ? 'bg-rose-600 text-white'
                    : 'text-rose-700 bg-rose-50 hover:bg-rose-100'
                }`}
              >
                Incorrect ({incorrectCount})
              </button>

              <button
                type="button"
                onClick={() => setFilterType('skipped')}
                className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  filterType === 'skipped'
                    ? 'bg-amber-600 text-white'
                    : 'text-amber-800 bg-amber-50 hover:bg-amber-100'
                }`}
              >
                Skipped ({skippedCount})
              </button>
            </div>

            {/* Language Toggle, Subject Filter & Search Input */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
                <Languages className="w-3.5 h-3.5 text-slate-500 ml-1" />
                {(['Default', 'English', 'Hindi'] as ReviewDisplayLanguage[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() =>
                      switchReviewLanguage(
                        lang,
                        filteredMistakes.map((m) => m.question)
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

              {availableSubjects.length > 1 && (
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 focus:bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">All Subjects</option>
                  {availableSubjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search questions or exams..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
            </div>
          </div>

          {/* List of Mistakes */}
          {filteredMistakes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
              No mistake questions found matching your search.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMistakes.map((item, idx) => {
                const q = item.question;
                const key = `mistake_${idx}_${q.id}`;
                const isExpanded = expandedSolutions[key] ?? true;
                const { questionText, options: localizedOpts } = getLocalizedQuestion(q);
                const optKeys = (['A', 'B', 'C', 'D', 'E'] as const).filter(
                  (k) => k !== 'E' || Boolean(localizedOpts?.E)
                );

                return (
                  <div
                    key={key}
                    className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 p-4 sm:p-5 shadow-xs transition space-y-3"
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center">
                          #{idx + 1}
                        </span>
                        {q.subject && (
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                            {q.subject}
                          </span>
                        )}
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
                        {item.missedCount > 1 && (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                            Missed {item.missedCount}x
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 truncate max-w-xs">
                          From: {item.testTitle}
                        </span>
                      </div>

                      <div>
                        {item.isSkipped ? (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                            Skipped
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
                            Wrong Choice ({item.userSelection})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Question */}
                    <div className="text-sm font-semibold text-slate-900 leading-relaxed">
                      {questionText}
                    </div>

                    {/* Options list */}
                    <div className="space-y-1.5 pt-1">
                      {optKeys.map((optKey) => {
                        const isOfficialCorrect = q.correctOption === optKey;
                        const isUserChoice = item.userSelection === optKey;

                        let style = 'border-slate-200 bg-slate-50/50 text-slate-700';
                        let badge = 'bg-slate-200 text-slate-700 border-slate-300';

                        if (isOfficialCorrect) {
                          style =
                            'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-semibold ring-1 ring-emerald-400';
                          badge = 'bg-emerald-600 text-white border-emerald-600';
                        } else if (isUserChoice && !isOfficialCorrect) {
                          style =
                            'border-rose-300 bg-rose-50/80 text-rose-950 ring-1 ring-rose-300';
                          badge = 'bg-rose-600 text-white border-rose-600';
                        }

                        return (
                          <div
                            key={optKey}
                            className={`p-2.5 rounded-xl border flex items-start justify-between gap-3 text-xs ${style}`}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className={`w-5 h-5 rounded-md font-bold text-[10px] flex items-center justify-center shrink-0 border mt-0.5 ${badge}`}
                              >
                                {optKey}
                              </span>
                              <span className="leading-snug pt-0.5">{localizedOpts?.[optKey]}</span>
                            </div>

                            {isOfficialCorrect && (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded shrink-0">
                                Correct Answer
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Collapsible Solution */}
                    <div className="pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => toggleSolution(key)}
                        className="w-full flex items-center justify-between text-xs font-bold text-blue-700 hover:text-blue-800 transition py-1"
                      >
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                          Explanation & Concept Solution
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-slate-800 leading-relaxed select-text">
                          {q.explanation || 'Refer to standard syllabus and previous papers.'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
