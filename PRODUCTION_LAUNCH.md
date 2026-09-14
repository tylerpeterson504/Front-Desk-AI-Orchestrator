# 🚀 Front Desk AI Orchestrator - Production Launch Guide

**Version:** 1.0.0  
**Last Updated:** September 14, 2026  
**Status:** ✅ Ready for Production  
**Authorized By:** Tyler Peterson

---

## 📋 TABLE OF CONTENTS

1. [Pre-Requirements](#-pre-requirements)
2. [Production Environment Setup](#-production-environment-setup)
3. [Configuration Files](#-configuration-files)
4. [Database Setup](#-database-setup)
5. [Backend Deployment](#-backend-deployment)
6. [Dashboard Deployment](#-dashboard-deployment)
7. [Chrome Extension Deployment](#-chrome-extension-deployment)
8. [Start All Services](#-start-all-services)
9. [Verify Production Deployment](#-verify-production-deployment)
10. [Monitoring & Maintenance](#-monitoring--maintenance)
11. [Troubleshooting](#-troubleshooting)

---

## 📦 PRE-REQUIREMENTS

### System Requirements

| Component | Requirement | Notes |
|-----------|-------------|-------|
| **Node.js** | v18+ | Recommended: v20 LTS |
| **npm/yarn** | Latest | npm recommended |
| **PostgreSQL** | 14+ | Neon PostgreSQL recommended |
| **OS** | Linux/Windows/Mac | Linux recommended for production |
| **Memory** | 4GB+ | 8GB recommended |
| **CPU** | 2+ cores | 4 cores recommended |
| **Storage** | 10GB+ | For database and logs |

### Required Tools

```bash
# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# npm (comes with Node.js)
npm --version

# Git
sudo apt-get install -y git

# PostgreSQL client (optional - for local dev)
sudo apt-get install -y postgresql-client
```

---

## 🏗️ PRODUCTION ENVIRONMENT SETUP

### Option 1: Bare Metal Server (Recommended)

```bash
# Connect to your server
ssh root@your-server-ip

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install dependencies
sudo apt-get install -y curl wget git build-essential

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version  # Should be v20.x.x
npm --version   # Should be 10.x.x
```

### Option 2: Docker (Alternative)

If you prefer Docker, create a `Dockerfile` and `docker-compose.yml`:

**Dockerfile (backend):**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  backend:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
    restart: always
  
  dashboard:
    build:
      context: .
      dockerfile: Dockerfile.dashboard
    ports:
      - "3000:3000"
    restart: always
```

---

## 📝 CONFIGURATION FILES

### 1. Create `.env.production` Files

#### Backend Configuration (`backend/.env.production`)

```bash
# Create from template
cp backend/.env backend/.env.production

# Edit with production values
nano backend/.env.production
```

**Required Production Configuration:**

```env
# Environment
NODE_ENV=production
PORT=3001

# Database (use Neon or your PostgreSQL)
DATABASE_URL=postgresql://your_db_user:your_strong_password@your-db-host:5432/frontdesk_prod?sslmode=require

# Or individual settings
DB_HOST=your-db-host
DB_PORT=5432
DB_NAME=frontdesk_prod
DB_USER=your_db_user
DB_PASSWORD=your_strong_password

# Authentication - REGENERATE THESE FOR PRODUCTION!
JWT_SECRET=your_32_plus_character_random_string_here
JWT_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30
BCRYPT_ROUNDS=12

# Registration - RECOMMENDED: invite mode for production
REGISTRATION_MODE=invite
REGISTRATION_INVITE_TOKEN=your_long_random_invite_token_here

# Encryption - REGENERATE FOR PRODUCTION!
WIFI_ENCRYPTION_KEY=your_32_byte_base64_string_here

# CORS - Set your production domains
CORS_ORIGIN=https://your-dashboard-domain.com,chrome-extension://your_extension_id

# Seeding
RUN_SEEDS=false

# AI Configuration
MISTRAL_API_KEY=your_production_mistral_key
GEMINI_MODEL=gemini-1.5-flash
PERPLEXITY_API_KEY=your_perplexity_key
GOOGLE_API_KEY=your_google_key
HUGGINGFACE_TOKEN=your_hf_token

# S3 Storage
AWS_ENDPOINT_URL_S3=your_s3_endpoint
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region

# AI Gateway
NEON_AI_GATEWAY_TOKEN=your_neon_ai_token

# Server Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
```

**⚠️ IMPORTANT: Regenerate these for production:**

```bash
# Generate JWT_SECRET (32+ characters)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Generate WIFI_ENCRYPTION_KEY (32 bytes base64)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Generate REGISTRATION_INVITE_TOKEN
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

#### Dashboard Configuration (`dashboard/.env.production`)

```env
NODE_ENV=production
REACT_APP_API_URL=https://your-backend-domain.com
PUBLIC_URL=https://your-dashboard-domain.com
```

---

## 🗄️ DATABASE SETUP

### Option 1: Neon PostgreSQL (Recommended)

1. **Create Neon account:** [https://neon.tech](https://neon.tech)
2. **Create new project**
3. **Get connection string** from Neon dashboard
4. **Update `.env.production`:**
   ```env
   DATABASE_URL=postgresql://user:password@ep-...neon.tech/dbname?sslmode=require
   ```

### Option 2: Self-Hosted PostgreSQL

```bash
# Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Create database
sudo -u postgres psql -c "CREATE DATABASE frontdesk_prod;"

# Create user
sudo -u postgres psql -c "CREATE USER frontdesk_user WITH PASSWORD 'your_strong_password';"

# Grant permissions
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE frontdesk_prod TO frontdesk_user;"

# Update .env.production
DATABASE_URL=postgresql://frontdesk_user:your_strong_password@localhost:5432/frontdesk_prod
```

### Run Migrations

```bash
cd backend
npm install
npx ts-node db/migrate.ts
```

### Seed Database (Optional)

```bash
# Set RUN_SEEDS=true temporarily
cp .env.production .env
# Edit .env and set RUN_SEEDS=true
nano .env

# Run seed
npm run seed

# Restore production .env
cp .env.production .env
```

---

## 🔧 BACKEND DEPLOYMENT

### 1. Install Dependencies

```bash
cd backend
npm install --production
```

### 2. Build TypeScript

```bash
npm run build
```

### 3. Start Production Server

**Using npm:**
```bash
NODE_ENV=production node dist/index.js
```

**Using PM2 (Recommended for Production):**
```bash
# Install PM2 globally
npm install -g pm2

# Start backend with PM2
pm2 start dist/index.js --name "frontdesk-backend" --node-args="--max-old-space-size=4096"

# Save startup script
pm2 save
pm2 startup

# View logs
pm2 logs frontdesk-backend

# View status
pm2 list
```

### 4. Environment Variables with PM2

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'frontdesk-backend',
    script: 'dist/index.js',
    cwd: '/path/to/backend',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      DATABASE_URL: 'postgresql://...',
      JWT_SECRET: 'your_jwt_secret',
      // ... all other env vars
    },
    node_args: '--max-old-space-size=4096'
  }]
};
```

Start with:
```bash
pm2 start ecosystem.config.js
```

---

## 💻 DASHBOARD DEPLOYMENT

### 1. Install Dependencies

```bash
cd dashboard
npm install --production
```

### 2. Build for Production

```bash
npm run build
```

This creates optimized files in `build/` directory.

### 3. Serve Dashboard

**Option A: Using Nginx (Recommended)**

```nginx
# /etc/nginx/sites-available/frontdesk-dashboard

server {
    listen 80;
    server_name your-dashboard-domain.com;
    
    root /path/to/dashboard/build;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable and test:
```bash
sudo ln -s /etc/nginx/sites-available/frontdesk-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**Option B: Using serve (for testing)**
```bash
npm install -g serve
serve -s build -l 3000
```

**Option C: Using PM2**
```bash
pm2 serve build/ 3000 --name "frontdesk-dashboard" --spa
```

---

## 🧩 CHROME EXTENSION DEPLOYMENT

### 1. Build Extension

```bash
cd extension
npm install --production
npm run build
```

### 2. Package Extension

Create a ZIP file of the `dist/` folder:
```bash
cd extension
zip -r frontdesk-extension.zip dist/
```

### 3. Publish to Chrome Web Store

1. Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click "New Item"
3. Upload `frontdesk-extension.zip`
4. Fill in details:
   - Name: Front Desk AI Orchestrator
   - Description: Hotel front desk AI assistant
   - Icons: Add 16x16, 48x48, 128x128 icons
   - Screenshots: Add screenshots
5. Set manifest version: MV3
6. Submit for review

### 4. Update CORS Configuration

After publishing, update your `.env.production`:
```env
CORS_ORIGIN=https://your-dashboard-domain.com,chrome-extension://YOUR_EXTENSION_ID
```

Get extension ID from Chrome Web Store listing.

### 5. Load Extension for Testing

1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/dist` folder

---

## 🚀 START ALL SERVICES

### Method 1: Manual Startup

```bash
# Terminal 1: Backend
cd backend
NODE_ENV=production node dist/index.js

# Terminal 2: Dashboard (if using serve)
cd dashboard
serve -s build -l 3000

# Nginx should already be running for dashboard
```

### Method 2: Using PM2 (Recommended)

```bash
# Start backend
pm2 start backend/dist/index.js --name "frontdesk-backend" -i max

# Start dashboard (if using serve)
pm2 serve dashboard/build/ 3000 --name "frontdesk-dashboard" --spa

# Save and enable startup
pm2 save
pm2 startup

# View all processes
pm2 list

# View logs
pm2 monit
```

### Method 3: Systemd Services (Production Grade)

**Backend Service:** `/etc/systemd/system/frontdesk-backend.service`

```ini
[Unit]
Description=Front Desk AI Orchestrator Backend
After=network.target

[Service]
User=nodeuser
WorkingDirectory=/path/to/backend
ExecStart=/usr/bin/node dist/index.js
Environment=NODE_ENV=production
EnvironmentFile=/path/to/backend/.env.production
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=frontdesk-backend

[Install]
WantedBy=multi-user.target
```

**Dashboard Service:** `/etc/systemd/system/frontdesk-dashboard.service`

```ini
[Unit]
Description=Front Desk AI Orchestrator Dashboard
After=network.target

[Service]
User=nodeuser
WorkingDirectory=/path/to/dashboard
ExecStart=/usr/bin/serve -s build -l 3000
Environment=NODE_ENV=production
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable frontdesk-backend
sudo systemctl enable frontdesk-dashboard
sudo systemctl start frontdesk-backend
sudo systemctl start frontdesk-dashboard

# Check status
sudo systemctl status frontdesk-backend
sudo systemctl status frontdesk-dashboard
```

---

## ✅ VERIFY PRODUCTION DEPLOYMENT

### 1. Check Backend Health

```bash
# Check if backend is running
curl http://localhost:3001/health

# Expected response:
# {"status":"ok","timestamp":"2026-09-14T00:00:00.000Z"}
```

### 2. Check API Endpoints

```bash
# List all API endpoints
curl http://localhost:3001/api

# Test login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hotel.com","password":"admin123"}'
```

### 3. Check Dashboard

Open browser: `http://your-dashboard-domain.com` or `http://localhost:3000`

### 4. Check Database Connection

```bash
# Test database connection
psql postgresql://your_db_user:your_password@your-db-host:5432/frontdesk_prod -c "SELECT 1;"
```

### 5. Check Logs

```bash
# Backend logs (PM2)
pm2 logs frontdesk-backend

# Backend logs (Systemd)
sudo journalctl -u frontdesk-backend -f

# Nginx logs
sudo tail -f /var/log/nginx/error.log
```

---

## 📊 MONITORING & MAINTENANCE

### Health Checks

**Backend Health Endpoint:** `GET /health`

**Database Health:** `GET /api/db/health`

### Monitoring Tools

**PM2 Monitoring:**
```bash
pm2 monit
```

**System Monitoring:**
```bash
# CPU, Memory, Processes
htop

# Disk space
df -h

# Logs
journalctl -xe
```

### Backup Strategy

**Database Backup:**
```bash
# Daily backup
pg_dump postgresql://user:password@host:5432/dbname > /backups/frontdesk_$(date +%Y%m%d).sql
```

**Automated Backup Script:**
```bash
#!/bin/bash
BACKUP_DIR="/backups/frontdesk"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
pg_dump postgresql://user:password@host:5432/dbname > $BACKUP_DIR/backup_$DATE.sql

# Keep last 30 days
find $BACKUP_DIR -name "backup_*.sql" -mtime +30 -delete

# Compress
pigz $BACKUP_DIR/backup_$DATE.sql
```

### Maintenance Tasks

**Prune old sessions:**
```bash
cd backend
node db/prune-sessions.js
```

**Update dependencies:**
```bash
cd backend
npm outdated
npm update
npm run build
pm2 restart frontdesk-backend
```

---

## ❌ TROUBLESHOOTING

### Common Issues & Solutions

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| **Backend won't start** | Port 3001 in use | `lsof -i :3001` then kill process |
| **Database connection failed** | Wrong credentials | Verify `.env.production` |
| **500 Internal Server Error** | Check logs | `pm2 logs` or `journalctl -u frontdesk-backend` |
| **JWT token invalid** | Wrong secret | Regenerate JWT_SECRET |
| **CORS errors** | Origin not allowed | Update CORS_ORIGIN in .env |
| **401 Unauthorized** | Token expired | Login again or refresh token |
| **Extension not loading** | Wrong extension ID | Update CORS_ORIGIN with extension ID |
| **Dashboard blank** | Build failed | Rebuild: `npm run build` |

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug
```

Then check logs:
```bash
pm2 logs --lines 100
```

### Connection Issues

**Test database connection:**
```bash
psql postgresql://user:password@host:5432/dbname -c "SELECT version();"
```

**Test API endpoint:**
```bash
curl -v http://localhost:3001/api
```

### Reset Database

If you need to reset:
```bash
# Drop and recreate
psql -U postgres -c "DROP DATABASE IF EXISTS frontdesk_prod;"
psql -U postgres -c "CREATE DATABASE frontdesk_prod;"

# Run migrations
cd backend
npm run migrate

# Seed database
npm run seed
```

---

## 📞 SUPPORT & RESOURCES

### Documentation
- [Main README](../README.md)
- [Login Credentials](../LOGIN_CREDENTIALS.md)
- [Implementation Summary](../IMPLEMENTATION_SUMMARY.md)

### Contact
- **Author:** Tyler Peterson
- **Project:** Front Desk AI Orchestrator

### Next Steps

1. ✅ Set up production server
2. ✅ Configure `.env.production` with secure credentials
3. ✅ Set up database (Neon or self-hosted)
4. ✅ Deploy backend with PM2 or Systemd
5. ✅ Build and deploy dashboard
6. ✅ Package and publish Chrome extension
7. ✅ Test all services
8. ✅ Set up monitoring and backups

---

## 🎯 PRODUCTION CHECKLIST

- [ ] Server provisioned (4GB RAM, 2+ cores)
- [ ] Node.js v20+ installed
- [ ] PostgreSQL database configured
- [ ] `.env.production` created with secure credentials
- [ ] All secrets regenerated (JWT, encryption keys)
- [ ] Backend built (`npm run build`)
- [ ] Backend running with PM2/Systemd
- [ ] Dashboard built and served
- [ ] Database migrations run
- [ ] Database seeded (if needed)
- [ ] CORS configured correctly
- [ ] Chrome extension packaged
- [ ] Chrome extension published (optional)
- [ ] Nginx configured (if using)
- [ ] SSL certificates installed
- [ ] Health checks working
- [ ] Monitoring in place
- [ ] Backup strategy configured

---

**✅ Production Launch Guide Complete**

*Follow these steps to deploy your Front Desk AI Orchestrator to production.*
*For development, use `npm run dev` in the backend directory.*
