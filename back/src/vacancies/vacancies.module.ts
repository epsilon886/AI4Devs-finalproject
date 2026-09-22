import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VacanciesController } from './vacancies.controller';
import { VacanciesService } from './vacancies.service';

@Module({
  imports: [PrismaModule],
  controllers: [VacanciesController],
  providers: [VacanciesService],
})
export class VacanciesModule {}
