'use client';

import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';
import { LandingBrandMark } from './LandingBrandMark';
import { t, type Locale } from '@/lib/i18n/landing';
import { landingPublicLinks } from '@/lib/public-links';

interface LandingFooterProps {
  locale: Locale;
}

interface FooterLink {
  labelKey: string;
  href?: string;
  external?: boolean;
}

const aboutLinks: FooterLink[] = [
  { labelKey: 'footer_about_system', href: '#overview' },
  { labelKey: 'footer_about_scope', href: '#capabilities' },
  { labelKey: 'footer_about_policy', href: landingPublicLinks.privacyPolicy, external: true },
];

const serviceLinks: FooterLink[] = [
  { labelKey: 'footer_services_livechat', href: '/admin/live-chat' },
  { labelKey: 'footer_services_request', href: '/liff/service-request' },
  { labelKey: 'footer_services_chatbot', href: '/admin/chatbot' },
  { labelKey: 'footer_services_reports', href: '/admin/reports' },
];

const externalLinks: FooterLink[] = [
  { labelKey: 'footer_links_rlpd', href: 'https://www.rlpd.go.th', external: true },
  { labelKey: 'footer_links_moj', href: 'https://www.moj.go.th', external: true },
  {
    labelKey: 'footer_links_lineoa',
    href: landingPublicLinks.lineOfficialAccount ?? '#line',
    external: Boolean(landingPublicLinks.lineOfficialAccount),
  },
];

interface FooterColumnProps {
  locale: Locale;
  titleKey: string;
  links: FooterLink[];
}

function FooterColumn({ locale, titleKey, links }: FooterColumnProps) {
  return (
    <div>
      <h3 className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-white/45">
        {t(locale, titleKey)}
      </h3>
      <ul className="space-y-1">
        {links.map(({ labelKey, href, external }) => (
          <li key={labelKey}>
            {!href ? (
              <span className="block py-1.5 text-sm text-white/40">
                {t(locale, labelKey)}
              </span>
            ) : external ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="block py-1.5 text-sm text-white/70 transition-colors hover:text-white"
              >
                {t(locale, labelKey)}
              </a>
            ) : (
              <Link
                href={href}
                className="block py-1.5 text-sm text-white/70 transition-colors hover:text-white"
              >
                {t(locale, labelKey)}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LandingFooter({ locale }: LandingFooterProps) {
  return (
    <footer id="contact" className="scroll-mt-28 bg-slate-900 text-white dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-6 py-14 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.6fr))]">
          <div className="max-w-md">
            <LandingBrandMark tone="dark" />

            <p className="mt-6 text-sm leading-7 text-white/65 sm:text-[0.95rem]">
              {t(locale, 'footer_description')}
            </p>

            <div className="mt-6 space-y-3 text-sm text-white/65">
              <a
                href="mailto:contact@rlpd.go.th"
                className="flex items-start gap-3 transition-colors hover:text-white"
              >
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span className="thai-no-break">contact@rlpd.go.th</span>
              </a>

              <a
                href="tel:021412500"
                className="flex items-start gap-3 transition-colors hover:text-white"
              >
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span className="thai-no-break">0-2141-2500</span>
              </a>

              <p className="text-sm leading-7 text-white/50">
                {t(locale, 'footer_address')}
              </p>
            </div>
          </div>

          <FooterColumn locale={locale} titleKey="footer_about" links={aboutLinks} />
          <FooterColumn locale={locale} titleKey="footer_services" links={serviceLinks} />
          <FooterColumn locale={locale} titleKey="footer_links" links={externalLinks} />
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/8 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm text-white/50">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.72rem] font-semibold text-white/60">
              LINE Official Account
            </span>
            <span className="hidden sm:inline">{t(locale, 'footer_tagline')}</span>
          </div>

          <p className="text-center text-sm text-white/40 sm:text-right">
            &copy; {t(locale, 'footer_copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
}
