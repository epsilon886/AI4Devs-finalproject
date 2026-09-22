import { VacancyStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

function normalizeStatuses({ value }: { value: unknown }): unknown {
  const statuses = typeof value === 'string' ? [value] : value;
  return Array.isArray(statuses) ? [...new Set(statuses)] : statuses;
}

export class VacancyQueryDto extends PaginationQueryDto {
  @Transform(normalizeStatuses)
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @IsEnum(VacancyStatus, { each: true })
  status?: VacancyStatus[];
}
