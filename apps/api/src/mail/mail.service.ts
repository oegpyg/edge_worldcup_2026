import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readBool(value: string | undefined, fallback: boolean) {
    if (value == null) {
      return fallback;
    }

    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }

  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: this.readBool(process.env.SMTP_SECURE, false),
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          }
        : undefined,
  });

  async sendOtp(email: string, otp: string) {
    const info = await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'no-reply@edgeworldcup.local',
      to: email,
      subject: 'Tu codigo OTP para Edge World Cup',
      text: `Tu codigo OTP es ${otp}. Vence en 10 minutos.`,
      html: `<p>Tu codigo OTP es <strong>${otp}</strong>.</p><p>Vence en 10 minutos.</p>`,
    });

    this.logger.log(`OTP sent to ${email} with message id ${info.messageId}`);
  }
}
