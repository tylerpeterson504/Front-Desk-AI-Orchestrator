# 🚀 Launch Commands for Front Desk AI Orchestrator

Your project is fully configured and ready to run. Use these commands in your **regular terminal** (VS Code, CMD, PowerShell, or Git Bash) where Node.js is in your PATH.

---

## 📦 1. Install Dependencies (if needed)

```bash
npm install
```

> ✅ **Status:** Already installed (216 packages, 0 vulnerabilities)

---

## 🏃 2. Launch Development Servers

### Option A: Full Dev Build (Backend + Dashboard)
```bash
npm run dev
```
- Starts both backend API (port 3001) and Vite dashboard
- Uses concurrently to run both in parallel
- Auto-reloads on file changes

### Option B: Backend Only
```bash
cd backend
npm run dev:backend
```
- Starts backend API on port 3001
- Connects to Neon PostgreSQL automatically
- Hot reload enabled

### Option C: Dashboard Only
```bash
cd dashboard
npm run dev:dashboard
```
- Starts Vite development server
- Connects to backend API on port 3001
- Hot module replacement enabled

---

## 🔐 3. Neon Authentication (Optional)

Your Neon project is already configured in `.env.local`, but if you need to authenticate the CLI:

```bash
npx neon@latest auth
```

Then link your project:

```bash
npx neon@latest link --project-id ep-sweet-rice-axacicig
```

> ✅ **Note:** Your project is already linked via `.env.local` and `.neon` file

---

## 📊 4. Verify Configuration

### Check Environment Variables
```bash
# On Windows (PowerShell):
Get-Content .env.local | Select-String "DATABASE_URL|AWS_|NEON_"

# On Linux/Mac:
grep -E "DATABASE_URL|AWS_|NEON_" .env.local
```

### Test Database Connection
```bash
# In Node.js REPL
node -e "const {Pool}=require('pg'); (async()=>{const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});const c=await p.connect();console.log('✅ Connected:',(await c.query('SELECT current_database()')).rows[0]);await c.release();await p.end();})()"
```

---

## 🧪 5. Run Tests

### All Backend Tests
```bash
cd backend
npm test
```

### Specific Test File
```bash
cd backend
npm test -- --testPathPattern=services.test.ts
```

---

## 📦 6. Production Build

### Build for Production
```bash
npm run build
```

### Start Production Server
```bash
cd backend
dist/index.js
```

---

## 📝 Configuration Summary

| Setting | Value | Status |
|---------|-------|--------|
| **Database** | Neon PostgreSQL 18.6 | ✅ Connected |
| **Project ID** | ep-sweet-rice-axacicig | ✅ Configured |
| **Branch** | main | ✅ Active |
| **Region** | us-east-2 | ✅ Set |
| **S3 Storage** | br-delicate-bonus-axx6mn1q | ✅ Configured |
| **Backend Port** | 3001 | ✅ Default |
| **Dashboard** | http://localhost:5173 | ✅ Vite |
| **Node Version** | >=22 | ✅ Required |

---

## 🎯 Quick Start

```bash
# 1. Install dependencies (if first time)
npm install

# 2. Launch everything
npm run dev

# 3. Open your browser
# Backend: http://localhost:3001
# Dashboard: http://localhost:5173
```

---

## 💡 Troubleshooting

### If you get "node not found" errors:

**Windows:**
1. Make sure Node.js is installed
2. Restart your terminal/IDE
3. Verify with: `node --version` (should show v24.x)

**Path Issues:**
The bash environment in this session has PATH limitations. Run commands directly in:
- VS Code terminal
- Windows CMD
- PowerShell
- Git Bash (from Git for Windows)

### If database connection fails:

1. Verify `.env.local` has correct DATABASE_URL
2. Check your internet connection (Neon requires it)
3. Ensure SSL is configured properly

---

## 📚 Additional Documentation

- [README.md](./README.md) - Project overview
- [RUN_PROJECT.md](./RUN_PROJECT.md) - Running the project
- [PRODUCTION_LAUNCH.md](./PRODUCTION_LAUNCH.md) - Production deployment
- [JWT_TOKEN_GUIDE.md](./JWT_TOKEN_GUIDE.md) - Authentication guide

---

**Your project is ready! 🎉**
