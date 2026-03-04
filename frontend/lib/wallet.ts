import { BrowserProvider, Signer, JsonRpcProvider } from 'quais';
import { RPC_URL } from './constants';

declare global {
  interface Window {
    pelagus?: any;
  }
}

export function isPelagusInstalled(): boolean {
  return typeof window !== 'undefined' && !!window.pelagus;
}

export function getReadOnlyProvider(): JsonRpcProvider {
  return new JsonRpcProvider(RPC_URL, undefined, { usePathing: false });
}

export async function connectPelagus(): Promise<{ provider: BrowserProvider; signer: Signer; address: string }> {
  if (!isPelagusInstalled()) {
    throw new Error('Pelagus wallet not found. Please install the Pelagus extension.');
  }

  const provider = new BrowserProvider(window.pelagus);
  await provider.send('quai_requestAccounts', []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  return { provider, signer, address };
}

export function onAccountsChanged(callback: (accounts: string[]) => void): () => void {
  if (!isPelagusInstalled()) return () => {};

  window.pelagus.on('accountsChanged', callback);
  return () => window.pelagus.removeListener('accountsChanged', callback);
}

export function onChainChanged(callback: (chainId: string) => void): () => void {
  if (!isPelagusInstalled()) return () => {};

  window.pelagus.on('chainChanged', callback);
  return () => window.pelagus.removeListener('chainChanged', callback);
}
