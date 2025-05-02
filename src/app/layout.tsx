import 'katex/dist/katex.min.css';
import 'prismjs/themes/prism-tomorrow.css';
import 'react-notion-x/src/styles.css';

import Header from '@/components/header/header';
import Provider from '@/components/provider';
import ScrollUpButton from '@/components/scroll-up-button';
import { FormFieldFixer } from '@/app/form-fix';
import '@/styles/globals.css';
import '@/styles/paginate.css';

export const metadata = {
  title: {
    default: '愛をもって、人生を楽しみ尽くす',
    template: '%s | 愛をもって、人生を楽しみ尽くす',
  },
  metadataBase: new URL(process.env.SITE_URL || 'https://okkylife.com'),
  description: 'おっきーの個人ブログです。パートナーシップコーチとして、愛・旅・人生について書いています。',
  openGraph: {
    title: '愛をもって、人生を楽しみ尽くす',
    description: 'おっきーの個人ブログ',
    url: process.env.SITE_URL,
    siteName: '愛をもって、人生を楽しみ尽くす',
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '愛をもって、人生を楽しみ尽くす',
    description: 'おっきーの個人ブログ',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="text-primary bg-primary relative mx-auto mb-20 flex w-full max-w-screen-xl flex-col px-[10vw] md:px-[5vw]">
        <Provider>
          <Header />
          <main>{children}</main>
          <div className="fixed bottom-12 right-10">
            <ScrollUpButton />
          </div>
          {/* フォームフィールド修正スクリプト */}
          <FormFieldFixer />
        </Provider>
      </body>
    </html>
  );
}
