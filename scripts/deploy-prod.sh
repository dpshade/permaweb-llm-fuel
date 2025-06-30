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

# Check Arweave environment
if [ -z "$DEPLOY_KEY" ]; then
    print_error "DEPLOY_KEY environment variable not set"
    echo "   Set your Arweave wallet JWK as DEPLOY_KEY"
    exit 1
fi

if [ -z "$ANT_PROCESS" ]; then
    print_error "ANT_PROCESS environment variable not set"
    echo "   Set your ANT process ID as ANT_PROCESS"
    exit 1
fi

print_header "🚀 Production Deployment (Arweave)"

echo "Deploying to Arweave..."
npx permaweb-deploy \
    --ant-process="$ANT_PROCESS" \
    --arns-name="permaweb-llms-builder" \
    --deploy-folder="dist" \
    --verbose

print_success "Production deployment completed!"
echo "Available at: https://permaweb-llms-builder.ar.io" 