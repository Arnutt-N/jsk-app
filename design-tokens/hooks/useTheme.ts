import React from 'react';
import type { SidebarConfig, SidebarStyle, SidebarSize, NavbarHeight } from '../components/Sidebar/SidebarContext';
import type { NavbarConfig, NavbarStyle } from '../components/Navbar/Navbar';

export interface ThemeConfig {
  /** Sidebar configuration */
  sidebar: SidebarConfig;
  /** Navbar configuration */
  navbar: NavbarConfig;
  /** Dark mode enabled */
  darkMode: boolean;
  /** Enable animations */
  animations: boolean;
}

export interface UseThemeReturn {
  /** Current theme configuration */
  theme: ThemeConfig;
  /** Set sidebar style (solid or gradient) */
  setSidebarStyle: (style: SidebarStyle) => void;
  /** Set sidebar size (compact or wide) */
  setSidebarSize: (size: SidebarSize) => void;
  /** Set navbar height (compact or tall) */
  setNavbarHeight: (height: NavbarHeight) => void;
  /** Set navbar style (glass or solid) */
  setNavbarStyle: (style: NavbarStyle) => void;
  /** Toggle dark mode */
  toggleDarkMode: () => void;
  /** Toggle animations */
  toggleAnimations: () => void;
  /** Reset to default theme */
  resetTheme: () => void;
  /** Apply preset theme */
  applyPreset: (preset: ThemePreset) => void;
}

export type ThemePreset = 'admin-chat' | 'hr-ims' | 'hybrid';

const defaultTheme: ThemeConfig = {
  sidebar: {
    style: 'solid',
    size: 'compact',
    navbarHeight: 'compact',
    showSectionLabels: true,
    showBadges: true,
  },
  navbar: {
    height: 'compact',
    style: 'glass',
    showSearch: false,
    showNotifications: true,
    notificationCount: 0,
  },
  darkMode: false,
  animations: true,
};

const presets: Record<ThemePreset, Partial<ThemeConfig>> = {
  'admin-chat': {
    sidebar: {
      style: 'solid',
      size: 'compact',
      navbarHeight: 'compact',
      showSectionLabels: true,
      showBadges: true,
    },
    navbar: {
      height: 'compact',
      style: 'solid',
    },
  },
  'hr-ims': {
    sidebar: {
      style: 'gradient',
      size: 'wide',
      navbarHeight: 'tall',
      showSectionLabels: true,
      showBadges: true,
    },
    navbar: {
      height: 'tall',
      style: 'glass',
    },
  },
  hybrid: {
    sidebar: {
      style: 'gradient',
      size: 'compact',
      navbarHeight: 'compact',
      showSectionLabels: true,
      showBadges: true,
    },
    navbar: {
      height: 'compact',
      style: 'glass',
    },
  },
};

const STORAGE_KEY = 'skn-design-tokens-theme';

/**
 * Hook for managing theme configuration across SKN applications
 * Provides unified control over sidebar style, navbar style, and other theme settings
 */
export function useTheme(defaultConfig?: Partial<ThemeConfig>): UseThemeReturn {
  const [theme, setTheme] = React.useState<ThemeConfig>(() => {
    // Try to load from localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored) as ThemeConfig;
        } catch {
          // Invalid stored config, use default
        }
      }
    }
    return { ...defaultTheme, ...defaultConfig };
  });

  // Save to localStorage whenever theme changes
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    }
  }, [theme]);

  // Apply dark mode class to document
  React.useEffect(() => {
    if (theme.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme.darkMode]);

  const setSidebarStyle = React.useCallback((style: SidebarStyle) => {
    setTheme((prev) => ({
      ...prev,
      sidebar: { ...prev.sidebar, style },
    }));
  }, []);

  const setSidebarSize = React.useCallback((size: SidebarSize) => {
    setTheme((prev) => ({
      ...prev,
      sidebar: { ...prev.sidebar, size },
    }));
  }, []);

  const setNavbarHeight = React.useCallback((height: NavbarHeight) => {
    setTheme((prev) => ({
      ...prev,
      sidebar: { ...prev.sidebar, navbarHeight: height },
      navbar: { ...prev.navbar, height },
    }));
  }, []);

  const setNavbarStyle = React.useCallback((style: NavbarStyle) => {
    setTheme((prev) => ({
      ...prev,
      navbar: { ...prev.navbar, style },
    }));
  }, []);

  const toggleDarkMode = React.useCallback(() => {
    setTheme((prev) => ({ ...prev, darkMode: !prev.darkMode }));
  }, []);

  const toggleAnimations = React.useCallback(() => {
    setTheme((prev) => ({ ...prev, animations: !prev.animations }));
  }, []);

  const resetTheme = React.useCallback(() => {
    setTheme(defaultTheme);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const applyPreset = React.useCallback((preset: ThemePreset) => {
    const presetConfig = presets[preset];
    setTheme((prev) => ({
      ...prev,
      ...presetConfig,
      sidebar: { ...prev.sidebar, ...presetConfig.sidebar },
      navbar: { ...prev.navbar, ...presetConfig.navbar },
    }));
  }, []);

  return {
    theme,
    setSidebarStyle,
    setSidebarSize,
    setNavbarHeight,
    setNavbarStyle,
    toggleDarkMode,
    toggleAnimations,
    resetTheme,
    applyPreset,
  };
}
