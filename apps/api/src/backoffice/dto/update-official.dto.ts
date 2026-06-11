import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateOfficialDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsIn(['male', 'female'])
  sex?: 'male' | 'female';
}
