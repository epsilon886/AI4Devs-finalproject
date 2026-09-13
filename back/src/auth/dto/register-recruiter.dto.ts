import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { normalizeEmail } from '../../common/normalization/normalize-email';

function trimOuterWhitespace({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeEmailValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizeEmail(value) : value;
}

export class RegisterRecruiterDto {
  @Transform(trimOuterWhitespace)
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  firstName!: string;

  @Transform(trimOuterWhitespace)
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  lastName!: string;

  @Transform(normalizeEmailValue)
  @IsString()
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @Length(15, 128)
  password!: string;
}
