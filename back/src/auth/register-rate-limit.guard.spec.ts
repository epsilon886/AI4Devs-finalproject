import type { ExecutionContext } from '@nestjs/common';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { RegisterRateLimitGuard } from './register-rate-limit.guard';

describe('RegisterRateLimitGuard', () => {
  it('uses request.ip and counts before DTO or content-type validation', () => {
    const limiter = {
      recordRegistration: jest.fn(),
    } as unknown as AuthRateLimitService;
    const guard = new RegisterRateLimitGuard(limiter);

    expect(guard.canActivate(contextFor({ ip: '127.0.0.1' }))).toBe(true);
    expect(limiter.recordRegistration).toHaveBeenCalledWith('127.0.0.1');
  });
});

function contextFor(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
