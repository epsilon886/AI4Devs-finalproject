import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';
import { createValidationPipe } from '../common/validation/create-validation-pipe';
import { PrismaService } from '../prisma/prisma.service';

const user = {
  id: '018f0f64-2d8a-7f0b-8000-000000000001',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  passwordHash: 'argon2id-hash',
};

describe('GET /api/auth/me', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let originalJwtSecret: string | undefined;
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };

  beforeAll(async () => {
    originalJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-jwt-secret';
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
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
    restoreEnvironment('JWT_SECRET', originalJwtSecret);
  });

  it('requires a session', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401).expect({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  });

  it('returns only the public persisted user with a valid session', async () => {
    const session = await jwtService.signAsync({ sub: user.id });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `session=${session}`)
      .expect(200)
      .expect({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      });
  });

  it('rejects an expired session and a valid JWT for a missing user', async () => {
    const expiredSession = await jwtService.signAsync(
      { sub: user.id },
      { expiresIn: -1 },
    );

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `session=${expiredSession}`)
      .expect(401);

    prisma.user.findUnique.mockResolvedValueOnce(null);
    const session = await jwtService.signAsync({ sub: user.id });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `session=${session}`)
      .expect(401)
      .expect({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
  });

  it('supports the login-to-me browser flow without exposing passwordHash', async () => {
    jest.spyOn(argon2, 'verify').mockResolvedValueOnce(true);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Host', 'recruitlane.test')
      .set('Origin', 'http://recruitlane.test')
      .set('X-CSRF-Protection', '1')
      .send({ email: user.email, password: 'a secure password' })
      .expect(200);
    const session = loginResponse.headers['set-cookie']?.[0]?.split(';', 1)[0];

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', session ?? '')
      .expect(200)
      .expect((response) => {
        expect(response.body.passwordHash).toBeUndefined();
      });
  });
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
