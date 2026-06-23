'use client';

import { useState, useRef } from 'react';
import { encodeNftAvatarRef, normalizeNftAvatarInput, resolveNftAvatar } from '@/lib/avatar';
import type { ResolvedAvatar } from '@/lib/avatar';
import { useResolvedAvatar } from '@/hooks/useAvatar';

interface AvatarUploadProps {
  currentAvatar?: string; // hex string from contract
  ownerAddress?: string;
  onUpload: (data: Uint8Array) => Promise<void>;
}

const MAX_SIZE = 15360; // 15KB
const TARGET_SIZE = 128;

function resizeImage(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement('canvas');
      canvas.width = TARGET_SIZE;
      canvas.height = TARGET_SIZE;

      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));

      // Draw image cropped to square center
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, TARGET_SIZE, TARGET_SIZE);

      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Failed to create blob'));
        if (blob.size > MAX_SIZE) {
          return reject(new Error(`Image too large (${Math.ceil(blob.size / 1024)}KB). Max 15KB after resize.`));
        }
        blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

function avatarImageUrl(avatar: ResolvedAvatar): string | null {
  if (avatar.kind === 'image') return avatar.imageUrl;
  if (avatar.kind === 'nft' && avatar.verified && avatar.imageUrl) return avatar.imageUrl;
  return null;
}

function shortAddress(address?: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function avatarStatus(loading: boolean, avatar: ResolvedAvatar): string {
  if (loading) return 'Resolving avatar...';
  if (avatar.kind === 'image') return 'Image bytes stored on-chain';
  if (avatar.kind === 'nft') {
    if (!avatar.verified) return avatar.error || 'NFT ownership not verified';
    return `NFT linked: ${shortAddress(avatar.ref.collection)} #${avatar.ref.tokenId}`;
  }
  if (avatar.kind === 'error') return avatar.error;
  return 'No avatar set';
}

export function AvatarUpload({ currentAvatar, ownerAddress, onUpload }: AvatarUploadProps) {
  const [mode, setMode] = useState<'upload' | 'nft'>('upload');
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collection, setCollection] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [nftPreview, setNftPreview] = useState<ResolvedAvatar | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const current = useResolvedAvatar(currentAvatar, ownerAddress);
  const avatarUrl = avatarImageUrl(current.avatar);
  const previewUrl = nftPreview ? avatarImageUrl(nftPreview) : null;
  const previewError = nftPreview?.kind === 'nft' ? nftPreview.error : null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);

    try {
      const data = await resizeImage(file);
      await onUpload(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handlePreviewNft = async () => {
    setError(null);
    setNftPreview(null);
    setChecking(true);

    try {
      if (!ownerAddress) {
        throw new Error('Connect the QNS owner wallet before linking an NFT avatar.');
      }

      const ref = normalizeNftAvatarInput(collection, tokenId);
      const resolved = await resolveNftAvatar(ref, ownerAddress);
      setNftPreview(resolved);

      if (resolved.kind === 'nft' && resolved.error) {
        setError(resolved.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  };

  const handleUseNft = async () => {
    setError(null);
    setUploading(true);

    try {
      if (!ownerAddress) {
        throw new Error('Connect the QNS owner wallet before linking an NFT avatar.');
      }

      const ref = normalizeNftAvatarInput(collection, tokenId);
      const resolved = nftPreview?.kind === 'nft' && nftPreview.ref.encoded === ref.encoded
        ? nftPreview
        : await resolveNftAvatar(ref, ownerAddress);

      if (resolved.kind !== 'nft' || !resolved.verified) {
        throw new Error(resolved.kind === 'nft' ? resolved.error : 'NFT ownership not verified.');
      }

      if (!resolved.imageUrl) {
        throw new Error(resolved.error || 'NFT metadata does not include an image.');
      }

      await onUpload(encodeNftAvatarRef(collection, tokenId));
      setNftPreview(resolved);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden border border-line-strong bg-paper-sunk">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            <span className="font-display text-xl text-faint">?</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="reg-label">Current avatar</p>
          <p className="mt-1 truncate text-sm text-muted">{avatarStatus(current.loading, current.avatar)}</p>
        </div>
      </div>

      <div className="inline-flex border border-line-strong">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`reg-btn px-3 py-1.5 text-xs ${mode === 'upload' ? 'reg-btn-ink' : 'reg-btn-ghost border-0'}`}
        >
          Upload image
        </button>
        <button
          type="button"
          onClick={() => setMode('nft')}
          className={`reg-btn px-3 py-1.5 text-xs ${mode === 'nft' ? 'reg-btn-ink' : 'reg-btn-ghost border-0'}`}
        >
          Use NFT
        </button>
      </div>

      {mode === 'upload' ? (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="reg-btn reg-btn-ghost px-3 py-1.5 text-xs"
          >
            {uploading ? 'Stamping...' : 'Choose image'}
          </button>
          <p className="mt-1.5 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-faint">
            128x128 PNG, max 15KB, stored on-chain
          </p>
        </div>
      ) : (
        <div className="space-y-3 border border-line bg-paper-sunk p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <input
              type="text"
              value={collection}
              onChange={(e) => {
                setCollection(e.target.value);
                setNftPreview(null);
              }}
              placeholder="Collection contract"
              className="reg-input reg-input-mono text-sm"
            />
            <input
              type="text"
              value={tokenId}
              onChange={(e) => {
                setTokenId(e.target.value);
                setNftPreview(null);
              }}
              placeholder="Token ID"
              className="reg-input reg-input-mono text-sm"
            />
          </div>

          {nftPreview && (
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden border border-line-strong bg-paper-2">
                {previewUrl ? (
                  <img src={previewUrl} alt="NFT avatar preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display text-base text-faint">?</span>
                )}
              </div>
              <div className="min-w-0 text-sm">
                {nftPreview.kind === 'nft' && nftPreview.verified ? (
                  <p className="text-ink">Ownership verified</p>
                ) : (
                  <p className="text-bad">{previewError || 'NFT could not be verified'}</p>
                )}
                {nftPreview.kind === 'nft' && (
                  <p className="truncate font-mono text-[0.7rem] text-muted">
                    {shortAddress(nftPreview.ref.collection)} #{nftPreview.ref.tokenId}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePreviewNft}
              disabled={checking || uploading}
              className="reg-btn reg-btn-ghost px-3 py-1.5 text-xs"
            >
              {checking ? 'Checking...' : 'Preview NFT'}
            </button>
            <button
              type="button"
              onClick={handleUseNft}
              disabled={checking || uploading}
              className="reg-btn reg-btn-stamp px-3 py-1.5 text-xs"
            >
              {uploading ? 'Stamping...' : 'Use NFT avatar'}
            </button>
          </div>

          <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-faint">
            Stores only a compact ERC-721 reference on-chain
          </p>
        </div>
      )}

      {error && <p className="font-mono text-xs text-bad">{error}</p>}
    </div>
  );
}
