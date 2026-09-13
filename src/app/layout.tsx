import type { Metadata } from 'next';
import './globals.css';
import { I18nProvider } from '@/i18n/client';
import { getTranslations } from '@/i18n/server';

export const metadata: Metadata = {
  title: 'Smartwatch CEO Challenge',
  description:
    'Web-based business strategy simulation: run a smartwatch brand for six quarters against five benchmark competitors.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = await getTranslations();

  return (
    <html lang={locale}>
      <body className="antialiased">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
