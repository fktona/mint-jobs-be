import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ConfigService } from '@mintjobs/config';
import { HttpExceptionFilter } from '@mintjobs/filters';
import { LoggingInterceptor, TransformInterceptor } from '@mintjobs/interceptors';
import { ValidationPipe as CustomValidationPipe } from '@mintjobs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    credentials: true,
  });

  app.setGlobalPrefix(configService.app.apiPrefix);

  app.useGlobalPipes(
    new CustomValidationPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  if (configService.app.swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('MintJobs Upload Service')
      .setDescription('File upload endpoints for images, videos, and documents')
      .setVersion(configService.app.version)
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter Privy JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('upload', 'File upload endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.services.uploadServicePort;
  await app.listen(port);

  console.log(`🚀 Upload Service running on: http://localhost:${port}`);
  if (configService.app.swaggerEnabled) {
    console.log(`📚 Swagger docs available at: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
