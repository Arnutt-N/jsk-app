'use client';

import React, { Suspense } from 'react';

import { LiveChatProvider } from './_context/LiveChatContext';
import { LiveChatShell } from './_components/LiveChatShell';

function LiveChatLoading() {
  return (
    <div className="flex h-screen w-full bg-bg items-center justify-center thai-text">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-text-tertiary text-sm thai-no-break">Loading Live Chat...</p>
      </div>
    </div>
  );
}

function LiveChatContent() {
  return (
    <LiveChatProvider>
      <LiveChatShell />
    </LiveChatProvider>
  );
}

export default function LiveChatPage() {
  return (
    <Suspense fallback={<LiveChatLoading />}>
      <LiveChatContent />
    </Suspense>
  );
}
