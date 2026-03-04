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
  onUpdate: () => void;
}

export function ProfileForm({ nameHash, data, signer, onUpdate }: ProfileFormProps) {
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

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-800 text-green-400 rounded-lg px-4 py-3 text-sm">
          {success}
        </div>
      )}

      {/* Renewal & Status */}
      <div className="bg-neutral-900 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3">Status & Renewal</h3>
        <div className="flex flex-wrap gap-4 text-sm mb-4">
          <span className="text-neutral-400">
            Status: <span className={expiryBadgeColor(expiresAt) + ' px-2 py-0.5 rounded text-xs ml-1'}>{expiryStatusLabel(expiresAt)}</span>
          </span>
          {expiresAt > 0 && (
            <span className="text-neutral-400">
              Expires: {timeUntil(expiresAt)}
            </span>
          )}
          <span className="text-neutral-400">
            Lock: {formatQuai(data.lockAmount)} QUAI
          </span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRenew}
            disabled={saving === 'renew'}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {saving === 'renew' ? 'Renewing...' : 'Renew (Pay QUAI)'}
          </button>
          <button
            onClick={handleRenewFromLock}
            disabled={saving === 'renewLock'}
            className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {saving === 'renewLock' ? 'Renewing...' : 'Renew from Lock'}
          </button>
        </div>
      </div>

      {/* Avatar */}
      <div className="bg-neutral-900 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3">Avatar</h3>
        <AvatarUpload currentAvatar={data.avatar} onUpload={handleAvatarUpload} />
      </div>

      {/* Profile Info */}
      <div className="bg-neutral-900 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3">Profile</h3>
        <div className="space-y-3">
          <input type="text" placeholder="Display Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 text-sm" />
          <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 text-sm resize-none" />
          <input type="text" placeholder="URL" value={url} onChange={(e) => setUrl(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 text-sm" />
        </div>
        <button onClick={saveProfile} disabled={saving === 'profile'} className="mt-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          {saving === 'profile' ? 'Saving...' : 'Save Profile'}
        </button>
      </div>

      {/* Socials */}
      <div className="bg-neutral-900 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3">Socials</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input type="text" placeholder="Twitter / X" value={twitter} onChange={(e) => setTwitter(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 text-sm" />
          <input type="text" placeholder="GitHub" value={github} onChange={(e) => setGithub(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 text-sm" />
          <input type="text" placeholder="Discord" value={discord} onChange={(e) => setDiscord(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 text-sm" />
          <input type="text" placeholder="Telegram" value={telegram} onChange={(e) => setTelegram(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 text-sm" />
        </div>
        <button onClick={saveSocials} disabled={saving === 'socials'} className="mt-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          {saving === 'socials' ? 'Saving...' : 'Save Socials'}
        </button>
      </div>

      {/* Addresses */}
      <div className="bg-neutral-900 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3">Addresses</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Quai Address</label>
            <div className="flex gap-2">
              <input type="text" value={quaiAddress} onChange={(e) => setQuaiAddress(e.target.value)} className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500" />
              <button onClick={saveQuaiAddress} disabled={saving === 'quaiAddress'} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg transition-colors">
                {saving === 'quaiAddress' ? '...' : 'Save'}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Qi Payment Code (BIP47)</label>
            <div className="flex gap-2">
              <input type="text" value={qiPaymentCode} onChange={(e) => setQiPaymentCode(e.target.value)} placeholder="PM8T..." className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500" />
              <button onClick={saveQiPaymentCode} disabled={saving === 'qi'} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg transition-colors">
                {saving === 'qi' ? '...' : 'Save'}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Nostr Public Key (hex)</label>
            <div className="flex gap-2">
              <input type="text" value={nostrPubkey} onChange={(e) => setNostrPubkey(e.target.value)} placeholder="64-char hex pubkey..." maxLength={64} className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-purple-500" />
              <button onClick={saveNostrPubkey} disabled={saving === 'nostr'} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg transition-colors">
                {saving === 'nostr' ? '...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-neutral-900 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-3">Danger Zone</h3>
        <button
          onClick={handleRelease}
          disabled={saving === 'release'}
          className="bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {saving === 'release' ? 'Releasing...' : 'Release Name'}
        </button>
        <p className="text-xs text-neutral-500 mt-2">This will release the name and return your lock deposit. This action cannot be undone.</p>
      </div>
    </div>
  );
}
