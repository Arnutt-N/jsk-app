'use client';

import React from 'react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

const COMMON_EMOJIS = ['😊', '😂', '❤️', '👍', '😭', '🙏', '🔥', '🎉', '🤔', '👀', '✨', '🥺'];

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  return (
    <div className="w-64 p-3 bg-surface border border-border-default rounded-lg shadow-xl animate-scale-in">
      <div className="grid grid-cols-6 gap-2">
        {COMMON_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            className="w-10 h-10 flex items-center justify-center text-xl hover:bg-muted rounded transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
