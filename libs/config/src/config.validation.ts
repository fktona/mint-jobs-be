import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  Max,
  Min,
  validateSync,
  IsBoolean,
  IsOptional,
  Matches,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  // App
  @IsString()
  APP_NAME: string;

  @IsString()
  APP_VERSION: string;

  @IsNumber()
  @Min(0)
  @Max(65535)
  PORT: number;

  // Service Ports
  @IsNumber()
  @Min(0)
  @Max(65535)
  API_GATEWAY_PORT: number;

  @IsNumber()
  @Min(0)
  @Max(65535)
  AUTH_SERVICE_PORT: number;

  @IsNumber()
  @Min(0)
  @Max(65535)
  USER_SERVICE_PORT: number;

  @IsNumber()
  @Min(0)
  @Max(65535)
  JOB_SERVICE_PORT: number;

  @IsNumber()
  @Min(0)
  @Max(65535)
  ESCROW_SERVICE_PORT: number;

  @IsNumber()
  @Min(0)
  @Max(65535)
  LAUNCHPAD_SERVICE_PORT: number;

  @IsNumber()
  @Min(0)
  @Max(65535)
  NOTIFICATION_SERVICE_PORT: number;

  @IsNumber()
  @Min(0)
  @Max(65535)
  UPLOAD_SERVICE_PORT: number;

  @IsNumber()
  @Min(0)
  @Max(65535)
  CHAT_SERVICE_PORT: number;

  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsString()
  API_PREFIX: string;

  @IsBoolean()
  SWAGGER_ENABLED: boolean;

  // Database
  @IsString()
  DB_HOST: string;

  @IsNumber()
  @Min(0)
  @Max(65535)
  DB_PORT: number;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_DATABASE: string;

  @IsBoolean()
  DB_SYNCHRONIZE: boolean;

  @IsBoolean()
  DB_LOGGING: boolean;

  @IsBoolean()
  DB_MIGRATIONS_RUN: boolean;

  @IsString()
  DB_MIGRATIONS_TABLE_NAME: string;

  @IsString()
  DB_MIGRATIONS_DIRECTORY: string;

  // Auth
  @IsString()
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRES_IN: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN: string;

  @IsNumber()
  @Min(4)
  @Max(20)
  BCRYPT_ROUNDS: number;

  // RabbitMQ
  @Matches(/^amqp:\/\/.+/, {
    message: 'RABBITMQ_URL must be a valid AMQP URL (e.g., amqp://localhost:5672)',
  })
  RABBITMQ_URL: string;

  @IsString()
  RABBITMQ_EXCHANGE: string;

  @IsNumber()
  @Min(1)
  RABBITMQ_PREFETCH_COUNT: number;

  @IsNumber()
  @Min(1000)
  RABBITMQ_RECONNECT_DELAY: number;

  @IsNumber()
  @Min(1)
  RABBITMQ_MAX_RECONNECT_ATTEMPTS: number;

  // Admin
  @IsString()
  ADMIN_TOKEN: string;

  // Privy
  @IsString()
  PRIVY_APP_ID: string;

  @IsString()
  PRIVY_APP_SECRET: string;

  @IsString()
  PRIVY_AUTHORIZATION_KEY: string;

  // AWS S3
  @IsString()
  AWS_REGION: string;

  /** S3 bucket region; use when shell/AWS CLI sets AWS_REGION to a different default. */
  @IsOptional()
  @IsString()
  AWS_S3_REGION?: string;

  @IsString()
  AWS_ACCESS_KEY_ID: string;

  @IsString()
  AWS_SECRET_ACCESS_KEY: string;

  @IsString()
  AWS_S3_BUCKET: string;

  // Solana
  @IsOptional()
  @IsString()
  SOLANA_RPC_URL?: string;

  @IsOptional()
  @IsString()
  SOLANA_AUTHORITY_KEYPAIR?: string;

  @IsOptional()
  @IsString()
  SOLANA_PROGRAM_ID?: string;

  // Pinata / IPFS
  @IsOptional()
  @IsString()
  PINATA_JWT?: string;

  @IsOptional()
  @IsString()
  PINATA_GATEWAY?: string;
}

export function validateConfig(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return {
    app: {
      name: validatedConfig.APP_NAME,
      version: validatedConfig.APP_VERSION,
      port: validatedConfig.PORT,
      env: validatedConfig.NODE_ENV,
      apiPrefix: validatedConfig.API_PREFIX,
      swaggerEnabled: validatedConfig.SWAGGER_ENABLED,
    },
    privy: {
      appId: validatedConfig.PRIVY_APP_ID,
      appSecret: validatedConfig.PRIVY_APP_SECRET,
      authorizationKey: validatedConfig.PRIVY_AUTHORIZATION_KEY,
    },
    database: {
      host: validatedConfig.DB_HOST,
      port: validatedConfig.DB_PORT,
      username: validatedConfig.DB_USERNAME,
      password: validatedConfig.DB_PASSWORD,
      database: validatedConfig.DB_DATABASE,
      synchronize: validatedConfig.DB_SYNCHRONIZE,
      logging: validatedConfig.DB_LOGGING,
      migrationsRun: validatedConfig.DB_MIGRATIONS_RUN,
      migrationsTableName: validatedConfig.DB_MIGRATIONS_TABLE_NAME,
      migrationsDirectory: validatedConfig.DB_MIGRATIONS_DIRECTORY,
    },
    auth: {
      jwtSecret: validatedConfig.JWT_SECRET,
      jwtExpiresIn: validatedConfig.JWT_EXPIRES_IN,
      jwtRefreshSecret: validatedConfig.JWT_REFRESH_SECRET,
      jwtRefreshExpiresIn: validatedConfig.JWT_REFRESH_EXPIRES_IN,
      bcryptRounds: validatedConfig.BCRYPT_ROUNDS,
    },
    rabbitmq: {
      url: validatedConfig.RABBITMQ_URL,
      exchange: validatedConfig.RABBITMQ_EXCHANGE,
      prefetchCount: validatedConfig.RABBITMQ_PREFETCH_COUNT,
      reconnectDelay: validatedConfig.RABBITMQ_RECONNECT_DELAY,
      maxReconnectAttempts: validatedConfig.RABBITMQ_MAX_RECONNECT_ATTEMPTS,
    },
    admin: {
      adminToken: validatedConfig.ADMIN_TOKEN,
    },
    s3: {
      region: validatedConfig.AWS_S3_REGION || validatedConfig.AWS_REGION,
      accessKeyId: validatedConfig.AWS_ACCESS_KEY_ID,
      secretAccessKey: validatedConfig.AWS_SECRET_ACCESS_KEY,
      bucket: validatedConfig.AWS_S3_BUCKET,
    },
    services: {
      apiGatewayPort: validatedConfig.API_GATEWAY_PORT,
      authServicePort: validatedConfig.AUTH_SERVICE_PORT,
      userServicePort: validatedConfig.USER_SERVICE_PORT,
      jobServicePort: validatedConfig.JOB_SERVICE_PORT,
      escrowServicePort: validatedConfig.ESCROW_SERVICE_PORT,
      launchpadServicePort: validatedConfig.LAUNCHPAD_SERVICE_PORT,
      notificationServicePort: validatedConfig.NOTIFICATION_SERVICE_PORT,
      uploadServicePort: validatedConfig.UPLOAD_SERVICE_PORT,
      chatServicePort: validatedConfig.CHAT_SERVICE_PORT,
    },
    solana: {
      rpcUrl: validatedConfig.SOLANA_RPC_URL,
      authorityKeypair: validatedConfig.SOLANA_AUTHORITY_KEYPAIR,
      programId: validatedConfig.SOLANA_PROGRAM_ID || '',
    },
    pinata: {
      jwt: validatedConfig.PINATA_JWT || '',
      gateway: validatedConfig.PINATA_GATEWAY || 'https://gateway.pinata.cloud',
    },
  };
}
