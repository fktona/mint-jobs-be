import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@mintjobs/config';
import { JwtRefreshPayload } from '@mintjobs/types';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: configService.auth.jwtRefreshSecret,
    });
  }

  async validate(payload: JwtRefreshPayload): Promise<JwtRefreshPayload> {
    if (!payload.sub || !payload.tokenId) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    return payload;
  }
}
