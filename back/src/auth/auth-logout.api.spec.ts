import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';
import { createValidationPipe } from '../common/validation/create-validation-pipe';
import { PrismaService } from '../prisma/prisma.service';

describe('POST /api/auth/logout', () => {
  let app: INestApplication;
  let originalJwtSecret: string | undefined;

  beforeAll(async () => {
    originalJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-jwt-secret';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    restoreEnvironment('JWT_SECRET', originalJwtSecret);
  });

  it.each([undefined, 'session=malformed-token'])(
    'clears session and returns 204 even with cookie %s',
    async (cookie) => {
      const response = await protectedPost(app, '/api/auth/logout')
        .set(cookie ? { Cookie: cookie } : {})
        .expect(204);

      const clearedCookie = response.headers['set-cookie']?.[0] ?? '';
      expect(clearedCookie).toContain('session=;');
      expect(clearedCookie).toContain('Path=/');
      expect(clearedCookie).toContain('SameSite=Strict');
      expect(clearedCookie).not.toContain('Domain=');
    },
  );
});

function protectedPost(app: INestApplication, path: string) {
  return request(app.getHttpServer())
    .post(path)
    .set('Host', 'recruitlane.test')
    .set('Origin', 'http://recruitlane.test')
    .set('X-CSRF-Protection', '1');
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
