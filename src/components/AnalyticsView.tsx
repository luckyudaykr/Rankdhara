import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Award,
  Target,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Calendar,
  Layers,
  ArrowRight,
  AlertTriangle,
  RotateCcw,
  Eye,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { TestAttempt } from '../types';
import { fetchMyAttempts } from '../services/cloudStorageService';
import { inferSubjectAndChapter } from '../services/examCatalogService';
import { AttemptReviewModal } from './AttemptReviewModal';

interface AnalyticsViewProps {
  onRetakeTest?: (testId: string) => void;
  onExploreTests?: () => void;
  onOpenCustomBuilder?: (prefill?: { examId?: string; subject?: string; chapters?: string[] }) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  onRetakeTest,
  onExploreTests,
  onOpenCustomBuilder,
}) => {
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected attempt for full question-by-question review
  const [selectedAttempt, setSelectedAttempt] = useState<TestAttempt | null>(null);

  useEffect(() => {
    loadAttempts();
  }, []);

  const loadAttempts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyAttempts();
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

  // Helper to infer subject (English & Hindi)
  const inferSubject = (title?: string, questionText?: string): string => {
    const combined = `${title || ''} ${questionText || ''}`.toLowerCase();
    if (['physics', 'force', 'watt', 'joule', 'भौतिक', 'मात्रक', 'बल', 'वेग', 'ऊर्जा', 'ध्वनि', 'प्रकाश'].some((k) => combined.includes(k))) return 'Physics';
    if (['chemistry', 'acid', 'reaction', 'रसायन', 'अम्ल', 'क्षार', 'परमाणु', 'धातु'].some((k) => combined.includes(k))) return 'Chemistry';
    if (['biology', 'cell', 'vitamin', 'जीव विज्ञान', 'कोशिका', 'विटामिन', 'रोग', 'हार्मोन'].some((k) => combined.includes(k))) return 'Biology';
    if (['polity', 'article', 'constitution', 'संविधान', 'अनुच्छेद', 'संसद', 'मौलिक अधिकार', 'राष्ट्रपति'].some((k) => combined.includes(k))) return 'Indian Polity & Constitution';
    if (['history', 'dynasty', 'mughal', 'इतिहास', 'हड़प्पा', 'सिंधु', 'मौर्य', 'गुप्त', 'मुगल', 'सल्तनत', 'बरनी', 'पांडुलिपि', 'जातक', 'गांधी'].some((k) => combined.includes(k))) return 'History of India';
    if (['geography', 'river', 'monsoon', 'भूगोल', 'नदी', 'पहाड़ी', 'पर्वत', 'मानसून', 'जलवायु', 'उपमहाद्वीप'].some((k) => combined.includes(k))) return 'Geography';
    if (['economy', 'inflation', 'gdp', 'अर्थव्यवस्था', 'बजट', 'मुद्रास्फीति', 'नीति आयोग'].some((k) => combined.includes(k))) return 'Indian Economy';
    if (['ecology', 'biodiversity', 'पर्यावरण', 'पारिस्थितिकी', 'जैव विविधता', 'राष्ट्रीय उद्यान'].some((k) => combined.includes(k))) return 'Environment & Ecology';
    return 'General Studies';
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
        examStats: [] as Array<{ exam: string; correct: number; total: number; percent: number }>,
        subjectStats: [] as Array<{ subject: string; correct: number; total: number; percent: number }>,
        chapterStats: [] as Array<{ subject: string; chapter: string; correct: number; total: number; percent: number }>,
        weakChapters: [] as Array<{ subject: string; chapter: string; accuracy: number; totalQuestions: number }>,
        weakTopics: [] as Array<{ subject: string; accuracy: number; totalQuestions: number }>,
        bestVsLatestPerTest: [] as Array<{
          testId: string;
          title: string;
          bestScore: number;
          latestScore: number;
          diff: number;
          attemptsCount: number;
        }>,
      };
    }

    const total = attempts.length;
    const totalScore = attempts.reduce((acc, a) => acc + a.score, 0);
    const totalAccuracy = attempts.reduce((acc, a) => acc + a.accuracy, 0);
    const bestScore = Math.max(...attempts.map((a) => a.score));

    // Question type accuracy
    const typeCount = {
      factual: { correct: 0, total: 0 },
      conceptual: { correct: 0, total: 0 },
      application: { correct: 0, total: 0 },
    };

    // Maps for accuracy per exam, subject, chapter
    const examMap = new Map<string, { correct: number; total: number }>();
    const subjectMap = new Map<string, { correct: number; total: number }>();
    const chapterMap = new Map<string, { subject: string; chapter: string; correct: number; total: number }>();

    // Best vs Latest per test
    const testMap = new Map<string, { title: string; scores: number[] }>();

    attempts.forEach((att) => {
      // Record test scores for best vs latest
      if (!testMap.has(att.testId)) {
        testMap.set(att.testId, { title: att.testTitle, scores: [att.score] });
      } else {
        testMap.get(att.testId)!.scores.push(att.score);
      }

      if (Array.isArray(att.questionsData)) {
        att.questionsData.forEach((q) => {
          const type = (q.type || 'factual') as 'factual' | 'conceptual' | 'application';
          if (typeCount[type]) {
            typeCount[type].total += 1;
            if (q.isCorrect) typeCount[type].correct += 1;
          }

          // Exam accuracy
          const exam = (q.examName || (q.examTags && q.examTags[0]) || '').trim();
          if (exam) {
            if (!examMap.has(exam)) examMap.set(exam, { correct: 0, total: 0 });
            const eStat = examMap.get(exam)!;
            eStat.total += 1;
            if (q.isCorrect) eStat.correct += 1;
          }

          // Subject & Chapter accuracy (with Hindi + English fallback inference)
          const needsInference = !q.subject?.trim() || !q.chapter?.trim();
          const inferred = needsInference
            ? inferSubjectAndChapter(q.question || '', `${q.explanation || ''} ${att.testTitle || ''}`)
            : { subject: '', chapter: '' };

          const subj = (q.subject || inferred.subject || inferSubject(att.testTitle, q.question)).trim();
          if (subj) {
            if (!subjectMap.has(subj)) {
              subjectMap.set(subj, { correct: 0, total: 0 });
            }
            const sStat = subjectMap.get(subj)!;
            sStat.total += 1;
            if (q.isCorrect) sStat.correct += 1;
          }

          // Chapter accuracy
          const rawChap = (q.chapter || '').trim();
          const inferredChap =
            inferred.chapter &&
            inferred.chapter.toLowerCase() !== 'general knowledge & current perspectives'
              ? inferred.chapter.trim()
              : '';
          const chap = rawChap || inferredChap;
          if (chap && chap.toLowerCase() !== 'uncategorized') {
            const chapKey = `${subj}:::${chap}`;
            if (!chapterMap.has(chapKey)) {
              chapterMap.set(chapKey, { subject: subj, chapter: chap, correct: 0, total: 0 });
            }
            const cStat = chapterMap.get(chapKey)!;
            cStat.total += 1;
            if (q.isCorrect) cStat.correct += 1;
          }
        });
      }
    });

    const getPercent = (c: number, t: number) => (t > 0 ? Math.round((c / t) * 100) : 0);

    const examStats = Array.from(examMap.entries()).map(([exam, counts]) => ({
      exam,
      correct: counts.correct,
      total: counts.total,
      percent: getPercent(counts.correct, counts.total),
    })).sort((a, b) => b.percent - a.percent);

    const subjectStats = Array.from(subjectMap.entries()).map(([subject, counts]) => ({
      subject,
      correct: counts.correct,
      total: counts.total,
      percent: getPercent(counts.correct, counts.total),
    })).sort((a, b) => b.percent - a.percent);

    const chapterStats = Array.from(chapterMap.values()).map((c) => ({
      subject: c.subject,
      chapter: c.chapter,
      correct: c.correct,
      total: c.total,
      percent: getPercent(c.correct, c.total),
    })).sort((a, b) => b.percent - a.percent);

    // Weak chapters ranked lowest accuracy first
    const weakChapters = [...chapterStats]
      .sort((a, b) => a.percent - b.percent)
      .map((c) => ({
        subject: c.subject,
        chapter: c.chapter,
        accuracy: c.percent,
        totalQuestions: c.total,
      }));

    // Weak topics ranked lowest accuracy first
    const weakTopics = [...subjectStats]
      .sort((a, b) => a.percent - b.percent)
      .map((s) => ({
        subject: s.subject,
        accuracy: s.percent,
        totalQuestions: s.total,
      }));

    // Best vs Latest per test
    const bestVsLatestPerTest = Array.from(testMap.entries()).map(([testId, data]) => {
      // data.scores is newest to oldest because attempts are sorted desc
      const latestScore = data.scores[0];
      const bestScore = Math.max(...data.scores);
      const diff = Math.round((latestScore - data.scores[data.scores.length - 1]) * 10) / 10;
      return {
        testId,
        title: data.title,
        bestScore,
        latestScore,
        diff,
        attemptsCount: data.scores.length,
      };
    });

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
      examStats,
      subjectStats,
      chapterStats,
      weakChapters,
      weakTopics,
      bestVsLatestPerTest,
    };
  }, [attempts]);

  // Chronological score-over-time points for line chart
  const chartPoints = useMemo(() => {
    const chronological = [...attempts].reverse().slice(-12);
    return chronological.map((a, i) => ({
      index: i,
      score: Math.max(0, a.score),
      maxScore: a.maxScore || 10,
      accuracy: a.accuracy,
      date: new Date(a.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
      title: a.testTitle,
    }));
  }, [attempts]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <h3 className="font-bold text-slate-800 text-sm">Analyzing your performance data...</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto" />
          <h3 className="font-bold text-rose-900 text-base">Could not load analytics</h3>
          <p className="text-xs text-rose-700">{error}</p>
          <button
            type="button"
            onClick={loadAttempts}
            className="px-4 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 transition cursor-pointer"
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100">
          <TrendingUp className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">No Test Attempts Yet</h3>
        <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
          Take your first CBT mock test to unlock rich analytics: score-over-time trends, accuracy by subject, and weak topic analysis.
        </p>
        {onExploreTests && (
          <button
            type="button"
            onClick={onExploreTests}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition inline-flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <span>Start a Mock Test</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // SVG Chart Dimensions & Math
  const maxChartScore = Math.max(...chartPoints.map((p) => p.score), 10);
  const chartWidth = 600;
  const chartHeight = 200;
  const paddingX = 40;
  const paddingY = 25;

  const pointsCoordinates = chartPoints.map((pt, idx) => {
    const x =
      chartPoints.length === 1
        ? chartWidth / 2
        : paddingX + (idx / (chartPoints.length - 1)) * (chartWidth - paddingX * 2);
    const y =
      chartHeight -
      paddingY -
      (pt.score / maxChartScore) * (chartHeight - paddingY * 2);
    return { ...pt, x, y };
  });

  const pathD = pointsCoordinates.reduce((acc, curr, idx) => {
    return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
  }, '');

  const areaD =
    pointsCoordinates.length > 0
      ? `${pathD} L ${pointsCoordinates[pointsCoordinates.length - 1].x} ${chartHeight - paddingY} L ${pointsCoordinates[0].x} ${chartHeight - paddingY} Z`
      : '';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black text-slate-900">Performance Analytics</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Track your score progression over time, analyze topic mastery, and inspect test reviews.
        </p>
      </div>

      {/* Top 4 Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Tests Taken
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5 block">
              {stats.total}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Average Score
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5 block">
              {stats.avgScore}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Accuracy
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5 block">
              {stats.avgAccuracy}%
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Best Score
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5 block">
              {(Number(stats.bestScore) || 0).toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* 1. Score-over-Time Line Chart */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span>Score Over Time</span>
            </h3>
            <p className="text-xs text-slate-500">
              Chronological progress across your recent mock examinations
            </p>
          </div>
          <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 self-start sm:self-auto">
            Last {chartPoints.length} Attempts
          </span>
        </div>

        {/* SVG Line Chart */}
        <div className="w-full overflow-x-auto">
          <div className="min-w-[480px]">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-48 select-none"
            >
              <defs>
                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line
                x1={paddingX}
                y1={paddingY}
                x2={chartWidth - paddingX}
                y2={paddingY}
                stroke="#f1f5f9"
                strokeWidth="1"
              />
              <line
                x1={paddingX}
                y1={chartHeight / 2}
                x2={chartWidth - paddingX}
                y2={chartHeight / 2}
                stroke="#f1f5f9"
                strokeWidth="1"
              />
              <line
                x1={paddingX}
                y1={chartHeight - paddingY}
                x2={chartWidth - paddingX}
                y2={chartHeight - paddingY}
                stroke="#e2e8f0"
                strokeWidth="1.5"
              />

              {/* Shaded Area */}
              {areaD && <path d={areaD} fill="url(#scoreGradient)" />}

              {/* Connecting Line */}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data Points */}
              {pointsCoordinates.map((pt, idx) => (
                <g key={idx} className="group cursor-pointer">
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="5"
                    className="fill-white stroke-blue-600 stroke-[3] group-hover:r-[7] transition-all"
                  />
                  {/* Score Label above dot */}
                  <text
                    x={pt.x}
                    y={pt.y - 10}
                    textAnchor="middle"
                    className="text-[10px] font-bold fill-slate-800"
                  >
                    {(Number(pt.score) || 0).toFixed(1)}
                  </text>
                  {/* Date label on X axis */}
                  <text
                    x={pt.x}
                    y={chartHeight - 6}
                    textAnchor="middle"
                    className="text-[9px] font-medium fill-slate-400"
                  >
                    {pt.date}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>

      {/* Accuracy by Exam (Target Competitive Exams) */}
      {Boolean(stats.examStats && stats.examStats.length > 0) && (
        <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-blue-600" />
                <span>Accuracy by Exam</span>
              </h3>
              <p className="text-xs text-slate-500">
                Your performance track across different competitive examinations
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {(stats.examStats || []).map((item) => (
              <div
                key={item.exam}
                className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 truncate">{item.exam}</span>
                  <span className="font-black text-slate-900">{item.percent}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      item.percent >= 70
                        ? 'bg-emerald-500'
                        : item.percent >= 50
                        ? 'bg-blue-600'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                  <span>
                    {item.correct} / {item.total} correct
                  </span>
                  {onOpenCustomBuilder && (
                    <button
                      onClick={() => onOpenCustomBuilder({ examId: item.exam })}
                      className="text-blue-600 hover:underline font-bold text-[10px]"
                    >
                      Practice Exam &rarr;
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2 & 3. Accuracy by Subject & Question Type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Accuracy by Subject */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
          <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-600" />
            <span>Accuracy by Subject</span>
          </h3>

          <div className="space-y-3.5">
            {stats.subjectStats.map((item) => (
              <div key={item.subject} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">{item.subject}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-[11px]">
                      {item.correct}/{item.total} correct
                    </span>
                    <span className="font-bold text-slate-900 w-10 text-right">
                      {item.percent}%
                    </span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      item.percent >= 70
                        ? 'bg-emerald-500'
                        : item.percent >= 50
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Accuracy by Question Type */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
          <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" />
            <span>Accuracy by Question Type</span>
          </h3>

          <div className="space-y-3">
            {[
              {
                label: 'Factual Questions',
                sub: 'Definitions, key dates, properties & terminology',
                data: stats.typeAccuracy.factual,
                color: 'bg-blue-600',
              },
              {
                label: 'Conceptual Questions',
                sub: 'Underlying principles, cause-and-effect & mechanisms',
                data: stats.typeAccuracy.conceptual,
                color: 'bg-indigo-600',
              },
              {
                label: 'Application & Analytical',
                sub: 'Calculations, comparative deductions & scenarios',
                data: stats.typeAccuracy.application,
                color: 'bg-purple-600',
              },
            ].map((row) => (
              <div key={row.label} className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">{row.label}</h4>
                    <p className="text-[10px] text-slate-500">{row.sub}</p>
                  </div>
                  <span className="text-sm font-bold text-slate-900 shrink-0">
                    {row.data.percent}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${row.color}`}
                    style={{ width: `${row.data.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Accuracy by Chapter */}
      {Boolean(stats.chapterStats && stats.chapterStats.length > 0) && (
        <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Accuracy by Chapter</span>
              </h3>
              <p className="text-xs text-slate-500">
                Chapter-level mastery based on your submitted answers
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {(stats.chapterStats || []).map((item) => (
              <div
                key={`${item.subject}::${item.chapter}`}
                className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 truncate max-w-[180px]">{item.chapter}</span>
                  <span className="font-black text-slate-900">{item.percent}%</span>
                </div>
                <div className="text-[10px] text-blue-700 font-semibold uppercase tracking-wider">
                  {item.subject}
                </div>
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      item.percent >= 70
                        ? 'bg-emerald-500'
                        : item.percent >= 50
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                  <span>
                    {item.correct} / {item.total} correct
                  </span>
                  {onOpenCustomBuilder && (
                    <button
                      onClick={() =>
                        onOpenCustomBuilder({
                          subject: item.subject,
                          chapters: [item.chapter],
                        })
                      }
                      className="text-blue-600 hover:underline font-bold text-[10px]"
                    >
                      Practice &rarr;
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Weak Chapters List (Lowest Accuracy First) */}
      {Boolean(stats.weakChapters && stats.weakChapters.length > 0) && (
        <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Weak Chapters</span>
              </h3>
              <p className="text-xs text-slate-500">
                Ranked with lowest accuracy first so you can prioritize revision
              </p>
            </div>

            {onOpenCustomBuilder && (
              <button
                onClick={() => {
                  const weakNames = (stats.weakChapters || []).slice(0, 3).map((w) => w.chapter);
                  const topSubject = (stats.weakChapters || [])[0]?.subject;
                  onOpenCustomBuilder({
                    subject: topSubject,
                    chapters: weakNames,
                  });
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95 self-start sm:self-auto"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                <span>Practice Weak Chapters</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(stats.weakChapters || []).map((item, idx) => {
              const isCritical = item.accuracy < 50;
              const isModerate = item.accuracy >= 50 && item.accuracy < 70;

              return (
                <div
                  key={`${item.subject}::${item.chapter}`}
                  className={`p-4 rounded-2xl border transition flex flex-col justify-between ${
                    isCritical
                      ? 'bg-rose-50/60 border-rose-200'
                      : isModerate
                      ? 'bg-amber-50/60 border-amber-200'
                      : 'bg-emerald-50/60 border-emerald-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Rank #{idx + 1}
                      </span>
                      <span
                        className={`text-xs font-black px-2 py-0.5 rounded-full ${
                          isCritical
                            ? 'bg-rose-100 text-rose-800'
                            : isModerate
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {item.accuracy}% Accuracy
                      </span>
                    </div>

                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block mt-2">
                      {item.subject}
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 mt-0.5">{item.chapter}</h4>
                    <p className="text-[11px] text-slate-600 mt-1">
                      {item.totalQuestions} questions attempted
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200/50 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-500">
                      {isCritical ? 'High Priority' : isModerate ? 'Moderate' : 'Good Progress'}
                    </span>
                    {onOpenCustomBuilder && (
                      <button
                        onClick={() =>
                          onOpenCustomBuilder({
                            subject: item.subject,
                            chapters: [item.chapter],
                          })
                        }
                        className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        Practice Chapter
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Best vs Latest Score per Test */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
          <Award className="w-4 h-4 text-blue-600" />
          <span>Best vs. Latest Score Comparison</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="pb-3 pl-2">Test Name</th>
                <th className="pb-3 text-center">Attempts</th>
                <th className="pb-3 text-center">Best Score</th>
                <th className="pb-3 text-center">Latest Score</th>
                <th className="pb-3 text-center">Progression</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.bestVsLatestPerTest.map((row) => (
                <tr key={row.testId} className="hover:bg-slate-50/70 transition">
                  <td className="py-3.5 pl-2 font-bold text-slate-900 max-w-xs truncate">
                    {row.title}
                  </td>
                  <td className="py-3.5 text-center text-slate-600 font-medium">
                    {row.attemptsCount}
                  </td>
                  <td className="py-3.5 text-center">
                    <span className="font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {typeof row.bestScore === 'number' ? row.bestScore.toFixed(1) : '-'}
                    </span>
                  </td>
                  <td className="py-3.5 text-center font-bold text-blue-700">
                    {typeof row.latestScore === 'number' ? row.latestScore.toFixed(1) : '-'}
                  </td>
                  <td className="py-3.5 text-center">
                    {row.diff > 0 ? (
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">
                        +{row.diff}
                      </span>
                    ) : row.diff < 0 ? (
                      <span className="text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded text-[11px]">
                        {row.diff}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Attempt History (Tapping opens question-by-question review) */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>Attempt History</span>
            </h3>
            <p className="text-xs text-slate-500">
              Tap any test attempt below to open the complete question-by-question review
            </p>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {attempts.length} attempts recorded
          </span>
        </div>

        <div className="space-y-3">
          {attempts.map((att) => (
            <div
              key={att.id}
              onClick={() => setSelectedAttempt(att)}
              className="p-4 rounded-2xl border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer bg-white group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-slate-900 group-hover:text-blue-700 transition">
                    {att.testTitle}
                  </h4>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                    {att.accuracy}% Accuracy
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>
                    {new Date(att.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span>•</span>
                  <span>
                    Time: {Math.floor(att.timeTakenSeconds / 60)}m {att.timeTakenSeconds % 60}s
                  </span>
                  <span>•</span>
                  <span>
                    {att.correct} Correct, {att.incorrect} Wrong, {att.unattempted} Skipped
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Score
                  </span>
                  <span className="text-lg font-black text-slate-900">
                    {Number(att?.score ?? 0).toFixed(1)} / {Number(att?.maxScore ?? 0).toFixed(1)}
                  </span>
                </div>

                <div className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 font-bold text-xs flex items-center gap-1 group-hover:bg-blue-600 group-hover:text-white transition">
                  <Eye className="w-3.5 h-3.5" />
                  <span>Review</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Attempt Review Modal */}
      <AttemptReviewModal
        attempt={selectedAttempt}
        isOpen={Boolean(selectedAttempt)}
        onClose={() => setSelectedAttempt(null)}
      />
    </div>
  );
};
