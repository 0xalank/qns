'use client';

import { CopyButton } from './CopyButton';

interface CodeBlockProps {
  children: string;
  label?: string;
}

export function CodeBlock({ children, label }: CodeBlockProps) {
  const code = children.trim();
  return (
    <div className="reg-frame my-5">
      <div className="reg-rule flex items-center justify-between gap-3 px-4 py-2">
        <span className="reg-label">{label || 'shell'}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto px-4 py-3.5">
        <code className="font-mono text-[0.8rem] leading-6 text-ink-soft">{code}</code>
      </pre>
    </div>
  );
}
