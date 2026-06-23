import type { Metadata } from 'next';
import { DocHeader, H2, P, UL, LI, Term, NextLink } from '@/components/Docs';

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
