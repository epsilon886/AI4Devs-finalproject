import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

const ownerId = '018f0f64-2d8a-7f0b-8000-000000000001';
const otherOwnerId = '018f0f64-2d8a-7f0b-8000-000000000002';
const pipelineId = '018f0f64-2d8a-7f0b-8000-000000000003';
const vacancyId = '018f0f64-2d8a-7f0b-8000-000000000004';

interface VacancyServiceContract {
  create(userId: string, dto: VacancyInput): Promise<PublicVacancy>;
  findAll(userId: string, query: VacancyListQuery): Promise<VacancyPage>;
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
  status?: unknown;
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
  createdAt: Date;
  pipeline: {
    name: string;
    stages: Array<{ id: string; name: string; position: number }>;
  };
}

interface VacancyPage {
  vacancies: Array<{
    id: string;
    title: string;
    companyName: string;
    createdAt: Date;
    status: string;
    pipelineName: string;
  }>;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

describe('VacanciesService', () => {
  it('creates with an active Pipeline owned by the recruiter, forces DRAFT, and returns ordered public stages', async () => {
    const findFirst = jest.fn().mockResolvedValue(pipeline());
    const create = jest.fn().mockResolvedValue(vacancy());
    const service = vacanciesService({
      pipeline: { findFirst },
      vacancy: { create },
    } as unknown as PrismaService);

    await expect(
      service.create(ownerId, {
        title: 'Engineer',
        companyName: 'RecruitLane',
        description: 'Build useful things',
        pipelineId,
        status: 'OPEN',
      }),
    ).resolves.toEqual(publicVacancy());

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: pipelineId, userId: ownerId, deletedAt: null },
        include: { stages: { orderBy: { position: 'asc' } } },
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: ownerId,
          pipelineId,
          title: 'Engineer',
          companyName: 'RecruitLane',
          description: 'Build useful things',
          status: 'DRAFT',
        },
      }),
    );
  });

  it.each([
    ['does not exist', null],
    ['belongs to another recruiter', null],
    ['was soft deleted', null],
  ])(
    'rejects creation when the Pipeline %s without writing a Vacancy',
    async (_description, invisiblePipeline) => {
      const findFirst = jest.fn().mockResolvedValue(invisiblePipeline);
      const create = jest.fn();
      const service = vacanciesService({
        pipeline: { findFirst },
        vacancy: { create },
      } as unknown as PrismaService);

      await expect(
        service.create(ownerId, validCreate()),
      ).rejects.toMatchObject({
        response: {
          statusCode: 404,
          code: 'PIPELINE_NOT_FOUND',
          message: 'Pipeline not found',
        },
      });
      expect(create).not.toHaveBeenCalled();
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: pipelineId, userId: ownerId, deletedAt: null },
        }),
      );
    },
  );

  it('does not reveal a Vacancy owned by another recruiter', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = vacanciesService({
      vacancy: { findFirst },
    } as unknown as PrismaService);

    await expect(
      service.findOne(otherOwnerId, vacancyId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.findOne(otherOwnerId, vacancyId),
    ).rejects.toMatchObject({
      response: {
        statusCode: 404,
        code: 'VACANCY_NOT_FOUND',
        message: 'Vacancy not found',
      },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: vacancyId, userId: otherOwnerId },
      }),
    );
  });

  it('returns an owned Vacancy as public detail with stages ordered by position', async () => {
    const findFirst = jest.fn().mockResolvedValue(vacancy());
    const service = vacanciesService({
      vacancy: { findFirst },
    } as unknown as PrismaService);

    await expect(service.findOne(ownerId, vacancyId)).resolves.toEqual(
      publicVacancy(),
    );
  });

  it('does not update a Vacancy owned by another recruiter', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const updateMany = jest.fn();
    const service = vacanciesService({
      vacancy: { findFirst, updateMany },
    } as unknown as PrismaService);

    await expect(
      service.update(otherOwnerId, vacancyId, { title: 'Other title' }),
    ).rejects.toMatchObject({
      response: { statusCode: 404, code: 'VACANCY_NOT_FOUND' },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('updates only descriptive fields and keeps the Pipeline and status unchanged', async () => {
    const existing = vacancy({ status: 'FILLED' });
    const findFirst = jest.fn().mockResolvedValue(existing);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = vacanciesService({
      vacancy: { findFirst, updateMany },
    } as unknown as PrismaService);

    await expect(
      service.update(ownerId, vacancyId, {
        title: 'Principal engineer',
        description: 'An updated description',
      }),
    ).resolves.toEqual(
      publicVacancy({
        title: 'Principal engineer',
        description: 'An updated description',
        status: 'FILLED',
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: vacancyId, userId: ownerId },
      data: {
        title: 'Principal engineer',
        description: 'An updated description',
      },
    });
  });

  it('returns the current public representation for a valid descriptive no-op without writing', async () => {
    const findFirst = jest.fn().mockResolvedValue(vacancy());
    const updateMany = jest.fn();
    const service = vacanciesService({
      vacancy: { findFirst, updateMany },
    } as unknown as PrismaService);

    await expect(
      service.update(ownerId, vacancyId, {
        title: 'Engineer',
        companyName: 'RecruitLane',
        description: 'Build useful things',
      }),
    ).resolves.toEqual(publicVacancy());
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['DRAFT', 'OPEN'],
    ['OPEN', 'FILLED'],
    ['OPEN', 'CANCELLED'],
    ['FILLED', 'OPEN'],
    ['CANCELLED', 'OPEN'],
  ] as const)(
    'allows the %s -> %s Vacancy lifecycle transition',
    async (from, to) => {
      const findFirst = jest.fn().mockResolvedValue(vacancy({ status: from }));
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const service = vacanciesService({
        vacancy: { findFirst, updateMany },
      } as unknown as PrismaService);

      await expect(
        service.update(ownerId, vacancyId, { status: to }),
      ).resolves.toEqual(publicVacancy({ status: to }));
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: vacancyId, userId: ownerId } }),
      );
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: vacancyId, userId: ownerId },
        data: { status: to },
      });
    },
  );

  it.each([
    ['DRAFT', 'FILLED'],
    ['DRAFT', 'CANCELLED'],
    ['OPEN', 'DRAFT'],
    ['FILLED', 'DRAFT'],
    ['FILLED', 'CANCELLED'],
    ['CANCELLED', 'DRAFT'],
    ['CANCELLED', 'FILLED'],
  ] as const)(
    'rejects the prohibited %s -> %s Vacancy lifecycle transition',
    async (from, to) => {
      const findFirst = jest.fn().mockResolvedValue(vacancy({ status: from }));
      const updateMany = jest.fn();
      const service = vacanciesService({
        vacancy: { findFirst, updateMany },
      } as unknown as PrismaService);

      await expect(
        service.update(ownerId, vacancyId, { status: to }),
      ).rejects.toMatchObject({
        response: {
          statusCode: 409,
          code: 'VACANCY_NOT_OPEN',
          message: 'The vacancy does not allow this operation',
        },
      });
      expect(updateMany).not.toHaveBeenCalled();
    },
  );

  it.each(['DRAFT', 'OPEN', 'FILLED', 'CANCELLED'] as const)(
    'returns the current public detail without writing for the %s status no-op',
    async (status) => {
      const findFirst = jest.fn().mockResolvedValue(vacancy({ status }));
      const updateMany = jest.fn();
      const service = vacanciesService({
        vacancy: { findFirst, updateMany },
      } as unknown as PrismaService);

      await expect(
        service.update(ownerId, vacancyId, { status }),
      ).resolves.toEqual(publicVacancy({ status }));
      expect(updateMany).not.toHaveBeenCalled();
    },
  );

  it('does not change the status of an invisible Vacancy', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const updateMany = jest.fn();
    const service = vacanciesService({
      vacancy: { findFirst, updateMany },
    } as unknown as PrismaService);

    await expect(
      service.update(otherOwnerId, vacancyId, { status: 'OPEN' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update(otherOwnerId, vacancyId, { status: 'OPEN' }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 404,
        code: 'VACANCY_NOT_FOUND',
        message: 'Vacancy not found',
      },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('filters the paginated listing by one status while preserving owner and metadata when title is absent', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const queryRaw = jest.fn().mockResolvedValue([{ id: vacancyId }]);
    const findMany = jest.fn().mockResolvedValue([vacancy({ status: 'OPEN' })]);
    const service = vacanciesService({
      vacancy: { count, findMany },
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
    const where = { userId: ownerId, status: { in: ['OPEN'] } };

    await expect(
      service.findAll(ownerId, { page: 1, pageSize: 10, status: ['OPEN'] }),
    ).resolves.toEqual({
      vacancies: [publicVacancySummary({ status: 'OPEN' })],
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('filters by any of several statuses before calculating paginated metadata', async () => {
    const count = jest.fn().mockResolvedValue(12);
    const queryRaw = jest
      .fn()
      .mockResolvedValue([
        { id: vacancyId },
        { id: '018f0f64-2d8a-7f0b-8000-000000000009' },
      ]);
    const findMany = jest.fn().mockResolvedValue([
      vacancy({ status: 'OPEN' }),
      vacancy({
        id: '018f0f64-2d8a-7f0b-8000-000000000009',
        status: 'FILLED',
      }),
    ]);
    const service = vacanciesService({
      vacancy: { count, findMany },
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
    const where = { userId: ownerId, status: { in: ['OPEN', 'FILLED'] } };

    await expect(
      service.findAll(ownerId, {
        page: 2,
        pageSize: 10,
        status: ['OPEN', 'FILLED'],
      }),
    ).resolves.toMatchObject({
      vacancies: [
        publicVacancySummary({ status: 'OPEN' }),
        publicVacancySummary({
          id: '018f0f64-2d8a-7f0b-8000-000000000009',
          status: 'FILLED',
        }),
      ],
      page: 2,
      pageSize: 10,
      totalItems: 12,
      totalPages: 2,
    });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('uses already deduplicated status filters when counting the listing', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const queryRaw = jest.fn().mockResolvedValue([{ id: vacancyId }]);
    const findMany = jest.fn().mockResolvedValue([vacancy({ status: 'OPEN' })]);
    const service = vacanciesService({
      vacancy: { count, findMany },
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
    const where = { userId: ownerId, status: { in: ['OPEN'] } };

    await service.findAll(ownerId, {
      page: 1,
      pageSize: 10,
      status: ['OPEN'],
    });

    expect(count).toHaveBeenCalledWith({ where });
  });
});

function vacanciesService(prisma: PrismaService): VacancyServiceContract {
  // The production module is deliberately absent during RED. Runtime loading
  // keeps this test type-correct while making that absence the failing cause.
  const { VacanciesService } = require('./vacancies.service') as {
    VacanciesService: new (
      prismaService: PrismaService,
    ) => VacancyServiceContract;
  };
  return new VacanciesService(prisma);
}

function validCreate(): VacancyInput {
  return {
    title: 'Engineer',
    companyName: 'RecruitLane',
    description: 'Build useful things',
    pipelineId,
  };
}

function pipeline() {
  return {
    id: pipelineId,
    userId: ownerId,
    name: 'Hiring',
    isDefault: false,
    deletedAt: null,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
    stages: [
      stage('018f0f64-2d8a-7f0b-8000-000000000007', 'Interview', 3),
      stage('018f0f64-2d8a-7f0b-8000-000000000005', 'Applied', 1),
      stage('018f0f64-2d8a-7f0b-8000-000000000006', 'Screening', 2),
    ],
  };
}

function vacancy({
  id = vacancyId,
  title = 'Engineer',
  companyName = 'RecruitLane',
  description = 'Build useful things',
  status = 'DRAFT',
}: Partial<{
  id: string;
  title: string;
  companyName: string;
  description: string;
  status: string;
}> = {}) {
  return {
    id,
    userId: ownerId,
    pipelineId,
    title,
    companyName,
    description,
    status,
    createdAt: new Date('2026-01-02T10:00:00.000Z'),
    updatedAt: new Date('2026-01-02T10:00:00.000Z'),
    pipeline: pipeline(),
  };
}

function publicVacancySummary({
  id = vacancyId,
  title = 'Engineer',
  companyName = 'RecruitLane',
  status = 'DRAFT',
}: Partial<{
  id: string;
  title: string;
  companyName: string;
  status: string;
}> = {}) {
  return {
    id,
    title,
    companyName,
    createdAt: new Date('2026-01-02T10:00:00.000Z'),
    status,
    pipelineName: 'Hiring',
  };
}

function publicVacancy({
  title = 'Engineer',
  companyName = 'RecruitLane',
  description = 'Build useful things',
  status = 'DRAFT',
}: Partial<{
  title: string;
  companyName: string;
  description: string;
  status: string;
}> = {}): PublicVacancy {
  return {
    id: vacancyId,
    title,
    companyName,
    description,
    status,
    createdAt: new Date('2026-01-02T10:00:00.000Z'),
    pipeline: {
      name: 'Hiring',
      stages: [
        {
          id: '018f0f64-2d8a-7f0b-8000-000000000005',
          name: 'Applied',
          position: 1,
        },
        {
          id: '018f0f64-2d8a-7f0b-8000-000000000006',
          name: 'Screening',
          position: 2,
        },
        {
          id: '018f0f64-2d8a-7f0b-8000-000000000007',
          name: 'Interview',
          position: 3,
        },
      ],
    },
  };
}

function stage(id: string, name: string, position: number) {
  return {
    id,
    pipelineId,
    name,
    position,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
  };
}
