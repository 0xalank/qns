import type { Metadata } from 'next';
import { DocHeader, H2, H3, P, UL, LI, Note, Term, NextLink } from '@/components/Docs';

export const metadata: Metadata = {
  title: 'How modules work · QNS',
  description: 'Anchors, manifests, the loader algorithm, and the topologies a .quai name can resolve to.',
};

const topologies = [
  ['Static site', 'Live', 'A site made of bytes (HTML, CSS, markdown, text) stored in contract chunks and verified by hash. No JavaScript.'],
  ['Redirect', 'Live', 'Send the name to another URL. The destination is shown before any navigation.'],
  ['Bootstrap', 'Spec', 'Delegate one name to another name or anchor, without external navigation.'],
  ['Contract data', 'Spec', 'A known renderer interprets typed data the contract exposes — profiles, catalogs, dashboards.'],
  ['Component graph', 'Spec', 'Assemble a site from reusable on-chain components plus small data props.'],
  ['App contract', 'Spec', 'One app contract owns its own routing and returns hash-verified payloads per route.'],
  ['Publish', 'Spec', 'Long-form posts and comments, reconstructed from the QNS Publish contract.'],
];

export default function ModulesDocs() {
  return (
    <>
      <DocHeader
        kicker="Modules"
        title="How modules work"
        lead="A module turns a name into something a browser can render — without trusting a web server. Everything the loader needs lives on Quai and is verified by hash before it is shown."
      />

      <H2 id="chain">The chain of trust</H2>
      <P>Resolving <Term>yoursite.quai</Term> walks three small hops. Each one is verified against the next.</P>
      <UL>
        <LI>
          <strong className="font-medium text-ink">Name → anchor.</strong> The name hashes to a <Term>nameHash</Term>, which
          resolves through the <Term>QNSAnchorRegistry</Term> to a 96-byte <em>anchor</em> — the first trusted pointer. It
          carries a version, chain ID, module address, topology, and the expected manifest hash. Nothing else.
        </LI>
        <LI>
          <strong className="font-medium text-ink">Anchor → module.</strong> The anchor names a <em>module contract</em>.
          The loader reads its topology and manifest and checks they match what the anchor promised.
        </LI>
        <LI>
          <strong className="font-medium text-ink">Module → renderer.</strong> The manifest declares a <em>renderer</em> and
          a <em>topology</em>. The loader runs the matching built-in renderer to draw the page from on-chain data.
        </LI>
      </UL>
      <Note>
        The anchor is intentionally tiny — it is the pointer, not the page. Heavy bytes (HTML, images, data) live one layer
        down in module state or a content store, referenced by hash.
      </Note>

      <H2 id="manifest">The manifest</H2>
      <P>
        Every module returns a <Term>moduleManifest()</Term> — ABI-encoded bytes whose <Term>keccak256</Term> must equal the
        anchor’s <Term>manifestHash</Term>. The manifest declares the title, default route, renderer, a permission policy,
        a resource budget, and the topology-specific data. The loader refuses to render if any hash fails to match.
      </P>

      <H2 id="loader">What the loader does</H2>
      <P>A wallet (natively, via Pelagus) or a gateway runs the same deterministic steps:</P>
      <UL>
        <LI>Parse the entry into a name or a direct module address, keeping the route path and query.</LI>
        <LI>Resolve the anchor, decode it, and confirm the version, chain, and topology are supported.</LI>
        <LI>Read the module’s manifest and verify its hash, then verify every file or payload hash before display.</LI>
        <LI>Render with bundled, known-safe renderer code — never code returned by the contract.</LI>
        <LI>Fail closed: unknown topology, unknown renderer, or a bad hash means nothing is shown.</LI>
      </UL>
      <Note>
        Static sites never run JavaScript. Scripts, inline handlers, <Term>javascript:</Term> URLs, and iframes are stripped
        before rendering. Wallet permissions are scoped to the name’s origin and require explicit confirmation.
      </Note>

      <H2 id="topologies">Topologies</H2>
      <P>A topology is the rendering model a module declares. v1 ships static sites and redirects; the rest are reserved in the spec so future modules boot through the same anchor and manifest path.</P>
      <div className="reg-frame mt-5 divide-y divide-line">
        {topologies.map(([name, status, detail]) => (
          <div key={name} className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-base text-ink">{name}</h3>
              <span className={`reg-stamp ${status === 'Live' ? 'reg-stamp-good' : ''}`}>{status}</span>
            </div>
            <p className="mt-1.5 text-sm leading-6 text-muted">{detail}</p>
          </div>
        ))}
      </div>

      <H2 id="next">Try it</H2>
      <NextLink href="/docs/deploy" label="Deploy a module" sub="Publish a static site fully on-chain and bind it to your name." />
      <NextLink href="/modules" label="Module inspector" sub="Inspect a live name or module address, hash by hash." />
    </>
  );
}
