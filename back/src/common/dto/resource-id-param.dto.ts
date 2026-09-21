import { IsUUID } from 'class-validator';

export class ResourceIdParamDto {
  @IsUUID('all')
  id!: string;
}
