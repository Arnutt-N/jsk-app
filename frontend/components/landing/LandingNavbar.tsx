'use client';

import Link from 'next/link';
import { Sun, Moon, ArrowRight, Menu } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/Sheet';
import { useTheme } from '@/components/providers';
import { LandingLanguageToggle } from './LandingLanguageToggle';
import { LandingBrandMark } from './LandingBrandMark';
import { t, type Locale } from '@/lib/i18n/landing';

interface LandingNavbarProps {
  locale: Locale;
  onToggleLocale: () => void;
}

const NAV_LINKS = [
  { href: '#overview', key: 'nav_overview' },
  { href: '#capabilities', key: 'nav_capabilities' },
  { href: '#line', key: 'nav_line' },
  { href: '#contact', key: 'nav_contact' },
] as const;

export function LandingNavbar({ locale, onToggleLocale }: LandingNavbarProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const openMenuLabel = locale === 'th' ? 'เปิดเมนูนำทาง' : 'Open navigation menu';
  const navigationTitle = locale === 'th' ? 'เมนูนำทาง' : 'Navigation';

  return (
    <nav className="sticky top-0 z-50 px-4 pt-4 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="landing-nav-shell flex h-[72px] items-center gap-3 rounded-full px-4 sm:px-6">
          <Link href="/" className="min-w-0 shrink-0">
            <LandingBrandMark compact className="max-[430px]:[&>div:last-child]:hidden" />
          </Link>

          <div className="hidden lg:flex items-center gap-7 pl-8 text-sm text-slate-600 dark:text-slate-300">
            {NAV_LINKS.map((link) => (
              <a
                key={link.key}
                href={link.href}
                className="thai-no-break transition-colors hover:text-slate-950 dark:hover:text-white"
              >
                {t(locale, link.key)}
              </a>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleTheme}
              aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="hidden rounded-full border border-slate-200/70 bg-white/75 text-slate-600 shadow-sm hover:bg-white hover:text-slate-950 sm:inline-flex dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </Button>

            <LandingLanguageToggle locale={locale} onToggle={onToggleLocale} />

            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={openMenuLabel}
                  className="rounded-full border border-slate-200/70 bg-white/75 text-slate-600 shadow-sm hover:bg-white hover:text-slate-950 lg:hidden dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <Menu className="w-4 h-4" />
                </Button>
              </SheetTrigger>

              <SheetContent
                side="right"
                className="w-full max-w-sm border-slate-800 bg-slate-900 px-6 py-6 text-white"
              >
                <SheetHeader className="pr-8">
                  <LandingBrandMark tone="dark" />
                  <SheetTitle className="sr-only">{navigationTitle}</SheetTitle>
                  <SheetDescription className="mt-4 text-sm leading-6 text-white/60">
                    {t(locale, 'footer_tagline')}
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-8 flex flex-col gap-2">
                  {NAV_LINKS.map((link) => (
                    <SheetClose asChild key={link.key}>
                      <a
                        href={link.href}
                        className="flex items-center justify-between rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/82 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <span>{t(locale, link.key)}</span>
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    </SheetClose>
                  ))}
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  <SheetClose asChild>
                    <Button
                      asChild
                      size="lg"
                      variant="secondary"
                      className="justify-between rounded-full border-white/10 bg-white text-slate-950 hover:bg-slate-100"
                    >
                      <Link href="/login">
                        {t(locale, 'nav_login')}
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  </SheetClose>

                  <SheetClose asChild>
                    <Button
                      asChild
                      size="lg"
                      variant="secondary"
                      className="justify-between rounded-full border-0 bg-slate-700 text-white hover:bg-slate-600 hover:text-white"
                    >
                      <Link href="/liff/service-request">
                        {t(locale, 'nav_request')}
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  </SheetClose>
                </div>
              </SheetContent>
            </Sheet>

            <Button
              variant="ghost"
              size="sm"
              asChild
              className="hidden rounded-full px-4 text-slate-600 hover:bg-white/80 hover:text-slate-950 sm:inline-flex dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <Link href="/login">
                {t(locale, 'nav_login')}
              </Link>
            </Button>

            <Button
              size="sm"
              variant="secondary"
              asChild
              className="thai-no-break hidden rounded-full border-0 bg-slate-900 px-4 text-white shadow-sm hover:bg-slate-800 hover:text-white min-[480px]:inline-flex dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            >
              <Link href="/liff/service-request">
                {t(locale, 'nav_request')}
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
