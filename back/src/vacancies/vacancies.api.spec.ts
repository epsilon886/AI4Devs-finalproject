import { INestApplication, NotFoundException } from '@nestjs/common';
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
const pipelineId = '018f0f64-2d8a-7f0b-8000-000000000003';
const vacancyId = '018f0f64-2d8a-7f0b-8000-000000000004';

describe('Vacancies HTTP API', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let originalJwtSecret: string | undefined;
  const prisma = {
    pipeline: { findFirst: jest.fn() },
    vacancy: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
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

  it('requires authentication for every Vacancy endpoint', async () => {
    await request(app.getHttpServer()).get('/api/vacancies').expect(401);
    await protectedRequest('post', '/api/vacancies').send(validCreate()).expect(401);
    await request(app.getHttpServer())
      .get(`/api/vacancies/${vacancyId}`)
      .expect(401);
    await protectedRequest('patch', `/api/vacancies/${vacancyId}`)
      .send({ title: 'Changed' })
      .expect(401);
  });

  it('creates a DRAFT Vacancy from the authenticated owner and returns its public detail', async () => {
    prisma.pipeline.findFirst.mockResolvedValue(pipeline());
    prisma.vacancy.create.mockResolvedValue(
      vacancy({
        title: 'Senior engineer',
        companyName: 'RecruitLane',
        description: 'Build\n  useful things',
      }),
    );

    await authenticatedRequest('post', '/api/vacancies', ownerId)
      .send({
        title: '  Senior engineer  ',
        companyName: '  RecruitLane  ',
        description: '  Build\n  useful things  ',
        pipelineId,
      })
      .expect(201)
      .expect(publicVacancy({
        title: 'Senior engineer',
        companyName: 'RecruitLane',
        description: 'Build\n  useful things',
      }));

    expect(prisma.pipeline.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: pipelineId, userId: ownerId, deletedAt: null },
      }),
    );
    expect(prisma.vacancy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: ownerId,
          pipelineId,
          title: 'Senior engineer',
          companyName: 'RecruitLane',
          description: 'Build\n  useful things',
          status: 'DRAFT',
        },
      }),
    );
  });

  it('lists only public owner summaries ordered by createdAt DESC with paginated metadata', async () => {
    prisma.vacancy.count.mockResolvedValue(2);
    prisma.vacancy.findMany.mockResolvedValue([
      vacancy({ id: '018f0f64-2d8a-7f0b-8000-000000000009' }),
      vacancy({ id: vacancyId, title: 'Earlier role' }),
    ]);

    await authenticatedRequest('get', '/api/vacancies', ownerId)
      .expect(200)
      .expect({
        vacancies: [
          publicSummary('018f0f64-2d8a-7f0b-8000-000000000009'),
          publicSummary(vacancyId, 'Earlier role'),
        ],
        page: 1,
        pageSize: 10,
        totalItems: 2,
        totalPages: 1,
      });

    expect(prisma.vacancy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: ownerId },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      }),
    );
  });

  it('filters the paginated listing by one status while preserving owner and order', async () => {
    prisma.vacancy.count.mockResolvedValue(1);
    prisma.vacancy.findMany.mockResolvedValue([vacancy({ status: 'OPEN' })]);

    await authenticatedRequest('get', '/api/vacancies?status=OPEN', ownerId)
      .expect(200)
      .expect({
        vacancies: [publicSummary(vacancyId, 'Engineer', 'OPEN')],
        page: 1,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
      });

    const where = { userId: ownerId, status: { in: ['OPEN'] } };
    expect(prisma.vacancy.count).toHaveBeenCalledWith({ where });
    expect(prisma.vacancy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      }),
    );
  });

  it('filters by any repeated status before calculating paginated metadata', async () => {
    prisma.vacancy.count.mockResolvedValue(12);
    prisma.vacancy.findMany.mockResolvedValue([
      vacancy({ status: 'OPEN' }),
      vacancy({
        id: '018f0f64-2d8a-7f0b-8000-000000000009',
        status: 'FILLED',
      }),
    ]);

    await authenticatedRequest(
      'get',
      '/api/vacancies?status=OPEN&status=FILLED&page=2&pageSize=10',
      ownerId,
    )
      .expect(200)
      .expect({
        vacancies: [
          publicSummary(vacancyId, 'Engineer', 'OPEN'),
          publicSummary(
            '018f0f64-2d8a-7f0b-8000-000000000009',
            'Engineer',
            'FILLED',
          ),
        ],
        page: 2,
        pageSize: 10,
        totalItems: 12,
        totalPages: 2,
      });

    const where = { userId: ownerId, status: { in: ['OPEN', 'FILLED'] } };
    expect(prisma.vacancy.count).toHaveBeenCalledWith({ where });
    expect(prisma.vacancy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('deduplicates repeated status values before delegating the listing', async () => {
    prisma.vacancy.count.mockResolvedValue(1);
    prisma.vacancy.findMany.mockResolvedValue([vacancy({ status: 'OPEN' })]);

    await authenticatedRequest(
      'get',
      '/api/vacancies?status=OPEN&status=OPEN',
      ownerId,
    ).expect(200);

    const where = { userId: ownerId, status: { in: ['OPEN'] } };
    expect(prisma.vacancy.count).toHaveBeenCalledWith({ where });
    expect(prisma.vacancy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
  });

  it('returns the public detail only for the authenticated owner', async () => {
    prisma.vacancy.findFirst.mockResolvedValue(vacancy());

    await authenticatedRequest('get', `/api/vacancies/${vacancyId}`, ownerId)
      .expect(200)
      .expect(publicVacancy());
    expect(prisma.vacancy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: vacancyId, userId: ownerId } }),
    );
  });

  it('updates only trimmed descriptive values from the authenticated owner', async () => {
    prisma.vacancy.findFirst.mockResolvedValue(vacancy({ status: 'FILLED' }));
    prisma.vacancy.updateMany.mockResolvedValue({ count: 1 });

    await authenticatedRequest('patch', `/api/vacancies/${vacancyId}`, ownerId)
      .send({
        title: '  Principal engineer ',
        description: '  First line\n second line  ',
      })
      .expect(200)
      .expect(
        publicVacancy({
          title: 'Principal engineer',
          description: 'First line\n second line',
          status: 'FILLED',
        }),
      );
    expect(prisma.vacancy.updateMany).toHaveBeenCalledWith({
      where: { id: vacancyId, userId: ownerId },
      data: {
        title: 'Principal engineer',
        description: 'First line\n second line',
      },
    });
  });

  it('updates only the status from the authenticated owner and returns public detail', async () => {
    prisma.vacancy.findFirst.mockResolvedValue(vacancy({ status: 'DRAFT' }));
    prisma.vacancy.updateMany.mockResolvedValue({ count: 1 });

    await authenticatedRequest('patch', `/api/vacancies/${vacancyId}`, ownerId)
      .send({ status: 'OPEN' })
      .expect(200)
      .expect(publicVacancy({ status: 'OPEN' }));

    expect(prisma.vacancy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: vacancyId, userId: ownerId } }),
    );
    expect(prisma.vacancy.updateMany).toHaveBeenCalledWith({
      where: { id: vacancyId, userId: ownerId },
      data: { status: 'OPEN' },
    });
  });

  it('returns public detail for a status no-op without writing', async () => {
    prisma.vacancy.findFirst.mockResolvedValue(vacancy({ status: 'OPEN' }));
    prisma.vacancy.updateMany.mockResolvedValue({ count: 1 });

    await authenticatedRequest('patch', `/api/vacancies/${vacancyId}`, ownerId)
      .send({ status: 'OPEN' })
      .expect(200)
      .expect(publicVacancy({ status: 'OPEN' }));

    expect(prisma.vacancy.updateMany).not.toHaveBeenCalled();
  });

  it('returns VACANCY_NOT_OPEN for an invalid status transition', async () => {
    prisma.vacancy.findFirst.mockResolvedValue(vacancy({ status: 'DRAFT' }));

    await authenticatedRequest('patch', `/api/vacancies/${vacancyId}`, ownerId)
      .send({ status: 'FILLED' })
      .expect(409)
      .expect({
        statusCode: 409,
        code: 'VACANCY_NOT_OPEN',
        message: 'The vacancy does not allow this operation',
      });
  });

  it('returns VACANCY_NOT_FOUND for a status update on an invisible Vacancy', async () => {
    prisma.vacancy.findFirst.mockResolvedValue(null);

    await authenticatedRequest('patch', `/api/vacancies/${vacancyId}`, otherOwnerId)
      .send({ status: 'OPEN' })
      .expect(404)
      .expect({
        statusCode: 404,
        code: 'VACANCY_NOT_FOUND',
        message: 'Vacancy not found',
      });
  });

  it.each([
    ['a required field is missing', { companyName: 'RecruitLane', description: 'Description', pipelineId }],
    ['a required field contains only outer whitespace', { ...validCreate(), title: '   ' }],
    ['title exceeds its limit', { ...validCreate(), title: 'a'.repeat(201) }],
    ['companyName exceeds its limit', { ...validCreate(), companyName: 'a'.repeat(201) }],
    ['description exceeds its limit', { ...validCreate(), description: 'a'.repeat(1501) }],
    ['pipelineId is not a UUID', { ...validCreate(), pipelineId: 'not-a-uuid' }],
    ['the client supplies an owner', { ...validCreate(), userId: otherOwnerId }],
  ])('rejects POST when %s', async (_description, body) => {
    await authenticatedRequest('post', '/api/vacancies', ownerId)
      .send(body)
      .expect(400);
  });

  it('rejects empty PATCH bodies and bodies that do not use exactly one update mode', async () => {
    await authenticatedRequest('patch', `/api/vacancies/${vacancyId}`, ownerId)
      .send({})
      .expect(400);

    for (const body of [
      { pipelineId },
      { userId: otherOwnerId },
      { title: 'Changed', status: 'OPEN' },
      { companyName: 'RecruitLane', status: 'OPEN' },
      { description: 'Changed description', status: 'OPEN' },
      { status: 'PUBLISHED' },
      { unexpected: 'value' },
    ]) {
      await authenticatedRequest('patch', `/api/vacancies/${vacancyId}`, ownerId)
        .send(body)
        .expect(400);
    }
  });

  it.each([
    '?status=',
    '?status=open',
    '?status=PUBLISHED',
    '?status=OPEN,FILLED',
    '?status[]=OPEN',
    '?status[0]=OPEN',
  ])('rejects the invalid Vacancy status query representation %s', async (query) => {
    await authenticatedRequest('get', `/api/vacancies${query}`, ownerId).expect(400);
  });

  it('validates route IDs and supported pagination representations', async () => {
    await authenticatedRequest('get', '/api/vacancies/not-a-uuid', ownerId).expect(
      400,
    );
    await authenticatedRequest('get', '/api/vacancies?page=01', ownerId).expect(
      400,
    );
    await authenticatedRequest('get', '/api/vacancies?pageSize=9', ownerId).expect(
      400,
    );
    await authenticatedRequest('get', '/api/vacancies?unknown=value', ownerId).expect(
      400,
    );
  });

  it('enforces JSON and Origin/CSRF on Vacancy mutations', async () => {
    await authenticatedRequest('post', '/api/vacancies', ownerId)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(validCreate()))
      .expect(415)
      .expect({
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content type is not supported',
      });
    await authenticatedRequest('patch', `/api/vacancies/${vacancyId}`, ownerId)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ title: 'Changed' }))
      .expect(415);

    await request(app.getHttpServer())
      .post('/api/vacancies')
      .set('Host', 'recruitlane.test')
      .set('Cookie', `session=${sessionFor(ownerId)}`)
      .send(validCreate())
      .expect(403)
      .expect({
        statusCode: 403,
        code: 'UNAUTHORIZED_REQUEST',
        message: 'Request could not be verified',
      });
  });

  it('returns the approved Pipeline and Vacancy not-found contracts', async () => {
    prisma.pipeline.findFirst.mockResolvedValue(null);
    await authenticatedRequest('post', '/api/vacancies', ownerId)
      .send(validCreate())
      .expect(404)
      .expect({
        statusCode: 404,
        code: 'PIPELINE_NOT_FOUND',
        message: 'Pipeline not found',
      });

    const vacancyNotFound = new NotFoundException({
      statusCode: 404,
      code: 'VACANCY_NOT_FOUND',
      message: 'Vacancy not found',
    });
    prisma.vacancy.findFirst.mockResolvedValue(null);
    await authenticatedRequest('get', `/api/vacancies/${vacancyId}`, otherOwnerId)
      .expect(404)
      .expect(vacancyNotFound.getResponse());
  });

  function sessionFor(userId: string): string {
    return jwtService.sign({ sub: userId });
  }

  function authenticatedRequest(
    method: 'get' | 'post' | 'patch',
    path: string,
    userId: string,
  ) {
    return protectedRequest(method, path).set('Cookie', `session=${sessionFor(userId)}`);
  }

  function protectedRequest(method: 'get' | 'post' | 'patch', path: string) {
    const agent = request(app.getHttpServer())[method](path).set('Host', 'recruitlane.test');
    return method === 'get'
      ? agent
      : agent
          .set('Origin', 'http://recruitlane.test')
          .set('X-CSRF-Protection', '1');
  }
});

function validCreate() {
  return {
    title: 'Engineer',
    companyName: 'RecruitLane',
    description: 'Build useful things',
    pipelineId,
  };
}

function pipeline() {
  return {
    id: pipelineId,
    userId: ownerId,
    name: 'Hiring',
    isDefault: false,
    deletedAt: null,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
    stages: [
      stage('018f0f64-2d8a-7f0b-8000-000000000007', 'Interview', 3),
      stage('018f0f64-2d8a-7f0b-8000-000000000005', 'Applied', 1),
      stage('018f0f64-2d8a-7f0b-8000-000000000006', 'Screening', 2),
    ],
  };
}

function vacancy({
  id = vacancyId,
  title = 'Engineer',
  companyName = 'RecruitLane',
  description = 'Build useful things',
  status = 'DRAFT',
}: Partial<{
  id: string;
  title: string;
  companyName: string;
  description: string;
  status: string;
}> = {}) {
  return {
    id,
    userId: ownerId,
    pipelineId,
    title,
    companyName,
    description,
    status,
    createdAt: new Date('2026-01-02T10:00:00.000Z'),
    updatedAt: new Date('2026-01-02T10:00:00.000Z'),
    pipeline: pipeline(),
  };
}

function publicVacancy({
  id = vacancyId,
  title = 'Engineer',
  companyName = 'RecruitLane',
  description = 'Build useful things',
  status = 'DRAFT',
}: Partial<{
  id: string;
  title: string;
  companyName: string;
  description: string;
  status: string;
}> = {}) {
  return {
    id,
    title,
    companyName,
    description,
    status,
    createdAt: '2026-01-02T10:00:00.000Z',
    pipeline: {
      name: 'Hiring',
      stages: [
        { id: '018f0f64-2d8a-7f0b-8000-000000000005', name: 'Applied', position: 1 },
        { id: '018f0f64-2d8a-7f0b-8000-000000000006', name: 'Screening', position: 2 },
        { id: '018f0f64-2d8a-7f0b-8000-000000000007', name: 'Interview', position: 3 },
      ],
    },
  };
}

function publicSummary(id: string, title = 'Engineer', status = 'DRAFT') {
  return {
    id,
    title,
    companyName: 'RecruitLane',
    createdAt: '2026-01-02T10:00:00.000Z',
    status,
    pipelineName: 'Hiring',
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
