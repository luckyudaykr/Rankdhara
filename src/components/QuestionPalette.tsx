import React from 'react';
import { User, Check, Bookmark, Send } from 'lucide-react';
import { QuestionState, PaletteStatus } from '../types';

interface QuestionPaletteProps {
  totalQuestions: number;
  currentIndex: number;
  questionStates: QuestionState[];
  onSelectQuestion: (index: number) => void;
  onSubmitClick: () => void;
  candidateName?: string;
  isMobileCollapsed?: boolean;
}

export function getQuestionStatus(state: QuestionState): PaletteStatus {
  const hasAnswer = state.selectedOption !== null && state.selectedOption !== undefined;
  const isMarked = state.isMarkedForReview;
  const isVisited = state.isVisited;

  if (hasAnswer && isMarked) return 'answered_and_marked';
  if (isMarked) return 'marked_for_review';
  if (hasAnswer) return 'answered';
  if (isVisited) return 'not_answered';
  return 'not_visited';
}

export const QuestionPalette: React.FC<QuestionPaletteProps> = ({
  totalQuestions,
  currentIndex,
  questionStates,
  onSelectQuestion,
  onSubmitClick,
  candidateName = 'Examinee',
}) => {
  // Compute counts for the legend
  let answeredCount = 0;
  let notAnsweredCount = 0;
  let notVisitedCount = 0;
  let markedCount = 0;
  let answeredAndMarkedCount = 0;

  questionStates.forEach((st) => {
    const status = getQuestionStatus(st);
    if (status === 'answered') answeredCount++;
    else if (status === 'not_answered') notAnsweredCount++;
    else if (status === 'marked_for_review') markedCount++;
    else if (status === 'answered_and_marked') answeredAndMarkedCount++;
    else notVisitedCount++;
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
      {/* Candidate Mini Header (Testbook CBT style) */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-200">
          <User className="w-5 h-5 text-blue-600" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-800 truncate">{candidateName}</p>
          <p className="text-[11px] text-slate-500 font-mono">Roll: CBT-2026-MCQ</p>
        </div>
      </div>

      {/* Legend Grid */}
      <div className="p-3 border-b border-slate-100 bg-slate-50/50 text-[11px] text-slate-600 space-y-1.5">
        <div className="grid grid-cols-2 gap-2">
          {/* Answered */}
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-emerald-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 shadow-xs">
              {answeredCount}
            </span>
            <span className="truncate">Answered</span>
          </div>

          {/* Not Answered */}
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-red-500 text-white font-bold flex items-center justify-center text-[10px] shrink-0 shadow-xs">
              {notAnsweredCount}
            </span>
            <span className="truncate">Not Answered</span>
          </div>

          {/* Not Visited */}
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px] shrink-0 border border-slate-300">
              {notVisitedCount}
            </span>
            <span className="truncate">Not Visited</span>
          </div>

          {/* Marked for Review */}
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-purple-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 shadow-xs">
              {markedCount}
            </span>
            <span className="truncate">Marked</span>
          </div>
        </div>

        {/* Answered & Marked */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200/60">
          <span className="w-5 h-5 rounded bg-purple-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 relative shadow-xs">
            {answeredAndMarkedCount}
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white" />
          </span>
          <span className="truncate">Answered & Marked for Review</span>
        </div>
      </div>

      {/* Question Number Palette Grid */}
      <div className="p-4 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Question Palette
          </span>
          <span className="text-[11px] text-slate-500 font-medium">{totalQuestions} Questions</span>
        </div>

        <div className="grid grid-cols-5 gap-2.5 pt-1">
          {Array.from({ length: totalQuestions }).map((_, idx) => {
            const state = questionStates[idx] || {
              selectedOption: null,
              isMarkedForReview: false,
              isVisited: false,
              timeSpentSeconds: 0,
            };
            const status = getQuestionStatus(state);
            const isCurrent = idx === currentIndex;

            let btnStyle = 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'; // not visited default

            if (status === 'answered') {
              btnStyle = 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700';
            } else if (status === 'not_answered') {
              btnStyle = 'bg-red-500 text-white border-red-500 hover:bg-red-600';
            } else if (status === 'marked_for_review') {
              btnStyle = 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700';
            } else if (status === 'answered_and_marked') {
              btnStyle = 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700';
            }

            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectQuestion(idx)}
                className={`relative h-10 w-full rounded-lg font-bold text-xs flex items-center justify-center transition-all duration-150 border ${btnStyle} ${
                  isCurrent
                    ? 'ring-2 ring-blue-500 ring-offset-2 scale-105 z-10 shadow-md font-extrabold'
                    : ''
                }`}
                title={`Question ${idx + 1}`}
              >
                {idx + 1}
                {/* Dot marker for answered and marked */}
                {status === 'answered_and_marked' && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white" />
                )}
                {/* Small indicator for current */}
                {isCurrent && (
                  <span className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Palette Footer: Submit Test */}
      <div className="p-3 bg-slate-50 border-t border-slate-200">
        <button
          type="button"
          onClick={onSubmitClick}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Submit Test</span>
        </button>
      </div>
    </div>
  );
};
