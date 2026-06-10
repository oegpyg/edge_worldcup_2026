import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class ImportOfficialsCsvDto {
  @IsString()
  @MinLength(1)
  csvContent!: string;

  @IsOptional()
  @IsBoolean()
  clearPreviousData?: boolean;
}
