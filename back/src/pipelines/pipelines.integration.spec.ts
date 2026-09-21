import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { PrismaService } from '../prisma/prisma.service';
import { PipelinesService } from './pipelines.service';

const TESTCONTAINERS_LIFECYCLE_TIMEOUT_MS = 60_000;

describe('Pipelines PostgreSQL integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let service: PipelinesService;
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
    service = new PipelinesService(prisma as PrismaService);
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

  it('creates normalized ordered custom pipelines and isolates each recruiter collection', async () => {
    const first = await recruiter('first@example.com');
    const second = await recruiter('second@example.com');
    const firstPipeline = await service.create(first.id, {
      name: '  zEBRA  ',
      stages: [
        { name: ' interview ', position: 3 },
        { name: ' applied ', position: 1 },
        { name: ' screening ', position: 2 },
      ],
    });
    await service.create(first.id, {
      name: 'alpha',
      stages: stages(['One', 'Two', 'Three']),
    });
    await service.create(second.id, {
      name: 'other',
      stages: stages(['One', 'Two', 'Three']),
    });
    await prisma.pipeline.create({
      data: {
        userId: first.id,
        name: 'Default',
        isDefault: true,
        stages: { create: stages(['Applied', 'Screening', 'Interview']) },
      },
    });

    expect(firstPipeline).toMatchObject({
      name: 'Zebra',
      isDefault: false,
      isEditable: true,
      stages: [
        { name: 'Applied', position: 1 },
        { name: 'Screening', position: 2 },
        { name: 'Interview', position: 3 },
      ],
    });
    await expect(
      service.findAll(first.id, { page: 1, pageSize: 10 }),
    ).resolves.toMatchObject({
      pipelines: [
        { name: 'Default', isDefault: true, isEditable: false },
        { name: 'Alpha' },
        { name: 'Zebra' },
      ],
    });
    await expect(
      service.findAll(second.id, { page: 1, pageSize: 10 }),
    ).resolves.toMatchObject({
      pipelines: [{ name: 'Other' }],
    });
    await expect(
      service.findOne(second.id, firstPipeline.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not let another recruiter update or delete a Pipeline', async () => {
    const owner = await recruiter('owner-mutations@example.com');
    const otherRecruiter = await recruiter('other-mutations@example.com');
    const pipeline = await service.create(owner.id, {
      name: 'Hiring',
      stages: stages(['Applied', 'Screening', 'Interview']),
    });

    await expect(
      service.update(otherRecruiter.id, pipeline.id, { name: 'Changed' }),
    ).rejects.toMatchObject({
      response: { statusCode: 404, code: 'PIPELINE_NOT_FOUND' },
    });
    await expect(
      service.remove(otherRecruiter.id, pipeline.id),
    ).rejects.toMatchObject({
      response: { statusCode: 404, code: 'PIPELINE_NOT_FOUND' },
    });

    const persisted = await prisma.pipeline.findUniqueOrThrow({
      where: { id: pipeline.id },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    expect(persisted).toMatchObject({
      userId: owner.id,
      name: 'Hiring',
      deletedAt: null,
      stages: [
        { id: pipeline.stages[0].id, name: 'Applied', position: 1 },
        { id: pipeline.stages[1].id, name: 'Screening', position: 2 },
        { id: pipeline.stages[2].id, name: 'Interview', position: 3 },
      ],
    });
  });

  it('rejects an active duplicate Pipeline name without creating additional records', async () => {
    const owner = await recruiter('duplicate-create@example.com');
    const existing = await service.create(owner.id, {
      name: 'Hiring',
      stages: stages(['Applied', 'Screening', 'Interview']),
    });

    await expect(
      service.create(owner.id, {
        name: '  hIRING  ',
        stages: stages(['One', 'Two', 'Three']),
      }),
    ).rejects.toMatchObject({
      response: { statusCode: 409, code: 'PIPELINE_NAME_CONFLICT' },
    });
    expect(await prisma.pipeline.count({ where: { userId: owner.id } })).toBe(
      1,
    );
    expect(
      await prisma.pipelineStage.count({ where: { pipelineId: existing.id } }),
    ).toBe(3);
  });

  it('synchronizes stage creations, updates, removals, renames, and reordering atomically', async () => {
    const owner = await recruiter('sync@example.com');
    const pipeline = await service.create(owner.id, {
      name: 'Hiring',
      stages: stages(['Applied', 'Screening', 'Interview']),
    });
    const [applied, screening, interview] = pipeline.stages;

    const updated = await service.update(owner.id, pipeline.id, {
      stages: [
        { id: interview.id, name: 'Applied', position: 1 },
        { id: applied.id, name: 'Screening', position: 2 },
        { name: 'Hired', position: 3 },
      ],
    });

    expect(updated.stages).toEqual([
      { id: interview.id, name: 'Applied', position: 1 },
      { id: applied.id, name: 'Screening', position: 2 },
      expect.objectContaining({ name: 'Hired', position: 3 }),
    ]);
    expect(updated.stages.map(({ id }) => id)).not.toContain(screening.id);
    await expect(
      prisma.pipelineStage.create({
        data: { pipelineId: pipeline.id, name: 'Applied', position: 4 },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rolls back a failed stage synchronization and never applies an external stage id', async () => {
    const owner = await recruiter('rollback@example.com');
    const otherOwner = await recruiter('other-rollback@example.com');
    const first = await service.create(owner.id, {
      name: 'First',
      stages: stages(['One', 'Two', 'Three']),
    });
    const second = await service.create(otherOwner.id, {
      name: 'Second',
      stages: stages(['Four', 'Five', 'Six']),
    });

    await expect(
      service.update(owner.id, first.id, {
        stages: [
          { id: first.stages[0].id, name: 'Changed', position: 1 },
          { id: first.stages[1].id, name: 'Two', position: 2 },
          { id: second.stages[0].id, name: 'Three', position: 3 },
        ],
      }),
    ).rejects.toMatchObject({
      response: { statusCode: 404, code: 'PIPELINE_STAGE_NOT_FOUND' },
    });
    await expect(service.findOne(owner.id, first.id)).resolves.toMatchObject({
      stages: [
        { id: first.stages[0].id, name: 'One', position: 1 },
        { id: first.stages[1].id, name: 'Two', position: 2 },
        { id: first.stages[2].id, name: 'Three', position: 3 },
      ],
    });
  });

  it('rolls back stage writes when a later Pipeline name conflict aborts PATCH', async () => {
    const owner = await recruiter('transaction-rollback@example.com');
    const pipeline = await service.create(owner.id, {
      name: 'First',
      stages: stages(['One', 'Two', 'Three']),
    });
    await service.create(owner.id, {
      name: 'Taken',
      stages: stages(['Four', 'Five', 'Six']),
    });

    await expect(
      service.update(owner.id, pipeline.id, {
        name: 'taken',
        stages: [
          { id: pipeline.stages[2].id, name: 'Three', position: 1 },
          { id: pipeline.stages[1].id, name: 'Two', position: 2 },
          { id: pipeline.stages[0].id, name: 'One', position: 3 },
        ],
      }),
    ).rejects.toMatchObject({
      response: { statusCode: 409, code: 'PIPELINE_NAME_CONFLICT' },
    });
    await expect(service.findOne(owner.id, pipeline.id)).resolves.toMatchObject(
      {
        name: 'First',
        stages: [
          { id: pipeline.stages[0].id, name: 'One', position: 1 },
          { id: pipeline.stages[1].id, name: 'Two', position: 2 },
          { id: pipeline.stages[2].id, name: 'Three', position: 3 },
        ],
      },
    );
  });

  it('soft deletes editable custom pipelines and allows their normalized name to be reused', async () => {
    const owner = await recruiter('soft-delete@example.com');
    const deleted = await service.create(owner.id, {
      name: '  hiring  ',
      stages: stages(['One', 'Two', 'Three']),
    });

    await expect(service.remove(owner.id, deleted.id)).resolves.toBeUndefined();
    await expect(service.findOne(owner.id, deleted.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.findAll(owner.id, { page: 2, pageSize: 10 }),
    ).resolves.toMatchObject({
      pipelines: [],
      page: 2,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
    });
    await expect(
      service.create(owner.id, {
        name: 'HIRING',
        stages: stages(['Four', 'Five', 'Six']),
      }),
    ).resolves.toMatchObject({ name: 'Hiring' });
    expect(await prisma.pipeline.count({ where: { userId: owner.id } })).toBe(
      2,
    );
  });

  it('keeps only the Pipeline associated with a Vacancy permanently non-editable', async () => {
    const owner = await recruiter('associated@example.com');
    const otherOwner = await recruiter('other-associated@example.com');
    const associated = await service.create(owner.id, {
      name: 'Associated',
      stages: stages(['One', 'Two', 'Three']),
    });
    const independent = await service.create(otherOwner.id, {
      name: 'Independent',
      stages: stages(['One', 'Two', 'Three']),
    });
    const vacancy = await prisma.vacancy.create({
      data: {
        userId: owner.id,
        pipelineId: associated.id,
        title: 'Role',
        companyName: 'Company',
        description: 'Description',
        status: 'DRAFT',
      },
    });
    await prisma.vacancy.update({
      where: { id: vacancy.id },
      data: { status: 'FILLED' },
    });

    await expect(
      service.findOne(owner.id, associated.id),
    ).resolves.toMatchObject({
      isEditable: false,
    });
    await expect(
      service.update(owner.id, associated.id, { name: 'Changed' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.remove(owner.id, associated.id),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.update(otherOwner.id, independent.id, { name: 'Changed' }),
    ).resolves.toMatchObject({
      name: 'Changed',
      isEditable: true,
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
});

function stages(names: string[]) {
  return names.map((name, index) => ({ name, position: index + 1 }));
}
