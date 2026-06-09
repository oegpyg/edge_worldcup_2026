import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GenerateDemoPredictionsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  count?: number;
}