import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ApplicationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('all')
  vacancyId?: string;
}
