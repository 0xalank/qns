'use client';

import { useState } from 'react';

type Tab = 'sdk' | 'cli' | 'nostr';

export function DevTerminal() {
  const [activeTab, setActiveTab] = useState<Tab>('sdk');

  return (
    <div className="reg-record overflow-hidden bg-paper-sunk border border-line-strong">
      {/* Terminal Header */}
      <div className="flex items-center justify-between border-b border-line bg-paper px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-bad/40 border border-bad/70" />
          <span className="h-3 w-3 rounded-full bg-warn/40 border border-warn/70" />
          <span className="h-3 w-3 rounded-full bg-good/40 border border-good/70" />
          <span className="ml-3 font-mono text-[11px] uppercase tracking-wider text-muted font-medium">QNS Developer Console</span>
        </div>
        <div className="flex items-center gap-2">
          {(['sdk', 'cli', 'nostr'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
              className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border ${
                activeTab === tab
                  ? 'border-blue bg-blue-wash text-blue font-semibold'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Terminal Body */}
      <div className="p-5 font-mono text-xs text-ink-soft leading-6 overflow-x-auto min-h-[220px]">
        {activeTab === 'sdk' && (
          <div className="space-y-4">
            <div>
              <span className="text-muted">// 1. Initialize the QNS Client SDK</span>
              <pre className="text-blue dark:text-blue-bright">
                {`import { QNSClient } from '@quai/qns-sdk';\nconst qns = new QNSClient({ rpcUrl: 'https://rpc.quai.network' });`}
              </pre>
            </div>
            <div>
              <span className="text-muted">// 2. Resolve any .quai name in one call</span>
              <pre className="text-blue dark:text-blue-bright">
                {`const profile = await qns.getProfile('alex.quai');\nconsole.log(profile);`}
              </pre>
            </div>
            <div className="border-t border-line pt-3">
              <span className="text-muted">// Output Payload:</span>
              <pre className="text-ink text-[11px] bg-paper-2 border border-line p-3 mt-1.5 overflow-x-auto">
{`{
  "name": "alex.quai",
  "owner": "0x0072D691826aAE17B8bB01Fe2ecADd2D9eC1a568",
  "paymentCode": "PM8T7w3p4q6B9XyZ1a2b3c4d5e6f7g8h9i0j...",
  "nostrPubkey": "3bf0c63fcb93463407af97a5e5ee64fa883d107e...",
  "avatar": "0x89504e470d0a1a0a0000000d4948445200...",
  "contentHash": "0x0072d691826aae17b8bb01fe2ecadd2d9ec1a568"
}`}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'cli' && (
          <div className="space-y-2">
            <div>
              <span className="text-blue dark:text-blue-bright font-semibold">$</span> <span className="text-ink font-semibold">qns-cli deploy --dir ./dist --name alex.quai</span>
            </div>
            <div className="text-muted">⚡ Initiating static-site deployment to Quai Network...</div>
            <div className="text-ink">
              ✔ Analyzing local directory structure... (3 files found)<br />
              ✔ Packing file bytes (index.html, global.css, main.js)...<br />
              ✔ Calculating manifest keccak256 hash...<br />
              ✔ Deploying site module contract... [Tx: 0x001e00584ee3...]<br />
              ✔ Writing static file bytes to state storage...<br />
              ✔ Verifying on-chain content signatures... (Pass)<br />
              ✔ Anchoring site module resolver adapter to name 'alex.quai'...
            </div>
            <div className="border-t border-line pt-3 text-good font-semibold">
              🎉 Site successfully anchored! Accessible natively via qns://alex.quai
            </div>
          </div>
        )}

        {activeTab === 'nostr' && (
          <div className="space-y-4">
            <div>
              <span className="text-muted">// End-to-End Encrypted Messaging via QNS Names</span>
              <p className="mt-1 text-ink-soft">
                QNS resolves a name directly to a Nostr public key stored on-chain.
                Nostr clients perform ECDH key exchange to encrypt messages without any central server.
              </p>
            </div>
            <div className="bg-paper-2 border border-line p-3 space-y-2 text-[11px]">
              <div className="flex justify-between items-center text-muted">
                <span>[1. CLIENT RESOLVE]</span>
                <span className="text-blue">bob.quai → 3bf0c63fcb93...</span>
              </div>
              <div className="flex justify-between items-center text-muted">
                <span>[2. ECDH SECRET]</span>
                <span className="text-blue">shared_secret = alice_privkey × bob_pubkey</span>
              </div>
              <div className="flex justify-between items-center text-muted">
                <span>[3. RELAY EMIT]</span>
                <span className="text-good">Publish NIP-04/44 Encrypted Event</span>
              </div>
            </div>
            <div className="text-[11px] text-muted leading-relaxed">
              * Verification: client verifies `bob@names.quai.network` by fetching
              <br />
              <code className="text-ink bg-paper-sunk px-1">GET https://names.quai.network/.well-known/nostr.json?name=bob</code>
            </div>
          </div>
        )}
      </div>
      <div className="h-1 bg-blue" />
    </div>
  );
}
