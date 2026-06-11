import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, Length, Matches } from 'class-validator';

export class SavePredictionDto {
  @IsArray()
  @ArrayMinSize(32)
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @Length(3, 3, { each: true })
  @Matches(/^[A-Za-z]{3}$/, { each: true })
  qualifiedCodes!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsString({ each: true })
  @Length(3, 3, { each: true })
  @Matches(/^[A-Za-z]{3}$/, { each: true })
  finalistCodes?: string[];

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  championCode?: string;
}
