import { HexString } from './opaqueTypes';

interface Encryption {
    encrypt: (data: Uint8Array, key: Uint8Array, random: Uint8Array) => Uint8Array;
    decrypt: (data: Uint8Array, key: Uint8Array) => Uint8Array;
}

export interface ProtocolCrypto extends Encryption {
    deriveSharedKey: (publicKey: HexString) => HexString;
    random: (length: number) => Promise<Uint8Array>;
    signDigest: (digest: number[]) => Promise<HexString>;
}
