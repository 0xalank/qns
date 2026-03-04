'use client';

import { useState } from 'react';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className={`text-xs px-2 py-1 rounded transition-colors ${
        copied
          ? 'bg-green-800 text-green-300'
          : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
      } ${className}`}
    >
      {copied ? 'Copied!' : label || 'Copy'}
    </button>
  );
}
