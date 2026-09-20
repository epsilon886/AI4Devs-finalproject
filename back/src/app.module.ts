import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CandidatesModule } from './candidates/candidates.module';
@Module({
  imports: [PrismaModule, AuthModule, CandidatesModule],
})
export class AppModule {}
