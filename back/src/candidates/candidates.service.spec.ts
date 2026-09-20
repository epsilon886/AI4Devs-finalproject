import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { CandidatesService } from './candidates.service';

const ownerId = '018f0f64-2d8a-7f0b-8000-000000000001';
const candidateId = '018f0f64-2d8a-7f0b-8000-000000000002';
const candidate = {
  id: candidateId,
  userId: ownerId,
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+123456',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CandidatesService', () => {
  it('normalizes email, persists the authenticated owner, and maps only the public candidate', async () => {
    const create = jest.fn().mockResolvedValue(candidate);
    const service = new CandidatesService({
      candidate: { create },
    } as unknown as PrismaService);

    await expect(
      service.create(ownerId, {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: '  ADA@Example.COM ',
        phone: '+123456',
      }),
    ).resolves.toEqual({
      id: candidate.id,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '+123456',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: ownerId,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '+123456',
      },
    });
  });

  it('maps the compound candidate email constraint to the approved conflict', async () => {
    const service = new CandidatesService({
      candidate: { create: jest.fn().mockRejectedValue({ code: 'P2002' }) },
    } as unknown as PrismaService);

    await expect(
      service.create(ownerId, {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
      }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: 'CANDIDATE_EMAIL_CONFLICT',
        message: 'A candidate with this email already exists',
      },
    });
  });

  it('scopes detail lookup to the authenticated owner and treats another owner as not found', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new CandidatesService({
      candidate: { findFirst },
    } as unknown as PrismaService);

    await expect(service.findOne(ownerId, candidateId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: candidateId, userId: ownerId },
    });
  });

  it('keeps an omitted phone and clears it only when phone is explicitly null', async () => {
    const findFirst = jest.fn().mockResolvedValue(candidate);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new CandidatesService({
      candidate: { findFirst, updateMany },
    } as unknown as PrismaService);

    await service.update(ownerId, candidateId, { firstName: 'Grace' });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: candidateId, userId: ownerId },
      data: { firstName: 'Grace' },
    });

    findFirst.mockResolvedValueOnce(candidate).mockResolvedValueOnce({
      ...candidate,
      phone: null,
    });
    await service.update(ownerId, candidateId, { phone: null });
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: candidateId, userId: ownerId },
      data: { phone: null },
    });
  });

  it('returns the persisted representation for a valid no-op without writing', async () => {
    const findFirst = jest.fn().mockResolvedValue(candidate);
    const updateMany = jest.fn();
    const service = new CandidatesService({
      candidate: { findFirst, updateMany },
    } as unknown as PrismaService);

    await expect(
      service.update(ownerId, candidateId, { email: 'ADA@example.com' }),
    ).resolves.toEqual({
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not expose an update of another owner and maps an update conflict', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const updateMany = jest.fn();
    const service = new CandidatesService({
      candidate: { findFirst, updateMany },
    } as unknown as PrismaService);

    await expect(
      service.update(ownerId, candidateId, { lastName: 'Hopper' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updateMany).not.toHaveBeenCalled();

    findFirst.mockResolvedValue(candidate);
    updateMany.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.update(ownerId, candidateId, { email: 'other@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
