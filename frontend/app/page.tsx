'use client';

import { useState, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingStats } from '@/components/landing/LandingStats';
import { LandingFeatures } from '@/components/landing/LandingFeatures';
import { LandingLineSection } from '@/components/landing/LandingLineSection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import type { Locale } from '@/lib/i18n/landing';

export default function Home() {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('jsk-landing-locale');
      if (saved === 'en' || saved === 'th') return saved;
    }
    return 'th';
  });

  useEffect(() => {
    localStorage.setItem('jsk-landing-locale', locale);
  }, [locale]);

  const toggleLocale = () => setLocale((prev) => (prev === 'th' ? 'en' : 'th'));

  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 1000], [0, 200]);
  const y2 = useTransform(scrollY, [0, 1000], [0, -100]);

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-slate-950 font-sans text-slate-900 dark:text-white selection:bg-blue-100 selection:text-blue-950 overflow-x-hidden">
      {/* Fixed Background with noise + animated blur orbs */}
      <div className="fixed inset-0 z-0 pointer-events-none flex justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.02] mix-blend-overlay" />
        <motion.div
          style={{ y: y1 }}
          className="absolute top-[-20%] left-[-10%] w-[1000px] h-[800px] bg-blue-900/10 dark:bg-blue-400/10 blur-[120px] rounded-full"
        />
        <motion.div
          style={{ y: y2 }}
          className="absolute top-[10%] right-[-20%] w-[800px] h-[800px] bg-blue-400/10 dark:bg-blue-900/15 blur-[120px] rounded-full"
        />
      </div>

      <LandingNavbar locale={locale} onToggleLocale={toggleLocale} />
      <LandingHero locale={locale} />
      <LandingStats locale={locale} />
      <LandingFeatures locale={locale} />
      <LandingLineSection locale={locale} />
      <LandingFooter locale={locale} />
    </div>
  );
}
