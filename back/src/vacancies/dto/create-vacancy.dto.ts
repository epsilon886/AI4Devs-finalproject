import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, Length } from 'class-validator';

function trimOuterWhitespace({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateVacancyDto {
  @Transform(trimOuterWhitespace)
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  title!: string;

  @Transform(trimOuterWhitespace)
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  companyName!: string;

  @Transform(trimOuterWhitespace)
  @IsString()
  @IsNotEmpty()
  @Length(1, 1500)
  description!: string;

  @IsUUID('all')
  pipelineId!: string;
}
