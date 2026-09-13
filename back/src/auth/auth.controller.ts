import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JsonContentTypeGuard } from '../common/guards/json-content-type.guard';
import { RegisterRecruiterDto } from './dto/register-recruiter.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(201)
  @UseGuards(JsonContentTypeGuard)
  async register(@Body() registerRecruiterDto: RegisterRecruiterDto) {
    await this.authService.register(registerRecruiterDto);
    return { message: 'Account created successfully' };
  }
}
