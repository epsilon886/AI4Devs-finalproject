import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JsonContentTypeGuard } from '../common/guards/json-content-type.guard';
import { Public } from '../common/decorators/public.decorator';
import { RegisterRecruiterDto } from './dto/register-recruiter.dto';
import { LoginRecruiterDto } from './dto/login-recruiter.dto';
import { AuthService } from './auth.service';
import { sessionCookieOptions } from './auth.constants';
import { RegisterRateLimitGuard } from './register-rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @HttpCode(201)
  @UseGuards(RegisterRateLimitGuard, JsonContentTypeGuard)
  async register(@Body() registerRecruiterDto: RegisterRecruiterDto) {
    await this.authService.register(registerRecruiterDto);
    return { message: 'Account created successfully' };
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @UseGuards(JsonContentTypeGuard)
  async login(
    @Body() loginRecruiterDto: LoginRecruiterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token } = await this.authService.login(
      loginRecruiterDto,
      request.ip!,
    );
    response.cookie('session', token, sessionCookieOptions());
    return user;
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie('session', sessionCookieOptions());
  }

  @Get('me')
  async me(@Req() request: Request & { user: { sub: string } }) {
    return this.authService.me(request.user.sub);
  }
}
