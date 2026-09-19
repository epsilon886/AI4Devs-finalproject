import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthRateLimitService } from './auth-rate-limit.service';

@Injectable()
export class RegisterRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimitService: AuthRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    this.rateLimitService.recordRegistration(request.ip!);
    return true;
  }
}
