import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomInt, randomUUID } from 'crypto';

import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';

type UserRow = {
  id: number;
  email: string;
  failed_otp_attempts: number;
  otp_locked_until: Date | null;
};

type OtpRow = {
  code_hash: string;
};

type EventCountRow = {
  count: string;
};

type LastEventRow = {
  created_at: Date;
};

const MAX_OTP_ATTEMPTS = 3;

@Injectable()
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly mailService: MailService,
  ) {}

  async requestOtp(email: string, ipAddress = 'unknown') {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Email is required');
    }

    await this.enforceRequestOtpLimits(normalizedEmail, ipAddress);

    const existingUser = await this.databaseService.query<UserRow & { is_official: boolean }>(
      `
        SELECT id, email, failed_otp_attempts, otp_locked_until, is_official
        FROM users
        WHERE email = $1;
      `,
      [normalizedEmail],
    );

    if (existingUser.rows.length === 0 || !existingUser.rows[0].is_official) {
      throw new BadRequestException('Email no registrado en la lista de funcionarios.');
    }

    const userResult = existingUser;

    const user = userResult.rows[0];
    const otp = randomInt(100000, 1000000).toString();
    const otpHash = this.hashOtp(normalizedEmail, otp);
    const ttlMinutes = Number(process.env.OTP_TTL_MINUTES ?? 10);

    await this.databaseService.query(
      `
        UPDATE otp_codes
        SET consumed_at = NOW()
        WHERE user_id = $1 AND consumed_at IS NULL;
      `,
      [user.id],
    );

    await this.databaseService.query(
      `
        INSERT INTO otp_codes (user_id, code_hash, expires_at)
        VALUES ($1, $2, NOW() + ($3 || ' minutes')::INTERVAL);
      `,
      [user.id, otpHash, ttlMinutes],
    );

    await this.mailService.sendOtp(normalizedEmail, otp);
  await this.recordSecurityEvent(normalizedEmail, ipAddress, 'request_otp');

    return {
      success: true,
      email: normalizedEmail,
      expiresInMinutes: ttlMinutes,
      message: 'OTP sent',
    };
  }

  async verifyOtp(email: string, otp: string, ipAddress = 'unknown') {
    const normalizedEmail = email.trim().toLowerCase();
    await this.enforceVerifyOtpIpLimit(ipAddress);
    await this.recordSecurityEvent(normalizedEmail, ipAddress, 'verify_otp_attempt');

    const userResult = await this.databaseService.query<UserRow>(
      `
        SELECT id, email, failed_otp_attempts, otp_locked_until
        FROM users
        WHERE email = $1
        LIMIT 1;
      `,
      [normalizedEmail],
    );

    const user = userResult.rows[0];
    if (user?.otp_locked_until && user.otp_locked_until > new Date()) {
      throw new UnauthorizedException('Demasiados intentos fallidos. Usuario bloqueado por 1 hora.');
    }

    const otpResult = await this.databaseService.query<OtpRow & UserRow>(
      `
        SELECT u.id, u.email, o.code_hash
        FROM users u
        JOIN otp_codes o ON o.user_id = u.id
        WHERE u.email = $1
          AND o.consumed_at IS NULL
          AND o.expires_at > NOW()
        ORDER BY o.created_at DESC
        LIMIT 1;
      `,
      [normalizedEmail],
    );

    const record = otpResult.rows[0];
    if (!record || this.hashOtp(normalizedEmail, otp) !== record.code_hash) {
      if (user) {
        const lockResult = await this.databaseService.query<Pick<UserRow, 'failed_otp_attempts'>>(
          `
            UPDATE users
            SET
              failed_otp_attempts = failed_otp_attempts + 1,
              otp_locked_until = CASE
                WHEN failed_otp_attempts + 1 >= $2 THEN NOW() + ($3 || ' minutes')::INTERVAL
                ELSE otp_locked_until
              END
            WHERE id = $1
            RETURNING failed_otp_attempts;
          `,
          [user.id, MAX_OTP_ATTEMPTS, this.getOtpLockMinutes()],
        );

        await this.recordSecurityEvent(normalizedEmail, ipAddress, 'verify_otp_fail');

        const attempts = lockResult.rows[0]?.failed_otp_attempts ?? 0;
        if (attempts >= MAX_OTP_ATTEMPTS) {
          throw new UnauthorizedException('Demasiados intentos fallidos. Usuario bloqueado por 1 hora.');
        }

        throw new UnauthorizedException(
          `OTP invalido o vencido. Intento ${attempts} de ${MAX_OTP_ATTEMPTS}.`,
        );
      }

      await this.recordSecurityEvent(normalizedEmail, ipAddress, 'verify_otp_fail');
      throw new UnauthorizedException('OTP invalido o vencido.');
    }

    const token = randomUUID();
    await this.databaseService.query(
      `
        UPDATE users
        SET failed_otp_attempts = 0,
            otp_locked_until = NULL
        WHERE id = $1;
      `,
      [record.id],
    );

    await this.databaseService.query(
      `
        UPDATE otp_codes
        SET consumed_at = NOW()
        WHERE user_id = $1 AND consumed_at IS NULL;
      `,
      [record.id],
    );

    await this.databaseService.query(
      `
        INSERT INTO sessions (user_id, token, expires_at)
        VALUES ($1, $2, NOW() + INTERVAL '30 days');
      `,
      [record.id, token],
    );

    await this.recordSecurityEvent(normalizedEmail, ipAddress, 'verify_otp_success');

    return {
      success: true,
      token,
      user: {
        id: record.id,
        email: record.email,
      },
    };
  }

  private hashOtp(email: string, otp: string) {
    return createHmac('sha256', this.getOtpHashSecret())
      .update(`${email}:${otp}`)
      .digest('hex');
  }

  private getOtpHashSecret() {
    return process.env.OTP_HASH_SECRET ?? 'edge-worldcup-dev-secret-change-me';
  }

  private getOtpLockMinutes() {
    return Number(process.env.OTP_LOCK_MINUTES ?? 60);
  }

  private getOtpRequestCooldownSeconds() {
    return Number(process.env.OTP_REQUEST_COOLDOWN_SECONDS ?? 45);
  }

  private getOtpRequestMaxPerEmailPerHour() {
    return Number(process.env.OTP_REQUEST_MAX_PER_EMAIL_PER_HOUR ?? 6);
  }

  private getOtpRequestMaxPerIpPerHour() {
    return Number(process.env.OTP_REQUEST_MAX_PER_IP_PER_HOUR ?? 30);
  }

  private getOtpVerifyMaxPerIpPer10Min() {
    return Number(process.env.OTP_VERIFY_MAX_PER_IP_PER_10MIN ?? 60);
  }

  private async enforceRequestOtpLimits(email: string, ipAddress: string) {
    const cooldownSeconds = this.getOtpRequestCooldownSeconds();
    const maxPerEmailHour = this.getOtpRequestMaxPerEmailPerHour();
    const maxPerIpHour = this.getOtpRequestMaxPerIpPerHour();

    const lastRequest = await this.databaseService.query<LastEventRow>(
      `
        SELECT created_at
        FROM otp_security_events
        WHERE user_email = $1
          AND event_type = 'request_otp'
        ORDER BY created_at DESC
        LIMIT 1;
      `,
      [email],
    );

    const lastCreatedAt = lastRequest.rows[0]?.created_at;
    if (lastCreatedAt) {
      const elapsedSeconds = Math.floor((Date.now() - new Date(lastCreatedAt).getTime()) / 1000);
      if (elapsedSeconds < cooldownSeconds) {
        throw this.tooManyRequests('Espera unos segundos antes de pedir otro OTP.');
      }
    }

    const emailCountResult = await this.databaseService.query<EventCountRow>(
      `
        SELECT COUNT(*)::text AS count
        FROM otp_security_events
        WHERE user_email = $1
          AND event_type = 'request_otp'
          AND created_at > NOW() - INTERVAL '1 hour';
      `,
      [email],
    );

    if (Number(emailCountResult.rows[0]?.count ?? '0') >= maxPerEmailHour) {
      throw this.tooManyRequests('Se alcanzo el limite de OTP por email. Intenta en una hora.');
    }

    const ipCountResult = await this.databaseService.query<EventCountRow>(
      `
        SELECT COUNT(*)::text AS count
        FROM otp_security_events
        WHERE ip_address = $1
          AND event_type = 'request_otp'
          AND created_at > NOW() - INTERVAL '1 hour';
      `,
      [ipAddress],
    );

    if (Number(ipCountResult.rows[0]?.count ?? '0') >= maxPerIpHour) {
      throw this.tooManyRequests('Demasiados OTP desde esta IP. Intenta en una hora.');
    }
  }

  private async enforceVerifyOtpIpLimit(ipAddress: string) {
    const maxPerIp10Min = this.getOtpVerifyMaxPerIpPer10Min();
    const verifyCountResult = await this.databaseService.query<EventCountRow>(
      `
        SELECT COUNT(*)::text AS count
        FROM otp_security_events
        WHERE ip_address = $1
          AND event_type = 'verify_otp_attempt'
          AND created_at > NOW() - INTERVAL '10 minutes';
      `,
      [ipAddress],
    );

    if (Number(verifyCountResult.rows[0]?.count ?? '0') >= maxPerIp10Min) {
      throw this.tooManyRequests('Demasiados intentos de validacion desde esta IP.');
    }
  }

  private async recordSecurityEvent(email: string, ipAddress: string, eventType: string) {
    await this.databaseService.query(
      `
        INSERT INTO otp_security_events (user_email, ip_address, event_type)
        VALUES ($1, $2, $3);
      `,
      [email, ipAddress, eventType],
    );
  }

  private tooManyRequests(message: string) {
    return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
