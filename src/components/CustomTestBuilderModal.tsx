import React, { useState, useEffect, useMemo } from 'react';
import {
  CatalogExam,
  CloudSavedTest,
  CustomTestFilter,
  TestAttempt,
} from '../types';
import { buildCustomTestAPI } from '../services/cloudStorageService';
import {
  X,
  Sparkles,
  Sliders,
  GraduationCap,
  BookOpen,
  Calendar,
  Layers,
  Clock,
  Play,
  AlertCircle,
  CheckCircle2,
  Check,
} from 'lucide-react';

interface CustomTestBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalogExams: CatalogExam[];
  availableSubjects: string[];
  availableChapters: Array<{ subject: string; chapter: string }>;
  userAttempts: TestAttempt[];
  prefill?: {
    examId?: string;
    examIds?: string[];
    subject?: string;
    chapters?: string[];
  };
  onStartBuiltTest: (test: CloudSavedTest, mode: 'mock' | 'practice') => void;
}

export const CustomTestBuilderModal: React.FC<CustomTestBuilderModalProps> = ({
  isOpen,
  onClose,
  catalogExams,
  availableSubjects,
  availableChapters,
  userAttempts,
  prefill,
  onStartBuiltTest,
}) => {
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [yearMin, setYearMin] = useState<number | undefined>(undefined);
  const [yearMax, setYearMax] = useState<number | undefined>(undefined);
  const [difficulty, setDifficulty] = useState<string>('all');
  const [language, setLanguage] = useState<string>('all');
  const [questionCount, setQuestionCount] = useState<number>(20);
  const [testMode, setTestMode] = useState<'mock' | 'practice'>('mock');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Apply prefill whenever modal opens or prefill changes
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setNotice(null);
      if (prefill?.examId) {
        setSelectedExamIds([prefill.examId]);
      } else if (prefill?.examIds) {
        setSelectedExamIds(prefill.examIds);
      } else {
        setSelectedExamIds([]);
      }

      if (prefill?.subject) {
        setSelectedSubject(prefill.subject);
      } else {
        setSelectedSubject('all');
      }

      if (prefill?.chapters && prefill.chapters.length > 0) {
        setSelectedChapters(prefill.chapters);
      } else {
        setSelectedChapters([]);
      }

      setQuestionCount(20);
      setTestMode('mock');
      setDifficulty('all');
      setLanguage('all');
      setYearMin(undefined);
      setYearMax(undefined);
    }
  }, [isOpen, prefill]);

  // Available chapters for the selected subject
  const chaptersForSubject = useMemo(() => {
    if (selectedSubject === 'all') {
      return availableChapters.map((c) => c.chapter);
    }
    return availableChapters
      .filter((c) => c.subject.toLowerCase() === selectedSubject.toLowerCase())
      .map((c) => c.chapter);
  }, [selectedSubject, availableChapters]);

  const toggleExam = (id: string) => {
    setSelectedExamIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleChapter = (ch: string) => {
    setSelectedChapters((prev) =>
      prev.includes(ch) ? prev.filter((x) => x !== ch) : [...prev, ch]
    );
  };

  const selectAllChapters = () => {
    setSelectedChapters(chaptersForSubject);
  };

  const clearChapters = () => {
    setSelectedChapters([]);
  };

  const handleCreate = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const selectedExamNames = selectedExamIds.map((id) => {
        const found = catalogExams.find((e) => e.id === id);
        return found ? found.shortName || found.name : id;
      });

      const filterPayload: CustomTestFilter = {
        examNames: selectedExamNames.length > 0 ? selectedExamNames : undefined,
        subject: selectedSubject !== 'all' ? selectedSubject : undefined,
        chapters: selectedChapters.length > 0 ? selectedChapters : undefined,
        yearStart: yearMin ? Number(yearMin) : undefined,
        yearEnd: yearMax ? Number(yearMax) : undefined,
        difficulty: (difficulty !== 'all' ? (difficulty as 'Easy' | 'Medium' | 'Hard') : undefined),
        language: (language !== 'all' ? (language as 'English' | 'Hindi') : undefined),
        questionCount: Math.min(100, Math.max(5, questionCount)),
        mode: testMode,
        preferUnattempted: true,
      };

      const result = await buildCustomTestAPI(filterPayload);

      if (!result.success || !result.test || result.test.questions.length === 0) {
        setError('No questions found matching your filter criteria. Please broaden your selection.');
        setLoading(false);
        return;
      }

      if (result.notice) {
        setNotice(result.notice);
      }

      // Small pause if notice exists so user can see it, or start immediately
      setTimeout(() => {
        onStartBuiltTest(result.test, testMode);
        onClose();
      }, result.notice ? 1200 : 100);
    } catch (err: any) {
      setError(err.message || 'Failed to assemble custom test');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-800">
                Custom Test Builder
              </h2>
              <p className="text-xs text-slate-500">
                Create a customized mock or practice test tailored to your goals.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-800 text-xs sm:text-sm">
          {/* Notice Banner */}
          {notice && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Target Exams */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
              Target Exams {selectedExamIds.length > 0 && `(${selectedExamIds.length} selected)`}
            </label>
            <p className="text-[11px] text-slate-500 mb-2">
              Select one or more exams, or leave blank to include all exams.
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-200">
              {catalogExams.map((exam) => {
                const isSelected = selectedExamIds.includes(exam.id);
                return (
                  <button
                    key={exam.id}
                    type="button"
                    onClick={() => toggleExam(exam.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm font-semibold'
                        : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                    <span>{exam.shortName || exam.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Subject Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                Subject
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => {
                  setSelectedSubject(e.target.value);
                  setSelectedChapters([]);
                }}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="all">All Subjects (Mixed)</option>
                {availableSubjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Language */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="all">Any Language</option>
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
              </select>
            </div>
          </div>

          {/* 3. Chapters (if any available) */}
          {chaptersForSubject.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  Chapters {selectedChapters.length > 0 && `(${selectedChapters.length} selected)`}
                </label>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={selectAllChapters}
                    className="text-blue-600 hover:underline font-semibold"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={clearChapters}
                    className="text-slate-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                {chaptersForSubject.map((ch) => {
                  const isSelected = selectedChapters.includes(ch);
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => toggleChapter(ch)}
                      className={`px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1 text-left ${
                        isSelected
                          ? 'bg-blue-600 text-white font-semibold shadow-sm'
                          : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white flex-shrink-0" />}
                      <span className="truncate max-w-[200px]">{ch}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Year Range & Difficulty */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                Year Range (Optional)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="From (e.g. 1995)"
                  value={yearMin || ''}
                  onChange={(e) => setYearMin(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-1/2 px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white"
                />
                <span className="text-slate-400 font-bold">-</span>
                <input
                  type="number"
                  placeholder="To (e.g. 2024)"
                  value={yearMax || ''}
                  onChange={(e) => setYearMax(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-1/2 px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Difficulty
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="all">Any Difficulty</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
          </div>

          {/* 5. Number of Questions (5 to 100, default 20) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-blue-600" />
                Number of Questions
              </label>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-black text-xs">
                {questionCount} Questions
              </span>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="flex-1 accent-blue-600"
              />
              <div className="flex items-center gap-1">
                {[10, 20, 50, 100].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setQuestionCount(preset)}
                    className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                      questionCount === preset
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Select between 5 and 100 questions. Questions you have not attempted yet are prioritized first.
            </p>
          </div>

          {/* 6. Mode: Timed Mock vs Practice */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Choose Test Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => setTestMode('mock')}
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                  testMode === 'mock'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-slate-800 text-sm">Timed Mock Test</span>
                  </div>
                  {testMode === 'mock' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                </div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Real CBT exam environment with countdown timer, question palette, and full analysis upon submission.
                </p>
              </div>

              <div
                onClick={() => setTestMode('practice')}
                className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                  testMode === 'practice'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-slate-800 text-sm">Untimed Practice</span>
                  </div>
                  {testMode === 'practice' && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
                </div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Immediate answer verification and in-depth explanations displayed after every single question.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleCreate}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Assembling Questions...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Start {testMode === 'mock' ? 'Mock Test' : 'Practice'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
