
import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

import { DomainError } from '../domain/errors.js';

const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24;
const TOKEN_ALGORITHM = 'HS256';

function getTokenSecret() {
  const secret = process.env.JWT_SECRET;

  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be set to a secret of at least 32 characters',
    );
  }

  return secret;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(input, secret) {
  return createHmac('sha256', secret)
    .update(input)
    .digest('base64url');
}

export function createToken(user) {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: TOKEN_ALGORITHM,
    typ: 'JWT',
  };

  const payload = {
    sub: user.id,
    role: user.role,
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS,
  };

  const unsignedToken = `${encode(header)}.${encode(payload)}`;

  const signature = sign(unsignedToken, getTokenSecret());

  return `${unsignedToken}.${signature}`;
}

export function verifyToken(token) {
  try {
    if (typeof token !== 'string') {
      throw new Error('Invalid token');
    }

    const parts = token.split('.');

    if (parts.length !== 3) {
      throw new Error('Invalid token');
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    const header = JSON.parse(
      Buffer.from(encodedHeader, 'base64url').toString('utf8'),
    );

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    );

    if (
      header.alg !== TOKEN_ALGORITHM ||
      header.typ !== 'JWT'
    ) {
      throw new Error('Unsupported token algorithm');
    }

    const expectedSignature = sign(
      `${encodedHeader}.${encodedPayload}`,
      getTokenSecret(),
    );

    const actualBuffer = Buffer.from(signature, 'base64url');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url');

    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new Error('Invalid signature');
    }

    const now = Math.floor(Date.now() / 1000);

    if (
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      !['attendee', 'organizer', 'staff'].includes(payload.role) ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= now
    ) {
      throw new Error('Invalid or expired token');
    }

    return {
      id: payload.sub,
      role: payload.role,
    };
  } catch {
    throw new DomainError(
      'UNAUTHENTICATED',
      'A valid authentication token is required',
    );
  }
}
