'use client';

import { useCallback } from 'react';

import { useLiveChatStore } from '../_store/liveChatStore';

const getStore = () => useLiveChatStore.getState();

/**
 * Stable-identity setters that delegate to the Zustand store (Phase 8 / Task 6).
 * Extracted from the provider so it stays a thin composition root. These are
 * exposed on the context value, so their identities must be stable (useCallback)
 * to keep the memoized value from churning. The sound toggle additionally drives
 * the audio hook, so its external `setEnabled` is injected.
 */
export function useLiveChatActions(setSoundEnabledExternal: (value: boolean) => void) {
  const setSearchQuery = useCallback((value: string) => {
    getStore().setSearchQuery(value);
  }, []);

  const setFilterStatus = useCallback((value: string | null) => {
    getStore().setFilterStatus(value);
  }, []);

  const setInputText = useCallback((value: string) => {
    getStore().setInputText(value);
  }, []);

  const setShowCustomerPanel = useCallback((value: boolean) => {
    getStore().setShowCustomerPanel(value);
  }, []);

  const setActiveActionMenu = useCallback((value: string | null) => {
    getStore().setActiveActionMenu(value);
  }, []);

  const setShowTransferDialog = useCallback((value: boolean) => {
    getStore().setShowTransferDialog(value);
  }, []);

  const setShowCannedPicker = useCallback((value: boolean) => {
    getStore().setShowCannedPicker(value);
  }, []);

  const setSoundEnabled = useCallback((value: boolean) => {
    getStore().setSoundEnabled(value);
    setSoundEnabledExternal(value);
  }, [setSoundEnabledExternal]);

  return {
    setSearchQuery,
    setFilterStatus,
    setInputText,
    setShowCustomerPanel,
    setActiveActionMenu,
    setShowTransferDialog,
    setShowCannedPicker,
    setSoundEnabled,
  };
}
