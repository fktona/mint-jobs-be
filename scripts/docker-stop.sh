#!/bin/bash

# Script to stop all infrastructure services

set -e

echo "🛑 Stopping MintJobs infrastructure services..."

docker-compose down

echo "✅ Infrastructure services stopped!"
