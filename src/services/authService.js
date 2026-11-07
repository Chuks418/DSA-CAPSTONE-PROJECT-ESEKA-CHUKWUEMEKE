import { newId } from '../domain/ids.js';
import { DomainError } from '../domain/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { createToken } from '../lib/token.js';

const VALID_ROLES = ['attendee', 'organizer', 'staff'];

function normalizeEmail(email) {
  if (typeof email !== 'string') {
    throw new DomainError('VALIDATION', 'A valid email address is required');
  }

  const normalized = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new DomainError('VALIDATION', 'A valid email address is required');
  }

  return normalized;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export function createAuthService(repository) {
  if (!repository) {
    throw new TypeError('An auth repository is required');
  }

  return {
    async signup(input = {}) {
      const email = normalizeEmail(input.email);

      if (
        typeof input.password !== 'string' ||
        input.password.length < 8
      ) {
        throw new DomainError(
          'VALIDATION',
          'Password must contain at least 8 characters'
        );
      }

      const role = input.role ?? 'attendee';

      if (!VALID_ROLES.includes(role)) {
        throw new DomainError('VALIDATION', 'Invalid account role');
      }

      const existingUser = await repository.findUserByEmail(email);

      if (existingUser) {
        throw new DomainError(
          'EMAIL_TAKEN',
          'An account with this email address already exists'
        );
      }

      const passwordHash = await hashPassword(input.password);

      const user = {
        id: newId(),
        email,
        passwordHash,
        role,
        createdAt: new Date().toISOString(),
      };

      await repository.createUser(user);

      const safeUser = publicUser(user);

      return {
        user: safeUser,
        token: createToken(safeUser),
      };
    },

    async login(input = {}) {
      const email = normalizeEmail(input.email);

      if (typeof input.password !== 'string') {
        throw new DomainError(
          'INVALID_CREDENTIALS',
          'Email or password is incorrect'
        );
      }

      const user = await repository.findUserByEmail(email);

      const passwordIsValid = user?.passwordHash
        ? await verifyPassword(input.password, user.passwordHash)
        : false;

      if (!user || !passwordIsValid) {
        throw new DomainError(
          'INVALID_CREDENTIALS',
          'Email or password is incorrect'
        );
      }

      const safeUser = publicUser(user);

      return {
        user: safeUser,
        token: createToken(safeUser),
      };
    },

    async getMe(userId) {
      const user = await repository.findUserById(userId);

      if (!user) {
        throw new DomainError(
          'UNAUTHENTICATED',
          'The authenticated account could not be found'
        );
      }

      return publicUser(user);
    },
  };
}