import { Body, Controller, Post, Req } from '@nestjs/common';

import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('request-otp')
  requestOtp(@Body() body: RequestOtpDto, @Req() req: any) {
    return this.authService.requestOtp(body.email, this.extractClientIp(req));
  }

  @Post('verify-otp')
  verifyOtp(@Body() body: VerifyOtpDto, @Req() req: any) {
    return this.authService.verifyOtp(body.email, body.otp, this.extractClientIp(req));
  }

  private extractClientIp(req: any) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
    }

    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return forwarded[0]?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
    }

    return req.ip ?? 'unknown';
  }
}
