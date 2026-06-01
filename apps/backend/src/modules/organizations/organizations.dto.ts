import { IsString, IsNotEmpty } from 'class-validator';

export class ChangePlanDto {
  @IsString()
  @IsNotEmpty()
  planCode!: string;
}
