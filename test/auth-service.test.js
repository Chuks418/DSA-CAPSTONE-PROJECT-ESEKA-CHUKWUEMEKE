import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAuthService } from '../src/services/authService.js';

process.env.JWT_SECRET =
  'EventHub-Development-Secret-2026-Replace-Before-Deployment';

function createTestRepository() {
  const users = new Map();

  return {
    async findUserByEmail(email) {
      return [...users.values()].find(
        (user) => user.email.toLowerCase() === email.toLowerCase()
      ) ?? null;
    },

    async findUserById(id) {
      return users.get(id) ?? null;
    },

    async createUser(user) {
      users.set(user.id, { ...user });
      return user;
    },
  };
}

describe('Authentication service', () => {
  it('registers an attendee by default and returns a token', async () => {
    const repository = createTestRepository();
    const authService = createAuthService(repository);

    const result = await authService.signup({
      email: 'attendee@example.com',
      password: 'SecurePass123',
    });

    assert.equal(result.user.email, 'attendee@example.com');
    assert.equal(result.user.role, 'attendee');
    assert.equal(typeof result.token, 'string');
    assert.ok(result.token.length > 0);
    assert.equal('passwordHash' in result.user, false);
  });

  it('normalizes email addresses', async () => {
    const repository = createTestRepository();
    const authService = createAuthService(repository);

    const result = await authService.signup({
      email: '  ORGANIZER@EXAMPLE.COM ',
      password: 'SecurePass123',
      role: 'organizer',
    });

    assert.equal(result.user.email, 'organizer@example.com');
    assert.equal(result.user.role, 'organizer');
  });

  it('stores a password hash rather than the original password', async () => {
    const repository = createTestRepository();
    const authService = createAuthService(repository);

    const result = await authService.signup({
      email: 'private@example.com',
      password: 'SecurePass123',
    });

    const storedUser = await repository.findUserById(result.user.id);

    assert.notEqual(storedUser.passwordHash, 'SecurePass123');
    assert.match(storedUser.passwordHash, /^scrypt\$/);
    assert.equal('passwordHash' in result.user, false);
  });

  it('rejects duplicate email addresses regardless of case', async () => {
    const repository = createTestRepository();
    const authService = createAuthService(repository);

    await authService.signup({
      email: 'user@example.com',
      password: 'SecurePass123',
    });

    await assert.rejects(
      () => authService.signup({
        email: 'USER@example.com',
        password: 'AnotherPass123',
      }),
      (error) => error.code === 'EMAIL_TAKEN'
    );
  });

  it('rejects invalid email addresses', async () => {
    const authService = createAuthService(createTestRepository());

    await assert.rejects(
      () => authService.signup({
        email: 'not-an-email',
        password: 'SecurePass123',
      }),
      (error) => error.code === 'VALIDATION'
    );
  });

  it('rejects passwords shorter than eight characters', async () => {
    const authService = createAuthService(createTestRepository());

    await assert.rejects(
      () => authService.signup({
        email: 'user@example.com',
        password: 'short',
      }),
      (error) => error.code === 'VALIDATION'
    );
  });

  it('rejects unsupported account roles', async () => {
    const authService = createAuthService(createTestRepository());

    await assert.rejects(
      () => authService.signup({
        email: 'user@example.com',
        password: 'SecurePass123',
        role: 'superadmin',
      }),
      (error) => error.code === 'VALIDATION'
    );
  });

  it('logs in with the correct credentials', async () => {
    const authService = createAuthService(createTestRepository());

    await authService.signup({
      email: 'user@example.com',
      password: 'SecurePass123',
    });

    const result = await authService.login({
      email: 'USER@example.com',
      password: 'SecurePass123',
    });

    assert.equal(result.user.email, 'user@example.com');
    assert.equal(typeof result.token, 'string');
    assert.equal('passwordHash' in result.user, false);
  });

  it('uses the same error for an unknown email and a wrong password', async () => {
    const authService = createAuthService(createTestRepository());

    await authService.signup({
      email: 'known@example.com',
      password: 'SecurePass123',
    });

    let wrongPasswordError;
    let unknownEmailError;

    try {
      await authService.login({
        email: 'known@example.com',
        password: 'WrongPass123',
      });
    } catch (error) {
      wrongPasswordError = error;
    }

    try {
      await authService.login({
        email: 'unknown@example.com',
        password: 'WrongPass123',
      });
    } catch (error) {
      unknownEmailError = error;
    }

    assert.equal(wrongPasswordError.code, 'INVALID_CREDENTIALS');
    assert.equal(unknownEmailError.code, 'INVALID_CREDENTIALS');
    assert.equal(wrongPasswordError.message, unknownEmailError.message);
  });

  it('returns the current user without exposing the password hash', async () => {
    const authService = createAuthService(createTestRepository());

    const signup = await authService.signup({
      email: 'me@example.com',
      password: 'SecurePass123',
    });

    const user = await authService.getMe(signup.user.id);

    assert.equal(user.id, signup.user.id);
    assert.equal(user.email, 'me@example.com');
    assert.equal('passwordHash' in user, false);
  });

  it('rejects a missing account when retrieving the current user', async () => {
    const authService = createAuthService(createTestRepository());

    await assert.rejects(
      () => authService.getMe('missing-user'),
      (error) => error.code === 'UNAUTHENTICATED'
    );
  });
});