'use client';

import React, { Suspense } from 'react';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { LiveChatProvider } from './_context/LiveChatContext';
import { LiveChatShell } from './_components/LiveChatShell';

function LiveChatLoading() {
  return (
    <div className="flex h-screen w-full bg-bg items-center justify-center thai-text">
      <LoadingSpinner label="กำลังโหลด..." />
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
