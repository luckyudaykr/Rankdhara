import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getStorage, Storage } from 'firebase-admin/storage';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  getExactPageCount,
  slicePdfPages,
  extractColumnAwarePageText,
  scanEndAnswerKeys,
  parseQuestionsWithRules,
  callGeminiForUncertainPages,
  groupQuestionsIntoQuizzes,
  getCachedPageResult,
  setCachedPageResult,
  countPageMarkers,
  findSequenceGaps,
  ExtractedQuestion,
} from './src/services/serverPdfExtraction';
import {
  DEFAULT_CATALOG_EXAMS,
  DEFAULT_EXAM_ALIASES,
  seedExamsAndAliasesIfEmpty,
  matchExamTag,
  inferSubjectAndChapter,
  organizeQuestionsAndBuildTests,
  buildCustomTest,
  QuestionMasterItem,
} from './src/services/examCatalogService';
import { CatalogExam, ExamAlias, UnmappedExamTag, CustomTestFilter } from './src/types';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCliArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  const prefix = `${flag}=`;
  const eqArg = process.argv.find((a) => a.startsWith(prefix));
  return eqArg ? eqArg.slice(prefix.length) : undefined;
}

const app = express();
const cliPortRaw = getCliArg('--port');
const cliHost = getCliArg('--host') || '0.0.0.0';
const parsedCliPort = cliPortRaw ? parseInt(cliPortRaw, 10) : NaN;
const parsedEnvPort = process.env.PORT ? parseInt(process.env.PORT, 10) : NaN;
const PORT =
  Number.isFinite(parsedCliPort) && parsedCliPort > 0
    ? parsedCliPort
    : Number.isFinite(parsedEnvPort) && parsedEnvPort > 0
      ? parsedEnvPort
      : 3000;

// Baseline API & browser security headers (iframe-safe)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// High limit for base64 encoded scanned PDF transmission (up to 75MB)
app.use(express.json({ limit: '75mb' }));

// Initialize Firebase Admin Firestore, Auth & Storage
let firestoreDb: Firestore | null = null;
let adminAuth: Auth | null = null;
let adminStorage: Storage | null = null;

try {
  if (getApps().length === 0) {
    if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
      });
      firestoreDb = getFirestore();
      adminAuth = getAuth();
      try { adminStorage = getStorage(); } catch {}
      console.log('Firebase Admin initialized successfully via service account.');
    } else if (
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_CONFIG ||
      process.env.GCLOUD_PROJECT
    ) {
      initializeApp();
      firestoreDb = getFirestore();
      adminAuth = getAuth();
      try { adminStorage = getStorage(); } catch {}
      console.log('Firebase Admin initialized via default credentials.');
    }
  } else {
    firestoreDb = getFirestore();
    adminAuth = getAuth();
    try { adminStorage = getStorage(); } catch {}
  }

  if (firestoreDb) {
    try {
      firestoreDb.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Settings might already be frozen or applied
    }
  }
} catch (fbInitErr) {
  console.warn('Firebase Admin initialization deferred (using local stores):', fbInitErr);
}

// Handle Firestore errors gracefully (e.g. 5 NOT_FOUND when default database is unprovisioned)
function handleFirestoreError(err: any, context: string) {
  const msg = String(err?.message || err?.details || err || '');
  const code = err?.code;
  const isNotFound =
    code === 5 ||
    msg.includes('5 NOT_FOUND') ||
    msg.includes('NOT_FOUND') ||
    msg.includes('does not exist') ||
    msg.includes('non-transient');

  if (isNotFound) {
    if (firestoreDb) {
      console.log(`Cloud Firestore database not provisioned or unreachable during ${context}. Seamlessly using local JSON storage.`);
      firestoreDb = null;
    }
  } else {
    console.warn(`Firestore ${context} warning:`, err);
  }
}

// Local stores for reliable execution in all dev/test environments
const LOCAL_TESTS_FILE = path.resolve(__dirname, '.tests_store.json');
const LOCAL_CUSTOM_TESTS_FILE = path.resolve(__dirname, '.custom_tests_store.json');
const LOCAL_ATTEMPTS_FILE = path.resolve(__dirname, '.attempts_store.json');
const LOCAL_USERS_FILE = path.resolve(__dirname, '.users_store.json');
const LOCAL_PDFS_FILE = path.resolve(__dirname, '.pdfs_store.json');
const LOCAL_BOOKMARKS_FILE = path.resolve(__dirname, '.bookmarks_store.json');
const LOCAL_REPORTS_FILE = path.resolve(__dirname, '.reports_store.json');
const LOCAL_EXAMS_FILE = path.resolve(__dirname, '.exams_store.json');
const LOCAL_EXAM_ALIASES_FILE = path.resolve(__dirname, '.exam_aliases_store.json');
const LOCAL_QUESTIONS_FILE = path.resolve(__dirname, '.questions_store.json');
const LOCAL_ACTIVE_PROGRESS_FILE = path.resolve(__dirname, '.active_progress_store.json');
const LOCAL_PDF_DATA_DIR = path.resolve(__dirname, '.pdf_data');
if (!fs.existsSync(LOCAL_PDF_DATA_DIR)) {
  fs.mkdirSync(LOCAL_PDF_DATA_DIR, { recursive: true });
}

// Seed catalog exams and aliases on server initialization
seedExamsAndAliasesIfEmpty(LOCAL_EXAMS_FILE, LOCAL_EXAM_ALIASES_FILE);

function readJsonFile<T>(filePath: string): T[] {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) || [];
    }
  } catch (err) {
    console.warn(`Error reading ${filePath}:`, err);
  }
  return [];
}

function writeJsonFile<T>(filePath: string, data: T[]) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`Error writing ${filePath}:`, err);
  }
}

// -------------------------------------------------------------
// Authentication & Role Checking Utilities
// -------------------------------------------------------------
function getAdminEmails(): string[] {
  const envEmails = process.env.ADMIN_EMAILS || 'kuday6631@gmail.com,admin@example.com';
  return envEmails
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function checkIsAdminEmail(email?: string): boolean {
  if (!email) return false;
  const list = getAdminEmails();
  return list.includes(email.toLowerCase().trim());
}

export interface RequestUser {
  uid: string;
  email: string;
  displayName?: string;
  role: 'admin' | 'user';
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

// Per-user sliding-window rate limiter for write-heavy endpoints
const userWriteRateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimitByUser(bucket: string, maxPerMinute: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const uid = req.user?.uid || req.ip || 'anon';
    const key = `${bucket}:${uid}`;
    const now = Date.now();
    const entry = userWriteRateBuckets.get(key);
    if (!entry || now > entry.resetAt) {
      if (userWriteRateBuckets.size > 5000) userWriteRateBuckets.clear();
      userWriteRateBuckets.set(key, { count: 1, resetAt: now + 60 * 1000 });
      return next();
    }
    if (entry.count >= maxPerMinute) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests in a short window. Please wait a few seconds and try again.',
      });
    }
    entry.count++;
    return next();
  };
}

function resolveDevMockUser(token: string): RequestUser | null {
  if (token === 'mock-admin-token' || token === 'cbt_admin_token') {
    return {
      uid: 'admin_dev_uid',
      email: 'kuday6631@gmail.com',
      displayName: 'Admin User',
      role: 'admin',
      isAdmin: true,
    };
  }
  if (token === 'mock-user-token') {
    return {
      uid: 'user_dev_uid',
      email: 'aspirant@example.com',
      displayName: 'Aspirant User',
      role: 'user',
      isAdmin: false,
    };
  }
  if (token.startsWith('mock-') || token.startsWith('dev-')) {
    return {
      uid: `dev_${token.slice(0, 24)}`,
      email: 'dev-user@example.com',
      displayName: 'Dev User',
      role: 'user',
      isAdmin: false,
    };
  }
  return null;
}

// Middleware: Authenticate Firebase ID Token strictly
async function authenticateUser(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please sign in with a valid Firebase account.',
    });
  }

  const token = authHeader.split(' ')[1];
  const allowMockAuth =
    process.env.ALLOW_MOCK_AUTH === 'true' || process.env.NODE_ENV !== 'production';

  if (allowMockAuth) {
    const mockUser = resolveDevMockUser(token);
    if (mockUser) {
      req.user = mockUser;
      return next();
    }
  }

  if (!adminAuth) {
    return res.status(503).json({
      success: false,
      error: 'Authentication service is not configured on the server.',
    });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = (decoded.email || `${decoded.uid}@example.com`).toLowerCase().trim();
    const displayName = (decoded as any).name || (decoded.email ? decoded.email.split('@')[0] : 'User');
    const isAdmin = checkIsAdminEmail(email);

    if (isAdmin) {
      adminAuth.setCustomUserClaims(decoded.uid, { admin: true }).catch(() => {});
    }

    req.user = {
      uid: decoded.uid,
      email,
      displayName,
      role: isAdmin ? 'admin' : 'user',
      isAdmin,
    };

    next();
  } catch (err: any) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired Firebase ID token. Access denied.',
    });
  }
}

// Middleware: Require Admin role
function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Admin access is required for this action.',
    });
  }
  next();
}

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------
// Synchronize user profile & claims from verified Firebase ID Token
app.post('/api/auth/sync', authenticateUser, async (req, res) => {
  try {
    const user = req.user!;
    const userDoc = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      role: user.role,
      isAdmin: user.isAdmin,
      lastLoginAt: new Date().toISOString(),
    };

    if (firestoreDb) {
      try {
        await firestoreDb.collection('users').doc(user.uid).set(userDoc, { merge: true });
      } catch (err) {
        handleFirestoreError(err, 'user profile sync');
      }
    }

    const localUsers = readJsonFile<any>(LOCAL_USERS_FILE);
    const uIdx = localUsers.findIndex((u) => u.uid === user.uid);
    if (uIdx >= 0) {
      localUsers[uIdx] = { ...localUsers[uIdx], ...userDoc };
    } else {
      localUsers.push(userDoc);
    }
    writeJsonFile(LOCAL_USERS_FILE, localUsers);

    return res.json({
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Update user profile display name
app.patch('/api/auth/profile', authenticateUser, async (req, res) => {
  try {
    const user = req.user!;
    const displayName = (req.body.displayName || '').trim();
    if (!displayName) {
      return res.status(400).json({ success: false, error: 'Display name cannot be empty' });
    }

    if (firestoreDb) {
      try {
        await firestoreDb.collection('users').doc(user.uid).set(
          { displayName, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, 'update user profile');
      }
    }

    const localUsers = readJsonFile<any>(LOCAL_USERS_FILE);
    const uIdx = localUsers.findIndex((u) => u.uid === user.uid);
    if (uIdx >= 0) {
      localUsers[uIdx] = { ...localUsers[uIdx], displayName };
    } else {
      localUsers.push({
        uid: user.uid,
        email: user.email,
        displayName,
        role: user.role,
        isAdmin: user.isAdmin,
      });
    }
    writeJsonFile(LOCAL_USERS_FILE, localUsers);

    return res.json({
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        displayName,
        role: user.role,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// MCQ Generation (Admin Only)
// -------------------------------------------------------------
interface MCQOptionMap {
  A: string;
  B: string;
  C: string;
  D: string;
}

export interface GeneratedMCQ {
  id: number;
  question: string;
  type: 'factual' | 'conceptual' | 'application';
  options: MCQOptionMap;
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

function sanitizeText(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str.trim();
}

function validateAndSanitizeMCQs(rawList: any[], targetCount = 10): GeneratedMCQ[] {
  if (!Array.isArray(rawList)) {
    throw new Error('Response is not an array of questions');
  }

  const validQuestions: GeneratedMCQ[] = [];

  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    if (!item || typeof item !== 'object') continue;

    const questionText = sanitizeText(item.question);
    if (!questionText) continue;

    const opts = item.options || {};
    const optionA = sanitizeText(opts.A || opts.a || item.optionA);
    const optionB = sanitizeText(opts.B || opts.b || item.optionB);
    const optionC = sanitizeText(opts.C || opts.c || item.optionC);
    const optionD = sanitizeText(opts.D || opts.d || item.optionD);

    if (!optionA || !optionB || !optionC || !optionD) continue;

    let correctOpt = String(
      item.correctOption || item.correct_option || item.answer || ''
    )
      .toUpperCase()
      .trim();
    if (!['A', 'B', 'C', 'D'].includes(correctOpt)) {
      if (correctOpt === optionA.toUpperCase()) correctOpt = 'A';
      else if (correctOpt === optionB.toUpperCase()) correctOpt = 'B';
      else if (correctOpt === optionC.toUpperCase()) correctOpt = 'C';
      else if (correctOpt === optionD.toUpperCase()) correctOpt = 'D';
      else correctOpt = 'A';
    }

    let qType: 'factual' | 'conceptual' | 'application' = 'factual';
    const rawType = String(item.type || '').toLowerCase();
    if (rawType.includes('concept')) qType = 'conceptual';
    else if (rawType.includes('app') || rawType.includes('analyt')) qType = 'application';

    const explanation = sanitizeText(
      item.explanation || 'Refer to the source document material.'
    );

    validQuestions.push({
      id: validQuestions.length + 1,
      question: questionText,
      type: qType,
      options: {
        A: optionA,
        B: optionB,
        C: optionC,
        D: optionD,
      },
      correctOption: correctOpt as 'A' | 'B' | 'C' | 'D',
      explanation,
    });

    if (validQuestions.length === targetCount) break;
  }

  if (validQuestions.length === 0) {
    throw new Error(
      `No valid MCQs could be formulated from the document material.`
    );
  }

  return validQuestions;
}

async function callGeminiForQuestions(
  ai: GoogleGenAI,
  contentPayload: { text?: string; pdfBase64?: string; pageImages?: string[] },
  difficulty: string,
  language: string,
  targetCount = 10,
  avoidQuestions: string[] = [],
  attemptNumber = 1
): Promise<GeneratedMCQ[]> {
  const isFullSet = targetCount === 10;
  const distributionInstruction = isFullSet
    ? `5. QUESTION DISTRIBUTION:
   - 4 Factual questions (definitions, key dates, properties, terminology, facts)
   - 3 Conceptual questions (underlying principles, cause-and-effect, logic, mechanisms)
   - 3 Application/Analytical questions (scenarios, calculations, comparative deductions)`
    : `5. QUESTION DISTRIBUTION:
   - Provide a balanced mix across factual, conceptual, and application questions from this section without duplicate themes.`;

  const avoidInstruction =
    avoidQuestions && avoidQuestions.length > 0
      ? `\n6. AVOID DUPLICATES: DO NOT generate questions that duplicate or ask about the exact same facts as these existing questions:\n${avoidQuestions
          .slice(-15)
          .map((q, idx) => `   - ${q}`)
          .join('\n')}\n`
      : '';

  const generateCount = Math.max(targetCount, targetCount + 2);
  const prompt = `You are a premier National Test Paper Setter (Testbook/CBT format).
Your task is to carefully analyze the provided document content and construct ${generateCount} high-quality Multiple Choice Questions (MCQs), from which the best ${targetCount} will be selected.

CRITICAL REQUIREMENTS:
1. QUANTITY: Generate ${generateCount} questions numbered 1 to ${generateCount}.
2. DIFFICULTY: ${difficulty}.
3. LANGUAGE: ${language}.
4. COVERAGE & SEQUENCING: Cover the provided content thoroughly and evenly. If multiple numbered excerpts or sections are provided (e.g. [EXCERPT 1], [EXCERPT 2], etc.), formulate the questions sequentially in page order (one question per excerpt where possible) so the test spans the entire document from beginning to end.
${distributionInstruction}
${avoidInstruction}
7. OPTIONS: Each question must have exactly 4 distinct, plausible options: A, B, C, D. No duplicate options. No "All of the above" or "None of the above" unless strictly necessary.
8. CORRECT OPTION: Exactly one unambiguous correct answer, specified as "A", "B", "C", or "D".
9. EXPLANATION: A concise, educational explanation (2-3 sentences) detailing why the correct option is right.

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this exact structure:
{
  "questions": [
    {
      "id": 1,
      "question": "Clear and complete question text",
      "type": "factual",
      "options": {
        "A": "Option text A",
        "B": "Option text B",
        "C": "Option text C",
        "D": "Option text D"
      },
      "correctOption": "A",
      "explanation": "Clear explanation of the solution."
    }
  ]
}`;

  const contents: any[] = [];

  if (contentPayload.pageImages && contentPayload.pageImages.length > 0) {
    for (const imgBase64 of contentPayload.pageImages) {
      contents.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: imgBase64.replace(/^data:image\/\w+;base64,/, ''),
        },
      });
    }
  }

  if (contentPayload.pdfBase64) {
    contents.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: contentPayload.pdfBase64.replace(/^data:application\/pdf;base64,/, ''),
      },
    });
  }

  if (contentPayload.text) {
    const cleanText = contentPayload.text.slice(0, 150000);
    contents.push({
      text: `DOCUMENT CONTENT (BATCH):\n\n${cleanText}\n\n---\n${prompt}`,
    });
  } else {
    contents.push({
      text: prompt,
    });
  }

  const candidateModels = ['gemini-3.5-flash', 'gemini-3.8-flash'];
  let responseText = '';
  let lastErr: any = null;

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.3,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      if (response && response.text) {
        responseText = response.text;
        break;
      }
    } catch (err: any) {
      lastErr = err;
      console.warn(`Model ${model} invocation attempt ${attemptNumber} failed:`, err?.message || err);
    }
  }

  if (!responseText) {
    throw new Error(
      lastErr?.message || 'Gemini returned an empty response across all candidate models.'
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    parsed = JSON.parse(cleaned);
  }

  const questionsList = parsed.questions || parsed.mcqs || (Array.isArray(parsed) ? parsed : []);
  return validateAndSanitizeMCQs(questionsList, targetCount);
}

// POST /api/generate-mcqs: Admin Only (PDF upload & Gemini calls restricted to Admin)
app.post('/api/generate-mcqs', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY is not configured on the server. Please check environment variables.',
      });
    }

    const {
      text,
      pdfBase64,
      pageImages,
      difficulty = 'Medium',
      language = 'English',
      questionCount = 10,
      avoidQuestions = [],
    } = req.body;

    const targetCount = Math.max(1, Math.min(10, parseInt(String(questionCount), 10) || 10));

    if (!text && !pdfBase64 && (!pageImages || !Array.isArray(pageImages) || pageImages.length === 0)) {
      return res.status(400).json({
        error: 'Missing PDF content. Please provide text, pdfBase64, or pageImages.',
      });
    }

    if (pdfBase64 && typeof pdfBase64 === 'string') {
      if (pdfBase64.length > 29 * 1024 * 1024) {
        return res.status(400).json({
          error: 'The uploaded PDF exceeds the 20 MB size limit.',
        });
      }
    }

    const ai = new GoogleGenAI({ apiKey });

    let questions: GeneratedMCQ[];
    try {
      questions = await callGeminiForQuestions(
        ai,
        { text, pdfBase64, pageImages },
        difficulty,
        language,
        targetCount,
        avoidQuestions,
        1
      );
    } catch (firstErr: any) {
      try {
        questions = await callGeminiForQuestions(
          ai,
          { text, pdfBase64, pageImages },
          difficulty,
          language,
          targetCount,
          avoidQuestions,
          2
        );
      } catch (secondErr: any) {
        return res.status(500).json({
          error: `Failed to generate questions after 2 attempts: ${
            secondErr.message || firstErr.message || 'Unknown generation failure'
          }`,
        });
      }
    }

    return res.json({
      success: true,
      questions,
      metadata: {
        totalQuestions: questions.length,
        difficulty,
        language,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'An unexpected server error occurred.',
    });
  }
});

// -------------------------------------------------------------
// Question PDF Storage & Quota Management (Admin Only)
// -------------------------------------------------------------
interface ExtractionSettings {
  maxGeminiCallsPerDay: number;
  geminiCallsToday: number;
  lastBudgetResetDate: string;
  autoExtractOnUpload: boolean;
  publishCleanQuizzesAuto: boolean;
  geminiModel: string;
}

const SETTINGS_FILE = path.resolve(__dirname, '.extraction_settings.json');
function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

function loadExtractionSettings(): ExtractionSettings {
  const today = getTodayDateString();
  const defaultSettings: ExtractionSettings = {
    maxGeminiCallsPerDay: 200,
    geminiCallsToday: 0,
    lastBudgetResetDate: today,
    autoExtractOnUpload: true,
    publishCleanQuizzesAuto: false,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  };

  const stored = readJsonFile<ExtractionSettings>(SETTINGS_FILE)[0];
  if (!stored) {
    writeJsonFile(SETTINGS_FILE, [defaultSettings]);
    return defaultSettings;
  }

  if (stored.lastBudgetResetDate !== today) {
    stored.lastBudgetResetDate = today;
    stored.geminiCallsToday = 0;
    writeJsonFile(SETTINGS_FILE, [stored]);
  }
  return stored;
}

function updateExtractionSettings(partial: Partial<ExtractionSettings>): ExtractionSettings {
  const current = loadExtractionSettings();
  const updated = { ...current, ...partial };
  writeJsonFile(SETTINGS_FILE, [updated]);
  return updated;
}

// Mutex queue for Gemini rate limiting: at most 1 call at a time with 800ms gap and backoff
let geminiCallLock: Promise<any> = Promise.resolve();

async function rateLimitedGeminiCall<T>(callFn: () => Promise<T>): Promise<T> {
  const settings = loadExtractionSettings();
  if (settings.geminiCallsToday >= settings.maxGeminiCallsPerDay) {
    const err: any = new Error('Daily Gemini quota budget reached.');
    err.code = 'QUOTA_EXHAUSTED';
    throw err;
  }

  return new Promise<T>((resolve, reject) => {
    geminiCallLock = geminiCallLock.then(async () => {
      const backoffDelays = [5000, 15000, 45000];
      for (let attempt = 0; attempt <= 3; attempt++) {
        try {
          const res = await callFn();
          settings.geminiCallsToday++;
          updateExtractionSettings({ geminiCallsToday: settings.geminiCallsToday });
          await new Promise((r) => setTimeout(r, 800));
          resolve(res);
          return;
        } catch (err: any) {
          const errMsg = String(err?.message || '');
          const is429 =
            errMsg.includes('429') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('quota') ||
            errMsg.includes('rate limit');
          if (is429 && attempt < 3) {
            console.warn(
              `Gemini rate limited (429). Backing off for ${backoffDelays[attempt]}ms (attempt ${attempt + 1}/3)...`
            );
            await new Promise((r) => setTimeout(r, backoffDelays[attempt]));
          } else {
            if (is429) {
              const qErr: any = new Error('Gemini API quota exhausted (429 Rate Limit).');
              qErr.code = 'QUOTA_EXHAUSTED';
              reject(qErr);
              return;
            }
            reject(err);
            return;
          }
        }
      }
    });
  });
}

async function savePdfToStorage(pdfId: string, pdfBuffer: Buffer): Promise<string> {
  let cloudPath = `local://${pdfId}`;
  if (adminStorage) {
    try {
      const bucket = adminStorage.bucket();
      const file = bucket.file(`question_pdfs/${pdfId}.pdf`);
      await file.save(pdfBuffer, {
        metadata: { contentType: 'application/pdf' },
      });
      cloudPath = `gs://${bucket.name}/question_pdfs/${pdfId}.pdf`;
    } catch (storageErr) {
      console.log('Firebase Storage not provisioned or bucket permission restricted. Using local file storage.');
    }
  }
  // ALWAYS save to local data directory as backup so PDF buffer is never lost
  const filePath = path.join(LOCAL_PDF_DATA_DIR, `${pdfId}.dat`);
  fs.writeFileSync(filePath, pdfBuffer.toString('base64'), 'utf-8');
  return cloudPath;
}

async function getPdfBufferFromStorage(pdfId: string, storagePath?: string): Promise<Buffer> {
  if (adminStorage) {
    try {
      const bucket = adminStorage.bucket();
      const file = bucket.file(`question_pdfs/${pdfId}.pdf`);
      const [contents] = await file.download();
      if (contents && contents.length > 0) {
        return contents;
      }
    } catch (err) {
      console.log('Firebase Storage read unavailable, reading from local storage.');
    }
  }
  const dataPath = path.join(LOCAL_PDF_DATA_DIR, `${pdfId}.dat`);
  if (fs.existsSync(dataPath)) {
    const b64 = fs.readFileSync(dataPath, 'utf-8');
    return Buffer.from(b64.replace(/^data:application\/pdf;base64,/, ''), 'base64');
  }
  const pdfPath = path.join(LOCAL_PDF_DATA_DIR, `${pdfId}.pdf`);
  if (fs.existsSync(pdfPath)) {
    return fs.readFileSync(pdfPath);
  }
  throw new Error(`PDF data file for '${pdfId}' not found in storage. Please re-upload the PDF paper to extract pages.`);
}

async function saveQuestionsToFirestore(
  pdfId: string,
  questions: ExtractedQuestion[]
): Promise<void> {
  // Always persist locally for offline/instant availability
  const existing = getLocalPdfQuestions(pdfId);
  const newMap = new Map<string, ExtractedQuestion>();
  existing.forEach((q) => {
    const key = `${q.pageNumber}_${q.questionNumber || q.question.substring(0, 30)}`;
    newMap.set(key, q);
  });
  questions.forEach((q) => {
    const key = `${q.pageNumber}_${q.questionNumber || q.question.substring(0, 30)}`;
    newMap.set(key, q);
  });
  saveLocalPdfQuestions(pdfId, Array.from(newMap.values()));

  if (!firestoreDb || questions.length === 0) return;

  const maxBatchSize = 400;
  for (let i = 0; i < questions.length; i += maxBatchSize) {
    const chunk = questions.slice(i, i + maxBatchSize);
    let writeSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const batch = firestoreDb.batch();
        chunk.forEach((q, idx) => {
          const stableId = `q_${pdfId}_p${q.pageNumber}_q${q.questionNumber || (i + idx + 1)}`;
          const docRef = firestoreDb!.collection('pdfs').doc(pdfId).collection('questions').doc(stableId);
          batch.set(docRef, { ...q, id: stableId, pdfId }, { merge: true });
        });
        await batch.commit();
        writeSuccess = true;
        break;
      } catch (err) {
        console.warn(`Firestore questions batch save attempt ${attempt}/3 failed:`, err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!writeSuccess) {
      console.error(`Failed to write batch of ${chunk.length} questions to Firestore after 3 attempts.`);
    }
  }
}

function getLocalPdfQuestions(pdfId: string): ExtractedQuestion[] {
  const filePath = path.join(LOCAL_PDF_DATA_DIR, `${pdfId}_questions.json`);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) || [];
    } catch {}
  }
  return [];
}

function saveLocalPdfQuestions(pdfId: string, questions: ExtractedQuestion[]) {
  const filePath = path.join(LOCAL_PDF_DATA_DIR, `${pdfId}_questions.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(questions, null, 2), 'utf-8');
  } catch {}
}

// -------------------------------------------------------------
// Question PDF Library & Extraction Endpoints (Admin Only)
// -------------------------------------------------------------
// POST /api/admin/pdfs/upload: Admin uploads a question PDF (max 50 MB, real page count)
app.post(
  '/api/admin/pdfs/upload',
  express.raw({ limit: '60mb', type: ['application/pdf', 'application/octet-stream', 'multipart/form-data'] }),
  authenticateUser,
  requireAdmin,
  async (req, res) => {
    try {
      let pdfBuffer: Buffer | null = null;
      let rawFileName = (req.query.fileName as string) || (req.headers['x-file-name'] as string);
      let rawSizeBytes = (req.query.sizeBytes as string) || (req.headers['x-file-size'] as string);

      if (rawFileName) {
        try {
          rawFileName = decodeURIComponent(rawFileName);
        } catch {}
      }

      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        pdfBuffer = req.body;
      } else if (req.body && typeof req.body === 'object') {
        const { fileName, sizeBytes, pdfBase64 } = req.body;
        if (!rawFileName && fileName) rawFileName = fileName;
        if (!rawSizeBytes && sizeBytes) rawSizeBytes = String(sizeBytes);
        if (pdfBase64 && typeof pdfBase64 === 'string') {
          pdfBuffer = Buffer.from(pdfBase64.replace(/^data:application\/pdf;base64,/, ''), 'base64');
        }
      }

      const cleanFileName = sanitizeText(rawFileName || 'question_paper.pdf');
      const bytes = Number(rawSizeBytes) || (pdfBuffer ? pdfBuffer.length : 0);

      if (!cleanFileName.toLowerCase().endsWith('.pdf')) {
        return res.status(400).json({ success: false, error: 'Only PDF files (.pdf) are allowed.' });
      }

      if (bytes > 50 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'PDF file size exceeds 50 MB limit.' });
      }

      if (!pdfBuffer || pdfBuffer.length === 0) {
        return res.status(400).json({ success: false, error: 'Invalid or missing PDF data.' });
      }

      // 1. Exact Page Count: Real PDF library check
      let pageCount: number;
      try {
        pageCount = await getExactPageCount(pdfBuffer);
      } catch (pageCountErr: any) {
        return res.status(400).json({
          success: false,
          error: `Invalid PDF document: ${pageCountErr.message || 'Could not parse page count.'}`,
        });
      }

      const pdfId = `pdf_${crypto.randomBytes(6).toString('hex')}`;
      const uploadedAt = new Date().toISOString();

      // 4. Save to Firebase Storage (with protected local fallback)
      const storagePath = await savePdfToStorage(pdfId, pdfBuffer);

      const pdfRecord: any = {
        id: pdfId,
        fileName: cleanFileName,
        sizeBytes: bytes,
        pageCount,
        uploadedBy: req.user?.email || 'Admin',
        uploadedAt,
        status: 'uploaded',
        storagePath,
        lastFinishedBatch: 0,
        totalBatches: Math.ceil(pageCount / Math.min(10, Math.max(5, Math.ceil(pageCount / 5)))),
      };

      if (firestoreDb) {
        try {
          await firestoreDb.collection('pdfs').doc(pdfId).set(pdfRecord);
        } catch (err) {
          handleFirestoreError(err, 'save pdf record');
        }
      }

      const localPdfs = readJsonFile<any>(LOCAL_PDFS_FILE);
      localPdfs.unshift(pdfRecord);
      writeJsonFile(LOCAL_PDFS_FILE, localPdfs);

      return res.json({
        success: true,
        pdfRecord,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Failed to upload PDF.' });
    }
  }
);

// GET /api/admin/pdfs: List all Question PDFs in Library
app.get('/api/admin/pdfs', authenticateUser, requireAdmin, async (_req, res) => {
  try {
    let pdfs: any[] = [];
    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection('pdfs').get();
        for (const doc of snap.docs) {
          try {
            const data = doc.data();
            if (data && typeof data === 'object' && data.id) {
              pdfs.push(data);
            }
          } catch (docErr) {
            console.warn(`Error reading PDF document ${doc.id}:`, docErr);
          }
        }
      } catch (err) {
        handleFirestoreError(err, 'list pdfs');
      }
    }

    // Merge with local storage JSON so uploaded records are never lost
    const localPdfs = readJsonFile<any>(LOCAL_PDFS_FILE);
    for (const lp of localPdfs) {
      if (lp && typeof lp === 'object' && lp.id) {
        if (!pdfs.some((p) => p.id === lp.id)) {
          pdfs.push(lp);
        }
      }
    }

    // Annotate whether each PDF record has backing binary storage file on disk or Firebase Storage
    for (const p of pdfs) {
      if (p && p.id) {
        const dataPath = path.join(LOCAL_PDF_DATA_DIR, `${p.id}.dat`);
        const pdfPath = path.join(LOCAL_PDF_DATA_DIR, `${p.id}.pdf`);
        p.hasStorageData = fs.existsSync(dataPath) || fs.existsSync(pdfPath) || Boolean(adminStorage);
      }
    }

    // In-memory sort safely (no Firestore composite index required)
    pdfs.sort((a, b) => {
      const timeA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const timeB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    });

    return res.json({ success: true, pdfs });
  } catch (err: any) {
    console.error('Error in GET /api/admin/pdfs:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to list PDF library.' });
  }
});

// POST /api/admin/pdfs/:id/reupload: Attach/Update binary PDF file for an existing PDF record
app.post('/api/admin/pdfs/:id/reupload', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { pdfBase64, contentPayload } = req.body || {};
    const b64 = pdfBase64 || contentPayload?.pdfBase64;

    if (!b64 || typeof b64 !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing PDF base64 file content.' });
    }

    const pdfBuffer = Buffer.from(b64.replace(/^data:application\/pdf;base64,/, ''), 'base64');
    if (pdfBuffer.length === 0) {
      return res.status(400).json({ success: false, error: 'PDF file content is empty.' });
    }

    let pageCount: number | undefined;
    try {
      pageCount = await getExactPageCount(pdfBuffer);
    } catch {}

    const storagePath = await savePdfToStorage(id, pdfBuffer);

    let pdfRecord: any = null;
    if (firestoreDb) {
      try {
        const doc = await firestoreDb.collection('pdfs').doc(id).get();
        if (doc.exists) pdfRecord = doc.data();
      } catch (err) {
        handleFirestoreError(err, 'get pdf record for re-upload');
      }
    }

    if (!pdfRecord) {
      const localPdfs = readJsonFile<any>(LOCAL_PDFS_FILE);
      pdfRecord = localPdfs.find((p) => p.id === id);
    }

    if (!pdfRecord) {
      pdfRecord = {
        id,
        fileName: 'reuploaded_paper.pdf',
        sizeBytes: pdfBuffer.length,
        pageCount: pageCount || 1,
        uploadedBy: req.user?.email || 'Admin',
        uploadedAt: new Date().toISOString(),
        status: 'uploaded',
        storagePath,
      };
    } else {
      pdfRecord.storagePath = storagePath;
      if (pageCount) pdfRecord.pageCount = pageCount;
      pdfRecord.hasStorageData = true;
      if (pdfRecord.status === 'failed') pdfRecord.status = 'uploaded';
    }

    if (firestoreDb) {
      try {
        await firestoreDb.collection('pdfs').doc(id).set(pdfRecord, { merge: true });
      } catch (err) {
        handleFirestoreError(err, 'update pdf record after re-upload');
      }
    }

    const localPdfs = readJsonFile<any>(LOCAL_PDFS_FILE);
    const idx = localPdfs.findIndex((p) => p.id === id);
    if (idx >= 0) localPdfs[idx] = pdfRecord;
    else localPdfs.unshift(pdfRecord);
    writeJsonFile(LOCAL_PDFS_FILE, localPdfs);

    return res.json({
      success: true,
      message: 'PDF file re-uploaded successfully! Extraction can now proceed.',
      pdfRecord,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to re-upload PDF.' });
  }
});

// DELETE /api/admin/pdfs/:id: Delete Question PDF and record
app.delete('/api/admin/pdfs/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.includes('*') || id.includes('%') || id === 'all' || id.trim() === '') {
      return res.status(400).json({ success: false, error: 'Invalid single PDF ID provided. Wildcard and bulk deletes are not permitted.' });
    }

    if (firestoreDb) {
      try {
        await firestoreDb.collection('pdfs').doc(id).delete();
      } catch (err) {
        handleFirestoreError(err, 'delete pdf record');
      }
    }

    const localPdfs = readJsonFile<any>(LOCAL_PDFS_FILE).filter((p) => p.id !== id);
    writeJsonFile(LOCAL_PDFS_FILE, localPdfs);

    const dataPath = path.join(LOCAL_PDF_DATA_DIR, `${id}.dat`);
    if (fs.existsSync(dataPath)) {
      try { fs.unlinkSync(dataPath); } catch {}
    }

    return res.json({ success: true, message: `PDF '${id}' deleted successfully.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to delete PDF.' });
  }
});

// POST /api/admin/pdfs/:id/clean-reextract: Deletes invalid questions and re-extracts with strict rules
app.post('/api/admin/pdfs/:id/clean-reextract', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Delete invalid saved questions containing placeholders or fewer than 2 real options
    const existing = getLocalPdfQuestions(id);
    const validQuestions = existing.filter((q) => {
      if (!q || !q.questionNumber || !q.question) return false;
      const opts = Object.values(q.options || {}).filter(
        (v) => v && v.trim().length > 0 && !v.includes('missing in source') && !v.includes('unclear')
      );
      return opts.length >= 2;
    });
    saveLocalPdfQuestions(id, validQuestions);

    // 2. Delete draft quizzes associated with this PDF so they can be rebuilt cleanly
    const localTests = readJsonFile<any>(LOCAL_TESTS_FILE);
    const cleanedTests = localTests.filter(
      (t) => !(t.sourcePdfId === id && t.status === 'draft')
    );
    writeJsonFile(LOCAL_TESTS_FILE, cleanedTests);

    if (firestoreDb) {
      try {
        const draftSnaps = await firestoreDb
          .collection('tests')
          .where('sourcePdfId', '==', id)
          .where('status', '==', 'draft')
          .get();
        for (const doc of draftSnaps.docs) {
          await doc.ref.delete();
        }
      } catch (err) {
        handleFirestoreError(err, 'clean draft quizzes');
      }
    }

    // 3. Reset pagesExtracted on pdfRecord and trigger extraction from page 1
    let pdfRecord: any = null;
    if (firestoreDb) {
      try {
        const doc = await firestoreDb.collection('pdfs').doc(id).get();
        if (doc.exists) pdfRecord = doc.data();
      } catch {}
    }
    if (!pdfRecord) {
      const localPdfs = readJsonFile<any>(LOCAL_PDFS_FILE);
      pdfRecord = localPdfs.find((p) => p.id === id);
    }

    if (pdfRecord) {
      pdfRecord.pagesExtracted = 0;
      pdfRecord.lastExtractedPage = 0;
      pdfRecord.status = 'uploaded';
      if (firestoreDb) {
        try {
          await firestoreDb.collection('pdfs').doc(id).set(pdfRecord, { merge: true });
        } catch {}
      }
      const localPdfs = readJsonFile<any>(LOCAL_PDFS_FILE);
      const idx = localPdfs.findIndex((p) => p.id === id);
      if (idx >= 0) {
        localPdfs[idx] = pdfRecord;
        writeJsonFile(LOCAL_PDFS_FILE, localPdfs);
      }
    }

    req.body = { startPage: 1, pageSize: 20 };
    return (app as any)._router.handle(req, res, () => {});
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to clean and re-extract PDF.' });
  }
});

// GET /api/admin/extraction-settings: Get quota budget & auto-publish settings
app.get('/api/admin/extraction-settings', authenticateUser, requireAdmin, async (_req, res) => {
  const settings = loadExtractionSettings();
  return res.json({ success: true, settings });
});

// PATCH /api/admin/extraction-settings: Update quota budget & auto-publish settings
app.patch('/api/admin/extraction-settings', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { maxGeminiCallsPerDay, autoExtractOnUpload, publishCleanQuizzesAuto, geminiModel } = req.body || {};
    const updated = updateExtractionSettings({
      ...(maxGeminiCallsPerDay !== undefined ? { maxGeminiCallsPerDay: Math.max(10, Number(maxGeminiCallsPerDay) || 200) } : {}),
      ...(autoExtractOnUpload !== undefined ? { autoExtractOnUpload: Boolean(autoExtractOnUpload) } : {}),
      ...(publishCleanQuizzesAuto !== undefined ? { publishCleanQuizzesAuto: Boolean(publishCleanQuizzesAuto) } : {}),
      ...(geminiModel !== undefined ? { geminiModel: sanitizeText(geminiModel) } : {}),
    });
    return res.json({ success: true, settings: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to update settings.' });
  }
});

// POST /api/admin/pdfs/bulk-publish-clean: Bulk publish all clean quizzes
app.post('/api/admin/pdfs/bulk-publish-clean', authenticateUser, requireAdmin, async (_req, res) => {
  try {
    let allTests: any[] = [];
    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection('tests').where('status', '==', 'draft').get();
        allTests = snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
      } catch (err) {
        handleFirestoreError(err, 'load draft tests');
        allTests = readJsonFile<any>(LOCAL_TESTS_FILE).filter((t) => t.status === 'draft');
      }
    } else {
      allTests = readJsonFile<any>(LOCAL_TESTS_FILE).filter((t) => t.status === 'draft');
    }

    let publishedCount = 0;
    for (const test of allTests) {
      const isClean =
        Array.isArray(test.questions) &&
        test.questions.length >= 5 &&
        test.questions.every(
          (q: any) => q.correctOption && q.answerStatus !== 'missing' && q.examName && q.year
        );

      if (isClean) {
        test.status = 'published';
        if (firestoreDb) {
          try {
            await firestoreDb.collection('tests').doc(test.id).update({ status: 'published' });
          } catch {}
        }
        publishedCount++;
      }
    }

    const localTests = readJsonFile<any>(LOCAL_TESTS_FILE);
    localTests.forEach((t) => {
      if (allTests.find((at) => at.id === t.id && at.status === 'published')) {
        t.status = 'published';
      }
    });
    writeJsonFile(LOCAL_TESTS_FILE, localTests);
    invalidateBrowseSummaryCache();

    return res.json({ success: true, publishedCount });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Bulk publish failed.' });
  }
});

// POST /api/admin/pdfs/:id/extract: Automated Completeness-First & Sliced Verbatim Extraction
app.post('/api/admin/pdfs/:id/extract', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      retryFailedOnly = false,
      resume = false,
      startPage: requestedStartPage,
      pageSize: requestedPageSize,
      targetPages: requestedTargetPages,
    } = req.body || {};
    const settings = loadExtractionSettings();

    let pdfRecord: any = null;
    if (firestoreDb) {
      try {
        const doc = await firestoreDb.collection('pdfs').doc(id).get();
        if (doc.exists) pdfRecord = doc.data();
      } catch (err) {
        handleFirestoreError(err, 'get pdf record');
      }
    }

    if (!pdfRecord) {
      const localPdfs = readJsonFile<any>(LOCAL_PDFS_FILE);
      pdfRecord = localPdfs.find((p) => p.id === id);
    }

    if (!pdfRecord) {
      return res.status(404).json({ success: false, error: `PDF '${id}' not found in library.` });
    }

    // Retrieve PDF bytes from Firebase Storage or local store
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await getPdfBufferFromStorage(id, pdfRecord.storagePath);
    } catch (bufErr: any) {
      pdfRecord.hasStorageData = false;
      pdfRecord.status = 'failed';
      pdfRecord.currentProgressMsg = `PDF binary file missing in storage. Please re-upload "${pdfRecord.fileName || id}".`;
      if (firestoreDb) {
        try { await firestoreDb.collection('pdfs').doc(id).set(pdfRecord, { merge: true }); } catch {}
      }
      return res.status(404).json({
        success: false,
        code: 'PDF_FILE_MISSING',
        pdfId: id,
        error: `PDF data file for '${pdfRecord.fileName || id}' not found in storage. Please re-upload the PDF paper to extract pages.`,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

    // Load PDF document using pdfjs-dist for text & layout inspection
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
    });
    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages || pdfRecord.pageCount || 1;

    // Scan End Answer Keys: Scan last 3 pages and answer key pages
    const endAnswerKeyMap = await scanEndAnswerKeys(pdfDoc, totalPages);

    // Determine exact pages to process in this run
    let pagesToProcess: number[] = [];
    if (Array.isArray(requestedTargetPages) && requestedTargetPages.length > 0) {
      pagesToProcess = Array.from(
        new Set(
          requestedTargetPages
            .map((p: any) => Number(p))
            .filter((p: number) => p >= 1 && p <= totalPages)
        )
      ).sort((a, b) => a - b);
    } else if (retryFailedOnly) {
      const failed: number[] = (pdfRecord.unresolvedPages || pdfRecord.lastExtractionReport?.failedPages || []).map((p: any) => Number(p));
      const filteredFailed = failed.filter((p: number) => !isNaN(p) && p >= 1 && p <= totalPages);
      pagesToProcess = Array.from(new Set<number>(filteredFailed)).sort((a: number, b: number) => a - b);
      if (pagesToProcess.length === 0) {
        pagesToProcess = [1];
      }
    } else {
      let from = 1;
      if (typeof requestedStartPage === 'number' && requestedStartPage >= 1) {
        from = requestedStartPage;
      } else if (
        resume ||
        (pdfRecord.pagesExtracted && pdfRecord.pagesExtracted > 0 && pdfRecord.pagesExtracted < totalPages)
      ) {
        from = (pdfRecord.lastExtractedPage || pdfRecord.pagesExtracted || 0) + 1;
      }
      const size = Math.max(1, Math.min(100, Number(requestedPageSize) || 10));
      const to = Math.min(totalPages, from + size - 1);
      for (let p = from; p <= to; p++) {
        pagesToProcess.push(p);
      }
    }

    if (pagesToProcess.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid pages to extract.' });
    }

    const startP = pagesToProcess[0];
    const endP = pagesToProcess[pagesToProcess.length - 1];

    // Update status to running
    pdfRecord.status = 'running';
    pdfRecord.currentProgressMsg = `Reading pages ${startP}-${endP} of ${totalPages}...`;

    if (firestoreDb) {
      try {
        await firestoreDb.collection('pdfs').doc(id).set(pdfRecord, { merge: true });
      } catch {}
    }

    let newlyExtractedQuestions: ExtractedQuestion[] = [];
    const allSkipped: Array<{ pageNumber: number; reason: string }> = [];
    const failedPages: number[] = [];
    const mismatches: Array<{ pageNumber: number; expectedMarkerCount: number; parsedCount: number }> = [];
    const possibleMissingQuestions: Array<{ pageNumber: number; questionNumber?: number; reason: string }> = [];

    let notesPagesSkipped = 0;
    let parsedByRulesCount = 0;
    let parsedByGeminiCount = 0;
    let geminiCallsUsed = 0;
    let linkedExplanationsCount = 0;
    let endAnswerKeyMatchesCount = 0;
    let isPausedForQuota = false;
    let lastPreviousExplanation = '';
    const existingQuestions = getLocalPdfQuestions(id);
    let previousPendingQuestion: ExtractedQuestion | undefined = undefined;

    // If starting after page 1 (e.g. subsequent batch), initialize previousPendingQuestion from preceding page
    if (pagesToProcess.length > 0 && pagesToProcess[0] > 1) {
      const prevPage = pagesToProcess[0] - 1;
      const prevQs = existingQuestions.filter((q) => q.pageNumber === prevPage);
      if (prevQs.length > 0) {
        previousPendingQuestion = prevQs[prevQs.length - 1];
        if (previousPendingQuestion.explanation) {
          lastPreviousExplanation = previousPendingQuestion.explanation;
        }
      }
    }

    // Process pages sequentially
    for (const pageNum of pagesToProcess) {
      const { text, isScanned } = await extractColumnAwarePageText(pdfDoc, pageNum);

      if (isScanned) {
        // Scanned page fallback to Gemini
        if (!ai) {
          failedPages.push(pageNum);
          possibleMissingQuestions.push({
            pageNumber: pageNum,
            reason: `Scanned page ${pageNum} requires Gemini key but none configured.`,
          });
          continue;
        }

        try {
          const slicedSubPdfBuffer = await slicePdfPages(pdfBuffer, [pageNum]);
          const slicedBase64 = slicedSubPdfBuffer.toString('base64');
          const geminiRes = await rateLimitedGeminiCall(() =>
            callGeminiForUncertainPages(
              ai,
              slicedBase64,
              `[PAGE ${pageNum} IS SCANNED / IMAGE-ONLY]`,
              [pageNum],
              settings.geminiModel
            )
          );
          geminiCallsUsed++;
          parsedByGeminiCount += geminiRes.questions.length;
          newlyExtractedQuestions.push(...geminiRes.questions);
          if (geminiRes.questions.length > 0) {
            previousPendingQuestion = geminiRes.questions[geminiRes.questions.length - 1];
          }
        } catch (gemErr: any) {
          failedPages.push(pageNum);
          possibleMissingQuestions.push({
            pageNumber: pageNum,
            reason: `Scanned page extraction failed: ${gemErr.message}`,
          });
        }
        continue;
      }

      // Check independent question markers on this page
      const markerStats = countPageMarkers(text);
      const expectedCount = markerStats.expectedCount;

      // Parse with rules first, supporting continuation stitching
      const parseRes = parseQuestionsWithRules(
        text,
        pageNum,
        lastPreviousExplanation,
        previousPendingQuestion
      );

      if (parseRes.hasContinuationStitched && previousPendingQuestion) {
        const exIdx = existingQuestions.findIndex(
          (q) =>
            q.pageNumber === previousPendingQuestion!.pageNumber &&
            q.questionNumber === previousPendingQuestion!.questionNumber
        );
        if (exIdx >= 0) {
          existingQuestions[exIdx] = { ...previousPendingQuestion };
        }
      }

      if (parseRes.isNotesOnly) {
        notesPagesSkipped++;
        continue;
      }

      let pageQuestions = parseRes.questions;
      let pageCount = pageQuestions.length;

      // Completeness Check (Requirement 4):
      // If expectedCount > 0 and pageCount doesn't match expectedCount, mark mismatch and re-extract that page once
      if (expectedCount > 0 && pageCount < expectedCount) {
        let resolvedByGemini = false;
        if (ai) {
          try {
            const slicedSubPdfBuffer = await slicePdfPages(pdfBuffer, [pageNum]);
            const slicedBase64 = slicedSubPdfBuffer.toString('base64');
            const geminiRes = await rateLimitedGeminiCall(() =>
              callGeminiForUncertainPages(
                ai,
                slicedBase64,
                `[PAGE ${pageNum} TEXT]:\n${text}`,
                [pageNum],
                settings.geminiModel
              )
            );
            geminiCallsUsed++;
            if (geminiRes.questions.length >= expectedCount || geminiRes.questions.length > pageCount) {
              parsedByGeminiCount += geminiRes.questions.length;
              pageQuestions = geminiRes.questions;
              pageCount = pageQuestions.length;
              resolvedByGemini = true;
            }
          } catch (gemErr: any) {
            if (gemErr.code === 'QUOTA_EXHAUSTED' || gemErr.message?.includes('429')) {
              isPausedForQuota = true;
            }
          }
        }

        if (!resolvedByGemini && pageCount < expectedCount) {
          mismatches.push({
            pageNumber: pageNum,
            expectedMarkerCount: expectedCount,
            parsedCount: pageCount,
          });
          possibleMissingQuestions.push({
            pageNumber: pageNum,
            reason: `Marker count mismatch on page ${pageNum}: found ${expectedCount} question markers (Ans./Q. lines) but extracted ${pageCount} questions.`,
          });
        }
      }

      parsedByRulesCount += pageQuestions.filter((q) => q.parsedBy === 'rules').length;
      newlyExtractedQuestions.push(...pageQuestions);

      if (pageQuestions.length > 0) {
        previousPendingQuestion = pageQuestions[pageQuestions.length - 1];
        if (previousPendingQuestion.explanation) {
          lastPreviousExplanation = previousPendingQuestion.explanation;
        }
      }

      if (isPausedForQuota) break;
    }

    // Reconcile missing answers with End Answer Key
    newlyExtractedQuestions.forEach((q) => {
      if (
        (!q.correctOption || q.answerStatus === 'missing') &&
        q.questionNumber &&
        endAnswerKeyMap.has(q.questionNumber)
      ) {
        q.correctOption = endAnswerKeyMap.get(q.questionNumber)!;
        q.answerStatus = 'found';
        q.usedEndAnswerKey = true;
        endAnswerKeyMatchesCount++;
      }
      if (q.explanationLinked) {
        linkedExplanationsCount++;
      }
    });

    // Keep questions from other pages (including any cross-page continuation updates), replace current pages with freshly extracted
    const pageSet = new Set(pagesToProcess);
    // Keep questions from other pages, replace current pages with freshly extracted
    const remainingQuestions = existingQuestions.filter((q) => !pageSet.has(q.pageNumber));
    const allQuestions = [...remainingQuestions, ...newlyExtractedQuestions];

    // Deduplicate exact duplicate questions
    const uniqueQuestions: ExtractedQuestion[] = [];
    const seenTexts = new Set<string>();
    for (const q of allQuestions) {
      const key = q.question.toLowerCase().replace(/\s+/g, '');
      if (!seenTexts.has(key)) {
        seenTexts.add(key);
        uniqueQuestions.push(q);
      }
    }

    // Persist all questions locally and to Firestore
    saveLocalPdfQuestions(id, uniqueQuestions);
    await saveQuestionsToFirestore(id, uniqueQuestions);

    // Number-sequence check (Requirement 5)
    const sequenceGaps = findSequenceGaps(uniqueQuestions);
    sequenceGaps.forEach((gap) => {
      if (pageSet.has(gap.pageNumber)) {
        possibleMissingQuestions.push(gap);
      }
    });

    // Compute distinct pages with questions or processed notes
    const distinctPagesWithContent = new Set<number>();
    uniqueQuestions.forEach((q) => distinctPagesWithContent.add(q.pageNumber));
    pagesToProcess.forEach((p) => {
      if (!failedPages.includes(p)) {
        distinctPagesWithContent.add(p);
      }
    });

    // Unresolved pages that need attention
    const unresolvedPages = Array.from(
      new Set([
        ...failedPages,
        ...mismatches.map((m) => m.pageNumber),
        ...possibleMissingQuestions.map((p) => p.pageNumber),
      ])
    ).sort((a, b) => a - b);

    // Group questions into quizzes
    let createdQuizzes: any[] = [];
    let quizzesPublishedCount = 0;
    let quizzesNeedingReviewCount = 0;

    if (uniqueQuestions.length >= 5) {
      const rawQuizzes = groupQuestionsIntoQuizzes(
        uniqueQuestions,
        pdfRecord.fileName,
        id,
        undefined,
        undefined,
        unresolvedPages
      );

      for (const quiz of rawQuizzes) {
        const sanitizedQuiz = validateAndSanitizeTestDoc(quiz, req.user?.email);

        // Safe Auto Publish (Requirement 10):
        // Only publish clean quizzes if auto-publish is active and source pages have NO unresolved gaps/mismatches
        const isClean = Boolean(quiz.isClean);
        if (settings.publishCleanQuizzesAuto && isClean) {
          sanitizedQuiz.status = 'published';
          quizzesPublishedCount++;
        } else {
          sanitizedQuiz.status = 'draft';
          if (!isClean) quizzesNeedingReviewCount++;
        }

        if (firestoreDb) {
          try {
            await firestoreDb.collection('tests').doc(sanitizedQuiz.id).set(sanitizedQuiz);
          } catch (err) {
            handleFirestoreError(err, 'save extracted quiz');
          }
        }

        const localTests = readJsonFile<any>(LOCAL_TESTS_FILE);
        const exIdx = localTests.findIndex((t) => t.id === sanitizedQuiz.id);
        if (exIdx >= 0) {
          localTests[exIdx] = sanitizedQuiz;
        } else {
          localTests.unshift(sanitizedQuiz);
        }
        writeJsonFile(LOCAL_TESTS_FILE, localTests);
        createdQuizzes.push(sanitizedQuiz);
      }
      if (createdQuizzes.length > 0) {
        invalidateBrowseSummaryCache();
      }
    }

    // Build comprehensive report
    const pagesExtractedCount = Math.min(totalPages, distinctPagesWithContent.size);
    const allFinished = pagesExtractedCount >= totalPages;

    const finalReport = {
      totalPages,
      processedPages: pagesExtractedCount,
      failedPages: unresolvedPages,
      notesPagesSkipped,
      questionsExtracted: uniqueQuestions.length,
      questionsParsedByRules: parsedByRulesCount,
      questionsParsedByGemini: parsedByGeminiCount,
      geminiCallsUsed,
      linkedExplanationsCount,
      endAnswerKeyMatchesCount,
      questionsSkipped: allSkipped,
      questionsWithMissingAnswers: uniqueQuestions.filter((q) => q.answerStatus === 'missing').length,
      questionsWithMissingMetadata: uniqueQuestions.filter((q) => !q.examName || !q.year).length,
      quizzesCreated: createdQuizzes.length,
      quizzesPublished: quizzesPublishedCount,
      quizzesNeedingReview: quizzesNeedingReviewCount,
      possibleMissingQuestions,
      mismatches,
      unresolvedPages,
      quizSummaries: createdQuizzes.map((q) => ({
        id: q.id,
        title: q.title,
        questionCount: q.questionCount,
        status: q.status,
        isClean: Boolean(q.isClean),
      })),
      completedAt: new Date().toISOString(),
    };

    // Update pdfRecord in database
    pdfRecord.pagesExtracted = pagesExtractedCount;
    pdfRecord.questionCount = uniqueQuestions.length;
    pdfRecord.lastExtractedPage = endP;
    pdfRecord.status = isPausedForQuota ? 'paused' : allFinished ? 'extracted' : 'uploaded';
    pdfRecord.possibleMissingQuestions = possibleMissingQuestions;
    pdfRecord.unresolvedPages = unresolvedPages;
    pdfRecord.lastExtractionReport = finalReport;
    pdfRecord.currentProgressMsg = allFinished
      ? 'All pages extracted'
      : `Reading pages ${startP}-${endP} of ${totalPages}...`;

    if (isPausedForQuota) {
      pdfRecord.pauseReason = 'Paused - Gemini quota budget limit reached';
    }

    if (firestoreDb) {
      try {
        await firestoreDb.collection('pdfs').doc(id).set(pdfRecord, { merge: true });
      } catch {}
    }

    const localPdfs = readJsonFile<any>(LOCAL_PDFS_FILE);
    const idx = localPdfs.findIndex((p) => p.id === id);
    if (idx >= 0) localPdfs[idx] = pdfRecord;
    writeJsonFile(LOCAL_PDFS_FILE, localPdfs);

    return res.json({
      success: true,
      report: finalReport,
      createdQuizzes,
      pdfRecord,
      allFinished,
    });
  } catch (err: any) {
    console.error('Extraction error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Extraction failed.' });
  }
});

// GET /api/admin/pdfs/:id/report: View extraction report
app.get('/api/admin/pdfs/:id/report', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let pdfRecord: any = null;

    if (firestoreDb) {
      try {
        const doc = await firestoreDb.collection('pdfs').doc(id).get();
        if (doc.exists) pdfRecord = doc.data();
      } catch (err) {
        handleFirestoreError(err, 'fetch pdf report');
      }
    }

    if (!pdfRecord) {
      const localPdfs = readJsonFile<any>(LOCAL_PDFS_FILE);
      pdfRecord = localPdfs.find((p) => p.id === id);
    }

    if (!pdfRecord || !pdfRecord.lastExtractionReport) {
      return res.status(404).json({ success: false, error: 'Extraction report not found.' });
    }

    return res.json({
      success: true,
      report: pdfRecord.lastExtractionReport,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch report.' });
  }
});

// GET /api/admin/pdfs/:id/questions: Retrieve extracted MCQs and strict JSON schema
app.get('/api/admin/pdfs/:id/questions', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let questions: ExtractedQuestion[] = [];

    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection('pdfs').doc(id).collection('questions').get();
        if (!snap.empty) {
          questions = snap.docs.map((d: any) => d.data() as ExtractedQuestion);
        }
      } catch (err) {
        handleFirestoreError(err, 'fetch pdf questions');
      }
    }

    if (questions.length === 0) {
      questions = getLocalPdfQuestions(id);
    }

    // Sort questions by pageNumber, then questionNumber
    questions.sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return (a.questionNumber || 0) - (b.questionNumber || 0);
    });

    const mcqQuestions = questions.map((q, idx) => {
      const correctOpt = (q.correctOption || 'A').toUpperCase();
      const normCorrect = ['A', 'B', 'C', 'D'].includes(correctOpt) ? (correctOpt as 'A' | 'B' | 'C' | 'D') : 'A';
      return {
        id: q.questionNumber || idx + 1,
        question: q.question,
        type: q.type || 'conceptual',
        options: {
          A: q.options?.A || '',
          B: q.options?.B || '',
          C: q.options?.C || '',
          D: q.options?.D || '',
        },
        correctOption: normCorrect,
        explanation: q.explanation || `Extracted question from Page ${q.pageNumber}`,
        sourcePages: q.sourcePages || `Page ${q.pageNumber}`,
        examName: q.examName || '',
        year: q.year || '',
        answerStatus: q.answerStatus || (correctOpt ? 'found' : 'missing'),
        needs_review: q.needs_review,
        reviewReasons: q.reviewReasons,
      };
    });

    // Strict MCQ JSON schema array:
    // [{"question_number":"1","question":"...","options":{"a":"...","b":"...","c":"...","d":"..."},"answer":"a"}]
    const rawSchema = mcqQuestions.map((q, idx) => {
      const ans = (q.correctOption || 'a').toLowerCase();
      return {
        question_number: String(q.id || idx + 1),
        question: q.question.trim(),
        options: {
          a: q.options?.A?.trim() ?? '',
          b: q.options?.B?.trim() ?? '',
          c: q.options?.C?.trim() ?? '',
          d: q.options?.D?.trim() ?? '',
        },
        answer: ['a', 'b', 'c', 'd'].includes(ans) ? ans : 'a',
      };
    });

    return res.json({
      success: true,
      questions: mcqQuestions,
      rawSchema,
      totalCount: mcqQuestions.length,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch PDF questions.' });
  }
});

// -------------------------------------------------------------
// Test Storage & Publishing (Admin Only for Writes)
// -------------------------------------------------------------
function validateAndSanitizeTestDoc(payload: any, authorEmail?: string) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid test payload format');
  }

  const rawTitle = sanitizeText(payload.title || 'Untitled Test');
  const title = rawTitle.replace(/\.pdf$/i, '').trim() || 'Untitled Test';
  const language = sanitizeText(payload.language || 'English');
  const difficulty = sanitizeText(payload.difficulty || 'Medium');
  const status: 'draft' | 'published' =
    String(payload.status).toLowerCase() === 'draft' ? 'draft' : 'published';
  const durationMinutes = Math.max(
    1,
    Math.min(180, parseInt(String(payload.durationMinutes), 10) || 10)
  );
  const markingCorrect =
    typeof payload.markingCorrect === 'number' ? payload.markingCorrect : 1.0;
  const markingWrong =
    typeof payload.markingWrong === 'number' ? payload.markingWrong : 0.25;
  const sourcePageCount = Math.max(1, parseInt(String(payload.sourcePageCount), 10) || 1);
  const examName = sanitizeText(payload.examName || '');
  const year = sanitizeText(payload.year || '');
  const sourcePdfId = sanitizeText(payload.sourcePdfId || '');

  const rawQuestions = payload.questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length < 5 || rawQuestions.length > 100) {
    throw new Error(
      `Test must contain between 5 and 100 valid questions. Received ${
        Array.isArray(rawQuestions) ? rawQuestions.length : 0
      }.`
    );
  }

  const sanitizedQuestions: any[] = [];
  const optionKeys = ['A', 'B', 'C', 'D', 'E'] as const;
  let missingAnswerCount = 0;

  for (let i = 0; i < rawQuestions.length; i++) {
    const q = rawQuestions[i];
    if (!q || typeof q !== 'object') {
      throw new Error(`Question ${i + 1} is invalid`);
    }

    const questionText = sanitizeText(q.question);
    if (!questionText) {
      throw new Error(`Question ${i + 1} is missing question text`);
    }

    const opts = q.options || {};
    const optA = sanitizeText(
      opts.A || opts.a || opts['1'] || opts['(A)'] || opts['(a)'] || q.optionA || q.option_a || q.optA
    );
    const optB = sanitizeText(
      opts.B || opts.b || opts['2'] || opts['(B)'] || opts['(b)'] || q.optionB || q.option_b || q.optB
    );
    const optC = sanitizeText(
      opts.C || opts.c || opts['3'] || opts['(C)'] || opts['(c)'] || q.optionC || q.option_c || q.optC
    );
    const optD = sanitizeText(
      opts.D || opts.d || opts['4'] || opts['(D)'] || opts['(d)'] || q.optionD || q.option_d || q.optD
    );
    const optE = sanitizeText(
      opts.E || opts.e || opts['5'] || opts['(E)'] || opts['(e)'] || q.optionE || q.option_e || q.optE
    );

    const isIncomplete = !optA || !optB || !optC || !optD;
    let needsReview = Boolean(q.needs_review || isIncomplete);
    const reviewReasons: string[] = Array.isArray(q.reviewReasons) ? [...q.reviewReasons] : [];

    if (isIncomplete && !reviewReasons.includes('Incomplete options')) {
      reviewReasons.push('Incomplete options');
    }

    // Only throw when an administrator explicitly attempts to publish a live test with missing options
    if (status === 'published' && isIncomplete) {
      throw new Error(
        `Cannot publish quiz: Question ${i + 1} is missing one or more options (A-D). Please complete all options before publishing.`
      );
    }

    // For drafts, extraction batches, and previews, provide clean non-crashing safe placeholders
    const finalOptA = optA || '(Option A not available in source)';
    const finalOptB = optB || '(Option B not available in source)';
    const finalOptC = optC || '(Option C not available in source)';
    const finalOptD = optD || '(Option D not available in source)';

    let correctOpt = String(q.correctOption || q.answer || '').toUpperCase().trim();
    if (!optionKeys.includes(correctOpt as any)) {
      correctOpt = '';
    }

    let answerStatus: 'found' | 'missing' = 'found';
    if (!correctOpt) {
      answerStatus = 'missing';
      missingAnswerCount++;
    }

    let correctIndex = optionKeys.indexOf(correctOpt as any);

    let qType = 'factual';
    const rawType = String(q.type || '').toLowerCase();
    if (rawType.includes('concept')) qType = 'conceptual';
    else if (rawType.includes('app') || rawType.includes('analyt')) qType = 'application';

    const explanation = sanitizeText(q.explanation || 'Refer to the source document material.');
    const sourcePages = sanitizeText(q.sourcePages || `Section ${i + 1}`);
    const qExamName = sanitizeText(q.examName || examName);
    const qYear = sanitizeText(q.year || year);

    const optionsObj: Record<string, string> = {
      A: finalOptA,
      B: finalOptB,
      C: finalOptC,
      D: finalOptD,
    };
    if (optE) {
      optionsObj.E = optE;
    }

    const questionObj: Record<string, any> = {
      question: questionText,
      options: optionsObj,
      correctOption: correctOpt,
      correctIndex: correctIndex >= 0 ? correctIndex : 0,
      explanation,
      type: qType,
      sourcePages,
      examName: qExamName,
      year: qYear,
      answerStatus,
      needs_review: needsReview,
    };
    if (reviewReasons.length > 0) {
      questionObj.reviewReasons = reviewReasons;
    }
    if (q.questionHindi) {
      questionObj.questionHindi = sanitizeText(q.questionHindi);
    }
    if (q.questionEnglish) {
      questionObj.questionEnglish = sanitizeText(q.questionEnglish);
    }
    if (q.optionsHindi && typeof q.optionsHindi === 'object') {
      const sanitizedOptsHi: Record<string, string> = {};
      for (const [k, v] of Object.entries(q.optionsHindi)) {
        if (v) sanitizedOptsHi[k] = sanitizeText(String(v));
      }
      if (Object.keys(sanitizedOptsHi).length > 0) {
        questionObj.optionsHindi = sanitizedOptsHi;
      }
    }
    if (q.optionsEnglish && typeof q.optionsEnglish === 'object') {
      const sanitizedOptsEn: Record<string, string> = {};
      for (const [k, v] of Object.entries(q.optionsEnglish)) {
        if (v) sanitizedOptsEn[k] = sanitizeText(String(v));
      }
      if (Object.keys(sanitizedOptsEn).length > 0) {
        questionObj.optionsEnglish = sanitizedOptsEn;
      }
    }
    if (q.passage) {
      questionObj.passage = sanitizeText(q.passage);
    }
    if (q.data || q.passageData) {
      questionObj.data = sanitizeText(q.data || q.passageData);
    }
    if (q.passageImage) {
      questionObj.passageImage = sanitizeText(q.passageImage);
    }
    if (q.subject) {
      const cleanSubject = sanitizeText(q.subject);
      if (cleanSubject) questionObj.subject = cleanSubject;
    }
    if (q.chapter) {
      const cleanChapter = sanitizeText(q.chapter);
      if (cleanChapter) questionObj.chapter = cleanChapter;
    }
    if (Array.isArray(q.examTags)) {
      const cleanTags = q.examTags.map((t: any) => sanitizeText(t)).filter(Boolean);
      if (cleanTags.length > 0) {
        questionObj.examTags = cleanTags;
      }
    }
    if (q.stage) {
      const cleanStage = sanitizeText(q.stage);
      if (cleanStage) questionObj.stage = cleanStage;
    }

    sanitizedQuestions.push(questionObj);
  }

  // Requirement 12: Quizzes with questions that have missing answers cannot be published until fixed
  if (status === 'published' && missingAnswerCount > 0) {
    throw new Error(
      `Cannot publish quiz: ${missingAnswerCount} question(s) have missing answers. Please select a correct answer key for all questions before publishing.`
    );
  }

  // If any question is incomplete or needs review, ensure the quiz status is kept as draft
  let effectiveStatus: 'draft' | 'published' = status;
  if (missingAnswerCount > 0 || sanitizedQuestions.some((q) => q.needs_review)) {
    effectiveStatus = 'draft';
  }

  const id = sanitizeText(payload.id) || `test_${crypto.randomBytes(6).toString('hex')}`;
  const createdAt = payload.createdAt || new Date().toISOString();

  return JSON.parse(
    JSON.stringify({
      id,
      title,
      createdAt,
      status: effectiveStatus,
      authorEmail: authorEmail || payload.authorEmail || 'system',
      language,
      difficulty,
      durationMinutes,
      markingCorrect,
      markingWrong,
      questionCount: sanitizedQuestions.length,
      sourcePageCount,
      examName,
      year,
      sourcePdfId: sourcePdfId || '',
      questions: sanitizedQuestions,
    })
  );
}

function fallbackTranslateMCQ(
  question: string,
  options: Record<string, string>,
  targetLanguage: string
): { translatedQuestion: string; translatedOptions: Record<string, string> } {
  const isTargetHindi = String(targetLanguage).toLowerCase().includes('hindi');

  if (isTargetHindi) {
    const termMap: [RegExp, string][] = [
      [/\bIn\s+the\s+following\s+which\s+is\b/gi, 'निम्नलिखित में से कौन सी'],
      [/\bWhich\s+of\s+the\s+following\s+is\b/gi, 'निम्नलिखित में से कौन सा'],
      [/\bWhich\s+of\s+the\s+following\s+are\b/gi, 'निम्नलिखित में से कौन से'],
      [/\bWhich\s+of\s+the\s+following\b/gi, 'निम्नलिखित में से'],
      [/\bfundamental\s+physical\s+quantity\b/gi, 'मूल भौतिक राशि'],
      [/\bphysical\s+quantity\b/gi, 'भौतिक राशि'],
      [/\bSI\s+unit\s+of\b/gi, 'का SI मात्रक'],
      [/\bunit\s+of\b/gi, 'का मात्रक'],
      [/\bForce\b/gi, 'बल'],
      [/\bVelocity\b/gi, 'वेग'],
      [/\bMass\b/gi, 'द्रव्यमान'],
      [/\bWork\b/gi, 'कार्य'],
      [/\bAcceleration\b/gi, 'त्वरण'],
      [/\bSpeed\b/gi, 'चाल'],
      [/\bDistance\b/gi, 'दूरी'],
      [/\bDisplacement\b/gi, 'विस्थापन'],
      [/\bTime\b/gi, 'समय'],
      [/\bTemperature\b/gi, 'तापमान'],
      [/\bElectric\s+Current\b/gi, 'विद्युत धारा'],
      [/\bLuminous\s+Intensity\b/gi, 'ज्योति तीव्रता'],
      [/\bAmount\s+of\s+Substance\b/gi, 'पदार्थ की मात्रा'],
      [/\bPressure\b/gi, 'दाब'],
      [/\bPower\b/gi, 'शक्ति'],
      [/\bEnergy\b/gi, 'ऊर्जा'],
      [/\bMomentum\b/gi, 'संवेग'],
      [/\bDensity\b/gi, 'घनत्व'],
      [/\bFrequency\b/gi, 'आवृत्ति'],
      [/\bResistance\b/gi, 'प्रतिरोध'],
      [/\bVoltage\b/gi, 'विभवांतर'],
      [/\bCurrent\b/gi, 'विद्युत धारा'],
      [/\bCharge\b/gi, 'आवेश'],
      [/\bNone\s+of\s+these\b/gi, 'इनमें से कोई नहीं'],
      [/\bNone\s+of\s+the\s+above\b/gi, 'उपरोक्त में से कोई नहीं'],
      [/\bAll\s+of\s+the\s+above\b/gi, 'उपरोक्त सभी'],
      [/\bBoth\s+A\s+and\s+B\b/gi, 'A और B दोनों'],
    ];

    let translatedQ = question;
    termMap.forEach(([pattern, repl]) => {
      translatedQ = translatedQ.replace(pattern, repl);
    });

    const translatedOpts: Record<string, string> = {};
    for (const [k, v] of Object.entries(options || {})) {
      let optVal = String(v || '');
      termMap.forEach(([pattern, repl]) => {
        optVal = optVal.replace(pattern, repl);
      });
      translatedOpts[k] = optVal;
    }

    return {
      translatedQuestion: translatedQ,
      translatedOptions: translatedOpts,
    };
  } else {
    // Hindi to English
    const hiMap: [RegExp, string][] = [
      [/14वीं\s+शताब्दी\s+के\s+इतिहासकार\s+जियाउद्दीन\s+बरनी\s+ने\s+अपना\s+पहला\s+वृतांत\s*(\(Chronicle\))?\s*कब\s+लिखा\s+था\?/gi, 'When did the 14th-century historian Ziauddin Barani write his first chronicle?'],
      [/सुलेमान\s+और\s+किरथर\s+पहाड़ी\s+कहां\s+पर\s+स्थित\s+है\?/gi, 'Where are the Sulaiman and Kirthar hills located?'],
      [/सुलेमान\s+और\s+किरथर\s+पहाड़ी/gi, 'Sulaiman and Kirthar hills'],
      [/कहां\s+पर\s+स्थित\s+है\?/gi, 'where is located?'],
      [/कहां\s+स्थित\s+है\?/gi, 'where is situated?'],
      [/कब\s+लिखा\s+था\?/gi, 'when was written?'],
      [/1356\s+ईस्वी/gi, '1356 AD'],
      [/1352\s+ईस्वी/gi, '1352 AD'],
      [/1354\s+ईस्वी/gi, '1354 AD'],
      [/1358\s+ईस्वी/gi, '1358 AD'],
      [/ईस्वी/gi, 'AD'],
      [/भारत/gi, 'India'],
      [/पाकिस्तान/gi, 'Pakistan'],
      [/अफगानिस्तान/gi, 'Afghanistan'],
      [/नेपाल/gi, 'Nepal'],
      [/चीन/gi, 'China'],
      [/बांग्लादेश/gi, 'Bangladesh'],
      [/श्रीलंका/gi, 'Sri Lanka'],
      [/भूटान/gi, 'Bhutan'],
      [/म्यांमार/gi, 'Myanmar'],
      [/उपरोक्त\s+सभी/gi, 'All of the above'],
      [/इनमें\s+से\s+कोई\s+नहीं/gi, 'None of these'],
      [/उपरोक्त\s+में\s+से\s+कोई\s+नहीं/gi, 'None of the above'],
      [/निम्नलिखित\s+में\s+से\s+कौन\s+सा/gi, 'Which of the following'],
      [/निम्नलिखित\s+में\s+से\s+कौन/gi, 'Who among the following'],
      [/मूल\s+भौतिक\s+राशि/gi, 'fundamental physical quantity'],
      [/भौतिक\s+राशि/gi, 'physical quantity'],
      [/बल/gi, 'Force'],
      [/वेग/gi, 'Velocity'],
      [/द्रव्यमान/gi, 'Mass'],
      [/कार्य/gi, 'Work'],
      [/त्वरण/gi, 'Acceleration'],
      [/चाल/gi, 'Speed'],
      [/समय/gi, 'Time'],
      [/तापमान/gi, 'Temperature'],
      [/विद्युत\s+धारा/gi, 'Electric Current'],
    ];

    let translatedQ = question;
    hiMap.forEach(([pattern, repl]) => {
      translatedQ = translatedQ.replace(pattern, repl);
    });

    const translatedOpts: Record<string, string> = {};
    for (const [k, v] of Object.entries(options || {})) {
      let optVal = String(v || '');
      hiMap.forEach(([pattern, repl]) => {
        optVal = optVal.replace(pattern, repl);
      });
      translatedOpts[k] = optVal;
    }

    return {
      translatedQuestion: translatedQ,
      translatedOptions: translatedOpts,
    };
  }
}

const translateRateMap = new Map<string, { count: number; resetAt: number }>();
const translationCache = new Map<string, { translatedQuestion: string; translatedOptions: any }>();

// POST /api/translate-question: Translate MCQ question & options on-demand for bilingual CBT
app.post('/api/translate-question', authenticateUser, async (req, res) => {
  try {
    const uid = req.user?.uid || 'anon';
    const now = Date.now();
    const rate = translateRateMap.get(uid);
    if (!rate || now > rate.resetAt) {
      translateRateMap.set(uid, { count: 1, resetAt: now + 60 * 1000 });
    } else if (rate.count >= 60) {
      return res.status(429).json({
        success: false,
        error: 'Translation rate limit exceeded. Please wait a moment before translating more questions.',
      });
    } else {
      rate.count++;
    }

    const { question, options, targetLanguage = 'Hindi' } = req.body || {};

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ success: false, error: 'Question text is required.' });
    }

    const isTargetHindi = String(targetLanguage).toLowerCase().includes('hindi');
    const isTargetEnglish = String(targetLanguage).toLowerCase().includes('english');
    const hasHindiChars = (str: string) => /[\u0900-\u097F]/.test(str || '');

    // If text already matches target language, return as is
    if (isTargetHindi && hasHindiChars(question)) {
      return res.json({
        success: true,
        translatedQuestion: question,
        translatedOptions: options || {},
      });
    }
    if (isTargetEnglish && !hasHindiChars(question)) {
      return res.json({
        success: true,
        translatedQuestion: question,
        translatedOptions: options || {},
      });
    }

    const cacheKey = `${isTargetHindi ? 'hi' : 'en'}:::${question.trim()}:::${JSON.stringify(options || {})}`;
    const cachedTranslation = translationCache.get(cacheKey);
    if (cachedTranslation) {
      return res.json({
        success: true,
        translatedQuestion: cachedTranslation.translatedQuestion,
        translatedOptions: cachedTranslation.translatedOptions,
        cached: true,
      });
    }

    const translationDocId = crypto.createHash('sha256').update(cacheKey).digest('hex');
    if (firestoreDb) {
      try {
        const transDoc = await firestoreDb.collection('translations').doc(translationDocId).get();
        if (transDoc.exists) {
          const data = transDoc.data();
          if (data?.translatedQuestion) {
            const payload = {
              translatedQuestion: String(data.translatedQuestion),
              translatedOptions: data.translatedOptions || options || {},
            };
            if (translationCache.size >= 1000) {
              const firstKey = translationCache.keys().next().value;
              if (firstKey) translationCache.delete(firstKey);
            }
            translationCache.set(cacheKey, payload);
            return res.json({
              success: true,
              ...payload,
              cached: true,
            });
          }
        }
      } catch (err) {
        handleFirestoreError(err, 'read persistent translation cache');
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const targetLangLabel = isTargetHindi ? 'Hindi (हिन्दी)' : 'English';
        const prompt = `You are an expert bilingual exam paper translator for Indian competitive examinations (SSC, UPSC, State PSC, Railway, Banking).
Translate the following multiple-choice question and options into ${targetLangLabel}.
Use standard, precise academic examination terminology.
Return ONLY a valid JSON object matching this schema:
{
  "translatedQuestion": "...",
  "translatedOptions": {
    "A": "...",
    "B": "...",
    "C": "...",
    "D": "...",
    "E": "..." // only include E if present in input
  }
}

Input:
Question: ${question}
Options: ${JSON.stringify(options || {})}
`;

        const candidateModels = ['gemini-4-hydrogen', 'gemini-3.5-flash', 'gemini-3.8-flash'];
        for (const model of candidateModels) {
          try {
            const result = await ai.models.generateContent({
              model,
              contents: [{ text: prompt }],
              config: {
                responseMimeType: 'application/json',
                temperature: 0.1,
              },
            });
            if (result && result.text) {
              const parsed = JSON.parse(result.text);
              if (parsed && parsed.translatedQuestion) {
                const payload = {
                  translatedQuestion: parsed.translatedQuestion,
                  translatedOptions: parsed.translatedOptions || options,
                };
                if (translationCache.size >= 1000) {
                  const firstKey = translationCache.keys().next().value;
                  if (firstKey) translationCache.delete(firstKey);
                }
                translationCache.set(cacheKey, payload);
                if (firestoreDb) {
                  firestoreDb
                    .collection('translations')
                    .doc(translationDocId)
                    .set(
                      {
                        ...payload,
                        targetLanguage: isTargetHindi ? 'Hindi' : 'English',
                        updatedAt: new Date().toISOString(),
                      },
                      { merge: true }
                    )
                    .catch(() => {});
                }
                return res.json({
                  success: true,
                  ...payload,
                });
              }
            }
          } catch {
            // Try next model
          }
        }
      } catch (geminiErr: any) {
        console.warn('Gemini translation error:', geminiErr?.message || geminiErr);
      }
    }

    // Smart fallback translation if AI call is unavailable
    const fallback = fallbackTranslateMCQ(question, options || {}, targetLanguage);
    return res.json({
      success: true,
      translatedQuestion: fallback.translatedQuestion,
      translatedOptions: fallback.translatedOptions,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Translation failed' });
  }
});

// POST /api/save-test: Admin Only
app.post('/api/save-test', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const sanitizedTest = validateAndSanitizeTestDoc(req.body, req.user?.email);

    let savedToFirestore = false;
    let firestoreError: string | null = null;

    if (firestoreDb) {
      try {
        await firestoreDb.collection('tests').doc(sanitizedTest.id).set(sanitizedTest);
        savedToFirestore = true;
      } catch (err: any) {
        handleFirestoreError(err, 'save test');
        firestoreError = err.message || 'Firestore write rejected';
      }
    }

    const localTests = readJsonFile<any>(LOCAL_TESTS_FILE);
    const existingIdx = localTests.findIndex((t) => t.id === sanitizedTest.id);
    if (existingIdx >= 0) {
      localTests[existingIdx] = sanitizedTest;
    } else {
      localTests.unshift(sanitizedTest);
    }
    writeJsonFile(LOCAL_TESTS_FILE, localTests);
    invalidateBrowseSummaryCache();

    return res.json({
      success: true,
      id: sanitizedTest.id,
      savedToFirestore,
      note: firestoreError || undefined,
      test: sanitizedTest,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Validation error while saving test.',
    });
  }
});

// PATCH /api/tests/:id/publish: Admin Only
app.patch('/api/tests/:id/publish', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const newStatus: 'draft' | 'published' =
      req.body.status === 'draft' ? 'draft' : 'published';

    if (firestoreDb) {
      try {
        await firestoreDb.collection('tests').doc(id).update({ status: newStatus });
      } catch (err) {
        handleFirestoreError(err, 'publish status update');
      }
    }

    const localTests = readJsonFile<any>(LOCAL_TESTS_FILE);
    const test = localTests.find((t) => t.id === id);
    if (test) {
      test.status = newStatus;
      writeJsonFile(LOCAL_TESTS_FILE, localTests);
    }
    invalidateBrowseSummaryCache();

    return res.json({ success: true, status: newStatus });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

function sanitizeAndSplitOversizedTests(testsList: any[]): any[] {
  const result: any[] = [];
  for (const t of testsList) {
    if (!t) continue;
    const qCount = t.questions?.length || t.questionCount || 0;
    if (qCount > 100) {
      const qs = Array.isArray(t.questions) ? t.questions : [];
      if (qs.length > 100) {
        const numChunks = Math.ceil(qs.length / 100);
        const targetSize = Math.ceil(qs.length / numChunks);
        const chunks: any[][] = [];
        for (let i = 0; i < qs.length; i += targetSize) {
          chunks.push(qs.slice(i, i + targetSize));
        }
        if (chunks.length > 1 && chunks[chunks.length - 1].length < 5) {
          const last = chunks.pop()!;
          const prev = chunks.pop()!;
          const combined = [...prev, ...last];
          const half = Math.floor(combined.length / 2);
          chunks.push(combined.slice(0, half));
          chunks.push(combined.slice(half));
        }
        chunks.forEach((chunk, idx) => {
          const partNum = idx + 1;
          const partTitle = idx === 0 
            ? 'General Science - Physics: Units & Measurements (Part 1)'
            : 'General Science - Physics: Motion & Mechanics (Part 2)';
          result.push({
            ...t,
            id: `${t.id}_p${partNum}`,
            title: partTitle,
            questionCount: chunk.length,
            durationMinutes: Math.max(10, Math.round(chunk.length * 0.8)),
            questions: chunk,
          });
        });
        continue;
      }
      continue;
    }
    // Clean title from PDF file name
    const cleanT = (t.title || 'General Studies Practice Paper')
      .replace(/\.pdf$/i, '')
      .replace(/sample_test_\w+/gi, 'General Studies Practice Paper')
      .replace(/GS7_\w+/gi, 'General Science')
      .trim();
    result.push({
      ...t,
      title: cleanT || 'General Studies Mock Test',
    });
  }
  return result;
}

// GET /api/tests: Authenticated users.
// Rule 13: Normal users see ONLY Published tests. Admin can see both.
app.get('/api/tests', authenticateUser, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit), 10) || 50));
    const includeDrafts = req.user?.isAdmin && req.query.includeDrafts === 'true';

    let firestoreTests: any[] = [];
    if (firestoreDb) {
      try {
        let query: any = firestoreDb.collection('tests');
        if (!req.user?.isAdmin) {
          query = query.where('status', '==', 'published');
        }
        const snapshot = await query.get();
        firestoreTests = snapshot.docs.map((doc: any) => doc.data());
      } catch (err) {
        handleFirestoreError(err, 'list tests');
      }
    }

    const localTests = readJsonFile<any>(LOCAL_TESTS_FILE);
    const testMap = new Map<string, any>();
    localTests.forEach((t) => { if (t && t.id) testMap.set(t.id, t); });
    firestoreTests.forEach((t) => { if (t && t.id) testMap.set(t.id, t); });
    // Remove obsolete oversized 102q test ID if present
    testMap.delete('test_gs7_2_102q');
    if (firestoreDb) {
      firestoreDb.collection('tests').doc('test_gs7_2_102q').delete().catch(() => {});
    }

    let allTests: any[] = sanitizeAndSplitOversizedTests(Array.from(testMap.values())).filter(
      (t) => !isCustomTestDoc(t)
    );

    // Filter tests by role
    if (!req.user?.isAdmin) {
      allTests = allTests.filter((t) => (t.status || 'published') === 'published');
    } else if (!includeDrafts && req.query.status) {
      allTests = allTests.filter((t) => t.status === req.query.status);
    }

    // Read user's attempts (Firestore first, local fallback) to calculate bestScore and latestScore per test
    const allAttempts = await loadUserAttemptsFromStore(req.user?.uid);

    allTests.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total = allTests.length;
    const startIndex = (page - 1) * limit;
    const paginated = allTests.slice(startIndex, startIndex + limit).map((t) => {
      const userTestAttempts = allAttempts.filter((a) => a.testId === t.id);
      let bestScore: number | undefined = undefined;
      let latestScore: number | undefined = undefined;

      const validScores = userTestAttempts
        .map((a) => (typeof a.score === 'number' && !isNaN(a.score) ? a.score : Number(a.score)))
        .filter((s) => typeof s === 'number' && !isNaN(s));

      if (validScores.length > 0) {
        bestScore = Math.max(...validScores);
        latestScore = validScores[validScores.length - 1];
      }

      // Aggregate exams and years found in this quiz
      const examSet = new Set<string>();
      const yearSet = new Set<string>();
      if (t.examName?.trim()) examSet.add(t.examName.trim());
      if (t.year?.trim()) yearSet.add(t.year.trim());

      if (Array.isArray(t.questions)) {
        for (const q of t.questions) {
          if (q.examName?.trim()) {
            q.examName.split(',').forEach((e: string) => {
              const clean = e.trim().replace(/^[\(\[]|[\)\]]$/g, '');
              if (clean) examSet.add(clean);
            });
          }
          if (q.year?.trim()) {
            const matches = q.year.match(/\b(19\d{2}|20\d{2})\b/g);
            if (matches) {
              matches.forEach((y: string) => yearSet.add(y));
            } else {
              yearSet.add(q.year.trim());
            }
          }
        }
      }

      const examNamesFound = Array.from(examSet).filter(Boolean);
      const sortedYears = Array.from(yearSet).filter(Boolean).sort();
      const examDisplay = examNamesFound.join(', ') || t.examName || '';
      let yearDisplay = t.year || '';
      if (sortedYears.length > 1) {
        yearDisplay = `${sortedYears[0]}-${sortedYears[sortedYears.length - 1]}`;
      } else if (sortedYears.length === 1) {
        yearDisplay = sortedYears[0];
      }

      return {
        id: t.id,
        title: t.title,
        createdAt: t.createdAt,
        status: t.status || 'published',
        authorEmail: t.authorEmail,
        language: t.language,
        difficulty: t.difficulty,
        questionCount: t.questionCount || (t.questions ? t.questions.length : 10),
        durationMinutes: t.durationMinutes || 10,
        markingCorrect: t.markingCorrect ?? 1.0,
        markingWrong: t.markingWrong ?? 0.25,
        sourcePageCount: t.sourcePageCount || 1,
        examName: examDisplay,
        year: yearDisplay,
        examNamesFound,
        yearsFound: sortedYears,
        bestScore,
        latestScore,
      };
    });

    return res.json({
      success: true,
      tests: paginated,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to list tests',
    });
  }
});

// GET /api/tests/:id: Authenticated users.
// Rule 13: Normal users can only view published tests.
app.get('/api/tests/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    let foundTest: any = null;

    if (firestoreDb) {
      try {
        const doc = await firestoreDb.collection('tests').doc(id).get();
        if (doc.exists) {
          foundTest = doc.data();
        } else {
          const customDoc = await firestoreDb.collection('customTests').doc(id).get();
          if (customDoc.exists) {
            foundTest = customDoc.data();
          }
        }
      } catch (err) {
        handleFirestoreError(err, 'fetch test by id');
      }
    }

    if (!foundTest) {
      const localTests = readJsonFile<any>(LOCAL_TESTS_FILE);
      foundTest = localTests.find((t) => t.id === id);
    }
    if (!foundTest) {
      const localCustomTests = readJsonFile<any>(LOCAL_CUSTOM_TESTS_FILE);
      foundTest = localCustomTests.find((t) => t.id === id);
    }

    if (!foundTest) {
      return res.status(404).json({
        success: false,
        error: `Test '${id}' not found.`,
      });
    }

    if (
      isCustomTestDoc(foundTest) &&
      foundTest.ownerUid &&
      foundTest.ownerUid !== req.user?.uid &&
      !req.user?.isAdmin
    ) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to another user’s custom practice test.',
      });
    }

    if (foundTest.status === 'draft' && !req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'This test is currently a draft and has not been published yet.',
      });
    }

    // Requirement 15: In mock mode, omit correctOption/explanation for non-admins.
    // In Study Mode (?mode=study), preserve answers & explanations for student self-practice.
    // Always preserve bilingual, passage, image, and subject/chapter/exam metadata.
    const isStudyMode = String(req.query.mode || '').toLowerCase() === 'study';
    if (!req.user?.isAdmin) {
      const sanitizedQuestions = (foundTest.questions || []).map((q: any, idx: number) => ({
        id: q.id ?? idx + 1,
        question: q.question,
        options: q.options,
        type: q.type,
        sourcePages: q.sourcePages,
        examName: q.examName || foundTest.examName || '',
        year: q.year || foundTest.year || '',
        ...(q.questionHindi ? { questionHindi: q.questionHindi } : {}),
        ...(q.questionEnglish ? { questionEnglish: q.questionEnglish } : {}),
        ...(q.optionsHindi ? { optionsHindi: q.optionsHindi } : {}),
        ...(q.optionsEnglish ? { optionsEnglish: q.optionsEnglish } : {}),
        ...(q.passage ? { passage: q.passage } : {}),
        ...(q.data || q.passageData ? { data: q.data || q.passageData } : {}),
        ...(q.passageImage ? { passageImage: q.passageImage } : {}),
        ...(q.subject ? { subject: q.subject } : {}),
        ...(q.chapter ? { chapter: q.chapter } : {}),
        ...(Array.isArray(q.examTags) && q.examTags.length > 0 ? { examTags: q.examTags } : {}),
        ...(q.stage ? { stage: q.stage } : {}),
        ...(isStudyMode
          ? {
              correctOption: q.correctOption || '',
              explanation: q.explanation || '',
            }
          : {}),
      }));

      return res.json({
        success: true,
        test: {
          ...foundTest,
          questions: sanitizedQuestions,
        },
      });
    }

    return res.json({
      success: true,
      test: foundTest,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch test details',
    });
  }
});

// DELETE /api/tests/:id: Admin Only
app.delete('/api/tests/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (firestoreDb) {
      try {
        await firestoreDb.collection('tests').doc(id).delete();
      } catch (err) {
        handleFirestoreError(err, 'delete test');
      }
    }

    const localTests = readJsonFile<any>(LOCAL_TESTS_FILE);
    const updated = localTests.filter((t) => t.id !== id);
    writeJsonFile(LOCAL_TESTS_FILE, updated);
    invalidateBrowseSummaryCache();

    return res.json({
      success: true,
      message: `Test '${id}' deleted successfully.`,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete test',
    });
  }
});

// -------------------------------------------------------------
// Attempts Endpoints (User Tests Tracking)
// -------------------------------------------------------------
const maskCandidateDisplayName = (rawName?: string, rawEmail?: string, indexFallback?: number): string => {
  const cleanedName = (rawName || '').trim();
  if (cleanedName && !cleanedName.includes('@')) {
    return cleanedName;
  }
  const emailLocal = ((rawEmail || cleanedName).split('@')[0] || '').trim();
  if (emailLocal.length >= 3) {
    return `${emailLocal.slice(0, 3)}***`;
  }
  if (emailLocal.length > 0) {
    return `${emailLocal[0]}***`;
  }
  return `Candidate #${indexFallback || 1}`;
};

async function computeTestLeaderboard(testId: string, currentUserUid: string) {
  if (!testId || testId === 'custom-test' || testId === 'custom-json') {
    return null;
  }

  let testAttempts: any[] = [];
  if (firestoreDb) {
    try {
      const snap = await firestoreDb
        .collection('attempts')
        .where('testId', '==', testId)
        .get();
      testAttempts = snap.docs.map((d: any) => d.data());
    } catch (err) {
      handleFirestoreError(err, 'compute leaderboard attempts');
    }
  }
  if (testAttempts.length === 0) {
    testAttempts = readJsonFile<any>(LOCAL_ATTEMPTS_FILE).filter((a) => a.testId === testId);
  }

  if (testAttempts.length === 0) {
    return {
      testId,
      totalParticipants: 0,
      topScore: 0,
      averageScore: 0,
      currentUserRank: null,
      currentUserPercentile: null,
      currentUserBestScore: null,
      topEntries: [],
    };
  }

  // Keep best attempt per user (highest score -> lowest timeTakenSeconds -> earliest attempt)
  const bestByUser = new Map<string, any>();
  for (const att of testAttempts) {
    const uid = att.userId || att.userEmail || att.id;
    const prev = bestByUser.get(uid);
    if (!prev) {
      bestByUser.set(uid, att);
      continue;
    }
    const prevScore = Number(prev.score) || 0;
    const nextScore = Number(att.score) || 0;
    const prevTime = Number(prev.timeTakenSeconds) || 999999;
    const nextTime = Number(att.timeTakenSeconds) || 999999;
    if (
      nextScore > prevScore ||
      (nextScore === prevScore && nextTime < prevTime) ||
      (nextScore === prevScore && nextTime === prevTime && new Date(att.createdAt).getTime() < new Date(prev.createdAt).getTime())
    ) {
      bestByUser.set(uid, att);
    }
  }

  const ranked = Array.from(bestByUser.values()).sort((a, b) => {
    const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const timeDiff = (Number(a.timeTakenSeconds) || 999999) - (Number(b.timeTakenSeconds) || 999999);
    if (timeDiff !== 0) return timeDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Resolve display names safely without leaking emails
  const userMap = new Map<string, { displayName?: string }>();
  const localUsers = readJsonFile<any>(LOCAL_USERS_FILE);
  localUsers.forEach((u) => {
    if (u.uid) userMap.set(u.uid, { displayName: u.displayName });
  });
  if (firestoreDb) {
    const db = firestoreDb;
    try {
      const topUids = Array.from(
        new Set(ranked.slice(0, 15).map((r) => r.userId).filter(Boolean))
      ) as string[];
      if (topUids.length > 0) {
        const userDocs = await Promise.all(
          topUids.map((uid) => db.collection('users').doc(uid).get().catch(() => null))
        );
        userDocs.forEach((d: any) => {
          if (d && d.exists) {
            const uData = d.data();
            if (uData?.uid) userMap.set(uData.uid, { displayName: uData.displayName });
          }
        });
      }
    } catch {}
  }

  const totalParticipants = ranked.length;
  const topScore = Number(ranked[0]?.score ?? 0);
  const averageScore =
    Math.round(
      (ranked.reduce((sum, r) => sum + (Number(r.score) || 0), 0) / totalParticipants) * 100
    ) / 100;

  let currentUserRank: number | null = null;
  let currentUserBestScore: number | null = null;

  const topEntries = ranked.slice(0, 10).map((r, idx) => {
    const rank = idx + 1;
    const isCurrentUser = r.userId === currentUserUid;
    const profileName = r.userId ? userMap.get(r.userId)?.displayName : undefined;
    return {
      rank,
      displayName: isCurrentUser
        ? (profileName && !profileName.includes('@') ? `${profileName} (You)` : 'You')
        : maskCandidateDisplayName(profileName, r.userEmail, rank),
      score: Math.round((Number(r.score) || 0) * 100) / 100,
      maxScore: Math.round((Number(r.maxScore) || 0) * 100) / 100,
      accuracy: Math.round(Number(r.accuracy) || 0),
      timeTakenSeconds: Number(r.timeTakenSeconds) || 0,
      isCurrentUser,
    };
  });

  const userIndex = ranked.findIndex((r) => r.userId === currentUserUid);
  if (userIndex >= 0) {
    currentUserRank = userIndex + 1;
    currentUserBestScore = Math.round((Number(ranked[userIndex].score) || 0) * 100) / 100;
  }

  const currentUserPercentile =
    currentUserRank === null
      ? null
      : totalParticipants <= 1
      ? 100
      : Math.round(((totalParticipants - currentUserRank) / (totalParticipants - 1)) * 1000) / 10;

  return {
    testId,
    totalParticipants,
    topScore: Math.round(topScore * 100) / 100,
    averageScore,
    currentUserRank,
    currentUserPercentile,
    currentUserBestScore,
    topEntries,
  };
}

const recentSubmissionCache = new Map<
  string,
  { attempt: any; leaderboard: any; savedAt: number }
>();

// POST /api/attempts: Authoritative evaluation & saving of user test attempt
app.post('/api/attempts', authenticateUser, rateLimitByUser('attempts', 30), async (req, res) => {
  try {
    const body = req.body || {};
    const testId = sanitizeText(body.testId);
    const submissionKey = body.submissionKey
      ? sanitizeText(body.submissionKey).slice(0, 120)
      : '';

    if (submissionKey) {
      const compositeKey = `${req.user!.uid}::${submissionKey}`;
      const cached = recentSubmissionCache.get(compositeKey);
      if (cached && Date.now() - cached.savedAt < 15 * 60 * 1000) {
        return res.json({
          success: true,
          attemptId: cached.attempt.id,
          attempt: cached.attempt,
          leaderboard: cached.leaderboard,
          deduplicated: true,
        });
      }

      if (firestoreDb) {
        try {
          const existingSnap = await firestoreDb
            .collection('attempts')
            .where('userId', '==', req.user!.uid)
            .where('submissionKey', '==', submissionKey)
            .limit(1)
            .get();
          if (!existingSnap.empty) {
            const existingAttempt = existingSnap.docs[0].data();
            const leaderboard = await computeTestLeaderboard(testId, req.user!.uid).catch(() => null);
            recentSubmissionCache.set(compositeKey, {
              attempt: existingAttempt,
              leaderboard,
              savedAt: Date.now(),
            });
            return res.json({
              success: true,
              attemptId: existingAttempt.id,
              attempt: existingAttempt,
              leaderboard,
              deduplicated: true,
            });
          }
        } catch (err) {
          handleFirestoreError(err, 'check submission idempotency');
        }
      }

      const localExisting = readJsonFile<any>(LOCAL_ATTEMPTS_FILE).find(
        (a) => a.userId === req.user!.uid && a.submissionKey === submissionKey
      );
      if (localExisting) {
        const leaderboard = await computeTestLeaderboard(testId, req.user!.uid).catch(() => null);
        return res.json({
          success: true,
          attemptId: localExisting.id,
          attempt: localExisting,
          leaderboard,
          deduplicated: true,
        });
      }
    }

    // Fetch authoritative test document from DB (standard tests or customTests)
    let testDoc: any = null;
    if (firestoreDb && testId) {
      try {
        const doc = await firestoreDb.collection('tests').doc(testId).get();
        if (doc.exists) {
          testDoc = doc.data();
        } else {
          const customDoc = await firestoreDb.collection('customTests').doc(testId).get();
          if (customDoc.exists) testDoc = customDoc.data();
        }
      } catch (err) {
        handleFirestoreError(err, 'fetch test for attempt evaluation');
      }
    }
    if (!testDoc && testId) {
      const localTests = readJsonFile<any>(LOCAL_TESTS_FILE);
      testDoc = localTests.find((t) => t.id === testId);
    }
    if (!testDoc && testId) {
      const localCustomTests = readJsonFile<any>(LOCAL_CUSTOM_TESTS_FILE);
      testDoc = localCustomTests.find((t) => t.id === testId);
    }

    const attemptId = `att_${crypto.randomBytes(8).toString('hex')}`;
    const createdAt = new Date().toISOString();

    let correct = 0;
    let incorrect = 0;
    let unattempted = 0;
    let questionsData: any[] = [];

    const fullQuestions = testDoc?.questions || [];
    const clientQuestionsData = Array.isArray(body.questionsData) ? body.questionsData : [];

    if (fullQuestions.length > 0) {
      questionsData = fullQuestions.map((q: any, idx: number) => {
        const clientQ = clientQuestionsData[idx] || {};
        const clientChoice = clientQ.selectedOption || null;
        const correctOpt = q.correctOption || '';
        const isCorrect = Boolean(clientChoice && clientChoice === correctOpt);

        if (!clientChoice) unattempted++;
        else if (isCorrect) correct++;
        else incorrect++;

        const explicitSubject = normalizeLabel(q.subject || testDoc?.subject || clientQ.subject);
        const explicitChapter = normalizeLabel(q.chapter || testDoc?.chapter || clientQ.chapter);
        const inferred =
          !explicitSubject || !explicitChapter
            ? inferSubjectAndChapter(q.question || '', testDoc?.title || '')
            : { subject: '', chapter: '' };
        const resolvedSubject = explicitSubject || normalizeLabel(inferred.subject) || 'General Studies';
        const resolvedChapter =
          explicitChapter ||
          (normalizeLabel(inferred.chapter).toLowerCase() !== 'general knowledge & current perspectives'
            ? normalizeLabel(inferred.chapter)
            : 'Uncategorized');

        const examTags = Array.isArray(q.examTags) && q.examTags.length > 0
          ? q.examTags
          : Array.isArray(clientQ.examTags) && clientQ.examTags.length > 0
            ? clientQ.examTags
            : Array.isArray(testDoc?.examTags) && testDoc.examTags.length > 0
              ? testDoc.examTags
              : undefined;

        return {
          id: idx + 1,
          question: q.question,
          ...(q.questionHindi ? { questionHindi: q.questionHindi } : {}),
          ...(q.questionEnglish ? { questionEnglish: q.questionEnglish } : {}),
          ...(q.optionsHindi ? { optionsHindi: q.optionsHindi } : {}),
          ...(q.optionsEnglish ? { optionsEnglish: q.optionsEnglish } : {}),
          type: q.type || 'factual',
          options: q.options,
          selectedOption: clientChoice,
          correctOption: correctOpt,
          isCorrect,
          explanation: q.explanation || '',
          timeSpentSeconds: Number(clientQ.timeSpentSeconds) || 0,
          isMarkedForReview: Boolean(clientQ.isMarkedForReview),
          examName: q.examName || testDoc?.examName || clientQ.examName || '',
          year: q.year || testDoc?.year || clientQ.year || '',
          subject: resolvedSubject,
          chapter: resolvedChapter,
          ...(examTags ? { examTags } : {}),
          ...(q.stage || clientQ.stage ? { stage: q.stage || clientQ.stage } : {}),
        };
      });
    } else {
      questionsData = clientQuestionsData;
      correct = Number(body.correct) || 0;
      incorrect = Number(body.incorrect) || 0;
      unattempted = Number(body.unattempted) || 0;
    }

    const pos = testDoc?.markingCorrect ?? Number(body.markingCorrect) ?? 1.0;
    const neg = testDoc?.markingWrong ?? Number(body.markingWrong) ?? 0.25;
    const rawScore = correct * pos - incorrect * neg;
    const score = Math.round(rawScore * 100) / 100;
    const maxScore = (questionsData.length || 10) * pos;
    const totalAttempted = correct + incorrect;
    const accuracy = totalAttempted > 0 ? Math.round((correct / totalAttempted) * 100) : 0;

    const attemptDoc: any = {
      id: attemptId,
      userId: req.user!.uid,
      userEmail: req.user!.email,
      testId,
      testTitle: sanitizeText(body.testTitle || testDoc?.title || 'Mock Test'),
      score,
      maxScore,
      correct,
      incorrect,
      unattempted,
      accuracy,
      timeTakenSeconds: Number(body.timeTakenSeconds) || 0,
      createdAt,
      ...(submissionKey ? { submissionKey } : {}),
      questionsData,
    };

    if (firestoreDb) {
      try {
        await firestoreDb.collection('attempts').doc(attemptId).set(attemptDoc);
        firestoreDb.collection('user_progress').doc(req.user!.uid).delete().catch(() => {});
      } catch (err) {
        handleFirestoreError(err, 'save attempt');
      }
    }

    const localAttempts = readJsonFile<any>(LOCAL_ATTEMPTS_FILE);
    localAttempts.unshift(attemptDoc);
    writeJsonFile(LOCAL_ATTEMPTS_FILE, localAttempts);

    const localProgress = readJsonFile<any>(LOCAL_ACTIVE_PROGRESS_FILE);
    const filteredProgress = localProgress.filter((p) => p.uid !== req.user!.uid);
    if (filteredProgress.length !== localProgress.length) {
      writeJsonFile(LOCAL_ACTIVE_PROGRESS_FILE, filteredProgress);
    }

    const leaderboard = await computeTestLeaderboard(testId, req.user!.uid).catch(() => null);

    if (submissionKey) {
      const compositeKey = `${req.user!.uid}::${submissionKey}`;
      if (recentSubmissionCache.size >= 500) {
        const oldestKey = recentSubmissionCache.keys().next().value;
        if (oldestKey) recentSubmissionCache.delete(oldestKey);
      }
      recentSubmissionCache.set(compositeKey, {
        attempt: attemptDoc,
        leaderboard,
        savedAt: Date.now(),
      });
    }

    return res.json({
      success: true,
      attemptId,
      attempt: attemptDoc,
      leaderboard,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/tests/:id/leaderboard: Live rank, percentile & top 10 performers for a test
app.get('/api/tests/:id/leaderboard', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const leaderboard = await computeTestLeaderboard(id, req.user!.uid);
    if (!leaderboard) {
      return res.status(404).json({ success: false, error: 'Leaderboard not available for this test.' });
    }
    return res.json({
      success: true,
      leaderboard,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/attempts/me: User's own attempt history
app.get('/api/attempts/me', authenticateUser, async (req, res) => {
  try {
    let attempts: any[] = [];

    if (firestoreDb) {
      try {
        const snapshot = await firestoreDb
          .collection('attempts')
          .where('userId', '==', req.user!.uid)
          .get();
        attempts = snapshot.docs.map((doc: any) => doc.data());
      } catch (err) {
        handleFirestoreError(err, 'list attempts me');
        attempts = readJsonFile<any>(LOCAL_ATTEMPTS_FILE).filter(
          (a) => a.userId === req.user!.uid
        );
      }
    } else {
      attempts = readJsonFile<any>(LOCAL_ATTEMPTS_FILE).filter(
        (a) => a.userId === req.user!.uid
      );
    }

    attempts.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return res.json({
      success: true,
      attempts,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/attempts/:id: Full attempt details (owner or admin)
app.get('/api/attempts/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    let attempt: any = null;

    if (firestoreDb) {
      try {
        const doc = await firestoreDb.collection('attempts').doc(id).get();
        if (doc.exists) attempt = doc.data();
      } catch (err) {
        handleFirestoreError(err, 'fetch attempt by id');
      }
    }

    if (!attempt) {
      const local = readJsonFile<any>(LOCAL_ATTEMPTS_FILE);
      attempt = local.find((a) => a.id === id);
    }

    if (!attempt) {
      return res.status(404).json({ success: false, error: 'Attempt not found' });
    }

    // Role check: users can only read their own attempts; admin can read all
    if (attempt.userId !== req.user!.uid && !req.user!.isAdmin) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    return res.json({ success: true, attempt });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Admin Overview (Admin Only)
// -------------------------------------------------------------
app.get('/api/admin/overview', authenticateUser, requireAdmin, async (_req, res) => {
  try {
    let allUsers: any[] = [];
    let allAttempts: any[] = [];
    let allTests: any[] = [];

    if (firestoreDb) {
      try {
        const [uSnap, aSnap, tSnap] = await Promise.all([
          firestoreDb.collection('users').get(),
          firestoreDb.collection('attempts').get(),
          firestoreDb.collection('tests').get(),
        ]);
        allUsers = uSnap.docs.map((d: any) => d.data());
        allAttempts = aSnap.docs.map((d: any) => d.data());
        allTests = tSnap.docs.map((d: any) => d.data());
      } catch (err) {
        handleFirestoreError(err, 'admin overview');
        allUsers = readJsonFile<any>(LOCAL_USERS_FILE);
        allAttempts = readJsonFile<any>(LOCAL_ATTEMPTS_FILE);
        allTests = readJsonFile<any>(LOCAL_TESTS_FILE);
      }
    } else {
      allUsers = readJsonFile<any>(LOCAL_USERS_FILE);
      allAttempts = readJsonFile<any>(LOCAL_ATTEMPTS_FILE);
      allTests = readJsonFile<any>(LOCAL_TESTS_FILE);
    }

    const perTestStats = allTests
      .filter((t) => !isCustomTestDoc(t))
      .map((t) => {
      const testAttempts = allAttempts.filter((a) => a.testId === t.id);
      const attemptCount = testAttempts.length;
      const averageScore =
        attemptCount > 0
          ? Math.round(
              (testAttempts.reduce((acc, cur) => acc + (cur.score || 0), 0) / attemptCount) * 10
            ) / 10
          : 0;
      const averageAccuracy =
        attemptCount > 0
          ? Math.round(
              (testAttempts.reduce((acc, cur) => acc + (cur.accuracy || 0), 0) / attemptCount) * 10
            ) / 10
          : 0;

      return {
        testId: t.id,
        title: t.title,
        attemptCount,
        averageScore,
        averageAccuracy,
      };
    });

    return res.json({
      success: true,
      overview: {
        totalUsers: Math.max(allUsers.length, 1),
        totalAttempts: allAttempts.length,
        perTestStats,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Bookmarks API Endpoints
// -------------------------------------------------------------
app.get('/api/bookmarks/me', authenticateUser, async (req, res) => {
  try {
    let bookmarks: any[] = [];
    if (firestoreDb) {
      try {
        const snap = await firestoreDb
          .collection('bookmarks')
          .where('userId', '==', req.user!.uid)
          .get();
        bookmarks = snap.docs.map((d: any) => d.data());
      } catch (err) {
        handleFirestoreError(err, 'list bookmarks');
        bookmarks = readJsonFile<any>(LOCAL_BOOKMARKS_FILE).filter(
          (b) => b.userId === req.user!.uid
        );
      }
    } else {
      bookmarks = readJsonFile<any>(LOCAL_BOOKMARKS_FILE).filter(
        (b) => b.userId === req.user!.uid
      );
    }
    bookmarks.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return res.json({ success: true, bookmarks });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bookmarks', authenticateUser, async (req, res) => {
  try {
    const { testId, testTitle, questionNumber, question } = req.body;
    if (!question || !question.question) {
      return res.status(400).json({ success: false, error: 'Question data required' });
    }
    const bookmarkId = `bm_${req.user!.uid}_${testId || 'q'}_${questionNumber || Date.now()}`;
    const bookmarkDoc = {
      id: bookmarkId,
      userId: req.user!.uid,
      testId: testId || 'custom-test',
      testTitle: testTitle || 'MCQ Practice',
      questionNumber: questionNumber || 1,
      question,
      createdAt: new Date().toISOString(),
    };

    if (firestoreDb) {
      try {
        await firestoreDb.collection('bookmarks').doc(bookmarkId).set(bookmarkDoc);
      } catch (err) {
        handleFirestoreError(err, 'save bookmark');
      }
    }

    const localBookmarks = readJsonFile<any>(LOCAL_BOOKMARKS_FILE);
    const existingIndex = localBookmarks.findIndex((b) => b.id === bookmarkId);
    if (existingIndex >= 0) {
      localBookmarks[existingIndex] = bookmarkDoc;
    } else {
      localBookmarks.unshift(bookmarkDoc);
    }
    writeJsonFile(LOCAL_BOOKMARKS_FILE, localBookmarks);

    return res.json({ success: true, bookmark: bookmarkDoc });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/bookmarks/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    let existingDoc: any = null;

    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection('bookmarks').doc(id).get();
        if (snap.exists) {
          existingDoc = snap.data();
        }
      } catch (err) {
        handleFirestoreError(err, 'read bookmark for ownership check');
      }
    }

    const localBookmarks = readJsonFile<any>(LOCAL_BOOKMARKS_FILE);
    if (!existingDoc) {
      existingDoc = localBookmarks.find((b) => b.id === id) || null;
    }

    if (!existingDoc) {
      return res.status(404).json({ success: false, error: 'Bookmark not found.' });
    }

    if (existingDoc.userId && existingDoc.userId !== req.user!.uid && !req.user!.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: you can only remove your own bookmarks.',
      });
    }

    if (firestoreDb) {
      try {
        await firestoreDb.collection('bookmarks').doc(id).delete();
      } catch (err) {
        handleFirestoreError(err, 'delete bookmark');
      }
    }

    const updated = localBookmarks.filter((b) => b.id !== id);
    if (updated.length !== localBookmarks.length) {
      writeJsonFile(LOCAL_BOOKMARKS_FILE, updated);
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Cross-Device Active Test Progress Sync Endpoints
// -------------------------------------------------------------
app.get('/api/progress/active', authenticateUser, async (req, res) => {
  try {
    let progress: any = null;
    if (firestoreDb) {
      try {
        const doc = await firestoreDb.collection('user_progress').doc(req.user!.uid).get();
        if (doc.exists) {
          progress = doc.data();
        }
      } catch (err) {
        handleFirestoreError(err, 'fetch active test progress');
      }
    }
    if (!progress) {
      const localList = readJsonFile<any>(LOCAL_ACTIVE_PROGRESS_FILE);
      progress = localList.find((p) => p.uid === req.user!.uid) || null;
    }
    return res.json({ success: true, progress });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/progress/active', authenticateUser, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.testTitle && !body.testId) {
      return res.status(400).json({ success: false, error: 'Active progress metadata is required.' });
    }
    const progressDoc = {
      uid: req.user!.uid,
      testId: body.testId ? String(body.testId) : undefined,
      testTitle: String(body.testTitle || 'Mock Test'),
      currentIndex: Number(body.currentIndex) || 0,
      answeredCount: Number(body.answeredCount) || 0,
      totalCount: Number(body.totalCount) || 0,
      secondsRemaining:
        typeof body.secondsRemaining === 'number' ? Math.max(0, Math.round(body.secondsRemaining)) : undefined,
      questionStates: Array.isArray(body.questionStates) ? body.questionStates : undefined,
      eliminatedOptions:
        body.eliminatedOptions && typeof body.eliminatedOptions === 'object' ? body.eliminatedOptions : undefined,
      updatedAt: body.updatedAt ? String(body.updatedAt) : new Date().toISOString(),
    };

    if (firestoreDb) {
      try {
        await firestoreDb.collection('user_progress').doc(req.user!.uid).set(progressDoc);
      } catch (err) {
        handleFirestoreError(err, 'save active test progress');
      }
    }

    const localList = readJsonFile<any>(LOCAL_ACTIVE_PROGRESS_FILE).filter(
      (p) => p.uid !== req.user!.uid
    );
    localList.unshift(progressDoc);
    writeJsonFile(LOCAL_ACTIVE_PROGRESS_FILE, localList);

    return res.json({ success: true, progress: progressDoc });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/progress/active', authenticateUser, async (req, res) => {
  try {
    if (firestoreDb) {
      try {
        await firestoreDb.collection('user_progress').doc(req.user!.uid).delete();
      } catch (err) {
        handleFirestoreError(err, 'delete active test progress');
      }
    }
    const localList = readJsonFile<any>(LOCAL_ACTIVE_PROGRESS_FILE);
    const updated = localList.filter((p) => p.uid !== req.user!.uid);
    if (updated.length !== localList.length) {
      writeJsonFile(LOCAL_ACTIVE_PROGRESS_FILE, updated);
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Question Reports API Endpoints
// -------------------------------------------------------------
app.post('/api/reports', authenticateUser, rateLimitByUser('reports', 20), async (req, res) => {
  try {
    const { testId, testTitle, questionNumber, questionText, reason, comment } = req.body;
    if (!reason || !questionText) {
      return res.status(400).json({ success: false, error: 'Reason and question details are required' });
    }
    const reportId = `rep_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const reportDoc = {
      id: reportId,
      userId: req.user!.uid,
      userEmail: req.user!.email,
      testId: testId || 'custom-test',
      testTitle: testTitle || 'MCQ Practice',
      questionNumber: questionNumber || 1,
      questionText: String(questionText),
      reason: String(reason),
      comment: comment ? String(comment).slice(0, 500) : '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    if (firestoreDb) {
      try {
        await firestoreDb.collection('reports').doc(reportId).set(reportDoc);
      } catch (err) {
        handleFirestoreError(err, 'save report');
      }
    }

    const localReports = readJsonFile<any>(LOCAL_REPORTS_FILE);
    localReports.unshift(reportDoc);
    writeJsonFile(LOCAL_REPORTS_FILE, localReports);

    return res.json({ success: true, report: reportDoc });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/reports', authenticateUser, requireAdmin, async (_req, res) => {
  try {
    let reports: any[] = [];
    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection('reports').get();
        reports = snap.docs.map((d: any) => d.data());
      } catch (err) {
        handleFirestoreError(err, 'list reports');
        reports = readJsonFile<any>(LOCAL_REPORTS_FILE);
      }
    } else {
      reports = readJsonFile<any>(LOCAL_REPORTS_FILE);
    }
    reports.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return res.json({ success: true, reports });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/reports/:id/resolve', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (firestoreDb) {
      try {
        await firestoreDb.collection('reports').doc(id).update({
          status: 'resolved',
          resolvedAt: new Date().toISOString(),
          resolvedBy: req.user?.email || 'admin',
        });
      } catch (err) {
        handleFirestoreError(err, 'resolve report');
      }
    }
    const localReports = readJsonFile<any>(LOCAL_REPORTS_FILE);
    const report = localReports.find((r) => r.id === id);
    if (report) {
      report.status = 'resolved';
      report.resolvedAt = new Date().toISOString();
      report.resolvedBy = req.user?.email || 'admin';
      writeJsonFile(LOCAL_REPORTS_FILE, localReports);
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Helper: Locate a test document + target question index from a QuestionReport
async function locateTestAndQuestionForReport(report: any): Promise<{
  testDoc: any | null;
  questionIndex: number;
  sourceCollection: 'tests' | 'customTests' | null;
}> {
  let testDoc: any = null;
  let sourceCollection: 'tests' | 'customTests' | null = null;
  const candidateTestId =
    report?.testId && report.testId !== 'custom-test' && report.testId !== 'custom-json'
      ? String(report.testId)
      : '';

  if (firestoreDb && candidateTestId) {
    try {
      const snap = await firestoreDb.collection('tests').doc(candidateTestId).get();
      if (snap.exists) {
        testDoc = snap.data();
        sourceCollection = 'tests';
      } else {
        const customSnap = await firestoreDb.collection('customTests').doc(candidateTestId).get();
        if (customSnap.exists) {
          testDoc = customSnap.data();
          sourceCollection = 'customTests';
        }
      }
    } catch (err) {
      handleFirestoreError(err, 'locate test for report');
    }
  }

  if (!testDoc && candidateTestId) {
    const localTests = readJsonFile<any>(LOCAL_TESTS_FILE);
    const found = localTests.find((t) => t.id === candidateTestId);
    if (found) {
      testDoc = found;
      sourceCollection = 'tests';
    }
  }
  if (!testDoc && candidateTestId) {
    const localCustom = readJsonFile<any>(LOCAL_CUSTOM_TESTS_FILE);
    const found = localCustom.find((t) => t.id === candidateTestId);
    if (found) {
      testDoc = found;
      sourceCollection = 'customTests';
    }
  }

  // Fallback match by title + question snippet
  if (!testDoc && report?.testTitle) {
    const { tests } = await loadPublishedTestsFromStore(true);
    const titleLower = normalizeLabel(report.testTitle).toLowerCase();
    const found = tests.find((t) => normalizeLabel(t.title).toLowerCase() === titleLower);
    if (found) {
      testDoc = found;
      sourceCollection = 'tests';
    }
  }

  if (!testDoc || !Array.isArray(testDoc.questions)) {
    return { testDoc: null, questionIndex: -1, sourceCollection: null };
  }

  let questionIndex = (Number(report?.questionNumber) || 1) - 1;
  const reportSnippet = normalizeLabel(report?.questionText).slice(0, 80).toLowerCase();
  const atIndex = testDoc.questions[questionIndex];
  if (
    !atIndex ||
    (reportSnippet && !normalizeLabel(atIndex.question).toLowerCase().includes(reportSnippet))
  ) {
    const matchedIdx = testDoc.questions.findIndex((q: any) =>
      reportSnippet && normalizeLabel(q?.question).toLowerCase().includes(reportSnippet)
    );
    if (matchedIdx >= 0) {
      questionIndex = matchedIdx;
    } else if (questionIndex < 0 || questionIndex >= testDoc.questions.length) {
      questionIndex = -1;
    }
  }

  return { testDoc, questionIndex, sourceCollection };
}

// GET /api/admin/reports/:id/question: Load original question inside its test for admin editing
app.get('/api/admin/reports/:id/question', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let report: any = null;

    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection('reports').doc(id).get();
        if (snap.exists) report = snap.data();
      } catch (err) {
        handleFirestoreError(err, 'read report for edit');
      }
    }
    if (!report) {
      report = readJsonFile<any>(LOCAL_REPORTS_FILE).find((r) => r.id === id) || null;
    }
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found.' });
    }

    const { testDoc, questionIndex, sourceCollection } = await locateTestAndQuestionForReport(report);
    if (!testDoc || questionIndex < 0 || !testDoc.questions?.[questionIndex]) {
      return res.status(404).json({
        success: false,
        error: 'Could not locate the source test question in the catalog (it may have been deleted or came from an ad-hoc custom upload).',
      });
    }

    return res.json({
      success: true,
      report,
      testId: testDoc.id,
      testTitle: testDoc.title,
      sourceCollection,
      questionIndex,
      question: testDoc.questions[questionIndex],
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/admin/reports/:id/fix-and-resolve: Edit target test question, invalidate caches, and resolve report
app.patch('/api/admin/reports/:id/fix-and-resolve', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    let report: any = null;
    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection('reports').doc(id).get();
        if (snap.exists) report = snap.data();
      } catch (err) {
        handleFirestoreError(err, 'read report for fix-and-resolve');
      }
    }
    if (!report) {
      report = readJsonFile<any>(LOCAL_REPORTS_FILE).find((r) => r.id === id) || null;
    }
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found.' });
    }

    const { testDoc, questionIndex, sourceCollection } = await locateTestAndQuestionForReport(report);
    if (!testDoc || questionIndex < 0 || !testDoc.questions?.[questionIndex]) {
      return res.status(404).json({
        success: false,
        error: 'Source test question could not be found in the catalog.',
      });
    }

    const prevQ = testDoc.questions[questionIndex];
    const updatedQ = {
      ...prevQ,
      ...(typeof body.question === 'string' && body.question.trim()
        ? { question: sanitizeText(body.question) }
        : {}),
      ...(body.options && typeof body.options === 'object'
        ? {
            options: {
              A: sanitizeText(body.options.A ?? prevQ.options?.A ?? ''),
              B: sanitizeText(body.options.B ?? prevQ.options?.B ?? ''),
              C: sanitizeText(body.options.C ?? prevQ.options?.C ?? ''),
              D: sanitizeText(body.options.D ?? prevQ.options?.D ?? ''),
              ...(body.options.E || prevQ.options?.E
                ? { E: sanitizeText(body.options.E ?? prevQ.options?.E ?? '') }
                : {}),
            },
          }
        : {}),
      ...(body.correctOption && ['A', 'B', 'C', 'D', 'E'].includes(String(body.correctOption))
        ? { correctOption: String(body.correctOption) }
        : {}),
      ...(typeof body.explanation === 'string'
        ? { explanation: sanitizeText(body.explanation) }
        : {}),
      ...(typeof body.subject === 'string' && body.subject.trim()
        ? { subject: sanitizeText(body.subject) }
        : {}),
      ...(typeof body.chapter === 'string' && body.chapter.trim()
        ? { chapter: sanitizeText(body.chapter) }
        : {}),
    };

    const nextQuestions = [...testDoc.questions];
    nextQuestions[questionIndex] = updatedQ;
    const updatedTest = {
      ...testDoc,
      questions: nextQuestions,
      updatedAt: new Date().toISOString(),
    };

    const targetCollection = sourceCollection || 'tests';
    if (firestoreDb) {
      try {
        await firestoreDb
          .collection(targetCollection)
          .doc(updatedTest.id)
          .set(JSON.parse(JSON.stringify(updatedTest)), { merge: true });
      } catch (err) {
        handleFirestoreError(err, 'save fixed test question');
      }
    }

    const localTargetFile =
      targetCollection === 'customTests' ? LOCAL_CUSTOM_TESTS_FILE : LOCAL_TESTS_FILE;
    const localTests = readJsonFile<any>(localTargetFile);
    const tIdx = localTests.findIndex((t) => t.id === updatedTest.id);
    if (tIdx >= 0) {
      localTests[tIdx] = updatedTest;
      writeJsonFile(localTargetFile, localTests);
    }

    const resolutionUpdates = {
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolvedBy: req.user?.email || 'admin',
      resolutionNote: body.resolutionNote ? sanitizeText(body.resolutionNote).slice(0, 300) : 'Question updated by admin',
    };

    if (firestoreDb) {
      try {
        await firestoreDb.collection('reports').doc(id).update(resolutionUpdates);
      } catch (err) {
        handleFirestoreError(err, 'mark report resolved after fix');
      }
    }

    const localReports = readJsonFile<any>(LOCAL_REPORTS_FILE);
    const rIdx = localReports.findIndex((r) => r.id === id);
    if (rIdx >= 0) {
      localReports[rIdx] = { ...localReports[rIdx], ...resolutionUpdates };
      writeJsonFile(LOCAL_REPORTS_FILE, localReports);
    }

    if (targetCollection === 'tests') {
      invalidateBrowseSummaryCache();
    }

    return res.json({
      success: true,
      testId: updatedTest.id,
      questionIndex,
      updatedQuestion: updatedQ,
      report: { ...report, ...resolutionUpdates },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Exam Catalog & Aliases API Endpoints
// -------------------------------------------------------------
app.get('/api/exams', authenticateUser, async (req, res) => {
  try {
    const { exams } = await loadCatalogExamsAndAliasesFromStore();
    const { aggregate } = await getOrBuildBrowseAggregate();
    const countsById = new Map<string, { qCount: number; tCount: number }>();
    const countsByShort = new Map<string, { qCount: number; tCount: number }>();

    aggregate.exams.forEach((ex) => {
      countsById.set(ex.id, { qCount: ex.questionCount || 0, tCount: ex.testCount || 0 });
      countsByShort.set(normalizeLabel(ex.shortName).toLowerCase(), {
        qCount: ex.questionCount || 0,
        tCount: ex.testCount || 0,
      });
    });

    const enriched = exams.map((ex) => {
      const hit =
        countsById.get(ex.id) ||
        countsByShort.get(normalizeLabel(ex.shortName).toLowerCase());
      return {
        ...ex,
        questionCount: hit ? hit.qCount : 0,
        testCount: hit ? hit.tCount : 0,
      };
    });

    let result = enriched;
    if (!req.user?.isAdmin) {
      result = enriched.filter((ex) => ex.active && (ex.questionCount || 0) > 0);
    }

    result.sort((a, b) => a.order - b.order);
    return res.json({ success: true, exams: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/exams', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { name, shortName, categoryGroup, active, order } = req.body;
    if (!name || !shortName) {
      return res.status(400).json({ success: false, error: 'Name and shortName are required.' });
    }
    const id = shortName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const exams = readJsonFile<CatalogExam>(LOCAL_EXAMS_FILE);
    const existingIdx = exams.findIndex((e) => e.id === id || e.shortName.toLowerCase() === shortName.toLowerCase());
    const newExam: CatalogExam = {
      id,
      name: name.trim(),
      shortName: shortName.trim(),
      categoryGroup: (categoryGroup || 'Other').trim(),
      active: active !== undefined ? Boolean(active) : true,
      order: typeof order === 'number' ? order : exams.length + 1,
    };

    if (existingIdx >= 0) {
      exams[existingIdx] = newExam;
    } else {
      exams.push(newExam);
    }
    writeJsonFile(LOCAL_EXAMS_FILE, exams);

    if (firestoreDb) {
      try {
        await firestoreDb.collection('exams').doc(id).set(newExam, { merge: true });
      } catch (err) {
        handleFirestoreError(err, 'save exam');
      }
    }

    invalidateBrowseSummaryCache();

    return res.json({ success: true, exam: newExam });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/admin/exams/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const exams = readJsonFile<CatalogExam>(LOCAL_EXAMS_FILE);
    const idx = exams.findIndex((e) => e.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: `Exam '${id}' not found.` });
    }

    const current = exams[idx];
    const updated: CatalogExam = {
      ...current,
      name: req.body.name !== undefined ? req.body.name.trim() : current.name,
      shortName: req.body.shortName !== undefined ? req.body.shortName.trim() : current.shortName,
      categoryGroup: req.body.categoryGroup !== undefined ? req.body.categoryGroup.trim() : current.categoryGroup,
      active: req.body.active !== undefined ? Boolean(req.body.active) : current.active,
      order: req.body.order !== undefined ? Number(req.body.order) : current.order,
    };
    exams[idx] = updated;
    writeJsonFile(LOCAL_EXAMS_FILE, exams);

    if (firestoreDb) {
      try {
        await firestoreDb.collection('exams').doc(id).set(updated, { merge: true });
      } catch (err) {
        handleFirestoreError(err, 'update exam');
      }
    }

    invalidateBrowseSummaryCache();

    return res.json({ success: true, exam: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/exams/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const exams = readJsonFile<CatalogExam>(LOCAL_EXAMS_FILE).filter((e) => e.id !== id);
    writeJsonFile(LOCAL_EXAMS_FILE, exams);

    if (firestoreDb) {
      try {
        await firestoreDb.collection('exams').doc(id).delete();
      } catch (err) {
        handleFirestoreError(err, 'delete exam');
      }
    }

    invalidateBrowseSummaryCache();

    return res.json({ success: true, message: `Exam '${id}' removed.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/exam-aliases', authenticateUser, requireAdmin, async (_req, res) => {
  try {
    const aliases = readJsonFile<ExamAlias>(LOCAL_EXAM_ALIASES_FILE);
    return res.json({ success: true, aliases });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/exam-aliases', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { tag, examId, examName } = req.body;
    if (!tag || !examId || !examName) {
      return res.status(400).json({ success: false, error: 'Tag, examId and examName are required.' });
    }
    const aliases = readJsonFile<ExamAlias>(LOCAL_EXAM_ALIASES_FILE);
    const id = `alias_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const newAlias: ExamAlias = { id, tag: tag.trim(), examId, examName: examName.trim() };
    aliases.push(newAlias);
    writeJsonFile(LOCAL_EXAM_ALIASES_FILE, aliases);

    if (firestoreDb) {
      try {
        await firestoreDb.collection('exam_aliases').doc(id).set(newAlias);
      } catch (err) {
        handleFirestoreError(err, 'save alias');
      }
    }

    invalidateBrowseSummaryCache();

    return res.json({ success: true, alias: newAlias });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/exam-aliases/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const aliases = readJsonFile<ExamAlias>(LOCAL_EXAM_ALIASES_FILE).filter((a) => a.id !== id);
    writeJsonFile(LOCAL_EXAM_ALIASES_FILE, aliases);

    if (firestoreDb) {
      try {
        await firestoreDb.collection('exam_aliases').doc(id).delete();
      } catch (err) {
        handleFirestoreError(err, 'delete alias');
      }
    }

    invalidateBrowseSummaryCache();

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/unmapped-tags', authenticateUser, requireAdmin, async (_req, res) => {
  try {
    const { exams, aliases } = await loadCatalogExamsAndAliasesFromStore();
    const { tests } = await loadPublishedTestsFromStore(true);
    let questions = readJsonFile<QuestionMasterItem>(LOCAL_QUESTIONS_FILE);
    if (firestoreDb) {
      try {
        const qSnap = await firestoreDb.collection('questions').get();
        if (!qSnap.empty) {
          questions = qSnap.docs.map((d: any) => d.data() as QuestionMasterItem);
        }
      } catch (err) {
        handleFirestoreError(err, 'unmapped tags questions');
      }
    }

    const tagCounts = new Map<string, { count: number; sample: string }>();

    const checkTag = (rawTag: string, sample: string) => {
      if (!rawTag || !rawTag.trim()) return;
      rawTag.split(/[,;]+/).forEach((part) => {
        const clean = cleanRawExamTag(part);
        if (!isMeaningfulExamTag(clean)) return;
        const matched = matchExamTag(clean, aliases, exams);
        if (!matched && clean.length < 50 && !clean.includes('Watt') && !clean.includes('1000 m')) {
          const cur = tagCounts.get(clean) || { count: 0, sample };
          cur.count++;
          tagCounts.set(clean, cur);
        }
      });
    };

    questions.forEach((q) => {
      if (q.examName) checkTag(q.examName, q.question);
    });

    tests.forEach((t) => {
      if (t.examName) checkTag(t.examName, t.title);
      t.questions?.forEach((q: any) => {
        if (q.examName) checkTag(q.examName, q.question);
      });
    });

    const unmapped: UnmappedExamTag[] = Array.from(tagCounts.entries())
      .map(([tag, val]) => ({ tag, questionCount: val.count, sampleQuestion: val.sample }))
      .sort((a, b) => b.questionCount - a.questionCount);

    return res.json({ success: true, unmappedTags: unmapped });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// One-tap mapping: Map raw tag to exam, save alias, and update all questions
app.post('/api/admin/map-tag', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { tag, examId, examName } = req.body;
    if (!tag || !examId || !examName) {
      return res.status(400).json({ success: false, error: 'Tag, examId and examName required.' });
    }

    const cleanTag = String(tag).trim();
    const cleanExamName = String(examName).trim();
    const aliases = readJsonFile<ExamAlias>(LOCAL_EXAM_ALIASES_FILE);
    const aliasId = `alias_${Date.now()}`;
    const newAlias: ExamAlias = { id: aliasId, tag: cleanTag, examId, examName: cleanExamName };
    aliases.push(newAlias);
    writeJsonFile(LOCAL_EXAM_ALIASES_FILE, aliases);

    if (firestoreDb) {
      try {
        await firestoreDb.collection('exam_aliases').doc(aliasId).set(newAlias);
      } catch (err) {
        handleFirestoreError(err, 'save mapped alias');
      }
    }

    const questions = readJsonFile<QuestionMasterItem>(LOCAL_QUESTIONS_FILE);
    let updatedCount = 0;
    questions.forEach((q) => {
      if (q.examName?.includes(cleanTag) || q.question.includes(cleanTag)) {
        if (!Array.isArray(q.examTags)) q.examTags = [];
        if (!q.examTags.includes(cleanExamName)) {
          q.examTags.push(cleanExamName);
          updatedCount++;
        }
      }
    });
    if (updatedCount > 0) {
      writeJsonFile(LOCAL_QUESTIONS_FILE, questions);
    }

    const { tests: allTests } = await loadPublishedTestsFromStore(true);
    const updatedTests: any[] = [];
    allTests.forEach((t) => {
      let dirty = false;
      if (t.examName?.includes(cleanTag)) {
        if (!Array.isArray(t.examTags)) t.examTags = [];
        if (!t.examTags.includes(cleanExamName)) {
          t.examTags.push(cleanExamName);
          dirty = true;
        }
      }
      if (Array.isArray(t.questions)) {
        t.questions.forEach((q: any) => {
          if (q?.examName?.includes(cleanTag)) {
            if (!Array.isArray(q.examTags)) q.examTags = [];
            if (!q.examTags.includes(cleanExamName)) {
              q.examTags.push(cleanExamName);
              dirty = true;
              updatedCount++;
            }
          }
        });
      }
      if (dirty) updatedTests.push(t);
    });

    const localTests = readJsonFile<any>(LOCAL_TESTS_FILE);
    localTests.forEach((t) => {
      if (t.examName?.includes(cleanTag)) {
        if (!t.examTags) t.examTags = [];
        if (!t.examTags.includes(cleanExamName)) t.examTags.push(cleanExamName);
      }
    });
    writeJsonFile(LOCAL_TESTS_FILE, localTests);

    if (firestoreDb && updatedTests.length > 0) {
      try {
        const BATCH_SIZE = 400;
        for (let i = 0; i < updatedTests.length; i += BATCH_SIZE) {
          const batch = firestoreDb.batch();
          updatedTests.slice(i, i + BATCH_SIZE).forEach((t) => {
            if (t.id) {
              batch.set(firestoreDb!.collection('tests').doc(t.id), JSON.parse(JSON.stringify(t)), { merge: true });
            }
          });
          await batch.commit();
        }
      } catch (err) {
        handleFirestoreError(err, 'update tests on map-tag');
      }
    }

    invalidateBrowseSummaryCache();

    return res.json({ success: true, message: `Mapped '${cleanTag}' to ${cleanExamName}`, updatedQuestionsCount: updatedCount });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Browse Summary 60-Second In-Memory Cache & Helpers
// -------------------------------------------------------------
const BROWSE_SUMMARY_CACHE_TTL_MS = 60 * 1000;

interface CachedBrowseAggregate {
  source: 'Firestore' | 'local file';
  publishedTestsCount: number;
  totalQuestionsCount: number;
  exams: Array<CatalogExam & { questionCount: number; testCount: number }>;
  subjects: Array<{ name: string; questionCount: number; testCount: number; chaptersCount: number }>;
  chaptersBase: Array<{
    subjectKey: string;
    subject: string;
    name: string;
    questionCount: number;
    testCount: number;
    questionKeys: Set<string>;
  }>;
  cachedAt: number;
}

let browseAggregateCache: CachedBrowseAggregate | null = null;

function invalidateBrowseSummaryCache() {
  browseAggregateCache = null;
}

function normalizeLabel(val: any): string {
  return String(val ?? '').trim().replace(/\s+/g, ' ');
}

function cleanRawExamTag(raw: string): string {
  return normalizeLabel(raw)
    .replace(/^[\(\[\{\:\-\,\.\;]+|[\)\]\}\:\-\,\.\;]+$/g, '')
    .trim();
}

function isMeaningfulExamTag(tag: string): boolean {
  if (!tag) return false;
  const withoutNoise = tag
    .replace(/\b(19\d{2}|20\d{2})\b/g, '')
    .replace(/\b(pre|mains|main|prelims|preliminary|spl|re\.?\s*exam)\b/gi, '')
    .replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '');
  return withoutNoise.length >= 2;
}

function slugifyExamId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `custom_${slug || 'exam'}`;
}

async function loadCatalogExamsAndAliasesFromStore(): Promise<{
  exams: CatalogExam[];
  aliases: ExamAlias[];
}> {
  let exams: CatalogExam[] = [];
  let aliases: ExamAlias[] = [];
  if (firestoreDb) {
    try {
      const [exSnap, alSnap] = await Promise.all([
        firestoreDb.collection('exams').get(),
        firestoreDb.collection('exam_aliases').get(),
      ]);
      exams = exSnap.docs.map((d: any) => d.data() as CatalogExam);
      aliases = alSnap.docs.map((d: any) => d.data() as ExamAlias);
    } catch (err) {
      handleFirestoreError(err, 'load catalog exams and aliases');
    }
  }
  if (exams.length === 0) {
    exams = readJsonFile<CatalogExam>(LOCAL_EXAMS_FILE);
    if (exams.length === 0) exams = DEFAULT_CATALOG_EXAMS;
  }
  if (aliases.length === 0) {
    aliases = readJsonFile<ExamAlias>(LOCAL_EXAM_ALIASES_FILE);
  }
  return { exams, aliases };
}

function isCustomTestDoc(t: any): boolean {
  if (!t) return false;
  return t.isCustomTest === true || String(t.id || '').startsWith('custom_');
}

async function loadPublishedTestsFromStore(includeDrafts = false): Promise<{
  source: 'Firestore' | 'local file';
  tests: any[];
}> {
  if (firestoreDb) {
    try {
      const query: any = includeDrafts
        ? firestoreDb.collection('tests')
        : firestoreDb.collection('tests').where('status', '==', 'published');
      const snap = await query.get();
      const tests = snap.docs
        .map((d: any) => ({ ...d.data(), id: d.data()?.id || d.id }))
        .filter((t: any) => !isCustomTestDoc(t));
      return { source: 'Firestore', tests };
    } catch (err) {
      handleFirestoreError(err, 'load tests from store');
    }
  }
  const localTests = readJsonFile<any>(LOCAL_TESTS_FILE).filter((t) => !isCustomTestDoc(t));
  return {
    source: 'local file',
    tests: includeDrafts
      ? localTests
      : localTests.filter((t) => (t.status || 'published') === 'published'),
  };
}

async function loadUserAttemptsFromStore(uid?: string): Promise<any[]> {
  if (!uid) return [];
  if (firestoreDb) {
    try {
      const snap = await firestoreDb
        .collection('attempts')
        .where('userId', '==', uid)
        .get();
      return snap.docs.map((d: any) => d.data());
    } catch (err) {
      handleFirestoreError(err, 'load user attempts');
    }
  }
  return readJsonFile<any>(LOCAL_ATTEMPTS_FILE).filter((a) => a.userId === uid);
}

async function getOrBuildBrowseAggregate(): Promise<{
  aggregate: CachedBrowseAggregate;
  cacheHit: boolean;
}> {
  const now = Date.now();
  if (
    browseAggregateCache &&
    now - browseAggregateCache.cachedAt < BROWSE_SUMMARY_CACHE_TTL_MS
  ) {
    return { aggregate: browseAggregateCache, cacheHit: true };
  }
  const aggregate = await buildBrowseAggregate();
  browseAggregateCache = aggregate;
  return { aggregate, cacheHit: false };
}

function buildMasterQuestionsFromPublishedTests(
  publishedTests: any[],
  exams: CatalogExam[],
  aliases: ExamAlias[]
): QuestionMasterItem[] {
  const catalogByKey = new Map<string, CatalogExam>();
  exams.forEach((ex) => {
    if (ex?.shortName) {
      catalogByKey.set(normalizeLabel(ex.shortName).toLowerCase(), ex);
    }
  });

  const qMap = new Map<string, QuestionMasterItem>();
  for (const test of publishedTests) {
    if (!test) continue;
    const testTitle = normalizeLabel(test.title);
    const qs = Array.isArray(test.questions) ? test.questions : [];
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      if (!q || !q.question) continue;
      const normKey = String(q.question).toLowerCase().trim().replace(/\s+/g, ' ');
      if (qMap.has(normKey)) continue;

      const examTagsSet = new Set<string>();
      const rawCandidates: string[] = [];
      if (Array.isArray(q.examTags)) {
        q.examTags.forEach((tag: any) => {
          const cleaned = cleanRawExamTag(String(tag || ''));
          if (cleaned) rawCandidates.push(cleaned);
        });
      }
      const rawExamStr = normalizeLabel(q.examName || test.examName);
      if (rawExamStr) {
        rawExamStr.split(/[,;]+/).forEach((part) => {
          const cleaned = cleanRawExamTag(part);
          if (cleaned) rawCandidates.push(cleaned);
        });
      }
      for (const candidate of rawCandidates) {
        if (!isMeaningfulExamTag(candidate)) continue;
        const directCatalog = catalogByKey.get(candidate.toLowerCase());
        const matched = directCatalog
          ? { exam: directCatalog }
          : matchExamTag(candidate, aliases, exams);
        if (matched && matched.exam) {
          examTagsSet.add(normalizeLabel(matched.exam.shortName));
        } else {
          examTagsSet.add(candidate);
        }
      }

      const hasExplicitSubj = Boolean(normalizeLabel(q.subject || test.subject));
      const hasExplicitChap = Boolean(normalizeLabel(q.chapter || test.chapter));
      const inferred =
        !hasExplicitSubj || !hasExplicitChap
          ? inferSubjectAndChapter(q.question || '', testTitle)
          : { subject: '', chapter: '' };

      const subject =
        normalizeLabel(q.subject || test.subject) ||
        normalizeLabel(inferred.subject) ||
        'General Studies';
      let chapter = normalizeLabel(q.chapter || test.chapter);
      if (!chapter) {
        const inferredChap = normalizeLabel(inferred.chapter);
        chapter =
          inferredChap &&
          inferredChap.toLowerCase() !== 'general knowledge & current perspectives'
            ? inferredChap
            : 'Uncategorized';
      }

      const opts = q.options || { A: '', B: '', C: '', D: '' };
      qMap.set(normKey, {
        id: String(q.id || `${test.id || 'q'}_${i + 1}`),
        question: String(q.question).trim(),
        options: {
          A: opts.A || opts.a || '',
          B: opts.B || opts.b || '',
          C: opts.C || opts.c || '',
          D: opts.D || opts.d || '',
          ...(opts.E || opts.e ? { E: opts.E || opts.e } : {}),
        },
        correctOption: q.correctOption || '',
        explanation: q.explanation || '',
        type: q.type || 'factual',
        sourcePages: q.sourcePages || `Section ${i + 1}`,
        examName: Array.from(examTagsSet).join(', '),
        year: q.year || test.year || '',
        examTags: Array.from(examTagsSet),
        stage: q.stage,
        subject,
        chapter,
        sourcePdfId: q.sourcePdfId || test.sourcePdfId || '',
        difficulty: (test.difficulty as any) || 'Medium',
        language: (test.language as any) || 'English',
      });
    }
  }
  return Array.from(qMap.values());
}

async function buildBrowseAggregate(): Promise<CachedBrowseAggregate> {
  const { source, tests: publishedTests } = await loadPublishedTestsFromStore(false);
  const { exams, aliases } = await loadCatalogExamsAndAliasesFromStore();

  const catalogByKey = new Map<string, CatalogExam>();
  exams.forEach((ex) => {
    if (ex?.shortName) {
      catalogByKey.set(normalizeLabel(ex.shortName).toLowerCase(), ex);
    }
  });

  const examGroups = new Map<
    string,
    { meta: CatalogExam; qCount: number; testIds: Set<string> }
  >();
  const subjectGroups = new Map<
    string,
    { displayName: string; qCount: number; testIds: Set<string>; chapterKeys: Set<string> }
  >();
  const chapterGroups = new Map<
    string,
    {
      subjectKey: string;
      subject: string;
      name: string;
      qCount: number;
      testIds: Set<string>;
      questionKeys: Set<string>;
    }
  >();

  let totalQuestionsCount = 0;

  for (const test of publishedTests) {
    if (!test) continue;
    const testId = String(test.id || test.title || '');
    const testTitle = normalizeLabel(test.title);
    const qs = Array.isArray(test.questions) ? test.questions : [];

    for (const q of qs) {
      if (!q || !q.question) continue;
      totalQuestionsCount++;

      // 1. Exam grouping: question.examName / question.examTags / test.examName
      const rawCandidates: string[] = [];
      if (Array.isArray(q.examTags)) {
        q.examTags.forEach((tag: any) => {
          const cleaned = cleanRawExamTag(String(tag || ''));
          if (cleaned) rawCandidates.push(cleaned);
        });
      }
      const rawExamStr = normalizeLabel(q.examName || test.examName);
      if (rawExamStr) {
        rawExamStr.split(/[,;]+/).forEach((part) => {
          const cleaned = cleanRawExamTag(part);
          if (cleaned) rawCandidates.push(cleaned);
        });
      }

      const questionExamKeys = new Set<string>();
      for (const candidate of rawCandidates) {
        if (!isMeaningfulExamTag(candidate)) continue;

        const directCatalog = catalogByKey.get(candidate.toLowerCase());
        const matched = directCatalog
          ? { exam: directCatalog }
          : matchExamTag(candidate, aliases, exams);

        if (matched && matched.exam) {
          const shortName = normalizeLabel(matched.exam.shortName);
          const normKey = shortName.toLowerCase();
          if (questionExamKeys.has(normKey)) continue;
          questionExamKeys.add(normKey);

          if (!examGroups.has(normKey)) {
            examGroups.set(normKey, {
              meta: { ...matched.exam, active: true },
              qCount: 0,
              testIds: new Set<string>(),
            });
          }
          const grp = examGroups.get(normKey)!;
          grp.qCount++;
          if (testId) grp.testIds.add(testId);
        } else {
          const normKey = candidate.toLowerCase();
          if (questionExamKeys.has(normKey)) continue;
          questionExamKeys.add(normKey);

          if (!examGroups.has(normKey)) {
            examGroups.set(normKey, {
              meta: {
                id: slugifyExamId(candidate),
                name: candidate,
                shortName: candidate,
                categoryGroup: 'Other',
                active: true,
                order: 999,
              },
              qCount: 0,
              testIds: new Set<string>(),
            });
          }
          const grp = examGroups.get(normKey)!;
          grp.qCount++;
          if (testId) grp.testIds.add(testId);
        }
      }

      // 2. Subject & Chapter grouping with keyword inference fallback
      const hasExplicitSubj = Boolean(normalizeLabel(q.subject || test.subject));
      const hasExplicitChap = Boolean(normalizeLabel(q.chapter || test.chapter));
      const inferred =
        !hasExplicitSubj || !hasExplicitChap
          ? inferSubjectAndChapter(q.question || '', testTitle)
          : { subject: '', chapter: '' };

      const subjectName =
        normalizeLabel(q.subject || test.subject) ||
        normalizeLabel(inferred.subject) ||
        'General Studies';
      const subjectKey = subjectName.toLowerCase();

      let chapterName = normalizeLabel(q.chapter || test.chapter);
      if (!chapterName) {
        const inferredChap = normalizeLabel(inferred.chapter);
        chapterName =
          inferredChap &&
          inferredChap.toLowerCase() !== 'general knowledge & current perspectives'
            ? inferredChap
            : 'Uncategorized';
      }
      const chapterKey = `${subjectKey}___${chapterName.toLowerCase()}`;

      if (!subjectGroups.has(subjectKey)) {
        subjectGroups.set(subjectKey, {
          displayName: subjectName,
          qCount: 0,
          testIds: new Set<string>(),
          chapterKeys: new Set<string>(),
        });
      }
      const subjGrp = subjectGroups.get(subjectKey)!;
      subjGrp.qCount++;
      if (testId) subjGrp.testIds.add(testId);
      subjGrp.chapterKeys.add(chapterKey);

      if (!chapterGroups.has(chapterKey)) {
        chapterGroups.set(chapterKey, {
          subjectKey,
          subject: subjGrp.displayName,
          name: chapterName,
          qCount: 0,
          testIds: new Set<string>(),
          questionKeys: new Set<string>(),
        });
      }
      const chapGrp = chapterGroups.get(chapterKey)!;
      chapGrp.qCount++;
      if (testId) chapGrp.testIds.add(testId);
      const normQ = String(q.question).toLowerCase().trim().replace(/\s+/g, ' ');
      if (normQ) chapGrp.questionKeys.add(normQ);
    }
  }

  const activeExamsWithCounts = Array.from(examGroups.values())
    .filter((g) => g.qCount > 0)
    .map((g) => ({
      ...g.meta,
      questionCount: g.qCount,
      testCount: g.testIds.size,
    }))
    .sort((a, b) => a.order - b.order || b.questionCount - a.questionCount);

  const subjects = Array.from(subjectGroups.values())
    .filter((s) => s.qCount > 0)
    .map((s) => ({
      name: s.displayName,
      questionCount: s.qCount,
      testCount: s.testIds.size,
      chaptersCount: s.chapterKeys.size,
    }))
    .sort((a, b) => b.questionCount - a.questionCount);

  const chaptersBase = Array.from(chapterGroups.values())
    .filter((c) => c.qCount > 0)
    .map((c) => ({
      subjectKey: c.subjectKey,
      subject: c.subject,
      name: c.name,
      questionCount: c.qCount,
      testCount: c.testIds.size,
      questionKeys: c.questionKeys,
    }))
    .sort((a, b) => b.questionCount - a.questionCount);

  return {
    source,
    publishedTestsCount: publishedTests.length,
    totalQuestionsCount,
    exams: activeExamsWithCounts,
    subjects,
    chaptersBase,
    cachedAt: Date.now(),
  };
}

// Admin "Organize" Tool: Fills exam mapping, subject, chapter, and generates ready-made tests
app.post('/api/admin/organize-questions', authenticateUser, requireAdmin, async (_req, res) => {
  try {
    let exams = readJsonFile<CatalogExam>(LOCAL_EXAMS_FILE);
    let aliases = readJsonFile<ExamAlias>(LOCAL_EXAM_ALIASES_FILE);
    const localTests = readJsonFile<any>(LOCAL_TESTS_FILE);
    let firestoreTests: any[] = [];

    if (firestoreDb) {
      try {
        const [tSnap, exSnap, alSnap] = await Promise.all([
          firestoreDb.collection('tests').get(),
          firestoreDb.collection('exams').get(),
          firestoreDb.collection('exam_aliases').get(),
        ]);
        firestoreTests = tSnap.docs.map((d: any) => ({ ...d.data(), id: d.data()?.id || d.id }));
        const fsExams = exSnap.docs.map((d: any) => d.data() as CatalogExam);
        const fsAliases = alSnap.docs.map((d: any) => d.data() as ExamAlias);
        if (fsExams.length > 0) exams = fsExams;
        if (fsAliases.length > 0) aliases = fsAliases;
      } catch (err) {
        handleFirestoreError(err, 'load tests for organize-questions');
      }
    }

    const mergedSourceMap = new Map<string, any>();
    localTests.forEach((t) => {
      if (t && t.id && !isCustomTestDoc(t)) mergedSourceMap.set(t.id, t);
    });
    firestoreTests.forEach((t) => {
      if (t && t.id && !isCustomTestDoc(t)) mergedSourceMap.set(t.id, t);
    });
    const tests = Array.from(mergedSourceMap.values());

    const existingMaster = readJsonFile<QuestionMasterItem>(LOCAL_QUESTIONS_FILE);

    const { masterQuestions, readyMadeTests, unmappedTags, unplacedQuestions } =
      organizeQuestionsAndBuildTests(tests, exams, aliases, existingMaster);

    writeJsonFile(LOCAL_QUESTIONS_FILE, masterQuestions);

    const testMap = new Map<string, any>();
    tests.forEach((t) => {
      if (t && t.id) testMap.set(t.id, t);
    });
    readyMadeTests.forEach((t) => {
      if (t && t.id) testMap.set(t.id, t);
    });
    const mergedTests = Array.from(testMap.values());
    writeJsonFile(LOCAL_TESTS_FILE, mergedTests);

    if (firestoreDb) {
      try {
        const BATCH_SIZE = 400;
        for (let i = 0; i < masterQuestions.length; i += BATCH_SIZE) {
          const chunk = masterQuestions.slice(i, i + BATCH_SIZE);
          const batch = firestoreDb.batch();
          chunk.forEach((q) => {
            batch.set(firestoreDb!.collection('questions').doc(q.id), q, { merge: true });
          });
          await batch.commit();
        }
        for (let i = 0; i < readyMadeTests.length; i += BATCH_SIZE) {
          const chunk = readyMadeTests.slice(i, i + BATCH_SIZE);
          const batch = firestoreDb.batch();
          chunk.forEach((t) => {
            batch.set(firestoreDb!.collection('tests').doc(t.id), JSON.parse(JSON.stringify(t)), { merge: true });
          });
          await batch.commit();
        }
      } catch (err) {
        handleFirestoreError(err, 'save questions to firestore');
      }
    }

    invalidateBrowseSummaryCache();

    return res.json({
      success: true,
      report: {
        totalQuestionsProcessed: masterQuestions.length,
        mappedQuestionsCount: masterQuestions.filter((q) => q.examTags.length > 0).length,
        unplacedQuestionsCount: unplacedQuestions.length,
        unmappedTags,
        readyMadeTestsCreated: readyMadeTests.length,
        unplacedSampleQuestions: unplacedQuestions.slice(0, 10),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Admin AI Auto-Classify Untagged Questions Tool
app.post('/api/admin/ai-auto-classify', authenticateUser, requireAdmin, async (_req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { exams, aliases } = await loadCatalogExamsAndAliasesFromStore();
    const { tests } = await loadPublishedTestsFromStore(true);

    const catalogByKey = new Map<string, CatalogExam>();
    exams.forEach((ex) => {
      if (ex?.shortName) catalogByKey.set(normalizeLabel(ex.shortName).toLowerCase(), ex);
    });

    interface UntaggedTarget {
      testIndex: number;
      qIndex: number;
      question: string;
      options: any;
      existingExamName: string;
      existingSubject: string;
      existingChapter: string;
      testTitle: string;
    }

    const dirtyTestIndices = new Set<number>();
    let totalScanned = 0;
    let ruleUpdatedCount = 0;
    let aiUpdatedCount = 0;
    const pendingForAi: UntaggedTarget[] = [];

    for (let tIdx = 0; tIdx < tests.length; tIdx++) {
      const test = tests[tIdx];
      if (!test || !Array.isArray(test.questions)) continue;

      for (let qIdx = 0; qIdx < test.questions.length; qIdx++) {
        const q = test.questions[qIdx];
        if (!q || !q.question) continue;
        totalScanned++;

        const curSubject = normalizeLabel(q.subject);
        const curChapter = normalizeLabel(q.chapter);
        const hasGenericSubj =
          !curSubject ||
          curSubject.toLowerCase() === 'general studies' ||
          curSubject.toLowerCase() === 'uncategorized';
        const hasGenericChap =
          !curChapter ||
          curChapter.toLowerCase() === 'uncategorized' ||
          curChapter.toLowerCase() === 'general knowledge & current perspectives';
        const hasExamTags = Array.isArray(q.examTags) && q.examTags.length > 0;
        const rawExam = normalizeLabel(q.examName || test.examName);

        // Try rule-based exam mapping & keyword inference first
        let updatedByRule = false;
        if (!hasExamTags && rawExam) {
          const matchedTags = new Set<string>();
          rawExam.split(/[,;]+/).forEach((part) => {
            const clean = cleanRawExamTag(part);
            if (!isMeaningfulExamTag(clean)) return;
            const direct = catalogByKey.get(clean.toLowerCase());
            const m = direct ? { exam: direct } : matchExamTag(clean, aliases, exams);
            if (m?.exam?.shortName) matchedTags.add(normalizeLabel(m.exam.shortName));
          });
          if (matchedTags.size > 0) {
            q.examTags = Array.from(matchedTags);
            updatedByRule = true;
          }
        }

        if (hasGenericSubj || hasGenericChap) {
          const inferred = inferSubjectAndChapter(q.question, test.title || '');
          const infSubj = normalizeLabel(inferred.subject);
          const infChap = normalizeLabel(inferred.chapter);
          if (hasGenericSubj && infSubj && infSubj.toLowerCase() !== 'general studies') {
            q.subject = infSubj;
            updatedByRule = true;
          }
          if (
            hasGenericChap &&
            infChap &&
            infChap.toLowerCase() !== 'general knowledge & current perspectives'
          ) {
            q.chapter = infChap;
            updatedByRule = true;
          }
        }

        if (updatedByRule) {
          dirtyTestIndices.add(tIdx);
          ruleUpdatedCount++;
        }

        const afterSubj = normalizeLabel(q.subject);
        const afterChap = normalizeLabel(q.chapter);
        const stillNeedsAi =
          !afterSubj ||
          afterSubj.toLowerCase() === 'general studies' ||
          !afterChap ||
          afterChap.toLowerCase() === 'uncategorized';

        if (stillNeedsAi) {
          pendingForAi.push({
            testIndex: tIdx,
            qIndex: qIdx,
            question: String(q.question).slice(0, 400),
            options: q.options || {},
            existingExamName: rawExam,
            existingSubject: afterSubj,
            existingChapter: afterChap,
            testTitle: normalizeLabel(test.title),
          });
        }
      }
    }

    const MAX_PER_CALL = 45;
    const BATCH_SIZE = 15;
    const batchTargets = pendingForAi.slice(0, MAX_PER_CALL);
    const remainingUntagged = Math.max(0, pendingForAi.length - batchTargets.length);

    if (batchTargets.length > 0 && apiKey) {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const validExamShorts = exams.map((e) => e.shortName).filter(Boolean).slice(0, 30);

      for (let i = 0; i < batchTargets.length; i += BATCH_SIZE) {
        const chunk = batchTargets.slice(i, i + BATCH_SIZE);
        const prompt = `You are a curriculum classifier for Indian competitive exams (UPSC, BPSC, UPPSC, SSC, Railways).
Classify each MCQ into standard English Subject, Chapter, and relevant Exam tags (choose exam short names from this catalog when relevant: ${validExamShorts.join(', ')}).

Valid Subjects: History, Geography, Polity, Economy, Physics, Chemistry, Biology, Environment & Ecology, Current Affairs, Bihar Special, Mathematics, Reasoning, Computer, General Science, Art & Culture, General Knowledge.
Keep Chapter concise (2-5 words in English, e.g. "Indus Valley Civilization", "Fundamental Rights", "Newton's Laws", "Cell Biology").

Return ONLY a JSON array matching this exact schema:
[
  { "idx": 0, "subject": "...", "chapter": "...", "examTags": ["BPSC", "SSC CGL"] }
]

Questions:
${chunk
  .map(
    (item, idx) =>
      `[${idx}] Title: "${item.testTitle}" | RawExam: "${item.existingExamName}" | Q: ${item.question}`
  )
  .join('\n')}`;

        const candidateModels = ['gemini-4-hydrogen', 'gemini-3.5-flash', 'gemini-3.8-flash'];
        for (const model of candidateModels) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: [{ text: prompt }],
              config: {
                responseMimeType: 'application/json',
                temperature: 0.1,
              },
            });
            if (response?.text) {
              const parsed = JSON.parse(response.text);
              const items = Array.isArray(parsed) ? parsed : [];
              items.forEach((cls: any) => {
                const target = chunk[Number(cls.idx)];
                if (!target) return;
                const parentTest = tests[target.testIndex];
                const q = parentTest?.questions?.[target.qIndex];
                if (!q) return;

                let changed = false;
                const newSubj = normalizeLabel(cls.subject);
                const newChap = normalizeLabel(cls.chapter);
                if (newSubj && (!q.subject || q.subject === 'General Studies')) {
                  q.subject = newSubj;
                  changed = true;
                }
                if (newChap && (!q.chapter || q.chapter === 'Uncategorized')) {
                  q.chapter = newChap;
                  changed = true;
                }
                if (
                  (!Array.isArray(q.examTags) || q.examTags.length === 0) &&
                  Array.isArray(cls.examTags) &&
                  cls.examTags.length > 0
                ) {
                  const normalizedTags = cls.examTags
                    .map((t: any) => {
                      const clean = cleanRawExamTag(String(t || ''));
                      const direct = catalogByKey.get(clean.toLowerCase());
                      const m = direct ? { exam: direct } : matchExamTag(clean, aliases, exams);
                      return m?.exam?.shortName ? normalizeLabel(m.exam.shortName) : clean;
                    })
                    .filter(Boolean);
                  if (normalizedTags.length > 0) {
                    q.examTags = Array.from(new Set(normalizedTags));
                    changed = true;
                  }
                }
                if (changed) {
                  dirtyTestIndices.add(target.testIndex);
                  aiUpdatedCount++;
                }
              });
              break;
            }
          } catch {
            // Try next model
          }
        }
      }
    }

    const updatedTestsList = Array.from(dirtyTestIndices).map((idx) => tests[idx]);
    if (updatedTestsList.length > 0) {
      const localTests = readJsonFile<any>(LOCAL_TESTS_FILE);
      const localMap = new Map<string, any>();
      localTests.forEach((t) => {
        if (t?.id) localMap.set(t.id, t);
      });
      updatedTestsList.forEach((t) => {
        if (t?.id) localMap.set(t.id, t);
      });
      writeJsonFile(LOCAL_TESTS_FILE, Array.from(localMap.values()));

      if (firestoreDb) {
        try {
          const FS_BATCH = 400;
          for (let i = 0; i < updatedTestsList.length; i += FS_BATCH) {
            const batch = firestoreDb.batch();
            updatedTestsList.slice(i, i + FS_BATCH).forEach((t) => {
              if (t?.id) {
                batch.set(firestoreDb!.collection('tests').doc(t.id), JSON.parse(JSON.stringify(t)), {
                  merge: true,
                });
              }
            });
            await batch.commit();
          }
        } catch (err) {
          handleFirestoreError(err, 'save ai auto-classified tests');
        }
      }

      invalidateBrowseSummaryCache();
    }

    return res.json({
      success: true,
      report: {
        totalScanned,
        ruleUpdatedCount,
        aiUpdatedCount,
        updatedTestsCount: updatedTestsList.length,
        remainingUntagged,
        aiAvailable: Boolean(apiKey),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'AI Auto-Classify failed' });
  }
});

// Browse Summary: Exams, Subjects & Chapters built directly from PUBLISHED tests
app.get('/api/browse/summary', authenticateUser, async (req, res) => {
  try {
    const { aggregate, cacheHit } = await getOrBuildBrowseAggregate();

    console.log(
      `[GET /api/browse/summary] source=${aggregate.source}, publishedTests=${aggregate.publishedTestsCount}, questionsCounted=${aggregate.totalQuestionsCount}, cacheHit=${cacheHit}`
    );

    // Load user attempts (Firestore first, local fallback) to calculate userAttemptedCount per chapter
    const userAttempts = await loadUserAttemptsFromStore(req.user?.uid);

    const userAttemptedKeys = new Set<string>();
    userAttempts.forEach((a) => {
      a.questionsData?.forEach((q: any) => {
        if (q.question) {
          userAttemptedKeys.add(String(q.question).toLowerCase().trim().replace(/\s+/g, ' '));
        }
      });
    });

    const chapters = aggregate.chaptersBase.map((c) => {
      let attemptedCount = 0;
      if (userAttemptedKeys.size > 0) {
        c.questionKeys.forEach((qKey) => {
          if (userAttemptedKeys.has(qKey)) attemptedCount++;
        });
      }
      return {
        subject: c.subject,
        name: c.name,
        questionCount: c.questionCount,
        testCount: c.testCount,
        userAttemptedCount: attemptedCount,
      };
    });

    return res.json({
      success: true,
      summary: {
        exams: aggregate.exams,
        subjects: aggregate.subjects,
        chapters,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Browse Exam Detail: Year-wise, Subject-wise, Chapter-wise papers for that exam
app.get('/api/browse/exams/:examId', authenticateUser, async (req, res) => {
  try {
    const { examId } = req.params;
    const { exams, aliases } = await loadCatalogExamsAndAliasesFromStore();
    const { aggregate } = await getOrBuildBrowseAggregate();

    const exam =
      exams.find((e) => e.id === examId || e.shortName.toLowerCase() === examId.toLowerCase()) ||
      aggregate.exams.find((e) => e.id === examId || e.shortName.toLowerCase() === examId.toLowerCase());

    if (!exam) {
      return res.status(404).json({ success: false, error: `Exam '${examId}' not found.` });
    }

    const { tests: allTests } = await loadPublishedTestsFromStore(false);
    const examShort = normalizeLabel(exam.shortName);
    const examShortLower = examShort.toLowerCase();

    const matchesCandidate = (rawStr?: string) => {
      if (!rawStr) return false;
      return rawStr.split(/[,;]+/).some((part) => {
        const cleaned = cleanRawExamTag(part);
        if (!cleaned) return false;
        if (cleaned.toLowerCase() === examShortLower) return true;
        const m = matchExamTag(cleaned, aliases, exams);
        return Boolean(m && m.exam.shortName.toLowerCase() === examShortLower);
      });
    };

    const matchingTests = allTests.filter((t) => {
      if (Array.isArray(t.examTags) && t.examTags.some((tag: any) => normalizeLabel(tag).toLowerCase() === examShortLower)) {
        return true;
      }
      if (matchesCandidate(t.examName)) return true;
      if (t.title?.toLowerCase().includes(examShortLower)) return true;
      if (Array.isArray(t.questions)) {
        return t.questions.some(
          (q: any) =>
            (Array.isArray(q?.examTags) && q.examTags.some((tag: any) => normalizeLabel(tag).toLowerCase() === examShortLower)) ||
            matchesCandidate(q?.examName)
        );
      }
      return false;
    });

    const summarizeTest = (t: any) => {
      const { questions: _qs, ...rest } = t;
      return {
        ...rest,
        questionCount: t.questionCount || (Array.isArray(t.questions) ? t.questions.length : 0),
      };
    };

    const summarized = matchingTests.map(summarizeTest);
    const yearPapers = summarized.filter((t) => t.year && /\b(19\d{2}|20\d{2})\b/.test(t.year) && t.title?.toLowerCase().includes('year'));
    const chapterTests = summarized.filter((t) => t.chapter || t.title?.toLowerCase().includes('chapter'));
    const subjectTests = summarized.filter((t) => !yearPapers.includes(t) && !chapterTests.includes(t));

    return res.json({
      success: true,
      exam,
      yearPapers,
      subjectTests,
      chapterTests,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Custom Test Builder: Creates personalized mock or practice test
app.post('/api/tests/custom-builder', authenticateUser, rateLimitByUser('custom-builder', 20), async (req, res) => {
  try {
    const filters: CustomTestFilter = req.body || {};
    const { exams, aliases } = await loadCatalogExamsAndAliasesFromStore();
    const { tests: publishedTests } = await loadPublishedTestsFromStore(false);

    // Derive authoritative question pool directly from published tests (Firestore first, local fallback)
    // and supplement with any stored master questions if publishedTests yielded none.
    let questions = buildMasterQuestionsFromPublishedTests(publishedTests, exams, aliases);
    if (questions.length === 0) {
      if (firestoreDb) {
        try {
          const qSnap = await firestoreDb.collection('questions').get();
          questions = qSnap.docs.map((d: any) => d.data() as QuestionMasterItem);
        } catch (err) {
          handleFirestoreError(err, 'custom builder questions');
        }
      }
      if (questions.length === 0) {
        questions = readJsonFile<QuestionMasterItem>(LOCAL_QUESTIONS_FILE);
      }
    }

    const userAttempts = await loadUserAttemptsFromStore(req.user?.uid);

    const { test, notice, totalAvailable } = buildCustomTest(filters, questions, userAttempts);
    test.isCustomTest = true;
    test.ownerUid = req.user?.uid || 'anon';

    // Persist custom test in dedicated collection so it never pollutes public catalog or browse counts
    const localCustomTests = readJsonFile<any>(LOCAL_CUSTOM_TESTS_FILE);
    localCustomTests.unshift(test);
    writeJsonFile(LOCAL_CUSTOM_TESTS_FILE, localCustomTests.slice(0, 100));

    if (firestoreDb) {
      try {
        await firestoreDb.collection('customTests').doc(test.id).set(JSON.parse(JSON.stringify(test)));
      } catch (err) {
        handleFirestoreError(err, 'save custom test');
      }
    }

    // Never return correct answers before user submits if in timed mock mode!
    let sanitizedQuestions = test.questions;
    if (filters.mode === 'mock') {
      sanitizedQuestions = test.questions.map((q: any) => ({
        id: q.id,
        question: q.question,
        ...(q.questionHindi ? { questionHindi: q.questionHindi } : {}),
        ...(q.questionEnglish ? { questionEnglish: q.questionEnglish } : {}),
        ...(q.optionsHindi ? { optionsHindi: q.optionsHindi } : {}),
        ...(q.optionsEnglish ? { optionsEnglish: q.optionsEnglish } : {}),
        ...(q.passage ? { passage: q.passage } : {}),
        ...(q.data || q.passageData ? { data: q.data || q.passageData } : {}),
        ...(q.passageImage ? { passageImage: q.passageImage } : {}),
        options: q.options,
        type: q.type,
        sourcePages: q.sourcePages,
        examName: q.examName,
        year: q.year,
        subject: q.subject,
        chapter: q.chapter,
        ...(Array.isArray(q.examTags) && q.examTags.length > 0 ? { examTags: q.examTags } : {}),
        ...(q.stage ? { stage: q.stage } : {}),
      }));
    }

    return res.json({
      success: true,
      test: {
        ...test,
        questions: sanitizedQuestions,
      },
      notice,
      totalAvailable,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ...(process.env.DISABLE_HMR === 'true' ? { hmr: false } : {}),
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, cliHost, () => {
    console.log(`Server running on http://${cliHost}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
