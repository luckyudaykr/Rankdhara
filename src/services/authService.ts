import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  ConfirmationResult,
  setPersistence,
  browserLocalPersistence,
  User,
  Auth,
} from 'firebase/auth';
import { UserProfile } from '../types';

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

// Firebase client configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasFirebaseClientConfig = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

if (hasFirebaseClientConfig) {
  try {
    if (getApps().length === 0) {
      firebaseApp = initializeApp(firebaseConfig);
    } else {
      firebaseApp = getApps()[0];
    }
    firebaseAuth = getAuth(firebaseApp);

    // Enforce persistent browser session local persistence
    setPersistence(firebaseAuth, browserLocalPersistence).catch(() => {});
  } catch (err) {
    console.warn('Firebase client initialization note:', err);
  }
}

const LOCAL_SESSION_KEY = 'cbt_session_user';
const LOCAL_TOKEN_KEY = 'cbt_session_token';

let currentProfile: UserProfile | null = null;
const authListeners: Array<(user: UserProfile | null) => void> = [];

function notifyListeners() {
  authListeners.forEach((listener) => listener(currentProfile));
}

export function subscribeAuthState(callback: (user: UserProfile | null) => void) {
  authListeners.push(callback);
  callback(currentProfile);

  return () => {
    const idx = authListeners.indexOf(callback);
    if (idx >= 0) authListeners.splice(idx, 1);
  };
}

export const onAuthStateListener = subscribeAuthState;

export async function getCurrentUserToken(): Promise<string | null> {
  if (firebaseAuth?.currentUser) {
    try {
      return await firebaseAuth.currentUser.getIdToken(true);
    } catch {
      // fallback to saved token if offline
    }
  }
  return localStorage.getItem(LOCAL_TOKEN_KEY);
}

export function getCurrentUser(): UserProfile | null {
  return currentProfile;
}

export const getCurrentUserProfile = getCurrentUser;

// Sync verified Firebase ID Token with server
export async function syncUserWithBackend(idToken: string): Promise<UserProfile> {
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        if ((response.status === 502 || response.status === 503 || response.status === 504 || response.status >= 500) && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }
        throw new Error(
          `Failed to verify authentication token with backend server (HTTP ${response.status}).`
        );
      }

      const data = await response.json().catch(() => null);
      if (!data) {
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }
        throw new Error('Failed to verify authentication token with backend server.');
      }

      if (!response.ok || !data.success || !data.user) {
        throw new Error(data.error || 'Authentication token verification failed.');
      }

      currentProfile = data.user as UserProfile;
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(currentProfile));
      localStorage.setItem(LOCAL_TOKEN_KEY, idToken);
      notifyListeners();

      return currentProfile;
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isTransient =
        err?.name === 'TypeError' ||
        lastError.message.includes('Failed to fetch') ||
        lastError.message.includes('HTTP 502') ||
        lastError.message.includes('HTTP 503') ||
        lastError.message.includes('HTTP 504');

      if (isTransient && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error('Failed to verify authentication token with backend server.');
}

export async function updateUserProfileDisplayName(newDisplayName: string): Promise<UserProfile> {
  const token = await getCurrentUserToken();
  const response = await fetch('/api/auth/profile', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token || 'mock-admin-token'}`,
    },
    body: JSON.stringify({ displayName: newDisplayName }),
  });

  const data = await response.json().catch(() => ({
    success: false,
    error: 'Failed to update profile.',
  }));

  if (!response.ok || !data.success || !data.user) {
    throw new Error(data.error || 'Failed to update profile.');
  }

  currentProfile = data.user as UserProfile;
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(currentProfile));
  notifyListeners();

  return currentProfile;
}

// -------------------------------------------------------------
// Email & Password Authentication
// -------------------------------------------------------------
export async function signInWithEmail(email: string, pass: string): Promise<UserProfile> {
  if (!firebaseAuth) {
    throw new Error('Firebase Authentication is not configured.');
  }

  const cleanEmail = email.trim();
  if (!cleanEmail) {
    throw new Error('Please enter your email address.');
  }
  if (!pass) {
    throw new Error('Please enter your password.');
  }

  try {
    const cred = await signInWithEmailAndPassword(firebaseAuth, cleanEmail, pass);
    const idToken = await cred.user.getIdToken();
    return await syncUserWithBackend(idToken);
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      throw new Error('Wrong email or password');
    }
    if (code === 'auth/user-not-found') {
      throw new Error('No account found, please Create Account');
    }
    if (code === 'auth/invalid-email') {
      throw new Error('Please enter a valid email address.');
    }
    if (code === 'auth/too-many-requests') {
      throw new Error('Too many failed attempts. Please wait a moment before trying again.');
    }
    throw new Error(err?.message || 'Failed to sign in. Please check credentials.');
  }
}

export async function signUpWithEmail(email: string, pass: string): Promise<UserProfile> {
  if (!firebaseAuth) {
    throw new Error('Firebase Authentication is not configured.');
  }

  const cleanEmail = email.trim();
  if (!cleanEmail) {
    throw new Error('Please enter a valid email address.');
  }
  if (!pass || pass.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  try {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, cleanEmail, pass);
    const idToken = await cred.user.getIdToken();
    return await syncUserWithBackend(idToken);
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/email-already-in-use') {
      throw new Error('An account already exists with this email. Please Sign In.');
    }
    if (code === 'auth/weak-password') {
      throw new Error('Password must be at least 6 characters.');
    }
    if (code === 'auth/invalid-email') {
      throw new Error('Please enter a valid email address.');
    }
    throw new Error(err?.message || 'Failed to create account.');
  }
}

// -------------------------------------------------------------
// Google Sign-In
// -------------------------------------------------------------
export async function signInWithGoogle(): Promise<UserProfile> {
  if (!firebaseAuth) {
    throw new Error('Firebase Authentication is not configured.');
  }

  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(firebaseAuth, provider);
    const idToken = await cred.user.getIdToken();
    return await syncUserWithBackend(idToken);
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Sign-in cancelled.');
    }
    throw new Error(err?.message || 'Google sign-in failed. Please try again.');
  }
}

// -------------------------------------------------------------
// Phone Auth Utilities
// -------------------------------------------------------------
let currentRecaptchaVerifier: RecaptchaVerifier | null = null;

export function setupRecaptcha(containerId: string): RecaptchaVerifier {
  if (!firebaseAuth) {
    throw new Error('Firebase Authentication is not configured. Check environment API keys.');
  }

  if (currentRecaptchaVerifier) {
    try {
      currentRecaptchaVerifier.clear();
    } catch {
      // ignore
    }
    currentRecaptchaVerifier = null;
  }

  currentRecaptchaVerifier = new RecaptchaVerifier(firebaseAuth, containerId, {
    size: 'invisible',
    callback: () => {},
    'expired-callback': () => {},
  });

  return currentRecaptchaVerifier;
}

export function clearRecaptcha() {
  if (currentRecaptchaVerifier) {
    try {
      currentRecaptchaVerifier.clear();
    } catch {
      // ignore
    }
    currentRecaptchaVerifier = null;
  }
}

export async function sendPhoneOtp(
  mobileNumber: string,
  appVerifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  if (!firebaseAuth) {
    throw new Error('Firebase Authentication is not configured.');
  }

  const digitsOnly = mobileNumber.replace(/\D/g, '');
  if (digitsOnly.length < 10) {
    throw new Error('Please enter a valid 10-digit mobile number.');
  }

  const formattedPhone = mobileNumber.startsWith('+')
    ? mobileNumber
    : `+91${digitsOnly.slice(-10)}`;

  try {
    const confirmationResult = await signInWithPhoneNumber(
      firebaseAuth,
      formattedPhone,
      appVerifier
    );
    return confirmationResult;
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/invalid-phone-number') {
      throw new Error('Invalid phone number format. Please check the 10-digit mobile number.');
    }
    if (code === 'auth/too-many-requests') {
      throw new Error('Too many OTP attempts. Please wait a few minutes before retrying.');
    }
    if (code === 'auth/quota-exceeded') {
      throw new Error('SMS quota exceeded for today. Please try again later.');
    }
    if (code === 'auth/captcha-check-failed') {
      throw new Error('reCAPTCHA security check failed. Please reload and try again.');
    }
    throw new Error(err?.message || 'Failed to send OTP to mobile number.');
  }
}

export async function verifyPhoneOtp(
  confirmationResult: ConfirmationResult,
  otpCode: string
): Promise<UserProfile> {
  const cleanOtp = otpCode.replace(/\D/g, '');
  if (cleanOtp.length !== 6) {
    throw new Error('Please enter a valid 6-digit OTP code.');
  }

  try {
    const userCredential = await confirmationResult.confirm(cleanOtp);
    const idToken = await userCredential.user.getIdToken();
    return await syncUserWithBackend(idToken);
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/invalid-verification-code') {
      throw new Error('Incorrect OTP. Please check the 6-digit code sent to your phone.');
    }
    if (code === 'auth/code-expired') {
      throw new Error('OTP code has expired. Please tap "Resend OTP" to get a new code.');
    }
    throw new Error(err?.message || 'OTP verification failed. Please try again.');
  }
}

// Sign Out
export async function signOutUser(): Promise<void> {
  if (firebaseAuth) {
    await signOut(firebaseAuth).catch(() => {});
  }
  localStorage.removeItem(LOCAL_SESSION_KEY);
  localStorage.removeItem(LOCAL_TOKEN_KEY);
  currentProfile = null;
  notifyListeners();
}

// Auto-restore session on boot with server verification
try {
  const savedToken = localStorage.getItem(LOCAL_TOKEN_KEY);
  const savedProfile = localStorage.getItem(LOCAL_SESSION_KEY);
  if (savedToken && savedProfile) {
    currentProfile = JSON.parse(savedProfile);
    syncUserWithBackend(savedToken).catch(() => {
      signOutUser();
    });
  }
} catch {
  // Ignore parse errors
}

// Listen to Firebase native auth state changes
if (firebaseAuth) {
  firebaseOnAuthStateChanged(firebaseAuth, async (user: User | null) => {
    if (user) {
      try {
        const token = await user.getIdToken();
        await syncUserWithBackend(token);
      } catch (err) {
        console.warn('Firebase auth sync warning:', err);
      }
    } else if (currentProfile) {
      currentProfile = null;
      notifyListeners();
    }
  });
}
