import {
  ConflictException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';
import { ApiExceptionFilter } from '../common/filters/api-exception.filter';
import { createValidationPipe } from '../common/validation/create-validation-pipe';
import { PrismaService } from '../prisma/prisma.service';
import { PipelinesService } from './pipelines.service';

const ownerId = '018f0f64-2d8a-7f0b-8000-000000000001';
const otherOwnerId = '018f0f64-2d8a-7f0b-8000-000000000002';
const pipelineId = '018f0f64-2d8a-7f0b-8000-000000000003';
const publicPipeline = {
  id: pipelineId,
  name: 'Default',
  isDefault: true,
  isEditable: false,
  stages: [
    {
      id: '018f0f64-2d8a-7f0b-8000-000000000004',
      name: 'Applied',
      position: 1,
    },
    {
      id: '018f0f64-2d8a-7f0b-8000-000000000005',
      name: 'Screening',
      position: 2,
    },
  ],
};

describe('Pipelines HTTP API', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let originalJwtSecret: string | undefined;
  const pipelinesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeAll(async () => {
    originalJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-jwt-secret';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(PipelinesService)
      .useValue(pipelinesService)
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

  it('requires authentication for every Pipeline endpoint', async () => {
    await request(app.getHttpServer()).get('/api/pipelines').expect(401);
    await protectedRequest('post', '/api/pipelines')
      .send(validCreate())
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/pipelines/${pipelineId}`)
      .expect(401);
    await protectedRequest('patch', `/api/pipelines/${pipelineId}`)
      .send({ name: 'Hiring' })
      .expect(401);
    await protectedRequest('delete', `/api/pipelines/${pipelineId}`).expect(
      401,
    );
  });

  it('creates with transformed names and only the authenticated owner', async () => {
    pipelinesService.create.mockResolvedValue({
      ...publicPipeline,
      isDefault: false,
      isEditable: true,
      name: 'Hiring',
    });

    await authenticatedRequest('post', '/api/pipelines', ownerId)
      .send({
        name: '  hIRING  ',
        stages: [
          { name: ' SCREENING ', position: 2 },
          { name: ' APPLIED ', position: 1 },
          { name: ' INTERVIEW ', position: 3 },
        ],
      })
      .expect(201)
      .expect((response) => expect(response.body).not.toHaveProperty('userId'));

    expect(pipelinesService.create).toHaveBeenCalledWith(ownerId, {
      name: 'Hiring',
      stages: [
        { name: 'Screening', position: 2 },
        { name: 'Applied', position: 1 },
        { name: 'Interview', position: 3 },
      ],
    });
  });

  it('normalizes Pipeline and stage names before delegating PATCH', async () => {
    pipelinesService.update.mockResolvedValue({
      ...publicPipeline,
      isDefault: false,
      isEditable: true,
      name: 'Hiring process',
    });

    await authenticatedRequest('patch', `/api/pipelines/${pipelineId}`, ownerId)
      .send({
        name: '  hIRING PROCESS  ',
        stages: [
          {
            id: publicPipeline.stages[1].id,
            name: ' SCREENING ',
            position: 2,
          },
          {
            id: publicPipeline.stages[0].id,
            name: ' APPLIED ',
            position: 1,
          },
          {
            id: '018f0f64-2d8a-7f0b-8000-000000000006',
            name: ' INTERVIEW ',
            position: 3,
          },
        ],
      })
      .expect(200);

    expect(pipelinesService.update).toHaveBeenCalledWith(ownerId, pipelineId, {
      name: 'Hiring process',
      stages: [
        {
          id: publicPipeline.stages[1].id,
          name: 'Screening',
          position: 2,
        },
        {
          id: publicPipeline.stages[0].id,
          name: 'Applied',
          position: 1,
        },
        {
          id: '018f0f64-2d8a-7f0b-8000-000000000006',
          name: 'Interview',
          position: 3,
        },
      ],
    });
  });

  it('validates JSON, Origin/CSRF, UUIDs, pagination, nested payloads, and empty PATCH bodies', async () => {
    await authenticatedRequest('post', '/api/pipelines', ownerId)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(validCreate()))
      .expect(415);
    await request(app.getHttpServer())
      .post('/api/pipelines')
      .set('Cookie', `session=${sessionFor(ownerId)}`)
      .send(validCreate())
      .expect(403);
    await authenticatedRequest('post', '/api/pipelines', ownerId)
      .send({
        ...validCreate(),
        stages: [{ name: 'Applied', position: 'first' }],
      })
      .expect(400)
      .expect((response) =>
        expect(response.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'stages.0.position' }),
          ]),
        ),
      );
    await authenticatedRequest('post', '/api/pipelines', ownerId)
      .send({ ...validCreate(), userId: otherOwnerId })
      .expect(400);
    await authenticatedRequest('get', '/api/pipelines?foo=bar', ownerId).expect(
      400,
    );
    await authenticatedRequest('get', '/api/pipelines?page=01', ownerId).expect(
      400,
    );
    await authenticatedRequest(
      'get',
      `/api/pipelines/not-a-uuid`,
      ownerId,
    ).expect(400);
    await authenticatedRequest('patch', `/api/pipelines/${pipelineId}`, ownerId)
      .send({})
      .expect(400)
      .expect((response) => expect(response.body.errors[0].field).toBe('body'));
  });

  it('exposes Default through the normal paginated list and detail routes', async () => {
    pipelinesService.findAll.mockResolvedValue({
      pipelines: [publicPipeline],
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });
    pipelinesService.findOne.mockResolvedValue(publicPipeline);

    await authenticatedRequest('get', '/api/pipelines', ownerId)
      .expect(200)
      .expect({
        pipelines: [publicPipeline],
        page: 1,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
      });
    await authenticatedRequest('get', `/api/pipelines/${pipelineId}`, ownerId)
      .expect(200)
      .expect(publicPipeline);
    expect(pipelinesService.findAll).toHaveBeenCalledWith(ownerId, {
      page: 1,
      pageSize: 10,
    });
    expect(pipelinesService.findOne).toHaveBeenCalledWith(ownerId, pipelineId);
  });

  it('passes the authenticated owner to detail, PATCH, and DELETE without exposing another recruiter resource', async () => {
    const notFound = new NotFoundException({
      statusCode: 404,
      code: 'PIPELINE_NOT_FOUND',
      message: 'Pipeline not found',
    });
    pipelinesService.findOne.mockRejectedValue(notFound);
    pipelinesService.update.mockRejectedValue(notFound);
    pipelinesService.remove.mockRejectedValue(notFound);

    await authenticatedRequest(
      'get',
      `/api/pipelines/${pipelineId}`,
      otherOwnerId,
    ).expect(404);
    await authenticatedRequest(
      'patch',
      `/api/pipelines/${pipelineId}`,
      otherOwnerId,
    )
      .send({ name: 'Other' })
      .expect(404);
    await authenticatedRequest(
      'delete',
      `/api/pipelines/${pipelineId}`,
      otherOwnerId,
    ).expect(404);
    expect(pipelinesService.findOne).toHaveBeenCalledWith(
      otherOwnerId,
      pipelineId,
    );
    expect(pipelinesService.update).toHaveBeenCalledWith(
      otherOwnerId,
      pipelineId,
      { name: 'Other' },
    );
    expect(pipelinesService.remove).toHaveBeenCalledWith(
      otherOwnerId,
      pipelineId,
    );
  });

  it('returns the approved editability conflict for PATCH and DELETE', async () => {
    const notEditable = new ConflictException({
      statusCode: 409,
      code: 'PIPELINE_NOT_EDITABLE',
      message: 'This pipeline can no longer be modified',
    });
    pipelinesService.update.mockRejectedValue(notEditable);
    pipelinesService.remove.mockRejectedValue(notEditable);

    await authenticatedRequest('patch', `/api/pipelines/${pipelineId}`, ownerId)
      .send({ name: 'Other' })
      .expect(409)
      .expect({
        statusCode: 409,
        code: 'PIPELINE_NOT_EDITABLE',
        message: 'This pipeline can no longer be modified',
      });
    await authenticatedRequest(
      'delete',
      `/api/pipelines/${pipelineId}`,
      ownerId,
    )
      .expect(409)
      .expect({
        statusCode: 409,
        code: 'PIPELINE_NOT_EDITABLE',
        message: 'This pipeline can no longer be modified',
      });
  });

  it('returns the public Pipeline for PATCH and 204 without a body for DELETE', async () => {
    const updated = {
      ...publicPipeline,
      name: 'Hiring',
      isDefault: false,
      isEditable: true,
    };
    pipelinesService.update.mockResolvedValue(updated);
    pipelinesService.remove.mockResolvedValue(undefined);

    await authenticatedRequest('patch', `/api/pipelines/${pipelineId}`, ownerId)
      .send({ name: 'hiring' })
      .expect(200)
      .expect(updated);
    await authenticatedRequest(
      'delete',
      `/api/pipelines/${pipelineId}`,
      ownerId,
    )
      .expect(204)
      .expect('');
  });

  function sessionFor(userId: string): string {
    return jwtService.sign({ sub: userId });
  }

  function authenticatedRequest(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    userId: string,
  ) {
    return protectedRequest(method, path).set(
      'Cookie',
      `session=${sessionFor(userId)}`,
    );
  }

  function protectedRequest(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
  ) {
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
  return {
    name: 'Hiring',
    stages: [
      { name: 'Applied', position: 1 },
      { name: 'Screening', position: 2 },
      { name: 'Interview', position: 3 },
    ],
  };
}
