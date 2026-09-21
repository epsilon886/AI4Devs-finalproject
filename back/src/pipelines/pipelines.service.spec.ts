import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { PipelinesService } from './pipelines.service';

const ownerId = '018f0f64-2d8a-7f0b-8000-000000000001';
const pipelineId = '018f0f64-2d8a-7f0b-8000-000000000002';
const stageIds = [
  '018f0f64-2d8a-7f0b-8000-000000000003',
  '018f0f64-2d8a-7f0b-8000-000000000004',
  '018f0f64-2d8a-7f0b-8000-000000000005',
];

describe('PipelinesService', () => {
  it('normalizes custom names, validates stages, and creates all records in one transaction', async () => {
    const create = jest
      .fn()
      .mockResolvedValue(pipeline({ name: 'Hiring process' }));
    const transaction = { pipeline: { create } };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
    } as unknown as PrismaService;
    const service = new PipelinesService(prisma);

    await expect(
      service.create(ownerId, {
        name: '  hiring process  ',
        stages: [
          { name: ' interview ', position: 3 },
          { name: ' applied ', position: 1 },
          { name: ' screening ', position: 2 },
        ],
      }),
    ).resolves.toMatchObject({
      id: pipelineId,
      name: 'Hiring process',
      isDefault: false,
      isEditable: true,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: ownerId,
          name: 'Hiring process',
          isDefault: false,
          stages: {
            create: [
              { name: 'Interview', position: 3 },
              { name: 'Applied', position: 1 },
              { name: 'Screening', position: 2 },
            ],
          },
        }),
      }),
    );
  });

  it.each([
    [
      'has incomplete positions',
      [
        { name: 'One', position: 1 },
        { name: 'Two', position: 2 },
        { name: 'Three', position: 4 },
      ],
    ],
    [
      'has normalized duplicate names',
      [
        { name: 'Applied', position: 1 },
        { name: ' applied ', position: 2 },
        { name: 'Interview', position: 3 },
      ],
    ],
  ])('rejects a custom pipeline that %s', async (_description, stages) => {
    const service = new PipelinesService({} as PrismaService);

    await expect(
      service.create(ownerId, { name: 'Hiring', stages }),
    ).rejects.toMatchObject({
      response: { statusCode: 400, code: 'VALIDATION_ERROR' },
    });
  });

  it.each([
    [
      'has duplicate positions',
      [
        { id: stageIds[0], name: 'Applied', position: 1 },
        { id: stageIds[1], name: 'Screening', position: 1 },
        { id: stageIds[2], name: 'Interview', position: 3 },
      ],
    ],
    [
      'has duplicate stage ids',
      [
        { id: stageIds[0], name: 'Applied', position: 1 },
        { id: stageIds[0], name: 'Screening', position: 2 },
        { id: stageIds[2], name: 'Interview', position: 3 },
      ],
    ],
  ])('rejects a PATCH whose stages %s', async (_description, stages) => {
    const service = new PipelinesService({} as PrismaService);

    await expect(
      service.update(ownerId, pipelineId, { stages }),
    ).rejects.toMatchObject({
      response: { statusCode: 400, code: 'VALIDATION_ERROR' },
    });
  });

  it('returns an empty out-of-range page while preserving its metadata', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const queryRaw = jest.fn().mockResolvedValue([]);
    const findMany = jest.fn();
    const service = new PipelinesService({
      pipeline: { count, findMany },
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    await expect(
      service.findAll(ownerId, { page: 2, pageSize: 10 }),
    ).resolves.toEqual({
      pipelines: [],
      page: 2,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    });
    expect(count).toHaveBeenCalledWith({ where: { userId: ownerId, deletedAt: null } });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('does not reveal a pipeline from another recruiter', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new PipelinesService({
      pipeline: { findFirst },
    } as unknown as PrismaService);

    await expect(service.findOne(ownerId, pipelineId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: pipelineId, userId: ownerId, deletedAt: null },
      }),
    );
  });

  it.each([
    ['the Default pipeline', pipeline({ isDefault: true })],
    ['a pipeline associated with a Vacancy', pipeline({ vacancyCount: 1 })],
  ])('does not modify %s', async (_description, existing) => {
    const update = jest.fn();
    const updateMany = jest.fn();
    const transaction = {
      pipeline: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update,
        updateMany,
      },
      pipelineStage: {},
    };
    const service = new PipelinesService({
      $transaction: jest.fn((callback) => callback(transaction)),
    } as unknown as PrismaService);

    await expect(
      service.update(ownerId, pipelineId, { name: 'Other' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
    await expect(service.remove(ownerId, pipelineId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects a stage that does not belong to the edited pipeline before writing', async () => {
    const update = jest.fn();
    const transaction = {
      pipeline: { findFirst: jest.fn().mockResolvedValue(pipeline()), update },
      pipelineStage: {
        update: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
    };
    const service = new PipelinesService({
      $transaction: jest.fn((callback) => callback(transaction)),
    } as unknown as PrismaService);

    await expect(
      service.update(ownerId, pipelineId, {
        stages: [
          { id: stageIds[0], name: 'Applied', position: 1 },
          { id: stageIds[1], name: 'Screening', position: 2 },
          {
            id: '018f0f64-2d8a-7f0b-8000-000000000099',
            name: 'Interview',
            position: 3,
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: { statusCode: 404, code: 'PIPELINE_STAGE_NOT_FOUND' },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('returns the public current representation for a valid no-op', async () => {
    const existing = pipeline();
    const transaction = {
      pipeline: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn(),
      },
      pipelineStage: {
        update: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
    };
    const service = new PipelinesService({
      $transaction: jest.fn((callback) => callback(transaction)),
    } as unknown as PrismaService);

    await expect(
      service.update(ownerId, pipelineId, {
        name: ' hiring ',
        stages: existing.stages.map(({ id, name, position }) => ({
          id,
          name,
          position,
        })),
      }),
    ).resolves.toMatchObject({
      id: pipelineId,
      name: 'Hiring',
      isEditable: true,
    });
    expect(transaction.pipeline.update).not.toHaveBeenCalled();
    expect(transaction.pipelineStage.update).not.toHaveBeenCalled();
  });
});

function pipeline({
  isDefault = false,
  vacancyCount = 0,
  name = 'Hiring',
}: { isDefault?: boolean; vacancyCount?: number; name?: string } = {}) {
  return {
    id: pipelineId,
    userId: ownerId,
    name,
    isDefault,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { vacancies: vacancyCount },
    stages: [
      stage(stageIds[0], 'Applied', 1),
      stage(stageIds[1], 'Screening', 2),
      stage(stageIds[2], 'Interview', 3),
    ],
  };
}

function stage(id: string, name: string, position: number) {
  return {
    id,
    pipelineId,
    name,
    position,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
