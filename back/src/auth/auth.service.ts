import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { normalizeEmail } from '../common/normalization/normalize-email';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterRecruiterDto } from './dto/register-recruiter.dto';
import { LoginRecruiterDto } from './dto/login-recruiter.dto';
import { AuthRateLimitService } from './auth-rate-limit.service';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly rateLimitService: AuthRateLimitService,
  ) {}

  async login(
    loginRecruiterDto: LoginRecruiterDto,
    ip: string,
  ): Promise<{
    user: PublicUser;
    token: string;
  }> {
    const email = normalizeEmail(loginRecruiterDto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (
      !user ||
      !(await argon2.verify(user.passwordHash, loginRecruiterDto.password))
    ) {
      this.rateLimitService.recordLoginFailure(ip, email);
      throw invalidCredentials();
    }

    this.rateLimitService.clearLoginFailures(ip, email);
    const token = await this.jwtService.signAsync({ sub: user.id });

    return { user: publicUser(user), token };
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    return publicUser(user);
  }

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

export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

function publicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  };
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    statusCode: 401,
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password',
  });
}
