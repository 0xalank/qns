'use client';

import { useState, useRef } from 'react';

interface AvatarUploadProps {
  currentAvatar?: string; // hex string from contract
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

export function AvatarUpload({ currentAvatar, onUpload }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const avatarUrl = currentAvatar && currentAvatar !== '0x'
    ? `data:image/png;base64,${Buffer.from(currentAvatar.slice(2), 'hex').toString('base64')}`
    : null;

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

  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden">
        {avatarUrl ? (
          <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <span className="text-neutral-600 text-xl">?</span>
        )}
      </div>
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : 'Change Avatar'}
        </button>
        <p className="text-xs text-neutral-500 mt-1">128x128, max 15KB, PNG</p>
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
    </div>
  );
}
