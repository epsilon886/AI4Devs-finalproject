import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../common/normalization/normalize-email';

function normalizeEmailValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizeEmail(value) : value;
}

export class LoginRecruiterDto {
  @Transform(normalizeEmailValue)
  @IsString()
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @Length(15, 128)
  password!: string;
}
