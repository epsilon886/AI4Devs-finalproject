import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pipeline, PipelineStage, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { normalizePipelineName } from './normalize-pipeline-name';

type PipelineRecord = Pipeline & {
  stages: PipelineStage[];
  _count: { vacancies: number };
};

interface StageInput {
  id?: string;
  name: string;
  position: number;
}

interface PipelineClient {
  pipeline: Prisma.TransactionClient['pipeline'];
  pipelineStage: Prisma.TransactionClient['pipelineStage'];
}

const pipelineInclude = {
  stages: { orderBy: { position: 'asc' } },
  _count: { select: { vacancies: true } },
} satisfies Prisma.PipelineInclude;

@Injectable()
export class PipelinesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    dto: CreatePipelineDto,
  ): Promise<PublicPipeline> {
    const name = this.normalizeName(dto.name, 'name');
    const stages = this.normalizeAndValidateStages(dto.stages);

    try {
      const pipeline = await this.prisma.$transaction((transaction) =>
        transaction.pipeline.create({
          data: {
            userId,
            name,
            isDefault: false,
            stages: { create: stages.map(withoutStageId) },
          },
          include: pipelineInclude,
        }),
      );
      return publicPipeline(pipeline);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw pipelineNameConflict();
      throw error;
    }
  }

  async findAll(
    userId: string,
    { page, pageSize }: PaginationQueryDto,
  ): Promise<PipelinePage> {
    const [totalItems, rows] = await Promise.all([
      this.prisma.pipeline.count({ where: activePipelineWhere(userId) }),
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "pipelines"
        WHERE "user_id" = CAST(${userId} AS uuid)
          AND "deleted_at" IS NULL
        ORDER BY "is_default" DESC, LOWER("name") ASC, "id" ASC
        OFFSET ${(page - 1) * pageSize}
        LIMIT ${pageSize}
      `,
    ]);
    const ids = rows.map(({ id }) => id);
    const pipelines =
      ids.length === 0
        ? []
        : await this.prisma.pipeline.findMany({
            where: { ...activePipelineWhere(userId), id: { in: ids } },
            include: pipelineInclude,
          });
    const byId = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline]));

    return {
      pipelines: ids.flatMap((id) => {
        const pipeline = byId.get(id);
        return pipeline ? [publicPipeline(pipeline)] : [];
      }),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  async findOne(userId: string, id: string): Promise<PublicPipeline> {
    return publicPipeline(
      await this.findVisiblePipeline(this.prisma, userId, id),
    );
  }

  async update(
    userId: string,
    id: string,
    dto: UpdatePipelineDto,
  ): Promise<PublicPipeline> {
    const requestedName =
      dto.name === undefined ? undefined : this.normalizeName(dto.name, 'name');
    const requestedStages =
      dto.stages === undefined
        ? undefined
        : this.normalizeAndValidateStages(dto.stages);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await this.findVisiblePipeline(
          transaction,
          userId,
          id,
        );
        this.assertEditable(existing);
        if (requestedStages !== undefined) {
          this.assertExistingStagesBelongToPipeline(existing, requestedStages);
        }

        const name = requestedName ?? existing.name;
        const stagesChanged =
          requestedStages !== undefined &&
          !sameStages(existing.stages, requestedStages);
        if (name === existing.name && !stagesChanged) {
          return publicPipeline(existing);
        }

        if (stagesChanged && requestedStages) {
          await this.synchronizeStages(
            transaction,
            id,
            existing.stages,
            requestedStages,
          );
        }
        if (name !== existing.name) {
          await transaction.pipeline.update({ where: { id }, data: { name } });
        }

        return publicPipeline(
          await this.findVisiblePipeline(transaction, userId, id),
        );
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw pipelineNameConflict();
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const pipeline = await this.findVisiblePipeline(transaction, userId, id);
      this.assertEditable(pipeline);
      const result = await transaction.pipeline.updateMany({
        where: activePipelineWhere(userId, id),
        data: { deletedAt: new Date() },
      });
      if (result.count === 0) throw pipelineNotFound();
    });
  }

  private async findVisiblePipeline(
    client: PipelineClient,
    userId: string,
    id: string,
  ): Promise<PipelineRecord> {
    const pipeline = await client.pipeline.findFirst({
      where: activePipelineWhere(userId, id),
      include: pipelineInclude,
    });
    if (!pipeline) throw pipelineNotFound();
    return pipeline;
  }

  private normalizeName(value: unknown, field: string): string {
    if (typeof value !== 'string') {
      throw validationError(field, `${field} must be a string`);
    }
    const normalized = normalizePipelineName(value);
    if (normalized.length === 0 || normalized.length > 100) {
      throw validationError(
        field,
        `${field} must be between 1 and 100 characters`,
      );
    }
    return normalized;
  }

  private normalizeAndValidateStages(stages: unknown): StageInput[] {
    if (!Array.isArray(stages) || stages.length < 3 || stages.length > 10) {
      throw validationError(
        'stages',
        'stages must contain between 3 and 10 items',
      );
    }
    const normalized = stages.map((stage, index) => {
      if (typeof stage !== 'object' || stage === null) {
        throw validationError(`stages.${index}`, 'stage must be an object');
      }
      const { id, name, position } = stage as StageInput;
      if (id !== undefined && typeof id !== 'string') {
        throw validationError(`stages.${index}.id`, 'id must be a UUID');
      }
      if (!Number.isInteger(position) || position < 1) {
        throw validationError(
          `stages.${index}.position`,
          'position must be a positive integer',
        );
      }
      return {
        id,
        name: this.normalizeName(name, `stages.${index}.name`),
        position,
      };
    });
    const positions = new Set(normalized.map((stage) => stage.position));
    const completePositions = Array.from(
      { length: normalized.length },
      (_value, index) => index + 1,
    ).every((position) => positions.has(position));
    if (positions.size !== normalized.length || !completePositions) {
      throw validationError('stages', 'positions must cover exactly 1..n');
    }
    if (
      new Set(normalized.map((stage) => stage.name)).size !== normalized.length
    ) {
      throw validationError('stages', 'stage names must be unique');
    }
    const ids = normalized.flatMap((stage) => (stage.id ? [stage.id] : []));
    if (new Set(ids).size !== ids.length) {
      throw validationError('stages', 'stage ids must be unique');
    }
    return normalized;
  }

  private assertExistingStagesBelongToPipeline(
    pipeline: PipelineRecord,
    stages: StageInput[],
  ): void {
    const existingIds = new Set(pipeline.stages.map((stage) => stage.id));
    if (stages.some((stage) => stage.id && !existingIds.has(stage.id))) {
      throw pipelineStageNotFound();
    }
  }

  private assertEditable(pipeline: PipelineRecord): void {
    if (pipeline.isDefault || pipeline._count.vacancies > 0) {
      throw pipelineNotEditable();
    }
  }

  private async synchronizeStages(
    transaction: Prisma.TransactionClient,
    pipelineId: string,
    existing: PipelineStage[],
    desired: StageInput[],
  ): Promise<void> {
    const retained = desired.filter(
      (stage): stage is StageInput & { id: string } => stage.id !== undefined,
    );
    const retainedIds = new Set(retained.map((stage) => stage.id));
    const omittedIds = existing
      .filter((stage) => !retainedIds.has(stage.id))
      .map((stage) => stage.id);
    const usedTemporaryNames = new Set([
      ...existing.map((stage) => stage.name),
      ...desired.map((stage) => stage.name),
    ]);

    for (const [index, stage] of retained.entries()) {
      await transaction.pipelineStage.update({
        where: { id: stage.id },
        data: {
          name: temporaryStageName(stage.id, usedTemporaryNames),
          position: -index - 1,
        },
      });
    }
    if (omittedIds.length > 0) {
      await transaction.pipelineStage.deleteMany({
        where: { pipelineId, id: { in: omittedIds } },
      });
    }
    for (const stage of desired) {
      if (stage.id) {
        await transaction.pipelineStage.update({
          where: { id: stage.id },
          data: withoutStageId(stage),
        });
      } else {
        await transaction.pipelineStage.create({
          data: { pipelineId, ...withoutStageId(stage) },
        });
      }
    }
  }
}

function activePipelineWhere(
  userId: string,
  id?: string,
): Prisma.PipelineWhereInput {
  return { userId, ...(id === undefined ? {} : { id }), deletedAt: null };
}

function withoutStageId(stage: StageInput): { name: string; position: number } {
  return { name: stage.name, position: stage.position };
}

function sameStages(existing: PipelineStage[], desired: StageInput[]): boolean {
  if (
    existing.length !== desired.length ||
    desired.some((stage) => !stage.id)
  ) {
    return false;
  }
  const existingById = new Map(existing.map((stage) => [stage.id, stage]));
  return desired.every((stage) => {
    const persisted = existingById.get(stage.id!);
    return (
      persisted !== undefined &&
      persisted.name === stage.name &&
      persisted.position === stage.position
    );
  });
}

function temporaryStageName(id: string, usedNames: Set<string>): string {
  let suffix = 0;
  let name = `~sync-${id}`;
  while (usedNames.has(name)) {
    suffix += 1;
    name = `~sync-${id}-${suffix}`;
  }
  usedNames.add(name);
  return name;
}

export interface PublicPipeline {
  id: string;
  name: string;
  isDefault: boolean;
  isEditable: boolean;
  stages: PublicPipelineStage[];
}

export interface PublicPipelineStage {
  id: string;
  name: string;
  position: number;
}

export interface PipelinePage {
  pipelines: PublicPipeline[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

function publicPipeline(pipeline: PipelineRecord): PublicPipeline {
  return {
    id: pipeline.id,
    name: pipeline.name,
    isDefault: pipeline.isDefault,
    isEditable: !pipeline.isDefault && pipeline._count.vacancies === 0,
    stages: pipeline.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      position: stage.position,
    })),
  };
}

function validationError(field: string, message: string): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    message: 'Invalid request data',
    errors: [{ field, message }],
  });
}

function pipelineNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'PIPELINE_NOT_FOUND',
    message: 'Pipeline not found',
  });
}

function pipelineStageNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'PIPELINE_STAGE_NOT_FOUND',
    message: 'Pipeline stage not found',
  });
}

function pipelineNotEditable(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'PIPELINE_NOT_EDITABLE',
    message: 'This pipeline can no longer be modified',
  });
}

function pipelineNameConflict(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'PIPELINE_NAME_CONFLICT',
    message: 'A pipeline with this name already exists',
  });
}

function isUniqueConstraintViolation(
  error: unknown,
): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
