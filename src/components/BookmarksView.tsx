import React, { useState, useEffect, useMemo } from 'react';
import {
  Bookmark,
  Zap,
  Trash2,
  Sparkles,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Languages,
  Loader2,
} from 'lucide-react';
import { BookmarkedQuestion, MCQQuestion } from '../types';
import { fetchMyBookmarks, removeBookmark } from '../services/cloudStorageService';
import { useBilingualReview, ReviewDisplayLanguage } from '../hooks/useBilingualReview';

interface BookmarksViewProps {
  onStartPractice: (questions: MCQQuestion[], title: string) => void;
  onExploreTests?: () => void;
}

export const BookmarksView: React.FC<BookmarksViewProps> = ({
  onStartPractice,
  onExploreTests,
}) => {
  const [bookmarks, setBookmarks] = useState<BookmarkedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [expandedSolutions, setExpandedSolutions] = useState<Record<string, boolean>>({});
  const { reviewLang, isTranslating, switchReviewLanguage, getLocalizedQuestion } =
    useBilingualReview();

  useEffect(() => {
    loadBookmarks();
  }, []);

  const loadBookmarks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyBookmarks();
      setBookmarks(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load bookmarked questions');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (bookmarkId: string) => {
    setRemovingId(bookmarkId);
    try {
      await removeBookmark(bookmarkId);
      setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
    } catch (err: any) {
      alert('Failed to remove bookmark. Please try again.');
    } finally {
      setRemovingId(null);
    }
  };

  const toggleSolution = (id: string) => {
    setExpandedSolutions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return bookmarks;
    const query = searchQuery.toLowerCase();
    return bookmarks.filter((b) => {
      const q = b.question;
      return (
        q.question.toLowerCase().includes(query) ||
        b.testTitle.toLowerCase().includes(query) ||
        (q.examName && q.examName.toLowerCase().includes(query)) ||
        (q.year && q.year.toLowerCase().includes(query))
      );
    });
  }, [bookmarks, searchQuery]);

  const handleLaunchPractice = () => {
    const questionsToPractice = filteredBookmarks.map((b) => b.question);
    if (questionsToPractice.length === 0) return;
    onStartPractice(questionsToPractice, 'Bookmarked Questions Revision');
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <h3 className="font-bold text-slate-800 text-sm">Loading your bookmarked questions...</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
          <h3 className="font-bold text-rose-900 text-base">Could not load bookmarks</h3>
          <p className="text-xs text-rose-700">{error}</p>
          <button
            type="button"
            onClick={loadBookmarks}
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
      {/* Banner */}
      <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-xs font-semibold mb-2">
            <Bookmark className="w-3.5 h-3.5 text-amber-100 fill-amber-100" />
            <span>Saved Questions Library</span>
          </div>
          <h1 className="text-2xl font-black text-white">Bookmarked Questions</h1>
          <p className="text-xs sm:text-sm text-amber-100 mt-1 max-w-xl">
            Questions you flagged during tests or practice. Re-test yourself untimed with instant explanations.
          </p>
        </div>

        {bookmarks.length > 0 && (
          <button
            type="button"
            onClick={handleLaunchPractice}
            className="px-5 py-3 rounded-xl bg-white hover:bg-amber-50 text-amber-800 font-bold text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer shrink-0"
          >
            <Zap className="w-4 h-4 fill-amber-600 text-amber-600" />
            <span>Practice Bookmarks ({filteredBookmarks.length})</span>
          </button>
        )}
      </div>

      {bookmarks.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-100">
            <Bookmark className="w-8 h-8 fill-amber-200" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No Bookmarks Saved Yet</h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            When taking tests or studying, tap the bookmark icon on any question to save it for quick revision here.
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
          {/* Search bar & Language Toggle */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search your bookmarked questions or exam names..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <Languages className="w-3.5 h-3.5 text-slate-500 ml-1" />
                {(['Default', 'English', 'Hindi'] as ReviewDisplayLanguage[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() =>
                      switchReviewLanguage(
                        lang,
                        filteredBookmarks.map((b) => b.question)
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

              <div className="text-xs text-slate-500 font-semibold shrink-0">
                {filteredBookmarks.length} saved
              </div>
            </div>
          </div>

          {/* List */}
          <div className="space-y-4">
            {filteredBookmarks.map((bm, idx) => {
              const q = bm.question;
              const isExpanded = expandedSolutions[bm.id] ?? true;
              const { questionText, options: localizedOpts } = getLocalizedQuestion(q);
              const optKeys = (['A', 'B', 'C', 'D', 'E'] as const).filter(
                (k) => k !== 'E' || Boolean(localizedOpts?.E)
              );

              return (
                <div
                  key={bm.id}
                  className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 p-4 sm:p-5 shadow-xs transition space-y-3"
                >
                  {/* Top Bar: Exam, Year, Test Name & Remove */}
                  <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-100">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-6 h-6 rounded-md bg-amber-50 text-amber-800 font-bold text-xs flex items-center justify-center border border-amber-200">
                        #{idx + 1}
                      </span>
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
                      <span className="text-[10px] text-slate-400 truncate max-w-xs">
                        From: {bm.testTitle}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemove(bm.id)}
                      disabled={removingId === bm.id}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition cursor-pointer disabled:opacity-50"
                      title="Remove bookmark"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Remove</span>
                    </button>
                  </div>

                  {/* Question Text */}
                  <div className="text-sm font-semibold text-slate-900 leading-relaxed">
                    {questionText}
                  </div>

                  {/* Options */}
                  <div className="space-y-1.5 pt-1">
                    {optKeys.map((optKey) => {
                      const isCorrect = q.correctOption === optKey;
                      return (
                        <div
                          key={optKey}
                          className={`p-2.5 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                            isCorrect
                              ? 'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-semibold ring-1 ring-emerald-400'
                              : 'border-slate-200 bg-slate-50/50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span
                              className={`w-5 h-5 rounded-md font-bold text-[10px] flex items-center justify-center shrink-0 border mt-0.5 ${
                                isCorrect
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-slate-200 text-slate-700 border-slate-300'
                              }`}
                            >
                              {optKey}
                            </span>
                            <span className="leading-snug pt-0.5">{localizedOpts?.[optKey]}</span>
                          </div>

                          {isCorrect && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded shrink-0">
                              Correct Key
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation Toggle */}
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => toggleSolution(bm.id)}
                      className="w-full flex items-center justify-between text-xs font-bold text-blue-700 hover:text-blue-800 transition py-1"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        Explanation
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-slate-800 leading-relaxed select-text">
                        {q.explanation || 'Refer to the source question document.'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
