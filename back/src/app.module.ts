import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CandidatesModule } from './candidates/candidates.module';
import { PipelinesModule } from './pipelines/pipelines.module';
import { VacanciesModule } from './vacancies/vacancies.module';
import { ApplicationsModule } from './applications/applications.module';
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CandidatesModule,
    PipelinesModule,
    VacanciesModule,
    ApplicationsModule,
  ],
})
export class AppModule {}
