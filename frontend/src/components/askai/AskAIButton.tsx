import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { friendlyError } from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';
import { useAuthModal } from '../../context/AuthModalContext';

// localStorage key + cap for anonymous AI search quota. The backend enforces
// a per-IP rate limit, but the user-facing 5-per-browser is the real product
// spec ("Anonymous users can perform up to 5 AI searches."). Logged-in users
// are unlimited.
const ANON_AI_LIMIT = 5;
const ANON_AI_COUNT_KEY = 'yaksha_anon_ai_count';
const ANON_AI_RESET_KEY = 'yaksha_anon_ai_reset';

interface Source {
  kind: 'knowledge' | 'faq' | 'community';
  title: string;
  snippet: string;
  score: number;
  href: string;
  id: string;
  aboveThreshold?: boolean;
}

interface AskResponse {
  question: string;
  answer: string;
  sources: Source[];
  relevantCount: number;
  sourceCount: number;
  model: string;
  aiFailed: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  loading?: boolean;
  error?: string;
}

/**
 * Reads the persisted anonymous-search counter. Resets automatically every
 * 24 hours so the cap feels like a "daily" quota rather than a lifetime cap.
 */
function readAnonCount(): number {
  try {
    const resetAt = Number(localStorage.getItem(ANON_AI_RESET_KEY) || 0);
    if (!resetAt || Date.now() > resetAt) {
      localStorage.setItem(ANON_AI_COUNT_KEY, '0');
      const nextReset = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem(ANON_AI_RESET_KEY, String(nextReset));
      return 0;
    }
    return Number(localStorage.getItem(ANON_AI_COUNT_KEY) || 0);
  } catch {
    return 0;
  }
}

function bumpAnonCount(): number {
  const next = readAnonCount() + 1;
  try {
    localStorage.setItem(ANON_AI_COUNT_KEY, String(next));
    if (!localStorage.getItem(ANON_AI_RESET_KEY)) {
      localStorage.setItem(ANON_AI_RESET_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    }
  } catch { /* localStorage may be disabled — silently ignore */ }
  return next;
}

/**
 * AskAIButton — floating AI search bar at the bottom-center.
 *
 * Design matches the Yaksha aesthetic (warm sage/cream):
 *   - 700-800px wide on desktop, responsive on mobile
 *   - 24px rounded pill, glassmorphism via backdrop-blur
 *   - Warm cream surface, sage accent border, soft floating shadow
 *   - AI/sparkle icon on left, sage gradient send button on right
 *   - Expands into a chat panel with messages + sources
 *   - Helper text: "Powered by RAG • Search FAQs, Wiki, and Community knowledge"
 *   - Sticky/fixed bottom-center with 24px margin
 *
 * Renders into the App layout (visible on all public pages).
 */
export default function AskAIButton() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { openModal } = useAuthModal();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Anonymous quota — read once on mount and on auth flip. Logged-in users
  // see the real-time count anyway, but they never hit the cap.
  const [anonCount, setAnonCount] = useState<number>(() => (isAuthenticated ? 0 : readAnonCount()));
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Refresh counter when the user signs in (so the header stops nagging once
  // they have an account) or when the panel re-opens.
  useEffect(() => {
    if (!isAuthenticated) {
      setAnonCount(readAnonCount());
    } else {
      setAnonCount(0);
    }
  }, [isAuthenticated, isOpen]);

  // Auto-resize textarea up to a max height
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = '24px';
      inputRef.current.style.height = Math.min(180, inputRef.current.scrollHeight) + 'px';
    }
  }, [query]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  const send = useCallback(async () => {
    const q = query.trim();
    if (q.length < 3 || isLoading) return;

    // Enforce the 5-search anonymous limit BEFORE making the request. Logged-in
    // users are unlimited. If the cap is hit, pop the sign-in modal with a
    // contextual prompt — no error toast, no failed network call.
    if (!isAuthenticated) {
      const current = readAnonCount();
      if (current >= ANON_AI_LIMIT) {
        window.dispatchEvent(new CustomEvent('authmodal:prompt', {
          detail: 'Please sign in to continue using AI search.',
        }));
        openModal('signin');
        return;
      }
    }

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: q };
    const aiMsg: ChatMessage = { id: `a-${Date.now()}`, role: 'assistant', content: '', loading: true };
    setMessages((m) => [...m, userMsg, aiMsg]);
    setQuery('');
    setIsLoading(true);

    try {
      const res = await api.post<AskResponse>('/ask-ai', { question: q });
      setMessages((m) => m.map((msg) => (msg.id === aiMsg.id
        ? { ...msg, content: res.data.answer, sources: res.data.sources, loading: false }
        : msg
      )));
      // Count the search only on success — failed calls shouldn't burn quota.
      if (!isAuthenticated) {
        const next = bumpAnonCount();
        setAnonCount(next);
        // If this was the last free one, nudge the user to sign in.
        if (next === ANON_AI_LIMIT) {
          // Defer so the message renders first; the modal opens on the
          // next click anyway via the guard above.
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('authmodal:prompt', {
              detail: 'Please sign in to continue using AI search.',
            }));
            openModal('signin');
          }, 1500);
        }
      }
    } catch (err: unknown) {
      setMessages((m) => m.map((msg) => (msg.id === aiMsg.id
        ? { ...msg, content: '', loading: false, error: friendlyError(err, 'Search failed. Please try again.') }
        : msg
      )));
    } finally {
      setIsLoading(false);
    }
  }, [query, isLoading, isAuthenticated, openModal]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const reset = () => {
    setMessages([]);
    setQuery('');
  };

  return (
    <>
      {/* Backdrop — only when open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px] transition-opacity"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Floating bar + panel */}
      <div
        className={`fixed z-50 left-1/2 -translate-x-1/2 transition-all duration-300 ease-out
          ${isOpen
            ? 'bottom-6 w-[min(800px,calc(100vw-32px))]'
            : 'bottom-6 w-[min(720px,calc(100vw-32px))]'
          }`}
      >
        {/* Chat panel — only when open */}
        {isOpen && (
          <div
            className="mb-3 rounded-2xl overflow-hidden backdrop-blur-2xl bg-cream/95 border border-border shadow-2xl shadow-ink/10"
            style={{ maxHeight: '60vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-cream to-bg">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-md shadow-accent/30">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
                    <path d="M12 2L13.5 7.5L19 9L13.5 10.5L12 16L10.5 10.5L5 9L10.5 7.5L12 2Z" />
                    <path d="M19 14L19.8 16.4L22 17L19.8 17.6L19 20L18.2 17.6L16 17L18.2 16.4L19 14Z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink">Yaksha AI Assistant</h3>
                  <p className="text-[10px] text-ink-soft">Powered by RAG · Searches FAQs, transcripts & community</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!isAuthenticated && (
                  <span
                    title={`${Math.max(0, ANON_AI_LIMIT - anonCount)} free AI searches left (24h quota)`}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      anonCount >= ANON_AI_LIMIT
                        ? 'bg-danger/10 text-danger border-danger/20'
                        : anonCount >= ANON_AI_LIMIT - 1
                        ? 'bg-warning/10 text-warning border-warning/20'
                        : 'bg-mist text-ink-soft border-border'
                    }`}
                  >
                    {Math.max(0, ANON_AI_LIMIT - anonCount)}/{ANON_AI_LIMIT} free
                  </span>
                )}
                {messages.length > 0 && (
                  <button
                    onClick={reset}
                    title="Clear chat"
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium text-ink-soft hover:text-ink hover:bg-mist transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  title="Close (Esc)"
                  className="w-7 h-7 rounded-md text-ink-soft hover:text-ink hover:bg-mist transition-colors flex items-center justify-center"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="overflow-y-auto px-4 py-4 space-y-3 bg-bg/40"
              style={{ maxHeight: 'calc(60vh - 130px)' }}
            >
              {messages.length === 0 && !isAuthenticated && anonCount >= ANON_AI_LIMIT && (
                <div className="text-center py-8 space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-ink">Please sign in to continue using AI search</p>
                  <p className="text-[11px] text-ink-soft max-w-xs mx-auto">You've used your {ANON_AI_LIMIT} free AI searches. Sign in for unlimited access — your daily limit resets in 24 hours.</p>
                  <button
                    onClick={() => openModal('signin')}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-accent text-accent-text text-xs font-semibold hover:bg-accent-hover transition-colors"
                  >
                    Sign in to continue
                  </button>
                </div>
              )}
              {messages.length === 0 && (isAuthenticated || anonCount < ANON_AI_LIMIT) && (
                <div className="text-center py-6 space-y-2.5">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                  </div>
                  <p className="text-sm text-ink-soft">Ask anything about your team's knowledge</p>
                  <p className="text-[11px] text-ink-faint">I'll search the FAQs, transcripts, and community for the best answer.</p>
                  <div className="flex flex-wrap gap-1.5 justify-center pt-2">
                    {['How do I reset the server?', 'When is the Q3 deadline?', 'How many engineers do we need?'].map((example) => (
                      <button
                        key={example}
                        onClick={() => setQuery(example)}
                        className="text-[11px] text-ink-soft hover:text-ink px-2.5 py-1 rounded-full border border-border hover:border-accent/40 hover:bg-accent/5 transition-all"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'user' ? (
                    <div className="max-w-[80%] px-3.5 py-2 rounded-2xl rounded-br-md bg-accent text-accent-text text-sm shadow-sm shadow-accent/20">
                      {m.content}
                    </div>
                  ) : m.loading ? (
                    <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-md bg-card border border-border flex items-center gap-2 text-ink-soft text-sm">
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                      Searching knowledge base…
                    </div>
                  ) : m.error ? (
                    <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-danger-light border border-danger/30 text-danger text-sm">
                      {m.error}
                    </div>
                  ) : (
                    <div className="max-w-[85%] space-y-2.5">
                      <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-card border border-border text-ink text-sm leading-relaxed whitespace-pre-wrap">
                        {m.content}
                      </div>
                      {m.sources && m.sources.length > 0 && (
                        <div className="space-y-1 pl-1">
                          <p className="text-[10px] uppercase tracking-wider text-ink-faint font-semibold pl-1">Sources ({m.sources.length})</p>
                          {m.sources.map((s, i) => {
                            const icon = s.kind === 'faq' ? '📋' : s.kind === 'community' ? '💬' : '🧠';
                            const kindLabel = s.kind === 'faq' ? 'FAQ' : s.kind === 'community' ? 'Community' : 'Knowledge';
                            return (
                              <button
                                key={`${s.id}-${i}`}
                                onClick={() => { setIsOpen(false); navigate(s.href); }}
                                className="w-full text-left flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-card hover:bg-mist border border-border hover:border-accent/40 transition-all group"
                              >
                                <span className="text-sm shrink-0 mt-0.5">{icon}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-soft">{kindLabel}</span>
                                    <span className="text-[9px] text-ink-faint">{Math.round(s.score * 100)}%</span>
                                  </div>
                                  <p className="text-xs text-ink line-clamp-1">{s.title}</p>
                                </div>
                                <svg className="w-3 h-3 text-ink-faint group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M9 18l6-6-6-6"/>
                                </svg>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The floating input bar itself — always visible */}
        <div
          className={`relative rounded-3xl overflow-hidden backdrop-blur-2xl transition-all duration-300
            bg-card/95
            ${isOpen
              ? 'border border-accent/40 shadow-2xl shadow-ink/15 ring-4 ring-accent/10'
              : 'border border-border shadow-2xl shadow-ink/10 hover:border-accent/40 hover:shadow-accent/10'
            }`}
        >
          <div className="relative flex items-center gap-2.5 px-4 py-3">
            {/* Left AI icon */}
            <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-md shadow-accent/25">
              {isLoading ? (
                <svg className="w-4 h-4 text-accent-text animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M12 2L13.5 7.5L19 9L13.5 10.5L12 16L10.5 10.5L5 9L10.5 7.5L12 2Z" />
                  <path d="M19 14L19.8 16.4L22 17L19.8 17.6L19 20L18.2 17.6L16 17L18.2 16.4L19 14Z" />
                </svg>
              )}
            </div>

            {/* Input */}
            <textarea
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={!isAuthenticated && anonCount >= ANON_AI_LIMIT
                ? 'Sign in to ask more questions…'
                : isOpen ? 'Ask anything… (Enter to send, Shift+Enter for newline)' : 'Ask the FAQ Assistant…'}
              rows={1}
              disabled={!isAuthenticated && anonCount >= ANON_AI_LIMIT}
              className="flex-1 bg-transparent text-ink placeholder:text-ink-faint text-sm focus:outline-none resize-none leading-6 max-h-[180px] py-0.5 caret-accent disabled:opacity-50 disabled:cursor-not-allowed"
            />

            {/* Send button — sage gradient circle */}
            <button
              onClick={send}
              disabled={query.trim().length < 3 || isLoading || (!isAuthenticated && anonCount >= ANON_AI_LIMIT)}
              title="Send (Enter)"
              className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent-dark hover:from-accent-hover hover:to-accent-dark active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md shadow-accent/30 flex items-center justify-center group"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>

          {/* Helper text */}
          <div className="relative px-4 pb-2.5 -mt-0.5">
            <p className="text-[10px] text-ink-faint text-center tracking-wide">
              Powered by RAG <span className="opacity-60">•</span> Search FAQs, Wiki, and Community knowledge
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
