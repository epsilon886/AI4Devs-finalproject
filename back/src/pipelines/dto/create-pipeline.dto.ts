import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { normalizePipelineName } from '../normalize-pipeline-name';
import { CreatePipelineStageDto } from './pipeline-stage.dto';

function normalizeName({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizePipelineName(value) : value;
}

export class CreatePipelineDto {
  @Transform(normalizeName)
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name!: string;

  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreatePipelineStageDto)
  stages!: CreatePipelineStageDto[];
}
