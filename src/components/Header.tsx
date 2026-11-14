import React from 'react';
import {
  BookOpen,
  ShieldCheck,
  Sparkles,
  LogOut,
  User,
  Shield,
  Layers,
  BarChart3,
  Home,
  CheckCircle2,
} from 'lucide-react';
import { UserProfile } from '../types';

interface HeaderProps {
  currentStage: 'auth' | 'dashboard' | 'performance' | 'admin' | 'test' | 'study' | 'result';
  documentName?: string;
  user?: UserProfile | null;
  onNavigate?: (view: 'dashboard' | 'performance' | 'admin' | 'study') => void;
  onLogout?: () => void;
  onExitTest?: () => void;
  onOpenJsonInspector?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentStage,
  documentName,
  user,
  onNavigate,
  onLogout,
  onExitTest,
  onOpenJsonInspector,
}) => {
  if (currentStage === 'test') {
    return null;
  }

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-xs h-14">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-full flex items-center justify-between">
        {/* Brand: Logo + Stacked Name & Tagline */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div
            onClick={() => onNavigate && onNavigate('dashboard')}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 cursor-pointer shrink-0"
            title="Rankdhara Home"
          >
            <BookOpen className="w-5 h-5" />
          </div>

          <div
            onClick={() => onNavigate && onNavigate('dashboard')}
            className="flex flex-col justify-center cursor-pointer select-none min-w-0"
          >
            <div className="text-[20px] font-bold leading-tight tracking-tight whitespace-nowrap">
              <span className="text-white">Rank</span>
              <span className="text-blue-500">dhara</span>
            </div>
            <p className="text-[11px] text-slate-400 whitespace-nowrap leading-none mt-0.5 font-normal tracking-wide">
              Practice. Analyse. Rank.
            </p>
          </div>
        </div>

        {/* Center Navigation (Only when logged in and not in active test) */}
        {user && currentStage !== 'auth' && onNavigate && (
          <nav className="hidden md:flex items-center gap-1 bg-slate-800/80 border border-slate-700/60 p-1 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                currentStage === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Tests</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('performance')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                currentStage === 'performance'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>My Performance</span>
            </button>

            {user.isAdmin && (
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                  currentStage === 'admin'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-indigo-300 hover:text-white hover:bg-indigo-900/30'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                <span>Admin Panel</span>
              </button>
            )}
          </nav>
        )}

        {/* Document badge if in study */}
        {currentStage === 'study' && documentName && (
          <div className="hidden sm:flex items-center gap-2 text-xs bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-lg max-w-xs truncate text-slate-300">
            <span className="w-2 h-2 rounded-full shrink-0 bg-indigo-400" />
            <span className="truncate">{documentName}</span>
          </div>
        )}

        {/* Right Action / Profile */}
        <div className="flex items-center gap-3">
          {/* Quick Raw JSON trigger (Admin Panel Only) */}
          {user?.isAdmin && currentStage === 'admin' && onOpenJsonInspector && (
            <button
              type="button"
              onClick={onOpenJsonInspector}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
              title="Inspect or Import Raw MCQ JSON Schema"
            >
              <span className="font-mono text-emerald-400 text-[11px] font-bold">&#123;JSON&#125;</span>
            </button>
          )}

          {currentStage === 'study' ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-md">
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Study Mode</span>
              </div>
              {onExitTest && (
                <button
                  type="button"
                  onClick={onExitTest}
                  className="text-xs text-slate-400 hover:text-slate-200 bg-slate-800 px-2.5 py-1 rounded border border-slate-700 transition cursor-pointer"
                >
                  Exit Study
                </button>
              )}
            </div>
          ) : user ? (
            <div className="flex items-center gap-3">
              {/* Role pill and user identity */}
              <div className="flex items-center gap-2">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-semibold text-white leading-tight">
                    {user.displayName || 'Candidate'}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate max-w-[150px]">
                    {user.email}
                  </p>
                </div>

                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                    user.isAdmin
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40'
                      : 'bg-slate-700/60 text-slate-300 border-slate-600'
                  }`}
                >
                  {user.isAdmin ? 'Admin' : 'User'}
                </span>
              </div>

              {/* Logout Button */}
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};
