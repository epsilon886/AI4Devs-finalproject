import {
  ConflictException,
  HttpException,
  INestApplication,
  Logger,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { createValidationPipe } from '../common/validation/create-validation-pipe';
import { AuthService } from './auth.service';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';
import { AuthRateLimitService } from './auth-rate-limit.service';

const validRegistration = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  password: 'a secure password',
};

describe('POST /api/auth/register', () => {
  let app: INestApplication;
  let originalJwtSecret: string | undefined;
  const authService = { register: jest.fn().mockResolvedValue(undefined) };
  const rateLimitService = { recordRegistration: jest.fn() };

  beforeAll(async () => {
    originalJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-jwt-secret';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue(authService)
      .overrideProvider(AuthRateLimitService)
      .useValue(rateLimitService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    restoreEnvironment('JWT_SECRET', originalJwtSecret);
  });

  it('creates an account at the global API prefix with the exact public response', async () => {
    const response = await protectedPost(app, '/api/auth/register')
      .send(validRegistration)
      .expect(201)
      .expect({ message: 'Account created successfully' });

    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it.each([
    ['required fields', {}],
    [
      'incorrect field types',
      { firstName: 1, lastName: false, email: [], password: {} },
    ],
    [
      'an empty first name after trimming',
      { ...validRegistration, firstName: '   ' },
    ],
    [
      'a name longer than 100 characters',
      { ...validRegistration, lastName: 'a'.repeat(101) },
    ],
    ['an invalid email', { ...validRegistration, email: 'not-an-email' }],
    [
      'an email longer than 200 characters',
      { ...validRegistration, email: `${'a'.repeat(190)}@example.com` },
    ],
    [
      'a password shorter than 15 characters',
      { ...validRegistration, password: 'a'.repeat(14) },
    ],
    [
      'a password longer than 128 characters',
      { ...validRegistration, password: 'a'.repeat(129) },
    ],
    ['an additional property', { ...validRegistration, role: 'admin' }],
  ])('returns the validation envelope for %s', async (_description, body) => {
    const response = await protectedPost(app, '/api/auth/register')
      .send(body)
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
    });
    expect(response.body.errors).toEqual(expect.any(Array));
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  it('accepts boundary-length names after trimming while preserving internal whitespace', async () => {
    await protectedPost(app, '/api/auth/register')
      .send({
        ...validRegistration,
        firstName: `  ${'A'.repeat(50)} ${'B'.repeat(49)}  `,
      })
      .expect(201)
      .expect({ message: 'Account created successfully' });
  });

  it('rejects non-JSON media types with the approved envelope', async () => {
    await protectedPost(app, '/api/auth/register')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(validRegistration))
      .expect(415)
      .expect({
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content type is not supported',
      });
  });

  it('accepts application/json with a charset parameter', async () => {
    await protectedPost(app, '/api/auth/register')
      .set('Content-Type', 'application/json; charset=utf-8')
      .send(validRegistration)
      .expect(201)
      .expect({ message: 'Account created successfully' });
  });

  it('does not expose the registration route without the API prefix', async () => {
    await protectedPost(app, '/auth/register')
      .send(validRegistration)
      .expect(404);
  });

  it('returns the approved conflict envelope without exposing the email', async () => {
    authService.register.mockRejectedValueOnce(
      new ConflictException({
        statusCode: 409,
        code: 'REGISTRATION_CONFLICT',
        message: 'Unable to create account with the provided information',
      }),
    );

    await protectedPost(app, '/api/auth/register')
      .send(validRegistration)
      .expect(409)
      .expect({
        statusCode: 409,
        code: 'REGISTRATION_CONFLICT',
        message: 'Unable to create account with the provided information',
      });
  });

  it('maps unexpected errors to the approved generic envelope', async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    authService.register.mockRejectedValueOnce(new Error('database internals'));

    await protectedPost(app, '/api/auth/register')
      .send(validRegistration)
      .expect(500)
      .expect({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      });

    expect(loggerSpy).toHaveBeenCalled();

    loggerSpy.mockRestore();
  });

  it('requires the Origin and CSRF protection even though registration is public', async () => {
    rateLimitService.recordRegistration.mockClear();
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Host', 'recruitlane.test')
      .send(validRegistration)
      .expect(403)
      .expect({
        statusCode: 403,
        code: 'UNAUTHORIZED_REQUEST',
        message: 'Request could not be verified',
      });

    expect(rateLimitService.recordRegistration).not.toHaveBeenCalled();
  });

  it('returns the approved 429 envelope without Retry-After when the guard rejects', async () => {
    rateLimitService.recordRegistration.mockImplementationOnce(() => {
      throw new HttpException(
        {
          statusCode: 429,
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
        },
        429,
      );
    });

    const response = await protectedPost(app, '/api/auth/register')
      .send(validRegistration)
      .expect(429)
      .expect({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      });

    expect(response.headers['retry-after']).toBeUndefined();
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
