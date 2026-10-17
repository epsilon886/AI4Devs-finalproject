import { VacancyStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

function normalizeStatuses({ value }: { value: unknown }): unknown {
  const statuses = typeof value === 'string' ? [value] : value;
  return Array.isArray(statuses) ? [...new Set(statuses)] : statuses;
}

function normalizeTitle({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class VacancyQueryDto extends PaginationQueryDto {
  @Transform(normalizeStatuses)
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @IsEnum(VacancyStatus, { each: true })
  status?: VacancyStatus[];

  @Transform(normalizeTitle)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 200)
  title?: string;
}
