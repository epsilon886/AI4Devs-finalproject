import {
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import argon2 from 'argon2';
import { AuthService } from './auth.service';

jest.mock('argon2', () => ({
  hash: jest.fn(),
  argon2id: 2,
}));

describe('AuthService', () => {
  it('normalizes the email and creates the default pipeline after hashing the exact password with Argon2id', async () => {
    const userCreate = jest.fn().mockResolvedValue({ id: 'user-id' });
    const prisma = {
      $transaction: jest.fn(async (operation) =>
        operation({ user: { create: userCreate } }),
      ),
    } as unknown as PrismaService;
    const hash = argon2.hash as jest.MockedFunction<typeof argon2.hash>;
    hash.mockResolvedValue('argon2id-hash');
    const service = new AuthService(prisma);

    await service.register({
      firstName: ' Ada ',
      lastName: ' Lovelace ',
      email: '  ADA@Example.COM ',
      password: '  fifteen chars  ',
    });

    expect(hash).toHaveBeenCalledWith('  fifteen chars  ', {
      type: argon2.argon2id,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(userCreate).toHaveBeenCalledWith({
      data: {
        firstName: ' Ada ',
        lastName: ' Lovelace ',
        email: 'ada@example.com',
        passwordHash: 'argon2id-hash',
        pipelines: {
          create: {
            name: 'Default',
            isDefault: true,
            stages: {
              create: [
                { name: 'Applied', position: 1 },
                { name: 'Screening', position: 2 },
                { name: 'Interview', position: 3 },
                { name: 'Offer', position: 4 },
                { name: 'Hired', position: 5 },
                { name: 'Rejected', position: 6 },
              ],
            },
          },
        },
      },
    });
  });

  it('translates the registration unique constraint into the public conflict', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue({ code: 'P2002' }),
    } as unknown as PrismaService;
    const hash = argon2.hash as jest.MockedFunction<typeof argon2.hash>;
    hash.mockResolvedValue('argon2id-hash');
    const service = new AuthService(prisma);

    await expect(service.register(validRegistration())).rejects.toBeInstanceOf(
      ConflictException,
    );
    await service.register(validRegistration()).catch((error: unknown) => {
      expect((error as ConflictException).getResponse()).toEqual({
        statusCode: 409,
        code: 'REGISTRATION_CONFLICT',
        message: 'Unable to create account with the provided information',
      });
    });
  });

  it('returns only the public generic error for unexpected failures', async () => {
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValue(new Error('database internals')),
    } as unknown as PrismaService;
    const hash = argon2.hash as jest.MockedFunction<typeof argon2.hash>;
    hash.mockResolvedValue('argon2id-hash');
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const service = new AuthService(prisma);

    await expect(service.register(validRegistration())).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    await service.register(validRegistration()).catch((error: unknown) => {
      expect((error as InternalServerErrorException).getResponse()).toEqual({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      });
    });
    expect(logError).toHaveBeenCalled();
    logError.mockRestore();
  });
});

function validRegistration() {
  return {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    password: 'a secure password',
  };
}
