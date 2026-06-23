import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Zen_Kaku_Gothic_New, Spline_Sans_Mono } from 'next/font/google';
import { Navbar } from '@/components/Navbar';
import { AppProviders } from '@/components/AppProviders';

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const sans = Zen_Kaku_Gothic_New({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = Spline_Sans_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://qns.app'),
  title: {
    default: 'QNS · Quai Name Service',
    template: '%s · QNS',
  },
  description: 'Register a renewable .quai name for your wallet, payment code, avatar, profile, and on-chain sites.',
  openGraph: {
    title: 'QNS · Quai Name Service',
    description: 'Renewable .quai names for wallets, profiles, and on-chain sites.',
    siteName: 'QNS',
    type: 'website',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'QNS turns .quai names into wallets, profiles, and on-chain sites.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QNS · Quai Name Service',
    description: 'Renewable .quai names for wallets, profiles, and on-chain sites.',
    images: ['/opengraph-image'],
  },
  icons: {
    icon: '/qns-mountain-logo.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <AppProviders>
          <Navbar />
          <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 lg:px-10">
            {children}
          </main>
          <footer className="mx-auto mt-16 w-full max-w-6xl px-5 pb-10 sm:px-8 lg:px-10">
            <div className="reg-masthead flex items-center justify-between pt-5">
              <span className="font-display text-sm text-ink">QNS</span>
              <span className="reg-label">Quai Network</span>
            </div>
          </footer>
        </AppProviders>
      </body>
    </html>
  );
}
