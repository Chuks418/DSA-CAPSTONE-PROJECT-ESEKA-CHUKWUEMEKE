import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { createToken, verifyToken } from '../src/lib/token.js';

process.env.JWT_SECRET = 'EventHub-Development-Secret-2026-Replace-Before-Deployment';

describe('Password utilities', () => {
  it('hashes a password without storing the original password', async () => {
    const password = 'SecurePass123';
    const hashedPassword = await hashPassword(password);

    assert.notEqual(hashedPassword, password);
    assert.match(hashedPassword, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/i);
  });

  it('creates a different hash when the same password is hashed twice', async () => {
    const firstHash = await hashPassword('SecurePass123');
    const secondHash = await hashPassword('SecurePass123');

    assert.notEqual(firstHash, secondHash);
  });

  it('verifies the correct password', async () => {
    const hashedPassword = await hashPassword('SecurePass123');

    assert.equal(await verifyPassword('SecurePass123', hashedPassword), true);
  });

  it('rejects an incorrect password', async () => {
    const hashedPassword = await hashPassword('SecurePass123');

    assert.equal(await verifyPassword('WrongPassword123', hashedPassword), false);
  });

  it('rejects malformed password hashes', async () => {
    assert.equal(await verifyPassword('SecurePass123', 'invalid-hash'), false);
  });

  it('rejects passwords shorter than eight characters', async () => {
    await assert.rejects(
      () => hashPassword('short'),
      /at least 8 characters/
    );
  });
});

describe('Token utilities', () => {
  const user = {
    id: 'user-123',
    role: 'attendee',
  };

  it('creates and verifies a signed token', () => {
    const token = createToken(user);
    const decodedUser = verifyToken(token);

    assert.equal(decodedUser.id, user.id);
    assert.equal(decodedUser.role, user.role);
  });

  it('rejects a missing token', () => {
    assert.throws(
      () => verifyToken(undefined),
      /valid authentication token/i
    );
  });

  it('rejects an edited token', () => {
    const token = createToken(user);
    const parts = token.split('.');

    parts[1] = Buffer.from(
      JSON.stringify({
        sub: 'another-user',
        role: 'attendee',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString('base64url');

    assert.throws(
      () => verifyToken(parts.join('.')),
      /valid authentication token/i
    );
  });

  it('rejects a token with an unsupported algorithm', () => {
    const token = createToken(user);
    const parts = token.split('.');

    parts[0] = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' })
    ).toString('base64url');

    assert.throws(
      () => verifyToken(parts.join('.')),
      /valid authentication token/i
    );
  });

  it('rejects an expired token', () => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' })
    ).toString('base64url');

    const now = Math.floor(Date.now() / 1000);

    const payload = Buffer.from(
      JSON.stringify({
        sub: user.id,
        role: user.role,
        iat: now - 7200,
        exp: now - 3600,
      })
    ).toString('base64url');

    const unsignedToken = `${header}.${payload}`;

    const signature = createHmac(
      'sha256',
      process.env.JWT_SECRET
    )
      .update(unsignedToken)
      .digest('base64url');

    const expiredToken = `${unsignedToken}.${signature}`;

    assert.throws(
      () => verifyToken(expiredToken),
      /valid authentication token/i
    );
  });
});