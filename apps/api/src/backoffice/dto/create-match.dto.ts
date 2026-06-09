import { IsDateString, IsString, Length, Matches } from 'class-validator';

export class CreateMatchDto {
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  homeCode!: string;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  awayCode!: string;

  @IsDateString()
  kickoff!: string;

  @IsString()
  @Length(3, 60)
  stage!: string;

  @IsString()
  @Length(2, 120)
  venue!: string;
}
