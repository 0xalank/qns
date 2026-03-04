import { NextRequest, NextResponse } from 'next/server';
import { Contract, JsonRpcProvider, keccak256, solidityPacked, ZeroAddress } from 'quais';
import { QNNS_ABI, QNNS_CONTRACT_ADDRESS, RPC_URL } from '@/lib/constants';

/**
 * NIP-05 identity verification endpoint
 * GET /.well-known/nostr.json?name=<username>
 *
 * Returns: { "names": { "<username>": "<hex-pubkey>" } }
 * Nostr clients use this to verify identity: username@yourdomain.com
 */
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name');

  if (!name) {
    return NextResponse.json({ names: {} }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const provider = new JsonRpcProvider(RPC_URL, undefined, { usePathing: false });
    const contract = new Contract(QNNS_CONTRACT_ADDRESS, QNNS_ABI, provider);

    const nameHash = keccak256(solidityPacked(['string'], [name.toLowerCase()]));
    const profile = await contract.getProfile(nameHash);

    if (profile.owner === ZeroAddress || !profile.nostrPubkey) {
      return NextResponse.json({ names: {} }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    return NextResponse.json({
      names: {
        [name.toLowerCase()]: profile.nostrPubkey,
      },
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch {
    return NextResponse.json({ names: {} }, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
}
