'use client';

import { FullNameData } from '@/lib/qnns';
import { CopyButton } from './CopyButton';
import { truncateAddress, truncatePaymentCode, formatDate, timeUntil, formatQuai, expiryStatusLabel, expiryBadgeColor } from '@/lib/utils';
import Link from 'next/link';

interface ProfileCardProps {
  name: string;
  data: FullNameData;
  owner: string;
  isOwner?: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="reg-rule py-4">
      <dt className="reg-label">{label}</dt>
      <dd className="mt-2">{children}</dd>
    </div>
  );
}

function CodeRow({ value, display, extra }: { value: string; display: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <code className="reg-code flex-1 truncate">{display}</code>
      {extra}
      <CopyButton text={value} />
    </div>
  );
}

export function ProfileCard({ name, data, owner, isOwner }: ProfileCardProps) {
  const expiresAt = Number(data.expiresAt);
  const avatarUrl = data.avatar && data.avatar !== '0x'
    ? `data:image/png;base64,${Buffer.from(data.avatar.slice(2), 'hex').toString('base64')}`
    : null;

  const socials = [
    data.twitter && { label: 'X', value: `@${data.twitter}`, href: `https://x.com/${data.twitter}` },
    data.github && { label: 'GitHub', value: data.github, href: `https://github.com/${data.github}` },
    data.telegram && { label: 'Telegram', value: `@${data.telegram}`, href: `https://t.me/${data.telegram}` },
    data.discord && { label: 'Discord', value: data.discord, href: null },
  ].filter(Boolean) as { label: string; value: string; href: string | null }[];

  return (
    <article className="reg-record reg-rise mx-auto max-w-3xl">
      {/* Masthead */}
      <header className="reg-masthead flex items-start justify-between gap-4 border-b border-line-strong p-6 sm:p-8">
        <div className="flex min-w-0 items-start gap-5">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden border border-line-strong bg-paper-sunk">
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
            ) : (
              <span className="font-display text-4xl text-faint">{name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="break-all font-display text-3xl leading-tight text-ink sm:text-4xl">
              {name}<span className="text-muted">.quai</span>
            </h1>
            {data.displayName && <p className="mt-1.5 text-muted">{data.displayName}</p>}
          </div>
        </div>
        <span className={`${expiryBadgeColor(expiresAt)} shrink-0`}>{expiryStatusLabel(expiresAt)}</span>
      </header>

      <div className="p-6 sm:p-8">
        {data.description && (
          <p className="mb-2 max-w-prose leading-7 text-ink-soft">{data.description}</p>
        )}
        {data.url && (
          <a
            href={data.url.startsWith('http') ? data.url : `https://${data.url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-stamp underline-offset-2 hover:underline"
          >
            {data.url} →
          </a>
        )}

        <dl className="mt-4">
          <Field label="Quai Address">
            <CodeRow value={data.quaiAddress} display={data.quaiAddress} />
          </Field>

          {data.qiPaymentCode && (
            <Field label="Qi Payment Code (BIP47)">
              <CodeRow
                value={data.qiPaymentCode}
                display={truncatePaymentCode(data.qiPaymentCode, 12)}
                extra={
                  <Link
                    href={`/derive?code=${encodeURIComponent(data.qiPaymentCode)}`}
                    className="shrink-0 border border-stamp px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-stamp transition-colors hover:bg-stamp hover:text-paper-2"
                  >
                    Derive
                  </Link>
                }
              />
            </Field>
          )}

          {data.nostrPubkey && (
            <Field label="Nostr Public Key">
              <CodeRow value={data.nostrPubkey} display={data.nostrPubkey} />
            </Field>
          )}

          {socials.length > 0 && (
            <Field label="Profiles">
              <div className="flex flex-wrap gap-2">
                {socials.map((s) =>
                  s.href ? (
                    <a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border border-line-strong px-3 py-1.5 text-sm text-ink-soft transition-colors hover:border-ink"
                    >
                      <span className="reg-label !text-[0.6rem]">{s.label}</span>{' '}
                      <span className="ml-1">{s.value}</span>
                    </a>
                  ) : (
                    <span key={s.label} className="border border-line px-3 py-1.5 text-sm text-muted">
                      <span className="reg-label !text-[0.6rem]">{s.label}</span>{' '}
                      <span className="ml-1">{s.value}</span>
                    </span>
                  )
                )}
              </div>
            </Field>
          )}
        </dl>
      </div>

      {/* Ledger footer */}
      <footer className="grid grid-cols-2 gap-y-4 border-t border-line-strong bg-paper-sunk p-6 sm:grid-cols-4 sm:p-8">
        <div>
          <p className="reg-label">Expires</p>
          <p className="mt-1 text-sm text-ink">{formatDate(expiresAt)}</p>
        </div>
        <div>
          <p className="reg-label">Time left</p>
          <p className="mt-1 text-sm text-ink">{expiresAt > 0 ? timeUntil(expiresAt) : 'Not set'}</p>
        </div>
        <div>
          <p className="reg-label">Lock</p>
          <p className="mt-1 text-sm text-ink">{formatQuai(data.lockAmount)} QUAI</p>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="reg-label">Owner</p>
            <p className="mt-1 truncate font-mono text-sm text-ink">{truncateAddress(owner)}</p>
          </div>
          {isOwner && (
            <Link href="/me" className="reg-btn reg-btn-ink shrink-0 px-3 py-1.5 text-xs">
              Edit
            </Link>
          )}
        </div>
      </footer>
    </article>
  );
}
