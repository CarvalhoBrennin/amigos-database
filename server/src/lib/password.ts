import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
    password: string,
    salt: Buffer,
    keyLength: number,
    options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const algorithm = 'scrypt';
const keyLength = 64;
const parameters = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1_024 * 1_024 } as const;

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, keyLength, parameters);
    return [
        algorithm,
        parameters.N,
        parameters.r,
        parameters.p,
        salt.toString('base64url'),
        derived.toString('base64url'),
    ].join('$');
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
    const [storedAlgorithm, rawN, rawR, rawP, rawSalt, rawHash] = encoded.split('$');
    const N = Number(rawN);
    const r = Number(rawR);
    const p = Number(rawP);
    if (storedAlgorithm !== algorithm || !Number.isInteger(N) || !Number.isInteger(r)
        || !Number.isInteger(p) || !rawSalt || !rawHash) {
        return false;
    }
    try {
        const expected = Buffer.from(rawHash, 'base64url');
        if (expected.length !== keyLength) return false;
        const actual = await scrypt(password, Buffer.from(rawSalt, 'base64url'), expected.length, {
            N,
            r,
            p,
            maxmem: parameters.maxmem,
        });
        return timingSafeEqual(actual, expected);
    } catch {
        return false;
    }
}
