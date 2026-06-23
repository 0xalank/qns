export function truncateAddress(address: string, chars: number = 6): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function truncatePaymentCode(code: string, chars: number = 8): string {
  if (!code) return '';
  return `${code.slice(0, chars)}...${code.slice(-chars)}`;
}

export function formatQuai(wei: bigint | string): string {
  const value = BigInt(wei);
  const quai = Number(value) / 1e18;
  if (quai === 0) return '0';
  if (quai < 0.0001) return '<0.0001';
  return quai.toFixed(4);
}

export function formatDate(timestamp: number): string {
  if (timestamp === 0) return 'Never';
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(timestamp: number): string {
  if (timestamp === 0) return 'Never';
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeUntil(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = timestamp - now;
  if (diff <= 0) return 'Now';

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function isValidName(name: string): boolean {
  if (name.length === 0 || name.length > 64) return false;
  return /^[a-z0-9_-]+$/.test(name);
}

export function nameValidationError(name: string): string | null {
  if (name.length === 0) return 'Name is required';
  if (name.length > 64) return 'Name must be 64 characters or fewer';
  if (name !== name.toLowerCase()) return 'Name must be lowercase';
  if (!/^[a-z0-9_-]+$/.test(name)) return 'Only lowercase letters, numbers, hyphens, and underscores';
  return null;
}

export function getNamePriceTier(name: string): string {
  if (name.length <= 3) return 'Premium auction (5,000 QUAI min)';
  if (name.length <= 6) return 'Auction (1,000 QUAI min)';
  return 'Instant (200 QUAI fee)';
}

export function getRegistrationType(name: string): 'instant' | 'auction' {
  return name.length >= 7 ? 'instant' : 'auction';
}

export function expiryStatus(expiresAt: number): 'active' | 'grace' | 'expired' {
  const now = Math.floor(Date.now() / 1000);
  const gracePeriod = 30 * 24 * 3600;
  if (now < expiresAt) return 'active';
  if (now < expiresAt + gracePeriod) return 'grace';
  return 'expired';
}

export function expiryStatusLabel(expiresAt: number): string {
  const status = expiryStatus(expiresAt);
  if (status === 'active') return 'Active';
  if (status === 'grace') return 'Grace Period';
  return 'Expired';
}

export function expiryStatusColor(expiresAt: number): string {
  const status = expiryStatus(expiresAt);
  if (status === 'active') return 'text-good';
  if (status === 'grace') return 'text-warn';
  return 'text-bad';
}

// Returns the stamp-motif class for a name's standing in the registry.
export function expiryBadgeColor(expiresAt: number): string {
  const status = expiryStatus(expiresAt);
  if (status === 'active') return 'reg-stamp reg-stamp-good';
  if (status === 'grace') return 'reg-stamp reg-stamp-warn';
  return 'reg-stamp reg-stamp-bad';
}
