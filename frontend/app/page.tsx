'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SearchBar } from '@/components/SearchBar';
import { ResolutionPreview } from '@/components/ResolutionPreview';
import { DevTerminal } from '@/components/DevTerminal';
import { OnChainBrowser } from '@/components/OnChainBrowser';
import { ActivityFeed } from '@/components/ActivityFeed';

const specs = [
  ['Domain Suffix', '.quai'],
  ['7+ Characters', 'Instant Claim'],
  ['1–6 Characters', 'English Auction'],
  ['Transfer Status', 'ERC-721 with fee-gated transfers'],
  ['Validity Period', '1 year + 30-day grace'],
];

const faqs = [
  {
    q: 'What is an on-chain website?',
    a: 'An on-chain website is a website whose code (HTML, CSS, files) is stored directly inside smart contract variables on the Quai blockchain. It does not run on AWS, GoDaddy, or any private server. It is serverless, censorship-resistant, and remains online as long as its module stays available and the name anchor remains active.',
  },
  {
    q: 'How do I visit a QNS site?',
    a: 'You can visit QNS sites using a Web3-compatible browser or wallet extension (such as Pelagus). Just enter the address like "qns://satoshi" to load files directly from Quai Network. Alternatively, Web2 gateways can route requests to the blockchain.',
  },
  {
    q: 'Can I transfer a QNS name?',
    a: 'The live QNNS registry mints names as ERC-721 records. Direct transfers are fee-gated by the contract, and marketplace bids can be accepted on-chain. The current deployment is not soulbound.',
  },
  {
    q: 'How does domain validity and renewal work?',
    a: 'Names register for one year. They can be renewed by paying the yearly fee, or the owner can renew from the lock deposit if enough is available. After expiry there is a 30-day grace period before the name can be expired and registered again.',
  },
];

const simplifiedSteps = [
  {
    no: '01',
    title: 'Search & Pick',
    desc: 'Enter any username in the search bar. Check its availability instantly on-chain.',
  },
  {
    no: '02',
    title: 'Claim & Register',
    desc: 'Register a 7+ character name instantly, or open a 24-hour auction for shorter names.',
  },
  {
    no: '03',
    title: 'Set up Profile',
    desc: 'Add your display avatar, social links, and Nostr public keys to your sovereign profile.',
  },
  {
    no: '04',
    title: 'Go Live',
    desc: 'Publish your website files directly to contract state, allowing the world to visit serverlessly.',
  },
];

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="pb-16 space-y-24">
      {/* 1. Hero Section with dynamic ambient grid */}
      <section className="reg-rise relative isolate pt-8 sm:pt-16">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-2.5rem] -z-10 h-[820px] w-screen -translate-x-1/2 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(75% 80% at 50% 0%, color-mix(in oklch, var(--blue) 12%, transparent), transparent 65%), radial-gradient(42% 55% at 50% -6%, color-mix(in oklch, var(--blue-bright) 15%, transparent), transparent 60%)',
            }}
          />
          <div
            className="absolute inset-0 opacity-20 dark:opacity-30"
            style={{
              maskImage: 'radial-gradient(48% 58% at 50% 26%, black, transparent 82%)',
              WebkitMaskImage: 'radial-gradient(48% 58% at 50% 26%, black, transparent 82%)',
              backgroundImage:
                'linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="space-y-6 text-left">
            <h1 className="font-display text-[clamp(2.5rem,7vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.03em] text-ink">
              What will you <span className="text-blue">build</span> today?
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted">
              Register a renewable <span className="text-ink font-semibold">.quai</span> name. One username for on-chain profiles, crypto payments, and serverless hosting.
            </p>

            <div className="space-y-6">
              <SearchBar onQueryChange={setSearchQuery} />
              <ResolutionPreview name={searchQuery} />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Core Concepts Grid */}
      <section className="grid gap-8 md:grid-cols-3 border-t border-b border-line py-12 bg-paper-2/40 backdrop-blur-sm">
        <article className="space-y-3 p-4">
          <span className="font-mono text-xs tracking-widest text-blue">01 / DECENTRALIZED WEB</span>
          <h3 className="font-display text-xl text-ink font-bold">Unstoppable Sites</h3>
          <p className="text-sm leading-6 text-muted">
            Host websites directly inside Quai smart contracts. Free from central hosting providers, server crashes, domain confiscation, and downtime.
          </p>
        </article>
        <article className="space-y-3 p-4 border-t md:border-t-0 md:border-l border-line">
          <span className="font-mono text-xs tracking-widest text-blue">02 / SOVEREIGN ACCOUNT</span>
          <h3 className="font-display text-xl text-ink font-bold">One Simple Username</h3>
          <p className="text-sm leading-6 text-muted">
            Replace complex wallet addresses with a clean `.quai` handle. Link your profile, custom avatar, social handles, and crypto keys on-chain.
          </p>
        </article>
        <article className="space-y-3 p-4 border-t md:border-t-0 md:border-l border-line">
          <span className="font-mono text-xs tracking-widest text-blue">03 / LIVE REGISTRY</span>
          <h3 className="font-display text-xl text-ink font-bold">Renewable Name Terms</h3>
          <p className="text-sm leading-6 text-muted">
            The deployed QNNS registry uses one-year terms, a 30-day grace period, and contract-controlled renewals, transfers, and marketplace bids.
          </p>
        </article>
      </section>

      {/* 3. On-Chain Browser Simulator */}
      <section className="max-w-5xl mx-auto">
        <OnChainBrowser />
      </section>

      {/* 4. How it Works (Normie steps) */}
      <section className="space-y-10">
        <div className="text-center max-w-xl mx-auto space-y-3">
          <p className="reg-kicker">Simple Onboarding</p>
          <h2 className="font-display text-3xl text-ink">Get Started in Minutes</h2>
          <p className="text-sm text-muted">
            Registering and setting up your decentralized identity is simple and takes just a few clicks.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {simplifiedSteps.map((step) => (
            <div key={step.no} className="reg-record p-6 bg-paper-2 border border-line flex flex-col justify-between">
              <div>
                <span className="font-mono text-xs tracking-widest text-blue block mb-3">STEP {step.no}</span>
                <h3 className="font-display text-lg text-ink font-bold">{step.title}</h3>
                <p className="mt-2 text-xs leading-5 text-muted">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Developer Console (Full Width) */}
      <section className="space-y-6">
        <div>
          <p className="reg-kicker">Developer Console</p>
          <h2 className="mt-2 font-display text-3xl text-ink">Integrate QNS Natively</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Developers can look up profiles, verify identity signatures, or load on-chain static modules using our JavaScript SDK.
          </p>
        </div>
        <DevTerminal />
      </section>

      {/* 6. FAQs */}
      <section className="space-y-6">
        <div>
          <p className="reg-kicker">Help Center</p>
          <h2 className="mt-2 font-display text-3xl text-ink">Frequently Asked Questions</h2>
        </div>
        <div className="border border-line divide-y divide-line bg-paper-2">
          {faqs.map((faq, idx) => (
            <div key={faq.q} className="p-4">
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                type="button"
                className="w-full flex justify-between items-center text-left font-display text-base text-ink font-semibold hover:text-blue transition-colors"
              >
                <span>{faq.q}</span>
                <span className="text-xs text-muted font-mono">{openFaq === idx ? '▲' : '▼'}</span>
              </button>
              {openFaq === idx && (
                <p className="mt-3 text-sm leading-6 text-muted pr-6 transition-all duration-300">
                  {faq.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 7. Footer CTA Banner */}
      <section className="flex flex-col items-start justify-between gap-5 border border-line bg-paper-2 p-8 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl text-ink">Building on QNS?</h2>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted">
            Learn how a name resolves to an on-chain site, then publish your own directly from the CLI.
          </p>
        </div>
        <Link href="/docs" className="reg-btn reg-btn-ghost shrink-0 border border-line-strong hover:border-blue hover:text-blue">
          Read the docs →
        </Link>
      </section>
    </div>
  );
}
