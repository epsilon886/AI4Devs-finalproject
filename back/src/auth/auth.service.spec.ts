import {
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import {
  requireJwtSecret,
  SESSION_TTL_MS,
  SESSION_TTL_SECONDS,
} from './auth.constants';

jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
  argon2id: 2,
}));

describe('AuthService', () => {
  it('uses one four-hour TTL and refuses to configure JWT without a secret', () => {
    const originalJwtSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
      expect(SESSION_TTL_MS).toBe(4 * 60 * 60 * 1000);
      expect(SESSION_TTL_SECONDS).toBe(4 * 60 * 60);
      expect(requireJwtSecret).toThrow('JWT_SECRET must be set');
    } finally {
      restoreEnvironment('JWT_SECRET', originalJwtSecret);
    }
  });

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

  it('normalizes the email, verifies the untouched password, and signs only sub on login', async () => {
    const user = {
      id: 'user-id',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      passwordHash: 'argon2id-hash',
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
    } as unknown as PrismaService;
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('session-token'),
    } as unknown as JwtService;
    const verify = argon2.verify as jest.MockedFunction<typeof argon2.verify>;
    verify.mockResolvedValue(true);
    const service = new AuthService(
      prisma,
      jwtService,
      new AuthRateLimitService(),
    );

    await expect(
      service.login(
        {
          email: '  ADA@Example.COM ',
          password: '  a secure password  ',
        },
        '127.0.0.1',
      ),
    ).resolves.toEqual({
      user: {
        id: 'user-id',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
      },
      token: 'session-token',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'ada@example.com' },
    });
    expect(verify).toHaveBeenCalledWith(
      'argon2id-hash',
      '  a secure password  ',
    );
    expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: 'user-id' });
  });

  it.each([
    ['an unknown email', undefined],
    [
      'an incorrect password',
      {
        id: 'user-id',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        passwordHash: 'argon2id-hash',
      },
    ],
  ])(
    'uses the same invalid credentials response for %s',
    async (_description, user) => {
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(user) },
      } as unknown as PrismaService;
      const jwtService = {} as JwtService;
      const verify = argon2.verify as jest.MockedFunction<typeof argon2.verify>;
      verify.mockResolvedValue(false);
      const service = new AuthService(
        prisma,
        jwtService,
        new AuthRateLimitService(),
      );

      await expect(
        service.login(
          { email: 'ada@example.com', password: 'a secure password' },
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({
        response: {
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    },
  );

  it('returns 429 only for the fourth invalid credential attempt and resets after success', async () => {
    const user = {
      id: 'user-id',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      passwordHash: 'argon2id-hash',
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
    } as unknown as PrismaService;
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('session-token'),
    } as unknown as JwtService;
    const rateLimitService = new AuthRateLimitService();
    const verify = argon2.verify as jest.MockedFunction<typeof argon2.verify>;
    verify.mockResolvedValue(false);
    const service = new AuthService(prisma, jwtService, rateLimitService);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        service.login(validLogin(), '127.0.0.1'),
      ).rejects.toMatchObject({ response: { statusCode: 401 } });
    }
    await expect(
      service.login(validLogin(), '127.0.0.1'),
    ).rejects.toMatchObject({
      response: { statusCode: 429, code: 'RATE_LIMIT_EXCEEDED' },
    });

    verify.mockResolvedValue(true);
    await expect(
      service.login(validLogin(), '127.0.0.1'),
    ).resolves.toMatchObject({
      token: 'session-token',
    });

    verify.mockResolvedValue(false);
    await expect(
      service.login(validLogin(), '127.0.0.1'),
    ).rejects.toMatchObject({ response: { statusCode: 401 } });
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

function validLogin() {
  return { email: 'ada@example.com', password: 'a secure password' };
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
