import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class ImportMatchesCsvDto {
  @IsString()
  @MinLength(1)
  csvContent!: string;

  @IsOptional()
  @IsBoolean()
  clearPreviousMatches?: boolean;
}
