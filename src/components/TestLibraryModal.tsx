import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Calendar,
  Clock,
  Sparkles,
  Play,
  RotateCcw,
  X,
  AlertCircle,
  FileQuestion,
  ChevronRight,
  Shield,
  Loader2,
} from 'lucide-react';
import { CloudTestSummary, CloudSavedTest, MCQQuestion, TestSettings } from '../types';
import { fetchSavedTests, fetchTestById } from '../services/cloudStorageService';

interface TestLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartSavedTest: (
    questions: MCQQuestion[],
    settings: TestSettings,
    documentName: string
  ) => void;
}

export const TestLibraryModal: React.FC<TestLibraryModalProps> = ({
  isOpen,
  onClose,
  onStartSavedTest,
}) => {
  const [tests, setTests] = useState<CloudTestSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingTestId, setLoadingTestId] = useState<string | null>(null);

  const loadTests = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchSavedTests(1, 50);
      setTests(result.tests);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch saved tests from the library');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTests();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartTest = async (testSummary: CloudTestSummary) => {
    setLoadingTestId(testSummary.id);
    setError(null);
    try {
      const fullTest: CloudSavedTest = await fetchTestById(testSummary.id);

      // Map CloudSavedQuestion to MCQQuestion format for TestScreen
      const mappedQuestions: MCQQuestion[] = fullTest.questions.map((q, idx) => ({
        ...q,
        id: typeof q.id === 'number' ? q.id : parseInt(String(q.id || idx + 1), 10) || idx + 1,
        question: q.question,
        questionHindi: q.questionHindi,
        questionEnglish: q.questionEnglish,
        optionsHindi: q.optionsHindi,
        optionsEnglish: q.optionsEnglish,
        passage: q.passage,
        data: q.data || (q as any).passageData,
        passageImage: q.passageImage,
        type: q.type || 'factual',
        options: q.options,
        correctOption: q.correctOption,
        explanation: q.explanation,
        sourcePages: q.sourcePages,
      }));

      const settings: TestSettings = {
        difficulty: (fullTest.difficulty as any) || 'Medium',
        language: (fullTest.language as any) || 'English',
        durationMinutes: fullTest.durationMinutes || 10,
        positiveMarks: fullTest.markingCorrect ?? 1.0,
        negativeMarks: fullTest.markingWrong ?? 0.25,
      };

      onStartSavedTest(mappedQuestions, settings, fullTest.title);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not load test details');
    } finally {
      setLoadingTestId(null);
    }
  };

  const formatDate = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-scale-up">
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">Test Library</h3>
                <span className="text-[11px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded">
                  Cloud Backend
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Launch any saved mock test instantly without calling Gemini again
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadTests}
              disabled={isLoading}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Refresh"
            >
              <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-50 border-b border-red-200 text-red-700 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-xs underline font-medium text-red-800 hover:text-red-950"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Content list */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3 bg-slate-50/50">
          {isLoading && tests.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              <span>Loading saved tests from Firestore...</span>
            </div>
          ) : tests.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500">
              <FileQuestion className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-700 text-sm">No saved tests yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Generate your first 10-question mock test from any PDF or sample topic, and it will be
                automatically saved here.
              </p>
            </div>
          ) : (
            tests.map((test) => {
              const isStarting = loadingTestId === test.id;

              return (
                <div
                  key={test.id}
                  className="bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition truncate">
                        {test.title}
                      </h4>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {test.difficulty}
                      </span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {test.language}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                        {test.questionCount} Questions
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {test.durationMinutes} mins
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(test.createdAt)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleStartTest(test)}
                    disabled={isStarting}
                    className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm shrink-0 disabled:bg-blue-300"
                  >
                    {isStarting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Loading...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start Test</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            <span>Server-side Firestore persistence (zero PDF content stored)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
