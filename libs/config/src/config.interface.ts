export interface AppConfig {
  name: string;
  version: string;
  port: number;
  env: 'development' | 'production' | 'test';
  apiPrefix: string;
  swaggerEnabled: boolean;
}

export interface PrivyConfig {
  appId: string;
  appSecret: string;
  authorizationKey: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
  migrationsRun: boolean;
  migrationsTableName: string;
  migrationsDirectory: string;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshSecret: string;
  jwtRefreshExpiresIn: string;
  bcryptRounds: number;
}

export interface RabbitMQConfig {
  url: string;
  exchange: string;
  prefetchCount: number;
  reconnectDelay: number;
  maxReconnectAttempts: number;
}

export interface AdminConfig {
  adminToken: string;
}

export interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface ServicesConfig {
  apiGatewayPort: number;
  authServicePort: number;
  userServicePort: number;
  jobServicePort: number;
  escrowServicePort: number;
  launchpadServicePort: number;
  notificationServicePort: number;
  uploadServicePort: number;
  chatServicePort: number;
}

export interface SolanaConfig {
  rpcUrl: string;
  authorityKeypair: string;
  programId: string;
}

export interface PinataConfig {
  jwt: string;
  gateway: string;
}

export interface AllConfigType {
  app: AppConfig;
  privy: PrivyConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
  rabbitmq: RabbitMQConfig;
  admin: AdminConfig;
  services: ServicesConfig;
  s3: S3Config;
  solana: SolanaConfig;
  pinata: PinataConfig;
}
