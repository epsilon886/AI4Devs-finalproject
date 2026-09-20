import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

function canonicalPositiveInteger({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    return value;
  }

  return Number(value);
}

export class CandidatesPaginationDto {
  @Transform(canonicalPositiveInteger)
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(canonicalPositiveInteger)
  @IsInt()
  @Min(10)
  @Max(100)
  pageSize = 10;
}
