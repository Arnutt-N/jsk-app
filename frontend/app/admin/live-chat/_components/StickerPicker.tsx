'use client';

import React from 'react';
import { Smile } from 'lucide-react';

interface StickerPickerProps {
  onSelect: (packageId: string, stickerId: string) => void;
}

const MOCK_STICKERS = [
  { pkg: '446', id: '1988', url: 'https://stickershop.line-scdn.net/stickershop/v1/sticker/1988/ANDROID/sticker.png' },
  { pkg: '446', id: '1989', url: 'https://stickershop.line-scdn.net/stickershop/v1/sticker/1989/ANDROID/sticker.png' },
  { pkg: '446', id: '1990', url: 'https://stickershop.line-scdn.net/stickershop/v1/sticker/1990/ANDROID/sticker.png' },
  { pkg: '446', id: '1991', url: 'https://stickershop.line-scdn.net/stickershop/v1/sticker/1991/ANDROID/sticker.png' },
  { pkg: '446', id: '1992', url: 'https://stickershop.line-scdn.net/stickershop/v1/sticker/1992/ANDROID/sticker.png' },
  { pkg: '446', id: '1993', url: 'https://stickershop.line-scdn.net/stickershop/v1/sticker/1993/ANDROID/sticker.png' },
  { pkg: '446', id: '1994', url: 'https://stickershop.line-scdn.net/stickershop/v1/sticker/1994/ANDROID/sticker.png' },
  { pkg: '446', id: '1995', url: 'https://stickershop.line-scdn.net/stickershop/v1/sticker/1995/ANDROID/sticker.png' },
];

export function StickerPicker({ onSelect }: StickerPickerProps) {
  return (
    <div className="w-full h-64 flex flex-col bg-white border border-border-default rounded-lg shadow-xl overflow-hidden animate-scale-in">
      {/* Header / Tabs */}
      <div className="flex items-center px-2 py-2 bg-gray-50 border-b border-border-default gap-2 overflow-x-auto no-scrollbar">
        <button className="p-1.5 rounded bg-white shadow-sm border border-border-default">
          <Smile className="w-4 h-4 text-brand-600" />
        </button>
        <span className="text-xs text-text-tertiary">More packs coming soon...</span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
          {MOCK_STICKERS.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.pkg, s.id)}
              className="aspect-square flex items-center justify-center p-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-border-default transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt={`Sticker ${s.id}`} className="w-full h-full object-contain" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
