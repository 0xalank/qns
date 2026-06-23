'use client';

import { useState } from 'react';

const steps = [
  {
    no: '01',
    name: 'Commit Hash',
    desc: 'Generate a secret key locally and submit the hash of (name + secret + owner). This claims your intent to register without revealing the actual name.',
    details: 'Function: commit(bytes32 commitment)',
  },
  {
    no: '02',
    name: '1-Min Cooldown',
    desc: 'A brief waiting period that ensures no frontrunner can see your name in the mempool and register it ahead of you in the same block.',
    details: 'Enforced by block timestamp checks',
  },
  {
    no: '03',
    name: 'Reveal & Pay',
    desc: 'Reveal the plain text name and secret key, then submit the registration fee. The contract matches it against your previous commitment.',
    details: 'Function: reveal(string name, bytes32 secret)',
  },
  {
    no: '04',
    name: '48-Hour Claim',
    desc: 'A security window before the name goes active. If another user disputes or holds a prior claim, it can be audited before resolving.',
    details: 'Status: Pending active resolution',
  },
];

export function RegistrationFlow() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <div className="space-y-6">
      <div>
        <p className="reg-kicker">Security Protocol</p>
        <h2 className="mt-2 font-display text-3xl text-ink">Commit-Reveal Registration</h2>
        <p className="mt-2 text-sm leading-6 text-muted max-w-xl">
          QNS uses a cryptographically secure 4-stage registration pipeline to eliminate front-running and MEV bot exploits.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left Column: Visual Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {steps.map((step, idx) => (
            <button
              key={step.no}
              onClick={() => setActiveStep(idx)}
              type="button"
              className={`text-left p-5 border transition-all ${
                activeStep === idx
                  ? 'border-blue bg-paper-2 shadow-sm'
                  : 'border-line bg-paper hover:border-line-strong'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-mono text-xs tracking-widest ${activeStep === idx ? 'text-blue' : 'text-muted'}`}>
                  STAGE {step.no}
                </span>
                {activeStep === idx && (
                  <span className="h-2 w-2 rounded-full bg-blue animate-ping" />
                )}
              </div>
              <h3 className="mt-3 font-display text-lg text-ink font-semibold">{step.name}</h3>
              <p className="mt-2 text-xs leading-5 text-muted line-clamp-2">{step.desc}</p>
            </button>
          ))}
        </div>

        {/* Right Column: Detailed Inspector Card */}
        <div className="reg-record p-5 bg-paper-2 flex flex-col justify-between border border-line-strong">
          <div>
            <div className="flex items-center justify-between">
              <span className="reg-label">Stage Details</span>
              <span className="font-mono text-[10px] text-blue bg-blue-wash px-1.5 py-0.5 uppercase tracking-wider">
                Active View
              </span>
            </div>
            <h3 className="mt-4 font-display text-xl text-ink font-semibold">
              {steps[activeStep].name}
            </h3>
            <p className="mt-3 font-sans text-xs leading-6 text-ink-soft">
              {steps[activeStep].desc}
            </p>
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted block">Contract Protocol</span>
            <code className="mt-1 block font-mono text-[11px] text-blue-deep dark:text-blue-bright break-all bg-paper-sunk p-2 border border-line">
              {steps[activeStep].details}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
