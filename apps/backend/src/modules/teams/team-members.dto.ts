import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export class AddTeamMemberDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsEnum(['ADMIN', 'MEMBER', 'VIEWER'])
  role!: 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export class UpdateTeamMemberRoleDto {
  @IsEnum(['ADMIN', 'MEMBER', 'VIEWER'])
  role!: 'ADMIN' | 'MEMBER' | 'VIEWER';
}
