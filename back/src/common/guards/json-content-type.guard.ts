import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class JsonContentTypeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const contentType = request.headers['content-type'];
    const mediaType = (
      Array.isArray(contentType) ? contentType[0] : contentType
    )
      ?.split(';', 1)[0]
      .trim()
      .toLowerCase();

    if (mediaType === 'application/json') {
      return true;
    }

    throw new UnsupportedMediaTypeException({
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Content type is not supported',
    });
  }
}
