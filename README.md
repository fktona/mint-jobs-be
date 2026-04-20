# MintJobs.fun - Backend Microservices

> Production-ready NestJS microservices backend for a Web3 job marketplace

## 🏗️ Architecture

This is a **monorepo** containing multiple microservices:

- **API Gateway** - HTTP entry point, routes requests to services
- **Auth Service** - Authentication and authorization
- **User Service** - User management
- **Job Service** - Job posting and management
- **Escrow Service** - Escrow and payment handling
- **Launchpad Service** - Launchpad functionality
- **Notification Service** - Notifications and messaging

Services communicate via **RabbitMQ** for event-driven architecture.

## 📦 Tech Stack

- **NestJS** - Progressive Node.js framework
- **TypeScript** - Type-safe development
- **PostgreSQL** - Primary database
- **TypeORM** - ORM with migrations
- **RabbitMQ** - Message broker
- **JWT** - Authentication tokens
- **Passport** - Authentication strategies
- **Swagger** - API documentation
- **Pino** - Structured logging
- **Helmet** - Security headers
- **class-validator** - DTO validation

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- RabbitMQ 3.9+

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
```

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Application
APP_NAME=MintJobs
APP_VERSION=1.0.0
PORT=3000
NODE_ENV=development
API_PREFIX=api
SWAGGER_ENABLED=true

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=mintjobs
DB_SYNCHRONIZE=false
DB_LOGGING=true
DB_MIGRATIONS_RUN=true
DB_MIGRATIONS_TABLE_NAME=typeorm_migrations
DB_MIGRATIONS_DIRECTORY=migrations

# Auth
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_ROUNDS=10

# RabbitMQ
RABBITMQ_URL=amqp://admin:admin@localhost:5672
RABBITMQ_EXCHANGE=mintjobs.exchange
RABBITMQ_PREFETCH_COUNT=10
RABBITMQ_RECONNECT_DELAY=5000
RABBITMQ_MAX_RECONNECT_ATTEMPTS=10

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

### Running Services

```bash
# Start API Gateway
npm run start:api-gateway:dev

# Start Auth Service
npm run start:auth-service:dev

# Start User Service
npm run start:user-service:dev

# Start Job Service
npm run start:job-service:dev

# Start Escrow Service
npm run start:escrow-service:dev

# Start Launchpad Service
npm run start:launchpad-service:dev

# Start Notification Service
npm run start:notification-service:dev
```

### Docker Infrastructure

Start all infrastructure services (PostgreSQL, RabbitMQ, Redis) with Docker:

```bash
# Start infrastructure services
docker-compose up -d

# Or use the helper script
./scripts/docker-start.sh

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

**Service URLs:**
- PostgreSQL: `localhost:5432`
- RabbitMQ: `localhost:5672`
- RabbitMQ Management UI: `http://localhost:15672` (admin/admin)
- Redis: `localhost:6379`

**Note:** When using Docker, update your `.env` file:
- `DB_HOST=postgres` (or `localhost` if connecting from host)
- `RABBITMQ_URL=amqp://admin:admin@localhost:5672` (credentials: admin/admin)
- `REDIS_URL=redis://redis:6379` (or `redis://localhost:6379` from host)

### Database Migrations

```bash
# Generate migration
npm run migration:generate -- -n MigrationName

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

## 📁 Project Structure

```
mintjobs-backend/
├── apps/                    # Microservices
│   ├── api-gateway/         # HTTP API Gateway
│   ├── auth-service/        # Authentication service
│   ├── user-service/        # User management service
│   ├── job-service/         # Job management service
│   ├── escrow-service/     # Escrow service
│   ├── launchpad-service/   # Launchpad service
│   └── notification-service/# Notification service
│
├── libs/                    # Shared libraries
│   ├── common/             # Common DTOs and pipes
│   ├── config/              # Configuration management
│   ├── database/            # TypeORM setup and base entities
│   ├── auth/                # JWT, Passport, guards, decorators
│   ├── messaging/           # RabbitMQ messaging
│   ├── logger/              # Structured logging
│   ├── decorators/          # Custom decorators
│   ├── guards/              # Auth guards
│   ├── filters/             # Exception filters
│   ├── interceptors/        # Request/response interceptors
│   ├── utils/               # Utility functions
│   ├── constants/           # Constants and enums
│   └── types/               # TypeScript types and interfaces
│
├── scripts/                  # Utility scripts
└── .env.example             # Environment variables template
```

## 🔐 Authentication

The auth library provides:

- **JWT Strategy** - Access token validation
- **JWT Refresh Strategy** - Refresh token validation
- **Guards**:
  - `JwtAuthGuard` - Protect routes with JWT
  - `JwtRefreshGuard` - Validate refresh tokens
  - `RolesGuard` - Role-based access control
- **Decorators**:
  - `@CurrentUser()` - Get current authenticated user
  - `@Roles()` - Require specific roles
  - `@Public()` - Mark route as public

## 🗄️ Database

- **Base Entity** - All entities extend this with:
  - UUID primary key
  - `createdAt`, `updatedAt`, `deletedAt` timestamps
  - Soft deletes support
- **Snake Case** - Column naming strategy
- **Migrations** - TypeORM migrations configured

## 🐇 Messaging

RabbitMQ integration with:

- **Publisher Service** - Publish events
- **Consumer Service** - Subscribe to queues
- **Message Patterns** - Predefined event patterns
- **Correlation IDs** - Distributed tracing support

## 📚 API Documentation

Swagger is configured on the API Gateway:

- **Development**: `http://localhost:3000/api/docs`
- **Production**: Disabled by default (set `SWAGGER_ENABLED=true`)

## 🛠️ Development

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format

# Run tests
npm run test

# Run e2e tests
npm run test:e2e
```

### Git Hooks

Husky and lint-staged are configured to:
- Run ESLint and Prettier on staged files
- Prevent commits with linting errors

## 📦 Shared Libraries

All libraries are available via path aliases:

```typescript
import { ConfigService } from '@mintjobs/config';
import { BaseEntity } from '@mintjobs/database';
import { JwtAuthGuard } from '@mintjobs/auth';
import { PublisherService } from '@mintjobs/messaging';
import { LoggerService } from '@mintjobs/logger';
import { ResponseUtil } from '@mintjobs/utils';
```

## 📤 Standardized Responses

All API responses follow a consistent format using `ResponseUtil`:

```typescript
import { ResponseUtil } from '@mintjobs/utils';

// Simple success response
return ResponseUtil.success(data, 'Operation successful');

// Created response (201)
return ResponseUtil.created(data, 'Resource created');

// Paginated response
return ResponseUtil.paginated(items, meta, 'Resources retrieved');

// No content (204)
return ResponseUtil.noContent();

// Custom status
return ResponseUtil.withStatus(data, 202, 'Accepted');
```

The `TransformInterceptor` automatically wraps responses that aren't already formatted, ensuring consistency across all endpoints.

## 🔒 Security

- **Helmet** - Security headers
- **CORS** - Configurable CORS
- **JWT** - Secure token-based auth
- **Bcrypt** - Password hashing
- **Validation** - Input validation on all DTOs

## 📝 Next Steps

This is the **infrastructure-only** setup. To add features:

1. Create entities in respective services
2. Add controllers and routes
3. Implement business logic
4. Set up event handlers for RabbitMQ
5. Add tests

## 📄 License

UNLICENSED
