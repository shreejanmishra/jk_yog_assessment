import crypto from 'node:crypto';

const CROCKFORD_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    const idx = (bytes[i] ?? 0) % CROCKFORD_ALPHABET.length;
    out += CROCKFORD_ALPHABET[idx];
  }
  return out;
}

export function generateBookingReference(): string {
  return `SU26-${randomCode(6)}`;
}

export function generatePassCode(): string {
  return `PASS-${randomCode(6)}`;
}

export function generateInvoiceNumber(): string {
  return `INV-2026-${randomCode(6)}`;
}

export function generateSimulatedMessageId(): string {
  return `sim_msg_${crypto.randomBytes(8).toString('hex')}`;
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateSixDigitOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function sha256Hex(value: string): string {
  const secret = process.env.SESSION_SECRET?.trim() || 'sharad-utsav-default-dev-secret';
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function hashRequestPayload(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
