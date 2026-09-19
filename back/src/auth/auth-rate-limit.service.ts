import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

@Injectable()
export class AuthRateLimitService {
  private readonly registrationAttempts = new Map<string, number[]>();
  private readonly loginFailures = new Map<string, number[]>();

  recordRegistration(ip: string, now = Date.now()): void {
    const attempts = this.prune(
      this.registrationAttempts,
      ip,
      REGISTER_WINDOW_MS,
      now,
    );

    if (attempts.length >= MAX_ATTEMPTS) {
      throw rateLimitExceeded();
    }

    attempts.push(now);
    this.registrationAttempts.set(ip, attempts);
  }

  recordLoginFailure(
    ip: string,
    normalizedEmail: string,
    now = Date.now(),
  ): void {
    const key = loginKey(ip, normalizedEmail);
    const failures = this.prune(this.loginFailures, key, LOGIN_WINDOW_MS, now);
    failures.push(now);
    this.loginFailures.set(key, failures);

    if (failures.length > MAX_ATTEMPTS) {
      throw rateLimitExceeded();
    }
  }

  clearLoginFailures(ip: string, normalizedEmail: string): void {
    this.loginFailures.delete(loginKey(ip, normalizedEmail));
  }

  private prune(
    attemptsByKey: Map<string, number[]>,
    key: string,
    windowMs: number,
    now: number,
  ): number[] {
    const attempts = (attemptsByKey.get(key) ?? []).filter(
      (attempt) => attempt > now - windowMs,
    );

    if (attempts.length === 0) {
      attemptsByKey.delete(key);
    } else {
      attemptsByKey.set(key, attempts);
    }

    return attempts;
  }
}

function loginKey(ip: string, normalizedEmail: string): string {
  return `${ip}\u0000${normalizedEmail}`;
}

function rateLimitExceeded(): HttpException {
  return new HttpException(
    {
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
