import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import argon2 from 'argon2';
import { PrismaClient, VacancyStatus } from '@prisma/client';

const AUTHORIZED_DATABASE_HOST = 'postgres';
const AUTHORIZED_DATABASE_NAME = 'recruitlane';
const RESET_CONFIRMATION = 'RESET_RECRUITLANE_DEVELOPMENT_DATABASE';
const DEMO_EMAIL = 'demo@recruitlane.example';
const DATASET_NAMESPACE = 'recruitlane-demo-reset-v1';
const BASE_TIME = Date.UTC(2026, 0, 1, 12, 0, 0);

type Stage = {
  id: string;
  pipelineId: string;
  name: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

class ResetGuardError extends Error {}

function fail(message: string): never {
  throw new Error(message);
}

function failGuard(message: string): never {
  throw new ResetGuardError(message);
}

function readDemoPassword(): string {
  if (process.env.NODE_ENV !== 'development') {
    failGuard('Demo reset is only available when NODE_ENV is development.');
  }

  if (process.env.DEMO_RESET_CONFIRM !== RESET_CONFIRMATION) {
    failGuard('Demo reset confirmation is missing or invalid.');
  }

  const password = process.env.DEMO_USER_PASSWORD;
  if (!password || password.length < 15 || password.length > 128) {
    failGuard('DEMO_USER_PASSWORD must contain between 15 and 128 characters.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) failGuard('DATABASE_URL is required.');

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    failGuard('DATABASE_URL is invalid.');
  }

  const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
  const validProtocol =
    parsedUrl.protocol === 'postgresql:' || parsedUrl.protocol === 'postgres:';
  const validPort = parsedUrl.port === '' || parsedUrl.port === '5432';
  if (
    !validProtocol ||
    parsedUrl.hostname !== AUTHORIZED_DATABASE_HOST ||
    databaseName !== AUTHORIZED_DATABASE_NAME ||
    !validPort
  ) {
    failGuard(
      'DATABASE_URL does not target the authorized development database.',
    );
  }

  return password;
}

function resetSchema(): void {
  const result = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'prisma', 'migrate', 'reset', '--force', '--skip-seed'],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
    },
  );

  if (result.error || result.status !== 0) {
    fail('Unable to reset the authorized development database.');
  }
}

function deterministicId(resource: string, index: number): string {
  const bytes = createHash('sha256')
    .update(`${DATASET_NAMESPACE}:${resource}:${index}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function timestamp(offset: number): Date {
  return new Date(BASE_TIME + offset * 1000);
}

function buildStages(pipelineId: string, pipelineIndex: number): Stage[] {
  const names =
    pipelineIndex === 0
      ? ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected']
      : [
          'Prospeccion',
          'Evaluacion',
          'Entrevista',
          'Oferta',
          'Contratado',
          'Descartado',
        ].slice(0, 3 + (pipelineIndex % 4));

  return names.map((name, position) => ({
    id: deterministicId(`pipeline-stage-${pipelineIndex}`, position + 1),
    pipelineId,
    name,
    position: position + 1,
    createdAt: timestamp(1_000 + pipelineIndex * 10 + position),
    updatedAt: timestamp(1_000 + pipelineIndex * 10 + position),
  }));
}

async function seed(password: string): Promise<void> {
  const prisma = new PrismaClient();
  const userId = deterministicId('user', 1);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const activePipelines = Array.from({ length: 105 }, (_, index) => {
    const id = deterministicId('pipeline', index);
    return {
      id,
      userId,
      name:
        index === 0
          ? 'Default'
          : `Proceso demo ${String(index).padStart(3, '0')}`,
      isDefault: index === 0,
      deletedAt: null,
      createdAt: timestamp(100 + index),
      updatedAt: timestamp(100 + index),
    };
  });
  const archivedPipelineId = deterministicId('pipeline', 105);
  const archivedPipeline = {
    id: archivedPipelineId,
    userId,
    name: 'Proceso archivado',
    isDefault: false,
    deletedAt: timestamp(300),
    createdAt: timestamp(205),
    updatedAt: timestamp(300),
  };
  const stages = [
    ...activePipelines.flatMap((pipeline, index) =>
      buildStages(pipeline.id, index),
    ),
    ...buildStages(archivedPipelineId, 105),
  ];
  const stagesByPipeline = new Map<string, Stage[]>();
  for (const stage of stages) {
    const pipelineStages = stagesByPipeline.get(stage.pipelineId) ?? [];
    pipelineStages.push(stage);
    stagesByPipeline.set(stage.pipelineId, pipelineStages);
  }

  const candidates = Array.from({ length: 125 }, (_, index) => ({
    id: deterministicId('candidate', index),
    userId,
    firstName: `Candidato ${String(index + 1).padStart(3, '0')}`,
    lastName: `Demo ${String(index + 1).padStart(3, '0')}`,
    email: `candidate${String(index + 1).padStart(3, '0')}@demo.recruitlane.example`,
    phone:
      index % 3 === 0 ? null : `+5493885${String(index + 1).padStart(6, '0')}`,
    createdAt: timestamp(2_000 + index),
    updatedAt: timestamp(2_000 + index),
  }));

  const vacancies = Array.from({ length: 125 }, (_, index) => {
    const status =
      index < 105
        ? VacancyStatus.OPEN
        : index < 115
          ? VacancyStatus.DRAFT
          : index < 120
            ? VacancyStatus.FILLED
            : VacancyStatus.CANCELLED;
    return {
      id: deterministicId('vacancy', index),
      userId,
      pipelineId: activePipelines[index % 5].id,
      title: `Vacante demo ${String(index + 1).padStart(3, '0')}`,
      companyName: `Empresa demo ${String((index % 12) + 1).padStart(2, '0')}`,
      description: `Vacante ficticia ${String(index + 1).padStart(3, '0')} para desarrollo y demostracion.`,
      status,
      createdAt: timestamp(3_000 + index),
      updatedAt: timestamp(3_000 + index),
    };
  });

  function application(
    index: number,
    candidateIndex: number,
    vacancyIndex: number,
    deletedAt: Date | null = null,
  ) {
    const vacancy = vacancies[vacancyIndex];
    const vacancyStages = stagesByPipeline.get(vacancy.pipelineId);
    if (!vacancyStages) fail('Dataset contains a vacancy without stages.');
    const createdAt = timestamp(4_000 + index);
    return {
      id: deterministicId('application', index),
      candidateId: candidates[candidateIndex].id,
      vacancyId: vacancy.id,
      currentStageId: vacancyStages[index % vacancyStages.length].id,
      deletedAt,
      createdAt,
      updatedAt: deletedAt ?? createdAt,
    };
  }

  const activeApplications = [
    ...Array.from({ length: 125 }, (_, index) => application(index, index, 0)),
    ...Array.from({ length: 75 }, (_, index) =>
      application(125 + index, index, 1 + Math.floor(index / 5)),
    ),
    ...Array.from({ length: 20 }, (_, index) =>
      application(200 + index, 75 + index, 115 + Math.floor(index / 4)),
    ),
    ...Array.from({ length: 20 }, (_, index) =>
      application(220 + index, 95 + index, 120 + Math.floor(index / 4)),
    ),
  ];
  const deletedApplications = Array.from({ length: 5 }, (_, index) =>
    application(240 + index, index, 0, timestamp(5_000 + index)),
  );

  try {
    await prisma.$transaction(
      async (transaction) => {
        await transaction.user.create({
          data: {
            id: userId,
            firstName: 'Recruiter',
            lastName: 'Demo',
            email: DEMO_EMAIL,
            passwordHash,
            createdAt: timestamp(1),
            updatedAt: timestamp(1),
          },
        });
        await transaction.pipeline.createMany({
          data: [...activePipelines, archivedPipeline],
        });
        await transaction.pipelineStage.createMany({ data: stages });
        await transaction.candidate.createMany({ data: candidates });
        await transaction.vacancy.createMany({ data: vacancies });
        await transaction.application.createMany({
          data: [...activeApplications, ...deletedApplications],
        });
      },
      { maxWait: 5_000, timeout: 60_000 },
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const password = readDemoPassword();
  resetSchema();
  await seed(password);
  console.log('Development database reset and deterministic demo data loaded.');
}

main().catch((error: unknown) => {
  if (error instanceof ResetGuardError) {
    console.error(error.message);
  } else {
    console.error(
      'Demo reset failed. No credentials or connection details were logged.',
    );
  }
  process.exitCode = 1;
});
