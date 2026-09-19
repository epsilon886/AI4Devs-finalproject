import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

@Injectable()
export class OriginCsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!MUTATING_METHODS.has(request.method)) {
      return true;
    }

    const origin = request.headers.origin;
    const csrfProtection = request.headers['x-csrf-protection'];

    if (
      typeof origin !== 'string' ||
      csrfProtection !== '1' ||
      !isExactRequestOrigin(origin, request)
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'UNAUTHORIZED_REQUEST',
        message: 'Request could not be verified',
      });
    }

    return true;
  }
}

function isExactRequestOrigin(origin: string, request: Request): boolean {
  const host = request.get('host');

  if (!host) {
    return false;
  }

  try {
    const suppliedOrigin = new URL(origin);
    const requestOrigin = new URL(`${request.protocol}://${host}`);

    return (
      suppliedOrigin.origin === origin &&
      suppliedOrigin.origin === requestOrigin.origin
    );
  } catch {
    return false;
  }
}
