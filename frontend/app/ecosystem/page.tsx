import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Ecosystem',
  description: 'Apps, modules, and tools being built on top of QNS.',
  openGraph: {
    title: 'QNS Ecosystem',
    description: 'Apps, modules, and tools being built on top of QNS.',
  },
};

const live = [
  {
    name: 'QNS Registry',
    status: 'Live',
    href: '/register',
    body: 'Register a renewable .quai name for your wallet, profile, avatar, and payment code.',
  },
  {
    name: 'Static Site Modules',
    status: 'Live',
    href: '/docs/deploy',
    body: 'Publish HTML, CSS, markdown, and text into contract state, then load it from a .quai name.',
  },
  {
    name: 'Module Inspector',
    status: 'Live',
    href: '/modules',
    body: 'Read exactly what a QNS name or module address loads, including anchors, manifests, and file hashes.',
  },
  {
    name: 'Pelagus Loader',
    status: 'Branch',
    href: '/docs/modules',
    body: 'Native wallet resolution for .quai hosts and qns:// links, with hash-verified static rendering.',
  },
];

const upcoming = [
  {
    name: 'QNS Publish',
    body: 'Long-form posts and comments with the current canonical version stored in contract state.',
  },
  {
    name: 'Component Graphs',
    body: 'Reusable on-chain components that let sites share visual building blocks without republishing every byte.',
  },
  {
    name: 'App Contracts',
    body: 'Stateful contracts that expose typed route data for richer wallet-rendered apps.',
  },
  {
    name: 'Adapter Network',
    body: 'Bridges that mirror QNS posts, profiles, and updates into external social protocols without making them canonical.',
  },
];

function Status({ children }: { children: React.ReactNode }) {
  const liveStyle = children === 'Live' ? 'reg-stamp-good' : 'reg-stamp-mark';
  return <span className={`reg-stamp ${liveStyle}`}>{children}</span>;
}

export default function EcosystemPage() {
  return (
    <div className="pb-12">
      <section className="reg-rise grid gap-10 border-b border-line pb-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="reg-kicker">Ecosystem</p>
          <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[0.96] text-ink sm:text-6xl">
            Things being built on QNS.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">
            QNS starts with names, then grows into modules, wallet-native websites, publishing, and reusable app surfaces.
          </p>
        </div>

        <div className="reg-record self-end p-5">
          <svg viewBox="0 0 100 100" fill="none" className="h-16 w-16 text-ink">
            <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 3" opacity="0.3"/>
            <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="0.5" opacity="0.15"/>

            <line x1="50" y1="2" x2="50" y2="6" stroke="#2563EB" strokeWidth="2"/>
            <line x1="50" y1="94" x2="50" y2="98" stroke="#2563EB" strokeWidth="2"/>
            <line x1="2" y1="50" x2="6" y2="50" stroke="#2563EB" strokeWidth="2"/>
            <line x1="94" y1="50" x2="98" y2="50" stroke="#2563EB" strokeWidth="2"/>

            <polygon points="50,22 80,78 20,78" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>

            <line x1="50" y1="22" x2="50" y2="78" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
            <line x1="50" y1="55" x2="20" y2="78" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="50" y1="55" x2="80" y2="78" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="50" y1="22" x2="35" y2="78" stroke="currentColor" strokeWidth="1" strokeDasharray="1 1" opacity="0.5"/>
            <line x1="50" y1="22" x2="65" y2="78" stroke="currentColor" strokeWidth="1" strokeDasharray="1 1" opacity="0.5"/>

            <polygon points="50,22 62.5,45 50,38 37.5,45" fill="#2563EB" stroke="#2563EB" strokeWidth="2" strokeLinejoin="round" opacity="0.9"/>
          </svg>
          <p className="mt-5 reg-label">Builder surface</p>
          <p className="mt-2 text-sm leading-7 text-ink-soft">
            Every project here uses the same idea: a name points at verified on-chain data that a wallet or gateway can render.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-5 flex items-end justify-between gap-5">
          <div>
            <p className="reg-kicker">Available now</p>
            <h2 className="mt-2 font-display text-3xl text-ink">Live building blocks</h2>
          </div>
          <Link href="/docs" className="hidden text-sm font-medium text-blue hover:underline sm:block">
            Read docs →
          </Link>
        </div>

        <div className="grid gap-px bg-line md:grid-cols-2">
          {live.map((item) => (
            <Link key={item.name} href={item.href} className="group bg-paper p-6 transition-colors hover:bg-paper-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-2xl text-ink group-hover:text-blue">{item.name}</h3>
                  <p className="mt-3 max-w-md text-sm leading-7 text-muted">{item.body}</p>
                </div>
                <Status>{item.status}</Status>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <p className="reg-kicker">Coming next</p>
        <h2 className="mt-2 font-display text-3xl text-ink">Reserved ecosystem slots</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {upcoming.map((item) => (
            <article key={item.name} className="reg-record p-5">
              <div className="flex items-start justify-between gap-4">
                <img src="/qns-tba-icon.svg" alt="" className="h-11 w-11 shrink-0" />
                <span className="reg-stamp">TBA</span>
              </div>
              <h3 className="mt-7 font-display text-xl text-ink">{item.name}</h3>
              <p className="mt-2 text-sm leading-7 text-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 flex flex-col items-start justify-between gap-5 border border-line bg-paper-2 p-7 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl text-ink">Building something on QNS?</h2>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted">
            Start with a module, publish the bytes on-chain, then anchor it to a name you control.
          </p>
        </div>
        <Link href="/docs/deploy" className="reg-btn reg-btn-stamp shrink-0">
          Deploy a module →
        </Link>
      </section>
    </div>
  );
}
