import { IsBoolean, IsOptional } from 'class-validator';

export class DemoResetDto {
  @IsOptional()
  @IsBoolean()
  clearMatchResults?: boolean;

  @IsOptional()
  @IsBoolean()
  clearPremiumClaims?: boolean;
}
