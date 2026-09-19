# 🚀 Environment Setup Guide

This guide will help you set up the **Front-Desk-AI-Orchestrator** project for development and testing.

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

| Tool | Version | Download Link | Verification Command |
|------|---------|---------------|---------------------|
| **Node.js** | v20+ | [https://nodejs.org](https://nodejs.org) | `node --version` |
| **npm** | v10+ | (Included with Node.js) | `npm --version` |
| **Git** | Latest | [https://git-scm.com](https://git-scm.com) | `git --version` |
| **Docker** (Optional) | v24+ | [https://docker.com](https://docker.com) | `docker --version` |
| **Chrome Browser** | Latest | [https://chrome.com](https://chrome.com) | `chrome --version` |

---

## 🛠️ Quick Setup (Recommended)

### Option 1: Using Docker (Easiest)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/tylerpeterson504/Front-Desk-AI-Orchestrator.git
   cd Front-Desk-AI-Orchestrator
   ```

2. **Create a `.env` file for Mistral API key:**
   ```bash
   echo MISTRAL_API_KEY=your_mistral_api_key_here > backend/.env
   ```

3. **Start all services with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

4. **Access the services:**
   - Backend API: [http://localhost:3001](http://localhost:3001)
   - Dashboard: [http://localhost:5173](http://localhost:5173)
   - PGAdmin (Database): [http://localhost:5050](http://localhost:5050)

5. **Stop all services:**
   ```bash
   docker-compose down
   ```

---

### Option 2: Local Development Setup

#### Step 1: Clone and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/tylerpeterson504/Front-Desk-AI-Orchestrator.git
cd Front-Desk-AI-Orchestrator

# Install all dependencies
npm install
cd backend && npm install && cd ..
cd dashboard && npm install && cd ..
cd extension && npm install && cd ..
```

#### Step 2: Configure Environment Variables

Create a `.env` file in the `backend` directory:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your actual values:

```env
# Required
MISTRAL_API_KEY=your_mistral_api_key_here
JWT_SECRET=your_very_strong_jwt_secret_here
DATABASE_URL=postgresql://username:password@localhost:5432/frontdesk_ai

# Optional
PORT=3001
NODE_ENV=development
WIFI_ENCRYPTION_KEY=your_aes_256_gcm_key_here
CORS_ORIGIN=http://localhost:5173
REGISTRATION_MODE=open
```

> **💡 Tip:** You can generate a strong JWT secret with:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

#### Step 3: Set Up PostgreSQL Database

You have two options:

**Option A: Use Docker (Recommended)**
```bash
docker run --name frontdesk-postgres -e POSTGRES_USER=frontdesk -e POSTGRES_PASSWORD=frontdesk123 -e POSTGRES_DB=frontdesk_ai -p 5432:5432 -d postgres:15-alpine
```

**Option B: Local PostgreSQL**
1. Install PostgreSQL from [https://postgresql.org](https://postgresql.org)
2. Create a database:
   ```sql
   CREATE DATABASE frontdesk_ai;
   CREATE USER frontdesk WITH PASSWORD 'frontdesk123';
   GRANT ALL PRIVILEGES ON DATABASE frontdesk_ai TO frontdesk;
   ```
3. Update `DATABASE_URL` in your `.env` file

#### Step 4: Run Database Migrations

```bash
cd backend
npx prisma migrate dev
```

#### Step 5: Start Development Servers

Open **three separate terminal windows** and run:

**Terminal 1: Backend Server**
```bash
cd backend
npm run dev
```

**Terminal 2: Dashboard**
```bash
cd dashboard
npm run dev
```

**Terminal 3: Build Extension**
```bash
cd extension
npm run build
```

---

## 🧪 Testing the Project

### Run All Tests

```bash
# From project root
./test-all.sh  # Linux/macOS
# OR
.\test-all.bat  # Windows
```

### Manual Testing

#### 1. Test Backend API

**Health Check:**
```bash
curl http://localhost:3001/health
# Expected: {"status":"ok"}
```

**Register a User:**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","name":"Test User"}'
```

**Login:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
# Save the returned token for authenticated requests
```

**Test Copilot (Mistral):**
```bash
curl -X POST http://localhost:3001/api/copilot/draft \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"prompt":"Create a welcome message for hotel guests"}'
```

#### 2. Test Dashboard

Open [http://localhost:5173](http://localhost:5173) in your browser.

- Test user registration and login
- Test the copilot functionality
- Verify all UI components render correctly

#### 3. Test Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked** and select the `extension/dist` folder
4. Test the extension with the dashboard

---

## 📊 Expected Results

| Component | URL | Expected Status |
|-----------|-----|-----------------|
| Backend API | http://localhost:3001/health | `{"status":"ok"}` |
| Dashboard | http://localhost:5173 | Loads without errors |
| API Docs | http://localhost:3001/api-docs | Swagger UI loads |
| Database | localhost:5432 | Connection successful |

---

## 🔧 Troubleshooting

### Common Issues and Solutions

#### 1. Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::3001
```
**Solution:**
```bash
# Find and kill the process using port 3001
lsof -i :3001  # macOS/Linux
# OR
netstat -ano | findstr :3001  # Windows
# Then kill the process
kill -9 <PID>  # macOS/Linux
# OR
taskkill /PID <PID> /F  # Windows
```

#### 2. Missing Environment Variables
```
Error: LLM_NOT_CONFIGURED
```
**Solution:**
Ensure `MISTRAL_API_KEY` is set in `backend/.env`

#### 3. Database Connection Failed
```
Error: Connection refused to localhost:5432
```
**Solution:**
- Ensure PostgreSQL is running
- Verify database credentials in `DATABASE_URL`
- Test connection: `psql -U frontdesk -d frontdesk_ai`

#### 4. Node.js Version Too Old
```
Error: Unsupported Node.js version
```
**Solution:**
- Install Node.js v20+ from [https://nodejs.org](https://nodejs.org)
- Use nvm to manage versions:
  ```bash
  nvm install 20
  nvm use 20
  ```

#### 5. Missing Dependencies
```
Error: Cannot find module 'express'
```
**Solution:**
```bash
cd backend
npm install
```

#### 6. TypeScript Errors
```
Error: Type 'X' is not assignable to type 'Y'
```
**Solution:**
```bash
cd backend
npm run typecheck
```

---

## 📝 Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MISTRAL_API_KEY` | ✅ Yes | - | Mistral AI API key |
| `JWT_SECRET` | ✅ Yes | - | Secret for JWT token generation |
| `DATABASE_URL` | ✅ Yes | - | PostgreSQL connection URL |
| `PORT` | ❌ No | 3001 | Backend server port |
| `NODE_ENV` | ❌ No | development | Node.js environment |
| `WIFI_ENCRYPTION_KEY` | ❌ No (Production: ✅ Yes) | - | AES-256-GCM key for WiFi password encryption |
| `CORS_ORIGIN` | ❌ No | * | Allowed origins for CORS |
| `REGISTRATION_MODE` | ❌ No | open | User registration mode (open, invite, closed) |
| `REGISTRATION_INVITE_TOKEN` | ❌ No | - | Required if REGISTRATION_MODE=invite |

### Dashboard (`dashboard/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | ❌ No | http://localhost:3001 | Backend API URL |

---

## 🎯 Getting Mistral API Key

1. Go to [https://mistral.ai](https://mistral.ai)
2. Sign up for an account
3. Navigate to **API Keys** in your account settings
4. Create a new API key
5. Copy the key and add it to your `.env` file:
   ```env
   MISTRAL_API_KEY=your_api_key_here
   ```

---

## 📚 Additional Resources

- [Mistral Documentation](https://docs.mistral.ai/)
- [Node.js Documentation](https://nodejs.org/docs/latest/api/)
- [Express.js Documentation](https://expressjs.com/)
- [Vite Documentation](https://vitejs.dev/)
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)

---

## 🙏 Support

If you encounter any issues not covered in this guide:

1. Check the [CONTRIBUTING.md](CONTRIBUTING.md) file
2. Review the [FINAL_MERGE_VERIFICATION.md](FINAL_MERGE_VERIFICATION.md) for additional setup details
3. Open an issue on GitHub with:
   - Steps to reproduce
   - Error messages
   - Your environment (Node.js version, OS, etc.)

---

**Happy Coding! 🚀**
