import { ec } from 'elliptic';
import { keccak256 } from 'js-sha3';

import { PrivateIdentity, PublicIdentity } from './models/Identity';
import { HexString } from './opaqueTypes';
import { stripHexPrefix, byteArrayToHex } from './conversion';

export const deriveSharedKey = (privateIdentity: PrivateIdentity, publicIdentity: PublicIdentity): HexString => {
    const curve = new ec('secp256k1');
    const publicKeyPair = curve.keyFromPublic(stripHexPrefix(publicIdentity.publicKey as HexString), 'hex');
    const privateKeyPair = curve.keyFromPrivate(stripHexPrefix(privateIdentity.privateKey as HexString), 'hex');

    return privateKeyPair.derive(publicKeyPair.getPublic()).toString(16) as HexString;
};

function publicKeyToAddress(pubKey: any) {
    const pubBytes = pubKey.encode();
    return keccak256.array(pubBytes.slice(1)).slice(12);
}

export const generateSecureIdentity = async (generateRandom: (length: number) => Promise<Uint8Array>): Promise<PrivateIdentity> => {
    const secureRandomUint8Array = await generateRandom(32);
    const secureRandom = byteArrayToHex(secureRandomUint8Array).substring(2);
    const curve = new ec('secp256k1');
    const keyPair = curve.genKeyPair({
        entropy: secureRandom,
        entropyEnc: 'hex',
        pers: undefined,
    });
    const privateKey = '0x' + keyPair.getPrivate('hex');
    const publicKey = '0x' + keyPair.getPublic(true, 'hex');
    const address = byteArrayToHex(publicKeyToAddress(keyPair.getPublic()));
    return {
        privateKey,
        publicKey,
        address,
    };
};
