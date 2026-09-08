# Front Desk AI Orchestrator - Development Guide

## 🎯 Quick Start

### Prerequisites
- ✅ Node.js v22+ (already installed in `.nodejs/`)
- ✅ Git Bash (already configured)
- ⏳ PostgreSQL database (for production-like development)
- ⏳ Chrome browser (for extension development)

### Initial Setup

1. **Navigate to project root:**
   ```bash
   cd /c/Users/Front\ Desk/Front-Desk-AI-Orchestrator-main
   ```

2. **Source your environment:**
   ```bash
   source ~/.bashrc
   ```

3. **Verify Node.js is available:**
   ```bash
   node --version  # Should show v22.13.0
   npm --version   # Should show 10.9.2+
   ```

4. **Install all dependencies:**
   ```bash
   npm install
   cd backend && npm install
   cd ../dashboard && npm install
   cd ../extension && npm install
   cd ..
   ```

Or run the setup script:
```bash
./setup-dev.sh
```

## 🏗️ Project Structure

```
front-desk-ai-orchestrator/
├── backend/           # Node.js API Server (Express, PostgreSQL)
│   ├── src/           # Source code
│   ├── db/           # Database migrations and seeds
│   ├── .env          # Environment configuration
│   └── package.json
│
├── dashboard/         # React Frontend (Create React App)
│   ├── src/          # React components
│   ├── public/       # Static files
│   ├── .env          # Environment configuration
│   └── package.json
│
├── extension/        # Chrome Extension
│   ├── src/          # Extension source code
│   ├── manifest.json # Extension manifest
│   └── package.json
│
├── .nodejs/          # Local Node.js installation
│   └── node-v22.13.0-win-x64/
│
├── package.json      # Root package.json (monorepo)
├── setup-dev.sh      # Development setup script
└── README.md         # Main documentation
```

## 🚀 Running the Application

### Backend Server

Start the backend API server:
```bash
# Production mode
npm run start:backend

# Development mode (with auto-restart)
cd backend
npm run dev
```

**Backend runs on:** `http://localhost:3001`

### Dashboard

Start the React development server:
```bash
npm run start:dashboard

# Or from dashboard directory
cd dashboard
npm start
```

**Dashboard runs on:** `http://localhost:3000`

### Extension

1. Open Chrome → Settings → Extensions
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `extension/` folder
5. The extension should now be active

## 🔄 Development Workflow

### Run everything together:
```bash
# Start backend + dashboard simultaneously
npm run dev
```

### Backend API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | User registration |
| GET | `/api/copilot/draft` | Generate AI draft |
| GET | `/api/properties` | List properties |

### Database Setup

```bash
# Run migrations
npm run db:migrate

# Seed database with sample data
npm run db:seed

# Full database setup
npm run db:setup
```

## 📋 Configuration

### Backend Environment Variables

Edit `backend/.env` for your development setup:

```env
# Required
DB_HOST=localhost
DB_PORT=5432
DB_NAME=frontdesk_ai
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Authentication
JWT_SECRET=your_jwt_secret
JWT_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30

# AI Configuration (optional)
GOOGLE_API_KEY=your_google_ai_api_key
GEMINI_MODEL=gemini-1.5-flash

# CORS
CORS_ORIGIN=http://localhost:3000,chrome-extension://your_extension_id
```

### Dashboard Environment Variables

Edit `dashboard/.env`:

```env
REACT_APP_API_URL=http://localhost:3001
PORT=3000
```

### Extension Configuration

Edit `extension/src/config.js` to add your properties:

```javascript
const PROPERTIES = {
  'yourdomain.stayntouch.com': {
    id: 1,
    name: 'Your Property',
    urlPattern: 'yourproperty',
    toneGuidelines: 'Professional',
    checkoutTime: '11:00 AM',
    wifiSSID: 'YourProperty-Guest'
  }
};
```

## 🧪 Testing

### Run all tests:
```bash
npm run test:all
```

### Individual test suites:
```bash
# Backend tests
npm run test:backend

# Dashboard tests
npm run test:dashboard

# Extension tests
npm run test:extension
```

## 🏗️ Building for Production

### Build Dashboard:
```bash
npm run build:dashboard
```

### Backend Production:
```bash
cd backend
NODE_ENV=production npm start
```

## 📦 Dependencies

### Core Dependencies
- **Backend:** Express, pg-promise, @google/generative-ai, JWT, bcrypt
- **Dashboard:** React, Tailwind CSS, react-scripts
- **Extension:** Chrome API, content scripts, background scripts

### Development Dependencies
- **Testing:** Jest, Supertest
- **Development:** Nodemon, concurrently
- **Linting:** ESLint (via react-scripts)

## 🔧 Troubleshooting

### Node.js not found
```bash
# Manually set the path
export PATH="/c/Users/Front Desk/Front-Desk-AI-Orchestrator-main/.nodejs/node-v22.13.0-win-x64:$PATH"
```

### Database connection issues
- Ensure PostgreSQL is running
- Verify credentials in `backend/.env`
- Check that the database user has proper permissions

### CORS errors
- Update `CORS_ORIGIN` in `backend/.env` to include all allowed origins
- Ensure the dashboard and extension URLs are included

### Extension not working
- Check Chrome console for errors (Ctrl+Shift+J)
- Ensure extension is loaded in developer mode
- Verify the backend API is running on the configured URL

## 📚 Additional Resources

- [Main Documentation](README.md)
- [Backend Documentation](backend/README.md)
- [Extension Guide](extension/README.md)
- [API Documentation](docs/API.md) (if available)

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `npm run test:all`
4. Commit your changes
5. Push to your branch
6. Create a Pull Request

---

**Project:** Front Desk AI Orchestrator  
**Version:** 1.0.0  
**Last Updated:** 2026-09-06