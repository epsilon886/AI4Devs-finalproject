import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { IS_PUBLIC_KEY, Public } from '../decorators/public.decorator';
import { SessionAuthGuard } from './session-auth.guard';

describe('SessionAuthGuard', () => {
  it('marks a handler as public without changing any other guard policy', () => {
    class Controller {
      @Public()
      handler() {}
    }

    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, Controller.prototype.handler),
    ).toBe(true);
  });

  it('skips authentication only for routes marked public', async () => {
    const jwtService = { verifyAsync: jest.fn() } as unknown as JwtService;
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const guard = new SessionAuthGuard(reflector, jwtService);
    const request = { cookies: {} };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['without a session cookie', undefined],
    ['with an invalid token', 'invalid-token'],
  ])('rejects a private route %s', async (_description, session) => {
    const jwtService = {
      verifyAsync: jest.fn().mockRejectedValue(new Error('invalid token')),
    } as unknown as JwtService;
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new SessionAuthGuard(reflector, jwtService);
    const request = { cookies: { session } };

    await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
      expect.objectContaining({
        response: {
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      }),
    );
  });

  it('rejects an expired token', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockRejectedValue(new Error('jwt expired')),
    } as unknown as JwtService;
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new SessionAuthGuard(reflector, jwtService);

    await expect(
      guard.canActivate(contextFor({ cookies: { session: 'expired-token' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('makes only a valid sub available on the request', async () => {
    const jwtService = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: 'user-id', role: 'admin' }),
    } as unknown as JwtService;
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new SessionAuthGuard(reflector, jwtService);
    const request: { cookies: { session: string }; user?: unknown } = {
      cookies: { session: 'valid-token' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ sub: 'user-id' });
  });

  it('rejects a token without a valid sub', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: '' }),
    } as unknown as JwtService;
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new SessionAuthGuard(reflector, jwtService);

    await expect(
      guard.canActivate(contextFor({ cookies: { session: 'valid-token' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function contextFor(request: object): ExecutionContext {
  return {
    getHandler: () => ({}) as never,
    getClass: () => ({}) as never,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
