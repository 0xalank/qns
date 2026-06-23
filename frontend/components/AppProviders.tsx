'use client';

import { WalletContext, useWalletState } from '@/hooks/useWallet';
import { ThemeContext, useThemeState } from '@/hooks/useTheme';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const walletState = useWalletState();
  const themeState = useThemeState();

  return (
    <ThemeContext.Provider value={themeState}>
      <WalletContext.Provider value={walletState}>
        {children}
      </WalletContext.Provider>
    </ThemeContext.Provider>
  );
}
