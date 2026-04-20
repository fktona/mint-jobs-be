import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfigService } from '@mintjobs/config';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: ['.env.local', '.env'] });

const configService = new ConfigService(
  // This is a workaround for CLI usage
  // In actual services, ConfigService will be injected
  {} as any,
);

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'mintjobs',
  migrationsDirectory: process.env.DB_MIGRATIONS_DIRECTORY || 'migrations',
  migrationsTableName:
    process.env.DB_MIGRATIONS_TABLE_NAME || 'typeorm_migrations',
};

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.username,
  password: dbConfig.password,
  database: dbConfig.database,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../../' + dbConfig.migrationsDirectory + '/*{.ts,.js}'],
  migrationsTableName: dbConfig.migrationsTableName,
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: true,
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
