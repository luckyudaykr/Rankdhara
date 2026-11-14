import React, { useState, useEffect } from 'react';
import {
  CatalogExam,
  ExamAlias,
  UnmappedExamTag,
  OrganizeReport,
} from '../types';
import {
  fetchCatalogExams,
  saveCatalogExam,
  updateCatalogExam,
  deleteCatalogExam,
  fetchExamAliases,
  saveExamAlias,
  deleteExamAlias,
  fetchUnmappedTags,
  mapTagToOneTap,
  runOrganizeQuestions,
  runAiAutoClassify,
} from '../services/cloudStorageService';
import {
  GraduationCap,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Sparkles,
  RefreshCw,
  Tag,
  AlertTriangle,
  CheckCircle2,
  X,
  FolderTree,
  ChevronRight,
} from 'lucide-react';

interface ManageExamsTabProps {
  onSuccessBanner: (msg: string) => void;
  onErrorBanner: (msg: string) => void;
}

export const ManageExamsTab: React.FC<ManageExamsTabProps> = ({
  onSuccessBanner,
  onErrorBanner,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'exams' | 'aliases' | 'unmapped'>('exams');

  const [exams, setExams] = useState<CatalogExam[]>([]);
  const [aliases, setAliases] = useState<ExamAlias[]>([]);
  const [unmappedTags, setUnmappedTags] = useState<UnmappedExamTag[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/Edit Exam modal state
  const [editingExam, setEditingExam] = useState<Partial<CatalogExam> | null>(null);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);

  // Add Alias form
  const [newAliasPattern, setNewAliasPattern] = useState('');
  const [newAliasExamId, setNewAliasExamId] = useState('');
  const [isSavingAlias, setIsSavingAlias] = useState(false);

  // Unmapped mapping inline state: map tag -> selected examId
  const [mappingSelections, setMappingSelections] = useState<Record<string, string>>({});
  const [mappingLoadingTag, setMappingLoadingTag] = useState<string | null>(null);

  // Organize & AI Auto-Classify operation states
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [isAiClassifying, setIsAiClassifying] = useState(false);
  const [organizeReport, setOrganizeReport] = useState<OrganizeReport | null>(null);
  const [showOrganizeModal, setShowOrganizeModal] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [exRes, alRes, unRes] = await Promise.all([
        fetchCatalogExams(true), // include inactive
        fetchExamAliases(),
        fetchUnmappedTags(),
      ]);
      setExams(exRes);
      setAliases(alRes);
      setUnmappedTags(unRes);
    } catch (err: any) {
      onErrorBanner(err.message || 'Failed to load exam management data');
    } finally {
      setLoading(false);
    }
  };

  // Exam CRUD handlers
  const handleOpenAddExam = () => {
    setEditingExam({
      name: '',
      shortName: '',
      categoryGroup: 'State PCS',
      active: true,
      order: exams.length + 1,
    });
    setIsExamModalOpen(true);
  };

  const handleOpenEditExam = (exam: CatalogExam) => {
    setEditingExam({ ...exam });
    setIsExamModalOpen(true);
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExam?.name?.trim() || !editingExam?.shortName?.trim()) {
      alert('Please fill in exam full name and short name.');
      return;
    }

    try {
      if (editingExam.id) {
        // Update
        const res = await updateCatalogExam(editingExam.id, editingExam);
        if (res.success && res.exam) {
          setExams((prev) =>
            prev.map((x) => (x.id === editingExam.id ? res.exam! : x))
          );
          onSuccessBanner(`Updated exam "${res.exam.name}".`);
        }
      } else {
        // Create
        const res = await saveCatalogExam(editingExam);
        if (res.success && res.exam) {
          setExams((prev) => [...prev, res.exam!]);
          onSuccessBanner(`Created new exam "${res.exam.name}".`);
        }
      }
      setIsExamModalOpen(false);
      setEditingExam(null);
    } catch (err: any) {
      onErrorBanner(err.message || 'Failed to save exam.');
    }
  };

  const handleToggleExamActive = async (exam: CatalogExam) => {
    const nextActive = !exam.active;
    try {
      await updateCatalogExam(exam.id, { active: nextActive });
      setExams((prev) =>
        prev.map((x) => (x.id === exam.id ? { ...x, active: nextActive } : x))
      );
      onSuccessBanner(
        `${nextActive ? 'Activated' : 'Hidden'} exam "${exam.shortName}".`
      );
    } catch (err: any) {
      onErrorBanner(err.message || 'Failed to toggle status.');
    }
  };

  const handleMoveExamOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= exams.length) return;

    const reordered = [...exams];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    // Update display orders
    const updated = reordered.map((ex, idx) => ({ ...ex, order: idx + 1 }));
    setExams(updated);

    // Save orders in background
    try {
      await Promise.all([
        updateCatalogExam(updated[index].id, { order: updated[index].order }),
        updateCatalogExam(updated[targetIndex].id, { order: updated[targetIndex].order }),
      ]);
    } catch (err) {
      console.warn('Reorder save background error:', err);
    }
  };

  const handleDeleteExam = async (examId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete exam "${name}"?`)) return;
    try {
      await deleteCatalogExam(examId);
      setExams((prev) => prev.filter((x) => x.id !== examId));
      onSuccessBanner(`Exam "${name}" deleted.`);
    } catch (err: any) {
      onErrorBanner(err.message || 'Failed to delete exam.');
    }
  };

  // Alias CRUD handlers
  const handleAddAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAliasPattern.trim() || !newAliasExamId) {
      alert('Please enter alias pattern and select target catalog exam.');
      return;
    }
    const targetExam = exams.find((x) => x.id === newAliasExamId);
    if (!targetExam) return;

    setIsSavingAlias(true);
    try {
      const res = await saveExamAlias({
        tag: newAliasPattern.trim(),
        examId: targetExam.id,
        examName: targetExam.name,
      });
      if (res.success && res.alias) {
        setAliases((prev) => [...prev, res.alias!]);
        setNewAliasPattern('');
        setNewAliasExamId('');
        onSuccessBanner(`Mapped alias "${res.alias.tag}" to ${targetExam.name}.`);
      }
    } catch (err: any) {
      onErrorBanner(err.message || 'Failed to save alias.');
    } finally {
      setIsSavingAlias(false);
    }
  };

  const handleDeleteAlias = async (aliasId: string, pattern: string) => {
    if (!confirm(`Delete alias "${pattern}"?`)) return;
    try {
      await deleteExamAlias(aliasId);
      setAliases((prev) => prev.filter((a) => a.id !== aliasId));
      onSuccessBanner(`Alias "${pattern}" removed.`);
    } catch (err: any) {
      onErrorBanner(err.message || 'Failed to delete alias.');
    }
  };

  // One-tap mapping for unmapped tags
  const handleMapUnmappedTag = async (tag: string) => {
    const targetExamId = mappingSelections[tag];
    if (!targetExamId) {
      alert('Please choose an exam to map this tag to.');
      return;
    }
    const chosenExam = exams.find((x) => x.id === targetExamId);
    if (!chosenExam) return;

    setMappingLoadingTag(tag);
    try {
      const success = await mapTagToOneTap(tag, targetExamId, chosenExam.shortName || chosenExam.name);
      if (success) {
        setUnmappedTags((prev) => prev.filter((u) => u.tag !== tag));
        onSuccessBanner(`Successfully mapped tag "${tag}" to ${chosenExam.name}.`);
        // Refresh aliases list
        const updatedAliases = await fetchExamAliases();
        setAliases(updatedAliases);
      }
    } catch (err: any) {
      onErrorBanner(err.message || 'Failed to map tag.');
    } finally {
      setMappingLoadingTag(null);
    }
  };

  // Organize Execution
  const handleRunOrganize = async () => {
    setIsOrganizing(true);
    try {
      const report = await runOrganizeQuestions();
      setOrganizeReport(report);
      setShowOrganizeModal(true);
      onSuccessBanner(
        `Organize complete! Processed ${report.totalQuestionsProcessed} questions and generated ${report.readyMadeTestsCreated} ready-made tests.`
      );
      await loadAll();
    } catch (err: any) {
      onErrorBanner(err.message || 'Organize failed.');
    } finally {
      setIsOrganizing(false);
    }
  };

  // AI Auto-Classify Untagged Questions
  const handleRunAiClassify = async () => {
    setIsAiClassifying(true);
    try {
      const report = await runAiAutoClassify();
      const totalUpdated = report.ruleUpdatedCount + report.aiUpdatedCount;
      const remNote =
        report.remainingUntagged > 0
          ? ` (${report.remainingUntagged} more untagged remaining — click again to classify next batch)`
          : '';
      onSuccessBanner(
        `Auto-Classify complete! Scanned ${report.totalScanned} questions: ${totalUpdated} updated (${report.aiUpdatedCount} via AI) across ${report.updatedTestsCount} test(s).${remNote}`
      );
      await loadAll();
    } catch (err: any) {
      onErrorBanner(err.message || 'AI Auto-Classify failed.');
    } finally {
      setIsAiClassifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Summary Bar */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <FolderTree className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-800">
              Manage Exams, Aliases & Question Taxonomy
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Curate target exams, alias patterns printed in past year PDFs, and run the automatic Question & Test Organizer.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleRunAiClassify}
            disabled={isAiClassifying || isOrganizing}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50"
            title="Use keyword rules + AI to classify General Studies / Uncategorized questions into subjects, chapters, and exams"
          >
            <Sparkles className={`w-4 h-4 text-amber-200 ${isAiClassifying ? 'animate-spin' : ''}`} />
            <span>{isAiClassifying ? 'AI Classifying...' : 'AI Auto-Classify Untagged'}</span>
          </button>

          <button
            onClick={handleRunOrganize}
            disabled={isOrganizing || isAiClassifying}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50"
            title="Scan question catalog, fill exam mapping & taxonomy, split <=100 tests, and create ready-made tests"
          >
            <Sparkles className={`w-4 h-4 text-amber-300 ${isOrganizing ? 'animate-spin' : ''}`} />
            <span>{isOrganizing ? 'Organizing Questions...' : 'Organize Questions & Tests'}</span>
          </button>

          <button
            onClick={handleOpenAddExam}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs rounded-xl shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4 text-blue-600" />
            <span>Add New Exam</span>
          </button>

          <button
            onClick={loadAll}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveSubTab('exams')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeSubTab === 'exams'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Catalog Exams ({exams.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('aliases')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeSubTab === 'aliases'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Exam Alias Mappings ({aliases.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('unmapped')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors relative ${
            activeSubTab === 'unmapped'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>Unmapped Exam Tags</span>
          {unmappedTags.length > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] font-black rounded-full bg-amber-500 text-white">
              {unmappedTags.length}
            </span>
          )}
        </button>
      </div>

      {/* SUB-TAB 1: CATALOG EXAMS */}
      {activeSubTab === 'exams' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Exam Catalog (23 Target Exams)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Competitive exams shown to users. You can rename, reorder, or hide any exam anytime.
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {exams.filter((x) => x.active).length} active / {exams.length} total
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3 text-center w-16">Order</th>
                  <th className="py-3 px-4">Exam Name</th>
                  <th className="py-3 px-3">Short Code</th>
                  <th className="py-3 px-3">Category Group</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exams.map((exam, idx) => (
                  <tr
                    key={exam.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      !exam.active ? 'bg-slate-50/40 opacity-70' : ''
                    }`}
                  >
                    {/* Order buttons */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleMoveExamOrder(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                          title="Move up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[11px] font-mono font-bold text-slate-500 w-4">
                          {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleMoveExamOrder(idx, 'down')}
                          disabled={idx === exams.length - 1}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                          title="Move down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    {/* Name */}
                    <td className="py-3 px-4 font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <span>{exam.name}</span>
                      </div>
                    </td>

                    {/* Short Code */}
                    <td className="py-3 px-3">
                      <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
                        {exam.shortName}
                      </span>
                    </td>

                    {/* Category Group */}
                    <td className="py-3 px-3">
                      <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium">
                        {exam.categoryGroup}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleExamActive(exam)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                          exam.active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {exam.active ? (
                          <>
                            <Eye className="w-3 h-3 text-emerald-600" />
                            <span>Active</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3 text-slate-400" />
                            <span>Hidden</span>
                          </>
                        )}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditExam(exam)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit / Rename"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteExam(exam.id, exam.name)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete Exam"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: EXAM ALIAS MAPPINGS */}
      {activeSubTab === 'aliases' && (
        <div className="space-y-4">
          {/* Add New Alias Form */}
          <form
            onSubmit={handleAddAlias}
            className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-end gap-3 text-xs"
          >
            <div className="w-full sm:flex-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Raw Tag / Alias Pattern in PDF
              </label>
              <input
                type="text"
                placeholder="e.g. U.P.P.C.S., 66th B.P.S.C., I.A.S."
                value={newAliasPattern}
                onChange={(e) => setNewAliasPattern(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="w-full sm:flex-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Map To Catalog Exam
              </label>
              <select
                value={newAliasExamId}
                onChange={(e) => setNewAliasExamId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="">-- Choose Target Exam --</option>
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.shortName} - {ex.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={isSavingAlias}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Alias Mapping</span>
            </button>
          </form>

          {/* Aliases List Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Active Alias Mappings</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  When questions are parsed from PDFs, these aliases are normalized automatically.
                </p>
              </div>
              <span className="text-xs text-slate-400 font-mono">{aliases.length} mapped aliases</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Pattern / Tag in PDF</th>
                    <th className="py-3 px-4">Mapped Catalog Exam</th>
                    <th className="py-3 px-4 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {aliases.map((al) => (
                    <tr key={al.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                        {al.tag}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-blue-700 flex items-center gap-2">
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        <span>{al.examName}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteAlias(al.id, al.tag)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete Alias"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: UNMAPPED EXAM TAGS (ONE-TAP MAPPING) */}
      {activeSubTab === 'unmapped' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Unmapped Exam Tags</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tags detected during PDF extraction that did not match any catalog alias. Map them in one tap.
              </p>
            </div>
            <span className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full font-bold border border-amber-200">
              {unmappedTags.length} Unmapped Tags
            </span>
          </div>

          {unmappedTags.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="font-bold text-slate-700 text-sm">All Exam Tags Are Mapped!</p>
              <p className="mt-1">Every question extracted so far belongs to a recognized catalog exam.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {unmappedTags.map((item) => {
                const isMapping = mappingLoadingTag === item.tag;
                return (
                  <div
                    key={item.tag}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-800 text-sm bg-slate-100 px-2.5 py-1 rounded-lg">
                          "{item.tag}"
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500">
                          Found in {item.questionCount} question(s)
                        </span>
                      </div>
                      {item.sampleQuestion && (
                        <p className="text-xs text-slate-500 mt-1.5 line-clamp-1 italic max-w-lg">
                          Sample: {item.sampleQuestion}
                        </p>
                      )}
                    </div>

                    {/* One-tap Mapping Controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={mappingSelections[item.tag] || ''}
                        onChange={(e) =>
                          setMappingSelections({
                            ...mappingSelections,
                            [item.tag]: e.target.value,
                          })
                        }
                        className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      >
                        <option value="">-- Choose Exam --</option>
                        {exams.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.shortName} ({ex.name})
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => handleMapUnmappedTag(item.tag)}
                        disabled={isMapping || !mappingSelections[item.tag]}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-40"
                      >
                        {isMapping ? 'Mapping...' : 'Map Tag'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Exam Modal */}
      {isExamModalOpen && editingExam && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-slate-800 text-base">
                {editingExam.id ? 'Edit Catalog Exam' : 'Add New Catalog Exam'}
              </h3>
              <button
                onClick={() => setIsExamModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExam} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Exam Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bihar Police SI (Daroga)"
                  value={editingExam.name || ''}
                  onChange={(e) => setEditingExam({ ...editingExam, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Short Display Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bihar Police SI"
                  value={editingExam.shortName || ''}
                  onChange={(e) => setEditingExam({ ...editingExam, shortName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Category Group
                </label>
                <select
                  value={editingExam.categoryGroup || 'State PCS'}
                  onChange={(e) => setEditingExam({ ...editingExam, categoryGroup: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium"
                >
                  <option value="State PCS">State PCS</option>
                  <option value="Civil Services">Civil Services</option>
                  <option value="Police Exams">Police Exams</option>
                  <option value="SSC Exams">SSC Exams</option>
                  <option value="Railways">Railways</option>
                  <option value="Teaching">Teaching</option>
                  <option value="Banking">Banking</option>
                  <option value="Defence">Defence</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="activeFlag"
                  checked={editingExam.active ?? true}
                  onChange={(e) => setEditingExam({ ...editingExam, active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="activeFlag" className="text-slate-700 font-semibold">
                  Active (visible in candidate browse and test builder)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsExamModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm"
                >
                  Save Exam
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Organize Report Modal */}
      {showOrganizeModal && organizeReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-800 text-base">Organize Execution Report</h3>
              </div>
              <button
                onClick={() => setShowOrganizeModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 text-xs pr-1 flex-1">
              {/* Metric stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Processed</span>
                  <span className="text-lg font-black text-slate-800 mt-0.5 block">
                    {organizeReport.totalQuestionsProcessed}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-center">
                  <span className="text-[10px] font-bold text-blue-700 uppercase block">Exam Mapped</span>
                  <span className="text-lg font-black text-blue-900 mt-0.5 block">
                    {organizeReport.mappedQuestionsCount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-center">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase block">Unplaced</span>
                  <span className="text-lg font-black text-indigo-900 mt-0.5 block">
                    {organizeReport.unplacedQuestionsCount}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase block">Tests Built</span>
                  <span className="text-lg font-black text-emerald-900 mt-0.5 block">
                    {organizeReport.readyMadeTestsCreated}
                  </span>
                </div>
              </div>

              {/* Ready-made tests overview */}
              <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 text-emerald-800">
                <p className="font-bold text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Ready-made tests created & balanced (5 to 100 questions per test)
                </p>
                <p className="text-[11px] text-emerald-700 mt-1">
                  Synthesized chapter-wise, subject-wise, exam-wise, and past year question sets. All titles use subjects, chapters, and exams instead of raw PDF file names.
                </p>
              </div>

              {/* Unplaced Questions Review List */}
              {organizeReport.unplacedSampleQuestions && organizeReport.unplacedSampleQuestions.length > 0 ? (
                <div>
                  <h4 className="font-bold text-slate-800 text-xs mb-2 flex items-center gap-1.5 text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    Unplaced Questions Review List ({organizeReport.unplacedQuestionsCount})
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                    {organizeReport.unplacedSampleQuestions.map((q, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-white border border-slate-200 text-slate-700">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                          <span>Exam: {q.rawExamName || 'None'}</span>
                          <span>Year: {q.rawYear || 'None'}</span>
                        </div>
                        <p className="font-medium line-clamp-2">{q.question}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center text-slate-600">
                  Zero unplaced questions. 100% of questions successfully organized.
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowOrganizeModal(false)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
