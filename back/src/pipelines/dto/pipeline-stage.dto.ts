import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateIf,
} from 'class-validator';
import { normalizePipelineName } from '../normalize-pipeline-name';

function normalizeName({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizePipelineName(value) : value;
}

export class CreatePipelineStageDto {
  @Transform(normalizeName)
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name!: string;

  @IsInt()
  @Min(1)
  position!: number;
}

export class UpdatePipelineStageDto extends CreatePipelineStageDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID('all')
  id?: string;
}
