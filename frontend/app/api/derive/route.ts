import { NextRequest, NextResponse } from 'next/server';
import {
  Mnemonic,
  HDNodeWallet,
  getBytes,
  hexlify,
  keccak256,
} from 'quais';
import { secp256k1 } from '@noble/curves/secp256k1';
import bs58check from 'bs58check';

// BIP47 payment code path for Quai (coin type 994)
const PAYMENT_CODE_PATH = "m/47'/994'/0'";

function parsePaymentCode(paymentCode: string): { pubkey: Uint8Array; chainCode: Uint8Array } {
  const decoded = bs58check.decode(paymentCode);
  // Format: version(1) + features(1) + pubkey(33) + chaincode(32) + reserved(13)
  const pubkey = decoded.slice(2, 35);
  const chainCode = decoded.slice(35, 67);
  return { pubkey: new Uint8Array(pubkey), chainCode: new Uint8Array(chainCode) };
}

function getNotificationPrivateKey(mnemonicPhrase: string): Uint8Array {
  const mnemonic = Mnemonic.fromPhrase(mnemonicPhrase);
  const hdWallet = HDNodeWallet.fromMnemonic(mnemonic, PAYMENT_CODE_PATH);
  if (!hdWallet.privateKey) throw new Error('Could not derive private key');
  return getBytes(hdWallet.privateKey);
}

function deriveAddressFromPaymentCodes(
  senderMnemonic: string,
  receiverPaymentCode: string,
  index: number
): { address: string; derivedPubkey: string } {
  const senderPrivateKey = getNotificationPrivateKey(senderMnemonic);
  const { pubkey: receiverPubkey } = parsePaymentCode(receiverPaymentCode);

  // ECDH: shared_secret = sender_privkey * receiver_pubkey
  const sharedPoint = secp256k1.getSharedSecret(senderPrivateKey, receiverPubkey);
  const sharedSecret = sharedPoint.slice(1, 33); // x-coordinate

  // tweak = keccak256(shared_secret || index)
  const indexBuffer = new Uint8Array(4);
  new DataView(indexBuffer.buffer).setUint32(0, index, false);
  const combined = new Uint8Array(sharedSecret.length + 4);
  combined.set(sharedSecret);
  combined.set(indexBuffer, sharedSecret.length);
  const tweak = getBytes(keccak256(combined));

  // derived_pubkey = receiver_pubkey + tweak * G
  const receiverPoint = secp256k1.ProjectivePoint.fromHex(receiverPubkey);
  const tweakScalar = BigInt(hexlify(tweak));
  const tweakPoint = secp256k1.ProjectivePoint.BASE.multiply(tweakScalar);
  const derivedPoint = receiverPoint.add(tweakPoint);

  // Address = last 20 bytes of keccak256(uncompressed_pubkey_without_prefix)
  const derivedPubkeyUncompressed = derivedPoint.toRawBytes(false);
  const pubkeyForHash = derivedPubkeyUncompressed.slice(1);
  const addressHash = keccak256(pubkeyForHash);
  const address = '0x' + addressHash.slice(-40);

  return {
    address,
    derivedPubkey: hexlify(derivedPoint.toRawBytes(true)),
  };
}

export async function POST(request: NextRequest) {
  try {
    const { senderMnemonic, receiverPaymentCode, index } = await request.json();

    if (!senderMnemonic || !receiverPaymentCode) {
      return NextResponse.json(
        { error: 'senderMnemonic and receiverPaymentCode required' },
        { status: 400 }
      );
    }

    const result = deriveAddressFromPaymentCodes(
      senderMnemonic,
      receiverPaymentCode,
      index ?? 0
    );

    return NextResponse.json({
      derivedAddress: result.address,
      derivedPubkey: result.derivedPubkey,
      index: index ?? 0,
    });
  } catch (e: any) {
    console.error('Derive error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
