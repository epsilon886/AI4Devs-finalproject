import type { PrismaService } from '../prisma/prisma.service';

const ownerId = '018f0f64-2d8a-7f0b-8000-000000000001';
const candidateId = '018f0f64-2d8a-7f0b-8000-000000000003';
const vacancyId = '018f0f64-2d8a-7f0b-8000-000000000004';
const pipelineId = '018f0f64-2d8a-7f0b-8000-000000000005';
const firstStageId = '018f0f64-2d8a-7f0b-8000-000000000006';
const secondStageId = '018f0f64-2d8a-7f0b-8000-000000000007';
const thirdStageId = '018f0f64-2d8a-7f0b-8000-000000000008';
const otherPipelineId = '018f0f64-2d8a-7f0b-8000-000000000010';
const otherPipelineStageId = '018f0f64-2d8a-7f0b-8000-000000000011';

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
  vacancyId?: string;
}

interface PublicApplication {
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

interface PublicApplicationSummary {
  id: string;
  createdAt: Date;
  candidate: { id: string; firstName: string; lastName: string };
  vacancy: { id: string; title: string };
  currentStage: { id: string; name: string; position: number };
}

interface ApplicationPage {
  applications: PublicApplicationSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

describe('ApplicationsService', () => {
  it('creates an Application for the authenticated recruiter in the Vacancy pipeline stage at position 1', async () => {
    const candidateFindFirst = jest.fn().mockResolvedValue(candidate());
    const vacancyFindFirst = jest.fn().mockResolvedValue(vacancy());
    const create = jest.fn().mockResolvedValue(application());
    const service = applicationsService({
      candidate: { findFirst: candidateFindFirst },
      vacancy: { findFirst: vacancyFindFirst },
      application: { create },
    } as unknown as PrismaService);

    await expect(service.create(ownerId, validCreate())).resolves.toEqual(
      publicApplication(),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          candidateId,
          vacancyId,
          currentStageId: firstStageId,
        },
      }),
    );
  });

  it.each(['does not exist', 'belongs to another recruiter'])(
    'rejects creation when the Candidate %s without creating an Application',
    async () => {
      const candidateFindFirst = jest.fn().mockResolvedValue(null);
      const create = jest.fn();
      const service = applicationsService({
        candidate: { findFirst: candidateFindFirst },
        vacancy: { findFirst: jest.fn() },
        application: { create },
      } as unknown as PrismaService);

      await expect(
        service.create(ownerId, validCreate()),
      ).rejects.toMatchObject({
        response: {
          statusCode: 404,
          code: 'CANDIDATE_NOT_FOUND',
          message: 'Candidate not found',
        },
      });
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each(['does not exist', 'belongs to another recruiter'])(
    'rejects creation when the Vacancy %s without creating an Application',
    async () => {
      const vacancyFindFirst = jest.fn().mockResolvedValue(null);
      const create = jest.fn();
      const service = applicationsService({
        candidate: { findFirst: jest.fn().mockResolvedValue(candidate()) },
        vacancy: { findFirst: vacancyFindFirst },
        application: { create },
      } as unknown as PrismaService);

      await expect(
        service.create(ownerId, validCreate()),
      ).rejects.toMatchObject({
        response: {
          statusCode: 404,
          code: 'VACANCY_NOT_FOUND',
          message: 'Vacancy not found',
        },
      });
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each(['DRAFT', 'FILLED', 'CANCELLED'] as const)(
    'rejects creation for a %s Vacancy without creating an Application',
    async (status) => {
      const create = jest.fn();
      const service = applicationsService({
        candidate: { findFirst: jest.fn().mockResolvedValue(candidate()) },
        vacancy: {
          findFirst: jest.fn().mockResolvedValue(vacancy({ status })),
        },
        application: { create },
      } as unknown as PrismaService);

      await expect(
        service.create(ownerId, validCreate()),
      ).rejects.toMatchObject({
        response: {
          statusCode: 409,
          code: 'VACANCY_NOT_OPEN',
          message: 'The vacancy does not allow this operation',
        },
      });
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('maps the active Candidate and Vacancy unique constraint to the contractual conflict', async () => {
    const create = jest.fn().mockRejectedValue({ code: 'P2002' });
    const service = applicationsService({
      candidate: { findFirst: jest.fn().mockResolvedValue(candidate()) },
      vacancy: { findFirst: jest.fn().mockResolvedValue(vacancy()) },
      application: { create },
    } as unknown as PrismaService);

    await expect(service.create(ownerId, validCreate())).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: 'APPLICATION_ALREADY_EXISTS',
        message:
          'An active application already exists for this candidate and vacancy',
      },
    });
  });

  it('lists active Applications owned by the recruiter as paginated public summaries', async () => {
    const count = jest.fn().mockResolvedValue(12);
    const findMany = jest.fn().mockResolvedValue([application()]);
    const service = applicationsService({
      application: { count, findMany },
    } as unknown as PrismaService);
    const where = { deletedAt: null, vacancy: { userId: ownerId } };

    await expect(
      service.findAll(ownerId, { page: 2, pageSize: 10 }),
    ).resolves.toEqual({
      applications: [publicApplicationSummary()],
      page: 2,
      pageSize: 10,
      totalItems: 12,
      totalPages: 2,
    });
    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('filters active Applications by one visible Vacancy with the same effective scope for count and rows', async () => {
    const vacancyFindFirst = jest.fn().mockResolvedValue(vacancy());
    const count = jest.fn().mockResolvedValue(1);
    const findMany = jest.fn().mockResolvedValue([application()]);
    const service = applicationsService({
      vacancy: { findFirst: vacancyFindFirst },
      application: { count, findMany },
    } as unknown as PrismaService);
    const where = {
      deletedAt: null,
      vacancyId,
      vacancy: { userId: ownerId },
    };

    await expect(
      service.findAll(ownerId, { page: 1, pageSize: 10, vacancyId }),
    ).resolves.toMatchObject({
      applications: [publicApplicationSummary()],
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });
    expect(vacancyFindFirst).toHaveBeenCalledWith({
      where: { id: vacancyId, userId: ownerId },
    });
    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
  });

  it.each(['does not exist', 'belongs to another recruiter'])(
    'rejects listing filtered by a Vacancy that %s',
    async () => {
      const count = jest.fn();
      const findMany = jest.fn();
      const service = applicationsService({
        vacancy: { findFirst: jest.fn().mockResolvedValue(null) },
        application: { count, findMany },
      } as unknown as PrismaService);

      await expect(
        service.findAll(ownerId, { page: 1, pageSize: 10, vacancyId }),
      ).rejects.toMatchObject({
        response: {
          statusCode: 404,
          code: 'VACANCY_NOT_FOUND',
          message: 'Vacancy not found',
        },
      });
      expect(count).not.toHaveBeenCalled();
      expect(findMany).not.toHaveBeenCalled();
    },
  );

  it('returns the public detail for an active Application even when its Vacancy is no longer OPEN', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValue(application({ vacancyStatus: 'FILLED' }));
    const service = applicationsService({
      application: { findFirst },
    } as unknown as PrismaService);

    await expect(service.findOne(ownerId, application().id)).resolves.toEqual(
      publicApplication(),
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: application().id,
          deletedAt: null,
          vacancy: { userId: ownerId },
        },
      }),
    );
  });

  it.each([
    'does not exist',
    'belongs to another recruiter',
    'was soft-deleted',
  ])('rejects detail when the Application %s', async () => {
    const service = applicationsService({
      application: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService);

    await expect(
      service.findOne(ownerId, application().id),
    ).rejects.toMatchObject({
      response: {
        statusCode: 404,
        code: 'APPLICATION_NOT_FOUND',
        message: 'Application not found',
      },
    });
  });

  it('soft-deletes an active Application in an OPEN Vacancy', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = applicationsService({
      application: {
        findFirst: jest.fn().mockResolvedValue(application()),
        updateMany,
      },
    } as unknown as PrismaService);

    await expect(
      service.remove(ownerId, application().id),
    ).resolves.toBeUndefined();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: application().id,
          deletedAt: null,
        }),
        data: { deletedAt: expect.any(Date) },
      }),
    );
  });

  it.each([
    'does not exist',
    'belongs to another recruiter',
    'was soft-deleted',
  ])(
    'does not inspect Vacancy state or write when the Application %s during DELETE',
    async () => {
      const updateMany = jest.fn();
      const findFirst = jest.fn().mockResolvedValue(null);
      const service = applicationsService({
        application: {
          findFirst,
          updateMany,
        },
      } as unknown as PrismaService);

      await expect(
        service.remove(ownerId, application().id),
      ).rejects.toMatchObject({
        response: {
          statusCode: 404,
          code: 'APPLICATION_NOT_FOUND',
          message: 'Application not found',
        },
      });
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: application().id,
            deletedAt: null,
            vacancy: { userId: ownerId },
          },
        }),
      );
      expect(updateMany).not.toHaveBeenCalled();
    },
  );

  it.each(['DRAFT', 'FILLED', 'CANCELLED'] as const)(
    'rejects DELETE for an active Application in a %s Vacancy without writing',
    async (status) => {
      const updateMany = jest.fn();
      const service = applicationsService({
        application: {
          findFirst: jest
            .fn()
            .mockResolvedValue(application({ vacancyStatus: status })),
          updateMany,
        },
      } as unknown as PrismaService);

      await expect(
        service.remove(ownerId, application().id),
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

  it.each([
    ['jumps across multiple positions', thirdStageId, 'Interview', 3],
    ['moves backwards', secondStageId, 'Screening', 2],
  ])(
    'moves an active own Application freely when it %s',
    async (
      _description,
      destinationStageId,
      destinationName,
      destinationPosition,
    ) => {
      const destination = stage(
        destinationStageId,
        destinationName,
        destinationPosition,
      );
      const stageFindFirst = jest.fn().mockResolvedValue(destination);
      const update = jest
        .fn()
        .mockResolvedValue(application({ currentStage: destination }));
      const service = applicationsService({
        application: { findFirst: jest.fn().mockResolvedValue(application()), update },
        pipelineStage: { findFirst: stageFindFirst },
      } as unknown as PrismaService);

      await expect(
        service.update(ownerId, application().id, {
          currentStageId: destinationStageId,
        }),
      ).resolves.toEqual(publicApplication({ currentStage: destination }));
      expect(stageFindFirst).toHaveBeenCalledWith({
        where: { id: destinationStageId, pipelineId },
      });
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: application().id },
          data: { currentStageId: destinationStageId },
        }),
      );
    },
  );

  it.each([
    'does not exist',
    'belongs to another recruiter',
    'was soft-deleted',
  ])(
    'rejects movement before consulting the destination when the Application %s',
    async () => {
      const stageFindFirst = jest.fn();
      const update = jest.fn();
      const findFirst = jest.fn().mockResolvedValue(null);
      const service = applicationsService({
        application: { findFirst, update },
        pipelineStage: { findFirst: stageFindFirst },
      } as unknown as PrismaService);

      await expect(
        service.update(ownerId, application().id, { currentStageId: thirdStageId }),
      ).rejects.toMatchObject({
        response: {
          statusCode: 404,
          code: 'APPLICATION_NOT_FOUND',
          message: 'Application not found',
        },
      });
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: application().id,
            deletedAt: null,
            vacancy: { userId: ownerId },
          },
        }),
      );
      expect(stageFindFirst).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    },
  );

  it.each(['DRAFT', 'FILLED', 'CANCELLED'] as const)(
    'rejects movement in a %s Vacancy before consulting the destination',
    async (status) => {
      const stageFindFirst = jest.fn();
      const update = jest.fn();
      const service = applicationsService({
        application: {
          findFirst: jest
            .fn()
            .mockResolvedValue(application({ vacancyStatus: status })),
          update,
        },
        pipelineStage: { findFirst: stageFindFirst },
      } as unknown as PrismaService);

      await expect(
        service.update(ownerId, application().id, { currentStageId: thirdStageId }),
      ).rejects.toMatchObject({
        response: {
          statusCode: 409,
          code: 'VACANCY_NOT_OPEN',
          message: 'The vacancy does not allow this operation',
        },
      });
      expect(stageFindFirst).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    },
  );

  it.each(['does not exist', 'belongs to another Pipeline'])(
    'rejects movement when the destination stage %s',
    async (description) => {
      const destinationStageId =
        description === 'does not exist' ? thirdStageId : otherPipelineStageId;
      const otherStage = stage(
        otherPipelineStageId,
        'Other stage',
        1,
        otherPipelineId,
      );
      const stageFindFirst = jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            where.id === otherStage.id && where.pipelineId === otherStage.pipelineId
              ? otherStage
              : null,
          ),
        );
      const update = jest.fn();
      const service = applicationsService({
        application: {
          findFirst: jest.fn().mockResolvedValue(application()),
          update,
        },
        pipelineStage: { findFirst: stageFindFirst },
      } as unknown as PrismaService);

      await expect(
        service.update(ownerId, application().id, {
          currentStageId: destinationStageId,
        }),
      ).rejects.toMatchObject({
        response: {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
        },
      });
      expect(stageFindFirst).toHaveBeenCalledWith({
        where: { id: destinationStageId, pipelineId },
      });
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('returns the public detail without writing when movement targets the current stage', async () => {
    const stageFindFirst = jest.fn();
    const update = jest.fn();
    const service = applicationsService({
      application: { findFirst: jest.fn().mockResolvedValue(application()), update },
      pipelineStage: { findFirst: stageFindFirst },
    } as unknown as PrismaService);

    await expect(
      service.update(ownerId, application().id, { currentStageId: firstStageId }),
    ).resolves.toEqual(publicApplication());
    expect(stageFindFirst).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

function applicationsService(
  prisma: PrismaService,
): ApplicationsServiceContract {
  // The production Service is deliberately absent during RED. Runtime loading
  // keeps this test type-correct while making that absence the expected failure.
  const { ApplicationsService } = require('./applications.service') as {
    ApplicationsService: new (
      prismaService: PrismaService,
    ) => ApplicationsServiceContract;
  };
  return new ApplicationsService(prisma);
}

function validCreate(): CreateApplicationInput {
  return { candidateId, vacancyId };
}

function candidate() {
  return {
    id: candidateId,
    userId: ownerId,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: null,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
  };
}

function vacancy({ status = 'OPEN' }: { status?: string } = {}) {
  return {
    id: vacancyId,
    userId: ownerId,
    pipelineId,
    title: 'Backend engineer',
    companyName: 'RecruitLane',
    description: 'Build useful things',
    status,
    createdAt: new Date('2026-01-02T10:00:00.000Z'),
    updatedAt: new Date('2026-01-02T10:00:00.000Z'),
    pipeline: {
      id: pipelineId,
      userId: ownerId,
      name: 'Hiring',
      isDefault: false,
      deletedAt: null,
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
      updatedAt: new Date('2026-01-01T10:00:00.000Z'),
      stages: [
        stage('018f0f64-2d8a-7f0b-8000-000000000008', 'Interview', 3),
        stage(firstStageId, 'Applied', 1),
        stage('018f0f64-2d8a-7f0b-8000-000000000007', 'Screening', 2),
      ],
    },
  };
}

function application({
  vacancyStatus = 'OPEN',
  currentStage = stage(firstStageId, 'Applied', 1),
}: {
  vacancyStatus?: string;
  currentStage?: ReturnType<typeof stage>;
} = {}) {
  return {
    id: '018f0f64-2d8a-7f0b-8000-000000000009',
    candidateId,
    vacancyId,
    currentStageId: currentStage.id,
    deletedAt: null,
    createdAt: new Date('2026-01-03T10:00:00.000Z'),
    updatedAt: new Date('2026-01-03T10:00:00.000Z'),
    candidate: candidate(),
    vacancy: vacancy({ status: vacancyStatus }),
    currentStage,
  };
}

function publicApplicationSummary(): PublicApplicationSummary {
  return {
    id: '018f0f64-2d8a-7f0b-8000-000000000009',
    createdAt: new Date('2026-01-03T10:00:00.000Z'),
    candidate: {
      id: candidateId,
      firstName: 'Ada',
      lastName: 'Lovelace',
    },
    vacancy: { id: vacancyId, title: 'Backend engineer' },
    currentStage: { id: firstStageId, name: 'Applied', position: 1 },
  };
}

function publicApplication({
  currentStage = stage(firstStageId, 'Applied', 1),
}: {
  currentStage?: ReturnType<typeof stage>;
} = {}): PublicApplication {
  return {
    id: '018f0f64-2d8a-7f0b-8000-000000000009',
    createdAt: new Date('2026-01-03T10:00:00.000Z'),
    candidate: {
      id: candidateId,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: null,
    },
    vacancy: {
      id: vacancyId,
      title: 'Backend engineer',
      companyName: 'RecruitLane',
    },
    pipeline: { name: 'Hiring' },
    currentStage: {
      id: currentStage.id,
      name: currentStage.name,
      position: currentStage.position,
    },
  };
}

function stage(
  id: string,
  name: string,
  position: number,
  stagePipelineId = pipelineId,
) {
  return {
    id,
    pipelineId: stagePipelineId,
    name,
    position,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
  };
}
