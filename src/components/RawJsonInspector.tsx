import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Code,
  Copy,
  Check,
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  FileJson,
  X,
  Play,
  BookOpen,
  Sparkles,
  ArrowLeft,
  Key,
  Layers,
  FileText,
  Image as ImageIcon,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CloudUpload,
  Edit3,
  Loader2,
  Save,
} from 'lucide-react';
import { MCQQuestion } from '../types';
import {
  convertMCQToRawSchema,
  convertRawSchemaToMCQ,
  validateRawMCQJson,
  formatRawMCQJson,
  RawMCQSchemaItem,
  hasMultipleTopLevelArrays,
  formatSimpleLatex,
  parseAnswerKey,
  evaluateQuestionReview,
} from '../utils/mcqSchema';
import { saveTestToCloud } from '../services/cloudStorageService';

interface RawJsonInspectorProps {
  questions: MCQQuestion[];
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  onLoadCustomQuestions?: (questions: MCQQuestion[], title: string, mode: 'study' | 'quiz' | 'editor') => void;
  onTestSaved?: () => void;
}

export const RawJsonInspector: React.FC<RawJsonInspectorProps> = ({
  questions,
  title = 'MCQ Questions',
  isOpen,
  onClose,
  onLoadCustomQuestions,
  onTestSaved,
}) => {
  const [activeTab, setActiveTab] = useState<'inspect' | 'import'>('inspect');
  const [copied, setCopied] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [isSavingToCloud, setIsSavingToCloud] = useState(false);
  const [saveCloudSuccess, setSaveCloudSuccess] = useState<string | null>(null);
  const [saveCloudError, setSaveCloudError] = useState<string | null>(null);
  const isDismissingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Conversion of current questions to the strict schema
  const rawSchemaData = useMemo(() => {
    return convertMCQToRawSchema(questions);
  }, [questions]);

  const jsonString = useMemo(() => {
    return formatRawMCQJson(rawSchemaData);
  }, [rawSchemaData]);

  // Sample bilingual 5-option JSON
  const sampleJson = useMemo(() => {
    return JSON.stringify(
      [
        {
          question_number: '1',
          question: 'What is the value of 5 \\times 10^3?',
          question_hindi: '5 \\times 10^3 का मान क्या है?',
          question_english: 'What is the value of 5 \\times 10^3?',
          options: {
            a: '500',
            b: '5000',
            c: '50000',
            d: '0.005',
            e: 'None of the above',
          },
          answer: 'b',
          examName: 'BPSC',
          year: '2023',
          subject: 'Mathematics',
          chapter: 'Exponents',
        },
        {
          question_number: '2',
          question: 'Which element has the chemical symbol Fe?',
          question_hindi: 'किस तत्व का रासायनिक प्रतीक Fe है?',
          question_english: 'Which element has the chemical symbol Fe?',
          options: {
            a: 'Fluorine',
            b: 'Iron',
            c: 'Francium',
            d: 'Lead',
            e: 'None of the above',
          },
          answer: 'b',
          explanation: 'Fe stands for Ferrum, Latin for Iron.',
          examName: 'UPSC',
          year: '2022',
          subject: 'Chemistry',
          chapter: 'Elements',
        },
      ],
      null,
      2
    );
  }, []);

  const [customInput, setCustomInput] = useState<string>(sampleJson);
  const [customTitle, setCustomTitle] = useState<string>('Imported 100-Question Test');
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    error?: string;
    data?: RawMCQSchemaItem[];
  } | null>(null);

  // Parsed questions state
  const [parsedQuestions, setParsedQuestions] = useState<MCQQuestion[]>([]);

  // Answer key tool state
  const [showAnswerKeyBox, setShowAnswerKeyBox] = useState<boolean>(false);
  const [answerKeyInput, setAnswerKeyInput] = useState<string>('');
  const [answerKeyStatus, setAnswerKeyStatus] = useState<string | null>(null);

  // Passage attachment tool state
  const [showPassageTool, setShowPassageTool] = useState<boolean>(false);
  const [passageRange, setPassageRange] = useState<string>('');
  const [passageText, setPassageText] = useState<string>('');
  const [passageDataText, setPassageDataText] = useState<string>('');
  const [passageImageBase64, setPassageImageBase64] = useState<string>('');
  const [passageAttachMessage, setPassageAttachMessage] = useState<string | null>(null);

  // Review List drawer toggle
  const [showReviewList, setShowReviewList] = useState<boolean>(false);

  // Chunks of at most 100 questions
  const [selectedChunkIndex, setSelectedChunkIndex] = useState<number>(0);

  const safelyClose = () => {
    isDismissingRef.current = true;
    if (window.history.state?.modal === 'raw-json-inspector') {
      window.history.back();
    }
    onClose();
  };

  const handleAttemptClose = () => {
    const hasUnsavedPasted =
      activeTab === 'import' && customInput.trim() !== '' && customInput !== sampleJson;
    if (hasUnsavedPasted) {
      setShowDiscardDialog(true);
    } else {
      safelyClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    isDismissingRef.current = false;

    // Push state for mobile / browser back button navigation
    window.history.pushState({ modal: 'raw-json-inspector' }, '');

    const handlePopState = () => {
      if (isDismissingRef.current) return;
      const hasUnsavedPasted =
        activeTab === 'import' && customInput.trim() !== '' && customInput !== sampleJson;
      if (hasUnsavedPasted) {
        window.history.pushState({ modal: 'raw-json-inspector' }, '');
        setShowDiscardDialog(true);
      } else {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleAttemptClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, activeTab, customInput, sampleJson, onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = jsonString;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    link.href = url;
    link.download = `${safeTitle}_mcq_schema.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Core parser and validator
  const doValidate = (textToValidate: string) => {
    if (hasMultipleTopLevelArrays(textToValidate)) {
      setValidationResult({
        valid: false,
        error: 'Paste one array at a time',
      });
      setParsedQuestions([]);
      return null;
    }

    const res = validateRawMCQJson(textToValidate);
    setValidationResult(res);

    if (res.valid && res.data) {
      const mcqs = convertRawSchemaToMCQ(res.data);
      setParsedQuestions(mcqs);
      setSelectedChunkIndex(0);
      setAnswerKeyStatus(null);
      setPassageAttachMessage(null);
      return mcqs;
    } else {
      setParsedQuestions([]);
      return null;
    }
  };

  const handleValidateCustom = () => {
    doValidate(customInput);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCustomInput(text);
        doValidate(text);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setPassageImageBase64(base64);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Chunks of at most 100 questions
  const chunks = useMemo(() => {
    if (parsedQuestions.length === 0) return [];
    const result: { title: string; questions: MCQQuestion[]; range: string; index: number }[] = [];
    const chunkSize = 100;
    for (let i = 0; i < parsedQuestions.length; i += chunkSize) {
      const slice = parsedQuestions.slice(i, i + chunkSize);
      const startNum = i + 1;
      const endNum = i + slice.length;
      result.push({
        title: `Part ${Math.floor(i / chunkSize) + 1} (Q${startNum}-${endNum})`,
        questions: slice,
        range: `Q${startNum} - Q${endNum}`,
        index: Math.floor(i / chunkSize),
      });
    }
    return result;
  }, [parsedQuestions]);

  const activeQuestionsForAction = useMemo(() => {
    if (chunks.length === 0) return parsedQuestions;
    return chunks[selectedChunkIndex]?.questions || parsedQuestions;
  }, [chunks, selectedChunkIndex, parsedQuestions]);

  // Import Summary stats across all parsed questions
  const summary = useMemo(() => {
    const total = parsedQuestions.length;
    let missingAnswers = 0;
    let needsReviewCount = 0;
    let ready = 0;

    parsedQuestions.forEach((q) => {
      const isMissing = !q.correctOption || q.answerStatus === 'missing';
      if (isMissing) missingAnswers++;
      if (q.needs_review) needsReviewCount++;
      if (!isMissing && !q.needs_review) ready++;
    });

    return { total, ready, missingAnswers, needsReviewCount };
  }, [parsedQuestions]);

  // Flagged questions requiring review or answers
  const flaggedQuestions = useMemo(() => {
    return parsedQuestions.filter(
      (q) => q.needs_review || !q.correctOption || q.answerStatus === 'missing'
    );
  }, [parsedQuestions]);

  const hasBlockingIssues = summary.missingAnswers > 0 || summary.needsReviewCount > 0;

  // Apply Answer Key
  const handleApplyAnswerKey = () => {
    if (!answerKeyInput.trim() || parsedQuestions.length === 0) return;
    const map = parseAnswerKey(answerKeyInput);
    const keysFound = Object.keys(map);
    if (keysFound.length === 0) {
      setAnswerKeyStatus('No recognizable answer key entries found. Use format "1-b", "1 b", or JSON.');
      return;
    }

    let matchedCount = 0;
    const updated = parsedQuestions.map((q) => {
      const qIdStr = String(q.id);
      const matchedAns = map[qIdStr];
      if (matchedAns) {
        matchedCount++;
        const nextQ: MCQQuestion = {
          ...q,
          correctOption: matchedAns,
          answerStatus: 'found',
        };
        const check = evaluateQuestionReview(nextQ);
        nextQ.needs_review = check.needsReview;
        nextQ.reviewReasons = check.reasons;
        return nextQ;
      }
      return q;
    });

    setParsedQuestions(updated);

    const remainingMissing = updated.filter(
      (q) => !q.correctOption || q.answerStatus === 'missing'
    );
    const unmatchedList = remainingMissing.map((q) => q.id).slice(0, 15);
    const moreCount = remainingMissing.length - unmatchedList.length;

    if (remainingMissing.length === 0) {
      setAnswerKeyStatus(
        `All matched! Successfully applied ${matchedCount} answers. All ${updated.length} questions now have valid answers.`
      );
    } else {
      setAnswerKeyStatus(
        `Matched ${matchedCount} answers. Unmatched numbers (${remainingMissing.length}): Q${unmatchedList.join(
          ', Q'
        )}${moreCount > 0 ? ` and ${moreCount} more` : ''}.`
      );
    }
  };

  // Attach Passage / Data / Image to Question or Range
  const handleAttachPassage = () => {
    if (!passageRange.trim()) {
      setPassageAttachMessage('Please specify a question number or range like "76-80" or "76".');
      return;
    }

    const rangeMatch = passageRange.trim().match(/^Q?(\d+)(?:\s*-\s*Q?(\d+))?$/i);
    if (!rangeMatch) {
      setPassageAttachMessage('Invalid range format. Use e.g. "76" or "76-80".');
      return;
    }

    let startNum = parseInt(rangeMatch[1], 10);
    let endNum = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : startNum;

    if (startNum > endNum) {
      const temp = startNum;
      startNum = endNum;
      endNum = temp;
    }

    let attachedCount = 0;
    const updated = parsedQuestions.map((q) => {
      if (q.id >= startNum && q.id <= endNum) {
        attachedCount++;
        const nextQ: MCQQuestion = {
          ...q,
          passage: passageText.trim() ? passageText.trim() : q.passage,
          data: passageDataText.trim() ? passageDataText.trim() : q.data,
          passageImage: passageImageBase64 ? passageImageBase64 : q.passageImage,
        };
        const check = evaluateQuestionReview(nextQ);
        nextQ.needs_review = check.needsReview;
        nextQ.reviewReasons = check.reasons;
        return nextQ;
      }
      return q;
    });

    setParsedQuestions(updated);
    setPassageAttachMessage(
      `Attached passage/data to ${attachedCount} question(s) (Q${startNum} - Q${endNum}).`
    );
  };

  // Launch handler: Imported quizzes are always drafts and split into at most 100 questions
  const handleLaunchCustom = (mode: 'study' | 'quiz') => {
    let currentList = parsedQuestions;
    if (parsedQuestions.length === 0) {
      const res = doValidate(customInput);
      if (!res) return;
      currentList = res;
    }

    // Check blocking issues
    const unreadyCount = currentList.filter(
      (q) => q.needs_review || !q.correctOption || q.answerStatus === 'missing'
    ).length;

    if (unreadyCount > 0) {
      setShowReviewList(true);
      return;
    }

    const targetQs = activeQuestionsForAction;
    if (!targetQs || targetQs.length === 0) return;

    const chunkSuffix = chunks.length > 1 ? ` - ${chunks[selectedChunkIndex]?.title}` : '';
    const finalTitle = `${customTitle.trim() || 'Custom MCQ Test'}${chunkSuffix} (Draft)`;

    if (onLoadCustomQuestions) {
      onLoadCustomQuestions(targetQs, finalTitle, mode);
      safelyClose();
    }
  };

  // Direct Save to Firebase Firestore
  const handleSaveToFirebase = async () => {
    let currentList = parsedQuestions;
    if (parsedQuestions.length === 0) {
      const res = doValidate(customInput);
      if (!res) return;
      currentList = res;
    }

    const targetQs = activeQuestionsForAction;
    if (!targetQs || targetQs.length === 0) return;

    setIsSavingToCloud(true);
    setSaveCloudSuccess(null);
    setSaveCloudError(null);

    try {
      const chunkSuffix = chunks.length > 1 ? ` - ${chunks[selectedChunkIndex]?.title}` : '';
      const finalTitle = `${customTitle.trim() || 'Custom MCQ Test'}${chunkSuffix} (Draft)`;

      const hasHindiChars = (str?: string) => /[\u0900-\u097F]/.test(str || '');
      const isHindi = targetQs.some((q) => hasHindiChars(q.question) || hasHindiChars(q.questionHindi));

      const res = await saveTestToCloud({
        title: finalTitle,
        status: 'draft',
        language: isHindi ? 'Hindi' : 'English',
        difficulty: 'Medium',
        durationMinutes: Math.max(5, Math.ceil(targetQs.length * 1.5)),
        markingCorrect: 1.0,
        markingWrong: 0.25,
        sourcePageCount: 1,
        examName: targetQs[0]?.examName || '',
        year: targetQs[0]?.year || String(new Date().getFullYear()),
        questions: targetQs,
      });

      setSaveCloudSuccess(`Saved ${targetQs.length} questions to Firebase Firestore as Draft! (Test ID: ${res.id})`);
      if (onTestSaved) onTestSaved();
    } catch (err: any) {
      setSaveCloudError(err.message || 'Failed to save questions to Firebase');
    } finally {
      setIsSavingToCloud(false);
    }
  };

  // Load into Admin Test Editor
  const handleLoadIntoEditor = () => {
    let currentList = parsedQuestions;
    if (parsedQuestions.length === 0) {
      const res = doValidate(customInput);
      if (!res) return;
      currentList = res;
    }

    const targetQs = activeQuestionsForAction;
    if (!targetQs || targetQs.length === 0) return;

    const chunkSuffix = chunks.length > 1 ? ` - ${chunks[selectedChunkIndex]?.title}` : '';
    const finalTitle = `${customTitle.trim() || 'Custom MCQ Test'}${chunkSuffix}`;

    if (onLoadCustomQuestions) {
      onLoadCustomQuestions(targetQs, finalTitle, 'editor');
      safelyClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleAttemptClose();
      }}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Sticky with top-left Back button and Close X */}
        <div className="sticky top-0 z-20 p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
          {/* Top-left: Back Button + Close 'X' Button */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleAttemptClose}
              className="min-w-[44px] min-h-[44px] px-3 py-2 flex items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs sm:text-sm transition cursor-pointer touch-manipulation shadow-xs border border-slate-200 dark:border-slate-700"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-200 shrink-0" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={handleAttemptClose}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer touch-manipulation shadow-xs border border-slate-200 dark:border-slate-700"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />

            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                <FileJson className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 truncate">
                    Raw MCQ JSON Inspector
                  </h2>
                  <span className="hidden md:inline-flex text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 px-2 py-0.5 rounded-full">
                    100-Q Bilingual Ready
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs md:max-w-md">
                  {title} • {rawSchemaData.length} Question{rawSchemaData.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          </div>

          {/* Right side: Tabs */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('inspect')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  activeTab === 'inspect'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                Inspect & Export
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('import')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  activeTab === 'import'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                Import / Custom
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        {activeTab === 'inspect' ? (
          <div className="flex-1 overflow-hidden flex flex-col p-4 sm:p-6 space-y-4">
            {/* Schema Info Bar */}
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 p-3 rounded-xl text-blue-900 dark:text-blue-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  Standard Bilingual Schema: accepts <code>question</code>, <code>question_hindi</code>, <code>question_english</code>, options a-e, and passages.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-lg text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100/50 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .json</span>
                </button>
              </div>
            </div>

            {/* Code Viewer */}
            <div className="flex-1 min-h-[300px] overflow-auto rounded-2xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-slate-200 shadow-inner">
              <pre className="leading-relaxed">
                <code>{jsonString}</code>
              </pre>
            </div>

            {/* Footer Summary */}
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span>{rawSchemaData.length} questions formatted • LaTeX symbols supported</span>
              <span className="text-[11px] text-slate-400">Strict Bilingual MCQ Output</span>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col p-4 sm:p-6 space-y-4">
            {/* Top Toolbar: Title, File Upload, Sample JSON */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex-1 min-w-0">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Draft Test Title:
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full sm:max-w-md px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100"
                  placeholder="e.g. BPSC Full Mock Test 100Q..."
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-600" />
                  <span>Upload .json file</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCustomInput(sampleJson);
                    doValidate(sampleJson);
                  }}
                  className="px-3 py-2 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800/80 rounded-xl text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>Load Sample JSON</span>
                </button>
              </div>
            </div>

            {/* Import Summary Bar (Item 8) */}
            {parsedQuestions.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Total Questions
                  </div>
                  <div className="text-xl font-black text-slate-900 dark:text-slate-100 mt-0.5">
                    {summary.total}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
                  <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Ready</span>
                  </div>
                  <div className="text-xl font-black text-emerald-800 dark:text-emerald-300 mt-0.5">
                    {summary.ready}
                  </div>
                </div>

                <div
                  className={`p-3 rounded-2xl border ${
                    summary.missingAnswers > 0
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600'
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <Key className="w-3.5 h-3.5" />
                    <span>Missing Answers</span>
                  </div>
                  <div className="text-xl font-black mt-0.5">{summary.missingAnswers}</div>
                </div>

                <div
                  className={`p-3 rounded-2xl border ${
                    summary.needsReviewCount > 0
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-300'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600'
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Needs Review</span>
                  </div>
                  <div className="text-xl font-black mt-0.5">{summary.needsReviewCount}</div>
                </div>
              </div>
            )}

            {/* Split Quizzes Selector (Item 7: split into quizzes of at most 100 questions) */}
            {chunks.length > 1 && (
              <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/70 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                      Split into at most 100 questions:
                    </span>
                    <span className="text-[11px] text-indigo-700 dark:text-indigo-300 ml-1">
                      ({parsedQuestions.length} total questions divided into {chunks.length} parts)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {chunks.map((ch, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedChunkIndex(idx)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                        selectedChunkIndex === idx
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
                      }`}
                    >
                      {ch.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tool Toggles: Answer Key & Attach Passage */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setShowAnswerKeyBox(!showAnswerKeyBox)}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border cursor-pointer ${
                  showAnswerKeyBox
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                }`}
              >
                <Key className="w-3.5 h-3.5 text-amber-600" />
                <span>{showAnswerKeyBox ? 'Hide Answer Key Box' : 'Paste Answer Key'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPassageTool(!showPassageTool)}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border cursor-pointer ${
                  showPassageTool
                    ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 border-blue-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>{showPassageTool ? 'Hide Passage / Data Tool' : 'Attach Passage / Data / Image'}</span>
              </button>

              {flaggedQuestions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowReviewList(!showReviewList)}
                  className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 transition cursor-pointer ml-auto"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span>
                    {showReviewList ? 'Hide Review Items' : `View ${flaggedQuestions.length} Review Issues`}
                  </span>
                  {showReviewList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {/* Box 1: Paste Answer Key (Item 3) */}
            {showAnswerKeyBox && (
              <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-amber-600" />
                    <h3 className="text-xs font-bold text-amber-950 dark:text-amber-200">
                      Paste Answer Key (e.g. "1-b", "1 b", "Q1: C", or JSON map)
                    </h3>
                  </div>
                  <span className="text-[11px] text-amber-800/80 dark:text-amber-400">
                    Applies answer key to matching question numbers
                  </span>
                </div>

                <textarea
                  value={answerKeyInput}
                  onChange={(e) => setAnswerKeyInput(e.target.value)}
                  placeholder="Paste lines like:&#10;1-b&#10;2 c&#10;3-A&#10;4: d&#10;or { &quot;1&quot;: &quot;b&quot;, &quot;2&quot;: &quot;c&quot; }"
                  rows={4}
                  className="w-full p-3 font-mono text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-amber-200 dark:border-amber-800 rounded-xl focus:ring-2 focus:ring-amber-500"
                />

                <div className="flex items-center justify-between flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleApplyAnswerKey}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    Apply Answer Key
                  </button>

                  {answerKeyStatus && (
                    <span className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                      {answerKeyStatus}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Box 2: Attach Passage / Data / Image to Question or Range (Item 5) */}
            {showPassageTool && (
              <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold text-blue-950 dark:text-blue-200">
                      Attach Reference Passage, Data Table, or Graphic to Range (e.g. Q76-80)
                    </h3>
                  </div>
                  <span className="text-[11px] text-blue-800/80 dark:text-blue-400">
                    Will appear above questions on the Test Screen
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Target Range (e.g. 76-80 or 76):
                    </label>
                    <input
                      type="text"
                      value={passageRange}
                      onChange={(e) => setPassageRange(e.target.value)}
                      placeholder="e.g. 76-80"
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Attach Image (Optional):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700"
                      />
                      {passageImageBase64 && (
                        <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>Image Loaded</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Passage Text (LaTeX like \times, ^n supported):
                    </label>
                    <textarea
                      value={passageText}
                      onChange={(e) => setPassageText(e.target.value)}
                      rows={3}
                      placeholder="Enter comprehension passage or directions..."
                      className="w-full p-2.5 text-xs font-serif bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Data Table / Numerical Info:
                    </label>
                    <textarea
                      value={passageDataText}
                      onChange={(e) => setPassageDataText(e.target.value)}
                      rows={3}
                      placeholder="Enter table rows or values..."
                      className="w-full p-2.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAttachPassage}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    Apply Reference to Range
                  </button>

                  {passageAttachMessage && (
                    <span className="text-xs font-semibold text-blue-900 dark:text-blue-300">
                      {passageAttachMessage}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Box 3: Flagged Review Items List (Item 4) */}
            {showReviewList && flaggedQuestions.length > 0 && (
              <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">
                      Flagged Questions Requiring Review ({flaggedQuestions.length})
                    </h3>
                  </div>
                  <span className="text-[11px] text-rose-700 font-semibold">
                    Publishing blocked until fixed
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {flaggedQuestions.map((q) => (
                    <div
                      key={q.id}
                      className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/40 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          Q{q.id}: {formatSimpleLatex(q.question || q.questionEnglish || q.questionHindi || '')}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 shrink-0">
                          Needs Review
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {q.reviewReasons?.map((reason, rIdx) => (
                          <span
                            key={rIdx}
                            className="text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 px-2 py-0.5 rounded-md"
                          >
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Textarea Editor */}
            <div className="flex-1 flex flex-col min-h-[220px]">
              <div className="flex items-center justify-between pb-1.5 text-xs text-slate-500">
                <span>Pasted JSON content:</span>
                <span>Supports 100+ questions, bilingual fields, & 5 options (A-E)</span>
              </div>
              <textarea
                value={customInput}
                onChange={(e) => {
                  setCustomInput(e.target.value);
                  setValidationResult(null);
                }}
                placeholder="Paste JSON array matching schema: [{'question_number': '1', 'question': '...', 'options': {'a': '...', 'b': '...', 'c': '...', 'd': '...', 'e': '...'}, 'answer': 'a'}]"
                className="flex-1 min-h-[200px] w-full p-4 font-mono text-xs bg-slate-950 text-emerald-400 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden resize-y leading-relaxed"
                spellCheck={false}
              />
            </div>

            {/* Diagnostics Banner */}
            {validationResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                  validationResult.valid
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {validationResult.valid ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>
                    {validationResult.valid
                      ? `Schema verification passed! ${validationResult.data?.length} questions parsed.`
                      : `Validation Error: ${validationResult.error}`}
                  </span>
                </div>
              </div>
            )}

            {/* Save Status Banners */}
            {saveCloudSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{saveCloudSuccess}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSaveCloudSuccess(null)}
                  className="text-emerald-700 hover:text-emerald-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {saveCloudError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 rounded-xl text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{saveCloudError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSaveCloudError(null)}
                  className="text-rose-700 hover:text-rose-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center justify-between flex-wrap gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleValidateCustom}
                className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                Validate JSON Syntax
              </button>

              <div className="flex items-center gap-2 flex-wrap ml-auto">
                {/* Save Draft to Firebase */}
                <button
                  type="button"
                  disabled={isSavingToCloud || parsedQuestions.length === 0}
                  onClick={handleSaveToFirebase}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                  title="Save directly to Firebase Firestore as Draft"
                >
                  {isSavingToCloud ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CloudUpload className="w-3.5 h-3.5" />
                  )}
                  <span>{isSavingToCloud ? 'Saving to Firebase...' : 'Save Draft to Firebase'}</span>
                </button>

                {/* Load into Test Editor */}
                <button
                  type="button"
                  disabled={parsedQuestions.length === 0}
                  onClick={handleLoadIntoEditor}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                  title="Load questions into the Test Editor preview tab to review and publish"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Load into Test Editor</span>
                </button>

                {/* Launch Study Mode */}
                <button
                  type="button"
                  disabled={hasBlockingIssues || parsedQuestions.length === 0}
                  onClick={() => handleLaunchCustom('study')}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                  title={hasBlockingIssues ? 'Resolve review issues before launching' : ''}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Launch Study</span>
                </button>

                {/* Launch Quiz Practice */}
                <button
                  type="button"
                  disabled={hasBlockingIssues || parsedQuestions.length === 0}
                  onClick={() => handleLaunchCustom('quiz')}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                  title={hasBlockingIssues ? 'Resolve review issues before launching' : ''}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Launch Practice</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* In-app Discard Confirmation Modal */}
        {showDiscardDialog && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowDiscardDialog(false);
            }}
          >
            <div
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Discard pasted JSON?
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Unsaved content in Import / Custom
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                You have unsaved changes in the Import / Custom tab. Are you sure you want to discard them and exit?
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDiscardDialog(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDiscardDialog(false);
                    safelyClose();
                  }}
                  className="min-h-[44px] px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  Discard & Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
