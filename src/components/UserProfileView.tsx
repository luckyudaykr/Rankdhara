import React, { useState } from 'react';
import {
  User,
  Mail,
  Edit3,
  LogOut,
  Bookmark,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  X,
  Save,
  Award,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { UserProfile } from '../types';
import { updateUserProfileDisplayName } from '../services/authService';

interface UserProfileViewProps {
  user: UserProfile;
  onLogout: () => void;
  onOpenBookmarks: () => void;
  onOpenMistakes: () => void;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  user,
  onLogout,
  onOpenBookmarks,
  onOpenMistakes,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(user.displayName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDisplayName.trim()) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateUserProfileDisplayName(newDisplayName.trim());
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsEditingName(false);
      }, 1000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update name');
    } finally {
      setIsSaving(false);
    }
  };

  const getInitials = (name?: string, email?: string) => {
    if (name?.trim()) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return 'CD';
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Profile Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-8 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
            {getInitials(user.displayName, user.email)}
          </div>

          {/* Details */}
          <div className="flex-1 text-center sm:text-left space-y-2">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                {user.displayName || 'Candidate'}
              </h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {user.isAdmin ? 'Admin' : 'CBT Candidate'}
              </span>
            </div>

            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-slate-500 font-medium">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span>{user.email}</span>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setNewDisplayName(user.displayName || '');
                  setIsEditingName(true);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Display Name</span>
              </button>
            </div>
          </div>
        </div>

        {/* Edit Modal / Inline Drawer */}
        {isEditingName && (
          <form
            onSubmit={handleSaveDisplayName}
            className="mt-6 pt-5 border-t border-slate-100 bg-slate-50/70 p-4 rounded-2xl border border-slate-200 space-y-3"
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                Update Display Name
              </label>
              <button
                type="button"
                onClick={() => setIsEditingName(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 font-medium"
                required
              />

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isSaving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Save</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  className="px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl"
                >
                  Cancel
                </button>
              </div>
            </div>

            {saveSuccess && (
              <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Display name updated successfully!
              </p>
            )}

            {saveError && (
              <p className="text-xs font-semibold text-rose-600">{saveError}</p>
            )}
          </form>
        )}
      </div>

      {/* Quick Navigation Sections */}
      <div className="bg-white rounded-2xl border border-slate-200/90 divide-y divide-slate-100 overflow-hidden shadow-xs">
        {/* Bookmarks */}
        <button
          type="button"
          onClick={onOpenBookmarks}
          className="w-full p-4.5 flex items-center justify-between hover:bg-slate-50 transition text-left cursor-pointer group"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
              <Bookmark className="w-5 h-5 fill-amber-200" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition">
                Bookmarked Questions
              </h4>
              <p className="text-xs text-slate-500">
                View and practice questions you saved across tests
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition" />
        </button>

        {/* Mistakes */}
        <button
          type="button"
          onClick={onOpenMistakes}
          className="w-full p-4.5 flex items-center justify-between hover:bg-slate-50 transition text-left cursor-pointer group"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition">
                Mistakes Notebook
              </h4>
              <p className="text-xs text-slate-500">
                Wrong and skipped questions compiled for quick revision
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition" />
        </button>
      </div>

      {/* Logout Action */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <button
          type="button"
          onClick={onLogout}
          className="w-full py-3 px-4 rounded-xl border border-rose-200 text-rose-700 bg-rose-50/50 hover:bg-rose-50 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out of Account</span>
        </button>
      </div>
    </div>
  );
};
