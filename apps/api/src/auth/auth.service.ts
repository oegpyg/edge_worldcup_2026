import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomInt, randomUUID } from 'crypto';

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

const MAX_OTP_ATTEMPTS = 3;
const OTP_LOCK_INTERVAL = '1 hour';

@Injectable()
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly mailService: MailService,
  ) {}

  async requestOtp(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Email is required');
    }

    const userResult = await this.databaseService.query<UserRow>(
      `
        INSERT INTO users (email)
        VALUES ($1)
        ON CONFLICT (email)
        DO UPDATE SET email = EXCLUDED.email
        RETURNING id, email;
      `,
      [normalizedEmail],
    );

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

    return {
      success: true,
      email: normalizedEmail,
      expiresInMinutes: ttlMinutes,
      message: 'OTP sent',
    };
  }

  async verifyOtp(email: string, otp: string) {
    const normalizedEmail = email.trim().toLowerCase();

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
                WHEN failed_otp_attempts + 1 >= $2 THEN NOW() + INTERVAL '${OTP_LOCK_INTERVAL}'
                ELSE otp_locked_until
              END
            WHERE id = $1
            RETURNING failed_otp_attempts;
          `,
          [user.id, MAX_OTP_ATTEMPTS],
        );

        const attempts = lockResult.rows[0]?.failed_otp_attempts ?? 0;
        if (attempts >= MAX_OTP_ATTEMPTS) {
          throw new UnauthorizedException('Demasiados intentos fallidos. Usuario bloqueado por 1 hora.');
        }

        throw new UnauthorizedException(
          `OTP invalido o vencido. Intento ${attempts} de ${MAX_OTP_ATTEMPTS}.`,
        );
      }

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
    return createHash('sha256').update(`${email}:${otp}`).digest('hex');
  }
}
