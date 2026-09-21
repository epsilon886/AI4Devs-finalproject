import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  Length,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { normalizePipelineName } from '../normalize-pipeline-name';
import { UpdatePipelineStageDto } from './pipeline-stage.dto';

function normalizeName({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizePipelineName(value) : value;
}

export class UpdatePipelineDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(normalizeName)
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => UpdatePipelineStageDto)
  stages?: UpdatePipelineStageDto[];
}
