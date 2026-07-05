'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MessageSquareText, Search, X } from 'lucide-react';

interface CannedResponse {
  id: number;
  shortcut: string;
  title: string;
  content: string;
  category: string;
}

interface CannedResponsePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (content: string) => void;
  inputText?: string;
}

export const CannedResponsePicker: React.FC<CannedResponsePickerProps> = ({
  isOpen,
  onClose,
  onSelect,
  inputText = '',
}) => {
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const begin = setTimeout(() => setLoading(true), 0);
    fetch('/api/v1/admin/canned-responses')
      .then(res => res.json())
      .then(data => {
        setResponses(data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => clearTimeout(begin);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
      const timer = setTimeout(() => setActiveIndex(0), 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Filter by shortcut prefix from input text (e.g. typing "/" shows all)
  useEffect(() => {
    if (inputText.startsWith('/')) {
      const timer = setTimeout(() => setSearch(inputText), 0);
      return () => clearTimeout(timer);
    }
  }, [inputText]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, input');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = responses.filter(r => {
    const q = search.toLowerCase();
    return (
      r.shortcut.toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      r.content.toLowerCase().includes(q)
    );
  });

  const grouped = filtered.reduce<Record<string, CannedResponse[]>>((acc, r) => {
    const cat = r.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});

  const flatFiltered = filtered;

  const selectAt = (index: number) => {
    const selected = flatFiltered[index];
    if (!selected) return;
    onSelect(selected.content);
    onClose();
  };

  const activeOptionId = flatFiltered[activeIndex] ? `canned-response-option-${flatFiltered[activeIndex].id}` : undefined;

  return (
    <div
      ref={dialogRef}
      className="absolute bottom-full left-0 right-0 mb-2 bg-surface rounded-2xl shadow-xl border border-border-default z-50 max-h-80 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Canned responses"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
        <MessageSquareText className="w-4 h-4 text-text-tertiary" />
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (!flatFiltered.length) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((idx) => Math.min(idx + 1, flatFiltered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((idx) => Math.max(idx - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                selectAt(activeIndex);
              }
            }}
            placeholder="Search canned responses..."
            className="w-full pl-7 pr-2 py-1 text-sm bg-surface text-text-primary border border-border-default rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
            aria-label="Search canned responses"
          />
        </div>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded" aria-label="Close canned responses">
          <X className="w-4 h-4 text-text-tertiary" />
        </button>
      </div>

      <div
        className="overflow-y-auto flex-1 p-1 scrollbar-thin"
        role="listbox"
        aria-label="Canned response options"
        aria-activedescendant={activeOptionId}
      >
        {loading && (
          <div className="text-center py-4 text-sm text-text-tertiary">Loading...</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-4 text-sm text-text-tertiary">No responses found</div>
        )}
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <div className="px-3 py-1 text-xs font-medium text-text-tertiary uppercase tracking-wider">
              {category}
            </div>
            {items.map(r => {
              const listIndex = flatFiltered.findIndex((x) => x.id === r.id);
              const isActive = listIndex === activeIndex;
              return (
              <button
                key={r.id}
                id={`canned-response-option-${r.id}`}
                onClick={() => {
                  onSelect(r.content);
                  onClose();
                }}
                className={`w-full text-left px-3 py-2 rounded-xl flex items-start gap-2 group transition-all ${isActive ? 'bg-primary/8' : 'hover:bg-primary/5'}`}
                role="option"
                aria-selected={isActive}
              >
                <span className="text-xs font-mono text-primary bg-primary/8 px-1.5 py-0.5 rounded-lg shrink-0">
                  {r.shortcut}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-secondary truncate">{r.title}</div>
                  <div className="text-xs text-text-tertiary truncate">{r.content}</div>
                </div>
              </button>
            )})}
          </div>
        ))}
      </div>
    </div>
  );
};
