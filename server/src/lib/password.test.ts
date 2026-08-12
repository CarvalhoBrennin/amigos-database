import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('administrator password hashing', () => {
    it('round-trips the right password and rejects another value', async () => {
        const encoded = await hashPassword('uma-senha-forte-para-o-teste');

        await expect(verifyPassword('uma-senha-forte-para-o-teste', encoded)).resolves.toBe(true);
        await expect(verifyPassword('senha-incorreta', encoded)).resolves.toBe(false);
        expect(encoded).not.toContain('uma-senha-forte-para-o-teste');
    });

    it('rejects malformed and attacker-controlled encodings without throwing', async () => {
        await expect(verifyPassword('senha', 'invalid')).resolves.toBe(false);
        await expect(verifyPassword('senha', 'scrypt$999999999$8$1$c2FsdA$aGFzaA')).resolves.toBe(false);
    });
});
