import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@mintjobs/config';
import { HttpExceptionFilter } from '@mintjobs/filters';
import { LoggingInterceptor } from '@mintjobs/interceptors';
import { ValidationPipe as CustomValidationPipe } from '@mintjobs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Global pipes
  app.useGlobalPipes(
    new CustomValidationPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(new LoggingInterceptor());

  const port = configService.services.launchpadServicePort;
  await app.listen(port);

  console.log(`🚀 Launchpad Service running on: http://localhost:${port}`);
}

bootstrap();
