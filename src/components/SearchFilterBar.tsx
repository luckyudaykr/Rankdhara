import React from 'react';
import { Search, X, Filter, SlidersHorizontal, CheckCircle2, Bookmark, RotateCcw } from 'lucide-react';

export interface FilterCriteria {
  searchQuery: string;
  difficulty?: 'All' | 'Easy' | 'Medium' | 'Hard';
  status?: 'All' | 'Bookmarked' | 'Answered' | 'Unanswered' | 'Correct' | 'Incorrect';
  type?: 'All' | 'factual' | 'conceptual' | 'application';
}

interface SearchFilterBarProps {
  filters: FilterCriteria;
  onFilterChange: (filters: FilterCriteria) => void;
  totalCount: number;
  filteredCount: number;
  availableDifficulties?: ('All' | 'Easy' | 'Medium' | 'Hard')[];
  availableStatuses?: ('All' | 'Bookmarked' | 'Answered' | 'Unanswered' | 'Correct' | 'Incorrect')[];
  placeholder?: string;
  className?: string;
}

export const SearchFilterBar: React.FC<SearchFilterBarProps> = ({
  filters,
  onFilterChange,
  totalCount,
  filteredCount,
  availableDifficulties = ['All', 'Easy', 'Medium', 'Hard'],
  availableStatuses,
  placeholder = 'Search questions, options, or explanations...',
  className = '',
}) => {
  const hasActiveFilters =
    Boolean(filters.searchQuery.trim()) ||
    (filters.difficulty && filters.difficulty !== 'All') ||
    (filters.status && filters.status !== 'All') ||
    (filters.type && filters.type !== 'All');

  const handleReset = () => {
    onFilterChange({
      searchQuery: '',
      difficulty: 'All',
      status: 'All',
      type: 'All',
    });
  };

  return (
    <div
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xs transition ${className}`}
    >
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) =>
              onFilterChange({ ...filters, searchQuery: e.target.value })
            }
            placeholder={placeholder}
            className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition placeholder:text-slate-400"
          />
          {filters.searchQuery && (
            <button
              type="button"
              onClick={() => onFilterChange({ ...filters, searchQuery: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Badges & Selects */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Difficulty Dropdown */}
          {availableDifficulties.length > 1 && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-xl border border-slate-200/80 dark:border-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                Diff:
              </span>
              <select
                value={filters.difficulty || 'All'}
                onChange={(e) =>
                  onFilterChange({
                    ...filters,
                    difficulty: e.target.value as any,
                  })
                }
                className="text-xs font-semibold bg-transparent text-slate-700 dark:text-slate-200 focus:outline-hidden cursor-pointer"
              >
                {availableDifficulties.map((diff) => (
                  <option key={diff} value={diff} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                    {diff}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status Dropdown if supplied */}
          {availableStatuses && availableStatuses.length > 0 && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-xl border border-slate-200/80 dark:border-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                Status:
              </span>
              <select
                value={filters.status || 'All'}
                onChange={(e) =>
                  onFilterChange({
                    ...filters,
                    status: e.target.value as any,
                  })
                }
                className="text-xs font-semibold bg-transparent text-slate-700 dark:text-slate-200 focus:outline-hidden cursor-pointer"
              >
                {availableStatuses.map((st) => (
                  <option key={st} value={st} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                    {st}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Result Count and Reset button */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
              <strong className="text-slate-900 dark:text-slate-100">{filteredCount}</strong> of {totalCount}
            </span>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 px-2 py-1 rounded-lg transition cursor-pointer"
                title="Reset all filters"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
