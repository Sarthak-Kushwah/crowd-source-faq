import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { getPublicUrl } from '../../../utils/publicUrl';

const PAGE_LABELS: Record<string, string> = {
  '/admin':          'Dashboard',
  '/admin/faqs':     'FAQs',
  '/admin/faqs/review': 'FAQ Review',
  '/admin/community': 'Community',
  '/admin/users':     'Users',
  '/admin/moderation': 'Moderation',
  '/admin/leaderboard': 'Leaderboard',
  '/admin/unresolved-search': 'FAQ Gaps',
  '/admin/zoom-meetings': 'Zoom Meetings',
  '/admin/zoom-insights': 'Zoom Insights',
  '/admin/settings': 'Settings',
  '/admin/settings/ai': 'AI Settings',
};

interface AdminNavbarProps { onMobileMenuToggle: () => void; }

export default function AdminNavbar({ onMobileMenuToggle }: AdminNavbarProps) {
  const location = useLocation();
  const { user } = useAdminAuth();
  const label = PAGE_LABELS[location.pathname] ?? 'Admin';
  const publicUrl = getPublicUrl();

  return (
    <header className="h-14 bg-card/80 backdrop-blur-md border-b border-border flex items-center justify-between px-5 shrink-0 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button onClick={onMobileMenuToggle}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-ink-faint hover:text-ink hover:bg-mist transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <h1 className="text-sm font-semibold text-ink">{label}</h1>
      </div>
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="text-xs text-ink-faint hover:text-ink border border-border rounded-lg px-3 py-1.5 hover:bg-mist transition-all"
        >
          ← Website
        </Link>
        <div className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-[11px] font-semibold text-accent">
          {user?.name?.[0]?.toUpperCase() ?? 'A'}
        </div>
        <div className="hidden sm:block">
          <p className="text-xs font-medium text-ink leading-none">{user?.name}</p>
          <p className="text-[10px] text-ink-faint mt-0.5 leading-none">{user?.role}</p>
        </div>
      </div>
    </header>
  );
}
