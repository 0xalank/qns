'use client';

import { useState } from 'react';
import { Signer } from 'quais';
import * as qnns from '@/lib/qnns';
import { AvatarUpload } from './AvatarUpload';
import { formatQuai, expiryStatusLabel, expiryBadgeColor, timeUntil } from '@/lib/utils';

interface ProfileFormProps {
  nameHash: string;
  data: qnns.FullNameData;
  signer: Signer;
  ownerAddress?: string;
  onUpdate: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="reg-record p-5 sm:p-6">
      <h3 className="reg-label mb-4">{title}</h3>
      {children}
    </section>
  );
}

function SaveButton({ active, label, ...props }: { active: boolean; label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className="reg-btn reg-btn-ink text-sm">
      {active ? 'Saving…' : label}
    </button>
  );
}

export function ProfileForm({ nameHash, data, signer, ownerAddress, onUpdate }: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(data.displayName);
  const [description, setDescription] = useState(data.description);
  const [url, setUrl] = useState(data.url);
  const [twitter, setTwitter] = useState(data.twitter);
  const [github, setGithub] = useState(data.github);
  const [discord, setDiscord] = useState(data.discord);
  const [telegram, setTelegram] = useState(data.telegram);
  const [qiPaymentCode, setQiPaymentCode] = useState(data.qiPaymentCode);
  const [quaiAddress, setQuaiAddress] = useState(data.quaiAddress);
  const [nostrPubkey, setNostrPubkey] = useState(data.nostrPubkey);

  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const expiresAt = Number(data.expiresAt);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
    onUpdate();
  };

  const saveProfile = async () => {
    setSaving('profile');
    setError(null);
    try {
      await qnns.setProfile(signer, nameHash, displayName, description, url);
      showSuccess('Profile updated');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  const saveSocials = async () => {
    setSaving('socials');
    setError(null);
    try {
      await qnns.setSocials(signer, nameHash, twitter, github, discord, telegram);
      showSuccess('Socials updated');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  const saveQuaiAddress = async () => {
    setSaving('quaiAddress');
    setError(null);
    try {
      await qnns.setQuaiAddress(signer, nameHash, quaiAddress);
      showSuccess('Quai address updated');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  const saveQiPaymentCode = async () => {
    setSaving('qi');
    setError(null);
    try {
      await qnns.setQiPaymentCode(signer, nameHash, qiPaymentCode);
      showSuccess('Qi payment code updated');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  const saveNostrPubkey = async () => {
    setSaving('nostr');
    setError(null);
    try {
      await qnns.setNostrPubkey(signer, nameHash, nostrPubkey);
      showSuccess('Nostr pubkey updated');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  const handleAvatarUpload = async (avatarData: Uint8Array) => {
    await qnns.setAvatar(signer, nameHash, avatarData);
    showSuccess('Avatar updated');
  };

  const handleRenew = async () => {
    setSaving('renew');
    setError(null);
    try {
      const price = await qnns.getYearlyPriceQuai(nameHash);
      await qnns.renew(signer, nameHash, price);
      showSuccess('Name renewed for 1 year');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  const handleRenewFromLock = async () => {
    setSaving('renewLock');
    setError(null);
    try {
      await qnns.renewFromLock(signer, nameHash);
      showSuccess('Renewed from lock deposit');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  const handleRelease = async () => {
    if (!confirm('Are you sure? This will release the name and return your lock deposit.')) return;
    setSaving('release');
    setError(null);
    try {
      await qnns.releaseName(signer, nameHash);
      showSuccess('Name released');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  const inputCls = 'reg-input text-sm';
  const monoCls = 'reg-input reg-input-mono flex-1';

  return (
    <div className="space-y-5">
      {error && (
        <div className="border border-bad bg-[var(--bad-wash)] px-4 py-3 text-sm text-bad">{error}</div>
      )}
      {success && (
        <div className="reg-rise flex items-center gap-3 border border-good bg-[var(--good-wash)] px-4 py-3 text-sm text-good">
          <span className="reg-stamp reg-stamp-good">Stamped</span> {success}
        </div>
      )}

      {/* Renewal & Status */}
      <Section title="Standing & renewal">
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
          <span className="flex items-center gap-2">
            Status <span className={expiryBadgeColor(expiresAt)}>{expiryStatusLabel(expiresAt)}</span>
          </span>
          {expiresAt > 0 && <span>Expires in {timeUntil(expiresAt)}</span>}
          <span>Lock {formatQuai(data.lockAmount)} QUAI</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleRenew} disabled={saving === 'renew'} className="reg-btn reg-btn-stamp text-sm">
            {saving === 'renew' ? 'Renewing…' : 'Renew (pay QUAI)'}
          </button>
          <button onClick={handleRenewFromLock} disabled={saving === 'renewLock'} className="reg-btn reg-btn-ghost text-sm">
            {saving === 'renewLock' ? 'Renewing…' : 'Renew from lock'}
          </button>
        </div>
      </Section>

      {/* Avatar */}
      <Section title="Avatar">
        <AvatarUpload currentAvatar={data.avatar} ownerAddress={ownerAddress} onUpload={handleAvatarUpload} />
      </Section>

      {/* Profile Info */}
      <Section title="Profile">
        <div className="space-y-3">
          <input type="text" placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} />
          <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          <input type="text" placeholder="URL" value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} />
        </div>
        <div className="mt-3">
          <SaveButton active={saving === 'profile'} label="Save profile" onClick={saveProfile} disabled={saving === 'profile'} />
        </div>
      </Section>

      {/* Socials */}
      <Section title="Profiles">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="text" placeholder="Twitter / X" value={twitter} onChange={(e) => setTwitter(e.target.value)} className={inputCls} />
          <input type="text" placeholder="GitHub" value={github} onChange={(e) => setGithub(e.target.value)} className={inputCls} />
          <input type="text" placeholder="Discord" value={discord} onChange={(e) => setDiscord(e.target.value)} className={inputCls} />
          <input type="text" placeholder="Telegram" value={telegram} onChange={(e) => setTelegram(e.target.value)} className={inputCls} />
        </div>
        <div className="mt-3">
          <SaveButton active={saving === 'socials'} label="Save profiles" onClick={saveSocials} disabled={saving === 'socials'} />
        </div>
      </Section>

      {/* Addresses */}
      <Section title="Records">
        <div className="space-y-4">
          <div>
            <label className="reg-label mb-1.5 block">Quai Address</label>
            <div className="flex gap-2">
              <input type="text" value={quaiAddress} onChange={(e) => setQuaiAddress(e.target.value)} className={monoCls} />
              <SaveButton active={saving === 'quaiAddress'} label="Save" onClick={saveQuaiAddress} disabled={saving === 'quaiAddress'} />
            </div>
          </div>
          <div>
            <label className="reg-label mb-1.5 block">Qi Payment Code (BIP47)</label>
            <div className="flex gap-2">
              <input type="text" value={qiPaymentCode} onChange={(e) => setQiPaymentCode(e.target.value)} placeholder="PM8T…" className={monoCls} />
              <SaveButton active={saving === 'qi'} label="Save" onClick={saveQiPaymentCode} disabled={saving === 'qi'} />
            </div>
          </div>
          <div>
            <label className="reg-label mb-1.5 block">Nostr Public Key (hex)</label>
            <div className="flex gap-2">
              <input type="text" value={nostrPubkey} onChange={(e) => setNostrPubkey(e.target.value)} placeholder="64-char hex pubkey…" maxLength={64} className={monoCls} />
              <SaveButton active={saving === 'nostr'} label="Save" onClick={saveNostrPubkey} disabled={saving === 'nostr'} />
            </div>
          </div>
        </div>
      </Section>

      {/* Danger Zone */}
      <section className="border border-bad bg-[var(--bad-wash)] p-5 sm:p-6">
        <h3 className="reg-label mb-3 !text-bad">Release entry</h3>
        <button onClick={handleRelease} disabled={saving === 'release'} className="reg-btn reg-btn-danger text-sm">
          {saving === 'release' ? 'Releasing…' : 'Release name'}
        </button>
        <p className="mt-2.5 text-xs text-muted">
          Releasing returns your lock deposit and frees the name for anyone to claim. This cannot be undone.
        </p>
      </section>
    </div>
  );
}
