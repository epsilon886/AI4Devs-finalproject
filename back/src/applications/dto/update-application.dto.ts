import { IsUUID } from 'class-validator';

export class UpdateApplicationDto {
  @IsUUID('all')
  currentStageId!: string;
}
