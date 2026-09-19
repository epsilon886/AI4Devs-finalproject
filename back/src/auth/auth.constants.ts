export const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: SESSION_TTL_MS,
    secure: process.env.NODE_ENV === 'production',
  };
}

export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET must be set');
  }

  return secret;
}
