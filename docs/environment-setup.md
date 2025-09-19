# Environment Configuration Guide

## Overview

This document provides a comprehensive guide for setting up environment variables for the NFT Education Platform.

## Quick Setup

1. Copy the example configuration below to a `.env` file in the project root
2. Fill in your actual values
3. **Never commit .env files to version control**

## Environment Variables

### General Settings
```bash
NODE_ENV=development
PORT=3000
DEBUG=true
LOG_LEVEL=info
```

### Database Configuration
```bash
# MongoDB
MONGODB_URI=mongodb://localhost:27017/nft-education

# PostgreSQL (alternative)
DATABASE_URL=postgres://user:password@localhost:5432/educhain

# Redis (optional, for caching and sessions)
REDIS_URL=redis://localhost:6379
```

### Authentication & Security
```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here-change-in-production
JWT_EXPIRES_IN=24h

# API Keys
SECRET_KEY=your-secret-key-change-in-production
API_KEY=your-api-key-for-external-access

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key
```

### Email Configuration
```bash
# SMTP Settings (for development, use services like Mailtrap)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-app-password

# Alternative: SendGrid
MAILER_PROVIDER=sendgrid
MAILER_API_KEY=your-sendgrid-api-key
MAILER_FROM=no-reply@yourdomain.com
```

### Blockchain Configuration
```bash
# Network Configuration
POLYGON_RPC_URL=https://polygon-rpc.com
POLYGON_MUMBAI_RPC_URL=https://rpc-mumbai.maticvigil.com
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your-infura-key

# Chain Information
POLYGON_MAINNET_CHAIN_ID=137
POLYGON_MUMBAI_CHAIN_ID=80001
ETHEREUM_MAINNET_CHAIN_ID=1

# Contract Addresses (After deployment)
CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
UPGRADEABLE_PROXY_ADDRESS=0x0000000000000000000000000000000000000000

# Private Keys (Use test accounts for development)
PRIVATE_KEY=0x1234567890123456789012345678901234567890123456789012345678901234
SERVICE_PRIVATE_KEY=0x1234567890123456789012345678901234567890123456789012345678901234

# Gas Settings
GAS_PRICE=40000000000
GAS_LIMIT=5000000

# Deployment Settings
CONFIRMATIONS=5
TIMEOUT=600000
```

### IPFS Configuration
```bash
# Infura IPFS Settings
IPFS_HOST=ipfs.infura.io
IPFS_PORT=5001
IPFS_PROTOCOL=https
IPFS_API_KEY=your-infura-api-key
IPFS_API_SECRET=your-infura-api-secret
```

### Frontend Configuration
```bash
# React App Settings
REACT_APP_API_URL=http://localhost:3000/api
REACT_APP_ENV=development
FRONTEND_URL=http://localhost:3000

# Web3 Settings
REACT_APP_CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
REACT_APP_CHAIN_ID=137
REACT_APP_CHAIN_NAME=Polygon Mainnet
REACT_APP_RPC_URL=https://polygon-rpc.com

# Magic Link (Email Wallet)
REACT_APP_MAGIC_API_KEY=pk_live_1234567890abcdef

# Feature Flags
REACT_APP_ENABLE_WEB3=true
REACT_APP_ENABLE_IPFS=true
REACT_APP_ENABLE_DID=true

# Analytics (Optional)
REACT_APP_GA_TRACKING_ID=GA_MEASUREMENT_ID
```

### AI Service Configuration
```bash
# API Configuration
API_HOST=0.0.0.0
API_PORT=8000

# Model Configuration
MODEL_CACHE_DIR=./models/cache
SENTENCE_TRANSFORMER_MODEL=sentence-transformers/all-MiniLM-L6-v2
TEXT_CLASSIFICATION_MODEL=microsoft/DialoGPT-medium
NER_MODEL=dbmdz/bert-large-cased-finetuned-conll03-english

# AI Evaluation Settings
SIMILARITY_THRESHOLD=0.7
CONFIDENCE_THRESHOLD=0.8
MAX_TOKENS=512
BATCH_SIZE=16
```

### External API Keys
```bash
# Etherscan/Block Explorers
POLYGONSCAN_API_KEY=your-polygonscan-api-key
ETHERSCAN_API_KEY=your-etherscan-api-key

# AI Services (OpenAI, etc.)
OPENAI_API_KEY=your-openai-api-key
AI_API_KEY=your-ai-service-api-key
```

### Integration Settings
```bash
# HRIS Integration
HRIS_ENDPOINT=https://hris.example/api
HRIS_API_KEY=your-hris-api-key

# Enterprise Integration
ENTERPRISE_HRIS_ENDPOINT=https://enterprise-hris.example/api
ENTERPRISE_HRIS_API_KEY=your-enterprise-hris-api-key
```

### Monitoring & Logging
```bash
# Sentry (Error Tracking)
SENTRY_DSN=your-sentry-dsn

# Log Files
LOG_FILE_PATH=./logs/app.log
ERROR_LOG_FILE_PATH=./logs/error.log
```

### Development Settings
```bash
# CORS Settings
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads
```

## Production Checklist

Before deploying to production, ensure you have:

- [ ] Changed all default passwords and secrets
- [ ] Updated database URLs to production instances
- [ ] Configured proper SSL certificates
- [ ] Set `NODE_ENV=production`
- [ ] Configured monitoring and alerts
- [ ] Updated CORS origins for production domains
- [ ] Verified all API keys are valid
- [ ] Tested backup and recovery procedures

## Service-Specific Setup

### Backend Setup
The backend uses the main `.env` file in the project root.

### Frontend Setup
Create a `.env.local` file in the `frontend/` directory with React-specific variables.

### AI Service Setup
Create a `.env` file in the `ai-service/` directory.

### Smart Contracts Setup
Create a `.env` file in the `smart-contracts/` directory.

## Security Notes

- Never commit `.env` files to version control
- Use strong, unique secrets in production
- Rotate API keys regularly
- Use environment-specific configuration
- Implement proper secret management (e.g., AWS Secrets Manager, HashiCorp Vault)
