import { VacancyStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';

function trimOuterWhitespace({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateVacancyDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trimOuterWhitespace)
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  title?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trimOuterWhitespace)
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  companyName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trimOuterWhitespace)
  @IsString()
  @IsNotEmpty()
  @Length(1, 1500)
  description?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(VacancyStatus)
  status?: VacancyStatus;
}
