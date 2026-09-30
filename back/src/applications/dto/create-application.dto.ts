import { IsUUID } from 'class-validator';

export class CreateApplicationDto {
  @IsUUID('all')
  candidateId!: string;

  @IsUUID('all')
  vacancyId!: string;
}
