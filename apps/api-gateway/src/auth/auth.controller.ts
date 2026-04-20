import {
  Controller,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrivyService } from '@mintjobs/privy';
import { ResponseUtil } from '@mintjobs/utils';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly privyService: PrivyService) {}

  @Post('verify')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Verify a Privy access token',
    description:
      'Validates the Bearer token from the Authorization header and returns its decoded claims (userId, expiration, sessionId, etc.). Use this to confirm a token is still valid before making authenticated requests.',
  })
  async verifyToken(@Req() request: Request) {
    const token = this.privyService.extractTokenFromRequest(request);
    if (!token) {
      throw new UnauthorizedException('No access token provided');
    }
    const claims = await this.privyService.verifyAccessToken(token);
    return ResponseUtil.success(claims, 'Token is valid');
  }
}
