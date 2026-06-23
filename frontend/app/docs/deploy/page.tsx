import type { Metadata } from 'next';
import { DocHeader, H2, P, UL, LI, Note, Term, Step, NextLink } from '@/components/Docs';
import { CodeBlock } from '@/components/CodeBlock';

export const metadata: Metadata = {
  title: 'Deploy a module · QNS',
  description: 'Publish a fully on-chain static site with the QNS CLI and bind it to your .quai name.',
};

const env: [string, string][] = [
  ['CYPRUS1_PK', 'Private key that signs and pays for the deploy. (MAINNET_CYPRUS1_PK takes priority if set.)'],
  ['MAINNET_RPC_URL', 'Quai RPC endpoint. Defaults to https://rpc.quai.network/cyprus1.'],
  ['QNS_SITE_DIR', 'Folder of files to publish. Defaults to examples/static-site.'],
  ['QNS_ENTRY_PATH', 'Entry file route, e.g. /index.html. Auto-detected if omitted.'],
  ['QNS_SITE_TITLE', 'Human title stored in the manifest.'],
  ['QNS_NAME', 'The .quai name this site will be bound to.'],
  ['QNNS_CONTRACT', 'Canonical QNNS address — required when setting the anchor.'],
  ['SET_ANCHOR', 'Set to true to actually write the anchor on-chain.'],
];

export default function DeployDocs() {
  return (
    <>
      <DocHeader
        kicker="Modules"
        title="Deploy a module"
        lead="Publish a fully on-chain static site and point your .quai name at it — entirely from the CLI. The bytes are stored in contract state and verified by hash on load."
      />

      <H2 id="prereq">Before you start</H2>
      <UL>
        <LI>Clone the repo and install dependencies with <Term>npm install</Term>.</LI>
        <LI>You own the <Term>.quai</Term> name you want to bind (register it first on the site).</LI>
        <LI>A funded Quai key for gas, set in <Term>.env</Term>.</LI>
      </UL>
      <CodeBlock label=".env">{`CYPRUS1_PK=0xyour_private_key
MAINNET_RPC_URL=https://rpc.quai.network/cyprus1`}</CodeBlock>

      <H2 id="env">Configuration</H2>
      <P>Every step below is driven by environment variables. The ones you’ll touch most often:</P>
      <div className="reg-frame mt-5 divide-y divide-line">
        {env.map(([key, desc]) => (
          <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4">
            <code className="font-mono text-[0.8rem] text-blue">{key}</code>
            <span className="text-sm leading-6 text-muted">{desc}</span>
          </div>
        ))}
      </div>

      <H2 id="steps">Publish in three steps</H2>
      <div className="reg-frame mt-5 px-5">
        <Step n={1} title="Publish the site bytes">
          <P>
            Chunk, hash, and upload your files. This deploys a <Term>QNSStaticContentStore</Term> and a{' '}
            <Term>QNSStaticSiteModule</Term>, then writes a deployment record to <Term>deployments/</Term> and prints the
            96-byte anchor. It does not bind your name yet.
          </P>
          <CodeBlock label="publish">{`QNS_NAME=yoursite \\
QNS_SITE_DIR=./examples/static-site \\
QNS_SITE_TITLE="My on-chain site" \\
npm run publish:static:mainnet`}</CodeBlock>
        </Step>

        <Step n={2} title="Bind your name to the module">
          <P>
            Write the anchor into the registry so <Term>yoursite.quai</Term> resolves to the module you just deployed. This
            requires that your wallet owns the name. Set <Term>SET_ANCHOR=true</Term> to send the transaction (omit it for a
            dry run).
          </P>
          <CodeBlock label="anchor">{`QNS_NAME=yoursite \\
QNNS_CONTRACT=0x001d4668f5621ee6211C396243faFe163A057516 \\
SET_ANCHOR=true \\
npm run anchor:module:mainnet`}</CodeBlock>
        </Step>

        <Step n={3} title="Verify and view">
          <P>
            Re-read the module from chain, recompute the manifest and file hashes, and confirm they match. Then load it the
            way a wallet would, or open it in the inspector.
          </P>
          <CodeBlock label="verify + load">{`npm run verify:module:mainnet

QNS_NAME=yoursite npm run load:module:mainnet`}</CodeBlock>
        </Step>
      </div>

      <Note>
        Once the anchor is set, the name resolves natively in a QNS-aware wallet (Pelagus) at <Term>yoursite.quai</Term>, and
        in the <a className="font-medium text-blue underline-offset-2 hover:underline" href="/modules">module inspector</a>.
      </Note>

      <H2 id="examples">Shortcut: deploy an example</H2>
      <P>To see the whole flow end-to-end without building files, deploy one of the bundled examples:</P>
      <CodeBlock label="examples">{`# fully on-chain fixed static site
npm run deploy:examples:mainnet

# HTML + CSS static site
npm run deploy:examples:html:mainnet`}</CodeBlock>

      <H2 id="next">Next</H2>
      <NextLink href="/docs/modules" label="How modules work" sub="The anchor, manifest, and loader behind these commands." />
    </>
  );
}
