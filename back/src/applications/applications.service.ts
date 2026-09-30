import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Application,
  Candidate,
  Pipeline,
  PipelineStage,
  Prisma,
  Vacancy,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ApplicationQueryDto } from './dto/application-query.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

type ApplicationDetailRecord = Application & {
  candidate: Pick<
    Candidate,
    'id' | 'firstName' | 'lastName' | 'email' | 'phone'
  >;
  vacancy: Pick<
    Vacancy,
    'id' | 'pipelineId' | 'title' | 'companyName' | 'status'
  > & {
    pipeline: Pick<Pipeline, 'name'>;
  };
  currentStage: Pick<PipelineStage, 'id' | 'name' | 'position'>;
};

type ApplicationSummaryRecord = Application & {
  candidate: Pick<Candidate, 'id' | 'firstName' | 'lastName'>;
  vacancy: Pick<Vacancy, 'id' | 'title'>;
  currentStage: Pick<PipelineStage, 'id' | 'name' | 'position'>;
};

const applicationDetailInclude = {
  candidate: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  },
  vacancy: {
    select: {
      id: true,
      pipelineId: true,
      title: true,
      companyName: true,
      status: true,
      pipeline: { select: { name: true } },
    },
  },
  currentStage: { select: { id: true, name: true, position: true } },
} satisfies Prisma.ApplicationInclude;

const applicationSummaryInclude = {
  candidate: { select: { id: true, firstName: true, lastName: true } },
  vacancy: { select: { id: true, title: true } },
  currentStage: { select: { id: true, name: true, position: true } },
} satisfies Prisma.ApplicationInclude;

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    dto: CreateApplicationDto,
  ): Promise<PublicApplication> {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, userId },
    });
    if (!candidate) throw candidateNotFound();

    const vacancy = await this.prisma.vacancy.findFirst({
      where: { id: dto.vacancyId, userId },
      include: { pipeline: { include: { stages: true } } },
    });
    if (!vacancy) throw vacancyNotFound();
    if (vacancy.status !== 'OPEN') throw vacancyNotOpen();

    const firstStage = vacancy.pipeline.stages.find(
      (stage) => stage.position === 1,
    );
    if (!firstStage) {
      throw new Error('Vacancy pipeline does not have a first stage');
    }

    try {
      return publicApplication(
        await this.prisma.application.create({
          data: {
            candidateId: candidate.id,
            vacancyId: vacancy.id,
            currentStageId: firstStage.id,
          },
          include: applicationDetailInclude,
        }),
      );
    } catch (error) {
      if (isActiveApplicationUniqueViolation(error)) {
        throw applicationAlreadyExists();
      }
      throw error;
    }
  }

  async findAll(
    userId: string,
    { page, pageSize, vacancyId }: ApplicationQueryDto,
  ): Promise<ApplicationPage> {
    if (vacancyId !== undefined) {
      const vacancy = await this.prisma.vacancy.findFirst({
        where: { id: vacancyId, userId },
      });
      if (!vacancy) throw vacancyNotFound();
    }

    const where = activeApplicationWhere(userId, vacancyId);
    const [totalItems, applications] = await Promise.all([
      this.prisma.application.count({ where }),
      this.prisma.application.findMany({
        where,
        include: applicationSummaryInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      applications: applications.map(publicApplicationSummary),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  async findOne(userId: string, id: string): Promise<PublicApplication> {
    return publicApplication(await this.findVisibleApplication(userId, id));
  }

  async update(
    userId: string,
    id: string,
    { currentStageId }: UpdateApplicationDto,
  ): Promise<PublicApplication> {
    const application = await this.findVisibleApplication(userId, id);
    if (application.vacancy.status !== 'OPEN') throw vacancyNotOpen();
    if (application.currentStage.id === currentStageId) {
      return publicApplication(application);
    }

    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id: currentStageId, pipelineId: application.vacancy.pipelineId },
    });
    if (!stage) throw invalidStageDestination();

    return publicApplication(
      await this.prisma.application.update({
        where: { id },
        data: { currentStageId },
        include: applicationDetailInclude,
      }),
    );
  }

  async remove(userId: string, id: string): Promise<void> {
    const application = await this.findVisibleApplication(userId, id);
    if (application.vacancy.status !== 'OPEN') throw vacancyNotOpen();

    const result = await this.prisma.application.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) throw applicationNotFound();
  }

  private async findVisibleApplication(
    userId: string,
    id: string,
  ): Promise<ApplicationDetailRecord> {
    const application = await this.prisma.application.findFirst({
      where: activeApplicationWhere(userId, undefined, id),
      include: applicationDetailInclude,
    });
    if (!application) throw applicationNotFound();
    return application;
  }
}

export interface PublicApplication {
  id: string;
  createdAt: Date;
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  vacancy: { id: string; title: string; companyName: string };
  pipeline: { name: string };
  currentStage: { id: string; name: string; position: number };
}

export interface PublicApplicationSummary {
  id: string;
  createdAt: Date;
  candidate: { id: string; firstName: string; lastName: string };
  vacancy: { id: string; title: string };
  currentStage: { id: string; name: string; position: number };
}

export interface ApplicationPage {
  applications: PublicApplicationSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

function publicApplication(
  application: ApplicationDetailRecord,
): PublicApplication {
  return {
    id: application.id,
    createdAt: application.createdAt,
    candidate: {
      id: application.candidate.id,
      firstName: application.candidate.firstName,
      lastName: application.candidate.lastName,
      email: application.candidate.email,
      phone: application.candidate.phone,
    },
    vacancy: {
      id: application.vacancy.id,
      title: application.vacancy.title,
      companyName: application.vacancy.companyName,
    },
    pipeline: { name: application.vacancy.pipeline.name },
    currentStage: {
      id: application.currentStage.id,
      name: application.currentStage.name,
      position: application.currentStage.position,
    },
  };
}

function publicApplicationSummary(
  application: ApplicationSummaryRecord,
): PublicApplicationSummary {
  return {
    id: application.id,
    createdAt: application.createdAt,
    candidate: {
      id: application.candidate.id,
      firstName: application.candidate.firstName,
      lastName: application.candidate.lastName,
    },
    vacancy: {
      id: application.vacancy.id,
      title: application.vacancy.title,
    },
    currentStage: {
      id: application.currentStage.id,
      name: application.currentStage.name,
      position: application.currentStage.position,
    },
  };
}

function activeApplicationWhere(
  userId: string,
  vacancyId?: string,
  id?: string,
): Prisma.ApplicationWhereInput {
  return {
    ...(id === undefined ? {} : { id }),
    ...(vacancyId === undefined ? {} : { vacancyId }),
    deletedAt: null,
    vacancy: { userId },
  };
}

function candidateNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'CANDIDATE_NOT_FOUND',
    message: 'Candidate not found',
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

function invalidStageDestination(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    message: 'Invalid request data',
    errors: [
      {
        field: 'currentStageId',
        message: 'currentStageId must belong to the vacancy pipeline',
      },
    ],
  });
}

function applicationNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'APPLICATION_NOT_FOUND',
    message: 'Application not found',
  });
}

function applicationAlreadyExists(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'APPLICATION_ALREADY_EXISTS',
    message:
      'An active application already exists for this candidate and vacancy',
  });
}

function isActiveApplicationUniqueViolation(error: unknown): boolean {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  if (!('meta' in error) || error.meta === undefined) return true;
  if (typeof error.meta !== 'object' || error.meta === null) return false;
  if (!('target' in error.meta) || !Array.isArray(error.meta.target)) {
    return false;
  }

  const target = new Set(error.meta.target);
  return target.has('candidate_id') && target.has('vacancy_id');
}
