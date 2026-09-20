import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { normalizeEmail } from '../../common/normalization/normalize-email';

const PHONE_PATTERN = /^(?:[0-9]{6,30}|\+[0-9]{6,29})$/;

function trimOuterWhitespace({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeEmailValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizeEmail(value) : value;
}

export class UpdateCandidateDto {
  @IsOptional()
  @Transform(trimOuterWhitespace)
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  firstName?: string;

  @IsOptional()
  @Transform(trimOuterWhitespace)
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  lastName?: string;

  @IsOptional()
  @Transform(normalizeEmailValue)
  @IsString()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @Transform(trimOuterWhitespace)
  @IsString()
  @MaxLength(30)
  @Matches(PHONE_PATTERN)
  phone?: string | null;
}
