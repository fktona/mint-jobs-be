import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ConfigService } from '@mintjobs/config';
import { HttpExceptionFilter } from '@mintjobs/filters';
import { LoggingInterceptor, TransformInterceptor } from '@mintjobs/interceptors';
import { ValidationPipe as CustomValidationPipe } from '@mintjobs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  const configService = app.get(ConfigService);

  // Security
  app.use(helmet());
  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: corsOrigins?.length ? corsOrigins : process.env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix(configService.app.apiPrefix);

  // Global pipes
  app.useGlobalPipes(
    new CustomValidationPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );
  if (configService.app.swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('MintJobs API')
      .setDescription('MintJobs.fun Web3 Job Marketplace API')
      .setVersion(configService.app.version)
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('auth', 'Authentication endpoints')
      .addTag('users', 'User management')
      .addTag('jobs', 'Job management')
      .addTag('escrow', 'Escrow management')
      .addTag('launchpad', 'Launchpad management')
      .addTag('notifications', 'Notification management')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.services.apiGatewayPort;
  await app.listen(port);

  console.log(`🚀 API Gateway running on: http://localhost:${port}`);
  console.log(`💬 Chat WebSocket: ws://localhost:${port}/ws/chat`);
  console.log(`🔔 Notification WebSocket: ws://localhost:${port}/ws/notifications`);
  if (configService.app.swaggerEnabled) {
    console.log(`📚 Swagger docs available at: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
