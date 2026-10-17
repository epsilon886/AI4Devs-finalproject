import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Pipeline,
  PipelineStage,
  Prisma,
  Vacancy,
  VacancyStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVacancyDto } from './dto/create-vacancy.dto';
import { UpdateVacancyDto } from './dto/update-vacancy.dto';
import { VacancyQueryDto } from './dto/vacancy-query.dto';

type PipelineWithStages = Pipeline & { stages: PipelineStage[] };
type VacancyDetailRecord = Vacancy & { pipeline: PipelineWithStages };
type VacancySummaryRecord = Vacancy & { pipeline: Pick<Pipeline, 'name'> };

const pipelineStagesInclude = {
  stages: { orderBy: { position: 'asc' } },
} satisfies Prisma.PipelineInclude;

const vacancyDetailInclude = {
  pipeline: { include: pipelineStagesInclude },
} satisfies Prisma.VacancyInclude;

const vacancySummaryInclude = {
  pipeline: { select: { name: true } },
} satisfies Prisma.VacancyInclude;

const allowedStatusTransitions: Record<VacancyStatus, VacancyStatus[]> = {
  DRAFT: ['OPEN'],
  OPEN: ['FILLED', 'CANCELLED'],
  FILLED: ['OPEN'],
  CANCELLED: ['OPEN'],
};

@Injectable()
export class VacanciesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    dto: CreateVacancyDto,
  ): Promise<PublicVacancy> {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: dto.pipelineId, userId, deletedAt: null },
      include: pipelineStagesInclude,
    });
    if (!pipeline) throw pipelineNotFound();

    return publicVacancy(
      await this.prisma.vacancy.create({
        data: {
          userId,
          pipelineId: pipeline.id,
          title: dto.title,
          companyName: dto.companyName,
          description: dto.description,
          status: 'DRAFT',
        },
        include: vacancyDetailInclude,
      }),
    );
  }

  async findAll(
    userId: string,
    { page, pageSize, status, title }: VacancyQueryDto,
  ): Promise<VacancyPage> {
    const statuses = status ? [...new Set(status)] : undefined;
    const escapedTitle = title === undefined ? undefined : escapeLike(title);
    const where: Prisma.VacancyWhereInput = {
      userId,
      ...(statuses?.length ? { status: { in: statuses } } : {}),
      ...(escapedTitle === undefined
        ? {}
        : { title: { contains: escapedTitle, mode: 'insensitive' } }),
    };
    const [totalItems, rows] = await Promise.all([
      this.prisma.vacancy.count({ where }),
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id"
        FROM "vacancies"
        WHERE "user_id" = CAST(${userId} AS uuid)
        ${vacancyStatusFilter(statuses)}
        ${vacancyTitleFilter(escapedTitle)}
        ORDER BY
          CASE "status"
            WHEN 'OPEN'::"vacancy_status" THEN 1
            WHEN 'DRAFT'::"vacancy_status" THEN 2
            WHEN 'FILLED'::"vacancy_status" THEN 3
            WHEN 'CANCELLED'::"vacancy_status" THEN 4
          END ASC,
          LOWER("title") ASC,
          "id" ASC
        OFFSET ${(page - 1) * pageSize}
        LIMIT ${pageSize}
      `),
    ]);
    const ids = rows.map(({ id }) => id);
    const vacancies =
      ids.length === 0
        ? []
        : await this.prisma.vacancy.findMany({
            where: { userId, id: { in: ids } },
            include: vacancySummaryInclude,
          });
    const vacanciesById = new Map(
      vacancies.map((vacancy) => [vacancy.id, vacancy]),
    );

    return {
      vacancies: ids.flatMap((id) => {
        const vacancy = vacanciesById.get(id);
        return vacancy ? [publicVacancySummary(vacancy)] : [];
      }),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  async findOne(userId: string, id: string): Promise<PublicVacancy> {
    return publicVacancy(await this.findVisibleVacancy(userId, id));
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateVacancyDto,
  ): Promise<PublicVacancy> {
    const existing = await this.findVisibleVacancy(userId, id);
    if (dto.status !== undefined) {
      return this.updateStatus(userId, id, existing, dto.status);
    }
    const data = changedDescriptiveFields(existing, dto);

    if (Object.keys(data).length === 0) return publicVacancy(existing);

    const result = await this.prisma.vacancy.updateMany({
      where: { id, userId },
      data,
    });
    if (result.count === 0) throw vacancyNotFound();

    return publicVacancy({ ...existing, ...data });
  }

  private async updateStatus(
    userId: string,
    id: string,
    existing: VacancyDetailRecord,
    status: VacancyStatus,
  ): Promise<PublicVacancy> {
    if (status === existing.status) return publicVacancy(existing);
    if (!allowedStatusTransitions[existing.status].includes(status)) {
      throw vacancyNotOpen();
    }

    const result = await this.prisma.vacancy.updateMany({
      where: { id, userId },
      data: { status },
    });
    if (result.count === 0) throw vacancyNotFound();

    return publicVacancy({ ...existing, status });
  }

  private async findVisibleVacancy(
    userId: string,
    id: string,
  ): Promise<VacancyDetailRecord> {
    const vacancy = await this.prisma.vacancy.findFirst({
      where: { id, userId },
      include: vacancyDetailInclude,
    });
    if (!vacancy) throw vacancyNotFound();
    return vacancy;
  }
}

function vacancyStatusFilter(
  statuses: VacancyStatus[] | undefined,
): Prisma.Sql {
  if (!statuses?.length) return Prisma.empty;

  return Prisma.sql`
    AND "status" IN (${Prisma.join(
      statuses.map(
        (status) => Prisma.sql`CAST(${status} AS "vacancy_status")`,
      ),
    )})
  `;
}

function vacancyTitleFilter(title: string | undefined): Prisma.Sql {
  if (title === undefined) return Prisma.empty;

  return Prisma.sql`
    AND LOWER("title") LIKE LOWER(${`%${title}%`}) ESCAPE '\\'
  `;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export interface PublicVacancy {
  id: string;
  title: string;
  companyName: string;
  description: string;
  status: string;
  createdAt: Date;
  pipeline: PublicVacancyPipeline;
}

export interface PublicVacancyPipeline {
  name: string;
  stages: PublicVacancyStage[];
}

export interface PublicVacancyStage {
  id: string;
  name: string;
  position: number;
}

export interface PublicVacancySummary {
  id: string;
  title: string;
  companyName: string;
  createdAt: Date;
  status: string;
  pipelineName: string;
}

export interface VacancyPage {
  vacancies: PublicVacancySummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

function publicVacancy(vacancy: VacancyDetailRecord): PublicVacancy {
  return {
    id: vacancy.id,
    title: vacancy.title,
    companyName: vacancy.companyName,
    description: vacancy.description,
    status: vacancy.status,
    createdAt: vacancy.createdAt,
    pipeline: {
      name: vacancy.pipeline.name,
      stages: [...vacancy.pipeline.stages]
        .sort((left, right) => left.position - right.position)
        .map((stage) => ({
          id: stage.id,
          name: stage.name,
          position: stage.position,
        })),
    },
  };
}

function publicVacancySummary(
  vacancy: VacancySummaryRecord,
): PublicVacancySummary {
  return {
    id: vacancy.id,
    title: vacancy.title,
    companyName: vacancy.companyName,
    createdAt: vacancy.createdAt,
    status: vacancy.status,
    pipelineName: vacancy.pipeline.name,
  };
}

function changedDescriptiveFields(
  vacancy: Vacancy,
  dto: UpdateVacancyDto,
): Partial<Pick<Vacancy, 'title' | 'companyName' | 'description'>> {
  const data: Partial<Pick<Vacancy, 'title' | 'companyName' | 'description'>> =
    {};
  if (dto.title !== undefined && dto.title !== vacancy.title) {
    data.title = dto.title;
  }
  if (dto.companyName !== undefined && dto.companyName !== vacancy.companyName) {
    data.companyName = dto.companyName;
  }
  if (dto.description !== undefined && dto.description !== vacancy.description) {
    data.description = dto.description;
  }
  return data;
}

function pipelineNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'PIPELINE_NOT_FOUND',
    message: 'Pipeline not found',
  });
}

function vacancyNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'VACANCY_NOT_FOUND',
    message: 'Vacancy not found',
  });
}

function vacancyNotOpen(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'VACANCY_NOT_OPEN',
    message: 'The vacancy does not allow this operation',
  });
}
