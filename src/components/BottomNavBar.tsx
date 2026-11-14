import React from 'react';
import {
  Home,
  FileText,
  BarChart3,
  AlertCircle,
  User,
  Bookmark,
} from 'lucide-react';

export type UserNavTab = 'home' | 'tests' | 'analytics' | 'mistakes' | 'profile' | 'bookmarks';

interface BottomNavBarProps {
  currentTab: UserNavTab;
  onSelectTab: (tab: UserNavTab) => void;
  mistakesCount?: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  currentTab,
  onSelectTab,
  mistakesCount = 0,
}) => {
  const navItems = [
    {
      id: 'home' as UserNavTab,
      label: 'Home',
      icon: Home,
    },
    {
      id: 'tests' as UserNavTab,
      label: 'Tests',
      icon: FileText,
    },
    {
      id: 'analytics' as UserNavTab,
      label: 'Analytics',
      icon: BarChart3,
    },
    {
      id: 'mistakes' as UserNavTab,
      label: 'Mistakes',
      icon: AlertCircle,
      badge: mistakesCount > 0 ? mistakesCount : undefined,
    },
    {
      id: 'profile' as UserNavTab,
      label: 'Profile',
      icon: User,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-2 py-1.5 flex items-center justify-around shadow-lg transition-all">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectTab(item.id)}
            className={`flex flex-col items-center justify-center py-1 px-3 sm:px-4 rounded-xl transition-all duration-150 cursor-pointer relative ${
              isActive
                ? 'text-blue-600 font-bold bg-blue-50'
                : 'text-slate-500 hover:text-slate-900 font-medium'
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} />
              {item.badge !== undefined && (
                <span className="absolute -top-1 -right-2 bg-rose-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
