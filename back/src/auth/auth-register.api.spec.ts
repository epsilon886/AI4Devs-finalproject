import { ConflictException, INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { createValidationPipe } from '../common/validation/create-validation-pipe';
import { AuthService } from './auth.service';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';

const validRegistration = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  password: 'a secure password',
};

describe('POST /api/auth/register', () => {
  let app: INestApplication;
  const authService = { register: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuthService)
      .useValue(authService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an account at the global API prefix with the exact public response', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
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
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
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
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        ...validRegistration,
        firstName: `  ${'A'.repeat(50)} ${'B'.repeat(49)}  `,
      })
      .expect(201)
      .expect({ message: 'Account created successfully' });
  });

  it('rejects non-JSON media types with the approved envelope', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
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
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Content-Type', 'application/json; charset=utf-8')
      .send(validRegistration)
      .expect(201)
      .expect({ message: 'Account created successfully' });
  });

  it('does not expose the registration route without the API prefix', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
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

    await request(app.getHttpServer())
      .post('/api/auth/register')
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

    await request(app.getHttpServer())
      .post('/api/auth/register')
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
});
