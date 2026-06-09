import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class DemoDistributionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  wave?: number;
}
