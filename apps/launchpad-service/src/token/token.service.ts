import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import BN from 'bn.js';
import {
  Raydium,
  TxVersion,
  getPdaLaunchpadConfigId,
  LAUNCHPAD_PROGRAM,
  LaunchpadConfig,
  txToBase64,
} from '@raydium-io/raydium-sdk-v2';
import { ConfigService } from '@mintjobs/config';
import {
  LAUNCHPAD_DEVNET_PROGRAM_ID,
  LAUNCHPAD_DEVNET_PLATFORM_ID,
  LAUNCHPAD_MAINNET_PLATFORM_ID,
} from '@mintjobs/constants';
import { Token } from './entities/token.entity';
import { CreateTokenDto, ConfirmTokenDto, FilterTokenDto, InitiateTokenDto } from './dto/token.dto';
import { PinataService } from './pinata.service';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly connection: Connection;

  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    private readonly configService: ConfigService,
    private readonly pinataService: PinataService,
  ) {
    const rpcUrl = this.configService.solana.rpcUrl;
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  private get network(): 'mainnet' | 'devnet' {
    return this.configService.solana.network ?? 'devnet';
  }

  private get programId(): PublicKey {
    return this.network === 'devnet' ? LAUNCHPAD_DEVNET_PROGRAM_ID : LAUNCHPAD_PROGRAM;
  }

  private get platformId(): PublicKey {
    const override = this.configService.solana.launchpadPlatformId;
    if (override) return new PublicKey(override);
    return this.network === 'devnet'
      ? LAUNCHPAD_DEVNET_PLATFORM_ID
      : LAUNCHPAD_MAINNET_PLATFORM_ID;
  }

  async create(userId: string, dto: CreateTokenDto): Promise<Token> {
    const token = this.tokenRepository.create({ userId, ...dto, confirmed: false });
    return this.tokenRepository.save(token);
  }

  /**
   * Verify the token creation tx landed on-chain, then mark token as confirmed.
   * Accepts either:
   *  - txSignature: tx was already broadcast by the frontend
   *  - signedTransaction: base64 signed tx — we broadcast it ourselves
   */
  async confirmToken(userId: string, dto: ConfirmTokenDto): Promise<Token> {
    let txSignature: string;

    if ('signedTransaction' in dto && dto.signedTransaction) {
      const txBytes = Buffer.from(dto.signedTransaction, 'base64');
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      txSignature = await this.connection.sendRawTransaction(txBytes);
      await this.connection.confirmTransaction(
        { signature: txSignature, blockhash, lastValidBlockHeight },
        'confirmed',
      );
    } else if (dto.txSignature) {
      txSignature = dto.txSignature;
    } else {
      throw new BadRequestException('Either txSignature or signedTransaction is required');
    }

    const txInfo = await this.connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!txInfo) {
      throw new BadRequestException('Transaction not found on-chain — it may not have landed yet');
    }
    if (txInfo.meta?.err) {
      throw new BadRequestException(`Transaction failed on-chain: ${JSON.stringify(txInfo.meta.err)}`);
    }

    this.logger.log(`Token creation tx confirmed: ${txSignature}`);

    const token = this.tokenRepository.create({
      userId,
      name: dto.name,
      symbol: dto.symbol,
      ca: dto.ca,
      description: dto.description,
      imageUrl: dto.imageUrl,
      txSignature,
      confirmed: true,
    });

    return this.tokenRepository.save(token);
  }

  /**
   * Build the unsigned Raydium launchpad creation transaction.
   * Uploads image + metadata to Pinata/IPFS, then returns serialized base64 tx(s) for the client to sign.
   * Network (mainnet/devnet) and program/platform IDs are driven by SOLANA_NETWORK env var.
   */
  async initiateToken(dto: InitiateTokenDto): Promise<{
    transactions: string[];
    mintAddress: string;
    imageUri: string;
    metadataUri: string;
    network: string;
  }> {
    const {
      name,
      symbol,
      description,
      website,
      twitter,
      telegram,
      decimals,
      buyAmount,
      slippage,
      walletPublicKey,
      tokenCA,
      imageBase64,
      imageFilename,
    } = dto;

    const programId = this.programId;
    const platformId = this.platformId;
    const network = this.network;

    this.logger.log(`Initiating token on ${network} — program: ${programId.toBase58()}`);

    let pair: Keypair;
    let mintAddress: string;

    if (tokenCA) {
      mintAddress = tokenCA;
      pair = Keypair.generate();
    } else {
      pair = Keypair.generate();
      mintAddress = pair.publicKey.toBase58();
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const { url: imageUri } = await this.pinataService.uploadFile(imageBuffer, imageFilename);

    const tokenMetadata = {
      name,
      symbol,
      description: description || '',
      external_url: website || '',
      twitter: twitter || '',
      telegram: telegram || '',
      website: website || '',
      image: imageUri,
      created_at: new Date().toISOString(),
      created_on: 'https://mintjobs.fun',
    };
    const { url: metadataUri } = await this.pinataService.uploadJson(
      tokenMetadata,
      `${symbol}-metadata`,
    );

    const raydium = await Raydium.load({
      owner: new PublicKey(walletPublicKey),
      connection: this.connection,
      cluster: network,
      disableFeatureCheck: true,
      disableLoadToken: true,
      blockhashCommitment: 'finalized',
    });

    const configIdObj = getPdaLaunchpadConfigId(programId, NATIVE_MINT, 0, 0);
    const configId = configIdObj.publicKey;

    const configData = await this.connection.getAccountInfo(configId);
    if (!configData) {
      throw new BadRequestException(
        `Launchpad config not found on ${network} — config PDA: ${configId.toBase58()}`,
      );
    }

    const configInfo = LaunchpadConfig.decode(configData.data);
    const mintBInfo = await raydium.token.getTokenInfo(configInfo.mintB);

    const buyAmountNum = buyAmount ? Number(buyAmount) : 0;
    const inAmount = buyAmountNum > 0
      ? new BN(Math.floor(buyAmountNum * 1_000_000_000))
      : new BN(1000);
    const createOnly = buyAmountNum <= 0;

    const { transactions } = await raydium.launchpad.createLaunchpad({
      programId,
      mintA: new PublicKey(mintAddress),
      decimals: decimals ?? 6,
      name,
      symbol,
      migrateType: 'cpmm',
      uri: metadataUri,
      configId,
      platformId,
      configInfo,
      mintBDecimals: mintBInfo.decimals,
      txVersion: TxVersion.V0,
      slippage: new BN(slippage ?? 100),
      buyAmount: inAmount,
      createOnly,
      extraSigners: [pair],
    });

    const serialized = transactions.map((tx) => txToBase64(tx));

    return { transactions: serialized, mintAddress, imageUri, metadataUri, network };
  }

  async findAll(filter: FilterTokenDto) {
    const page = filter.page ?? 1;
    const limit = Math.min(filter.limit ?? 20, 100);

    const [data, total] = await this.tokenRepository.findAndCount({
      where: { confirmed: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findMy(userId: string, filter: FilterTokenDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const [data, total] = await this.tokenRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findOne(id: string, userId: string): Promise<Token> {
    const token = await this.tokenRepository.findOne({ where: { id } });
    if (!token) throw new NotFoundException('Token not found');
    return token;
  }
}
