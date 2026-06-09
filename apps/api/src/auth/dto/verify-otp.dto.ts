import { IsEmail, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail()
  email!: string;

  @Length(6, 6)
  @Matches(/^\d{6}$/)
  otp!: string;
}
