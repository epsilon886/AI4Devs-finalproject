import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { OriginCsrfGuard } from '../common/guards/origin-csrf.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { requireJwtSecret, SESSION_TTL_SECONDS } from './auth.constants';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { RegisterRateLimitGuard } from './register-rate-limit.guard';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: requireJwtSecret(),
        signOptions: { expiresIn: SESSION_TTL_SECONDS },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRateLimitService,
    RegisterRateLimitGuard,
    { provide: APP_GUARD, useClass: OriginCsrfGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
  ],
})
export class AuthModule {}
