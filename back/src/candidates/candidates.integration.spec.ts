import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { PrismaService } from '../prisma/prisma.service';
import { CandidatesService } from './candidates.service';

const TESTCONTAINERS_LIFECYCLE_TIMEOUT_MS = 60_000;

describe('Candidates PostgreSQL integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let service: CandidatesService;
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
    service = new CandidatesService(prisma as PrismaService);
  }, TESTCONTAINERS_LIFECYCLE_TIMEOUT_MS);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }, TESTCONTAINERS_LIFECYCLE_TIMEOUT_MS);

  afterEach(async () => {
    await prisma?.candidate.deleteMany();
    await prisma?.user.deleteMany();
  });

  it('enforces normalized email uniqueness per recruiter while permitting another recruiter', async () => {
    const firstRecruiter = await recruiter('first@example.com');
    const secondRecruiter = await recruiter('second@example.com');
    await expect(
      service.create(firstRecruiter.id, {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: '  ADA@Example.COM ',
      }),
    ).resolves.toMatchObject({ email: 'ada@example.com', phone: null });

    await expect(
      service.create(firstRecruiter.id, {
        firstName: 'Another',
        lastName: 'Candidate',
        email: 'ada@example.com',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.create(secondRecruiter.id, {
        firstName: 'Independent',
        lastName: 'Candidate',
        email: 'ADA@example.com',
      }),
    ).resolves.toMatchObject({ email: 'ada@example.com' });

    await expect(
      service.findAll(firstRecruiter.id, { page: 1, pageSize: 10 }),
    ).resolves.toMatchObject({
      candidates: [{ firstName: 'Ada', lastName: 'Lovelace' }],
    });
    await expect(
      service.findAll(secondRecruiter.id, { page: 1, pageSize: 10 }),
    ).resolves.toMatchObject({
      candidates: [{ firstName: 'Independent', lastName: 'Candidate' }],
    });
  });

  it('uses PostgreSQL ordering that is case-insensitive by lastName then firstName', async () => {
    const owner = await recruiter('owner@example.com');
    for (const [firstName, lastName] of [
      ['zoe', 'alpha'],
      ['Ada', 'Alpha'],
      ['Bea', 'beta'],
      ['cara', 'Beta'],
    ]) {
      await service.create(owner.id, {
        firstName,
        lastName,
        email: `${firstName}@${lastName}.example.com`,
      });
    }

    const page = await service.findAll(owner.id, { page: 1, pageSize: 10 });
    expect(
      page.candidates.map(
        ({ firstName, lastName }) => `${lastName}:${firstName}`,
      ),
    ).toEqual(['Alpha:Ada', 'alpha:zoe', 'beta:Bea', 'Beta:cara']);
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
