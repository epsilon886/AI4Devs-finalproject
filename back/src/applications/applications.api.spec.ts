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
const candidateId = '018f0f64-2d8a-7f0b-8000-000000000003';
const vacancyId = '018f0f64-2d8a-7f0b-8000-000000000004';
const pipelineId = '018f0f64-2d8a-7f0b-8000-000000000005';
const firstStageId = '018f0f64-2d8a-7f0b-8000-000000000006';
const thirdStageId = '018f0f64-2d8a-7f0b-8000-000000000008';
const otherPipelineStageId = '018f0f64-2d8a-7f0b-8000-000000000011';

describe('Applications HTTP API', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let originalJwtSecret: string | undefined;
  const prisma = {
    candidate: { findFirst: jest.fn() },
    vacancy: { findFirst: jest.fn() },
    pipelineStage: { findFirst: jest.fn() },
    application: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
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

  it('creates an Application for request.user.sub and returns its contractual public detail', async () => {
    prisma.candidate.findFirst.mockResolvedValue(candidate());
    prisma.vacancy.findFirst.mockResolvedValue(vacancy());
    prisma.application.create.mockResolvedValue(application());

    await authenticatedPost(ownerId)
      .send(validCreate())
      .expect(201)
      .expect(publicApplication());

    expect(prisma.candidate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: candidateId, userId: ownerId }),
      }),
    );
    expect(prisma.vacancy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: vacancyId, userId: ownerId }),
      }),
    );
  });

  it.each([
    ['candidateId is absent', { vacancyId }],
    ['vacancyId is absent', { candidateId }],
    ['an identifier is not a UUID', { candidateId: 'not-a-uuid', vacancyId }],
    ['the body is empty', {}],
    [
      'currentStageId is supplied',
      { ...validCreate(), currentStageId: firstStageId },
    ],
    ['userId is supplied', { ...validCreate(), userId: ownerId }],
    ['status is supplied', { ...validCreate(), status: 'OPEN' }],
    ['deletedAt is supplied', { ...validCreate(), deletedAt: null }],
    ['an unknown property is supplied', { ...validCreate(), unexpected: true }],
  ])('rejects POST when %s', async (_description, body) => {
    const response = await authenticatedPost(ownerId).send(body).expect(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      errors: expect.any(Array),
    });
  });

  it('preserves authentication, Origin/CSRF, and JSON content-type contracts for POST', async () => {
    await request(app.getHttpServer())
      .post('/api/applications')
      .set('Host', 'recruitlane.test')
      .set('Origin', 'http://recruitlane.test')
      .set('X-CSRF-Protection', '1')
      .send(validCreate())
      .expect(401)
      .expect({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });

    await request(app.getHttpServer())
      .post('/api/applications')
      .set('Host', 'recruitlane.test')
      .set('Cookie', `session=${sessionFor(ownerId)}`)
      .send(validCreate())
      .expect(403)
      .expect({
        statusCode: 403,
        code: 'UNAUTHORIZED_REQUEST',
        message: 'Request could not be verified',
      });

    await authenticatedPost(ownerId)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(validCreate()))
      .expect(415)
      .expect({
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content type is not supported',
      });
  });

  it.each([
    [
      'Candidate is not visible',
      () => {
        prisma.candidate.findFirst.mockResolvedValue(null);
      },
      {
        statusCode: 404,
        code: 'CANDIDATE_NOT_FOUND',
        message: 'Candidate not found',
      },
    ],
    [
      'Vacancy is not visible',
      () => {
        prisma.candidate.findFirst.mockResolvedValue(candidate());
        prisma.vacancy.findFirst.mockResolvedValue(null);
      },
      {
        statusCode: 404,
        code: 'VACANCY_NOT_FOUND',
        message: 'Vacancy not found',
      },
    ],
    [
      'Vacancy is not OPEN',
      () => {
        prisma.candidate.findFirst.mockResolvedValue(candidate());
        prisma.vacancy.findFirst.mockResolvedValue(
          vacancy({ status: 'DRAFT' }),
        );
      },
      {
        statusCode: 409,
        code: 'VACANCY_NOT_OPEN',
        message: 'The vacancy does not allow this operation',
      },
    ],
  ])(
    'returns the contractual domain error when %s',
    async (_description, arrange, expected) => {
      arrange();
      await authenticatedPost(ownerId)
        .send(validCreate())
        .expect(expected.statusCode)
        .expect(expected);
    },
  );

  it('returns APPLICATION_ALREADY_EXISTS when PostgreSQL reports an active Application conflict', async () => {
    prisma.candidate.findFirst.mockResolvedValue(candidate());
    prisma.vacancy.findFirst.mockResolvedValue(vacancy());
    prisma.application.create.mockRejectedValue({ code: 'P2002' });

    await authenticatedPost(ownerId).send(validCreate()).expect(409).expect({
      statusCode: 409,
      code: 'APPLICATION_ALREADY_EXISTS',
      message:
        'An active application already exists for this candidate and vacancy',
    });
  });

  it('lists authenticated recruiter active Applications as paginated public summaries without Origin or CSRF', async () => {
    prisma.application.count.mockResolvedValue(12);
    prisma.application.findMany.mockResolvedValue([application()]);

    await authenticatedGet('/api/applications?page=2&pageSize=10', ownerId)
      .expect(200)
      .expect({
        applications: [publicApplicationSummary()],
        page: 2,
        pageSize: 10,
        totalItems: 12,
        totalPages: 2,
      });

    const where = { deletedAt: null, vacancy: { userId: ownerId } };
    expect(prisma.application.count).toHaveBeenCalledWith({ where });
    expect(prisma.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('requires authentication to list Applications', async () => {
    await request(app.getHttpServer()).get('/api/applications').expect(401);
  });

  it('filters active Applications by one visible Vacancy', async () => {
    prisma.vacancy.findFirst.mockResolvedValue(vacancy());
    prisma.application.count.mockResolvedValue(1);
    prisma.application.findMany.mockResolvedValue([application()]);

    await authenticatedGet(`/api/applications?vacancyId=${vacancyId}`, ownerId)
      .expect(200)
      .expect({
        applications: [publicApplicationSummary()],
        page: 1,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
      });

    const where = {
      deletedAt: null,
      vacancyId,
      vacancy: { userId: ownerId },
    };
    expect(prisma.vacancy.findFirst).toHaveBeenCalledWith({
      where: { id: vacancyId, userId: ownerId },
    });
    expect(prisma.application.count).toHaveBeenCalledWith({ where });
    expect(prisma.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
  });

  it.each([
    '?vacancyId=',
    '?vacancyId=not-a-uuid',
    `?vacancyId=${vacancyId}&vacancyId=${firstStageId}`,
    `?vacancyId[]=${vacancyId}`,
    `?vacancyId=${vacancyId},${firstStageId}`,
    '?unexpected=true',
  ])('rejects the invalid vacancyId query representation %s', async (query) => {
    await authenticatedGet(`/api/applications${query}`, ownerId).expect(400);
  });

  it.each(['does not exist', 'belongs to another recruiter'])(
    'returns VACANCY_NOT_FOUND when the vacancyId filter %s',
    async () => {
      prisma.vacancy.findFirst.mockResolvedValue(null);

      await authenticatedGet(
        `/api/applications?vacancyId=${vacancyId}`,
        ownerId,
      )
        .expect(404)
        .expect({
          statusCode: 404,
          code: 'VACANCY_NOT_FOUND',
          message: 'Vacancy not found',
        });
    },
  );

  it('returns the public detail for an active own Application without restricting closed Vacancies', async () => {
    prisma.application.findFirst.mockResolvedValue(
      application({ vacancyStatus: 'FILLED' }),
    );

    await authenticatedGet(`/api/applications/${application().id}`, ownerId)
      .expect(200)
      .expect(publicApplication());
  });

  it.each([
    'does not exist',
    'belongs to another recruiter',
    'was soft-deleted',
  ])(
    'returns APPLICATION_NOT_FOUND when the detail Application %s',
    async () => {
      prisma.application.findFirst.mockResolvedValue(null);

      await authenticatedGet(`/api/applications/${application().id}`, ownerId)
        .expect(404)
        .expect({
          statusCode: 404,
          code: 'APPLICATION_NOT_FOUND',
          message: 'Application not found',
        });
    },
  );

  it('validates Application detail IDs', async () => {
    await authenticatedGet('/api/applications/not-a-uuid', ownerId).expect(400);
  });

  it('soft-deletes an active Application in an OPEN Vacancy without requiring a JSON content type', async () => {
    prisma.application.findFirst.mockResolvedValue(application());
    prisma.application.updateMany.mockResolvedValue({ count: 1 });

    const response = await authenticatedDelete(
      `/api/applications/${application().id}`,
      ownerId,
    ).expect(204);

    expect(response.text).toBe('');
  });

  it('validates Application DELETE IDs', async () => {
    await authenticatedDelete('/api/applications/not-a-uuid', ownerId).expect(
      400,
    );
  });

  it('requires a session for DELETE when Origin and CSRF are valid', async () => {
    await request(app.getHttpServer())
      .delete(`/api/applications/${application().id}`)
      .set('Host', 'recruitlane.test')
      .set('Origin', 'http://recruitlane.test')
      .set('X-CSRF-Protection', '1')
      .expect(401)
      .expect({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
  });

  it('requires valid Origin and CSRF protection for DELETE', async () => {
    await request(app.getHttpServer())
      .delete(`/api/applications/${application().id}`)
      .set('Host', 'recruitlane.test')
      .set('Cookie', `session=${sessionFor(ownerId)}`)
      .set('Origin', 'http://recruitlane.test')
      .expect(403)
      .expect({
        statusCode: 403,
        code: 'UNAUTHORIZED_REQUEST',
        message: 'Request could not be verified',
      });
  });

  it.each([
    'does not exist',
    'belongs to another recruiter',
    'was soft-deleted',
  ])(
    'returns APPLICATION_NOT_FOUND when DELETE targets an Application that %s',
    async () => {
      prisma.application.findFirst.mockResolvedValue(null);

      await authenticatedDelete(
        `/api/applications/${application().id}`,
        ownerId,
      )
        .expect(404)
        .expect({
          statusCode: 404,
          code: 'APPLICATION_NOT_FOUND',
          message: 'Application not found',
        });
    },
  );

  it.each(['DRAFT', 'FILLED', 'CANCELLED'] as const)(
    'returns VACANCY_NOT_OPEN when DELETE targets a %s Vacancy',
    async (status) => {
      prisma.application.findFirst.mockResolvedValue(
        application({ vacancyStatus: status }),
      );

      await authenticatedDelete(
        `/api/applications/${application().id}`,
        ownerId,
      )
        .expect(409)
        .expect({
          statusCode: 409,
          code: 'VACANCY_NOT_OPEN',
          message: 'The vacancy does not allow this operation',
        });
      expect(prisma.application.updateMany).not.toHaveBeenCalled();
    },
  );

  it('moves an active own Application and returns its public detail', async () => {
    const destination = stage(thirdStageId, 'Interview', 3);
    prisma.application.findFirst.mockResolvedValue(application());
    prisma.pipelineStage.findFirst.mockResolvedValue(destination);
    prisma.application.update.mockResolvedValue(
      application({ currentStage: destination }),
    );

    await authenticatedPatch(`/api/applications/${application().id}`, ownerId)
      .send({ currentStageId: thirdStageId })
      .expect(200)
      .expect(publicApplication({ currentStage: destination }));

    expect(prisma.application.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: application().id,
          deletedAt: null,
          vacancy: { userId: ownerId },
        },
      }),
    );
  });

  it('accepts a move to the current stage as a 200 no-op', async () => {
    prisma.application.findFirst.mockResolvedValue(application());

    await authenticatedPatch(`/api/applications/${application().id}`, ownerId)
      .send({ currentStageId: firstStageId })
      .expect(200)
      .expect(publicApplication());
  });

  it('validates Application PATCH IDs', async () => {
    await authenticatedPatch('/api/applications/not-a-uuid', ownerId)
      .send({ currentStageId: firstStageId })
      .expect(400);
  });

  it.each([
    ['the body is empty', {}],
    ['currentStageId is absent', { vacancyId }],
    ['currentStageId is not a UUID', { currentStageId: 'not-a-uuid' }],
    ['currentStageId is null', { currentStageId: null }],
    ['currentStageId is an array', { currentStageId: [firstStageId] }],
    ['vacancyId is supplied', { currentStageId: firstStageId, vacancyId }],
    ['candidateId is supplied', { currentStageId: firstStageId, candidateId }],
    ['userId is supplied', { currentStageId: firstStageId, userId: ownerId }],
    ['status is supplied', { currentStageId: firstStageId, status: 'OPEN' }],
    ['an unknown property is supplied', { currentStageId: firstStageId, unexpected: true }],
  ])('rejects PATCH when %s', async (_description, body) => {
    const response = await authenticatedPatch(
      `/api/applications/${application().id}`,
      ownerId,
    )
      .send(body)
      .expect(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      errors: expect.any(Array),
    });
  });

  it('preserves session, Origin/CSRF, and JSON content-type contracts for PATCH', async () => {
    await request(app.getHttpServer())
      .patch(`/api/applications/${application().id}`)
      .set('Host', 'recruitlane.test')
      .set('Origin', 'http://recruitlane.test')
      .set('X-CSRF-Protection', '1')
      .send({ currentStageId: firstStageId })
      .expect(401)
      .expect({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });

    await request(app.getHttpServer())
      .patch(`/api/applications/${application().id}`)
      .set('Host', 'recruitlane.test')
      .set('Cookie', `session=${sessionFor(ownerId)}`)
      .set('Origin', 'http://recruitlane.test')
      .send({ currentStageId: firstStageId })
      .expect(403)
      .expect({
        statusCode: 403,
        code: 'UNAUTHORIZED_REQUEST',
        message: 'Request could not be verified',
      });

    await authenticatedPatch(`/api/applications/${application().id}`, ownerId)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ currentStageId: firstStageId }))
      .expect(415)
      .expect({
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content type is not supported',
      });
  });

  it('returns APPLICATION_NOT_FOUND when PATCH targets a non-visible Application', async () => {
    prisma.application.findFirst.mockResolvedValue(null);

    await authenticatedPatch(`/api/applications/${application().id}`, ownerId)
      .send({ currentStageId: thirdStageId })
      .expect(404)
      .expect({
        statusCode: 404,
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      });
  });

  it('returns VACANCY_NOT_OPEN when PATCH targets an Application in a closed Vacancy', async () => {
    prisma.application.findFirst.mockResolvedValue(
      application({ vacancyStatus: 'FILLED' }),
    );

    await authenticatedPatch(`/api/applications/${application().id}`, ownerId)
      .send({ currentStageId: thirdStageId })
      .expect(409)
      .expect({
        statusCode: 409,
        code: 'VACANCY_NOT_OPEN',
        message: 'The vacancy does not allow this operation',
      });
  });

  it.each([
    ['does not exist', thirdStageId],
    ['belongs to another Pipeline', otherPipelineStageId],
  ])(
    'returns the same validation error when PATCH destination stage %s',
    async (_description, destinationStageId) => {
      prisma.application.findFirst.mockResolvedValue(application());
      prisma.pipelineStage.findFirst.mockResolvedValue(null);

      const response = await authenticatedPatch(
        `/api/applications/${application().id}`,
        ownerId,
      )
        .send({ currentStageId: destinationStageId })
        .expect(400);
      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
      });
    },
  );

  function sessionFor(userId: string): string {
    return jwtService.sign({ sub: userId });
  }

  function authenticatedPost(userId: string) {
    return request(app.getHttpServer())
      .post('/api/applications')
      .set('Host', 'recruitlane.test')
      .set('Cookie', `session=${sessionFor(userId)}`)
      .set('Origin', 'http://recruitlane.test')
      .set('X-CSRF-Protection', '1');
  }

  function authenticatedGet(path: string, userId: string) {
    return request(app.getHttpServer())
      .get(path)
      .set('Cookie', `session=${sessionFor(userId)}`);
  }

  function authenticatedDelete(path: string, userId: string) {
    return request(app.getHttpServer())
      .delete(path)
      .set('Host', 'recruitlane.test')
      .set('Cookie', `session=${sessionFor(userId)}`)
      .set('Origin', 'http://recruitlane.test')
      .set('X-CSRF-Protection', '1');
  }

  function authenticatedPatch(path: string, userId: string) {
    return request(app.getHttpServer())
      .patch(path)
      .set('Host', 'recruitlane.test')
      .set('Cookie', `session=${sessionFor(userId)}`)
      .set('Origin', 'http://recruitlane.test')
      .set('X-CSRF-Protection', '1');
  }
});

function validCreate() {
  return { candidateId, vacancyId };
}

function candidate() {
  return {
    id: candidateId,
    userId: ownerId,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: null,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
  };
}

function vacancy({ status = 'OPEN' }: { status?: string } = {}) {
  return {
    id: vacancyId,
    userId: ownerId,
    pipelineId,
    title: 'Backend engineer',
    companyName: 'RecruitLane',
    description: 'Build useful things',
    status,
    createdAt: new Date('2026-01-02T10:00:00.000Z'),
    updatedAt: new Date('2026-01-02T10:00:00.000Z'),
    pipeline: {
      id: pipelineId,
      userId: ownerId,
      name: 'Hiring',
      isDefault: false,
      deletedAt: null,
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
      updatedAt: new Date('2026-01-01T10:00:00.000Z'),
      stages: [
        stage('018f0f64-2d8a-7f0b-8000-000000000008', 'Interview', 3),
        stage(firstStageId, 'Applied', 1),
        stage('018f0f64-2d8a-7f0b-8000-000000000007', 'Screening', 2),
      ],
    },
  };
}

function application({
  vacancyStatus = 'OPEN',
  currentStage = stage(firstStageId, 'Applied', 1),
}: {
  vacancyStatus?: string;
  currentStage?: ReturnType<typeof stage>;
} = {}) {
  return {
    id: '018f0f64-2d8a-7f0b-8000-000000000009',
    candidateId,
    vacancyId,
    currentStageId: currentStage.id,
    deletedAt: null,
    createdAt: new Date('2026-01-03T10:00:00.000Z'),
    updatedAt: new Date('2026-01-03T10:00:00.000Z'),
    candidate: candidate(),
    vacancy: vacancy({ status: vacancyStatus }),
    currentStage,
  };
}

function publicApplicationSummary() {
  return {
    id: '018f0f64-2d8a-7f0b-8000-000000000009',
    createdAt: '2026-01-03T10:00:00.000Z',
    candidate: {
      id: candidateId,
      firstName: 'Ada',
      lastName: 'Lovelace',
    },
    vacancy: { id: vacancyId, title: 'Backend engineer' },
    currentStage: { id: firstStageId, name: 'Applied', position: 1 },
  };
}

function publicApplication({
  currentStage = stage(firstStageId, 'Applied', 1),
}: {
  currentStage?: ReturnType<typeof stage>;
} = {}) {
  return {
    id: '018f0f64-2d8a-7f0b-8000-000000000009',
    createdAt: '2026-01-03T10:00:00.000Z',
    candidate: {
      id: candidateId,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: null,
    },
    vacancy: {
      id: vacancyId,
      title: 'Backend engineer',
      companyName: 'RecruitLane',
    },
    pipeline: { name: 'Hiring' },
    currentStage: {
      id: currentStage.id,
      name: currentStage.name,
      position: currentStage.position,
    },
  };
}

function stage(id: string, name: string, position: number) {
  return {
    id,
    pipelineId,
    name,
    position,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
  };
}
