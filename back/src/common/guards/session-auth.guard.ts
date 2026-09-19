import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface SessionPayload {
  sub?: unknown;
}

interface AuthenticatedRequest extends Request {
  user?: { sub: string };
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.session;

    if (typeof token !== 'string' || token.length === 0) {
      throw unauthorized();
    }

    try {
      const payload = await this.jwtService.verifyAsync<SessionPayload>(token);

      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw unauthorized();
      }

      request.user = { sub: payload.sub };
      return true;
    } catch {
      throw unauthorized();
    }
  }
}

function unauthorized(): UnauthorizedException {
  return new UnauthorizedException({
    statusCode: 401,
    code: 'UNAUTHORIZED',
    message: 'Authentication required',
  });
}
