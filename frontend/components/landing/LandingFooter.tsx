'use client';

import Link from 'next/link';
import { t, type Locale } from '@/lib/i18n/landing';

interface LandingFooterProps {
  locale: Locale;
}

interface FooterLink {
  labelKey: string;
  href: string;
  external?: boolean;
}

const aboutLinks: FooterLink[] = [
  { labelKey: 'footer_about_system', href: '#' },
  { labelKey: 'footer_about_org', href: '#' },
  { labelKey: 'footer_about_policy', href: '#' },
];

const serviceLinks: FooterLink[] = [
  { labelKey: 'footer_services_livechat', href: '/admin/live-chat' },
  { labelKey: 'footer_services_request', href: '/admin/requests' },
  { labelKey: 'footer_services_chatbot', href: '/admin/chatbot' },
  { labelKey: 'footer_services_reports', href: '/admin/reports' },
];

const externalLinks: FooterLink[] = [
  { labelKey: 'footer_links_rlpd', href: 'https://www.rlpd.go.th', external: true },
  { labelKey: 'footer_links_moj', href: 'https://www.moj.go.th', external: true },
  { labelKey: 'footer_links_lineoa', href: '#' },
];

interface FooterColumnProps {
  locale: Locale;
  titleKey: string;
  links: FooterLink[];
}

function FooterColumn({ locale, titleKey, links }: FooterColumnProps) {
  return (
    <div>
      <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
        {t(locale, titleKey)}
      </h3>
      <ul className="space-y-0">
        {links.map(({ labelKey, href, external }) => (
          <li key={labelKey}>
            {external ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-gray-400 hover:text-white text-sm transition-colors py-1.5"
              >
                {t(locale, labelKey)}
              </a>
            ) : (
              <Link
                href={href}
                className="block text-gray-400 hover:text-white text-sm transition-colors py-1.5"
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
    /* Footer uses raw gray-* intentionally — always dark bg regardless of theme */
    <footer className="bg-gray-900 dark:bg-gray-950 text-gray-300">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Footer Columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Column 1 - About */}
          <FooterColumn locale={locale} titleKey="footer_about" links={aboutLinks} />

          {/* Column 2 - Services */}
          <FooterColumn locale={locale} titleKey="footer_services" links={serviceLinks} />

          {/* Column 3 - Links */}
          <FooterColumn locale={locale} titleKey="footer_links" links={externalLinks} />

          {/* Column 4 - Contact */}
          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
              {t(locale, 'footer_contact')}
            </h3>
            <ul className="space-y-0">
              <li>
                <a
                  href="mailto:contact@rlpd.go.th"
                  className="block text-gray-400 hover:text-white text-sm transition-colors py-1.5"
                >
                  contact@rlpd.go.th
                </a>
              </li>
              <li>
                <a
                  href="tel:021412500"
                  className="block text-gray-400 hover:text-white text-sm transition-colors py-1.5"
                >
                  0-2141-2500
                </a>
              </li>
              <li>
                <span className="block text-gray-400 text-sm py-1.5">
                  120 หมู่ 3 ชั้น 3 ศูนย์ราชการเฉลิมพระเกียรติฯ
                  ถนนแจ้งวัฒนะ แขวงทุ่งสองห้อง เขตหลักสี่ กรุงเทพฯ 10210
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-800 mt-10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-line-green)] to-[var(--color-line-green-dark)] flex items-center justify-center">
              <span className="text-white text-xs font-bold">JSK</span>
            </div>
            <span className="text-gray-400 text-sm font-medium">
              JSK 4.0 Platform
            </span>
          </div>
          <p className="text-gray-500 text-sm text-center sm:text-right">
            &copy; {t(locale, 'footer_copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
}
