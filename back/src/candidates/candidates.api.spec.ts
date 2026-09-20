import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';
import { createValidationPipe } from '../common/validation/create-validation-pipe';
import { PrismaService } from '../prisma/prisma.service';

const ownerId = '018f0f64-2d8a-7f0b-8000-000000000001';
const otherOwnerId = '018f0f64-2d8a-7f0b-8000-000000000002';
const candidateId = '018f0f64-2d8a-7f0b-8000-000000000003';
const candidate = {
  id: candidateId,
  userId: ownerId,
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Candidates HTTP API', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let originalJwtSecret: string | undefined;
  const prisma = {
    candidate: {
      create: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

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
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires authentication for every Candidates endpoint', async () => {
    await request(app.getHttpServer()).get('/api/candidates').expect(401);
    await protectedRequest('post', '/api/candidates')
      .send(validCreate())
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/candidates/${candidateId}`)
      .expect(401);
    await protectedRequest('patch', `/api/candidates/${candidateId}`)
      .send({ firstName: 'Grace' })
      .expect(401);
  });

  it('creates with a normalized email and returns only the public representation', async () => {
    prisma.candidate.create.mockResolvedValue({
      ...candidate,
      phone: '+123456',
    });

    await authenticatedRequest('post', '/api/candidates', ownerId)
      .send({
        ...validCreate(),
        email: '  ADA@Example.COM ',
        phone: ' +123456 ',
      })
      .expect(201)
      .expect({
        id: candidateId,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '+123456',
      });

    expect(prisma.candidate.create).toHaveBeenCalledWith({
      data: {
        userId: ownerId,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '+123456',
      },
    });
  });

  it('enforces JSON, Origin/CSRF, DTO validation, and never accepts a client owner', async () => {
    await authenticatedRequest('post', '/api/candidates', ownerId)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(validCreate()))
      .expect(415)
      .expect({
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content type is not supported',
      });

    const session = sessionFor(ownerId);
    await request(app.getHttpServer())
      .post('/api/candidates')
      .set('Cookie', `session=${session}`)
      .send(validCreate())
      .expect(403)
      .expect({
        statusCode: 403,
        code: 'UNAUTHORIZED_REQUEST',
        message: 'Request could not be verified',
      });

    await authenticatedRequest('post', '/api/candidates', ownerId)
      .send({ ...validCreate(), userId: otherOwnerId })
      .expect(400);
    await authenticatedRequest('post', '/api/candidates', ownerId)
      .send({ ...validCreate(), phone: '123-456' })
      .expect(400);
  });

  it('returns the approved conflict and validates UUIDs and pagination', async () => {
    prisma.candidate.create.mockRejectedValue({ code: 'P2002' });
    await authenticatedRequest('post', '/api/candidates', ownerId)
      .send(validCreate())
      .expect(409)
      .expect({
        statusCode: 409,
        code: 'CANDIDATE_EMAIL_CONFLICT',
        message: 'A candidate with this email already exists',
      });

    await authenticatedRequest(
      'get',
      '/api/candidates?foo=bar',
      ownerId,
    ).expect(400);
    await authenticatedRequest(
      'get',
      '/api/candidates?page=01',
      ownerId,
    ).expect(400);
    await authenticatedRequest(
      'get',
      '/api/candidates?pageSize=9',
      ownerId,
    ).expect(400);
    await authenticatedRequest(
      'get',
      '/api/candidates/not-a-uuid',
      ownerId,
    ).expect(400);
  });

  it('lists only the authenticated owner collection and preserves empty out-of-range metadata', async () => {
    prisma.candidate.count.mockResolvedValue(1);
    prisma.$queryRaw.mockResolvedValue([]);

    await authenticatedRequest(
      'get',
      '/api/candidates?page=5&pageSize=10',
      ownerId,
    )
      .expect(200)
      .expect({
        candidates: [],
        page: 5,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
      });
    expect(prisma.candidate.count).toHaveBeenCalledWith({
      where: { userId: ownerId },
    });
  });

  it('does not reveal or update another recruiter candidate', async () => {
    prisma.candidate.findFirst.mockResolvedValue(null);

    await authenticatedRequest(
      'get',
      `/api/candidates/${candidateId}`,
      otherOwnerId,
    )
      .expect(404)
      .expect({
        statusCode: 404,
        code: 'CANDIDATE_NOT_FOUND',
        message: 'Candidate not found',
      });
    await authenticatedRequest(
      'patch',
      `/api/candidates/${candidateId}`,
      otherOwnerId,
    )
      .send({ firstName: 'Grace' })
      .expect(404)
      .expect({
        statusCode: 404,
        code: 'CANDIDATE_NOT_FOUND',
        message: 'Candidate not found',
      });
    expect(prisma.candidate.updateMany).not.toHaveBeenCalled();
  });

  it('distinguishes omitted phone from null, allows no-op updates, and rejects an empty PATCH body', async () => {
    prisma.candidate.findFirst
      .mockResolvedValueOnce({ ...candidate, phone: '+123456' })
      .mockResolvedValueOnce({ ...candidate, phone: '+123456' })
      .mockResolvedValueOnce({ ...candidate, phone: '+123456' })
      .mockResolvedValueOnce({ ...candidate, phone: null });
    prisma.candidate.updateMany.mockResolvedValue({ count: 1 });

    await authenticatedRequest(
      'patch',
      `/api/candidates/${candidateId}`,
      ownerId,
    )
      .send({ firstName: 'Ada' })
      .expect(200)
      .expect({
        id: candidateId,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '+123456',
      });
    expect(prisma.candidate.updateMany).not.toHaveBeenCalled();

    await authenticatedRequest(
      'patch',
      `/api/candidates/${candidateId}`,
      ownerId,
    )
      .send({ phone: null })
      .expect(200)
      .expect((response) => expect(response.body.phone).toBeNull());
    expect(prisma.candidate.updateMany).toHaveBeenCalledWith({
      where: { id: candidateId, userId: ownerId },
      data: { phone: null },
    });

    await authenticatedRequest(
      'patch',
      `/api/candidates/${candidateId}`,
      ownerId,
    )
      .send({})
      .expect(400);
  });

  function sessionFor(userId: string): string {
    return jwtService.sign({ sub: userId });
  }

  function authenticatedRequest(
    method: 'get' | 'post' | 'patch',
    path: string,
    userId: string,
  ) {
    return protectedRequest(method, path).set(
      'Cookie',
      `session=${sessionFor(userId)}`,
    );
  }

  function protectedRequest(method: 'get' | 'post' | 'patch', path: string) {
    const agent = request(app.getHttpServer())
      [method](path)
      .set('Host', 'recruitlane.test');
    return method === 'get'
      ? agent
      : agent
          .set('Origin', 'http://recruitlane.test')
          .set('X-CSRF-Protection', '1');
  }
});

function validCreate() {
  return { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' };
}
