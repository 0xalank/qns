import type { Metadata } from 'next';
import { DocHeader, H2, P, UL, LI, Term, NextLink, Note } from '@/components/Docs';

export const metadata: Metadata = {
  title: 'Docs · QNS',
  description: 'How the Quai Name Service works: names, profiles, and modules that turn a name into a website.',
};

export default function DocsHome() {
  return (
    <>
      <DocHeader
        kicker="Documentation"
        title="QNS in a nutshell"
        lead="QNS gives a wallet a renewable .quai name. A name can carry a profile, a payment code, and an avatar — and with modules, it can resolve to a real website read straight from the chain."
      />

      <H2>Two layers</H2>
      <P>QNS is built in two parts. You can use the first without ever touching the second.</P>
      <UL>
        <LI>
          <strong className="font-medium text-ink">The name registry (QNNS).</strong> Register a <Term>.quai</Term> name,
          bind it to your wallet, and point it at an address, a Qi payment code, an avatar, and social profiles. The
          live registry uses one-year terms with a 30-day grace period.
        </LI>
        <LI>
          <strong className="font-medium text-ink">The module loader.</strong> Optionally attach a <em>module</em> to your
          name so it resolves to a website, a redirect, or an app — rendered from on-chain data, not a hosting provider.
        </LI>
      </UL>

      <H2 id="pricing">Domain pricing</H2>
      <P>
        QNS domains are renewable for one year at a time. The deployed mainnet registry uses a one-time registration or
        auction payment, a refundable lock deposit, and a yearly renewal fee. Gas is separate and changes with network
        conditions.
      </P>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="reg-record p-5">
          <p className="reg-label">7+ characters</p>
          <p className="mt-3 font-display text-2xl text-ink">Instant claim</p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Pay a 200 QUAI registration fee, a 100 QUAI refundable lock, and the first-year renewal fee.
          </p>
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-blue">Typical first year: 360.29525 QUAI + gas</p>
        </div>
        <div className="reg-record p-5">
          <p className="reg-label">4-6 characters</p>
          <p className="mt-3 font-display text-2xl text-ink">Auction</p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Starts at a 1,000 QUAI auction floor. The winner also pays the refundable lock and first-year renewal fee.
          </p>
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-blue">5-6 yearly: 60.29525 QUAI · 4 yearly: 2,409.025 QUAI</p>
        </div>
        <div className="reg-record p-5">
          <p className="reg-label">1-3 characters</p>
          <p className="mt-3 font-display text-2xl text-ink">Premium auction</p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Starts at a 5,000 QUAI auction floor. The winner also pays the refundable lock and first-year renewal fee.
          </p>
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-blue">Yearly: 12,045.125 QUAI</p>
        </div>
      </div>
      <Note>
        The 100 QUAI lock is held with the domain and can be returned when the name is released. Renewal prices are
        stored in Qi-denominated tiers and converted by the contract using the deployed `quaiPerQi` rate. Current
        deployed rate: 1 Qi = 13.925 QUAI.
      </Note>
      <UL>
        <LI>Names are active for one year and have a 30-day grace period after expiry.</LI>
        <LI>Renewals can be paid directly in QUAI, or from the lock deposit when the lock has enough balance.</LI>
        <LI>Short-name auctions run for 24 hours, and bids near the end extend the auction window.</LI>
      </UL>

      <H2>What is a module?</H2>
      <P>
        A module is the answer to “what should this name load?” Your name resolves to a tiny on-chain pointer called an
        anchor; the anchor points to a module contract; the module tells a wallet or gateway how to render the page. The
        bytes live on Quai, so the site has no server to go down.
      </P>

      <H2>Where to go next</H2>
      <NextLink href="/docs/modules" label="How modules work" sub="Anchors, manifests, the loader, and the topologies a name can resolve to." />
      <NextLink href="/docs/deploy" label="Deploy a module" sub="Publish a fully on-chain static site and bind it to your name from the CLI." />
      <NextLink href="/modules" label="Module inspector" sub="Paste a name or address and see exactly what it loads on-chain." />
    </>
  );
}
