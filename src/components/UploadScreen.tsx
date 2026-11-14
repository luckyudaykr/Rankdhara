import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  AlertCircle,
  Clock,
  Globe2,
  Sliders,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Shield,
  FileQuestion,
  HelpCircle,
  Zap,
  BookOpen,
} from 'lucide-react';
import { TestSettings, ExtractedPdfData } from '../types';
import { extractTextFromPdf, SAMPLE_DOCUMENTS } from '../services/pdfService';

interface UploadScreenProps {
  onStartGeneration: (
    content: { text?: string; pdfBase64?: string; file?: File },
    docMeta: { name: string; size: number; pageCount: number; isScanned: boolean },
    settings: TestSettings
  ) => void;
  onOpenLibrary?: () => void;
  isProcessing: boolean;
  processingStatus: string;
  errorMessage: string | null;
  onClearError: () => void;
}

export const UploadScreen: React.FC<UploadScreenProps> = ({
  onStartGeneration,
  onOpenLibrary,
  isProcessing,
  processingStatus,
  errorMessage,
  onClearError,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedPdfData | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings
  const [difficulty, setDifficulty] = useState<TestSettings['difficulty']>('Medium');
  const [language, setLanguage] = useState<TestSettings['language']>('English');
  const [durationMinutes, setDurationMinutes] = useState<number>(10);
  const [positiveMarks, setPositiveMarks] = useState<number>(1.0);
  const [negativeMarks, setNegativeMarks] = useState<number>(0.25);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleFileValidationAndSelection = (file: File) => {
    onClearError();
    setLocalError(null);

    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      setLocalError('Invalid file type. Please upload a valid PDF document (.pdf).');
      return;
    }

    const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
    if (file.size > MAX_SIZE) {
      setLocalError(
        `File is too large (${formatFileSize(file.size)}). The maximum allowed size is 20 MB.`
      );
      return;
    }

    setSelectedFile(file);
    setExtractedData(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileValidationAndSelection(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileValidationAndSelection(e.target.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setExtractedData(null);
    setLocalError(null);
    onClearError();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerateClick = async () => {
    if (!selectedFile && !extractedData) {
      setLocalError('Please upload a PDF or select a sample topic first.');
      return;
    }

    setLocalError(null);
    onClearError();

    const settings: TestSettings = {
      difficulty,
      language,
      durationMinutes,
      positiveMarks,
      negativeMarks,
    };

    try {
      if (extractedData) {
        // Pre-extracted or sample document
        onStartGeneration(
          {
            text: extractedData.text,
            pdfBase64: extractedData.base64Data,
          },
          {
            name: extractedData.fileName,
            size: extractedData.fileSizeBytes,
            pageCount: extractedData.pageCount,
            isScanned: extractedData.isScanned,
          },
          settings
        );
        return;
      }

      if (selectedFile) {
        onStartGeneration(
          {
            file: selectedFile,
          },
          {
            name: selectedFile.name,
            size: selectedFile.size,
            pageCount: 0,
            isScanned: false,
          },
          settings
        );
      }
    } catch (err: any) {
      setLocalError(err.message || 'Failed to process PDF.');
    }
  };

  const handleLoadSample = (sample: (typeof SAMPLE_DOCUMENTS)[0]) => {
    setSelectedFile(null);
    setLocalError(null);
    onClearError();
    setExtractedData({
      text: sample.text,
      isScanned: false,
      pageCount: 3,
      fileName: `${sample.title}.pdf`,
      fileSizeBytes: 42000,
    });
  };

  const activeError = localError || errorMessage;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Banner / Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full text-blue-700 text-xs font-semibold uppercase tracking-wider mb-3">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          Testbook CBT Architecture
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Turn Any PDF Into a <span className="text-blue-600">Mock Test</span>
        </h1>
        <p className="mt-2 text-slate-600 max-w-xl mx-auto text-sm sm:text-base">
          Upload class notes, textbooks, research papers, or syllabus documents. Our AI creates an
          authentic 10-question computer-based exam with negative marking and instant analysis.
        </p>

        {onOpenLibrary && (
          <div className="mt-4 flex items-center justify-center">
            <button
              type="button"
              onClick={onOpenLibrary}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 hover:border-blue-500 rounded-xl text-slate-800 text-xs sm:text-sm font-bold shadow-xs transition group"
            >
              <BookOpen className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
              <span>Test Library</span>
              <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold border border-blue-200">
                Cloud Backend
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {activeError && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-3 shadow-sm animate-fade-in">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-red-900">Upload / Processing Error</p>
            <p className="mt-0.5 text-red-700">{activeError}</p>
          </div>
          <button
            onClick={() => {
              setLocalError(null);
              onClearError();
            }}
            className="text-xs font-medium text-red-700 hover:text-red-900 underline ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Upload Box + Sample selector (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
              <FileQuestion className="w-4 h-4 text-blue-600" />
              1. Upload Your PDF Document
            </h2>

            {/* Drag & Drop Area */}
            {!selectedFile && !extractedData ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-50/60 scale-[1.01]'
                    : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/80 bg-slate-50/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-2xl bg-blue-100/70 text-blue-600 mx-auto flex items-center justify-center mb-3 shadow-sm">
                  <Upload className="w-7 h-7" />
                </div>
                <h3 className="font-semibold text-slate-800 text-sm sm:text-base">
                  Drag and drop your PDF here, or <span className="text-blue-600 underline">browse</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Supports standard text & scanned PDFs up to 20 MB
                </p>
                <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Client-side text parsing
                  </span>
                  <span className="flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-blue-500" /> Zero persistent storage
                  </span>
                </div>
              </div>
            ) : (
              /* Selected File Card */
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm line-clamp-1">
                        {selectedFile?.name || extractedData?.fileName}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span>
                          {selectedFile
                            ? formatFileSize(selectedFile.size)
                            : formatFileSize(extractedData?.fileSizeBytes || 0)}
                        </span>
                        {extractedData?.pageCount && (
                          <>
                            <span>•</span>
                            <span>{extractedData.pageCount} Pages</span>
                          </>
                        )}
                        {extractedData?.isScanned && (
                          <>
                            <span>•</span>
                            <span className="text-amber-600 font-medium">Scanned Document</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {!isProcessing && (
                    <button
                      onClick={handleRemoveFile}
                      className="text-xs text-slate-500 hover:text-red-600 px-2.5 py-1 rounded-md border border-slate-200 hover:border-red-200 hover:bg-white transition"
                    >
                      Change
                    </button>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-blue-100 flex items-center justify-between text-xs text-blue-700">
                  <span className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Ready to formulate 10 MCQs
                  </span>
                  <span className="text-slate-500 text-[11px]">Covers entire document</span>
                </div>
              </div>
            )}

            {/* Quick Sample Topics */}
            <div className="mt-6 pt-5 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" /> Or test immediately with sample notes:
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {SAMPLE_DOCUMENTS.map((doc, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleLoadSample(doc)}
                    className={`text-left p-2.5 rounded-lg border text-xs transition ${
                      extractedData?.fileName === `${doc.title}.pdf`
                        ? 'border-blue-500 bg-blue-50/70 text-blue-900 font-medium'
                        : 'border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-slate-900 line-clamp-1">{doc.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                      {doc.category}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Test Configurations (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Sliders className="w-4 h-4 text-blue-600" />
              2. Test Configuration
            </h2>

            <div className="space-y-4">
              {/* Difficulty */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Difficulty Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Easy', 'Medium', 'Hard'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setDifficulty(level)}
                      className={`py-2 text-xs font-semibold rounded-lg border transition ${
                        difficulty === level
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe2 className="w-3.5 h-3.5 text-slate-500" /> Question Language
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['English', 'Hindi'] as const).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setLanguage(lang)}
                      className={`py-2 text-xs font-semibold rounded-lg border transition ${
                        language === lang
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {lang === 'English' ? 'English' : 'हिंदी (Hindi)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timer Duration */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" /> Test Duration
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 15, 20].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setDurationMinutes(mins)}
                      className={`py-2 text-xs font-semibold rounded-lg border transition ${
                        durationMinutes === mins
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  10 Questions • Recommended: 10 mins (1 min/question)
                </p>
              </div>

              {/* Marking Scheme */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                  <span className="uppercase tracking-wider">Marking Scheme</span>
                  <span className="text-[11px] text-slate-500">Testbook Standard</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-emerald-50/40">
                    <span className="text-[11px] text-slate-500 block">Correct Answer</span>
                    <span className="text-sm font-bold text-emerald-600">+{positiveMarks.toFixed(2)} Mark</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-red-50/40">
                    <span className="text-[11px] text-slate-500 block">Incorrect Answer</span>
                    <span className="text-sm font-bold text-red-600">-{negativeMarks.toFixed(2)} Mark</span>
                  </div>
                </div>
              </div>

              {/* Generate Button / Progress Bar */}
              <div className="pt-3">
                {isProcessing ? (
                  <div className="bg-slate-50 rounded-xl p-4 border border-blue-200 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-blue-700 flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                        Generating Test...
                      </span>
                      <span className="text-slate-500 text-[11px]">Please wait</span>
                    </div>
                    {/* Animated Progress Bar */}
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2 rounded-full animate-pulse w-3/4 transition-all duration-500" />
                    </div>
                    <p className="text-xs text-slate-600 leading-snug font-medium">
                      {processingStatus || 'Analyzing document and constructing 10 questions...'}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleGenerateClick}
                    disabled={!selectedFile && !extractedData}
                    className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all ${
                      selectedFile || extractedData
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25 active:scale-[0.99]'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                    }`}
                  >
                    <span>Generate Test (10 MCQs)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Testbook Exam Format Rules Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-blue-600" /> Testbook Exam Rules
            </div>
            <p>• Exactly 10 questions covering the entire document evenly.</p>
            <p>• Balanced question pool: 4 Factual, 3 Conceptual, 3 Application.</p>
            <p>• Full CBT palette with Not Visited, Not Answered, Answered, and Marked states.</p>
            <p>• Auto-submits strictly when the countdown clock strikes 00:00.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
