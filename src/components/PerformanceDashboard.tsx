import React, { useState, useEffect, useMemo } from 'react';
import {
  Award,
  TrendingUp,
  Target,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  RotateCcw,
  Eye,
  RefreshCw,
  ArrowLeft,
  X,
  FileText,
  Calendar,
  Layers
} from 'lucide-react';
import { TestAttempt, AttemptQuestionData } from '../types';
import { fetchMyAttempts } from '../services/cloudStorageService';

interface PerformanceDashboardProps {
  onBackToDashboard: () => void;
  onRetakeTest?: (testId: string) => void;
}

export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  onBackToDashboard,
  onRetakeTest,
}) => {
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Attempt review modal
  const [selectedAttempt, setSelectedAttempt] = useState<TestAttempt | null>(null);

  useEffect(() => {
    loadAttempts();
  }, []);

  const loadAttempts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyAttempts();
      // Sort newest first for history
      const sorted = [...data].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setAttempts(sorted);
    } catch (err: any) {
      setError(err.message || 'Failed to load test history');
    } finally {
      setLoading(false);
    }
  };

  // Analytics Computations
  const stats = useMemo(() => {
    if (attempts.length === 0) {
      return {
        total: 0,
        avgScore: 0,
        avgAccuracy: 0,
        bestScore: 0,
        typeAccuracy: {
          factual: { correct: 0, total: 0, percent: 0 },
          conceptual: { correct: 0, total: 0, percent: 0 },
          application: { correct: 0, total: 0, percent: 0 },
        },
      };
    }

    const total = attempts.length;
    const totalScore = attempts.reduce((acc, a) => acc + a.score, 0);
    const totalAccuracy = attempts.reduce((acc, a) => acc + a.accuracy, 0);
    const bestScore = Math.max(...attempts.map((a) => a.score));

    // Question type accuracy breakdown across all attempts
    const typeCount = {
      factual: { correct: 0, total: 0 },
      conceptual: { correct: 0, total: 0 },
      application: { correct: 0, total: 0 },
    };

    attempts.forEach((att) => {
      att.questionsData?.forEach((q) => {
        const type = (q.type || 'factual') as 'factual' | 'conceptual' | 'application';
        if (typeCount[type]) {
          typeCount[type].total += 1;
          if (q.isCorrect) {
            typeCount[type].correct += 1;
          }
        }
      });
    });

    const getPercent = (c: number, t: number) => (t > 0 ? Math.round((c / t) * 100) : 0);

    return {
      total,
      avgScore: Number((totalScore / total).toFixed(1)),
      avgAccuracy: Math.round(totalAccuracy / total),
      bestScore,
      typeAccuracy: {
        factual: {
          ...typeCount.factual,
          percent: getPercent(typeCount.factual.correct, typeCount.factual.total),
        },
        conceptual: {
          ...typeCount.conceptual,
          percent: getPercent(typeCount.conceptual.correct, typeCount.conceptual.total),
        },
        application: {
          ...typeCount.application,
          percent: getPercent(typeCount.application.correct, typeCount.application.total),
        },
      },
    };
  }, [attempts]);

  // Chronological data points for trend chart (oldest to newest, max 15)
  const chartPoints = useMemo(() => {
    const chronological = [...attempts].reverse().slice(-15);
    return chronological.map((a, i) => ({
      index: i,
      score: Math.max(0, a.score),
      maxScore: Math.max(1, Number(a.maxScore) || 10),
      date: new Date(a.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
      title: a.testTitle,
      accuracy: a.accuracy,
    }));
  }, [attempts]);

  const peakMaxScore = useMemo(() => {
    if (attempts.length === 0) return 10;
    return Math.max(...attempts.map((a) => Number(a.maxScore) || 10), 10);
  }, [attempts]);

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remaining = sec % 60;
    return `${mins}m ${remaining}s`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Top Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={onBackToDashboard}
          className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-blue-600 bg-white border border-slate-200 px-3.5 py-2 rounded-xl shadow-xs transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Tests</span>
        </button>

        <button
          type="button"
          onClick={loadAttempts}
          className="p-2 text-slate-400 hover:text-slate-700 bg-white border border-slate-200 rounded-xl transition"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          Performance Analytics & History
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Detailed metrics, score progression, question type strengths, and full answer key reviews.
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-500" />
          <p className="text-sm">Calculating candidate performance...</p>
        </div>
      ) : attempts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-500">
          <Award className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <h3 className="font-bold text-slate-800 text-base">No examination attempts yet</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
            Take your first mock test to unlock accuracy curves, domain breakdowns, and historical answer keys.
          </p>
          <button
            type="button"
            onClick={onBackToDashboard}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-500 transition shadow-xs"
          >
            Explore Available Tests
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* 4 Summary Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Total Tests Taken
              </span>
              <p className="text-3xl font-black text-slate-900 mt-1">
                {stats.total}
              </p>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Completed CBT sessions
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Average Score
              </span>
              <p className="text-3xl font-black text-blue-600 mt-1">
                {stats.avgScore}
              </p>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Across all completed attempts
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Average Accuracy
              </span>
              <p className="text-3xl font-black text-emerald-600 mt-1">
                {stats.avgAccuracy}%
              </p>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Correct answers ratio
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Best Score
              </span>
              <p className="text-3xl font-black text-indigo-600 mt-1">
                {stats.bestScore} <span className="text-base text-slate-400 font-normal">/ {peakMaxScore}</span>
              </p>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Peak performance record
              </span>
            </div>
          </div>

          {/* Score Trend & Question Type Breakdown Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* SVG Score-Over-Time Trend Chart */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">
                        Score Progression Trend
                      </h3>
                      <p className="text-xs text-slate-400">
                        Historical test marks over past attempts
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                    Peak: {peakMaxScore} Marks
                  </span>
                </div>

                {/* SVG Chart Container */}
                <div className="w-full h-56 pt-2">
                  {chartPoints.length < 2 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      Complete at least 2 mock tests to plot progression trajectory.
                    </div>
                  ) : (
                    <div className="w-full h-full relative">
                      <svg
                        className="w-full h-full overflow-visible"
                        viewBox="0 0 500 180"
                        preserveAspectRatio="none"
                      >
                        {/* Grid lines */}
                        <line x1="0" y1="20" x2="500" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="0" y1="70" x2="500" y2="70" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="0" y1="120" x2="500" y2="120" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="0" y1="170" x2="500" y2="170" stroke="#e2e8f0" strokeWidth="1" />

                        {/* Area gradient */}
                        <defs>
                          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Calculate path */}
                        {(() => {
                          const width = 500;
                          const height = 150;
                          const maxScore = Math.max(...chartPoints.map((c) => Math.max(c.score, c.maxScore)), 10);
                          const stepX = width / Math.max(1, chartPoints.length - 1);

                          const points = chartPoints.map((pt, idx) => {
                            const x = idx * stepX;
                            const clamped = Math.max(0, Math.min(maxScore, pt.score));
                            const y = 170 - (clamped / maxScore) * height;
                            return { x, y, pt };
                          });

                          const dPath = points.reduce(
                            (acc, p, idx) =>
                              idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`,
                            ''
                          );

                          const dArea = `${dPath} L ${points[points.length - 1].x} 170 L 0 170 Z`;

                          return (
                            <>
                              <path d={dArea} fill="url(#scoreGrad)" />
                              <path
                                d={dPath}
                                fill="none"
                                stroke="#2563eb"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />

                              {/* Nodes */}
                              {points.map((p, idx) => (
                                <g key={idx}>
                                  <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r="5"
                                    className="fill-white stroke-blue-600 stroke-2"
                                  />
                                  <text
                                    x={p.x}
                                    y={p.y - 10}
                                    textAnchor="middle"
                                    className="text-[10px] font-bold fill-slate-700"
                                  >
                                    {p.pt.score}
                                  </text>
                                </g>
                              ))}
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  )}
                </div>
              </div>

              {/* Chart footer labels */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-100">
                <span>First Recorded Attempt</span>
                <span>Latest Attempt</span>
              </div>
            </div>

            {/* Accuracy by Question Type */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      Question Type Mastery
                    </h3>
                    <p className="text-xs text-slate-400">
                      Cognitive dimension breakdown
                    </p>
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  {/* Factual */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-700">Factual Recall</span>
                      <span className="text-blue-600">
                        {stats.typeAccuracy.factual.percent}% ({stats.typeAccuracy.factual.correct}/{stats.typeAccuracy.factual.total})
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${stats.typeAccuracy.factual.percent}%` }}
                      />
                    </div>
                  </div>

                  {/* Conceptual */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-700">Conceptual Understanding</span>
                      <span className="text-indigo-600">
                        {stats.typeAccuracy.conceptual.percent}% ({stats.typeAccuracy.conceptual.correct}/{stats.typeAccuracy.conceptual.total})
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${stats.typeAccuracy.conceptual.percent}%` }}
                      />
                    </div>
                  </div>

                  {/* Application */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-700">Application & Analysis</span>
                      <span className="text-emerald-600">
                        {stats.typeAccuracy.application.percent}% ({stats.typeAccuracy.application.correct}/{stats.typeAccuracy.application.total})
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${stats.typeAccuracy.application.percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 text-[11px] text-slate-500 mt-6 border border-slate-100">
                <span className="font-semibold text-slate-700">Preparation Tip: </span>
                Target your weaker cognitive domains by reviewing detailed solutions below.
              </div>
            </div>
          </div>

          {/* Attempt History Section */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h3 className="font-bold text-slate-900 text-base mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>Examination Attempt History</span>
            </h3>

            <div className="space-y-3">
              {attempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition"
                >
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-900 text-sm">
                      {attempt.testTitle}
                    </h4>
                    <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500">
                      <span>{new Date(attempt.createdAt).toLocaleString()}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formatSeconds(attempt.timeTakenSeconds)}
                      </span>
                    </div>

                    {/* Breakdown Badges */}
                    <div className="flex items-center gap-2 pt-1 text-[11px]">
                      <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                        {attempt.correct} Correct
                      </span>
                      <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded font-semibold">
                        {attempt.incorrect} Incorrect
                      </span>
                      <span className="text-slate-600 bg-slate-200/70 px-2 py-0.5 rounded font-semibold">
                        {attempt.unattempted} Skipped
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4">
                    <div className="text-right">
                      <div className="text-lg font-black text-slate-900">
                        {attempt.score} <span className="text-xs text-slate-400 font-normal">/ {attempt.maxScore}</span>
                      </div>
                      <div className="text-xs font-semibold text-emerald-600">
                        {attempt.accuracy}% Acc
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedAttempt(attempt)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg border border-blue-200 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Review</span>
                      </button>

                      {onRetakeTest && (
                        <button
                          type="button"
                          onClick={() => onRetakeTest(attempt.testId)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-lg transition"
                          title="Retake this test"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Retake</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Review Solutions Modal */}
      {selectedAttempt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Solution Review: {selectedAttempt.testTitle}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Final Score: {selectedAttempt.score} / {selectedAttempt.maxScore} • Accuracy: {selectedAttempt.accuracy}%
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedAttempt(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Questions list */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {selectedAttempt.questionsData?.map((q, idx) => (
                <div
                  key={idx}
                  className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-md bg-slate-800 text-white font-bold text-xs flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {q.type}
                      </span>
                    </div>

                    <div>
                      {q.selectedOption === null ? (
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          Unattempted
                        </span>
                      ) : q.isCorrect ? (
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Correct (+1.0)
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Incorrect (-0.25)
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm font-semibold text-slate-900 mb-3">
                    {q.question}
                  </p>

                  {/* Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                      const isCorrectAnswer = q.correctOption === optKey;
                      const isCandidateChoice = q.selectedOption === optKey;

                      let style = 'bg-white border-slate-200 text-slate-700';
                      if (isCorrectAnswer) {
                        style = 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold';
                      } else if (isCandidateChoice && !isCorrectAnswer) {
                        style = 'bg-rose-50 border-rose-300 text-rose-900 line-through';
                      }

                      return (
                        <div
                          key={optKey}
                          className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${style}`}
                        >
                          <span className="font-bold shrink-0">{optKey}.</span>
                          <span className="flex-1">{q.options[optKey]}</span>
                          {isCorrectAnswer && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          )}
                          {isCandidateChoice && !isCorrectAnswer && (
                            <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Solution Explanation */}
                  <div className="bg-slate-50 rounded-lg p-2.5 text-xs text-slate-600 border border-slate-200">
                    <span className="font-bold text-slate-800">Explanation: </span>
                    {q.explanation}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAttempt(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition"
              >
                Close Solution Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
