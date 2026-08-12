import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function createOpaqueToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string, pepper: string): string {
    return createHmac('sha256', pepper).update(token, 'utf8').digest('hex');
}

export function deriveToken(context: string, secret: string): string {
    return createHmac('sha256', secret).update(context, 'utf8').digest('base64url');
}

export function constantTimeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
