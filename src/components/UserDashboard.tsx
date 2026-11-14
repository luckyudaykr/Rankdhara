import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  BookOpen,
  Clock,
  Award,
  ChevronRight,
  TrendingUp,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Filter,
  RefreshCw,
  Zap,
  Star,
  Trash2,
  X,
  Bookmark,
  Layers,
  Play,
  ArrowRight,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import {
  CloudTestSummary,
  CloudSavedTest,
  UserProfile,
  MCQQuestion,
  TestSettings,
  TestAttempt,
  BookmarkedQuestion,
  CatalogExam,
  BrowseSummary,
} from '../types';
import {
  fetchSavedTests,
  fetchTestById,
  fetchMyAttempts,
  fetchMyBookmarks,
  fetchBrowseSummary,
  fetchCatalogExams,
  fetchActiveTestProgress,
  clearActiveTestProgress,
} from '../services/cloudStorageService';
import { QuizCard } from './QuizCard';
import { TestDetailsModal } from './TestDetailsModal';
import { AnalyticsView } from './AnalyticsView';
import { MistakesNotebook } from './MistakesNotebook';
import { BookmarksView } from './BookmarksView';
import { UserProfileView } from './UserProfileView';
import { BottomNavBar, UserNavTab } from './BottomNavBar';
import { BrowseSection } from './BrowseSection';
import { ExamDetailPage } from './ExamDetailPage';
import { CustomTestBuilderModal } from './CustomTestBuilderModal';

interface UserDashboardProps {
  user: UserProfile;
  onStartTest: (
    questions: MCQQuestion[],
    settings: TestSettings,
    title: string,
    testId: string
  ) => void;
  onStartStudy?: (
    questions: MCQQuestion[],
    title: string,
    testId?: string
  ) => void;
  onNavigateToPerformance: () => void;
  onLogout: () => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  user,
  onStartTest,
  onStartStudy,
  onNavigateToPerformance,
  onLogout,
}) => {
  // Navigation tab: 'home' | 'tests' | 'analytics' | 'mistakes' | 'profile' | 'bookmarks'
  const [activeTab, setActiveTab] = useState<UserNavTab>('home');

  const [tests, setTests] = useState<CloudTestSummary[]>([]);
  const [totalTests, setTotalTests] = useState<number>(0);
  const [testsPage, setTestsPage] = useState<number>(1);
  const [loadingMoreTests, setLoadingMoreTests] = useState<boolean>(false);
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected test for Test Details modal
  const [selectedDetailsTest, setSelectedDetailsTest] = useState<CloudTestSummary | null>(null);

  // Unfinished test progress in localStorage
  const [inProgressState, setInProgressState] = useState<{
    testId?: string;
    testTitle?: string;
    currentIndex?: number;
    answeredCount?: number;
    totalCount?: number;
    updatedAt?: string;
  } | null>(null);

  // Filters for Tests Page
  const [searchQuery, setSearchQuery] = useState('');
  const [examFilter, setExamFilter] = useState<string>('All');
  const [yearFilter, setYearFilter] = useState<string>('All');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');
  const [difficultyFilter, setDifficultyFilter] = useState<'All' | 'Easy' | 'Medium' | 'Hard'>('All');
  const [languageFilter, setLanguageFilter] = useState<'All' | 'English' | 'Hindi'>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'not_attempted' | 'completed'>('All');
  const [sortBy, setSortBy] = useState<'newest' | 'most_attempted' | 'most_questions'>('newest');

  // Exam chip filter row at top of Tests tab
  const [selectedExamChip, setSelectedExamChip] = useState<string>('All');

  // Browse section data
  const [browseSummary, setBrowseSummary] = useState<BrowseSummary | null>(null);
  const [catalogExams, setCatalogExams] = useState<CatalogExam[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState<string | null>(null);

  // Active Exam Detail Page view (when tapping an exam card)
  const [selectedExamView, setSelectedExamView] = useState<{ examId: string; examName: string } | null>(null);

  // Custom Test Builder Modal state
  const [isCustomBuilderOpen, setIsCustomBuilderOpen] = useState(false);
  const [customBuilderPrefill, setCustomBuilderPrefill] = useState<{
    examId?: string;
    examIds?: string[];
    subject?: string;
    chapters?: string[];
  } | undefined>(undefined);

  // Loading test launching state
  const [loadingTestId, setLoadingTestId] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
    checkInProgressTest();
  }, []);

  const checkInProgressTest = async () => {
    let localParsed: any = null;
    try {
      const raw = localStorage.getItem('cbt_active_test_progress');
      if (raw) {
        localParsed = JSON.parse(raw);
        setInProgressState(localParsed);
      } else {
        setInProgressState(null);
      }
    } catch {
      setInProgressState(null);
    }

    const cloudProgress = await fetchActiveTestProgress().catch(() => null);
    if (cloudProgress && (cloudProgress.testId || cloudProgress.testTitle)) {
      const localTime = localParsed?.updatedAt ? new Date(localParsed.updatedAt).getTime() : 0;
      const cloudTime = cloudProgress.updatedAt ? new Date(cloudProgress.updatedAt).getTime() : 0;
      const shouldAdoptCloud =
        !localParsed ||
        cloudTime > localTime ||
        (!localParsed.questionStates && Array.isArray(cloudProgress.questionStates));
      if (shouldAdoptCloud) {
        try {
          localStorage.setItem('cbt_active_test_progress', JSON.stringify(cloudProgress));
        } catch {}
        setInProgressState(cloudProgress);
      }
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    setBrowseLoading(true);
    setBrowseError(null);

    try {
      const [testsRes, attemptsRes, browseResult, catalogRes] = await Promise.all([
        fetchSavedTests(1, 50, false), // published tests paginated (50 per page)
        fetchMyAttempts().catch(() => [] as TestAttempt[]),
        fetchBrowseSummary()
          .then((data) => ({ data, error: null as string | null }))
          .catch((err: any) => ({
            data: null as BrowseSummary | null,
            error: err?.message || 'Failed to load browse summary',
          })),
        fetchCatalogExams(false).catch(() => []),
      ]);

      setTests(testsRes.tests);
      setTotalTests(testsRes.total || testsRes.tests.length);
      setTestsPage(1);
      setAttempts(attemptsRes);
      if (browseResult.error) {
        setBrowseSummary(null);
        setBrowseError(browseResult.error);
      } else {
        setBrowseSummary(browseResult.data);
        setBrowseError(null);
      }
      setCatalogExams(catalogRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load examination catalog');
      setBrowseSummary(null);
      setBrowseError(err.message || 'Failed to load browse summary');
    } finally {
      setLoading(false);
      setBrowseLoading(false);
    }
  };

  const handleLoadMoreTests = async () => {
    if (loadingMoreTests || tests.length >= totalTests) return;
    setLoadingMoreTests(true);
    try {
      const nextPage = testsPage + 1;
      const res = await fetchSavedTests(nextPage, 50, false);
      setTests((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const merged = [...prev];
        res.tests.forEach((t) => {
          if (!seen.has(t.id)) {
            seen.add(t.id);
            merged.push(t);
          }
        });
        return merged;
      });
      setTotalTests(res.total || totalTests);
      setTestsPage(nextPage);
    } catch (err: any) {
      console.warn('Load more tests failed:', err?.message || err);
    } finally {
      setLoadingMoreTests(false);
    }
  };

  const handleStartBuiltTest = (customTest: CloudSavedTest, mode: 'mock' | 'practice') => {
    const convertedQuestions: MCQQuestion[] = customTest.questions.map((q, idx) => ({
      ...q,
      id: typeof q.id === 'number' ? q.id : parseInt(String(q.id || idx + 1), 10) || idx + 1,
      question: q.question,
      questionHindi: q.questionHindi,
      questionEnglish: q.questionEnglish,
      optionsHindi: q.optionsHindi,
      optionsEnglish: q.optionsEnglish,
      passage: q.passage,
      data: q.data || q.passageData,
      passageImage: q.passageImage,
      type: q.type || 'factual',
      options: q.options,
      correctOption: q.correctOption,
      explanation: q.explanation,
      sourcePages: q.sourcePages,
      examName: q.examName || customTest.examName,
      year: q.year || customTest.year,
    }));

    if (mode === 'practice') {
      if (onStartStudy) {
        onStartStudy(convertedQuestions, customTest.title, customTest.id);
      }
      return;
    }

    const settings: TestSettings = {
      difficulty: (customTest.difficulty as any) || 'Medium',
      language: (customTest.language as any) || 'English',
      durationMinutes: customTest.durationMinutes || 15,
      positiveMarks: customTest.markingCorrect ?? 1.0,
      negativeMarks: customTest.markingWrong ?? 0.25,
    };

    onStartTest(convertedQuestions, settings, customTest.title, customTest.id);
  };

  const handleStartChapterTest = (subject: string, chapter: string, mode: 'mock' | 'practice') => {
    // Check if ready-made test exists in tests
    const readyMade = tests.find(
      (t) =>
        t.chapter === chapter ||
        t.title.toLowerCase().includes(chapter.toLowerCase())
    );
    if (readyMade) {
      if (mode === 'mock') {
        handleLaunchMock(readyMade);
      } else {
        handleLaunchPractice(readyMade);
      }
      return;
    }
    // Otherwise open custom test builder prefilled
    setCustomBuilderPrefill({ subject, chapters: [chapter] });
    setIsCustomBuilderOpen(true);
  };

  // Helper to infer subject
  const inferSubject = (title: string): string => {
    const t = title.toLowerCase();
    if (t.includes('physics')) return 'Physics';
    if (t.includes('biology')) return 'Biology';
    if (t.includes('chemistry')) return 'Chemistry';
    if (t.includes('polity') || t.includes('constitution')) return 'Polity';
    if (t.includes('history')) return 'History';
    if (t.includes('geography')) return 'Geography';
    return 'General Studies';
  };

  // Unique filter values derived from tests
  const uniqueExams = useMemo(() => {
    const set = new Set<string>();
    tests.forEach((t) => {
      if (t.examNamesFound && t.examNamesFound.length > 0) {
        t.examNamesFound.forEach((e) => set.add(e.trim()));
      } else if (t.examName?.trim()) {
        t.examName.split(',').forEach((e) => set.add(e.trim()));
      }
    });
    return ['All', ...Array.from(set).filter(Boolean)];
  }, [tests]);

  const uniqueYears = useMemo(() => {
    const set = new Set<string>();
    tests.forEach((t) => {
      if (t.yearsFound && t.yearsFound.length > 0) {
        t.yearsFound.forEach((y) => set.add(y.trim()));
      } else if (t.year?.trim()) {
        const matches = t.year.match(/\b(19\d{2}|20\d{2})\b/g);
        if (matches) matches.forEach((m) => set.add(m));
        else set.add(t.year.trim());
      }
    });
    return ['All', ...Array.from(set).filter(Boolean).sort().reverse()];
  }, [tests]);

  const uniqueSubjects = useMemo(() => {
    const set = new Set<string>();
    tests.forEach((t) => {
      set.add(inferSubject(t.title));
    });
    return ['All', ...Array.from(set)];
  }, [tests]);

  // Overall User Stats for Home
  const { totalAttempts, avgScore, avgAccuracy, bestScore } = useMemo(() => {
    if (!attempts || attempts.length === 0) {
      return { totalAttempts: 0, avgScore: '0.0', avgAccuracy: '0', bestScore: '0.0' };
    }
    const total = attempts.length;
    const sumScore = attempts.reduce((acc, a) => acc + (typeof a?.score === 'number' ? a.score : Number(a?.score) || 0), 0);
    const sumAcc = attempts.reduce((acc, a) => acc + (typeof a?.accuracy === 'number' ? a.accuracy : Number(a?.accuracy) || 0), 0);
    const scores = attempts.map((a) => (typeof a?.score === 'number' ? a.score : Number(a?.score) || 0));
    const best = scores.length > 0 ? Math.max(...scores) : 0;

    return {
      totalAttempts: total,
      avgScore: (sumScore / total).toFixed(1),
      avgAccuracy: Math.round(sumAcc / total).toString(),
      bestScore: (best ?? 0).toFixed(1),
    };
  }, [attempts]);

  // Filtered Tests
  const filteredTests = useMemo(() => {
    return tests
      .filter((t) => {
        // Search
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesTitle = t.title.toLowerCase().includes(q);
          const matchesExam = t.examName?.toLowerCase().includes(q) || t.examNamesFound?.some((e) => e.toLowerCase().includes(q));
          const matchesYear = t.year?.toLowerCase().includes(q) || t.yearsFound?.some((y) => y.includes(q));
          const matchesSubject = inferSubject(t.title).toLowerCase().includes(q);
          if (!matchesTitle && !matchesExam && !matchesYear && !matchesSubject) return false;
        }

        // Exam Chip Filter (top chip row)
        if (selectedExamChip !== 'All') {
          const chipNorm = selectedExamChip.toLowerCase();
          const matchesChip =
            (t.examName && t.examName.toLowerCase().includes(chipNorm)) ||
            (t.examNamesFound && t.examNamesFound.some((e) => e.toLowerCase().includes(chipNorm))) ||
            (t.title && t.title.toLowerCase().includes(chipNorm));
          if (!matchesChip) return false;
        }

        // Exam Filter
        if (examFilter !== 'All') {
          const hasExam =
            t.examNamesFound?.includes(examFilter) ||
            t.examName?.toLowerCase().includes(examFilter.toLowerCase());
          if (!hasExam) return false;
        }

        // Year Filter
        if (yearFilter !== 'All') {
          const hasYear =
            t.yearsFound?.includes(yearFilter) ||
            t.year?.includes(yearFilter);
          if (!hasYear) return false;
        }

        // Subject Filter
        if (subjectFilter !== 'All') {
          if (inferSubject(t.title) !== subjectFilter) return false;
        }

        // Difficulty Filter
        if (difficultyFilter !== 'All' && t.difficulty !== difficultyFilter) {
          return false;
        }

        // Language Filter
        if (languageFilter !== 'All' && t.language !== languageFilter) {
          return false;
        }

        // Status Filter: not_attempted / completed
        const isAttempted = typeof t.bestScore === 'number' || typeof t.latestScore === 'number';
        if (statusFilter === 'not_attempted' && isAttempted) return false;
        if (statusFilter === 'completed' && !isAttempted) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (sortBy === 'most_questions') {
          return b.questionCount - a.questionCount;
        }
        // most_attempted: test with attempts first
        const aAttempts = typeof a.bestScore === 'number' ? 1 : 0;
        const bAttempts = typeof b.bestScore === 'number' ? 1 : 0;
        return bAttempts - aAttempts;
      });
  }, [
    tests,
    searchQuery,
    selectedExamChip,
    examFilter,
    yearFilter,
    subjectFilter,
    difficultyFilter,
    languageFilter,
    statusFilter,
    sortBy,
  ]);

  const availableSubjectsList = useMemo(() => {
    if (browseSummary?.subjects && browseSummary.subjects.length > 0) {
      return browseSummary.subjects.filter((s) => s.questionCount > 0).map((s) => s.name);
    }
    return uniqueSubjects.filter((s) => s !== 'All');
  }, [browseSummary, uniqueSubjects]);

  const availableChaptersList = useMemo(() => {
    if (browseSummary?.chapters && browseSummary.chapters.length > 0) {
      return browseSummary.chapters
        .filter((c) => c.questionCount > 0)
        .map((c) => ({ subject: c.subject, chapter: c.name }));
    }
    return [];
  }, [browseSummary]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedExamChip('All');
    setExamFilter('All');
    setYearFilter('All');
    setSubjectFilter('All');
    setDifficultyFilter('All');
    setLanguageFilter('All');
    setStatusFilter('All');
    setSortBy('newest');
  };

  const isFilterActive =
    searchQuery.trim() !== '' ||
    selectedExamChip !== 'All' ||
    examFilter !== 'All' ||
    yearFilter !== 'All' ||
    subjectFilter !== 'All' ||
    difficultyFilter !== 'All' ||
    languageFilter !== 'All' ||
    statusFilter !== 'All' ||
    sortBy !== 'newest';

  // Launch Handlers
  const handleLaunchMock = async (testSummary: CloudTestSummary, options?: { resume?: boolean }) => {
    setLoadingTestId(testSummary.id);
    try {
      const fullTest: CloudSavedTest = await fetchTestById(testSummary.id);
      const convertedQuestions: MCQQuestion[] = fullTest.questions.map((q, idx) => ({
        ...q,
        id: typeof q.id === 'number' ? q.id : parseInt(String(q.id || idx + 1), 10) || idx + 1,
        question: q.question,
        questionHindi: q.questionHindi,
        questionEnglish: q.questionEnglish,
        optionsHindi: q.optionsHindi,
        optionsEnglish: q.optionsEnglish,
        passage: q.passage,
        data: q.data || q.passageData,
        passageImage: q.passageImage,
        type: q.type || 'factual',
        options: q.options,
        correctOption: q.correctOption,
        explanation: q.explanation,
        sourcePages: q.sourcePages,
        examName: q.examName || fullTest.examName,
        year: q.year || fullTest.year,
      }));

      const settings: TestSettings = {
        difficulty: (fullTest.difficulty as any) || 'Medium',
        language: (fullTest.language as any) || 'English',
        durationMinutes: fullTest.durationMinutes || 10,
        positiveMarks: fullTest.markingCorrect ?? 1.0,
        negativeMarks: fullTest.markingWrong ?? 0.25,
      };

      let existingResumeState: any = null;
      if (options?.resume) {
        try {
          const raw = localStorage.getItem('cbt_active_test_progress');
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed && (parsed.testId === fullTest.id || (!parsed.testId && parsed.testTitle === fullTest.title))) {
            existingResumeState = parsed;
          }
        } catch {}
      }

      if (existingResumeState) {
        setInProgressState(existingResumeState);
      } else {
        // Save fresh initial progress when starting a new attempt
        const freshProgress = {
          testId: fullTest.id,
          testTitle: fullTest.title,
          currentIndex: 0,
          answeredCount: 0,
          totalCount: convertedQuestions.length,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem('cbt_active_test_progress', JSON.stringify(freshProgress));
        setInProgressState(freshProgress);
      }

      onStartTest(convertedQuestions, settings, fullTest.title, fullTest.id);
    } catch (err: any) {
      alert(err.message || 'Failed to load test paper. Please try again.');
    } finally {
      setLoadingTestId(null);
    }
  };

  const handleLaunchPractice = async (testSummary: CloudTestSummary) => {
    if (!onStartStudy) return;
    setLoadingTestId(testSummary.id);
    try {
      const fullTest: CloudSavedTest = await fetchTestById(testSummary.id, 'study');
      const convertedQuestions: MCQQuestion[] = fullTest.questions.map((q, idx) => ({
        ...q,
        id: typeof q.id === 'number' ? q.id : parseInt(String(q.id || idx + 1), 10) || idx + 1,
        question: q.question,
        questionHindi: q.questionHindi,
        questionEnglish: q.questionEnglish,
        optionsHindi: q.optionsHindi,
        optionsEnglish: q.optionsEnglish,
        passage: q.passage,
        data: q.data || q.passageData,
        passageImage: q.passageImage,
        type: q.type || 'conceptual',
        options: q.options,
        correctOption: q.correctOption,
        explanation: q.explanation,
        sourcePages: q.sourcePages,
        examName: q.examName || fullTest.examName,
        year: q.year || fullTest.year,
      }));

      onStartStudy(convertedQuestions, fullTest.title, fullTest.id);
    } catch (err: any) {
      alert(err.message || 'Failed to load test for practice mode.');
    } finally {
      setLoadingTestId(null);
    }
  };

  // Launch generic practice list (from Mistakes or Bookmarks)
  const handleLaunchGenericPractice = (questions: MCQQuestion[], title: string) => {
    if (!onStartStudy) return;
    onStartStudy(questions, title);
  };

  // Calculate mistake questions count for bottom bar badge
  const mistakesCount = useMemo(() => {
    let count = 0;
    attempts.forEach((a) => {
      count += (a.incorrect || 0) + (a.unattempted || 0);
    });
    return count;
  }, [attempts]);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Sub-Header Tabs for Desktop Navigation */}
      <div className="bg-white border-b border-slate-200 hidden md:block sticky top-16 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center space-x-1 py-2">
            {[
              { id: 'home', label: 'Home' },
              { id: 'tests', label: 'Tests' },
              { id: 'analytics', label: 'Analytics' },
              { id: 'mistakes', label: 'Mistakes Notebook', badge: mistakesCount },
              { id: 'profile', label: 'Profile' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as UserNavTab)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                        isActive ? 'bg-white text-blue-700' : 'bg-rose-500 text-white'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Bookmarks Button on Desktop Sub-header */}
          <button
            type="button"
            onClick={() => setActiveTab('bookmarks')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'bookmarks'
                ? 'bg-amber-600 text-white'
                : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            <span>Bookmarks</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* VIEW: HOME */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'home' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
          {/* Welcome & Stats Banner */}
          <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute right-0 top-0 -translate-y-12 translate-x-12 w-80 h-80 bg-white/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="px-3 py-0.5 rounded-full bg-white/20 text-blue-100 text-xs font-bold backdrop-blur-xs">
                    Candidate Portal
                  </span>
                </div>

                {/* Requirement 2: welcome line using display name (not email prefix) */}
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Hi, {user.displayName || 'Candidate'}!
                </h1>
                <p className="text-xs sm:text-sm text-blue-100 mt-1 max-w-lg">
                  Welcome to your CBT Mock Test Portal. Test your knowledge, track accuracy, and review weak topics.
                </p>

                {/* Quick actions row */}
                <div className="flex flex-wrap items-center gap-2.5 mt-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab('tests')}
                    className="px-4 py-2 bg-white text-blue-700 hover:bg-blue-50 font-bold text-xs rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Browse All Tests</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('bookmarks')}
                    className="px-4 py-2 bg-white/15 hover:bg-white/25 text-white font-bold text-xs rounded-xl backdrop-blur-xs transition inline-flex items-center gap-1.5 cursor-pointer border border-white/20"
                  >
                    <Bookmark className="w-3.5 h-3.5 fill-white" />
                    <span>Saved Bookmarks</span>
                  </button>
                </div>
              </div>

              {/* Stats Cards (4 stats: tests taken, avg score, accuracy, best score) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
                <div className="bg-white/15 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-white/20 text-center">
                  <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider block">
                    Tests Taken
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-white mt-1 block">
                    {totalAttempts}
                  </span>
                </div>

                <div className="bg-white/15 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-white/20 text-center">
                  <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider block">
                    Average Score
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-white mt-1 block">
                    {avgScore}
                  </span>
                </div>

                <div className="bg-white/15 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-white/20 text-center">
                  <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider block">
                    Accuracy
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-white mt-1 block">
                    {avgAccuracy}%
                  </span>
                </div>

                <div className="bg-white/15 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-white/20 text-center">
                  <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider block">
                    Best Score
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-white mt-1 block">
                    {bestScore}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Requirement 2: Continue Card for unfinished test */}
          {inProgressState && inProgressState.testTitle ? (
            <div className="bg-white rounded-3xl border border-amber-300 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-amber-50/70 via-white to-white">
              <div className="space-y-1.5 flex-1">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-100/70 px-2.5 py-0.5 rounded-full border border-amber-200">
                  <RotateCcw className="w-3.5 h-3.5 animate-spin-slow" />
                  <span>Unfinished Test in Progress</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  {inProgressState.testTitle}
                </h3>
                <p className="text-xs text-slate-500">
                  {inProgressState.answeredCount || 0} of {inProgressState.totalCount || 10} questions answered. Pick up right where you left off.
                </p>
                {/* Progress bar */}
                <div className="w-full max-w-md h-2 rounded-full bg-slate-100 overflow-hidden mt-2">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{
                      width: `${Math.round(
                        ((inProgressState.answeredCount || 0) /
                          (inProgressState.totalCount || 1)) *
                          100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {(tests.find((t) => t.id === inProgressState.testId || t.title === inProgressState.testTitle) ||
                (inProgressState.testId && inProgressState.testId !== 'custom-json')) ? (
                <button
                  type="button"
                  disabled={loadingTestId === inProgressState.testId}
                  onClick={() => {
                    const match = tests.find(
                      (t) =>
                        t.id === inProgressState.testId ||
                        t.title === inProgressState.testTitle
                    );
                    const targetSummary: CloudTestSummary = match || {
                      id: inProgressState.testId || '',
                      title: inProgressState.testTitle || 'Resume Test',
                      status: 'published',
                      questionCount: inProgressState.totalCount || 10,
                      durationMinutes: 15,
                      difficulty: 'Medium',
                      language: 'English',
                      markingCorrect: 1,
                      markingWrong: 0.25,
                      createdAt: inProgressState.updatedAt || new Date().toISOString(),
                    };
                    handleLaunchMock(targetSummary, { resume: true });
                  }}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer shrink-0 disabled:opacity-60"
                >
                  <RotateCcw className={`w-4 h-4 ${loadingTestId === inProgressState.testId ? 'animate-spin' : ''}`} />
                  <span>{loadingTestId === inProgressState.testId ? 'Resuming...' : 'Resume Test'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('cbt_active_test_progress');
                    clearActiveTestProgress().catch(() => {});
                    setInProgressState(null);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800"
                >
                  Dismiss
                </button>
              )}
            </div>
          ) : (
            /* If no active paused test, show a Continue Preparation card */
            tests.length > 0 && (
              <div className="bg-white rounded-3xl border border-blue-200 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-blue-50/60 to-white">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">
                    Recommended For You
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    {tests[0].title}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {tests[0].questionCount} Questions • {tests[0].durationMinutes} Mins • {tests[0].difficulty} Level
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleLaunchMock(tests[0])}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer shrink-0"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Start Test</span>
                </button>
              </div>
            )
          )}

          {/* Browse Section on Home (Requirement 6) */}
          <BrowseSection
            summary={browseSummary}
            loading={browseLoading}
            error={browseError}
            attempts={attempts}
            onSelectExam={(examId, examName) => {
              setSelectedExamView({ examId, examName });
              setActiveTab('tests');
            }}
            onStartChapterTest={handleStartChapterTest}
            onOpenCustomBuilder={(prefill) => {
              setCustomBuilderPrefill(prefill);
              setIsCustomBuilderOpen(true);
            }}
            onRefresh={loadDashboardData}
          />

          {/* Requirement 2: "New tests" row */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <span>New Tests</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Latest uploaded mock tests and question papers
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('tests')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition cursor-pointer"
              >
                <span>View all ({tests.length})</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-48 bg-white rounded-2xl border border-slate-200 animate-pulse p-5" />
                ))}
              </div>
            ) : tests.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
                No tests published yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tests.slice(0, 3).map((test) => (
                  <QuizCard
                    key={test.id}
                    test={test}
                    isInProgress={inProgressState?.testId === test.id}
                    onStartMock={handleLaunchMock}
                    onStartPractice={handleLaunchPractice}
                    onOpenDetails={(t) => setSelectedDetailsTest(t)}
                    onResume={handleLaunchMock}
                    isLoading={loadingTestId === test.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Requirement 2: "Recently attempted" row */}
          {attempts.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-indigo-600" />
                    <span>Recently Attempted</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Review your recent test scores and re-attempt to improve accuracy
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('analytics')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition cursor-pointer"
                >
                  <span>View Analytics</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {attempts.slice(0, 3).map((att) => (
                  <div
                    key={att.id}
                    className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                          {att.accuracy}% Accuracy
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(att.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>

                      <h4 className="font-bold text-sm text-slate-900 line-clamp-1">
                        {att.testTitle}
                      </h4>

                      <div className="mt-2.5 flex items-center justify-between text-xs bg-slate-50 p-2 rounded-xl">
                        <span className="text-slate-500">Score Achieved:</span>
                        <strong className="text-slate-900 font-bold">
                          {Number(att?.score ?? 0).toFixed(1)} / {Number(att?.maxScore ?? 0).toFixed(1)}
                        </strong>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const testSummary = tests.find((t) => t.id === att.testId);
                          if (testSummary) handleLaunchMock(testSummary);
                          else onNavigateToPerformance();
                        }}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Re-attempt</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('analytics')}
                        className="py-1.5 px-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs transition cursor-pointer"
                      >
                        Review
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW: TESTS (With ExamDetailPage or comprehensive test catalog) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'tests' && selectedExamView && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <ExamDetailPage
            examId={selectedExamView.examId}
            examName={selectedExamView.examName}
            onBack={() => setSelectedExamView(null)}
            onStartMock={handleLaunchMock}
            onStartPractice={handleLaunchPractice}
            onShowDetails={(t) => setSelectedDetailsTest(t)}
            onOpenCustomBuilder={(prefill) => {
              setCustomBuilderPrefill(prefill);
              setIsCustomBuilderOpen(true);
            }}
            loadingTestId={loadingTestId}
          />
        </div>
      )}

      {activeTab === 'tests' && !selectedExamView && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-slate-900">All Mock Tests & Papers</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Filter by target exam, subject, chapter, or year, and take timed CBT mocks or practice questions.
              </p>
            </div>

            <button
              onClick={() => {
                setCustomBuilderPrefill(undefined);
                setIsCustomBuilderOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm transition-all active:scale-95 self-start sm:self-auto cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Create Your Own Test</span>
            </button>
          </div>

          {/* Exam Filter Chip Row (Requirement 10) */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Quick Filter by Exam:
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {[
                'All',
                'BPSC',
                'UPSC',
                'Bihar Police SI',
                'Bihar Police Constable',
                'UPPSC',
                'MPPSC',
                'RPSC',
                'SSC CGL',
                'RRB NTPC',
                'Bihar Teacher',
              ].map((chip) => {
                const isSelected = selectedExamChip === chip;
                return (
                  <button
                    key={chip}
                    onClick={() => setSelectedExamChip(chip)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/20'
                        : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Browse Section on Tests tab (Requirement 6) */}
          <BrowseSection
            summary={browseSummary}
            loading={browseLoading}
            error={browseError}
            attempts={attempts}
            onSelectExam={(examId, examName) => {
              setSelectedExamView({ examId, examName });
            }}
            onStartChapterTest={handleStartChapterTest}
            onOpenCustomBuilder={(prefill) => {
              setCustomBuilderPrefill(prefill);
              setIsCustomBuilderOpen(true);
            }}
            onRefresh={loadDashboardData}
          />

          {/* Filter Bar (Requirement 4) */}
          <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search across exams, subjects, chapters, topics, or years..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>

            {/* Filter Dropdowns Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
              {/* Exam */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Exam
                </label>
                <select
                  value={examFilter}
                  onChange={(e) => setExamFilter(e.target.value)}
                  className="w-full p-2 rounded-xl border border-slate-200 bg-white font-medium text-xs focus:ring-2 focus:ring-blue-500"
                >
                  {uniqueExams.map((ex) => (
                    <option key={ex} value={ex}>
                      {ex}
                    </option>
                  ))}
                </select>
              </div>

              {/* Year */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Year
                </label>
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="w-full p-2 rounded-xl border border-slate-200 bg-white font-medium text-xs focus:ring-2 focus:ring-blue-500"
                >
                  {uniqueYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Subject
                </label>
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="w-full p-2 rounded-xl border border-slate-200 bg-white font-medium text-xs focus:ring-2 focus:ring-blue-500"
                >
                  {uniqueSubjects.map((sb) => (
                    <option key={sb} value={sb}>
                      {sb}
                    </option>
                  ))}
                </select>
              </div>

              {/* Difficulty */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Difficulty
                </label>
                <select
                  value={difficultyFilter}
                  onChange={(e) => setDifficultyFilter(e.target.value as any)}
                  className="w-full p-2 rounded-xl border border-slate-200 bg-white font-medium text-xs focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">All Levels</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>

              {/* Language */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Language
                </label>
                <select
                  value={languageFilter}
                  onChange={(e) => setLanguageFilter(e.target.value as any)}
                  className="w-full p-2 rounded-xl border border-slate-200 bg-white font-medium text-xs focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">All Languages</option>
                  <option value="English">English</option>
                  <option value="Hindi">Hindi</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full p-2 rounded-xl border border-slate-200 bg-white font-medium text-xs focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">All</option>
                  <option value="not_attempted">Not Attempted</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            {/* Bottom Controls: Sort & Clear Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5"
                >
                  <option value="newest">Newest First</option>
                  <option value="most_attempted">Most Attempted</option>
                  <option value="most_questions">Most Questions</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-medium">
                  Showing <strong>{filteredTests.length}</strong> of {tests.length} tests
                </span>

                {isFilterActive && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-xl transition cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Test Cards List / Loading / Empty / Error States (Requirement 10) */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-64 bg-white rounded-2xl border border-slate-200 animate-pulse p-6" />
              ))}
            </div>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-200 rounded-3xl p-8 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
              <h3 className="font-bold text-rose-900 text-base">Failed to load tests</h3>
              <p className="text-xs text-rose-700">{error}</p>
              <button
                type="button"
                onClick={loadDashboardData}
                className="px-4 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 transition"
              >
                Retry
              </button>
            </div>
          ) : filteredTests.length === 0 ? (
            /* Empty State */
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-4 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100">
                <Search className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">No Tests Found</h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                No mock tests match your current filter selections. Try clearing your filters or search terms.
              </p>
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredTests.map((test) => (
                  <QuizCard
                    key={test.id}
                    test={test}
                    isInProgress={inProgressState?.testId === test.id}
                    onStartMock={handleLaunchMock}
                    onStartPractice={handleLaunchPractice}
                    onOpenDetails={(t) => setSelectedDetailsTest(t)}
                    onResume={handleLaunchMock}
                    isLoading={loadingTestId === test.id}
                  />
                ))}
              </div>

              {tests.length < totalTests && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={handleLoadMoreTests}
                    disabled={loadingMoreTests}
                    className="px-6 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${loadingMoreTests ? 'animate-spin' : ''}`} />
                    <span>
                      {loadingMoreTests
                        ? 'Loading More Tests...'
                        : `Load More Tests (${tests.length} of ${totalTests} loaded)`}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW: ANALYTICS (Requirement 5 & 12) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'analytics' && (
        <AnalyticsView
          onRetakeTest={(testId) => {
            const found = tests.find((t) => t.id === testId);
            if (found) {
              handleLaunchMock(found);
            } else if (testId && testId !== 'custom-test' && testId !== 'custom-json') {
              handleLaunchMock({
                id: testId,
                title: 'Mock Test',
                status: 'published',
                language: 'English',
                difficulty: 'Medium',
                questionCount: 10,
                durationMinutes: 15,
                createdAt: new Date().toISOString(),
              });
            } else {
              setActiveTab('tests');
            }
          }}
          onExploreTests={() => setActiveTab('tests')}
          onOpenCustomBuilder={(prefill) => {
            setCustomBuilderPrefill(prefill);
            setIsCustomBuilderOpen(true);
          }}
        />
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW: MISTAKES NOTEBOOK (Requirement 6) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'mistakes' && (
        <MistakesNotebook
          onStartPractice={handleLaunchGenericPractice}
          onExploreTests={() => setActiveTab('tests')}
        />
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW: BOOKMARKS (Requirement 7) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'bookmarks' && (
        <BookmarksView
          onStartPractice={handleLaunchGenericPractice}
          onExploreTests={() => setActiveTab('tests')}
        />
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW: PROFILE (Requirement 9) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'profile' && (
        <UserProfileView
          user={user}
          onLogout={onLogout}
          onOpenBookmarks={() => setActiveTab('bookmarks')}
          onOpenMistakes={() => setActiveTab('mistakes')}
        />
      )}

      {/* Bottom Navigation Bar (Requirement 1) */}
      <BottomNavBar
        currentTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        mistakesCount={mistakesCount}
      />

      {/* Test Specifications Details Modal (Requirement 3) */}
      <TestDetailsModal
        test={selectedDetailsTest}
        isOpen={Boolean(selectedDetailsTest)}
        onClose={() => setSelectedDetailsTest(null)}
        onStartMock={handleLaunchMock}
        onStartPractice={handleLaunchPractice}
      />

      {/* Custom Test Builder Modal (Requirement 8) */}
      <CustomTestBuilderModal
        isOpen={isCustomBuilderOpen}
        onClose={() => setIsCustomBuilderOpen(false)}
        catalogExams={catalogExams}
        availableSubjects={availableSubjectsList}
        availableChapters={availableChaptersList}
        userAttempts={attempts}
        prefill={customBuilderPrefill}
        onStartBuiltTest={handleStartBuiltTest}
      />
    </div>
  );
};
