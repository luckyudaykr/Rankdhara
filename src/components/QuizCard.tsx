import React from 'react';
import {
  Clock,
  HelpCircle,
  Award,
  Play,
  Zap,
  Info,
  CheckCircle2,
  Sparkles,
  BookOpen,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { CloudTestSummary } from '../types';

interface QuizCardProps {
  test: CloudTestSummary;
  isInProgress?: boolean;
  onStartMock: (test: CloudTestSummary) => void;
  onStartPractice: (test: CloudTestSummary) => void;
  onOpenDetails: (test: CloudTestSummary) => void;
  onResume?: (test: CloudTestSummary) => void;
  isLoading?: boolean;
}

export const QuizCard: React.FC<QuizCardProps> = ({
  test,
  isInProgress = false,
  onStartMock,
  onStartPractice,
  onOpenDetails,
  onResume,
  isLoading = false,
}) => {
  const isCompleted = test.bestScore !== undefined || test.latestScore !== undefined;

  // Infer subject or chapter from title or metadata
  const inferSubjectOrChapter = (title: string): string => {
    const t = title.toLowerCase();
    if (t.includes('physics')) return 'General Science • Physics';
    if (t.includes('biology')) return 'General Science • Biology';
    if (t.includes('chemistry')) return 'General Science • Chemistry';
    if (t.includes('science')) return 'General Science';
    if (t.includes('polity') || t.includes('constitution')) return 'Indian Polity & Constitution';
    if (t.includes('history')) return 'History of India';
    if (t.includes('geography')) return 'Geography & Environment';
    if (t.includes('economy')) return 'Indian Economy';
    return 'General Studies';
  };

  const subjectName = inferSubjectOrChapter(test.title);

  // Format exam names and years found in the quiz
  // E.g. "BPSC, UPPCS | 1996-2021"
  const formatExamAndYear = (): string => {
    const examPart = test.examNamesFound && test.examNamesFound.length > 0
      ? test.examNamesFound.slice(0, 3).join(', ')
      : test.examName?.trim() || '';

    let yearPart = '';
    if (test.yearsFound && test.yearsFound.length > 1) {
      yearPart = `${test.yearsFound[0]}-${test.yearsFound[test.yearsFound.length - 1]}`;
    } else if (test.yearsFound && test.yearsFound.length === 1) {
      yearPart = test.yearsFound[0];
    } else if (test.year?.trim()) {
      yearPart = test.year.trim();
    }

    if (examPart && yearPart) {
      return `${examPart} | ${yearPart}`;
    }
    return examPart || yearPart || 'National Level Exam Standard';
  };

  const examYearString = formatExamAndYear();
  const markingPos = test.markingCorrect ?? 1.0;
  const markingNeg = test.markingWrong ?? 0.25;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 hover:border-blue-400 hover:shadow-md transition-all duration-200 p-5 flex flex-col justify-between group relative overflow-hidden">
      {/* Top Section */}
      <div>
        {/* Badges Bar: Status, Subject, Difficulty, Language */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Status Badge: New / In progress / Completed */}
            {isInProgress ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                In progress
              </span>
            ) : isCompleted ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                Completed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                <Sparkles className="w-3 h-3 text-blue-500" />
                New
              </span>
            )}

            {/* Subject / Chapter */}
            <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
              {subjectName}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Difficulty Badge */}
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                test.difficulty === 'Easy'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : test.difficulty === 'Hard'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {test.difficulty}
            </span>

            {/* Language */}
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              {test.language || 'English'}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="font-bold text-base text-slate-900 group-hover:text-blue-700 transition leading-snug line-clamp-2">
          {test.title}
        </h3>

        {/* Exam name(s) & year(s) found in quiz (e.g. "BPSC, UPPCS | 1996-2021") */}
        <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-purple-700">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
          <span className="truncate">{examYearString}</span>
        </div>

        {/* Meta Stats Row: Questions, Duration, Marking */}
        <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-slate-50/70 p-2 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-500 block font-medium">Questions</span>
            <span className="font-bold text-slate-900 mt-0.5 block">
              {test.questionCount} Qs
            </span>
          </div>

          <div className="bg-slate-50/70 p-2 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-500 block font-medium">Duration</span>
            <span className="font-bold text-slate-900 mt-0.5 block">
              {test.durationMinutes}m
            </span>
          </div>

          <div className="bg-slate-50/70 p-2 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-500 block font-medium">Marking</span>
            <span className="font-bold text-slate-900 mt-0.5 block">
              +{markingPos}, -{markingNeg}
            </span>
          </div>
        </div>

        {/* Scores if completed */}
        {isCompleted && (
          <div className="mt-3 p-2 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-slate-600 font-medium">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              <span>Best Score:</span>
              <strong className="text-slate-900 font-bold">
                {typeof test.bestScore === 'number' ? test.bestScore.toFixed(1) : '-'}
              </strong>
            </div>
            {typeof test.latestScore === 'number' && (
              <div className="text-slate-600 font-medium">
                Last:{' '}
                <strong className="text-blue-700 font-bold">
                  {test.latestScore.toFixed(1)}
                </strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons Row */}
      <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
        <div className="flex items-center gap-2">
          {/* Practice (Untimed) */}
          <button
            type="button"
            onClick={() => onStartPractice(test)}
            disabled={isLoading}
            className="flex-1 py-2 px-3 rounded-xl border border-blue-600 text-blue-700 hover:bg-blue-50 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            title="Untimed practice mode: instant answers and explanations"
          >
            <Zap className="w-3.5 h-3.5 text-blue-600" />
            <span>Practice</span>
          </button>

          {/* Start Mock Test (Timed) or Resume */}
          {isInProgress && onResume ? (
            <button
              type="button"
              onClick={() => onResume(test)}
              disabled={isLoading}
              className="flex-1 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Resume</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStartMock(test)}
              disabled={isLoading}
              className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Start Mock Test</span>
            </button>
          )}

          {/* Labeled Details button (replacing unlabeled book icon) */}
          <button
            type="button"
            onClick={() => onOpenDetails(test)}
            className="py-2 px-3 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold text-xs flex items-center justify-center gap-1 transition cursor-pointer shrink-0"
            title="View syllabus, marking scheme and test details"
          >
            <Info className="w-3.5 h-3.5 text-slate-500" />
            <span>Details</span>
          </button>
        </div>
      </div>
    </div>
  );
};
