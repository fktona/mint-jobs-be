import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import {
  AllConfigType,
  AppConfig,
  AuthConfig,
  DatabaseConfig,
  RabbitMQConfig,
  AdminConfig,
  ServicesConfig,
  PrivyConfig,
  S3Config,
  SolanaConfig,
  PinataConfig,
} from './config.interface';

@Injectable()
export class ConfigService {
  constructor(private nestConfigService: NestConfigService<AllConfigType>) {}

  get app(): AppConfig {
    return this.nestConfigService.getOrThrow('app', { infer: true });
  }

  get privy(): PrivyConfig {
    return this.nestConfigService.getOrThrow('privy', { infer: true });
  }

  get database(): DatabaseConfig {
    return this.nestConfigService.getOrThrow('database', { infer: true });
  }

  get auth(): AuthConfig {
    return this.nestConfigService.getOrThrow('auth', { infer: true });
  }

  get rabbitmq(): RabbitMQConfig {
    return this.nestConfigService.getOrThrow('rabbitmq', { infer: true });
  }

  get admin(): AdminConfig {
    return this.nestConfigService.getOrThrow('admin', { infer: true });
  }

  get services(): ServicesConfig {
    return this.nestConfigService.getOrThrow('services', { infer: true });
  }

  get s3(): S3Config {
    return this.nestConfigService.getOrThrow('s3', { infer: true });
  }

  get solana(): SolanaConfig {
    return this.nestConfigService.getOrThrow('solana', { infer: true });
  }

  get pinata(): PinataConfig {
    return this.nestConfigService.getOrThrow('pinata', { infer: true });
  }

  get<T extends keyof AllConfigType>(key: T): AllConfigType[T] {
    return this.nestConfigService.getOrThrow(key, { infer: true });
  }
}
