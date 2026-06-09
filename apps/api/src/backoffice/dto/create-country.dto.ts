import { IsIn, IsString, Length, Matches } from 'class-validator';

export class CreateCountryDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  code!: string;

  @IsString()
  @IsIn(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
  groupName!: string;
}
