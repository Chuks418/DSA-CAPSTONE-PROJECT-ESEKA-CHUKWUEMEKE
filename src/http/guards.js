import { DomainError } from '../domain/errors.js';
import { verifyToken } from '../lib/token.js';

export async function requireUser(request, repository) {
  const authorization = request.headers.authorization;

  if (typeof authorization !== 'string') {
    throw new DomainError(
      'UNAUTHENTICATED',
      'A valid authentication token is required'
    );
  }

  const match = authorization.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    throw new DomainError(
      'UNAUTHENTICATED',
      'A valid authentication token is required'
    );
  }

  const tokenUser = verifyToken(match[1]);
  const user = await repository.findUserById(tokenUser.id);

  if (!user) {
    throw new DomainError(
      'UNAUTHENTICATED',
      'The authenticated account could not be found'
    );
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

export function requireRole(user, ...allowedRoles) {
  if (!user || !allowedRoles.includes(user.role)) {
    throw new DomainError(
      'FORBIDDEN',
      'You do not have permission to perform this action'
    );
  }

  return user;
}