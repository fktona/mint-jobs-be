import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FollowDto {
  @ApiProperty({ example: '7xKXtg2Np...', description: 'Wallet address of the user to follow/unfollow' })
  @IsString()
  @MaxLength(255)
  walletAddress: string;
}
