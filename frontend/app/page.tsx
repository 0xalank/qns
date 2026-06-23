'use client';

import Link from 'next/link';
import { SearchBar } from '@/components/SearchBar';

const principles = [
  {
    no: '01',
    title: 'No more long addresses',
    body: 'Share a simple name like alex.quai instead of a long string of letters and numbers.',
  },
  {
    no: '02',
    title: 'Yours alone',
    body: "A name can't be bought, sold, or taken from you. It stays tied to your wallet for as long as you keep it.",
  },
  {
    no: '03',
    title: 'One name, everything',
    body: 'Link it to your payments, profile, and avatar. Update any of it whenever you want.',
  },
];

export default function Home() {
  return (
    <div className="pb-10">
      <section className="reg-rise relative isolate px-1 pb-20 pt-8 sm:pt-16">
        {/* soft blue aurora — full-bleed radial wash spanning the viewport,
            pulled up under the navbar to remove the white gap above it */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-2.5rem] -z-10 h-[820px] w-screen -translate-x-1/2 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(75% 80% at 50% 0%, color-mix(in oklch, var(--blue) 18%, transparent), transparent 62%), radial-gradient(42% 55% at 50% -6%, color-mix(in oklch, var(--blue-bright) 22%, transparent), transparent 58%)',
            }}
          />
          {/* fine fading grid */}
          <div
            className="absolute inset-0 opacity-40"
            style={{
              maskImage: 'radial-gradient(48% 58% at 50% 26%, black, transparent 82%)',
              WebkitMaskImage: 'radial-gradient(48% 58% at 50% 26%, black, transparent 82%)',
              backgroundImage:
                'linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)',
              backgroundSize: '52px 52px',
            }}
          />
        </div>

        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-[clamp(2.5rem,7vw,5.25rem)] font-medium leading-[0.95] tracking-[-0.03em] text-ink">
            What will you <span className="text-blue">build</span> today?
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-muted">
            Look up and register a <span className="text-ink">.quai</span> domain for your wallet. One name for your profile, payments, and on-chain sites.
          </p>

          <div className="mt-9 text-left">
            <SearchBar />
          </div>

          <dl className="mx-auto mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
            {[
              ['Suffix', '.quai'],
              ['7+ chars', 'Instant'],
              ['1–6 chars', 'Auction'],
              ['Transferable', 'No'],
            ].map(([k, v], i) => (
              <div key={k} className="flex items-center gap-7">
                {i > 0 && <span className="h-3 w-px bg-line-strong" aria-hidden />}
                <div className="flex items-baseline gap-2">
                  <dt className="reg-label">{k}</dt>
                  <dd className="font-display text-base text-ink">{v}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mt-24 grid gap-px bg-line sm:grid-cols-3">
        {principles.map((p) => (
          <article key={p.no} className="bg-paper px-1 py-6 sm:px-7 sm:py-2">
            <span className="font-mono text-xs tracking-[0.2em] text-blue">{p.no}</span>
            <h2 className="mt-3 font-display text-xl text-ink">{p.title}</h2>
            <p className="mt-2 text-sm leading-7 text-muted">{p.body}</p>
          </article>
        ))}
      </section>

      <section className="mt-20 flex flex-col items-start justify-between gap-5 border border-line bg-paper-2 p-7 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl text-ink">Building on QNS?</h2>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted">
            Inspect how a name resolves: modules, manifests, and on-chain sites, straight from Quai RPC.
          </p>
        </div>
        <Link href="/modules" className="reg-btn reg-btn-ghost shrink-0">
          Developer tools →
        </Link>
      </section>
    </div>
  );
}
