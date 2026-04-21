import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PrivyClient, InvalidAuthTokenError } from '@privy-io/node';
import { ConfigService } from '@mintjobs/config';

export interface PrivyTokenClaims {
  appId: string;
  userId: string; // Privy DID (did:privy:...)
  issuer: string;
  issuedAt: number;
  expiration: number;
  sessionId: string;
}

export interface PrivyUser {
  id: string; // Privy DID
  wallet?: {
    address: string;
    walletClientType: string;
    chainType: string;
  };
  email?: {
    address: string;
  };
}

@Injectable()
export class PrivyService {
  private readonly logger = new Logger(PrivyService.name);
  private readonly privyClient: PrivyClient;
  private readonly authorizationKey: string;

  constructor(private configService: ConfigService) {
    const appId = this.configService.privy.appId;
    const appSecret = this.configService.privy.appSecret;
    const authorizationKey = this.configService.privy.authorizationKey;
    if (!appId || !appSecret || !authorizationKey) {
      throw new Error(
        'Privy app ID, app secret, and authorization key are required',
      );
    }

    this.authorizationKey = authorizationKey;

    this.privyClient = new PrivyClient({
      appId,
      appSecret,
    });

    this.logger.log('Privy client initialized');
  }

  /**
   * Verify access token from frontend
   * Returns verified claims if token is valid
   */
  async verifyAccessToken(accessToken: string): Promise<PrivyTokenClaims> {
    try {
      const verifiedClaims = await this.privyClient.utils().auth().verifyAuthToken(
        accessToken,
      );

      return {
        appId: verifiedClaims.app_id,
        userId: verifiedClaims.user_id,
        issuer: verifiedClaims.issuer,
        issuedAt: verifiedClaims.issued_at,
        expiration: verifiedClaims.expiration,
        sessionId: verifiedClaims.session_id,
      };
    } catch (error) {
      this.logger.error('Token verification failed', error);
      
      // Check if error is InvalidAuthTokenError and specifically for expired tokens
      if (error instanceof InvalidAuthTokenError) {
        const errorMessage = error.message || '';
        if (errorMessage.toLowerCase().includes('expired')) {
          throw new UnauthorizedException('Authentication token expired');
        }
      }
      
      // Never leak internal SDK error details to the caller
      throw new UnauthorizedException('Invalid access token');
    }
  }

  /**
   * Get user by Privy DID
   */
  async getUser(userId: string): Promise<PrivyUser | null> {
    try {
      const user = await this.privyClient.users()._get(userId);
      
      // Extract wallet from linked accounts (Privy uses snake_case)
      const linkedAccounts = (user as any).linked_accounts || [];
      const walletAccount = linkedAccounts.find(
        (account: any) => account.type === 'wallet',
      );
      const emailAccount = linkedAccounts.find(
        (account: any) => account.type === 'email',
      );

      return {
        id: user.id,
        wallet: walletAccount?.address
          ? {
              address: walletAccount.address,
              walletClientType: walletAccount.wallet_client_type || 'unknown',
              chainType: walletAccount.chain_type || 'unknown',
            }
          : undefined,
        email: emailAccount?.address
          ? {
              address: emailAccount.address,
            }
          : undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to get user ${userId}`, error);
      return null;
    }
  }

  /**
   * Get wallet by wallet ID
   */
  async getWallet(walletId: string) {
    try {
      const wallet = await this.privyClient.wallets().get(walletId);
      return wallet;
    } catch (error) {
      this.logger.error(`Failed to get wallet ${walletId}`, error);
      throw new UnauthorizedException('Wallet not found');
    }
  }

  /**
   * Get user's wallets from Privy.
   * Returns address, chainType, walletClientType, and (for Privy embedded
   * wallets) the wallet ID required for server-side signing.
   */
  async getUserWallets(userId: string): Promise<
    Array<{
      id?: string;
      address: string;
      walletClientType: string;
      chainType: string;
    }>
  > {
    try {
      const user = await this.privyClient.users()._get(userId);
      if (!user) throw new UnauthorizedException('User not found');

      const linkedAccounts = (user as any).linked_accounts || [];
      return linkedAccounts
        .filter((a: any) => a.type === 'wallet' && a.address)
        .map((a: any) => ({
          id: a.id as string | undefined,          // wallet:<id> for embedded wallets
          address: a.address as string,
          walletClientType: (a.wallet_client_type as string) || 'unknown',
          chainType: (a.chain_type as string) || 'unknown',
        }));
    } catch (error) {
      this.logger.error(`Failed to get wallets for user ${userId}`, error);
      throw new UnauthorizedException('Failed to fetch user wallets' );
    }
  }

  /**
   * Sign a Solana transaction server-side using a Privy embedded wallet.
   * @param walletId  Privy wallet ID (e.g. "wallet:xxxx")
   * @param base64Tx  Base64-encoded serialised Transaction (unsigned)
   * @param userJwt   User's Privy access token (for AuthorizationContext)
   * @returns Base64-encoded signed transaction ready for broadcast
   */
  async signSolanaTransaction(
    walletId: string,
    base64Tx: string,
    userJwt: string,
  ): Promise<string> {
    const result = await (this.privyClient.wallets() as any)
      .solana()
      .signTransaction(walletId, {
        transaction: base64Tx,
        authorization_context: {
          authorization_private_keys: [this.authorizationKey],
        },
      });
    return result.signedTransaction as string;
  }

  /**
   * Extract access token from request headers
   */
  extractTokenFromRequest(request: any): string | null {
    const authHeader = request.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Also check cookies if using HTTP-only cookies
    const cookieToken = request.cookies?.['privy-token'];
    if (cookieToken) {
      return cookieToken;
    }

    return null;
  }
}
