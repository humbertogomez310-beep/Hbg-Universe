import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HBGAuthority, AuthorityError, CRITICAL_PERMISSIONS, ROLE_DEFAULT_PERMISSIONS } from '../src/index';

const SECRET = 'clave-de-prueba-larga-0123456789';
const mk = () => new HBGAuthority(SECRET);
const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof AuthorityError ? e.code : 'OTHER'; }
  return 'NO_ERROR';
};

test('sin token -> UNAUTHORIZED (default-deny)', () => {
  assert.equal(code(() => mk().authorize(undefined, 'apps:register')), 'UNAUTHORIZED');
});
test('token basura -> UNAUTHORIZED', () => {
  assert.equal(code(() => mk().authorize('basura.basura', 'apps:register')), 'UNAUTHORIZED');
});
test('clave de dueño incorrecta -> UNAUTHORIZED, no emite token', () => {
  assert.equal(code(() => mk().issueOwnerToken('clave-equivocada-0000000000', { appId: 'x' })), 'UNAUTHORIZED');
});
test('clave de dueño correcta -> token OWNER con permiso crítico', () => {
  const a = mk();
  const t = a.issueOwnerToken(SECRET, { appId: 'terminador-ui' });
  const p = a.authorize(t, 'universe.code.modify');
  assert.equal(p.role, 'OWNER');
});
test('el token de dueño vence por defecto (<= 15 min)', () => {
  const a = mk();
  const p = a.verify(a.issueOwnerToken(SECRET, { appId: 'x' }))!;
  const ms = new Date(p.expiresAt!).getTime() - Date.now();
  assert.ok(ms > 0 && ms <= 15 * 60 * 1000 + 1000);
});
test('token vencido -> UNAUTHORIZED', () => {
  const a = mk();
  const t = a.issueOwnerToken(SECRET, { appId: 'x', expiresAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal(code(() => a.authorize(t, 'apps:register')), 'UNAUTHORIZED');
});
test('issueToken(SYSTEM) NO puede incluir permisos críticos aunque los pida', () => {
  for (const crit of CRITICAL_PERMISSIONS) {
    assert.equal(code(() => mk().issueToken({ appId: 'a', role: 'SYSTEM', permissions: [crit] })), 'FORBIDDEN');
  }
});
test('issueToken con role OWNER forzado (saltando tipos) -> FORBIDDEN', () => {
  assert.equal(code(() => mk().issueToken({ appId: 'a', role: 'OWNER' as never })), 'FORBIDDEN');
});
test('SYSTEM por defecto no tiene permisos críticos', () => {
  const a = mk();
  const t = a.issueToken({ appId: 'vibra', role: 'SYSTEM' });
  assert.equal(code(() => a.authorize(t, 'terminador:command:destructive')), 'FORBIDDEN');
  assert.equal(a.authorize(t, 'terminador:command:safe').appId, 'vibra');
});
test('revocación: el token deja de servir', () => {
  const a = mk();
  const t = a.issueOwnerToken(SECRET, { appId: 'x' });
  assert.equal(a.hasPermission(t, 'universe.code.modify'), true);
  assert.equal(a.revoke(t), true);
  assert.equal(code(() => a.authorize(t, 'universe.code.modify')), 'UNAUTHORIZED');
});
test('revocar un token basura devuelve false', () => {
  assert.equal(mk().revoke('x.y'), false);
});
test('manipular el payload invalida la firma', () => {
  const a = mk();
  const t = a.issueToken({ appId: 'a', role: 'USER' });
  const [body, sig] = t.split('.');
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  p.permissions = ['universe.code.modify'];
  const forged = `${Buffer.from(JSON.stringify(p)).toString('base64url')}.${sig}`;
  assert.equal(code(() => a.authorize(forged, 'universe.code.modify')), 'UNAUTHORIZED');
});
test('token firmado con OTRO secreto no sirve', () => {
  const t = new HBGAuthority('otro-secreto-largo-0123456789').issueOwnerToken('otro-secreto-largo-0123456789', { appId: 'x' });
  assert.equal(code(() => mk().authorize(t, 'apps:register')), 'UNAUTHORIZED');
});
test('contrato de permisos críticos no cambió', () => {
  assert.deepEqual([...CRITICAL_PERMISSIONS].sort(), ['terminador:command:destructive', 'universe.code.modify']);
  assert.ok(!ROLE_DEFAULT_PERMISSIONS.SYSTEM.some((p) => CRITICAL_PERMISSIONS.includes(p)));
});
