/**
 * QNNS (Quai Network Name Service) SDK — v2
 *
 * ERC-721 name registry for Quai Network with:
 * - English auction registration (12hr, 1hr anti-snipe)
 * - Yearly renewable names with tiered pricing
 * - 30-day grace period after expiry
 * - Lock deposit (returned on release/expiry)
 * - Built-in marketplace (bid/offer)
 * - 1% deployer fee on auctions + renewals + transfers
 * - Admin-adjustable Qi/Quai exchange rate
 * - IPFS content hash resolution (EIP-1577)
 *
 * @example
 * ```typescript
 * import { QNNSClient, SDKConfig } from 'qns-payment-code';
 *
 * const config: SDKConfig = {
 *   qnnsAddress: '0x...',
 *   rpcUrl: 'https://orchard.rpc.quai.network/cyprus1',
 * };
 *
 * const qnns = new QNNSClient(config, signer);
 *
 * // Start auction
 * await qnns.startAuction({ name: 'alice', bidAmount: parseEther('1000') });
 *
 * // Lookup
 * const data = await qnns.getNameData('alice');
 * const profile = await qnns.getNameProfile('alice');
 * const full = await qnns.getFullNameData('alice');
 *
 * // Renew
 * const price = await qnns.getYearlyPriceQuai('alice');
 * await qnns.renew('alice', price);
 *
 * // Check expiry
 * const active = await qnns.isActive('alice');
 * const expiresAt = await qnns.getExpiresAt('alice');
 * ```
 */

export { QNNSClient } from './qnns';
export { QNSModuleClient } from './modules';

export {
  QNNSNameData,
  QNNSNameProfile,
  QNNSFullNameData,
  AuctionData,
  MarketplaceBidData,
  StartAuctionParams,
  FinalizeAuctionParams,
  ProfileParams,
  SocialsParams,
  TxResult,
  SDKConfig,
  QUAI_ORCHARD_CONFIG,
  QUAI_MAINNET_CONFIG,
} from './types';

export {
  QNS_ANCHOR_VERSION,
  QNS_ANCHOR_BYTES,
  QNS_MODULE_IDS,
  QNS_ANCHOR_REGISTRY_ABI,
  QNS_MODULE_ABI,
  QNS_STATIC_CONTENT_STORE_ABI,
  QNSAnchor,
  PermissionPolicyV1,
  ResourceBudgetV1,
  ModuleManifestV1,
  RedirectManifestV1,
  StaticFileRefV1,
  StaticSiteManifestV1,
  LoadedQNSModule,
  QNSModuleClientConfig,
  normalizeQNSName,
  hashQNSName,
  encodeQNSAnchor,
  decodeQNSAnchor,
  decodeModuleManifestV1,
  decodeRedirectManifestV1,
  decodeStaticSiteManifestV1,
  moduleTopologyLabel,
} from './modules';

export const VERSION = '2.0.0';
