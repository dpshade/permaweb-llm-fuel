#!/bin/bash

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}$1${NC}"
    echo "$(printf '%*s' ${#1} '' | tr ' ' '=')"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check Vercel environment
if [ -z "$VERCEL_TOKEN" ]; then
    print_error "VERCEL_TOKEN environment variable not set"
    exit 1
fi

print_header "🚀 Preview Deployment (Vercel)"

echo "Building project..."
bun run build

echo "Running tests..."
bun run test

echo "Deploying to Vercel..."
cd dist
npx vercel --token "$VERCEL_TOKEN" --yes
cd ..

print_success "Preview deployment completed!"
echo "Vercel will provide the preview URL above" 