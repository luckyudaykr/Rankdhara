import React from 'react';
import {
  X,
  Clock,
  HelpCircle,
  Award,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Calendar,
  Layers,
  Play,
  Zap,
} from 'lucide-react';
import { CloudTestSummary } from '../types';

interface TestDetailsModalProps {
  test: CloudTestSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onStartMock: (test: CloudTestSummary) => void;
  onStartPractice: (test: CloudTestSummary) => void;
}

export const TestDetailsModal: React.FC<TestDetailsModalProps> = ({
  test,
  isOpen,
  onClose,
  onStartMock,
  onStartPractice,
}) => {
  if (!isOpen || !test) return null;

  const markingPos = test.markingCorrect ?? 1.0;
  const markingNeg = test.markingWrong ?? 0.25;
  const totalMarks = test.questionCount * markingPos;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 p-5 text-white flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full inline-block mb-1.5">
              Test Specifications
            </span>
            <h3 className="text-lg font-bold leading-tight">{test.title}</h3>
            {test.examName && (
              <p className="text-xs text-blue-100 mt-1">
                {test.examName} {test.year ? `(${test.year})` : ''}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body content */}
        <div className="p-5 space-y-4 text-slate-800 text-sm">
          {/* Key Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-medium block">Questions</span>
                <span className="font-bold text-slate-900">{test.questionCount} MCQs</span>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-medium block">Duration</span>
                <span className="font-bold text-slate-900">{test.durationMinutes} Minutes</span>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-medium block">Total Marks</span>
                <span className="font-bold text-slate-900">{totalMarks} Marks</span>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 font-medium block">Marking Scheme</span>
                <span className="font-bold text-slate-900">
                  +{markingPos.toFixed(1)}, -{markingNeg.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Additional details */}
          <div className="bg-blue-50/70 border border-blue-200/60 rounded-xl p-3.5 space-y-2">
            <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-blue-600" />
              Examination Guidelines & Rules
            </h4>
            <ul className="text-xs text-blue-950 space-y-1.5 list-disc list-inside">
              <li>Each question features 4 multiple choice options with a single correct key.</li>
              <li>Incorrect responses incur a negative penalty of -{markingNeg.toFixed(2)} marks.</li>
              <li>Untimed <strong>Practice mode</strong> reveals detailed step-by-step solutions instantly.</li>
              <li>Timed <strong>Mock Test</strong> evaluates actual percentile and accuracy on standard CBT interface.</li>
            </ul>
          </div>

          {/* Test Performance if previously attempted */}
          {(typeof test.bestScore === 'number' || typeof test.latestScore === 'number') && (
            <div className="border border-slate-200 rounded-xl p-3 flex items-center justify-between bg-slate-50/50">
              <span className="text-xs font-semibold text-slate-600">Your Attempt History:</span>
              <div className="flex items-center gap-3 text-xs">
                {typeof test.bestScore === 'number' && (
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Best: {test.bestScore.toFixed(1)} / {totalMarks}
                  </span>
                )}
                {typeof test.latestScore === 'number' && (
                  <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    Latest: {test.latestScore.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              onStartPractice(test);
            }}
            className="w-full sm:w-1/2 py-2.5 px-4 rounded-xl border border-blue-600 text-blue-700 bg-white hover:bg-blue-50 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Zap className="w-4 h-4 text-blue-600" />
            <span>Practice (Untimed)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onStartMock(test);
            }}
            className="w-full sm:w-1/2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Start Mock Test</span>
          </button>
        </div>
      </div>
    </div>
  );
};
