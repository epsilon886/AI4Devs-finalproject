import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Candidate } from '@prisma/client';
import { normalizeEmail } from '../common/normalization/normalize-email';
import { PrismaService } from '../prisma/prisma.service';
import { CandidatesPaginationDto } from './dto/candidates-pagination.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    dto: CreateCandidateDto,
  ): Promise<PublicCandidate> {
    try {
      const candidate = await this.prisma.candidate.create({
        data: {
          userId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: normalizeEmail(dto.email),
          phone: dto.phone ?? null,
        },
      });
      return publicCandidate(candidate);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw candidateEmailConflict();
      }
      throw error;
    }
  }

  async findAll(
    userId: string,
    { page, pageSize }: CandidatesPaginationDto,
  ): Promise<CandidatePage> {
    const [totalItems, candidates] = await Promise.all([
      this.prisma.candidate.count({ where: { userId } }),
      this.prisma.$queryRaw<Candidate[]>`
        SELECT
          "id",
          "user_id" AS "userId",
          "first_name" AS "firstName",
          "last_name" AS "lastName",
          "email",
          "phone",
          "created_at" AS "createdAt",
          "updated_at" AS "updatedAt"
        FROM "candidates"
        WHERE "user_id" = CAST(${userId} AS uuid)
        ORDER BY LOWER("last_name") ASC, LOWER("first_name") ASC, "id" ASC
        OFFSET ${(page - 1) * pageSize}
        LIMIT ${pageSize}
      `,
    ]);

    return {
      candidates: candidates.map(publicCandidate),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  async findOne(userId: string, id: string): Promise<PublicCandidate> {
    return publicCandidate(await this.findVisibleCandidate(userId, id));
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCandidateDto,
  ): Promise<PublicCandidate> {
    const existing = await this.findVisibleCandidate(userId, id);
    const data = this.changedFields(existing, dto);

    if (Object.keys(data).length === 0) {
      return publicCandidate(existing);
    }

    try {
      const result = await this.prisma.candidate.updateMany({
        where: { id, userId },
        data,
      });
      if (result.count === 0) {
        throw candidateNotFound();
      }
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw candidateEmailConflict();
      }
      throw error;
    }

    return publicCandidate({ ...existing, ...data });
  }

  private async findVisibleCandidate(
    userId: string,
    id: string,
  ): Promise<Candidate> {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id, userId },
    });
    if (!candidate) {
      throw candidateNotFound();
    }
    return candidate;
  }

  private changedFields(candidate: Candidate, dto: UpdateCandidateDto) {
    const data: Partial<
      Pick<Candidate, 'firstName' | 'lastName' | 'email' | 'phone'>
    > = {};
    if (dto.firstName !== undefined && dto.firstName !== candidate.firstName)
      data.firstName = dto.firstName;
    if (dto.lastName !== undefined && dto.lastName !== candidate.lastName)
      data.lastName = dto.lastName;
    if (dto.email !== undefined) {
      const email = normalizeEmail(dto.email);
      if (email !== candidate.email) data.email = email;
    }
    if (dto.phone !== undefined && dto.phone !== candidate.phone)
      data.phone = dto.phone;
    return data;
  }
}

export interface PublicCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

export interface CandidatePage {
  candidates: PublicCandidate[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

function publicCandidate(candidate: Candidate): PublicCandidate {
  return {
    id: candidate.id,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
  };
}

function isUniqueConstraintViolation(
  error: unknown,
): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function candidateNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'CANDIDATE_NOT_FOUND',
    message: 'Candidate not found',
  });
}

function candidateEmailConflict(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'CANDIDATE_EMAIL_CONFLICT',
    message: 'A candidate with this email already exists',
  });
}
