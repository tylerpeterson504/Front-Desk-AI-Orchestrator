# 🧪 Comprehensive Test Plan for Front-Desk-AI-Orchestrator

This document provides a step-by-step guide to rigorously test the entire project after the recent improvements.

---

## 📋 Prerequisites

Before starting, ensure you have:
1. **Node.js v20+** installed
2. **npm v10+** or **pnpm v8+** installed
3. **PostgreSQL** database (for backend)
4. **Mistral API Key** (required for AI features)
5. **Chrome browser** (for extension testing)

---

## 🛠 Step 1: Environment Setup

### 1.1 Clone and Install Dependencies

```bash
# Clone the repository (if not already done)
git clone https://github.com/tylerpeterson504/Front-Desk-AI-Orchestrator.git
cd Front-Desk-AI-Orchestrator

# Install all dependencies using npm
npm install

# Or using pnpm (recommended for speed)
pnpm install
```

### 1.2 Configure Environment Variables

#### Backend Environment (.env)
Create a `.env` file in the `backend` directory:

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your actual values:

```env
# Required
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/frontdesk_ai
JWT_SECRET=your_very_strong_jwt_secret_here
MISTRAL_API_KEY=your_mistral_api_key_here
WIFI_ENCRYPTION_KEY=your_32_byte_base64_encryption_key_here

# Optional
CORS_ORIGIN=http://localhost:5173
REGISTRATION_MODE=open
REGISTRATION_INVITE_TOKEN=
```

> **⚠️ IMPORTANT**: Generate a 32-byte base64 key for `WIFI_ENCRYPTION_KEY`:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
> ```

---

## 🔍 Step 2: Code Quality Verification

### 2.1 Type Checking

```bash
# Backend type checking
cd backend
npm run typecheck
```

**Expected**: No errors. If there are errors, they should be fixed before proceeding.

### 2.2 Linting

```bash
# Backend linting
cd backend
npm run lint

# Auto-fix linting issues
npm run lint:fix
```

**Expected**: No linting errors after running `lint:fix`.

### 2.3 Verify No `as any` Casts

```bash
# Search for remaining 'as any'
 casts
grep -r "as any" backend/src/ || echo "✅ No 'as any' casts found"
```

**Expected**: No results (all `as any` casts should have been removed).

---

## 🧪 Step 3: Backend Testing

### 3.1 Run Unit Tests

```bash
cd backend
npm test
```

**Expected**: All tests pass. Check for:
- ✅ All test suites pass
- ✅ No test failures
- ✅ Coverage report (if configured)

### 3.2 Test Database Connection

```bash
# Start PostgreSQL and ensure it's running
# Then test the connection
cd backend
node -e "require('./src/config/database').testConnection()"
```

**Expected**: Database connection successful.

### 3.3 Start Backend Dev Server

```bash
cd backend
npm run dev
```

**Expected**:
- ✅ Server starts without errors
- ✅ Logs show: `Server running on port 3001`
- ✅ Environment validation passes
- ✅ No `as any` type errors

**Test the server manually**:
```bash
# In a new terminal
curl http://localhost:3001/health
```

**Expected Response**:
```json
{
  "status": "ok",
  "timestamp": "...",
  "version": "..."
}
```

---

## 🖥️ Step 4: Dashboard Testing

### 4.1 Install Dashboard Dependencies

```bash
cd dashboard
npm install
```

**Expected**: All dependencies installed successfully.

### 4.2 Start Dashboard Dev Server

```bash
cd dashboard
npm run dev
```

**Expected**:
- ✅ Vite dev server starts
- ✅ Logs show: `Local: http://localhost:5173`
- ✅ No compilation errors

**Test the dashboard manually**:
1. Open Chrome and navigate to `http://localhost:5173`
2. Verify the page loads without errors
3. Open DevTools (F12) and check for:
   - ✅ No console errors
   - ✅ No 404 errors for assets

---

## 📦 Step 5: Chrome Extension Testing

### 5.1 Build the Extension

```bash
cd extension
npm install
npm run build
```

**Expected**:
- ✅ Build completes successfully
- ✅ Output in `dist/` directory

### 5.2 Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `extensi
on/dist` folder

**Expected**:
- ✅ Extension loads without errors
- ✅ Extension icon appears in Chrome toolbar

### 5.3 Test Extension Functionality

1. Click the extension icon in Chrome toolbar
2. Verify the popup opens
3. Test any extension features (if applicable)

---

## 🤖 Step 6: Mistral Integration Testing

### 6.1 Test Mistral API Connection

```bash
# Test Mistral client directly
cd backend
node -e "
const { generateWithMistral } = require('./src/services/llm/mistralClient');
(async () => {
  try {
    const result = await generateWithMistral('Hello, Mistral!', process.env.MISTRAL_API_KEY);
    console.log('✅ Mistral API working:', result);
  } catch (error) {
    console.error('❌ Mistral API error:', error.message);
  }
})();
"
```

**Expected**:
- ✅ Mistral API responds with generated text
- ✅ No errors

### 6.2 Test Copilot Service

```bash
# Test the copilot service
cd backend
node -e "
const { CopilotService } = require('./src/services/copilotService');
const service = new CopilotService();
(async () => {
  try {
    const draft = await service.draft('test property', { prompt: 'Create a welcome message' });
    console.log('✅ Copilot service working:', draft);
  } catch (error) {
    console.error('❌ Copilot service error:', error.message);
  }
})();
"
```

**Expected**:
- ✅ Copilot service generates a draft using Mistral
- ✅ No errors

---

## 🔌 Step 7: End-to-End Testing

### 7.1 Test API Endpoints

Use `curl` or Postman to test the following endpoints:

#### Health Check
```bash
curl http://localhost:3001/health
```
**Expected**: `{"status": "ok"}`

#### Authentication
```bash
# Register a test user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123", "name": "Test User"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123"}'
```
**Expected**:

- ✅ Registration succeeds (or fails with clear error if email exists)
- ✅ Login returns a JWT token

#### Copilot Endpoint
```bash
# Get a JWT token from login, then:
curl -X POST http://localhost:3001/api/copilot/draft \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"prompt": "Create a welcome message for a hotel guest"}'
```
**Expected**:
- ✅ Returns a generated draft from Mistral
- ✅ No errors

### 7.2 Test Dashboard API Connectivity

1. Open the dashboard at `http://localhost:5173`
2. Register/login using the dashboard UI
3. Test the copilot features in the dashboard

**Expected**:
- ✅ Dashboard can communicate with backend
- ✅ Copilot features work end-to-end
- ✅ No CORS errors

---

## 📊 Step 8: Performance Testing

### 8.1 Backend Performance

```bash
# Test response time
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3001/health
```

Create `curl-format.txt`:
```
Time: %{time_total}s
```

**Expected**: Response time < 500ms

### 8.2 Memory Usage

```bash
# Check Node.js memory usage
ps aux | grep node
```

**Expected**: Memory usage is stable (no leaks)

---

## 🔒 Step 9: Security Testing

### 9.1 Test Environment Validation

```bash
# Start backend without MISTRAL_API_KEY
cd backend
MISTRAL_API_KEY= npm run dev
```

**Expected**: Backend fails to start with error about missing `MISTRAL_API_KEY`

### 9.2 Test CSP Headers

```bash
curl -I http://localhost:3001/health
```

**Expected**: Response headers include:
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
```

### 9.3 Test Rate Limiting

```bash
# Send multiple requests quickly
for i in {1..20}; do curl -s http://localhost:3001/health > /dev/null; done
```

**Expected**: After 200 requests in the rate limit window, subsequent requests return 429 Too Many Requests

---

## 📝 Step 10: Final Verification Checklist

- [ ] ✅ All dependencies installed successfully
- [ ] ✅ Type checking passes (`npm run typecheck`
)
- [ ] ✅ Linting passes (`npm run lint`)
- [ ] ✅ No `as any` casts in codebase
- [ ] ✅ Backend starts without errors
- [ ] ✅ Backend health endpoint works
- [ ] ✅ Database connection successful
- [ ] ✅ Mistral API integration works
- [ ] ✅ Copilot service generates drafts
- [ ] ✅ Dashboard starts without errors
- [ ] ✅ Dashboard loads in browser
- [ ] ✅ Extension builds successfully
- [ ] ✅ Extension loads in Chrome
- [ ] ✅ Authentication works (register/login)
- [ ] ✅ Copilot endpoint works with auth
- [ ] ✅ Dashboard can communicate with backend
- [ ] ✅ Environment validation prevents startup without required vars
- [ ] ✅ CSP headers are present
- [ ] ✅ Rate limiting works

---

## 🐛 Common Issues and Fixes

### Issue: Backend fails to start with `LLM_NOT_CONFIGURED`
**Fix**: Ensure `MISTRAL_API_KEY` is set in `.env`

### Issue: Database connection fails
**Fix**: 
1. Ensure PostgreSQL is running
2. Verify `DATABASE_URL` in `.env`
3. Run migrations: `npm run migrate`

### Issue: Dashboard shows blank page
**Fix**: 
1. Check browser console for errors
2. Ensure Vite dev server is running
3. Verify `CORS_ORIGIN` in backend `.env` includes `http://localhost:5173`

### Issue: Extension fails to load
**Fix**:
1. Ensure `manifest.json` is valid
2. Check Chrome console for errors
3. Rebuild extension: `npm run build`

### Issue: Mistral API returns errors
**Fix**:
1. Verify `MISTRAL_API_KEY` is correct
2. Check Mistral API status
3. Test with a simple prompt first

---

## 🎯 Success Criteria

The project is considered **fully tested and ready for use** when:

1. ✅ All code quality checks pass (type checking, linting)
2. ✅ All unit tests pass
3. ✅ Backend starts and all API endpoints work
4. ✅ Dashboard loads and can communicate with backend
5. ✅ Chrome extension builds and loads
6. ✅ Mistral integration works end-to-end
7. ✅ Security features (CSP, rate limiting, env validation) work
8. ✅ No `as any` casts remain in the codebase

---

## 📞 Support

If you encounter any i
ssues during testing:
1. Check the **console logs** for errors
2. Review the **network requests** in DevTools
3. Verify **environment variables** are set correctly
4. Consult the **documentation** in this repository

---

**Last Updated**: 2026-09-19
**Author**: Tyler Peterson
