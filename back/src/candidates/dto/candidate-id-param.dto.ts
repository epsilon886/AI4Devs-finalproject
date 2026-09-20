import { IsUUID } from 'class-validator';

export class CandidateIdParamDto {
  @IsUUID('all')
  id!: string;
}
