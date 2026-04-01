'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { t, type Locale } from '@/lib/i18n/landing';

interface Slide {
  titleKey: string;
  subtitleKey: string;
  gradient: string;
  pattern: string;
}

const SLIDES: readonly Slide[] = [
  {
    titleKey: 'carousel_slide1_title',
    subtitleKey: 'carousel_slide1_subtitle',
    gradient: 'from-brand-600 via-brand-500 to-brand-400',
    pattern:
      'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.06) 0%, transparent 40%)',
  },
  {
    titleKey: 'carousel_slide2_title',
    subtitleKey: 'carousel_slide2_subtitle',
    gradient: 'from-[var(--color-line-green)] via-emerald-500 to-teal-500',
    pattern:
      'radial-gradient(circle at 70% 70%, rgba(255,255,255,0.1) 0%, transparent 50%), radial-gradient(circle at 30% 30%, rgba(255,255,255,0.05) 0%, transparent 40%)',
  },
  {
    titleKey: 'carousel_slide3_title',
    subtitleKey: 'carousel_slide3_subtitle',
    gradient: 'from-info via-blue-500 to-indigo-500',
    pattern:
      'radial-gradient(circle at 50% 20%, rgba(255,255,255,0.08) 0%, transparent 50%), radial-gradient(circle at 20% 70%, rgba(255,255,255,0.06) 0%, transparent 40%)',
  },
] as const;

const AUTOPLAY_INTERVAL_MS = 5000;

interface HeroCarouselProps {
  locale: Locale;
}

export function HeroCarousel({ locale }: HeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useRef(false);

  // Detect prefers-reduced-motion on mount
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.current = mql.matches;

    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotion.current = e.matches;
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Scroll to a specific slide
  const scrollToSlide = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const slideWidth = container.offsetWidth;
    container.scrollTo({ left: slideWidth * index, behavior: 'smooth' });
  }, []);

  // Handle dot click
  const handleDotClick = useCallback(
    (index: number) => {
      setActiveIndex(index);
      scrollToSlide(index);
    },
    [scrollToSlide],
  );

  // Auto-play timer
  useEffect(() => {
    if (isPaused || prefersReducedMotion.current) return;

    const timer = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % SLIDES.length;
        scrollToSlide(next);
        return next;
      });
    }, AUTOPLAY_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isPaused, scrollToSlide]);

  // Sync activeIndex on manual scroll (swipe)
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const slideWidth = container.offsetWidth;
        if (slideWidth === 0) return;
        const newIndex = Math.round(container.scrollLeft / slideWidth);
        setActiveIndex(newIndex);
      }, 60);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  return (
    <section
      className="relative w-full max-h-[450px]"
      aria-roledescription="carousel"
      aria-label={t(locale, 'carousel_aria_label')}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      {/* Scrollable slide container */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        role="group"
      >
        {SLIDES.map((slide, index) => (
          <div
            key={slide.titleKey}
            className={`flex-shrink-0 w-full snap-center bg-gradient-to-br ${slide.gradient}`}
            style={{ backgroundImage: slide.pattern }}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} / ${SLIDES.length}`}
          >
            <div className="flex flex-col items-center justify-center px-6 py-16 md:py-20 lg:py-24 max-h-[450px] text-center">
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-3 tracking-tight leading-tight max-w-3xl drop-shadow-md">
                {t(locale, slide.titleKey)}
              </h2>
              <p className="text-base md:text-lg text-white/90 max-w-2xl leading-relaxed drop-shadow-sm">
                {t(locale, slide.subtitleKey)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2"
        role="tablist"
        aria-label={t(locale, 'carousel_dots_label')}
      >
        {SLIDES.map((_, index) => (
          <button
            key={index}
            role="tab"
            aria-selected={index === activeIndex}
            aria-label={`${t(locale, 'carousel_go_to_slide')} ${index + 1}`}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
              index === activeIndex
                ? 'bg-white scale-125 shadow-md'
                : 'bg-white/50 hover:bg-white/75'
            }`}
            onClick={() => handleDotClick(index)}
          />
        ))}
      </div>
    </section>
  );
}
