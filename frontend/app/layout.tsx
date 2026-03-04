'use client';

import './globals.css';
import { Navbar } from '@/components/Navbar';
import { WalletContext, useWalletState } from '@/hooks/useWallet';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const walletState = useWalletState();

  return (
    <html lang="en">
      <head>
        <title>QNS - Quai Name Service</title>
        <meta name="description" content="Register a username on Quai Network" />
      </head>
      <body>
        <WalletContext.Provider value={walletState}>
          <Navbar />
          <main className="max-w-5xl mx-auto px-4 py-8">
            {children}
          </main>
        </WalletContext.Provider>
      </body>
    </html>
  );
}
