import { IsInt, Max, Min } from 'class-validator';

export class SetMatchResultDto {
  @IsInt()
  @Min(0)
  @Max(20)
  homeScore!: number;

  @IsInt()
  @Min(0)
  @Max(20)
  awayScore!: number;
}
