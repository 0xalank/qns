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
      className={`shrink-0 border px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] transition-colors ${
        copied
          ? 'border-good text-good'
          : 'border-line-strong text-muted hover:border-ink hover:text-ink'
      } ${className}`}
    >
      {copied ? 'Copied' : label || 'Copy'}
    </button>
  );
}
