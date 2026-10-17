import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Role, Permission } from './roles';

export interface TokenPayload {
  jti: string;
  appId: string;
  role: Role;
  permissions: Permission[];
  issuedAt: string;
  expiresAt?: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export class TokenService {
  constructor(private secret: string) {
    if (!secret || secret.length < 16) {
      throw new Error(
        'El secreto de HBG Authority debe tener al menos 16 caracteres. Nunca uses un valor por defecto ni lo subas a un repo público.'
      );
    }
  }

  issue(payload: Omit<TokenPayload, 'issuedAt' | 'jti'>): string {
    const full: TokenPayload = { ...payload, jti: randomUUID(), issuedAt: new Date().toISOString() };
    const body = base64url(JSON.stringify(full));
    return `${body}.${this.sign(body)}`;
  }

  verify(token: string): TokenPayload | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = this.sign(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as TokenPayload;
      if (payload.expiresAt && new Date(payload.expiresAt).getTime() < Date.now()) return null;
      return payload;
    } catch {
      return null;
    }
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
