import { createHash, timingSafeEqual } from 'node:crypto';
import { TokenService, TokenPayload } from './tokens';
import { Role, Permission, CRITICAL_PERMISSIONS, ROLE_DEFAULT_PERMISSIONS } from './roles';

export type AuthorityErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN';

export class AuthorityError extends Error {
  constructor(
    public code: AuthorityErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AuthorityError';
  }
}

/** Duración por defecto de un token de dueño: corta a propósito (15 min). */
export const OWNER_TOKEN_DEFAULT_TTL_MS = 15 * 60 * 1000;

export interface IssueTokenRequest {
  appId: string;
  /** OWNER queda excluido por tipo: un token de dueño solo sale de issueOwnerToken(). */
  role: Exclude<Role, 'OWNER'>;
  /** Si se omite, se usan los permisos por defecto del rol. Nunca pueden incluir permisos críticos. */
  permissions?: Permission[];
  expiresAt?: string;
}

export interface IssueOwnerTokenRequest {
  appId: string;
  /** Si se omite, el token vence en 15 minutos. */
  expiresAt?: string;
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * HBG Authority. No existe ningún parámetro que permita a quien llama
 * AFIRMAR que es OWNER. El único camino a un token con permisos críticos
 * es issueOwnerToken(), que exige el secreto real del dueño.
 */
export class HBGAuthority {
  private tokens: TokenService;
  private ownerSecretHash: Buffer;
  private revoked = new Set<string>();

  constructor(ownerSecret: string) {
    this.tokens = new TokenService(ownerSecret);
    this.ownerSecretHash = sha256(ownerSecret);
  }

  issueOwnerToken(providedSecret: string, request: IssueOwnerTokenRequest): string {
    const providedHash = sha256(typeof providedSecret === 'string' ? providedSecret : '');
    if (!timingSafeEqual(providedHash, this.ownerSecretHash)) {
      throw new AuthorityError('UNAUTHORIZED', 'Clave de dueño incorrecta.');
    }
    const expiresAt = request.expiresAt ?? new Date(Date.now() + OWNER_TOKEN_DEFAULT_TTL_MS).toISOString();
    return this.tokens.issue({
      appId: request.appId,
      role: 'OWNER',
      permissions: ROLE_DEFAULT_PERMISSIONS.OWNER,
      expiresAt,
    });
  }

  issueToken(request: IssueTokenRequest): string {
    if ((request.role as Role) === 'OWNER') {
      throw new AuthorityError('FORBIDDEN', 'El rol OWNER solo se obtiene con issueOwnerToken() y la clave de dueño.');
    }
    const permissions = request.permissions ?? ROLE_DEFAULT_PERMISSIONS[request.role];
    const grantedCritical = permissions.filter((p) => CRITICAL_PERMISSIONS.includes(p));
    if (grantedCritical.length > 0) {
      throw new AuthorityError(
        'FORBIDDEN',
        `Los permisos críticos (${grantedCritical.join(', ')}) solo se otorgan con issueOwnerToken().`
      );
    }
    return this.tokens.issue({ appId: request.appId, role: request.role, permissions, expiresAt: request.expiresAt });
  }

  /** Invalida un token antes de que venza. Devuelve false si el token no es válido. */
  revoke(token: string): boolean {
    const payload = this.tokens.verify(token);
    if (!payload) return false;
    this.revoked.add(payload.jti);
    return true;
  }

  verify(token: string): TokenPayload | null {
    const payload = this.tokens.verify(token);
    if (!payload) return null;
    if (this.revoked.has(payload.jti)) return null;
    return payload;
  }

  authorize(token: string | undefined, permission: Permission): TokenPayload {
    if (!token) throw new AuthorityError('UNAUTHORIZED', 'Falta el token de autorización.');
    const payload = this.verify(token);
    if (!payload) throw new AuthorityError('UNAUTHORIZED', 'Token inválido, expirado o revocado.');
    if (!payload.permissions.includes(permission)) {
      throw new AuthorityError(
        'FORBIDDEN',
        `La app '${payload.appId}' (rol ${payload.role}) no tiene el permiso '${permission}'.`
      );
    }
    return payload;
  }

  hasPermission(token: string | undefined, permission: Permission): boolean {
    try {
      this.authorize(token, permission);
      return true;
    } catch {
      return false;
    }
  }
}
