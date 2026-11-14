import React, { useState, useMemo } from 'react';
import {
  BrowseSummary,
  BrowseSubjectSummary,
  BrowseChapterSummary,
  TestAttempt,
} from '../types';
import {
  GraduationCap,
  BookOpen,
  FolderTree,
  ChevronRight,
  Play,
  Search,
  CheckCircle2,
  Clock,
  Layers,
  Filter,
} from 'lucide-react';

interface BrowseSectionProps {
  summary: BrowseSummary | null;
  loading: boolean;
  error?: string | null;
  attempts: TestAttempt[];
  onSelectExam: (examId: string, examName: string) => void;
  onStartChapterTest: (subject: string, chapter: string, mode: 'mock' | 'practice') => void;
  onOpenCustomBuilder: (prefill?: { examId?: string; subject?: string; chapter?: string }) => void;
  onRefresh?: () => void;
}

export const BrowseSection: React.FC<BrowseSectionProps> = ({
  summary,
  loading,
  error,
  attempts,
  onSelectExam,
  onStartChapterTest,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'exams' | 'subjects' | 'chapters'>('exams');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');

  // Compute attempted questions set by signature or (subject + chapter + text) to avoid double counting
  const attemptedQuestionKeys = useMemo(() => {
    const set = new Set<string>();
    attempts.forEach((att) => {
      att.questionsData?.forEach((q) => {
        if (q.selectedOption !== null) {
          const key = `${q.subject || ''}:::${q.chapter || ''}:::${(q.question || '').slice(0, 40)}`;
          set.add(key);
        }
      });
    });
    return set;
  }, [attempts]);

  // Attempted count calculation per chapter
  const getChapterAttemptedCount = (subject: string, chapter: string) => {
    let count = 0;
    const prefix = `${subject}:::${chapter}:::`;
    attemptedQuestionKeys.forEach((key) => {
      if (key.startsWith(prefix)) {
        count++;
      }
    });
    return count;
  };

  // Filtered lists (only show items with questionCount > 0)
  const filteredExams = useMemo(() => {
    if (!summary?.exams) return [];
    return summary.exams
      .filter((e) => (e.questionCount || 0) > 0)
      .filter((e) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          e.name.toLowerCase().includes(q) ||
          e.shortName.toLowerCase().includes(q) ||
          e.categoryGroup.toLowerCase().includes(q)
        );
      });
  }, [summary, searchQuery]);

  const filteredSubjects = useMemo(() => {
    if (!summary?.subjects) return [];
    return summary.subjects
      .filter((s) => s.questionCount > 0)
      .filter((s) => {
        if (!searchQuery.trim()) return true;
        return s.name.toLowerCase().includes(searchQuery.toLowerCase());
      });
  }, [summary, searchQuery]);

  const allSubjectsList = useMemo(() => {
    if (!summary?.subjects) return [];
    return summary.subjects.filter((s) => s.questionCount > 0).map((s) => s.name);
  }, [summary]);

  const filteredChapters = useMemo(() => {
    if (!summary?.chapters) return [];
    return summary.chapters
      .filter((c) => c.questionCount > 0)
      .filter((c) => {
        if (selectedSubjectFilter !== 'all' && c.subject !== selectedSubjectFilter) {
          return false;
        }
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q);
      });
  }, [summary, searchQuery, selectedSubjectFilter]);

  // Color generator for Exam logo badges
  const getExamAvatarStyle = (shortName: string) => {
    const charCode = shortName.charCodeAt(0) || 65;
    const palettes = [
      'bg-blue-600 text-white',
      'bg-indigo-600 text-white',
      'bg-emerald-600 text-white',
      'bg-amber-600 text-white',
      'bg-rose-600 text-white',
      'bg-sky-600 text-white',
      'bg-teal-600 text-white',
      'bg-violet-600 text-white',
    ];
    return palettes[charCode % palettes.length];
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
      {/* Header bar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-blue-50/60 to-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                <FolderTree className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-slate-800">Browse Tests & Question Bank</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Explore by target exam, academic subject, or chapter-wise curated practice.
            </p>
          </div>
        </div>

        {/* Tab Controls: Equal-width 3 tabs, fits 360px without horizontal scroll */}
        <div className="grid grid-cols-3 w-full mt-4 border-b border-slate-200/80">
          <button
            type="button"
            onClick={() => setActiveTab('exams')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 sm:px-3 py-2 text-[13px] font-semibold border-b-2 transition-colors min-w-0 cursor-pointer ${
              activeTab === 'exams'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="flex items-center justify-center gap-1 min-w-0">
              <span className="truncate">Exams</span>
              {summary?.exams && (
                <span className="px-1 py-0.5 text-[10px] leading-none font-bold rounded-full bg-slate-100 text-slate-600 shrink-0">
                  {summary.exams.filter((e) => (e.questionCount || 0) > 0).length}
                </span>
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('subjects')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 sm:px-3 py-2 text-[13px] font-semibold border-b-2 transition-colors min-w-0 cursor-pointer ${
              activeTab === 'subjects'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="flex items-center justify-center gap-1 min-w-0">
              <span className="truncate">Subjects</span>
              {summary?.subjects && (
                <span className="px-1 py-0.5 text-[10px] leading-none font-bold rounded-full bg-slate-100 text-slate-600 shrink-0">
                  {summary.subjects.filter((s) => s.questionCount > 0).length}
                </span>
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chapters')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 sm:px-3 py-2 text-[13px] font-semibold border-b-2 transition-colors min-w-0 cursor-pointer ${
              activeTab === 'chapters'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="flex items-center justify-center gap-1 min-w-0">
              <span className="truncate">Chapters</span>
              {summary?.chapters && (
                <span className="px-1 py-0.5 text-[10px] leading-none font-bold rounded-full bg-slate-100 text-slate-600 shrink-0">
                  {summary.chapters.filter((c) => c.questionCount > 0).length}
                </span>
              )}
            </span>
          </button>
        </div>

        {/* Search & In-tab filter row */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 mt-3">
          <div className="relative w-full sm:flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Search in ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {activeTab === 'chapters' && allSubjectsList.length > 0 && (
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <select
                value={selectedSubjectFilter}
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                className="w-full sm:w-auto px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="all">All Subjects ({allSubjectsList.length})</option>
                {allSubjectsList.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Body Content */}
      <div className="p-4 sm:p-5">
        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="p-4 rounded-xl border border-slate-200 bg-slate-50 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-200 rounded w-2/3" />
                    <div className="h-3 bg-slate-200 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="p-6 text-center bg-rose-50/60 rounded-xl border border-rose-200">
            <p className="text-sm font-semibold text-rose-700">Failed to load catalogue</p>
            <p className="text-xs text-rose-600 mt-1">{error}</p>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="mt-3 px-3 py-1.5 text-xs bg-white text-rose-700 border border-rose-300 rounded-lg hover:bg-rose-50 font-medium"
              >
                Try Again
              </button>
            )}
          </div>
        )}

        {/* TAB 1: EXAMS GRID */}
        {!loading && !error && activeTab === 'exams' && (
          <div>
            {filteredExams.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <GraduationCap className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-slate-700">No exams with published tests found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Exams without questions are hidden. Once tests are organized or extracted from PDFs, they will appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredExams.map((exam) => (
                  <div
                    key={exam.id}
                    onClick={() => onSelectExam(exam.id, exam.name)}
                    className="group relative p-4 rounded-xl border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/30 transition-all cursor-pointer shadow-sm hover:shadow"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm tracking-tight flex-shrink-0 shadow-sm ${getExamAvatarStyle(
                          exam.shortName
                        )}`}
                      >
                        {exam.shortName.slice(0, 3).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-semibold tracking-wider text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded-full">
                            {exam.categoryGroup}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                        </div>
                        <h3 className="font-bold text-slate-800 text-sm mt-1 truncate group-hover:text-blue-700 transition-colors">
                          {exam.name}
                        </h3>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 font-medium">
                          <span className="flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                            {exam.testCount} {exam.testCount === 1 ? 'Test' : 'Tests'}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          <span className="text-slate-600 font-semibold">
                            {exam.questionCount} Questions
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SUBJECTS GRID */}
        {!loading && !error && activeTab === 'subjects' && (
          <div>
            {filteredSubjects.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-slate-700">No subjects found</h3>
                <p className="text-xs text-slate-500 mt-1">Try adjusting your search query.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredSubjects.map((sub) => (
                  <div
                    key={sub.name}
                    onClick={() => {
                      setSelectedSubjectFilter(sub.name);
                      setActiveTab('chapters');
                    }}
                    className="group p-4 rounded-xl border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/30 transition-all cursor-pointer shadow-sm hover:shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-base flex-shrink-0">
                        {sub.name.charAt(0)}
                      </div>
                      <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        View Chapters
                        <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-800 text-sm mt-3 group-hover:text-blue-700 transition-colors">
                      {sub.name}
                    </h3>

                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 font-medium">
                      <span>{sub.chaptersCount} Chapters</span>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span>{sub.testCount} Tests</span>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span className="text-slate-700 font-bold">{sub.questionCount} Qs</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CHAPTERS LIST WITH PROGRESS */}
        {!loading && !error && activeTab === 'chapters' && (
          <div>
            {filteredChapters.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-slate-700">No chapters found</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Try switching the subject filter or clearing your search.
                </p>
                {selectedSubjectFilter !== 'all' && (
                  <button
                    onClick={() => setSelectedSubjectFilter('all')}
                    className="mt-3 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg font-medium hover:bg-blue-100"
                  >
                    Show all subjects
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredChapters.map((ch) => {
                  const attemptedCount = ch.userAttemptedCount || getChapterAttemptedCount(ch.subject, ch.name);
                  const progressPct = Math.min(100, Math.round((attemptedCount / ch.questionCount) * 100));

                  return (
                    <div
                      key={`${ch.subject}::${ch.name}`}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-shadow shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
                            {ch.subject}
                          </span>
                          <span className="text-xs text-slate-400 font-medium">
                            {ch.questionCount} Questions total
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-800 text-sm truncate">{ch.name}</h4>

                        {/* Attempt progress bar */}
                        <div className="mt-2.5 max-w-md">
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1 font-medium">
                            <span>
                              Attempted: <strong className="text-slate-800">{attemptedCount}</strong> /{' '}
                              {ch.questionCount}
                            </span>
                            <span>{progressPct}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full transition-all duration-300"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 self-end md:self-center flex-shrink-0">
                        <button
                          onClick={() => onStartChapterTest(ch.subject, ch.name, 'practice')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5"
                          title="Instant untimed practice with explanations"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-slate-600" />
                          <span>Practice</span>
                        </button>

                        <button
                          onClick={() => onStartChapterTest(ch.subject, ch.name, 'mock')}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm shadow-blue-500/20 transition-all flex items-center gap-1.5 active:scale-95"
                          title="Start timed mock test"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Start Test</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
