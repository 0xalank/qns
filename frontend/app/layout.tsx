'use client';

import './globals.css';
import { Space_Grotesk, Zen_Kaku_Gothic_New, Spline_Sans_Mono } from 'next/font/google';
import { Navbar } from '@/components/Navbar';
import { WalletContext, useWalletState } from '@/hooks/useWallet';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const walletState = useWalletState();

  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        <title>QNS · Quai Name Service</title>
        <meta name="description" content="Register a permanent .quai name for your wallet, payment code, avatar, and profile on Quai." />
      </head>
      <body>
        <WalletContext.Provider value={walletState}>
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
        </WalletContext.Provider>
      </body>
    </html>
  );
}
