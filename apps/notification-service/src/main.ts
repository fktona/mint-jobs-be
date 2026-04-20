import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@mintjobs/config';
import { HttpExceptionFilter } from '@mintjobs/filters';
import { LoggingInterceptor } from '@mintjobs/interceptors';
import { ValidationPipe as CustomValidationPipe } from '@mintjobs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
    credentials: true,
  });

  // Use Socket.IO adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  app.useGlobalPipes(
    new CustomValidationPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const port = configService.services.notificationServicePort;
  await app.listen(port);

  console.log(`Notification Service running on: http://localhost:${port}`);
  console.log(`Socket.IO available on: ws://localhost:${port}`);
}

bootstrap();
