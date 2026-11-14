import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  Mail,
  Lock,
  Phone,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ArrowRight,
  KeyRound,
  RotateCcw,
  Edit2,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { ConfirmationResult } from 'firebase/auth';
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  setupRecaptcha,
  sendPhoneOtp,
  verifyPhoneOtp,
  clearRecaptcha,
} from '../services/authService';
import { UserProfile } from '../types';

interface AuthScreenProps {
  onAuthSuccess: (user: UserProfile) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  // Tabs: 'email' (default) | 'phone'
  const [authMode, setAuthMode] = useState<'email' | 'phone'>('email');

  // Email form state
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Phone form state
  const [phoneStep, setPhoneStep] = useState<'phone' | 'otp'>('phone');
  const [mobileNumber, setMobileNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  // Resend Timer State for Phone
  const [timerSeconds, setTimerSeconds] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Common state
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const RECAPTCHA_CONTAINER_ID = 'recaptcha-container';

  const startResendTimer = () => {
    setTimerSeconds(30);
    setCanResend(false);
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearRecaptcha();
    };
  }, []);

  // Web OTP API / SMS Retriever listener for Android Web
  useEffect(() => {
    if (authMode === 'phone' && phoneStep === 'otp' && 'OTPCredential' in window) {
      const ac = new AbortController();
      (navigator.credentials as any)
        .get({
          otp: { transport: ['sms'] },
          signal: ac.signal,
        })
        .then((otpCredential: any) => {
          if (otpCredential && otpCredential.code) {
            setOtpCode(otpCredential.code);
          }
        })
        .catch(() => {});

      return () => {
        ac.abort();
      };
    }
  }, [authMode, phoneStep]);

  // Handle Email Sign In / Sign Up
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      let user: UserProfile;
      if (isSignUp) {
        user = await signUpWithEmail(cleanEmail, password);
      } else {
        user = await signInWithEmail(cleanEmail, password);
      }
      onAuthSuccess(user);
    } catch (err: any) {
      console.error('Email Auth Error:', err);
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google Sign In
  const handleGoogleSignIn = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const user = await signInWithGoogle();
      onAuthSuccess(user);
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Send Phone OTP
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const cleanDigits = mobileNumber.replace(/\D/g, '');
    if (cleanDigits.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsLoading(true);

    try {
      const verifier = setupRecaptcha(RECAPTCHA_CONTAINER_ID);
      const confRes = await sendPhoneOtp(cleanDigits, verifier);
      setConfirmationResult(confRes);
      setPhoneStep('otp');
      startResendTimer();
    } catch (err: any) {
      console.error('Send OTP Error:', err);
      setError(err.message || 'Failed to send OTP. Please check your mobile number and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Verify Phone OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanOtp = otpCode.replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setError('Please enter the 6-digit OTP code sent to your phone.');
      return;
    }

    if (!confirmationResult) {
      setError('Session expired. Please request a new OTP.');
      setPhoneStep('phone');
      return;
    }

    setIsLoading(true);

    try {
      const user = await verifyPhoneOtp(confirmationResult, cleanOtp);
      onAuthSuccess(user);
    } catch (err: any) {
      console.error('Verify OTP Error:', err);
      setError(err.message || 'OTP verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formattedDisplayPhone = () => {
    const digits = mobileNumber.replace(/\D/g, '');
    if (digits.length >= 10) {
      return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    }
    return `+91 ${digits}`;
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Invisible Recaptcha container */}
      <div id={RECAPTCHA_CONTAINER_ID} />

      {/* Background accents */}
      <div className="absolute top-0 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Brand Icon & Heading */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 mx-auto flex items-center justify-center text-white shadow-xl shadow-blue-500/25 mb-4">
            <BookOpen className="w-7 h-7" />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight">
            <span className="text-white">Rank</span>
            <span className="text-blue-500">dhara</span>
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-400 font-medium">
            Practice. Analyse. Rank.
          </p>
        </div>

        {/* Auth Mode Toggle Tabs */}
        <div className="mt-6 flex rounded-xl bg-slate-800/80 p-1 border border-slate-700/80 max-w-xs mx-auto">
          <button
            type="button"
            onClick={() => {
              setAuthMode('email');
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
              authMode === 'email'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Email Login
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('phone');
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
              authMode === 'phone'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Mobile OTP
          </button>
        </div>

        {/* Auth Card */}
        <div className="mt-5 bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">{error}</div>
            </div>
          )}

          {authMode === 'email' ? (
            /* EMAIL & PASSWORD AUTH */
            <div className="space-y-5">
              {/* Google Sign-in */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs sm:text-sm font-bold shadow-md transition flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-700"></div>
                <span className="shrink-0 mx-3 text-slate-500 text-[11px] font-bold tracking-wider uppercase">
                  or with email
                </span>
                <div className="flex-grow border-t border-slate-700"></div>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="e.g. name@example.com"
                      className="w-full pl-10 pr-3.5 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder={isSignUp ? 'Min. 6 characters' : 'Enter password'}
                      className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !email.trim() || !password}
                  className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isSignUp ? 'Creating Account...' : 'Signing In...'}</span>
                    </>
                  ) : (
                    <>
                      <span>{isSignUp ? 'Create Account' : 'Sign In to Portal'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Toggle Sign In / Sign Up */}
              <div className="pt-2 text-center text-xs text-slate-400">
                {isSignUp ? (
                  <span>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(false);
                        setError(null);
                      }}
                      className="text-blue-400 hover:text-blue-300 font-bold underline cursor-pointer"
                    >
                      Sign In
                    </button>
                  </span>
                ) : (
                  <span>
                    New to Rankdhara?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(true);
                        setError(null);
                      }}
                      className="text-blue-400 hover:text-blue-300 font-bold underline cursor-pointer"
                    >
                      Create Account
                    </button>
                  </span>
                )}
              </div>
            </div>
          ) : (
            /* PHONE NUMBER & OTP AUTH */
            <div>
              {phoneStep === 'phone' ? (
                <form onSubmit={handleSendOtp} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
                      Mobile Number
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 px-3.5 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 font-bold text-xs sm:text-sm shrink-0">
                        <span className="text-base">🇮🇳</span>
                        <span>+91</span>
                      </div>
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Phone className="w-4 h-4" />
                        </div>
                        <input
                          type="tel"
                          required
                          maxLength={10}
                          value={mobileNumber}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setMobileNumber(val);
                            if (error) setError(null);
                          }}
                          placeholder="Enter 10-digit Mobile Number"
                          className="w-full pl-10 pr-3.5 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm font-semibold tracking-wider focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">
                      An OTP will be sent via SMS to verify your mobile number.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || mobileNumber.replace(/\D/g, '').length !== 10}
                    className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending OTP...</span>
                      </>
                    ) : (
                      <>
                        <span>Send OTP</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                        <Phone className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          OTP Sent To
                        </span>
                        <span className="text-xs font-extrabold text-white font-mono tracking-wider">
                          {formattedDisplayPhone()}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setPhoneStep('phone');
                        setError(null);
                        setOtpCode('');
                      }}
                      className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 underline transition cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Change</span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
                      Enter 6-Digit Verification Code
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <KeyRound className="w-4 h-4 text-blue-400" />
                      </div>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        autoFocus
                        autoComplete="one-time-code"
                        value={otpCode}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setOtpCode(val);
                          if (error) setError(null);
                        }}
                        placeholder="••••••"
                        className="w-full pl-10 pr-3.5 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-600 text-lg font-mono font-black tracking-widest focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition text-center"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || otpCode.replace(/\D/g, '').length !== 6}
                    className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying Code...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Verify & Login</span>
                      </>
                    )}
                  </button>

                  <div className="pt-2 text-center border-t border-slate-700/60">
                    {canResend ? (
                      <button
                        type="button"
                        onClick={() => handleSendOtp()}
                        disabled={isLoading}
                        className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1.5 mx-auto transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Resend OTP</span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 flex items-center justify-center gap-1">
                        <span>Resend OTP in</span>
                        <span className="font-mono font-bold text-blue-400">
                          {timerSeconds}s
                        </span>
                      </span>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Security badge */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Firebase Authentication • Verified Token Security</span>
        </div>
      </div>
    </div>
  );
};
