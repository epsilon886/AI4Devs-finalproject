import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';
import { createValidationPipe } from '../common/validation/create-validation-pipe';
import { PrismaService } from '../prisma/prisma.service';

const validLogin = { email: 'ada@example.com', password: 'a secure password' };
const persistedUser = {
  id: '018f0f64-2d8a-7f0b-8000-000000000001',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  passwordHash: 'argon2id-hash',
};

describe('POST /api/auth/login', () => {
  let app: INestApplication;
  let originalJwtSecret: string | undefined;
  let originalNodeEnv: string | undefined;
  const prisma = { user: { findUnique: jest.fn() } };

  beforeAll(async () => {
    originalJwtSecret = process.env.JWT_SECRET;
    originalNodeEnv = process.env.NODE_ENV;
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.NODE_ENV = 'development';
    jest.spyOn(argon2, 'verify').mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue(persistedUser);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
    restoreEnvironment('JWT_SECRET', originalJwtSecret);
    restoreEnvironment('NODE_ENV', originalNodeEnv);
  });

  it('is public, returns the public user, and sets the approved development cookie', async () => {
    const response = await protectedPost(app, '/api/auth/login')
      .send({ ...validLogin, email: '  ADA@Example.COM ' })
      .expect(200)
      .expect({
        id: persistedUser.id,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
      });

    expect(response.headers['set-cookie']).toEqual([
      expect.stringContaining('session='),
    ]);
    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=14400');
    expect(cookie).not.toContain('Domain=');
    expect(cookie).not.toContain('Secure');
  });

  it.each([
    ['unknown email', undefined, true],
    ['incorrect password', persistedUser, false],
  ])(
    'uses the same public 401 response for %s',
    async (_description, user, verifyResult) => {
      prisma.user.findUnique.mockResolvedValueOnce(user);
      jest.spyOn(argon2, 'verify').mockReset().mockResolvedValue(verifyResult);

      await protectedPost(app, '/api/auth/login')
        .send(validLogin)
        .expect(401)
        .expect({
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        });
    },
  );

  it('validates the login DTO and requires JSON', async () => {
    await protectedPost(app, '/api/auth/login').send({}).expect(400);

    await protectedPost(app, '/api/auth/login')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(validLogin))
      .expect(415)
      .expect({
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content type is not supported',
      });
  });

  it('sets Secure only when NODE_ENV is production', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    prisma.user.findUnique.mockResolvedValue(persistedUser);
    jest.spyOn(argon2, 'verify').mockReset().mockResolvedValue(true);

    try {
      const response = await protectedPost(app, '/api/auth/login')
        .send(validLogin)
        .expect(200);

      expect(response.headers['set-cookie']?.[0]).toContain('Secure');
    } finally {
      restoreEnvironment('NODE_ENV', previousNodeEnv);
    }
  });
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
