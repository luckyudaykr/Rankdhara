import React, { useState, useEffect } from 'react';
import {
  ExamDetailData,
  CloudTestSummary,
} from '../types';
import { fetchExamDetail } from '../services/cloudStorageService';
import {
  ArrowLeft,
  GraduationCap,
  Calendar,
  BookOpen,
  Layers,
  Clock,
  Play,
  Sparkles,
  Info,
  CheckCircle2,
  ChevronRight,
  Award,
} from 'lucide-react';

interface ExamDetailPageProps {
  examId: string;
  examName: string;
  onBack: () => void;
  onStartMock: (test: CloudTestSummary) => void;
  onStartPractice: (test: CloudTestSummary) => void;
  onShowDetails: (test: CloudTestSummary) => void;
  onOpenCustomBuilder: (prefill: { examId: string }) => void;
  loadingTestId: string | null;
}

export const ExamDetailPage: React.FC<ExamDetailPageProps> = ({
  examId,
  examName,
  onBack,
  onStartMock,
  onStartPractice,
  onShowDetails,
  onOpenCustomBuilder,
  loadingTestId,
}) => {
  const [data, setData] = useState<ExamDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'all' | 'year' | 'subject' | 'chapter'>('all');

  useEffect(() => {
    loadDetail();
  }, [examId]);

  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchExamDetail(examId);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load exam tests');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (test: CloudTestSummary) => {
    if (test.bestScore !== undefined || test.latestScore !== undefined) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Completed {test.bestScore !== undefined ? `(Best: ${test.bestScore})` : ''}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
        New
      </span>
    );
  };

  const renderTestCard = (test: CloudTestSummary) => {
    const isLoading = loadingTestId === test.id;
    const examYearDisplay =
      test.yearsFound && test.yearsFound.length > 0
        ? test.yearsFound.join(', ')
        : test.year || '';

    return (
      <div
        key={test.id}
        className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-md transition-all flex flex-col justify-between"
      >
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-md bg-blue-50 text-blue-700 uppercase">
              {test.chapter || test.subject || test.difficulty || 'General'}
            </span>
            {getStatusBadge(test)}
          </div>

          <h3 className="font-bold text-slate-800 text-sm sm:text-base line-clamp-2 leading-snug">
            {test.title}
          </h3>

          {/* Exam & Year tag */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            {examYearDisplay && (
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
                {test.examName || examName} {examYearDisplay ? `| ${examYearDisplay}` : ''}
              </span>
            )}
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
              {test.language || 'English'}
            </span>
          </div>

          {/* Meta specs */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-slate-400" />
              {test.questionCount} Questions
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {test.durationMinutes} Mins
            </span>
            {test.markingCorrect !== undefined && (
              <span className="text-slate-600 font-semibold">
                +{test.markingCorrect} / -{test.markingWrong ?? 0.25}
              </span>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <button
            onClick={() => onShowDetails(test)}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1"
          >
            <Info className="w-3.5 h-3.5 text-slate-500" />
            <span>Details</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onStartPractice(test)}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Practice</span>
            </button>

            <button
              onClick={() => onStartMock(test)}
              disabled={isLoading}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/20 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isLoading ? 'Loading...' : 'Start Mock Test'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 mb-4 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to All Exams</span>
        </button>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-xl shadow-md shadow-blue-600/20">
              {examName.slice(0, 3).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  {data?.exam?.categoryGroup || 'Competitive Exam'}
                </span>
                <span className="text-xs text-slate-400 font-medium">Target Exam</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 mt-1">{examName}</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Past year question papers, subject tests, and chapter mocks curated for {examName}.
              </p>
            </div>
          </div>

          <button
            onClick={() => onOpenCustomBuilder({ examId })}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-sm transition-all active:scale-95 self-start md:self-center"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Custom Test for {examName}</span>
          </button>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-100 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveSection('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              activeSection === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Tests (
            {(data?.yearPapers.length || 0) +
              (data?.subjectTests.length || 0) +
              (data?.chapterTests.length || 0)}
            )
          </button>

          <button
            onClick={() => setActiveSection('year')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              activeSection === 'year'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Year-wise Papers ({data?.yearPapers.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveSection('subject')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              activeSection === 'subject'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Subject-wise ({data?.subjectTests.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveSection('chapter')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              activeSection === 'chapter'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Chapter-wise ({data?.chapterTests.length || 0})</span>
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-5 rounded-2xl border border-slate-200 bg-white animate-pulse space-y-3">
              <div className="h-4 bg-slate-200 rounded w-1/3" />
              <div className="h-6 bg-slate-200 rounded w-4/5" />
              <div className="h-4 bg-slate-200 rounded w-1/2" />
              <div className="h-10 bg-slate-100 rounded mt-4" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="p-8 text-center bg-white rounded-2xl border border-rose-200">
          <p className="text-sm font-bold text-rose-700">Failed to load exam details</p>
          <p className="text-xs text-rose-600 mt-1">{error}</p>
          <button
            onClick={loadDetail}
            className="mt-3 px-4 py-2 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Test Sections */}
      {!loading && !error && data && (
        <div className="space-y-8">
          {/* Year-wise Papers */}
          {(activeSection === 'all' || activeSection === 'year') && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <h2 className="text-base font-bold text-slate-800">
                    Year-Wise Previous Year Papers
                  </h2>
                  <span className="text-xs text-slate-500 font-medium">
                    ({data.yearPapers.length})
                  </span>
                </div>
              </div>

              {data.yearPapers.length === 0 ? (
                <div className="p-6 text-center bg-white rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                  No year-wise papers available for {examName} yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.yearPapers.map(renderTestCard)}
                </div>
              )}
            </section>
          )}

          {/* Subject-wise Tests */}
          {(activeSection === 'all' || activeSection === 'subject') && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <h2 className="text-base font-bold text-slate-800">Subject-Wise Practice Tests</h2>
                  <span className="text-xs text-slate-500 font-medium">
                    ({data.subjectTests.length})
                  </span>
                </div>
              </div>

              {data.subjectTests.length === 0 ? (
                <div className="p-6 text-center bg-white rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                  No subject-wise tests available for {examName} yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.subjectTests.map(renderTestCard)}
                </div>
              )}
            </section>
          )}

          {/* Chapter-wise Tests */}
          {(activeSection === 'all' || activeSection === 'chapter') && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <h2 className="text-base font-bold text-slate-800">Chapter-Wise Deep Practice</h2>
                  <span className="text-xs text-slate-500 font-medium">
                    ({data.chapterTests.length})
                  </span>
                </div>
              </div>

              {data.chapterTests.length === 0 ? (
                <div className="p-6 text-center bg-white rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                  No chapter-wise tests available for {examName} yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.chapterTests.map(renderTestCard)}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};
