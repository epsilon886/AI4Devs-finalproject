import { HttpException } from '@nestjs/common';
import { AuthRateLimitService } from './auth-rate-limit.service';

describe('AuthRateLimitService', () => {
  const hour = 60 * 60 * 1000;
  const tenMinutes = 10 * 60 * 1000;

  it('allows three registrations, rejects the fourth, and uses a sliding one-hour window', () => {
    const service = new AuthRateLimitService();

    service.recordRegistration('127.0.0.1', 0);
    service.recordRegistration('127.0.0.1', 1);
    service.recordRegistration('127.0.0.1', 2);
    expect(() => service.recordRegistration('127.0.0.1', 3)).toThrow(
      HttpException,
    );

    expect(() =>
      service.recordRegistration('127.0.0.1', hour + 1),
    ).not.toThrow();
  });

  it('does not reset successful registrations and keeps IP counters independent', () => {
    const service = new AuthRateLimitService();

    service.recordRegistration('127.0.0.1', 0);
    service.recordRegistration('127.0.0.1', 1);
    service.recordRegistration('127.0.0.1', 2);
    service.recordRegistration('127.0.0.2', 3);

    expect(() => service.recordRegistration('127.0.0.1', 4)).toThrow(
      HttpException,
    );
    expect(() => service.recordRegistration('127.0.0.2', 4)).not.toThrow();
  });

  it('reports only the approved envelope when a registration limit is exceeded', () => {
    const service = new AuthRateLimitService();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      service.recordRegistration('127.0.0.1', attempt);
    }

    try {
      service.recordRegistration('127.0.0.1', 3);
    } catch (error) {
      expect((error as HttpException).getResponse()).toEqual({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      });
    }
  });

  it('allows three login failures, rejects the fourth, and keys normalized email separately', () => {
    const service = new AuthRateLimitService();

    service.recordLoginFailure('127.0.0.1', 'ada@example.com', 0);
    service.recordLoginFailure('127.0.0.1', 'ada@example.com', 1);
    service.recordLoginFailure('127.0.0.1', 'ada@example.com', 2);

    expect(() =>
      service.recordLoginFailure('127.0.0.1', 'ada@example.com', 3),
    ).toThrow(HttpException);
    expect(() =>
      service.recordLoginFailure('127.0.0.1', 'grace@example.com', 3),
    ).not.toThrow();
    expect(() =>
      service.recordLoginFailure('127.0.0.2', 'ada@example.com', 3),
    ).not.toThrow();
  });

  it('resets successful login failures and prunes failures outside the sliding window', () => {
    const service = new AuthRateLimitService();

    service.recordLoginFailure('127.0.0.1', 'ada@example.com', 0);
    service.recordLoginFailure('127.0.0.1', 'ada@example.com', 1);
    service.clearLoginFailures('127.0.0.1', 'ada@example.com');
    expect(() =>
      service.recordLoginFailure('127.0.0.1', 'ada@example.com', 2),
    ).not.toThrow();

    service.recordLoginFailure('127.0.0.1', 'grace@example.com', 0);
    service.recordLoginFailure('127.0.0.1', 'grace@example.com', 1);
    service.recordLoginFailure('127.0.0.1', 'grace@example.com', 2);
    expect(() =>
      service.recordLoginFailure(
        '127.0.0.1',
        'grace@example.com',
        tenMinutes + 1,
      ),
    ).not.toThrow();
  });
});
