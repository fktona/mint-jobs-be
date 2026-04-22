import { IsString, MaxLength } from 'class-validator';

export class FollowDto {
  @IsString()
  @MaxLength(255)
  walletAddress: string;
}
