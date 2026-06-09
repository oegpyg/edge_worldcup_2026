import { IsString, Length } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @Length(3, 80)
  username!: string;

  @IsString()
  @Length(4, 120)
  password!: string;
}
