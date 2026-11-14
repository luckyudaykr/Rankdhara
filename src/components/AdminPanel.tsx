import React, { useState, useEffect, useMemo } from 'react';
import {
  Upload,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Eye,
  FileCheck2,
  Send,
  Plus,
  RefreshCw,
  BarChart3,
  Users,
  Award,
  Layers,
  Sparkles,
  Edit3,
  Save,
  Clock,
  ArrowRight,
  FileText,
  Play,
  FileSpreadsheet,
  Calendar,
  Tag,
  AlertCircle,
  X,
  FileUp,
  Pause,
  Sliders,
  ShieldCheck,
  Code,
  FileJson,
  FolderTree,
} from 'lucide-react';
import {
  CloudSavedTest,
  CloudTestSummary,
  MCQQuestion,
  TestSettings,
  AdminOverview,
  QuestionType,
  UserProfile,
  QuestionPdfRecord,
  ExtractionReport,
  AdminExtractionSettings,
  QuestionReport,
} from '../types';
import {
  saveTestToCloud,
  fetchSavedTests,
  deleteTestById,
  togglePublishStatus,
  fetchTestById,
  fetchAdminOverview,
  uploadQuestionPdf,
  fetchQuestionPdfs,
  deleteQuestionPdf,
  extractMcqsFromPdf,
  reuploadPdfPaper,
  fetchExtractionReport,
  fetchPdfQuestions,
  fetchExtractionSettings,
  updateExtractionSettings,
  bulkPublishCleanQuizzes,
  cleanAndReextractPdf,
  fetchQuestionReports,
  resolveQuestionReport,
  fetchReportQuestionContext,
  fixQuestionAndResolveReport,
} from '../services/cloudStorageService';
import { fileToBase64 } from '../services/pdfService';
import { processPdfForMCQs } from '../services/batchProcessor';
import { UploadScreen } from './UploadScreen';
import { RawJsonInspector } from './RawJsonInspector';
import { SearchFilterBar, FilterCriteria } from './SearchFilterBar';
import { convertMCQToRawSchema } from '../utils/mcqSchema';
import { ManageExamsTab } from './ManageExamsTab';

interface AdminPanelProps {
  user: UserProfile;
  onStartTest: (questions: MCQQuestion[], settings: TestSettings, title: string, testId?: string) => void;
  onStartStudy?: (questions: MCQQuestion[], title: string, testId?: string) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ user, onStartTest, onStartStudy }) => {
  const [activeTab, setActiveTab] = useState<'create' | 'preview' | 'tests' | 'overview' | 'pdfs' | 'reports' | 'manage_exams'>('create');

  // Reported Questions State
  const [reportsList, setReportsList] = useState<QuestionReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [editingReportModal, setEditingReportModal] = useState<{
    report: QuestionReport;
    testId: string;
    testTitle: string;
    questionIndex: number;
    questionText: string;
    options: { A: string; B: string; C: string; D: string; E?: string };
    correctOption: 'A' | 'B' | 'C' | 'D' | 'E';
    explanation: string;
    subject: string;
    chapter: string;
    resolutionNote: string;
  } | null>(null);
  const [loadingReportQuestionId, setLoadingReportQuestionId] = useState<string | null>(null);
  const [savingReportFix, setSavingReportFix] = useState(false);
  const [reportFixError, setReportFixError] = useState<string | null>(null);

  // Generator & Preview state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Question PDF Library state
  const [pdfList, setPdfList] = useState<QuestionPdfRecord[]>([]);
  const [loadingPdfs, setLoadingPdfs] = useState(false);
  const [pdfListError, setPdfListError] = useState<string | null>(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [extractingPdfId, setExtractingPdfId] = useState<string | null>(null);
  const [extractionProgressMsg, setExtractionProgressMsg] = useState<string>('');
  const [selectedReport, setSelectedReport] = useState<{ pdfName: string; report: ExtractionReport } | null>(null);
  const [batchSizes, setBatchSizes] = useState<Record<string, number>>({});
  const [pdfToDelete, setPdfToDelete] = useState<{
    id: string;
    fileName: string;
    questionCount: number;
  } | null>(null);
  const [isDeletingPdf, setIsDeletingPdf] = useState(false);
  const [pdfDeleteError, setPdfDeleteError] = useState<string | null>(null);

  // Current working test in Preview / Editor
  const [previewTest, setPreviewTest] = useState<{
    id?: string;
    title: string;
    language: 'English' | 'Hindi';
    difficulty: 'Easy' | 'Medium' | 'Hard';
    durationMinutes: number;
    positiveMarks: number;
    negativeMarks: number;
    sourcePageCount: number;
    examName?: string;
    year?: string;
    questions: MCQQuestion[];
  } | null>(null);

  // Manage Tests state
  const [testList, setTestList] = useState<CloudTestSummary[]>([]);
  const [loadingTests, setLoadingTests] = useState(false);
  const [testsError, setTestsError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  // Overview Analytics state
  const [overviewData, setOverviewData] = useState<AdminOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  // Extraction Settings & Automation state
  const [extractionSettings, setExtractionSettings] = useState<AdminExtractionSettings>({
    maxGeminiCallsPerDay: 200,
    geminiCallsToday: 0,
    autoExtractOnUpload: true,
    publishCleanQuizzesAuto: false,
    geminiModel: 'gemini-3.5-flash',
  });
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [bulkPublishing, setBulkPublishing] = useState(false);

  // Raw JSON Inspector & Custom Import State
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorQuestions, setInspectorQuestions] = useState<MCQQuestion[]>([]);
  const [inspectorTitle, setInspectorTitle] = useState('MCQ Questions');
  const [loadingInspector, setLoadingInspector] = useState(false);

  // PDF Library Search & Filter State
  const [pdfFilters, setPdfFilters] = useState<FilterCriteria>({
    searchQuery: '',
    status: 'All',
    difficulty: 'All',
  });

  const filteredPdfs = useMemo(() => {
    return pdfList.filter((pdf) => {
      if (pdfFilters.searchQuery.trim()) {
        const q = pdfFilters.searchQuery.toLowerCase();
        const matchName = pdf.fileName.toLowerCase().includes(q);
        const matchExam = (pdf.lastExtractionReport?.quizSummaries || []).some((s) =>
          s.title.toLowerCase().includes(q)
        );
        if (!matchName && !matchExam) return false;
      }
      if (pdfFilters.status && pdfFilters.status !== 'All') {
        const pagesExtracted =
          typeof pdf.pagesExtracted === 'number'
            ? pdf.pagesExtracted
            : pdf.lastExtractionReport?.processedPages || 0;
        const totalPages = pdf.pageCount || 1;
        const isAllExtracted = pagesExtracted >= totalPages && pdf.status === 'extracted';

        if (pdfFilters.status === 'Answered' && !isAllExtracted) return false;
        if (pdfFilters.status === 'Unanswered' && isAllExtracted) return false;
        if (pdfFilters.status === 'Bookmarked' && !pdf.possibleMissingQuestions?.length) return false;
      }
      return true;
    });
  }, [pdfList, pdfFilters]);

  // JSON Inspector & Preview Handlers
  const handleInspectPdfJson = async (pdfId: string, pdfName: string) => {
    setLoadingInspector(true);
    try {
      const res = await fetchPdfQuestions(pdfId);
      if (!res.questions || res.questions.length === 0) {
        alert(`No questions have been extracted from "${pdfName}" yet. Please run extraction on this PDF first.`);
        return;
      }
      setInspectorQuestions(res.questions);
      setInspectorTitle(pdfName.replace(/\.pdf$/i, ''));
      setInspectorOpen(true);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch questions for JSON inspection.');
    } finally {
      setLoadingInspector(false);
    }
  };

  const handleInspectTestJson = async (testId: string, testTitle: string) => {
    setLoadingInspector(true);
    try {
      const testDoc = await fetchTestById(testId);
      if (!testDoc || !testDoc.questions || testDoc.questions.length === 0) {
        alert('No questions found in this test.');
        return;
      }
      const mappedQuestions: MCQQuestion[] = testDoc.questions.map((q, idx) => ({
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
        examName: q.examName || testDoc.examName,
        year: q.year || testDoc.year,
        answerStatus: q.answerStatus || (!q.correctOption ? 'missing' : 'found'),
      }));
      setInspectorQuestions(mappedQuestions);
      setInspectorTitle(testTitle);
      setInspectorOpen(true);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch test for JSON inspection.');
    } finally {
      setLoadingInspector(false);
    }
  };

  const handleInspectCurrentPreview = () => {
    if (!previewTest || previewTest.questions.length === 0) {
      alert('There are no questions in the current editor preview to inspect.');
      return;
    }
    setInspectorQuestions(previewTest.questions);
    setInspectorTitle(previewTest.title || 'Current Test Preview');
    setInspectorOpen(true);
  };

  const handleOpenCustomJsonImporter = () => {
    setInspectorQuestions([]);
    setInspectorTitle('Custom MCQ Import');
    setInspectorOpen(true);
  };

  const handleLoadCustomQuestionsFromInspector = (
    customQs: MCQQuestion[],
    customTitle: string,
    mode: 'study' | 'quiz' | 'editor'
  ) => {
    if (mode === 'study' && onStartStudy) {
      onStartStudy(customQs, customTitle);
    } else if (mode === 'quiz') {
      const hasHindiChars = (str?: string) => /[\u0900-\u097F]/.test(str || '');
      const isHindi = customQs.some((q) => hasHindiChars(q.question) || hasHindiChars(q.questionHindi));
      onStartTest(
        customQs,
        {
          difficulty: 'Medium',
          language: isHindi ? 'Hindi' : 'English',
          durationMinutes: Math.max(5, Math.ceil(customQs.length * 1.5)),
          positiveMarks: 1.0,
          negativeMarks: 0.25,
        },
        customTitle
      );
    } else {
      const hasHindiChars = (str?: string) => /[\u0900-\u097F]/.test(str || '');
      const isHindi = customQs.some((q) => hasHindiChars(q.question) || hasHindiChars(q.questionHindi));
      setPreviewTest({
        title: customTitle,
        language: isHindi ? 'Hindi' : 'English',
        difficulty: 'Medium',
        durationMinutes: Math.max(5, Math.ceil(customQs.length * 1.5)),
        positiveMarks: 1.0,
        negativeMarks: 0.25,
        sourcePageCount: 1,
        examName: '',
        year: String(new Date().getFullYear()),
        questions: customQs,
      });
      setActiveTab('preview');
      setSuccessBanner(`Successfully loaded ${customQs.length} questions into Test Editor from JSON.`);
    }
  };

  const handleStartStudyFromPdf = async (pdfId: string, pdfName: string) => {
    try {
      const res = await fetchPdfQuestions(pdfId);
      if (!res.questions || res.questions.length === 0) {
        alert('No questions extracted from this PDF yet.');
        return;
      }
      if (onStartStudy) {
        onStartStudy(res.questions, pdfName.replace(/\.pdf$/i, ''), pdfId);
      } else {
        onStartTest(
          res.questions,
          {
            difficulty: 'Medium',
            language: 'English',
            durationMinutes: Math.max(5, Math.ceil(res.questions.length * 1.5)),
            positiveMarks: 1.0,
            negativeMarks: 0.25,
          },
          pdfName.replace(/\.pdf$/i, ''),
          pdfId
        );
      }
    } catch (err: any) {
      alert(err.message || 'Failed to launch study mode for PDF.');
    }
  };

  const handleStartQuizFromPdf = async (pdfId: string, pdfName: string) => {
    try {
      const res = await fetchPdfQuestions(pdfId);
      if (!res.questions || res.questions.length === 0) {
        alert('No questions extracted from this PDF yet.');
        return;
      }
      onStartTest(
        res.questions,
        {
          difficulty: 'Medium',
          language: 'English',
          durationMinutes: Math.max(5, Math.ceil(res.questions.length * 1.5)),
          positiveMarks: 1.0,
          negativeMarks: 0.25,
        },
        pdfName.replace(/\.pdf$/i, ''),
        pdfId
      );
    } catch (err: any) {
      alert(err.message || 'Failed to launch quiz practice for PDF.');
    }
  };

  const handleStartStudyFromTest = async (testId: string, testTitle: string) => {
    try {
      const testDoc = await fetchTestById(testId);
      if (!testDoc || !testDoc.questions || testDoc.questions.length === 0) {
        alert('No questions found in this test.');
        return;
      }
      const mappedQuestions: MCQQuestion[] = testDoc.questions.map((q, idx) => ({
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
        examName: q.examName || testDoc.examName,
        year: q.year || testDoc.year,
        answerStatus: q.answerStatus || (!q.correctOption ? 'missing' : 'found'),
      }));
      if (onStartStudy) {
        onStartStudy(mappedQuestions, testTitle, testId);
      } else {
        onStartTest(
          mappedQuestions,
          {
            difficulty: (testDoc.difficulty as 'Easy' | 'Medium' | 'Hard') || 'Medium',
            language: (testDoc.language as 'English' | 'Hindi') || 'English',
            durationMinutes: testDoc.durationMinutes || 10,
            positiveMarks: testDoc.markingCorrect || 1.0,
            negativeMarks: testDoc.markingWrong || 0.25,
          },
          testTitle,
          testId
        );
      }
    } catch (err: any) {
      alert(err.message || 'Failed to start study mode.');
    }
  };

  // Load data when switching tabs
  useEffect(() => {
    if (activeTab === 'tests') {
      loadAllTests();
    } else if (activeTab === 'overview') {
      loadOverviewMetrics();
    } else if (activeTab === 'pdfs') {
      loadPdfs();
      loadSettings();
    } else if (activeTab === 'reports') {
      loadQuestionReports();
    }
  }, [activeTab]);

  const loadQuestionReports = async () => {
    setLoadingReports(true);
    try {
      const list = await fetchQuestionReports();
      setReportsList(list);
    } catch (err) {
      console.warn('Failed to load reports:', err);
    } finally {
      setLoadingReports(false);
    }
  };

  const handleResolveReport = async (reportId: string) => {
    await resolveQuestionReport(reportId);
    setReportsList((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, status: 'resolved' as const } : r))
    );
  };

  const handleOpenFixReportModal = async (report: QuestionReport) => {
    setLoadingReportQuestionId(report.id);
    setReportFixError(null);
    setErrorMessage(null);
    try {
      const ctx = await fetchReportQuestionContext(report.id);
      const q = ctx.question;
      setEditingReportModal({
        report,
        testId: ctx.testId,
        testTitle: ctx.testTitle,
        questionIndex: ctx.questionIndex,
        questionText: q.question || '',
        options: {
          A: q.options?.A || '',
          B: q.options?.B || '',
          C: q.options?.C || '',
          D: q.options?.D || '',
          ...(q.options?.E ? { E: q.options.E } : {}),
        },
        correctOption: (q.correctOption as 'A' | 'B' | 'C' | 'D' | 'E') || 'A',
        explanation: q.explanation || '',
        subject: q.subject || '',
        chapter: q.chapter || '',
        resolutionNote: '',
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to locate source question for editing.');
    } finally {
      setLoadingReportQuestionId(null);
    }
  };

  const handleSaveFixAndResolve = async () => {
    if (!editingReportModal) return;
    setSavingReportFix(true);
    setReportFixError(null);
    try {
      const res = await fixQuestionAndResolveReport(editingReportModal.report.id, {
        question: editingReportModal.questionText,
        options: editingReportModal.options,
        correctOption: editingReportModal.correctOption,
        explanation: editingReportModal.explanation,
        subject: editingReportModal.subject,
        chapter: editingReportModal.chapter,
        resolutionNote: editingReportModal.resolutionNote,
      });
      setReportsList((prev) =>
        prev.map((r) =>
          r.id === editingReportModal.report.id
            ? { ...r, ...(res.report || {}), status: 'resolved' as const }
            : r
        )
      );
      setSuccessBanner(
        `Updated Q.#${editingReportModal.questionIndex + 1} in "${editingReportModal.testTitle}" and resolved the report.`
      );
      setEditingReportModal(null);
    } catch (err: any) {
      setReportFixError(err?.message || 'Failed to save question changes.');
    } finally {
      setSavingReportFix(false);
    }
  };

  const loadSettings = async () => {
    try {
      const s = await fetchExtractionSettings();
      setExtractionSettings(s);
    } catch {}
  };

  const loadPdfs = async () => {
    setLoadingPdfs(true);
    setPdfListError(null);
    try {
      const records = await fetchQuestionPdfs();
      setPdfList(records);
    } catch (err: any) {
      const reason = err.message || 'Failed to fetch PDF library list.';
      setPdfListError(`Could not load library: ${reason}`);
    } finally {
      setLoadingPdfs(false);
    }
  };

  const handleUpdateDailyBudget = async (newBudget: number) => {
    setIsUpdatingSettings(true);
    try {
      const updated = await updateExtractionSettings({ maxGeminiCallsPerDay: newBudget });
      setExtractionSettings(updated);
      setSuccessBanner(`Updated daily Gemini quota budget to ${newBudget} calls.`);
    } catch (err: any) {
      alert(err.message || 'Failed to update daily budget.');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleToggleAutoExtract = async () => {
    const val = !extractionSettings.autoExtractOnUpload;
    setExtractionSettings((prev) => ({ ...prev, autoExtractOnUpload: val }));
    try {
      await updateExtractionSettings({ autoExtractOnUpload: val });
    } catch {}
  };

  const handleToggleAutoPublish = async () => {
    const val = !extractionSettings.publishCleanQuizzesAuto;
    setExtractionSettings((prev) => ({ ...prev, publishCleanQuizzesAuto: val }));
    try {
      await updateExtractionSettings({ publishCleanQuizzesAuto: val });
      setSuccessBanner(
        val
          ? 'Enabled: Clean quizzes (100% answers & tags found) will be auto-published to library.'
          : 'Disabled: All extracted quizzes will be saved as drafts for manual review.'
      );
    } catch {}
  };

  const handleBulkPublishClean = async () => {
    setBulkPublishing(true);
    try {
      const count = await bulkPublishCleanQuizzes();
      setSuccessBanner(`Successfully published ${count} clean quiz(zes) to live library.`);
      await loadAllTests();
    } catch (err: any) {
      alert(err.message || 'Bulk publish failed.');
    } finally {
      setBulkPublishing(false);
    }
  };

  // Multi-file upload with automated queue
  const handlePdfFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        alert(`"${file.name}" is not a valid PDF document.`);
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        alert(`"${file.name}" exceeds the 50 MB limit.`);
        return;
      }
    }

    setIsUploadingPdf(true);
    setErrorMessage(null);

    const uploadedRecords: QuestionPdfRecord[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setExtractionProgressMsg(`Uploading ${i + 1}/${files.length}: "${file.name}"...`);
        const rec = await uploadQuestionPdf(file);
        uploadedRecords.push(rec);
      }

      setSuccessBanner(`Successfully uploaded ${uploadedRecords.length} PDF(s) to Question Library.`);
      await loadPdfs();

      // If Auto Extract is enabled, run extraction sequentially in queue
      if (extractionSettings.autoExtractOnUpload && uploadedRecords.length > 0) {
        for (let i = 0; i < uploadedRecords.length; i++) {
          const rec = uploadedRecords[i];
          setExtractionProgressMsg(`Auto-extracting ${i + 1}/${uploadedRecords.length}: "${rec.fileName}"...`);
          await handleRunExtraction(rec.id, rec.fileName);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed during PDF upload queue.');
    } finally {
      setIsUploadingPdf(false);
      e.target.value = '';
    }
  };

  const handleRunExtraction = async (
    pdfId: string,
    pdfName: string,
    options?: {
      resume?: boolean;
      retryFailedOnly?: boolean;
      startPage?: number;
      pageSize?: number;
      targetPages?: number[];
    }
  ) => {
    setExtractingPdfId(pdfId);
    setExtractionProgressMsg(
      options?.targetPages?.length
        ? `Re-checking ${options.targetPages.length} unresolved page(s) for "${pdfName}"...`
        : options?.resume
        ? `Extracting next pages for "${pdfName}"...`
        : options?.retryFailedOnly
        ? `Retrying unresolved pages for "${pdfName}"...`
        : `Reading and extracting questions verbatim for "${pdfName}"...`
    );
    setErrorMessage(null);

    try {
      const res = await extractMcqsFromPdf(pdfId, options);
      if (res.paused) {
        setErrorMessage(
          res.message || 'Extraction paused due to Gemini daily quota. Rule-parsed questions are preserved.'
        );
      } else {
        setSuccessBanner(
          `Extraction update complete! Created ${res.report.quizzesCreated} quiz(zes) (${res.report.quizzesPublished} auto-published, ${res.report.quizzesNeedingReview} in draft review).`
        );
      }
      if (res.report) {
        setSelectedReport({ pdfName, report: res.report });
      }
      await loadPdfs();
      await loadAllTests();
      await loadSettings();
    } catch (err: any) {
      setErrorMessage(err.message || 'Verbatim extraction failed.');
      await loadPdfs();
    } finally {
      setExtractingPdfId(null);
      setExtractionProgressMsg('');
    }
  };

  const handleCleanAndReextract = async (pdfId: string, pdfName: string) => {
    if (!confirm(`Are you sure you want to delete placeholder questions and re-extract "${pdfName}" from Page 1?`)) return;
    setExtractingPdfId(pdfId);
    setExtractionProgressMsg(`Cleaning invalid placeholder questions & re-extracting "${pdfName}"...`);
    setErrorMessage(null);

    try {
      await cleanAndReextractPdf(pdfId);
      setSuccessBanner(`Clean & re-extract complete for "${pdfName}"!`);
      await loadPdfs();
      await loadAllTests();
    } catch (err: any) {
      setErrorMessage(err.message || 'Clean & re-extract failed.');
    } finally {
      setExtractingPdfId(null);
      setExtractionProgressMsg('');
    }
  };

  const handlePromptDeletePdf = (pdfId: string, fileName: string, questionCount: number) => {
    setPdfToDelete({ id: pdfId, fileName, questionCount });
    setPdfDeleteError(null);
  };

  const handleConfirmDeletePdf = async () => {
    if (!pdfToDelete) return;
    setIsDeletingPdf(true);
    setPdfDeleteError(null);
    try {
      await deleteQuestionPdf(pdfToDelete.id);
      setPdfList((prev) => prev.filter((p) => p.id !== pdfToDelete.id));
      setPdfToDelete(null);
    } catch (err: any) {
      setPdfDeleteError(err.message || 'Failed to delete PDF from library.');
    } finally {
      setIsDeletingPdf(false);
    }
  };

  const handleReuploadPdf = async (pdfId: string, file: File) => {
    setExtractingPdfId(pdfId);
    setExtractionProgressMsg(`Re-uploading "${file.name}" binary buffer to restore storage...`);
    setErrorMessage(null);

    try {
      const base64 = await fileToBase64(file);
      const updatedRecord = await reuploadPdfPaper(pdfId, base64);
      setSuccessBanner(`PDF data file for "${updatedRecord.fileName || file.name}" restored successfully! You can now resume extraction.`);
      await loadPdfs();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to re-upload PDF file.');
    } finally {
      setExtractingPdfId(null);
      setExtractionProgressMsg('');
    }
  };

  const handleViewReport = async (pdfId: string, pdfName: string) => {
    try {
      const report = await fetchExtractionReport(pdfId);
      if (!report) {
        alert('No extraction report found for this PDF yet. Run extraction first.');
        return;
      }
      setSelectedReport({ pdfName, report });
    } catch (err: any) {
      alert(err.message || 'Failed to load report.');
    }
  };

  const loadAllTests = async () => {
    setLoadingTests(true);
    setTestsError(null);
    try {
      const res = await fetchSavedTests(1, 100, true);
      setTestList(res.tests);
    } catch (err: any) {
      setTestsError(err.message || 'Failed to load tests list');
    } finally {
      setLoadingTests(false);
    }
  };

  const loadOverviewMetrics = async () => {
    setLoadingOverview(true);
    try {
      const data = await fetchAdminOverview();
      setOverviewData(data);
    } catch (err: any) {
      console.error('Failed to load overview metrics:', err);
    } finally {
      setLoadingOverview(false);
    }
  };

  const handleStartGeneration = async (
    content: { text?: string; pdfBase64?: string; file?: File },
    meta: { name: string; size: number; pageCount: number; isScanned: boolean },
    settings: TestSettings
  ) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setProcessingStatus('Starting AI generation across document chunks...');

    try {
      const generatedQuestions = await processPdfForMCQs({
        file: content.file,
        text: content.text,
        pdfBase64: content.pdfBase64,
        fileName: meta.name,
        fileSizeBytes: meta.size,
        pageCount: meta.pageCount,
        settings,
        onProgress: (msg) => {
          setProcessingStatus(msg);
        },
      });

      // Prepare preview test in editor
      setPreviewTest({
        title: meta.name.replace(/\.[^/.]+$/, '') || 'Mock Test',
        language: settings.language,
        difficulty: settings.difficulty,
        durationMinutes: settings.durationMinutes,
        positiveMarks: settings.positiveMarks,
        negativeMarks: settings.negativeMarks,
        sourcePageCount: meta.pageCount || 1,
        questions: generatedQuestions,
      });

      setActiveTab('preview');
      setSuccessBanner('Test generated successfully! Review, edit questions if desired, and publish.');
    } catch (err: any) {
      console.error('Generation failed:', err);
      setErrorMessage(err.message || 'Failed to generate test from PDF. Check server logs.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Preview / Editor modifications
  const handleUpdateQuestion = (
    index: number,
    field: keyof MCQQuestion,
    value: any
  ) => {
    if (!previewTest) return;
    const updated = [...previewTest.questions];
    let updatedQ = { ...updated[index], [field]: value };
    if (field === 'correctOption') {
      updatedQ.answerStatus = value ? 'found' : 'missing';
    }
    updated[index] = updatedQ;
    setPreviewTest({ ...previewTest, questions: updated });
  };

  const handleUpdateOption = (
    questionIndex: number,
    optKey: 'A' | 'B' | 'C' | 'D',
    text: string
  ) => {
    if (!previewTest) return;
    const updated = [...previewTest.questions];
    updated[questionIndex] = {
      ...updated[questionIndex],
      options: {
        ...updated[questionIndex].options,
        [optKey]: text,
      },
    };
    setPreviewTest({ ...previewTest, questions: updated });
  };

  const handleRemoveQuestion = (index: number) => {
    if (!previewTest) return;
    if (previewTest.questions.length <= 1) {
      alert('A test must contain at least 1 question.');
      return;
    }
    const updated = previewTest.questions.filter((_, i) => i !== index);
    // re-index
    const reindexed = updated.map((q, i) => ({ ...q, id: i + 1 }));
    setPreviewTest({ ...previewTest, questions: reindexed });
  };

  const handleAddQuestion = () => {
    if (!previewTest) return;
    const newQ: MCQQuestion = {
      id: previewTest.questions.length + 1,
      question: 'New Question Text',
      type: 'factual',
      options: {
        A: 'Option A',
        B: 'Option B',
        C: 'Option C',
        D: 'Option D',
      },
      correctOption: 'A',
      explanation: 'Explanation for the correct answer.',
      sourcePages: 'Custom',
    };
    setPreviewTest({
      ...previewTest,
      questions: [...previewTest.questions, newQ],
    });
  };

  const handleSaveToCloud = async (status: 'draft' | 'published') => {
    if (!previewTest) return;

    // Check for missing answers
    const missingAnswersCount = previewTest.questions.filter(
      (q) => !q.correctOption || q.answerStatus === 'missing'
    ).length;

    if (status === 'published' && missingAnswersCount > 0) {
      setErrorMessage(
        `Cannot publish test: ${missingAnswersCount} question(s) have missing correct answers. Please fill in all answer keys before publishing.`
      );
      return;
    }

    setIsPublishing(true);
    setErrorMessage(null);

    try {
      const res = await saveTestToCloud({
        id: previewTest.id,
        title: previewTest.title,
        status,
        language: previewTest.language,
        difficulty: previewTest.difficulty,
        durationMinutes: previewTest.durationMinutes,
        markingCorrect: previewTest.positiveMarks,
        markingWrong: previewTest.negativeMarks,
        sourcePageCount: previewTest.sourcePageCount,
        examName: previewTest.examName,
        year: previewTest.year,
        questions: previewTest.questions,
      });

      setSuccessBanner(
        status === 'published'
          ? 'Test published! It is now live in the candidate examination library.'
          : 'Test saved as draft. You can publish it later from Manage Tests.'
      );
      // Update preview test ID
      setPreviewTest({ ...previewTest, id: res.id });
      loadAllTests();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save test.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleLoadTestToPreview = async (testId: string) => {
    try {
      const fullTest = await fetchTestById(testId);
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
        answerStatus: q.answerStatus || (!q.correctOption ? 'missing' : 'found'),
      }));

      setPreviewTest({
        id: fullTest.id,
        title: fullTest.title,
        language: (fullTest.language as any) || 'English',
        difficulty: (fullTest.difficulty as any) || 'Medium',
        durationMinutes: fullTest.durationMinutes || 10,
        positiveMarks: fullTest.markingCorrect ?? 1.0,
        negativeMarks: fullTest.markingWrong ?? 0.25,
        sourcePageCount: fullTest.sourcePageCount || 1,
        examName: fullTest.examName,
        year: fullTest.year,
        questions: convertedQuestions,
      });

      setActiveTab('preview');
      setSuccessBanner(`Loaded "${fullTest.title}" in preview editor.`);
    } catch (err: any) {
      alert(err.message || 'Failed to load test details.');
    }
  };

  const handleToggleStatus = async (testId: string, currentStatus: 'draft' | 'published') => {
    const nextStatus = currentStatus === 'published' ? 'draft' : 'published';
    try {
      await togglePublishStatus(testId, nextStatus);
      setTestList((prev) =>
        prev.map((t) => (t.id === testId ? { ...t, status: nextStatus } : t))
      );
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  const handleDeleteTest = async (testId: string, title: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${title}"?`)) return;
    try {
      await deleteTestById(testId);
      setTestList((prev) => prev.filter((t) => t.id !== testId));
      if (previewTest?.id === testId) {
        setPreviewTest(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete test');
    }
  };

  const filteredTests = testList.filter((test) => {
    const matchesStatus =
      statusFilter === 'all' || test.status === statusFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      test.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      test.difficulty.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Admin Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 rounded-2xl p-6 mb-8 text-white shadow-xl border border-indigo-800/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/40 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-blue-300" />
                Administrator Control Center
              </span>
              <span className="text-xs text-indigo-300 font-mono">
                {user.email}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              Mock Test Examination Management
            </h1>
            <p className="text-sm text-indigo-200/80 mt-1">
              Generate 10-MCQ tests from PDF documents with Gemini AI, edit & preview questions, control draft/publish statuses, and monitor candidate metrics.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm ${
                activeTab === 'create'
                  ? 'bg-blue-600 text-white shadow-blue-500/30'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Generate Test</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pdfs')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm ${
                activeTab === 'pdfs'
                  ? 'bg-blue-600 text-white shadow-blue-500/30'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-purple-400" />
              <span>Question PDF Library</span>
            </button>

            {previewTest && (
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm ${
                  activeTab === 'preview'
                    ? 'bg-blue-600 text-white shadow-blue-500/30'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                <span>Preview & Editor ({previewTest.questions.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('tests')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm ${
                activeTab === 'tests'
                  ? 'bg-blue-600 text-white shadow-blue-500/30'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>Manage Tests</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-xs ${
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white shadow-blue-500/30'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Analytics</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('manage_exams')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-xs ${
                activeTab === 'manage_exams'
                  ? 'bg-blue-600 text-white shadow-blue-500/30'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5 text-sky-400" />
              <span>Manage Exams & Aliases</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-xs ${
                activeTab === 'reports'
                  ? 'bg-rose-600 text-white shadow-rose-500/30'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>Reported Questions</span>
              {reportsList.filter((r) => r.status === 'pending').length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {reportsList.filter((r) => r.status === 'pending').length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Global Banners */}
      {successBanner && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-medium">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs font-semibold text-red-700 hover:text-red-900 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TAB: MANAGE EXAMS & ALIASES */}
      {activeTab === 'manage_exams' && (
        <ManageExamsTab
          onSuccessBanner={(msg) => setSuccessBanner(msg)}
          onErrorBanner={(msg) => setErrorMessage(msg)}
        />
      )}

      {/* TAB 1: CREATE / GENERATE */}
      {activeTab === 'create' && (
        <div>
          <UploadScreen
            onStartGeneration={handleStartGeneration}
            onOpenLibrary={() => setActiveTab('tests')}
            isProcessing={isProcessing}
            processingStatus={processingStatus}
            errorMessage={errorMessage}
            onClearError={() => setErrorMessage(null)}
          />
        </div>
      )}

      {/* TAB 2: PREVIEW & EDITOR BEFORE PUBLISHING */}
      {activeTab === 'preview' && previewTest && (
        <div className="space-y-6">
          {/* Top action bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-2 w-full max-w-lg">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <span>Test Details & Settings</span>
                <span>•</span>
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                  {previewTest.questions.length} Questions
                </span>
                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  {previewTest.difficulty}
                </span>
                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  {previewTest.language}
                </span>
              </div>
              <input
                type="text"
                value={previewTest.title}
                onChange={(e) =>
                  setPreviewTest({ ...previewTest, title: e.target.value })
                }
                className="text-xl font-bold text-slate-900 border-b border-slate-200 hover:border-slate-400 focus:border-blue-500 focus:outline-hidden py-1 w-full"
                placeholder="Test Title"
              />

              {/* Exam Name & Year inputs */}
              <div className="flex items-center gap-3 pt-1">
                <div className="flex-1 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                  <Tag className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={previewTest.examName || ''}
                    onChange={(e) =>
                      setPreviewTest({ ...previewTest, examName: e.target.value })
                    }
                    placeholder="Exam Name (e.g. BPSC 70th, UPSC Prelims)"
                    className="w-full text-xs font-semibold text-slate-800 bg-transparent focus:outline-hidden"
                  />
                </div>

                <div className="w-32 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={previewTest.year || ''}
                    onChange={(e) =>
                      setPreviewTest({ ...previewTest, year: e.target.value })
                    }
                    placeholder="Year (e.g. 2024)"
                    className="w-full text-xs font-semibold text-slate-800 bg-transparent focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2.5">
              <button
                type="button"
                onClick={handleAddQuestion}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question</span>
              </button>

              <button
                type="button"
                disabled={isPublishing}
                onClick={() => handleSaveToCloud('draft')}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save as Draft</span>
              </button>

              {/* Publish button with missing answer warning status */}
              {(() => {
                const missingCount = previewTest.questions.filter(
                  (q) => !q.correctOption || q.answerStatus === 'missing'
                ).length;
                const canPublish = missingCount === 0;

                return (
                  <button
                    type="button"
                    disabled={isPublishing || !canPublish}
                    onClick={() => handleSaveToCloud('published')}
                    className={`flex items-center gap-1.5 px-5 py-2 font-bold text-xs rounded-xl shadow-sm transition cursor-pointer ${
                      canPublish
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    }`}
                    title={
                      !canPublish
                        ? `Cannot publish: ${missingCount} question(s) have missing answer keys.`
                        : 'Publish to live candidate library'
                    }
                  >
                    <FileCheck2 className="w-4 h-4" />
                    <span>Publish Test to Library</span>
                  </button>
                );
              })()}

              <button
                type="button"
                onClick={handleInspectCurrentPreview}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-purple-300 hover:text-white font-mono text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                title="Inspect strict MCQ JSON schema [question_number, question, options, answer]"
              >
                <Code className="w-3.5 h-3.5 text-purple-400" />
                <span>{'{JSON}'}</span>
              </button>

              {onStartStudy && (
                <button
                  type="button"
                  onClick={() =>
                    onStartStudy(
                      previewTest.questions,
                      previewTest.title,
                      previewTest.id
                    )
                  }
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition cursor-pointer"
                  title="Practice questions self-paced in Study Mode"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Study Mode</span>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  onStartTest(
                    previewTest.questions,
                    {
                      difficulty: previewTest.difficulty,
                      language: previewTest.language,
                      durationMinutes: previewTest.durationMinutes,
                      positiveMarks: previewTest.positiveMarks,
                      negativeMarks: previewTest.negativeMarks,
                    },
                    previewTest.title,
                    previewTest.id
                  )
                }
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 transition cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Take as CBT</span>
              </button>
            </div>
          </div>

          {/* Missing Answers / Incomplete Options Warning Banner */}
          {(() => {
            const missingCount = previewTest.questions.filter(
              (q) => !q.correctOption || q.answerStatus === 'missing'
            ).length;
            const hasMissingOptions = previewTest.questions.some(
              (q) =>
                Object.values(q.options || {}).some(
                  (optText) => !optText || optText.includes('missing in source') || optText.includes('unclear')
                )
            );
            if (missingCount === 0 && !hasMissingOptions) return null;

            return (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold">
                      {hasMissingOptions
                        ? 'Incomplete Options Detected from Previous Extraction Run'
                        : `Missing Answer Keys Detected (${missingCount} Question(s))`}
                    </span>
                    <p className="text-amber-700 text-[11px] mt-0.5">
                      {hasMissingOptions
                        ? 'This quiz was saved during an earlier extraction run. Go to "Question PDF Repository" and click "Re-extract All Pages" to parse options verbatim with the updated engine, or edit the fields directly below.'
                        : 'Please assign a correct answer option (A, B, C, or D) to all flagged questions below before publishing.'}
                    </p>
                  </div>
                </div>

                {hasMissingOptions && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('pdfs')}
                    className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg transition shrink-0 cursor-pointer shadow-xs"
                  >
                    Go to PDF Repository
                  </button>
                )}
              </div>
            );
          })()}

          {/* Questions list editor */}
          <div className="space-y-4">
            {previewTest.questions.map((q, qIdx) => {
              const isMissingAnswer = !q.correctOption || q.answerStatus === 'missing';

              return (
                <div
                  key={q.id || qIdx}
                  className={`bg-white rounded-2xl border p-5 shadow-xs transition ${
                    isMissingAnswer
                      ? 'border-amber-400 ring-2 ring-amber-200 bg-amber-50/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                        Q{qIdx + 1}
                      </span>
                      <select
                        value={q.type}
                        onChange={(e) =>
                          handleUpdateQuestion(
                            qIdx,
                            'type',
                            e.target.value as QuestionType
                          )
                        }
                        className="text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="factual">Factual</option>
                        <option value="conceptual">Conceptual</option>
                        <option value="application">Application</option>
                      </select>

                      {isMissingAnswer && (
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-amber-600" />
                          Answer Key Missing (Click option A-D to set)
                        </span>
                      )}

                      {q.sourcePages && (
                        <span className="text-[11px] text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                          {q.sourcePages}
                        </span>
                      )}
                    </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveQuestion(qIdx)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                    title="Remove Question"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Question text textarea */}
                <textarea
                  rows={2}
                  value={q.question}
                  onChange={(e) =>
                    handleUpdateQuestion(qIdx, 'question', e.target.value)
                  }
                  className="w-full text-sm font-medium text-slate-800 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition mb-4"
                  placeholder="Question text..."
                />

                {/* 4 Options Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                    const isCorrect = q.correctOption === optKey;
                    return (
                      <div
                        key={optKey}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition ${
                          isCorrect
                            ? 'bg-emerald-50/80 border-emerald-300 ring-1 ring-emerald-300'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateQuestion(qIdx, 'correctOption', optKey)
                          }
                          className={`w-6 h-6 rounded-md font-bold text-xs flex items-center justify-center shrink-0 transition ${
                            isCorrect
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          }`}
                          title={isCorrect ? 'Correct option' : 'Set as correct option'}
                        >
                          {optKey}
                        </button>
                        <input
                          type="text"
                          value={q.options[optKey] || ''}
                          onChange={(e) =>
                            handleUpdateOption(qIdx, optKey, e.target.value)
                          }
                          className="w-full text-xs text-slate-800 bg-transparent focus:outline-hidden font-medium"
                          placeholder={`Option ${optKey}`}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Explanation */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Solution & Explanation:
                  </span>
                  <input
                    type="text"
                    value={q.explanation}
                    onChange={(e) =>
                      handleUpdateQuestion(qIdx, 'explanation', e.target.value)
                    }
                    className="w-full text-xs text-slate-700 bg-transparent focus:outline-hidden"
                    placeholder="Short explanation for the correct answer..."
                  />
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* TAB 3: MANAGE TESTS LIST (Drafts & Published) */}
      {activeTab === 'tests' && (
        <div className="space-y-6">
          {/* Filter and search bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {(['all', 'published', 'draft'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                    statusFilter === filter
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search tests by title or difficulty..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-72 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={loadAllTests}
                disabled={loadingTests}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition"
                title="Refresh list"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loadingTests ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>

          {loadingTests ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
              <p className="text-sm">Loading test catalogue...</p>
            </div>
          ) : filteredTests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
              <Layers className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-semibold text-slate-700">No mock tests found</p>
              <p className="text-xs text-slate-400 mt-1">
                Upload a PDF under "Generate Test" to create your first CBT examination.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTests.map((test) => {
                const isPublished = test.status === 'published';
                return (
                  <div
                    key={test.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            isPublished
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {test.status}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(test.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 text-sm line-clamp-2 mb-2">
                        {test.title}
                      </h3>

                      <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600 mb-4">
                        <span className="bg-slate-100 px-2 py-0.5 rounded font-medium">
                          {test.questionCount} Questions
                        </span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded font-medium">
                          {test.durationMinutes} Mins
                        </span>
                        <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                          {test.difficulty}
                        </span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded font-medium">
                          {test.language}
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(test.id, test.status)}
                          className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition ${
                            isPublished
                              ? 'text-amber-700 hover:bg-amber-50 border-amber-200'
                              : 'text-emerald-700 hover:bg-emerald-50 border-emerald-200'
                          }`}
                        >
                          {isPublished ? 'Unpublish' : 'Publish'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleLoadTestToPreview(test.id)}
                          className="text-xs font-semibold px-2.5 py-1.5 text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg transition"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          disabled={loadingInspector}
                          onClick={() => handleInspectTestJson(test.id, test.title)}
                          className="text-xs font-mono font-bold px-2 py-1.5 bg-slate-900 hover:bg-slate-800 text-purple-300 hover:text-white rounded-lg transition cursor-pointer flex items-center gap-1 shadow-xs"
                          title="Inspect strict MCQ JSON schema [question_number, question, options, answer]"
                        >
                          <Code className="w-3 h-3 text-purple-400" />
                          <span>{'{JSON}'}</span>
                        </button>

                        {onStartStudy && (
                          <button
                            type="button"
                            onClick={() => handleStartStudyFromTest(test.id, test.title)}
                            className="text-xs font-semibold px-2 py-1.5 text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded-lg transition cursor-pointer flex items-center gap-1"
                            title="Open interactive self-paced study mode"
                          >
                            <BookOpen className="w-3 h-3" />
                            <span>Study</span>
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteTest(test.id, test.title)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                        title="Delete test"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SYSTEM ANALYTICS & OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500">Total Registered Users</span>
                <p className="text-2xl font-black text-slate-900">
                  {overviewData?.totalUsers ?? '...'}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                <FileCheck2 className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500">Total Test Attempts</span>
                <p className="text-2xl font-black text-slate-900">
                  {overviewData?.totalAttempts ?? '...'}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500">Published Mock Tests</span>
                <p className="text-2xl font-black text-slate-900">
                  {testList.filter((t) => t.status === 'published').length}
                </p>
              </div>
            </div>
          </div>

          {/* Per-test performance table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Per-Test Examination Performance
                </h3>
                <p className="text-xs text-slate-500">
                  Candidate attempt counts, average scores, and accuracy rates across test papers.
                </p>
              </div>
              <button
                type="button"
                onClick={loadOverviewMetrics}
                className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            {loadingOverview ? (
              <div className="p-8 text-center text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                <p className="text-xs">Calculating metrics...</p>
              </div>
            ) : !overviewData?.perTestStats?.length ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No attempt data recorded yet. When candidates complete tests, statistics will populate here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4 font-bold">Test Paper</th>
                      <th className="py-3 px-4 font-bold text-center">Attempts</th>
                      <th className="py-3 px-4 font-bold text-center">Average Score</th>
                      <th className="py-3 px-4 font-bold text-center">Average Accuracy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {overviewData.perTestStats.map((stat) => (
                      <tr key={stat.testId} className="hover:bg-slate-50">
                        <td className="py-3.5 px-4 font-semibold text-slate-800">
                          {stat.title}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                          {stat.attemptCount}
                        </td>
                        <td className="py-3.5 px-4 text-center font-semibold text-blue-600">
                          {stat.averageScore} / 10
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            {stat.averageAccuracy}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: QUESTION PDF LIBRARY (VERBATIM EXTRACTION & AUTOMATION) */}
      {activeTab === 'pdfs' && (
        <div className="space-y-6">
          {/* Top Quota, Automation & Upload Settings Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Question PDF Library & Automation</h3>
                <p className="text-xs text-slate-500">
                  Extract verbatim MCQs from question papers with rules-first column-aware reading and Gemini quota protection.
                </p>
              </div>

              {/* Gemini Quota Meter */}
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                  AI
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <span>Gemini Calls Today:</span>
                    <span className="text-purple-700 font-mono">
                      {extractionSettings.geminiCallsToday} / {extractionSettings.maxGeminiCallsPerDay}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-24 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full ${
                          extractionSettings.geminiCallsToday >= extractionSettings.maxGeminiCallsPerDay
                            ? 'bg-red-500'
                            : 'bg-purple-600'
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            (extractionSettings.geminiCallsToday / extractionSettings.maxGeminiCallsPerDay) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={isUpdatingSettings}
                      onClick={() => {
                        const val = prompt(
                          'Enter Max Gemini calls per day budget:',
                          String(extractionSettings.maxGeminiCallsPerDay)
                        );
                        if (val && !isNaN(Number(val))) {
                          handleUpdateDailyBudget(Number(val));
                        }
                      }}
                      className="text-[10px] text-purple-600 hover:text-purple-800 font-bold underline cursor-pointer"
                    >
                      Edit Limit
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Automation Controls & Upload */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                {/* Auto Extract Checkbox */}
                <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    checked={extractionSettings.autoExtractOnUpload}
                    onChange={handleToggleAutoExtract}
                    className="w-4 h-4 text-purple-600 rounded cursor-pointer"
                  />
                  <span>Auto Extract & Save on Upload</span>
                </label>

                {/* Safe Auto Publish Clean Quizzes Toggle */}
                <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    checked={extractionSettings.publishCleanQuizzesAuto}
                    onChange={handleToggleAutoPublish}
                    className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  />
                  <div className="flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Publish Clean Quizzes Automatically</span>
                  </div>
                </label>

                {/* Bulk Publish Clean Quizzes Button */}
                <button
                  type="button"
                  disabled={bulkPublishing}
                  onClick={handleBulkPublishClean}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition cursor-pointer disabled:opacity-50"
                  title="Publishes all draft quizzes that have 100% answers, exam name, and year"
                >
                  <FileCheck2 className="w-4 h-4" />
                  <span>{bulkPublishing ? 'Publishing...' : 'Publish All Clean Quizzes'}</span>
                </button>
              </div>

              {/* Upload Input supporting multiple files & Custom JSON Importer */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleOpenCustomJsonImporter}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-purple-300 hover:text-white font-bold text-xs shadow-xs border border-purple-500/30 transition cursor-pointer"
                  title="Import or paste custom MCQ JSON array matching strict schema"
                >
                  <FileJson className="w-4 h-4 text-purple-400" />
                  <span>Import Custom MCQ JSON</span>
                </button>

                <label className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm transition cursor-pointer">
                  <FileUp className="w-4 h-4" />
                  <span>{isUploadingPdf ? 'Processing Queue...' : 'Select Question PDF(s) (max 50 MB)'}</span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,application/pdf"
                    disabled={isUploadingPdf}
                    onChange={handlePdfFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Live Progress Bar Banner */}
          {extractingPdfId && (
            <div className="p-5 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5 font-bold">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-600 shrink-0" />
                  <span>Verbatim MCQ Extraction in Progress</span>
                </div>
                <span className="text-[11px] font-mono text-purple-700">Rules-First & Sliced Gemini Engine</span>
              </div>
              <p className="text-xs text-purple-800">{extractionProgressMsg}</p>
              <div className="w-full bg-purple-200/60 rounded-full h-2 overflow-hidden">
                <div className="bg-purple-600 h-full rounded-full animate-pulse w-3/4" />
              </div>
            </div>
          )}

          {/* Question PDF Library Table & Search Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Question PDF Repository</h3>
                <p className="text-xs text-slate-500">
                  {pdfList.length} saved PDF document(s). Rules-first extraction runs without calling Gemini on clear text pages.
                </p>
              </div>
              <button
                type="button"
                onClick={loadPdfs}
                disabled={loadingPdfs}
                className="text-xs text-purple-600 hover:text-purple-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPdfs ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Modular Search & Filter Bar */}
            <SearchFilterBar
              filters={pdfFilters}
              onFilterChange={setPdfFilters}
              totalCount={pdfList.length}
              filteredCount={filteredPdfs.length}
              availableStatuses={['All', 'Answered', 'Unanswered', 'Bookmarked']}
              placeholder="Search PDFs by file name, exam title, or year..."
            />

            {pdfListError ? (
              <div className="p-5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <span className="font-semibold">{pdfListError}</span>
                </div>
                <button
                  type="button"
                  onClick={loadPdfs}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition cursor-pointer shrink-0 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              </div>
            ) : loadingPdfs ? (
              <div className="p-8 text-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-500" />
                <p className="text-xs">Loading PDF library...</p>
              </div>
            ) : pdfList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                No question PDFs uploaded yet. Use the upload button above to add question papers.
              </div>
            ) : filteredPdfs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                No PDFs match your filter criteria. Try searching a different keyword or resetting filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPdfs.map((pdf) => {
                  const isExtracting = extractingPdfId === pdf.id;
                  const pagesExtracted =
                    typeof pdf.pagesExtracted === 'number'
                      ? pdf.pagesExtracted
                      : pdf.lastExtractionReport?.processedPages || 0;
                  const totalPages = pdf.pageCount || 1;
                  const isAllExtracted = pagesExtracted >= totalPages && pdf.status === 'extracted';
                  const questionCount =
                    typeof pdf.questionCount === 'number'
                      ? pdf.questionCount
                      : pdf.lastExtractionReport?.questionsExtracted || 0;

                  const missingItems = pdf.possibleMissingQuestions || [];
                  const hasPossibleMissing = missingItems.length > 0;

                  const currentBatchSize = batchSizes[pdf.id] || 10;
                  const nextStart = (pdf.lastExtractedPage || pagesExtracted || 0) + 1;
                  const nextEnd = Math.min(totalPages, nextStart + currentBatchSize - 1);

                  return (
                    <div
                      key={pdf.id}
                      className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between gap-4"
                    >
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <FileText className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-900 text-sm truncate" title={pdf.fileName}>
                              {pdf.fileName}
                            </h4>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {(pdf.sizeBytes / (1024 * 1024)).toFixed(1)} MB • Uploaded{' '}
                              {new Date(pdf.uploadedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handlePromptDeletePdf(pdf.id, pdf.fileName, questionCount)}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition cursor-pointer shrink-0"
                          title="Delete PDF"
                          aria-label="Delete PDF"
                        >
                          <Trash2 className="w-4.5 h-4.5" />
                        </button>
                      </div>

                      {/* Clean Metric Lines */}
                      <div className="space-y-2 py-1 text-xs">
                        <div className="flex items-center justify-between text-slate-700">
                          <span className="text-slate-500 font-medium">Pages:</span>
                          <span className="font-bold font-mono text-slate-900">
                            {pagesExtracted} of {totalPages} extracted
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-700">
                          <span className="text-slate-500 font-medium">Questions:</span>
                          <span className="font-bold font-mono text-purple-700">
                            {questionCount} saved
                          </span>
                        </div>

                        {/* Status Line */}
                        <div className="pt-1 space-y-2">
                          {pdf.hasStorageData === false && (
                            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                <span className="font-semibold truncate">PDF data file missing in storage</span>
                              </div>
                              <label className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer shadow-xs shrink-0 flex items-center gap-1.5">
                                <Upload className="w-3.5 h-3.5" />
                                <span>Re-upload PDF</span>
                                <input
                                  type="file"
                                  accept=".pdf"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleReuploadPdf(pdf.id, file);
                                  }}
                                />
                              </label>
                            </div>
                          )}

                          {hasPossibleMissing ? (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-bold text-xs">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>{missingItems.length} possible missing questions - Check</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>All questions accounted for</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Controls Footer */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
                        <div className="flex items-center gap-2">
                          {isAllExtracted ? (
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs border border-slate-200 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                All pages extracted
                              </span>
                              <button
                                type="button"
                                disabled={isExtracting}
                                onClick={() =>
                                  handleRunExtraction(pdf.id, pdf.fileName, {
                                    startPage: 1,
                                    pageSize: Math.max(100, totalPages),
                                  })
                                }
                                className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                title="Re-run verbatim extraction starting from Page 1 with updated option parser"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isExtracting ? 'animate-spin' : ''}`} />
                                <span>Re-extract All Pages</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <select
                                value={currentBatchSize}
                                onChange={(e) =>
                                  setBatchSizes({ ...batchSizes, [pdf.id]: Number(e.target.value) })
                                }
                                disabled={isExtracting}
                                className="px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-slate-700 text-xs cursor-pointer disabled:opacity-50"
                              >
                                <option value={10}>10 pages</option>
                                <option value={20}>20 pages</option>
                                <option value={50}>50 pages</option>
                                <option value={100}>100 pages</option>
                              </select>

                              <button
                                type="button"
                                disabled={isExtracting}
                                onClick={() =>
                                  handleRunExtraction(pdf.id, pdf.fileName, {
                                    pageSize: currentBatchSize,
                                    resume: true,
                                  })
                                }
                                className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                {isExtracting ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>
                                      {pdf.currentProgressMsg || `Reading pages ${nextStart}-${nextEnd} of ${totalPages}`}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-3.5 h-3.5" />
                                    <span>Extract next pages</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={questionCount === 0 || loadingInspector}
                            onClick={() => handleInspectPdfJson(pdf.id, pdf.fileName)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-purple-300 hover:text-white font-mono text-[11px] font-bold transition cursor-pointer disabled:opacity-40 flex items-center gap-1 shadow-xs"
                            title="Inspect strict MCQ JSON schema [question_number, question, options, answer]"
                          >
                            <Code className="w-3 h-3 text-purple-400" />
                            <span>{'{JSON}'}</span>
                          </button>

                          {questionCount > 0 && (
                            <button
                              type="button"
                              onClick={() => handleStartStudyFromPdf(pdf.id, pdf.fileName)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] transition cursor-pointer flex items-center gap-1"
                              title="Open interactive self-paced study mode for this PDF"
                            >
                              <BookOpen className="w-3 h-3 text-emerald-600" />
                              <span>Study</span>
                            </button>
                          )}

                          {questionCount > 0 && (
                            <button
                              type="button"
                              onClick={() => handleStartQuizFromPdf(pdf.id, pdf.fileName)}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold text-[11px] transition cursor-pointer flex items-center gap-1"
                              title="Launch CBT timed practice quiz for this PDF"
                            >
                              <Play className="w-3 h-3 text-blue-600" />
                              <span>Quiz</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isExtracting}
                            onClick={() => handleCleanAndReextract(pdf.id, pdf.fileName)}
                            className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[11px] transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
                            title="Deletes placeholder questions and re-extracts from Page 1 using strict verbatim rules"
                          >
                            <Trash2 className="w-3 h-3 text-amber-600" />
                            <span>Clean & re-extract</span>
                          </button>

                          {pdf.lastExtractionReport && (
                            <button
                              type="button"
                              onClick={() => handleViewReport(pdf.id, pdf.fileName)}
                              className="text-purple-600 hover:text-purple-800 font-bold text-xs underline cursor-pointer ml-1"
                            >
                              View report
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* REPORTED QUESTIONS TAB VIEW */}
      {activeTab === 'reports' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-500" />
                <span>Question Error Feedback & Reports</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Candidate-submitted flags for typos, incorrect answers, or ambiguous question explanations.
              </p>
            </div>
            <button
              type="button"
              onClick={loadQuestionReports}
              className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 transition cursor-pointer"
              title="Refresh Reports"
            >
              <RefreshCw className={`w-4 h-4 ${loadingReports ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingReports ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-rose-500" />
              <p className="text-xs font-semibold">Loading candidate feedback...</p>
            </div>
          ) : reportsList.length === 0 ? (
            <div className="py-12 text-center text-slate-500 border border-dashed border-slate-200 rounded-xl">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h3 className="font-bold text-slate-800 text-sm">No Reported Questions</h3>
              <p className="text-xs text-slate-400 mt-0.5">There are currently no active flags or user reported question errors.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reportsList.map((rep) => (
                <div
                  key={rep.id}
                  className={`p-4 rounded-xl border text-xs transition ${
                    rep.status === 'resolved'
                      ? 'bg-slate-50 border-slate-200 opacity-75'
                      : 'bg-rose-50/50 border-rose-200 shadow-2xs'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`font-black uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full ${
                          rep.reason === 'Wrong answer'
                            ? 'bg-rose-600 text-white'
                            : rep.reason === 'Typo'
                            ? 'bg-amber-600 text-white'
                            : 'bg-purple-600 text-white'
                        }`}
                      >
                        {rep.reason}
                      </span>
                      <span className="font-bold text-slate-800">
                        {rep.testTitle} • Q.#{rep.questionNumber}
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        by {rep.userEmail || 'Candidate'} on {new Date(rep.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {rep.status === 'resolved' ? (
                        <span className="text-emerald-700 font-bold bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-lg flex items-center gap-1 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Resolved</span>
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={loadingReportQuestionId === rep.id}
                            onClick={() => handleOpenFixReportModal(rep)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition shadow-xs cursor-pointer flex items-center gap-1 disabled:opacity-60"
                          >
                            {loadingReportQuestionId === rep.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Edit3 className="w-3.5 h-3.5" />
                            )}
                            <span>Fix Question</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResolveReport(rep.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition shadow-xs cursor-pointer flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark Resolved</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200 mt-2 font-medium text-slate-800">
                    <p className="font-bold text-slate-900 mb-1">Question Text:</p>
                    <p className="line-clamp-3">{rep.questionText}</p>
                  </div>

                  {rep.comment && (
                    <p className="mt-2 text-slate-600 italic bg-slate-100/70 p-2.5 rounded-lg border border-slate-200/80">
                      <strong>Candidate Comment:</strong> "{rep.comment}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* COMPREHENSIVE EXTRACTION AUDIT REPORT MODAL */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-scale-up">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="font-bold text-sm sm:text-base">Extraction Audit & Quota Report</h3>
                  <p className="text-xs text-slate-400 truncate max-w-md">{selectedReport.pdfName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs text-slate-800">
              {/* Top Summary Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Pages Read / Total</span>
                  <span className="text-lg font-black text-slate-900">
                    {selectedReport.report.processedPages} / {selectedReport.report.totalPages}
                  </span>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 block">Questions Saved</span>
                  <span className="text-lg font-black text-emerald-800">{selectedReport.report.questionsExtracted}</span>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl">
                  <span className="text-[10px] font-bold uppercase text-blue-700 block">Rules vs Gemini</span>
                  <span className="text-lg font-black text-blue-800">
                    {selectedReport.report.questionsParsedByRules || 0} / {selectedReport.report.questionsParsedByGemini || 0}
                  </span>
                </div>

                <div className="bg-purple-50 border border-purple-200 p-3 rounded-xl">
                  <span className="text-[10px] font-bold uppercase text-purple-700 block">Gemini Calls Used</span>
                  <span className="text-lg font-black text-purple-800">{selectedReport.report.geminiCallsUsed || 0}</span>
                </div>
              </div>

              {/* Detailed Secondary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Notes Pages Skipped</span>
                  <span className="text-base font-bold text-slate-800">{selectedReport.report.notesPagesSkipped || 0}</span>
                </div>

                <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl">
                  <span className="text-[10px] font-bold uppercase text-indigo-700 block">End Key Matches</span>
                  <span className="text-base font-bold text-indigo-800">{selectedReport.report.endAnswerKeyMatchesCount || 0}</span>
                </div>

                <div className="bg-teal-50 border border-teal-200 p-3 rounded-xl">
                  <span className="text-[10px] font-bold uppercase text-teal-700 block">Linked Explanations</span>
                  <span className="text-base font-bold text-teal-800">{selectedReport.report.linkedExplanationsCount || 0}</span>
                </div>

                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
                  <span className="text-[10px] font-bold uppercase text-amber-700 block">Missing Answers</span>
                  <span className="text-base font-bold text-amber-800">{selectedReport.report.questionsWithMissingAnswers}</span>
                </div>
              </div>

              {/* Quiz Generation & Auto-Publishing Overview */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">
                    Created Quizzes ({selectedReport.report.quizzesCreated || 0})
                  </h4>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-emerald-700 font-bold bg-emerald-100/60 px-2 py-0.5 rounded">
                      {selectedReport.report.quizzesPublished || 0} Published
                    </span>
                    <span className="text-amber-700 font-bold bg-amber-100/60 px-2 py-0.5 rounded">
                      {selectedReport.report.quizzesNeedingReview || 0} Draft / Review
                    </span>
                  </div>
                </div>

                {selectedReport.report.quizSummaries?.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {selectedReport.report.quizSummaries.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-center justify-between bg-white border border-slate-200 p-2.5 rounded-lg text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{q.title}</span>
                          <span
                            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              q.status === 'published'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {q.status}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-mono">
                          {q.questionCount} MCQs
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Completeness & Sequence Gap Audit */}
              {((selectedReport.report.possibleMissingQuestions && selectedReport.report.possibleMissingQuestions.length > 0) ||
                (selectedReport.report.mismatches && selectedReport.report.mismatches.length > 0) ||
                (selectedReport.report.unresolvedPages && selectedReport.report.unresolvedPages.length > 0)) ? (
                <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/70 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-amber-900 flex items-center gap-1.5 text-sm">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Possible Missing Questions / Gaps ({selectedReport.report.possibleMissingQuestions?.length || 0})</span>
                      </h4>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        These items were identified by independent marker count mismatches or sequence gaps.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const pdf = pdfList.find((p) => p.fileName === selectedReport.pdfName);
                        const pagesToRecheck =
                          selectedReport.report.unresolvedPages ||
                          selectedReport.report.failedPages ||
                          (selectedReport.report.possibleMissingQuestions || []).map((m) => m.pageNumber);
                        const uniqueUnresolved = Array.from(new Set(pagesToRecheck.map(Number))).filter(Boolean);
                        if (pdf && uniqueUnresolved.length > 0) {
                          setSelectedReport(null);
                          handleRunExtraction(pdf.id, pdf.fileName, { targetPages: uniqueUnresolved });
                        }
                      }}
                      className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Re-check these pages</span>
                    </button>
                  </div>

                  {selectedReport.report.possibleMissingQuestions && selectedReport.report.possibleMissingQuestions.length > 0 && (
                    <ul className="space-y-1.5 text-amber-900 text-xs divide-y divide-amber-200/50 pt-1">
                      {selectedReport.report.possibleMissingQuestions.map((item, idx) => (
                        <li key={idx} className="pt-1.5 flex items-start gap-2">
                          <span className="font-mono font-bold bg-amber-200/60 px-1.5 py-0.5 rounded text-[11px] shrink-0">
                            Page {item.pageNumber} {item.questionNumber ? `• Q.${item.questionNumber}` : ''}
                          </span>
                          <span>{item.reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/70 flex items-center gap-2 text-emerald-800 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>All questions accounted for. No marker mismatches or sequence gaps detected.</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Delete PDF Confirmation Modal */}
      {pdfToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 text-red-600">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Delete {pdfToDelete.fileName}?
                  </h3>
                  <p className="text-xs text-slate-500">
                    This will delete the PDF document file from storage and its repository record.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPdfToDelete(null);
                  setPdfDeleteError(null);
                }}
                disabled={isDeletingPdf}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {pdfToDelete.questionCount > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-medium">
                This PDF has {pdfToDelete.questionCount} saved questions. They will stay in the library.
              </div>
            )}

            {pdfDeleteError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{pdfDeleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingPdf}
                onClick={() => {
                  setPdfToDelete(null);
                  setPdfDeleteError(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingPdf}
                onClick={handleConfirmDeletePdf}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {isDeletingPdf ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fix Reported Question & Resolve Modal */}
      {editingReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-blue-400" />
                  <span>Fix Question & Resolve Report</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 truncate max-w-lg">
                  {editingReportModal.testTitle} • Question #{editingReportModal.questionIndex + 1} • Flagged as "{editingReportModal.report.reason}"
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingReportModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              {editingReportModal.report.comment && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                  <strong>Candidate Comment:</strong> "{editingReportModal.report.comment}"
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Question Text</label>
                <textarea
                  rows={3}
                  value={editingReportModal.questionText}
                  onChange={(e) =>
                    setEditingReportModal((prev) =>
                      prev ? { ...prev, questionText: e.target.value } : null
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['A', 'B', 'C', 'D', ...(editingReportModal.options.E !== undefined ? ['E'] : [])] as Array<
                  'A' | 'B' | 'C' | 'D' | 'E'
                >).map((opt) => (
                  <div key={opt}>
                    <label className="block font-bold text-slate-700 mb-1">Option {opt}</label>
                    <input
                      type="text"
                      value={editingReportModal.options[opt] || ''}
                      onChange={(e) =>
                        setEditingReportModal((prev) =>
                          prev
                            ? {
                                ...prev,
                                options: { ...prev.options, [opt]: e.target.value },
                              }
                            : null
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Correct Option</label>
                  <select
                    value={editingReportModal.correctOption}
                    onChange={(e) =>
                      setEditingReportModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              correctOption: e.target.value as 'A' | 'B' | 'C' | 'D' | 'E',
                            }
                          : null
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 bg-white focus:border-blue-500 focus:outline-none font-bold"
                  >
                    <option value="A">Option A</option>
                    <option value="B">Option B</option>
                    <option value="C">Option C</option>
                    <option value="D">Option D</option>
                    {editingReportModal.options.E !== undefined && (
                      <option value="E">Option E</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={editingReportModal.subject}
                    onChange={(e) =>
                      setEditingReportModal((prev) =>
                        prev ? { ...prev, subject: e.target.value } : null
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g., Polity"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Chapter</label>
                  <input
                    type="text"
                    value={editingReportModal.chapter}
                    onChange={(e) =>
                      setEditingReportModal((prev) =>
                        prev ? { ...prev, chapter: e.target.value } : null
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g., Fundamental Rights"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Explanation</label>
                <textarea
                  rows={3}
                  value={editingReportModal.explanation}
                  onChange={(e) =>
                    setEditingReportModal((prev) =>
                      prev ? { ...prev, explanation: e.target.value } : null
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Resolution Note (Optional)</label>
                <input
                  type="text"
                  value={editingReportModal.resolutionNote}
                  onChange={(e) =>
                    setEditingReportModal((prev) =>
                      prev ? { ...prev, resolutionNote: e.target.value } : null
                    )
                  }
                  placeholder="e.g., Corrected answer key from B to C"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {reportFixError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{reportFixError}</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                disabled={savingReportFix}
                onClick={() => setEditingReportModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingReportFix}
                onClick={handleSaveFixAndResolve}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-60"
              >
                {savingReportFix ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Fix & Resolve Report</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Strict MCQ Raw JSON Inspector & Importer Modal */}
      <RawJsonInspector
        questions={inspectorQuestions}
        title={inspectorTitle}
        isOpen={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        onLoadCustomQuestions={handleLoadCustomQuestionsFromInspector}
        onTestSaved={loadAllTests}
      />
    </div>
  );
};
