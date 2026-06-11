import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SetPredictionLockDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  lockAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  stage2LockAt?: string;
}