import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { PipelinesService } from '../pipelines/pipelines.service';
import { PrismaService } from '../prisma/prisma.service';

const TESTCONTAINERS_LIFECYCLE_TIMEOUT_MS = 60_000;

interface VacancyServiceContract {
  create(userId: string, dto: VacancyInput): Promise<PublicVacancy>;
  findAll(userId: string, pagination: VacancyListQuery): Promise<VacancyPage>;
  findOne(userId: string, id: string): Promise<PublicVacancy>;
  update(
    userId: string,
    id: string,
    dto: UpdateVacancyInput,
  ): Promise<PublicVacancy>;
}

type VacancyStatus = 'DRAFT' | 'OPEN' | 'FILLED' | 'CANCELLED';

interface VacancyInput {
  title: string;
  companyName: string;
  description: string;
  pipelineId: string;
}

type UpdateVacancyInput =
  | Partial<Pick<VacancyInput, 'title' | 'companyName' | 'description'>>
  | { status: VacancyStatus };

interface VacancyListQuery {
  page: number;
  pageSize: number;
  status?: VacancyStatus[];
  title?: string;
}

interface PublicVacancy {
  id: string;
  title: string;
  companyName: string;
  description: string;
  status: string;
  pipeline: {
    name: string;
    stages: Array<{ id: string; name: string; position: number }>;
  };
}

interface PublicVacancySummary {
  id: string;
  title: string;
  status: string;
}

interface VacancyPage {
  vacancies: PublicVacancySummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

describe('Vacancies PostgreSQL integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let vacanciesService: VacancyServiceContract;
  let pipelinesService: PipelinesService;
  let originalDatabaseUrl: string | undefined;

  beforeAll(async () => {
    originalDatabaseUrl = process.env.DATABASE_URL;
    container = await new PostgreSqlContainer('postgres:18.6-alpine3.24')
      .withDatabase('recruitlane')
      .start();
    process.env.DATABASE_URL = container.getConnectionUri();
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: resolve(__dirname, '../..'),
      env: process.env,
      stdio: 'pipe',
    });
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    await prisma.$connect();
    vacanciesService = createVacanciesService(prisma as PrismaService);
    pipelinesService = new PipelinesService(prisma as PrismaService);
  }, TESTCONTAINERS_LIFECYCLE_TIMEOUT_MS);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }, TESTCONTAINERS_LIFECYCLE_TIMEOUT_MS);

  afterEach(async () => {
    await prisma?.application.deleteMany();
    await prisma?.vacancy.deleteMany();
    await prisma?.pipelineStage.deleteMany();
    await prisma?.pipeline.deleteMany();
    await prisma?.candidate.deleteMany();
    await prisma?.user.deleteMany();
  });

  it('persists DRAFT with its active own Pipeline, returns ordered stages, and makes that custom Pipeline non-editable', async () => {
    const owner = await recruiter('owner-create@example.com');
    const pipeline = await customPipeline(owner.id, 'Hiring');

    const created = await vacanciesService.create(owner.id, {
      title: 'Engineer',
      companyName: 'RecruitLane',
      description: 'Build useful things',
      pipelineId: pipeline.id,
    });

    expect(created).toMatchObject({
      title: 'Engineer',
      companyName: 'RecruitLane',
      description: 'Build useful things',
      status: 'DRAFT',
      pipeline: {
        name: 'Hiring',
        stages: [
          { name: 'Applied', position: 1 },
          { name: 'Screening', position: 2 },
          { name: 'Interview', position: 3 },
        ],
      },
    });
    const persisted = await prisma.vacancy.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(persisted).toMatchObject({
      userId: owner.id,
      pipelineId: pipeline.id,
      status: 'DRAFT',
    });
    await expect(
      pipelinesService.findOne(owner.id, pipeline.id),
    ).resolves.toMatchObject({
      isEditable: false,
    });
    await expect(
      pipelinesService.update(owner.id, pipeline.id, { name: 'Changed' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('isolates listing, detail, and update between recruiters', async () => {
    const owner = await recruiter('owner-isolation@example.com');
    const other = await recruiter('other-isolation@example.com');
    const ownerPipeline = await customPipeline(owner.id, 'Owner hiring');
    const created = await vacanciesService.create(owner.id, {
      title: 'Owner role',
      companyName: 'RecruitLane',
      description: 'Private role',
      pipelineId: ownerPipeline.id,
    });

    await expect(
      vacanciesService.findAll(owner.id, { page: 1, pageSize: 10 }),
    ).resolves.toMatchObject({
      vacancies: [{ id: created.id, title: 'Owner role' }],
    });
    await expect(
      vacanciesService.findAll(other.id, { page: 1, pageSize: 10 }),
    ).resolves.toMatchObject({ vacancies: [] });
    await expect(
      vacanciesService.findOne(other.id, created.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      vacanciesService.update(other.id, created.id, { title: 'Leaked' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      prisma.vacancy.findUniqueOrThrow({ where: { id: created.id } }),
    ).resolves.toMatchObject({
      title: 'Owner role',
    });
  });

  it('updates descriptive fields in a non-DRAFT fixture without changing status or Pipeline', async () => {
    const owner = await recruiter('owner-descriptive-update@example.com');
    const pipeline = await customPipeline(owner.id, 'Filled hiring');
    const fixture = await prisma.vacancy.create({
      data: {
        userId: owner.id,
        pipelineId: pipeline.id,
        title: 'Original title',
        companyName: 'Original company',
        description: 'Original description',
        status: 'FILLED',
      },
    });

    await expect(
      vacanciesService.update(owner.id, fixture.id, {
        title: 'Updated title',
        description: 'Updated description',
      }),
    ).resolves.toMatchObject({
      id: fixture.id,
      title: 'Updated title',
      companyName: 'Original company',
      description: 'Updated description',
      status: 'FILLED',
      pipeline: { name: 'Filled hiring' },
    });
    await expect(
      prisma.vacancy.findUniqueOrThrow({ where: { id: fixture.id } }),
    ).resolves.toMatchObject({
      pipelineId: pipeline.id,
      status: 'FILLED',
      title: 'Updated title',
      description: 'Updated description',
    });
  });

  it('does not allow a soft-deleted Pipeline to be selected for a new Vacancy', async () => {
    const owner = await recruiter('owner-deleted-pipeline@example.com');
    const pipeline = await customPipeline(owner.id, 'Archived hiring');
    await pipelinesService.remove(owner.id, pipeline.id);

    await expect(
      vacanciesService.create(owner.id, {
        title: 'Engineer',
        companyName: 'RecruitLane',
        description: 'Build useful things',
        pipelineId: pipeline.id,
      }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 404,
        code: 'PIPELINE_NOT_FOUND',
        message: 'Pipeline not found',
      },
    });
    expect(await prisma.vacancy.count({ where: { userId: owner.id } })).toBe(0);
  });

  it('persists an allowed Vacancy status transition', async () => {
    const owner = await recruiter('owner-status-transition@example.com');
    const pipeline = await customPipeline(owner.id, 'Lifecycle hiring');
    const fixture = await prisma.vacancy.create({
      data: {
        userId: owner.id,
        pipelineId: pipeline.id,
        title: 'Draft role',
        companyName: 'RecruitLane',
        description: 'A draft vacancy',
        status: 'DRAFT',
      },
    });

    await expect(
      vacanciesService.update(owner.id, fixture.id, { status: 'OPEN' }),
    ).resolves.toMatchObject({ id: fixture.id, status: 'OPEN' });
    await expect(
      prisma.vacancy.findUniqueOrThrow({ where: { id: fixture.id } }),
    ).resolves.toMatchObject({ status: 'OPEN' });
  });

  it('rejects a prohibited status transition without changing PostgreSQL state', async () => {
    const owner = await recruiter('owner-prohibited-transition@example.com');
    const pipeline = await customPipeline(owner.id, 'Draft lifecycle hiring');
    const fixture = await prisma.vacancy.create({
      data: {
        userId: owner.id,
        pipelineId: pipeline.id,
        title: 'Draft role',
        companyName: 'RecruitLane',
        description: 'A draft vacancy',
        status: 'DRAFT',
      },
    });

    await expect(
      vacanciesService.update(owner.id, fixture.id, { status: 'FILLED' }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: 'VACANCY_NOT_OPEN',
        message: 'The vacancy does not allow this operation',
      },
    });
    await expect(
      prisma.vacancy.findUniqueOrThrow({ where: { id: fixture.id } }),
    ).resolves.toMatchObject({ status: 'DRAFT' });
  });

  it('returns the current Vacancy for a status no-op', async () => {
    const owner = await recruiter('owner-status-noop@example.com');
    const pipeline = await customPipeline(
      owner.id,
      'Cancelled lifecycle hiring',
    );
    const fixture = await prisma.vacancy.create({
      data: {
        userId: owner.id,
        pipelineId: pipeline.id,
        title: 'Cancelled role',
        companyName: 'RecruitLane',
        description: 'A cancelled vacancy',
        status: 'CANCELLED',
      },
    });

    await expect(
      vacanciesService.update(owner.id, fixture.id, { status: 'CANCELLED' }),
    ).resolves.toMatchObject({ id: fixture.id, status: 'CANCELLED' });
    await expect(
      prisma.vacancy.findUniqueOrThrow({ where: { id: fixture.id } }),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
  });

  it('filters multiple statuses with OR semantics and preserves Recruiter isolation', async () => {
    const owner = await recruiter('owner-status-filter@example.com');
    const other = await recruiter('other-status-filter@example.com');
    const ownerPipeline = await customPipeline(owner.id, 'Owner filter hiring');
    const otherPipeline = await customPipeline(other.id, 'Other filter hiring');
    const [draft, open, filled] = await Promise.all([
      prisma.vacancy.create({
        data: {
          userId: owner.id,
          pipelineId: ownerPipeline.id,
          title: 'Draft role',
          companyName: 'RecruitLane',
          description: 'A draft vacancy',
          status: 'DRAFT',
          createdAt: new Date('2026-01-01T10:00:00.000Z'),
        },
      }),
      prisma.vacancy.create({
        data: {
          userId: owner.id,
          pipelineId: ownerPipeline.id,
          title: 'Open role',
          companyName: 'RecruitLane',
          description: 'An open vacancy',
          status: 'OPEN',
          createdAt: new Date('2026-01-03T10:00:00.000Z'),
        },
      }),
      prisma.vacancy.create({
        data: {
          userId: owner.id,
          pipelineId: ownerPipeline.id,
          title: 'Filled role',
          companyName: 'RecruitLane',
          description: 'A filled vacancy',
          status: 'FILLED',
          createdAt: new Date('2026-01-02T10:00:00.000Z'),
        },
      }),
    ]);
    await prisma.vacancy.create({
      data: {
        userId: other.id,
        pipelineId: otherPipeline.id,
        title: 'Other open role',
        companyName: 'RecruitLane',
        description: 'An isolated open vacancy',
        status: 'OPEN',
        createdAt: new Date('2026-01-04T10:00:00.000Z'),
      },
    });

    await expect(
      vacanciesService.findAll(owner.id, {
        page: 1,
        pageSize: 10,
        status: ['OPEN', 'FILLED'],
      }),
    ).resolves.toMatchObject({
      vacancies: [
        { id: open.id, status: 'OPEN' },
        { id: filled.id, status: 'FILLED' },
      ],
      page: 1,
      pageSize: 10,
      totalItems: 2,
      totalPages: 1,
    });
    expect(draft.id).toBeDefined();
  });

  it('orders the owner collection globally before pagination by status, case-insensitive title, and id', async () => {
    const owner = await recruiter('owner-list-order@example.com');
    const other = await recruiter('other-list-order@example.com');
    const ownerPipeline = await customPipeline(owner.id, 'Owner list order');
    const otherPipeline = await customPipeline(other.id, 'Other list order');
    const fixtures: Array<{
      id: string;
      status: VacancyStatus;
      title: string;
    }> = [
      {
        id: '018f0f64-2d8a-7f0b-8000-000000000101',
        status: 'OPEN',
        title: 'alpha',
      },
      {
        id: '018f0f64-2d8a-7f0b-8000-000000000102',
        status: 'OPEN',
        title: 'ALPHA',
      },
      {
        id: '018f0f64-2d8a-7f0b-8000-000000000103',
        status: 'OPEN',
        title: 'Alpha',
      },
      {
        id: '018f0f64-2d8a-7f0b-8000-000000000104',
        status: 'OPEN',
        title: 'beta',
      },
      {
        id: '018f0f64-2d8a-7f0b-8000-000000000105',
        status: 'DRAFT',
        title: 'alpha',
      },
      {
        id: '018f0f64-2d8a-7f0b-8000-000000000106',
        status: 'DRAFT',
        title: 'beta',
      },
      {
        id: '018f0f64-2d8a-7f0b-8000-000000000107',
        status: 'FILLED',
        title: 'alpha',
      },
      {
        id: '018f0f64-2d8a-7f0b-8000-000000000108',
        status: 'FILLED',
        title: 'beta',
      },
      {
        id: '018f0f64-2d8a-7f0b-8000-000000000109',
        status: 'CANCELLED',
        title: 'alpha',
      },
      {
        id: '018f0f64-2d8a-7f0b-8000-000000000110',
        status: 'CANCELLED',
        title: 'beta',
      },
      {
        id: '018f0f64-2d8a-7f0b-8000-000000000111',
        status: 'CANCELLED',
        title: 'zeta',
      },
    ];

    await Promise.all(
      fixtures.map(({ id, status, title }, index) =>
        prisma.vacancy.create({
          data: {
            id,
            userId: owner.id,
            pipelineId: ownerPipeline.id,
            title,
            companyName: 'RecruitLane',
            description: 'Ordered fixture',
            status,
            createdAt: new Date(
              `2026-01-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
            ),
          },
        }),
      ),
    );
    await prisma.vacancy.create({
      data: {
        id: '018f0f64-2d8a-7f0b-8000-000000000112',
        userId: other.id,
        pipelineId: otherPipeline.id,
        title: '000 private',
        companyName: 'RecruitLane',
        description: 'Invisible fixture',
        status: 'OPEN',
      },
    });

    const firstPage = await vacanciesService.findAll(owner.id, {
      page: 1,
      pageSize: 10,
    });
    const secondPage = await vacanciesService.findAll(owner.id, {
      page: 2,
      pageSize: 10,
    });

    expect(firstPage).toMatchObject({
      page: 1,
      pageSize: 10,
      totalItems: 11,
      totalPages: 2,
      vacancies: fixtures
        .slice(0, 10)
        .map(({ id, status, title }) => ({ id, status, title })),
    });
    expect(secondPage).toMatchObject({
      page: 2,
      pageSize: 10,
      totalItems: 11,
      totalPages: 2,
      vacancies: [fixtures[10]],
    });
  });

  it('filters title globally, treats SQL wildcard characters literally, combines it with status, and preserves owner isolation', async () => {
    const owner = await recruiter('owner-title-filter@example.com');
    const other = await recruiter('other-title-filter@example.com');
    const ownerPipeline = await customPipeline(owner.id, 'Owner title filter');
    const otherPipeline = await customPipeline(other.id, 'Other title filter');
    const literalOpen = await prisma.vacancy.create({
      data: {
        id: '018f0f64-2d8a-7f0b-8000-000000000201',
        userId: owner.id,
        pipelineId: ownerPipeline.id,
        title: '100%_ Match',
        companyName: 'RecruitLane',
        description: 'Literal wildcard fixture',
        status: 'OPEN',
      },
    });
    const wildcardLikeOpen = await prisma.vacancy.create({
      data: {
        id: '018f0f64-2d8a-7f0b-8000-000000000202',
        userId: owner.id,
        pipelineId: ownerPipeline.id,
        title: '100xa Match',
        companyName: 'RecruitLane',
        description: 'Wildcard lookalike fixture',
        status: 'OPEN',
      },
    });
    const literalDraft = await prisma.vacancy.create({
      data: {
        id: '018f0f64-2d8a-7f0b-8000-000000000203',
        userId: owner.id,
        pipelineId: ownerPipeline.id,
        title: '100%_ Draft',
        companyName: 'RecruitLane',
        description: 'Literal wildcard fixture',
        status: 'DRAFT',
      },
    });
    const literalFilled = await prisma.vacancy.create({
      data: {
        id: '018f0f64-2d8a-7f0b-8000-000000000204',
        userId: owner.id,
        pipelineId: ownerPipeline.id,
        title: '100%_ Filled',
        companyName: 'RecruitLane',
        description: 'Literal wildcard fixture',
        status: 'FILLED',
      },
    });
    await prisma.vacancy.create({
      data: {
        id: '018f0f64-2d8a-7f0b-8000-000000000205',
        userId: other.id,
        pipelineId: otherPipeline.id,
        title: '100%_ Private',
        companyName: 'RecruitLane',
        description: 'Invisible fixture',
        status: 'OPEN',
      },
    });

    await expect(
      vacanciesService.findAll(owner.id, {
        page: 1,
        pageSize: 10,
        title: '100%_',
      }),
    ).resolves.toMatchObject({
      vacancies: [
        { id: literalOpen.id, status: 'OPEN' },
        { id: literalDraft.id, status: 'DRAFT' },
        { id: literalFilled.id, status: 'FILLED' },
      ],
      page: 1,
      pageSize: 10,
      totalItems: 3,
      totalPages: 1,
    });
    await expect(
      vacanciesService.findAll(owner.id, {
        page: 1,
        pageSize: 10,
        status: ['OPEN', 'OPEN', 'FILLED'],
        title: 'mAtCh',
      }),
    ).resolves.toMatchObject({
      vacancies: [
        { id: literalOpen.id, status: 'OPEN' },
        { id: wildcardLikeOpen.id, status: 'OPEN' },
      ],
      page: 1,
      pageSize: 10,
      totalItems: 2,
      totalPages: 1,
    });
  });

  async function recruiter(email: string) {
    return prisma.user.create({
      data: {
        firstName: 'Recruiter',
        lastName: 'Test',
        email,
        passwordHash: 'not-used-in-test',
      },
    });
  }

  function customPipeline(userId: string, name: string) {
    return pipelinesService.create(userId, {
      name,
      stages: [
        { name: 'Applied', position: 1 },
        { name: 'Screening', position: 2 },
        { name: 'Interview', position: 3 },
      ],
    });
  }
});

function createVacanciesService(prisma: PrismaService): VacancyServiceContract {
  // The production module is deliberately absent during RED. Runtime loading
  // keeps this suite valid while making that absence the expected failure.
  const { VacanciesService } = require('./vacancies.service') as {
    VacanciesService: new (
      prismaService: PrismaService,
    ) => VacancyServiceContract;
  };
  return new VacanciesService(prisma);
}
