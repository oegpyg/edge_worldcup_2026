import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
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
