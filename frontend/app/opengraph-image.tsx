import { ImageResponse } from 'next/og';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#ffffff',
          color: '#101828',
          padding: 72,
          position: 'relative',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.16), transparent 55%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.6,
            backgroundImage:
              'linear-gradient(#E4EAF3 1px, transparent 1px), linear-gradient(90deg, #E4EAF3 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(circle at 50% 38%, black, transparent 72%)',
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 1, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <svg width="72" height="72" viewBox="0 0 128 128" fill="none">
              <rect width="128" height="128" rx="32" fill="#ffffff" />
              <rect x="20.5" y="20.5" width="87" height="87" rx="20.5" fill="#F5F8FF" stroke="#D8E2F2" />
              <path d="M40 82V49.5C40 44.2533 44.2533 40 49.5 40H82" stroke="#2563EB" strokeWidth="8" strokeLinecap="round" />
              <path d="M88 46V78.5C88 83.7467 83.7467 88 78.5 88H46" stroke="#1D4ED8" strokeWidth="8" strokeLinecap="round" />
              <circle cx="64" cy="64" r="12" fill="#2563EB" />
              <circle cx="64" cy="64" r="4" fill="#ffffff" />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.04em' }}>QNS</div>
              <div style={{ fontSize: 14, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#667085' }}>Quai Name Service</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 840 }}>
            <div style={{ fontSize: 82, lineHeight: 0.95, letterSpacing: '-0.06em', fontWeight: 700 }}>
              Names, profiles, and sites on Quai.
            </div>
            <div style={{ marginTop: 26, maxWidth: 760, fontSize: 28, lineHeight: 1.35, color: '#667085' }}>
              Register a renewable .quai name and use it as the home for your wallet, identity, and on-chain website.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, color: '#2563EB', fontSize: 18, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            <span>.quai names</span>
            <span>Wallet-owned</span>
            <span>On-chain modules</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
