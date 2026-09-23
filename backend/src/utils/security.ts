import { timingSafeEqual } from 'crypto';

export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'secret' || secret === 'replace_with_secure_secret') throw new Error('Configure JWT_SECRET com um segredo seguro.');
  return secret;
}

export function matchesWebhookToken(received: string | undefined): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected || !received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
