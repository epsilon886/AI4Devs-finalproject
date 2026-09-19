import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { OriginCsrfGuard } from './origin-csrf.guard';

describe('OriginCsrfGuard', () => {
  const guard = new OriginCsrfGuard();

  it.each(['POST', 'PATCH', 'DELETE'])(
    '%s accepts an exact origin and CSRF header',
    (method) => {
      expect(
        guard.canActivate(
          contextFor({
            method,
            protocol: 'http',
            get: (header: string) =>
              header === 'host' ? 'recruitlane.test:5173' : undefined,
            headers: {
              origin: 'http://recruitlane.test:5173',
              'x-csrf-protection': '1',
            },
          }),
        ),
      ).toBe(true);
    },
  );

  it.each([
    ['missing origin', {}],
    ['malformed origin', { origin: 'not a URL' }],
    ['origin with a path', { origin: 'http://recruitlane.test:5173/path' }],
    ['different origin', { origin: 'http://other.test:5173' }],
    ['missing CSRF header', { origin: 'http://recruitlane.test:5173' }],
    [
      'incorrect CSRF header',
      { origin: 'http://recruitlane.test:5173', 'x-csrf-protection': '0' },
    ],
  ])('rejects a mutating request with %s', (_description, headers) => {
    expect(() =>
      guard.canActivate(
        contextFor({
          method: 'POST',
          protocol: 'http',
          get: (header: string) =>
            header === 'host' ? 'recruitlane.test:5173' : undefined,
          headers,
        }),
      ),
    ).toThrow(ForbiddenException);

    try {
      guard.canActivate(
        contextFor({
          method: 'POST',
          protocol: 'http',
          get: (header: string) =>
            header === 'host' ? 'recruitlane.test:5173' : undefined,
          headers,
        }),
      );
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toEqual({
        statusCode: 403,
        code: 'UNAUTHORIZED_REQUEST',
        message: 'Request could not be verified',
      });
    }
  });

  it('does not require CSRF for GET', () => {
    expect(
      guard.canActivate(
        contextFor({
          method: 'GET',
          protocol: 'http',
          get: () => undefined,
          headers: {},
        }),
      ),
    ).toBe(true);
  });
});

function contextFor(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
