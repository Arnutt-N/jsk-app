'use client';

import React, { memo } from 'react';
import { Bot, MoreVertical, Star, User } from 'lucide-react';

import type { Conversation } from '../_types';

interface ConversationItemProps {
  optionId: string;
  conversation: Conversation;
  selected: boolean;
  formattedTime?: string;
  onClick: () => void;
  onMenuClick: () => void;
}

export const ConversationItem = memo(function ConversationItem({
  optionId,
  conversation,
  selected,
  formattedTime,
  onClick,
  onMenuClick,
}: ConversationItemProps) {
  const isWaiting = conversation.session?.status === 'WAITING';
  const isActive = conversation.session?.status === 'ACTIVE';
  const isVip = conversation.tags?.some((t) => t.name.toUpperCase() === 'VIP');
  const isBot = conversation.chat_mode === 'BOT';

  return (
    <div
      id={optionId}
      role="option"
      aria-selected={selected}
      className={`group relative flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all thai-text ${
        selected
          ? 'gradient-active text-white shadow-lg shadow-brand-900/30'
          : 'text-sidebar-text-muted hover:bg-white/5 border border-transparent'
      }`}
      onClick={onClick}
    >
      {/* Avatar + status dot */}
      <div className="relative flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={conversation.picture_url || `https://ui-avatars.com/api/?name=${conversation.display_name}&background=6366f1&color=fff&size=40`}
          className="w-10 h-10 rounded-full object-cover"
          alt={conversation.display_name}
        />
        <div
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-sidebar-bg ${
            isActive ? 'bg-online' : isWaiting ? 'bg-away' : 'bg-offline'
          }`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 min-w-0">
            <span className={`font-semibold truncate text-sm ${selected ? 'text-white' : 'text-sidebar-fg'}`}>
              {conversation.display_name}
            </span>
            {isVip && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />}
          </span>
          <span className={`text-[10px] flex-shrink-0 thai-no-break ${selected ? 'text-white/80' : 'text-sidebar-text-muted'}`}>
            {formattedTime || ''}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className={`truncate text-xs thai-no-break ${selected ? 'text-white/80' : 'text-sidebar-text-muted'}`}>
            {conversation.last_message?.content || 'No messages yet'}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Mode badge */}
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
              selected
                ? 'bg-white/15 text-white'
                : isBot
                  ? 'bg-info/15 text-info'
                  : 'bg-online/15 text-online'
            }`}>
              {isBot ? <Bot className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
              {isBot ? 'Bot' : 'Manual'}
            </span>
            {/* Unread badge */}
            {conversation.unread_count > 0 && (
              <span className="blink-badge min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
              </span>
            )}
          </div>
        </div>

        {/* Tags */}
        {!!conversation.tags?.length && (
          <div className="mt-1.5 flex items-center gap-1 overflow-hidden">
            {conversation.tags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white thai-no-break"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            ))}
            {conversation.tags.length > 2 && (
              <span className={`text-[10px] ${selected ? 'text-white/80' : 'text-sidebar-text-muted'}`}>+{conversation.tags.length - 2}</span>
            )}
          </div>
        )}
      </div>

      {/* Menu button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMenuClick();
        }}
        className={`p-1.5 rounded-lg cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity ${selected ? 'text-white/80 hover:text-white' : 'text-sidebar-text-muted hover:text-white'}`}
        aria-label={`Open actions for ${conversation.display_name}`}
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  );
});
