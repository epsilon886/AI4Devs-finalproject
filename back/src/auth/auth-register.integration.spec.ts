import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_STAGES = [
  { name: 'Applied', position: 1 },
  { name: 'Screening', position: 2 },
  { name: 'Interview', position: 3 },
  { name: 'Offer', position: 4 },
  { name: 'Hired', position: 5 },
  { name: 'Rejected', position: 6 },
];
const TESTCONTAINERS_LIFECYCLE_TIMEOUT_MS = 60_000;

describe('recruiter registration integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
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
  }, TESTCONTAINERS_LIFECYCLE_TIMEOUT_MS);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
    process.env.DATABASE_URL = originalDatabaseUrl;
  }, TESTCONTAINERS_LIFECYCLE_TIMEOUT_MS);

  afterEach(async () => {
    if (!prisma) {
      return;
    }

    await prisma.pipelineStage.deleteMany();
    await prisma.pipeline.deleteMany();
    await prisma.user.deleteMany();
  });

  it('creates the complete default setup and rejects a normalized duplicate email', async () => {
    const service = new AuthService(prisma as PrismaService);
    const plaintextPassword = '  fifteen chars  ';

    await service.register({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: '  ADA@Example.COM ',
      password: plaintextPassword,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'ada@example.com' },
      include: {
        pipelines: {
          include: { stages: { orderBy: { position: 'asc' } } },
        },
      },
    });

    expect(user.email).toBe('ada@example.com');
    expect(user.passwordHash).not.toBe(plaintextPassword);
    expect(user.pipelines).toHaveLength(1);
    expect(user.pipelines[0]).toMatchObject({
      name: 'Default',
      isDefault: true,
      stages: DEFAULT_STAGES,
    });

    await expect(
      service.register({
        firstName: 'Another',
        lastName: 'Recruiter',
        email: 'Ada@EXAMPLE.com',
        password: 'another secure password',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.pipeline.count()).toBe(1);
    expect(await prisma.pipelineStage.count()).toBe(6);
  });
});
