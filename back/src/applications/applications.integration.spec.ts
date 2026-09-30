import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { PrismaService } from '../prisma/prisma.service';

const TESTCONTAINERS_LIFECYCLE_TIMEOUT_MS = 60_000;

interface ApplicationsServiceContract {
  create(
    userId: string,
    dto: CreateApplicationInput,
  ): Promise<PublicApplication>;
  findAll(
    userId: string,
    query: ApplicationListQuery,
  ): Promise<ApplicationPage>;
  findOne(userId: string, id: string): Promise<PublicApplication>;
  update(
    userId: string,
    id: string,
    dto: UpdateApplicationInput,
  ): Promise<PublicApplication>;
  remove(userId: string, id: string): Promise<void>;
}

interface CreateApplicationInput {
  candidateId: string;
  vacancyId: string;
}

interface UpdateApplicationInput {
  currentStageId: string;
}

interface ApplicationListQuery {
  page: number;
  pageSize: number;
}

interface PublicApplication {
  id: string;
  candidate: { id: string };
  vacancy: { id: string };
  currentStage: { id: string; position: number };
}

interface ApplicationPage {
  applications: Array<{ id: string }>;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

describe('Applications PostgreSQL integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let applicationsService: ApplicationsServiceContract;
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
    applicationsService = createApplicationsService(prisma as PrismaService);
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

  it('persists the authenticated recruiter application in the Vacancy stage at position 1', async () => {
    const fixture = await createOpenApplicationFixture(prisma, 'persisted');

    const created = await applicationsService.create(fixture.owner.id, {
      candidateId: fixture.candidate.id,
      vacancyId: fixture.vacancy.id,
    });

    const persisted = await prisma.application.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(persisted).toMatchObject({
      candidateId: fixture.candidate.id,
      vacancyId: fixture.vacancy.id,
      currentStageId: fixture.firstStage.id,
      deletedAt: null,
    });
    expect(created).toMatchObject({
      candidate: { id: fixture.candidate.id },
      vacancy: { id: fixture.vacancy.id },
      currentStage: { id: fixture.firstStage.id, position: 1 },
    });
  });

  it('uses the real partial unique index so concurrent active creations leave exactly one Application', async () => {
    const fixture = await createOpenApplicationFixture(prisma, 'unique');
    const input = {
      candidateId: fixture.candidate.id,
      vacancyId: fixture.vacancy.id,
    };

    const results = await Promise.allSettled([
      applicationsService.create(fixture.owner.id, input),
      applicationsService.create(fixture.owner.id, input),
    ]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<PublicApplication> =>
        result.status === 'fulfilled',
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      response: {
        statusCode: 409,
        code: 'APPLICATION_ALREADY_EXISTS',
        message:
          'An active application already exists for this candidate and vacancy',
      },
    });
    await expect(
      prisma.application.findMany({
        where: {
          candidateId: fixture.candidate.id,
          vacancyId: fixture.vacancy.id,
          deletedAt: null,
        },
      }),
    ).resolves.toHaveLength(1);
  });

  it('excludes a soft-deleted Application and permits a new active Application for the same combination', async () => {
    const fixture = await createOpenApplicationFixture(prisma, 'soft-delete');
    const first = await applicationsService.create(fixture.owner.id, {
      candidateId: fixture.candidate.id,
      vacancyId: fixture.vacancy.id,
    });

    await expect(
      applicationsService.remove(fixture.owner.id, first.id),
    ).resolves.toBeUndefined();
    await expect(
      prisma.application.findUniqueOrThrow({ where: { id: first.id } }),
    ).resolves.toMatchObject({ deletedAt: expect.any(Date) });
    await expect(
      applicationsService.findOne(fixture.owner.id, first.id),
    ).rejects.toMatchObject({
      response: {
        statusCode: 404,
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      },
    });

    const replacement = await applicationsService.create(fixture.owner.id, {
      candidateId: fixture.candidate.id,
      vacancyId: fixture.vacancy.id,
    });
    await expect(
      applicationsService.findAll(fixture.owner.id, { page: 1, pageSize: 10 }),
    ).resolves.toMatchObject({
      applications: [{ id: replacement.id }],
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });
    await expect(
      prisma.application.findMany({
        where: {
          candidateId: fixture.candidate.id,
          vacancyId: fixture.vacancy.id,
          deletedAt: null,
        },
      }),
    ).resolves.toHaveLength(1);
  });

  it('persists non-adjacent movement and a later move backwards within the Vacancy Pipeline', async () => {
    const fixture = await createOpenApplicationFixture(prisma, 'free-movement');
    const created = await applicationsService.create(fixture.owner.id, {
      candidateId: fixture.candidate.id,
      vacancyId: fixture.vacancy.id,
    });

    const jumped = await applicationsService.update(fixture.owner.id, created.id, {
      currentStageId: fixture.thirdStage.id,
    });
    expect(jumped.currentStage).toMatchObject({
      id: fixture.thirdStage.id,
      position: 3,
    });
    await expect(
      prisma.application.findUniqueOrThrow({ where: { id: created.id } }),
    ).resolves.toMatchObject({ currentStageId: fixture.thirdStage.id });

    const movedBack = await applicationsService.update(
      fixture.owner.id,
      created.id,
      { currentStageId: fixture.firstStage.id },
    );
    expect(movedBack.currentStage).toMatchObject({
      id: fixture.firstStage.id,
      position: 1,
    });
    await expect(
      prisma.application.findUniqueOrThrow({ where: { id: created.id } }),
    ).resolves.toMatchObject({ currentStageId: fixture.firstStage.id });
  });

  it('rejects an existing stage from another Pipeline without changing the Application', async () => {
    const fixture = await createOpenApplicationFixture(prisma, 'other-pipeline');
    const created = await applicationsService.create(fixture.owner.id, {
      candidateId: fixture.candidate.id,
      vacancyId: fixture.vacancy.id,
    });
    const otherPipeline = await prisma.pipeline.create({
      data: {
        userId: fixture.owner.id,
        name: 'Other pipeline',
        isDefault: false,
        stages: {
          create: [
            { name: 'Other applied', position: 1 },
            { name: 'Other screening', position: 2 },
            { name: 'Other interview', position: 3 },
          ],
        },
      },
      include: { stages: true },
    });
    const otherStage = otherPipeline.stages.find(
      (stage) => stage.position === 1,
    );
    if (!otherStage) {
      throw new Error('Fixture must contain an other-Pipeline stage at position 1');
    }

    await expect(
      applicationsService.update(fixture.owner.id, created.id, {
        currentStageId: otherStage.id,
      }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
      },
    });
    await expect(
      prisma.application.findUniqueOrThrow({ where: { id: created.id } }),
    ).resolves.toMatchObject({ currentStageId: fixture.firstStage.id });
  });
});

async function createOpenApplicationFixture(
  prisma: PrismaClient,
  suffix: string,
) {
  const owner = await prisma.user.create({
    data: {
      firstName: 'Recruiter',
      lastName: 'Test',
      email: `applications-${suffix}@example.com`,
      passwordHash: 'not-used-in-test',
    },
  });
  const candidate = await prisma.candidate.create({
    data: {
      userId: owner.id,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: `ada-${suffix}@example.com`,
      phone: null,
    },
  });
  const pipeline = await prisma.pipeline.create({
    data: {
      userId: owner.id,
      name: `Hiring ${suffix}`,
      isDefault: false,
      stages: {
        create: [
          { name: 'Interview', position: 3 },
          { name: 'Applied', position: 1 },
          { name: 'Screening', position: 2 },
        ],
      },
    },
    include: { stages: true },
  });
  const vacancy = await prisma.vacancy.create({
    data: {
      userId: owner.id,
      pipelineId: pipeline.id,
      title: 'Backend engineer',
      companyName: 'RecruitLane',
      description: 'Build useful things',
      status: 'OPEN',
    },
  });
  const firstStage = pipeline.stages.find((stage) => stage.position === 1);
  const thirdStage = pipeline.stages.find((stage) => stage.position === 3);
  if (!firstStage || !thirdStage) {
    throw new Error('Fixture must contain stages at positions 1 and 3');
  }

  return { owner, candidate, vacancy, firstStage, thirdStage };
}

function createApplicationsService(
  prisma: PrismaService,
): ApplicationsServiceContract {
  // The production Service is deliberately absent during RED. Runtime loading
  // keeps this suite type-correct while making that absence the expected failure.
  const { ApplicationsService } = require('./applications.service') as {
    ApplicationsService: new (
      prismaService: PrismaService,
    ) => ApplicationsServiceContract;
  };
  return new ApplicationsService(prisma);
}
