import Link from 'next/link';

export function DocHeader({ kicker, title, lead }: { kicker?: string; title: string; lead?: string }) {
  return (
    <header className="reg-rise mb-10">
      {kicker && <p className="reg-kicker">{kicker}</p>}
      <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">{title}</h1>
      {lead && <p className="mt-4 text-lg leading-8 text-muted">{lead}</p>}
    </header>
  );
}

export function H2({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-12 scroll-mt-24 font-display text-2xl text-ink">
      {children}
    </h2>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-8 font-display text-lg text-ink">{children}</h3>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 leading-7 text-ink-soft">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mt-4 space-y-2.5">{children}</ul>;
}

export function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 leading-7 text-ink-soft">
      <span aria-hidden className="mt-3 h-1 w-1 shrink-0 rounded-full bg-blue" />
      <span>{children}</span>
    </li>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 border-l-2 border-blue bg-blue-wash py-3 pl-4 pr-4 text-sm leading-7 text-ink-soft">
      {children}
    </div>
  );
}

export function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="reg-rule py-6 last:border-b-0">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-blue">{String(n).padStart(2, '0')}</span>
        <h3 className="font-display text-lg text-ink">{title}</h3>
      </div>
      <div className="mt-2 pl-7">{children}</div>
    </div>
  );
}

export function Term({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[0.85em] text-blue">{children}</code>;
}

export function NextLink({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <Link href={href} className="reg-record group mt-4 block p-5 transition-colors hover:border-blue">
      <span className="font-display text-lg text-ink group-hover:text-blue">{label} →</span>
      <p className="mt-1 text-sm text-muted">{sub}</p>
    </Link>
  );
}
