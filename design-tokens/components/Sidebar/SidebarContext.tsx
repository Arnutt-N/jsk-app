import React from 'react';
import { cn } from '../lib/utils';

export type SidebarStyle = 'solid' | 'gradient';
export type SidebarSize = 'compact' | 'wide';
export type NavbarHeight = 'compact' | 'tall';

export interface SidebarConfig {
  /** Sidebar visual style */
  style: SidebarStyle;
  /** Sidebar width size */
  size: SidebarSize;
  /** Navbar height */
  navbarHeight: NavbarHeight;
  /** Show section labels */
  showSectionLabels: boolean;
  /** Show notification badges */
  showBadges: boolean;
}

export const defaultSidebarConfig: SidebarConfig = {
  style: 'solid',
  size: 'compact',
  navbarHeight: 'compact',
  showSectionLabels: true,
  showBadges: true,
};

export interface SidebarContextType {
  config: SidebarConfig;
  isCollapsed: boolean;
  toggleSidebar: () => void;
  setConfig: (config: Partial<SidebarConfig>) => void;
}

export const SidebarContext = React.createContext<SidebarContextType | undefined>(undefined);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}

interface SidebarProviderProps {
  children: React.ReactNode;
  config?: Partial<SidebarConfig>;
  defaultCollapsed?: boolean;
}

export function SidebarProvider({
  children,
  config: customConfig,
  defaultCollapsed = false,
}: SidebarProviderProps) {
  const [config, setConfigState] = React.useState<SidebarConfig>({
    ...defaultSidebarConfig,
    ...customConfig,
  });
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);

  const toggleSidebar = React.useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const setConfig = React.useCallback((newConfig: Partial<SidebarConfig>) => {
    setConfigState((prev) => ({ ...prev, ...newConfig }));
  }, []);

  const contextValue = React.useMemo(
    () => ({
      config,
      isCollapsed,
      toggleSidebar,
      setConfig,
    }),
    [config, isCollapsed, toggleSidebar, setConfig]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      {children}
    </SidebarContext.Provider>
  );
}
