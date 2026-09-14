# 🏃 RUN PROJECT - Complete Guide

**Last Updated:** September 14, 2026  
**Status:** ⚠️ Requires Node.js v22+  
**Authorized By:** Tyler Peterson

---

## ⚠️ **IMPORTANT - READ FIRST**

**This project requires Node.js v22 or higher.**

Your current Node.js version: **v20.18.3** ❌
Required Node.js version: **v22+** ✅

**Solution:** Install Node.js v22+ from https://nodejs.org/

---

## 🚀 **QUICK START (After Installing Node.js v22+)**

### **Option 1: Use Launch Script (Recommended)**

**Windows:**
```cmd
cd C:\Users\Front Desk\Front-Desk-AI-Orchestrator-main
LAUNCH_NOW.bat
```

**Unix/Linux/Mac:**
```bash
cd /path/to/Front-Desk-AI-Orchestrator-main
chmod +x launch_production.sh
./launch_production.sh
```

The script will:
- ✅ Set up environment
- ✅ Install PM2
- ✅ Install dependencies
- ✅ Build TypeScript
- ✅ Start backend with PM2
- ✅ Build and start dashboard
- ✅ Verify deployment
- ✅ Display access URLs

---

## 📋 **MANUAL RUN INSTRUCTIONS**

### **Step 1: Install Node.js v22+**

**Download from:** https://nodejs.org/
**Recommended:** Node.js 22.x (LTS)

**Verify installation:**
```bash
node --version  # Should be v22.x.x
npm --version   # Should be 10.x.x
```

---

### **Step 2: Install Dependencies**

```bash
cd backend
npm install
```

This installs all required packages including:
- Express
- TypeORM
- PostgreSQL driver (pg)
- bcrypt
- jsonwebtoken
- And 200+ other dependencies

---

### **Step 3: Configure Environment**

```bash
cd backend
# For development:
cp .env.example .env

# For production:
cp .env.production .env
# Edit .env and replace all YOUR_* placeholders
```

**Required for database connection:**
```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

**For development (quick start):**
```env
DATABASE_URL=postgresql://neondb_owner:npg_3GnjVL2kyQbd@ep-sweet-rice-axacicig-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require
```

---

### **Step 4: Run Database Migrations**

```bash
cd backend
npx ts-node db/migrate.ts
```

This creates all database tables:
- users
- properties
- templates
- shift_notes
- audit_logs
- refresh_tokens

---

### **Step 5: Seed Database (Optional)**

```bash
cd backend
npm run seed
```

This creates default users:
- Admin: `admin@hotel.com` / `admin123`
- Agent: `agent@hotel.com` / `agent123`
- Demo: `demo@example.com` / `password123`

**Note:** Requires `RUN_SEEDS=true` in `.env`

---

### **Step 6: Start Backend Server**

**Option A: Development Mode (Hot Reload)**
```bash
cd backend
npm run dev
```

Server starts on: http://localhost:3001
Auto-reloads on code changes

**Option B: Production Mode**
```bash
cd backend
npm run build
npm start
```

Server starts on: http://localhost:3001
Optimized for production

**Option C: With PM2 (Recommended for Production)**
```bash
# Install PM2 globally
npm install -g pm2

# Start backend
pm2 start dist/index.js --name "backend" -i max

# Or in development mode
pm2 start src/index.ts --name "backend" --interpreter "node" -i max

# Save startup
pm2 save
pm2 startup
```

---

### **Step 7: Start Dashboard**

```bash
cd dashboard
npm install
npm run start
```

Dashboard starts on: http://localhost:3000

**With PM2:**
```bash
cd dashboard
npm install
npm run build
pm2 serve build/ 3000 --name "dashboard" --spa
```

---

### **Step 8: Start Chrome Extension (Optional)**

```bash
cd extension
npm install
npm run build
```

Then load in Chrome:
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `extension/dist` folder

---

## 🔧 **RUN SCRIPTS REFERENCE**

### **Backend Scripts** (`backend/package.json`)

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run dev` | `ts-node-dev src/index.ts` | Development mode with hot reload |
| `npm start` | `node dist/index.js` | Production mode (requires build) |
| `npm run build` | `tsc` | Compile TypeScript to JavaScript |
| `npm run migrate` | `node db/migrate.js` | Run database migrations |
| `npm run seed` | `node db/seed-runner.js` | Seed database with sample data |
| `npm test` | `jest --runInBand` | Run all tests |
| `npm run lint` | `eslint src --ext .js,.ts` | Lint code |
| `npm run typecheck` | `tsc --noEmit` | Type checking |

### **Dashboard Scripts** (`dashboard/package.json`)

| Script | Command | Purpose |
|--------|---------|---------|
| `npm start` | `react-scripts start` | Development mode |
| `npm run build` | `react-scripts build` | Production build |
| `npm test` | `react-scripts test` | Run tests |
| `npm run eject` | `react-scripts eject` | Eject configuration |

### **Extension Scripts** (`extension/package.json`)

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run build` | `vite build` | Production build |

---

## 📊 **SERVICE URLs**

| Component | URL | Port | Status |
|-----------|-----|------|--------|
| Backend API | `http://localhost:3001` | 3001 | ✅ Running |
| Backend Health | `http://localhost:3001/health` | 3001 | ✅ Running |
| API Documentation | `http://localhost:3001/api` | 3001 | ✅ Running |
| Dashboard | `http://localhost:3000` | 3000 | ❌ Not started |
| GraphQL Playground | `http://localhost:3001/graphql` | 3001 | ❌ Not configured |

---

## 🔐 **LOGIN & AUTHENTICATION**

### **Default Users (After Seeding)**

| Email | Password | Role |
|-------|----------|------|
| `admin@hotel.com` | `admin123` | admin |
| `agent@hotel.com` | `agent123` | agent |
| `demo@example.com` | `password123` | agent |

### **Get JWT Token**

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hotel.com","password":"admin123"}'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 900,
  "refresh_token": "abc123...",
  "refresh_expires_at": "2026-09-15T00:00:00.000Z",
  "user": {
    "id": "uuid",
    "email": "admin@hotel.com",
    "name": "Admin User",
    "role": "admin"
  }
}
```

### **Use JWT Token**

```bash
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 🛠 **DEVELOPMENT WORKFLOW**

### **Typical Development Session**

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Dashboard
cd dashboard
npm start

# Terminal 3: Extension (optional)
cd extension
npm run build
# Then load in Chrome
```

### **Run Tests**

```bash
cd backend
npm test
```

### **Type Checking**

```bash
cd backend
npm run typecheck
```

### **Linting**

```bash
cd backend
npm run lint
npm run lint:fix  # Auto-fix issues
```

---

## ⚡ **QUICK COMMANDS**

### **Start Everything**
```bash
# Backend in dev mode
cd backend && npm run dev &

# Dashboard in dev mode
cd dashboard && npm start &
```

### **Stop Everything**
```bash
# Find and kill Node processes
pkill -f "node"  # Unix/Mac
# OR
taskkill /F /IM node.exe  # Windows
```

### **Rebuild Everything**
```bash
cd backend && npm run build
cd dashboard && npm run build
```

### **Clean Install**
```bash
cd backend && rm -rf node_modules && npm install
cd dashboard && rm -rf node_modules && npm install
cd extension && rm -rf node_modules && npm install
```

---

## 🐛 **COMMON ISSUES & FIXES**

### **Issue: Node.js version too old**
**Error:** `ERR_REQUIRE_ESM` or `Node.js v22+ required`
**Fix:** Install Node.js v22+ from https://nodejs.org/

### **Issue: Database connection failed**
**Error:** `Connection refused` or `Authentication failed`
**Fix:**
1. Check `.env` file has correct DATABASE_URL
2. Verify database server is running
3. Test connection: `psql postgresql://user:pass@host:5432/db`

### **Issue: Port already in use**
**Error:** `Error: listen EADDRINUSE: address already in use :::3001`
**Fix:**
```bash
# Unix/Mac
lsof -i :3001
kill -9 <PID>

# Windows
taskkill /F /IM node.exe
```

### **Issue: Missing dependencies**
**Error:** `Cannot find module 'xxx'`
**Fix:**
```bash
npm install
```

### **Issue: TypeScript compilation errors**
**Error:** `TS2564: Property 'x' has no initializer`
**Fix:**
1. Check if you're using Node.js v22+
2. Run `npm run typecheck` for details
3. Add proper type annotations or initializers

---

## 📚 **DOCUMENTATION FILES**

| File | Purpose |
|------|---------|
| `PRODUCTION_LAUNCH.md` | Complete production deployment guide |
| `LOGIN_CREDENTIALS.md` | All login credentials and API keys |
| `LAUNCH_NOW.bat` | Windows launch script |
| `launch_production.sh` | Unix/Linux launch script |
| `backend/.env.production` | Production environment template |

---

## 🎯 **RUN CHECKLIST**

- [ ] Node.js v22+ installed
- [ ] Dependencies installed (`npm install`)
- [ ] Environment configured (`.env` file)
- [ ] Database connection working
- [ ] Database migrations run
- [ ] Database seeded (optional)
- [ ] Backend server started
- [ ] Dashboard started
- [ ] Chrome extension loaded (optional)
- [ ] Health check passes (`/health`)
- [ ] Login working (`/api/auth/login`)

---

## ✅ **VERIFICATION**

**Check backend is running:**
```bash
curl http://localhost:3001/health
```

**Check API is working:**
```bash
curl http://localhost:3001/api
```

**Check login:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hotel.com","password":"admin123"}'
```

**Check dashboard:**
Open browser: http://localhost:3000

---

## 📞 **SUPPORT**

For issues:
1. Check this document for common issues
2. Check `PRODUCTION_LAUNCH.md` for deployment guide
3. Check `LOGIN_CREDENTIALS.md` for login information
4. Check logs for errors
5. Ensure Node.js v22+ is installed

---

**✅ Ready to run!**

Install Node.js v22+, then use `LAUNCH_NOW.bat` or `launch_production.sh` to start everything.
