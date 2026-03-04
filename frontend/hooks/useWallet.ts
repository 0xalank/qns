'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { BrowserProvider, Signer } from 'quais';
import { connectPelagus, isPelagusInstalled, onAccountsChanged } from '@/lib/wallet';

export interface WalletState {
  connected: boolean;
  address: string | null;
  signer: Signer | null;
  provider: BrowserProvider | null;
  pelagusInstalled: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const defaultState: WalletState = {
  connected: false,
  address: null,
  signer: null,
  provider: null,
  pelagusInstalled: false,
  connecting: false,
  error: null,
  connect: async () => {},
  disconnect: () => {},
};

export const WalletContext = createContext<WalletState>(defaultState);

export function useWallet(): WalletState {
  return useContext(WalletContext);
}

export function useWalletState(): WalletState {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [pelagusInstalled, setPelagusInstalled] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPelagusInstalled(isPelagusInstalled());
  }, []);

  useEffect(() => {
    const cleanup = onAccountsChanged((accounts) => {
      if (accounts.length === 0) {
        setConnected(false);
        setAddress(null);
        setSigner(null);
        setProvider(null);
      } else {
        setAddress(accounts[0]);
      }
    });
    return cleanup;
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const result = await connectPelagus();
      setProvider(result.provider);
      setSigner(result.signer);
      setAddress(result.address);
      setConnected(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setConnected(false);
    setAddress(null);
    setSigner(null);
    setProvider(null);
  }, []);

  return {
    connected,
    address,
    signer,
    provider,
    pelagusInstalled,
    connecting,
    error,
    connect,
    disconnect,
  };
}
