import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GenerateDemoMatchesDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  count?: number;
}