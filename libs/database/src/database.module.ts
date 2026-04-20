import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@mintjobs/config';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.database;
        return {
          type: 'postgres',
          host: dbConfig.host,
          port: dbConfig.port,
          username: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
          synchronize: dbConfig.synchronize,
          logging: dbConfig.logging,
          // entities: [__dirname + '/../**/*.entity{.ts,.js}'],
          autoLoadEntities: true,
          migrations: [dbConfig.migrationsDirectory + '/*{.ts,.js}'],
          migrationsRun: dbConfig.migrationsRun,
          migrationsTableName: dbConfig.migrationsTableName,
          namingStrategy: new SnakeNamingStrategy(),
          extra: {
            max: 20,
            connectionTimeoutMillis: 2000,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
