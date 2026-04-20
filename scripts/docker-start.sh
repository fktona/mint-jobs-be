#!/bin/bash

# Script to start all infrastructure services with Docker Compose

set -e

echo "🚀 Starting MintJobs infrastructure services..."

# Check if .env file exists
if [ ! -f .env ]; then
  echo "⚠️  .env file not found. Creating from .env.example..."
  cp .env.example .env
  echo "✅ Created .env file. Please update it with your configuration."
fi

# Start services
docker-compose up -d

echo ""
echo "✅ Infrastructure services started!"
echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "🔗 Service URLs:"
echo "  PostgreSQL:    localhost:${DB_PORT:-5432}"
echo "  RabbitMQ:      localhost:${RABBITMQ_PORT:-5672}"
echo "  RabbitMQ UI:   http://localhost:${RABBITMQ_MANAGEMENT_PORT:-15672} (admin/admin)"
echo "  Redis:         localhost:${REDIS_PORT:-6379}"
echo ""
echo "📝 To view logs: docker-compose logs -f"
echo "🛑 To stop:      docker-compose down"
echo "🗑️  To remove volumes: docker-compose down -v"
