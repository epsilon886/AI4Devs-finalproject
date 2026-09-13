import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import argon2 from 'argon2';
import { normalizeEmail } from '../common/normalization/normalize-email';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterRecruiterDto } from './dto/register-recruiter.dto';

const DEFAULT_PIPELINE_STAGES = [
  { name: 'Applied', position: 1 },
  { name: 'Screening', position: 2 },
  { name: 'Interview', position: 3 },
  { name: 'Offer', position: 4 },
  { name: 'Hired', position: 5 },
  { name: 'Rejected', position: 6 },
];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(registerRecruiterDto: RegisterRecruiterDto): Promise<void> {
    try {
      const passwordHash = await argon2.hash(registerRecruiterDto.password, {
        type: argon2.argon2id,
      });
      const email = normalizeEmail(registerRecruiterDto.email);

      await this.prisma.$transaction((transaction) =>
        transaction.user.create({
          data: {
            firstName: registerRecruiterDto.firstName,
            lastName: registerRecruiterDto.lastName,
            email,
            passwordHash,
            pipelines: {
              create: {
                name: 'Default',
                isDefault: true,
                stages: { create: DEFAULT_PIPELINE_STAGES },
              },
            },
          },
        }),
      );
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'REGISTRATION_CONFLICT',
          message: 'Unable to create account with the provided information',
        });
      }

      this.logger.error('Unable to register recruiter', error);
      throw new InternalServerErrorException({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  }

  private isUniqueConstraintViolation(
    error: unknown,
  ): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
