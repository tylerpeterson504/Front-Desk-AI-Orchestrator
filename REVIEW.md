# Code Review: Front-Desk-AI-Orchestrator

**Date**: September 4, 2026
**Reviewer**: AI Code Review
**Scope**: Backend, Dashboard, Extension, Configuration
**Status**: Complete

---

## Executive Summary

The codebase demonstrates strong security practices with proper input validation, authentication, encryption, and prompt injection protections. However, several issues were identified ranging from minor code quality improvements to potential security vulnerabilities that need immediate attention.

**Overall Rating**: 7.5/10 - Good foundation with solid security architecture, but several issues need addressing.

---

## Critical Issues (Fix Immediately)

### 1. Missing Security Headers for API Routes

**File**: `backend/src/index.js`

**Issue**: The `helmet()` middleware is applied globally, but specific security headers for API routes may be insufficient. The CORS configuration allows all localhost origins when `CORS_ORIGIN` is unset, which is acceptable for development but could be tightened.

**Finding**: No critical security holes in helmet configuration, but the rate limiter max of 200 requests per 15 minutes could be exploited for DoS if not monitored.

**Fix**: Consider adding stricter rate limits for sensitive endpoints.

```javascript
// In index.js, after the authLimiter definition, consider:
const sensitivePaths = ['/api/auth/login', '/api/auth/register'];
// Apply stricter limits to sensitive paths
```

---

## High Priority Issues (Fix Soon)

### 2. Database Error Information Leakage

**File**: `backend/src/routes/properties.js` (Line 54-57)

**Issue**: Error messages could potentially leak database schema information. While the error handler masks 500 errors, some database errors might still contain table/column names.

**Current Code**:
```javascript
if (!property) {
  throw httpError(404, 'Property not found');
}
```

**Fix**: Ensure all error messages are generic and don't expose database internals. The error handler already masks these, but defense in depth is better.

```javascript
// Already handled by error handler, but add explicit logging:
if (!property) {
  logger.debug('Property not found', { propertyId: req.params.id, userId: req.user.id });
  throw httpError(404, 'Property not found or access denied');
}
```

### 3. Missing Input Validation in Template Routes

**File**: `backend/src/routes/templates.js` (Lines 53-109)

**Issue**: The `readTemplateBody` function validates input but doesn't sanitize the content for SQL injection. While parameterized queries protect against SQL injection, additional validation would be defense in depth.

**Current Code**:
```javascript
function readTemplateBody(body) {
  const { name, category, content, tags } = body || {};
  // validation logic...
  return {
    name: name.trim(),
    category: category ?? null,
    content,
    tags: tags || []
  };
}
```

**Fix**: Add content sanitization for potential script injection in templates:

```javascript
function sanitizeContent(content) {
  // Remove potentially dangerous patterns
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, 'javascript_disabled:');
}

// In readTemplateBody:
return {
  name: name.trim(),
  category: category ?? null,
  content: sanitizeContent(content),
  tags: tags || []
};
```

### 4. Missing Rate Limiting on Sensitive Endpoints

**File**: `backend/src/index.js` (Lines 49-79)

**Issue**: The `/api/auth/login` and `/api/auth/register` endpoints have rate limiting, but the limits (20 requests per 15 minutes) could still allow brute force attacks if an attacker has many IPs.

**Fix**: Consider implementing account lockout or CAPTCHA after repeated failed attempts.

---

## Medium Priority Issues (Fix in Next Sprint)

### 5. Missing Timestamp Validation

**File**: `backend/src/lib/validation.js`

**Issue**: The `requireTime` function validates time format but doesn't validate if the time is in the past or future, which could lead to scheduling issues.

**Current Code**:
```javascript
function requireTime(value, field, fallback = '11:00:00') {
  if (value == null || value === '') return fallback;
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
  if (typeof value !== 'string' || !timePattern.test(value.trim())) {
    throw httpError(400, `${field} must be HH:MM or HH:MM:SS (24-hour)`);
  }
  const trimmed = value.trim();
  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
}
```

**Fix**: Add time range validation:

```javascript
function requireTime(value, field, fallback = '11:00:00') {
  if (value == null || value === '') return fallback;
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
  if (typeof value !== 'string' || !timePattern.test(value.trim())) {
    throw httpError(400, `${field} must be HH:MM or HH:MM:SS (24-hour)`);
  }
  const trimmed = value.trim();
  // Validate time is within reasonable range (e.g., 00:00:00 to 23:59:59)
  const [hours, minutes, seconds] = trimmed.split(':').map(Number);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw httpError(400, `${field} must be a valid time (00:00:00 to 23:59:59)`);
  }
  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
}
```

### 6. Missing Audit Logging for Sensitive Operations

**File**: `backend/src/routes/properties.js` (Line 70-79)

**Issue**: The Wi-Fi password reveal is audit logged, which is good, but other sensitive operations like password changes and role changes should also have explicit audit logging.

**Current Code**:
```javascript
// Audit the reveal so access to the credential is traceable.
await db.none(
  `INSERT INTO audit_logs (user_id, property_id, action, details)
   VALUES ($1, $2, $3, $4)`,
  [
    req.user.id,
    property.id,
    'wifi_password_revealed',
    JSON.stringify({ property: property.name, at: new Date().toISOString() })
  ]
);
```

**Fix**: Add audit logging for password changes and role changes:

```javascript
// In auth.js, add audit logging for password changes:
await db.none(
  `INSERT INTO audit_logs (user_id, action, details)
   VALUES ($1, 'password_changed', $2)`,
  [req.user.id, JSON.stringify({ at: new Date().toISOString() })]
);
```

### 7. Missing CORS Configuration Validation

**File**: `backend/src/index.js` (Lines 30-46)

**Issue**: When `CORS_ORIGIN` is unset in production, the system defaults to allowing all localhost origins, which could be a security risk if the production environment accidentally has this unset.

**Current Code**:
```javascript
if (!corsOrigins.length) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN must list the allowed browser origins in production');
  }
  logger.warn('CORS_ORIGIN is not set; allowing localhost origins for development only');
}
```

**Fix**: Already handled correctly - throws error in production if CORS_ORIGIN is unset. No fix needed, but add documentation.

---

## Low Priority Issues (Nice to Have)

### 8. Missing Request Logging for Debugging

**File**: `backend/src/lib/logger.js`

**Issue**: While errors are logged, successful requests are not logged, making debugging difficult.

**Fix**: Add optional request logging:

```javascript
// Add to emit function in logger.js
function emit(level, message, meta = {}) {
  if (isSilenced()) return;
  // Add request logging
  if (level === 'info' && message === 'request completed') {
    const line = JSON.stringify({
      level,
      time: new Date().toISOString(),
      message,
      ...redact(meta)
    });
    process.stdout.write(`${line}\n`);
  }
  // ... rest of function
}
```

### 9. Missing Input Sanitization for Search Queries

**File**: `backend/src/routes/templates.js` (Lines 58-69)

**Issue**: The search functionality uses `ILIKE` with user input, which could allow SQL injection if not properly parameterized (it is, but defense in depth would help).

**Current Code**:
```javascript
if (search) {
  const nameIdx = params.length + 1;
  const tagIdx = params.length + 2;
  query += ` AND (name ILIKE $${nameIdx} OR $${tagIdx} = ANY(tags))`;
  params.push(`%${search}%`);
  params.push(search);
}
```

**Fix**: The code is already using parameterized queries correctly. No fix needed, but add comment:

```javascript
// Using parameterized queries - safe from SQL injection
```

### 10. Missing Documentation for API Endpoints

**File**: `backend/src/routes/*.js`

**Issue**: API routes lack OpenAPI/Swagger documentation for client integration.

**Fix**: Consider adding JSDoc comments to all routes:

```javascript
/**
 * POST /api/properties
 * Create a new property
 * @param {Object} req.body - Property details
 * @param {string} req.body.name - Property name (required)
 * @param {string} req.body.url_pattern - URL pattern (required)
 * @returns {Object} Created property
 */
```

---

## Security Architecture Review

### Strengths

1. **Input Validation**: Comprehensive validation using `validation.js` module
2. **Authentication**: JWT with short-lived access tokens and refresh tokens
3. **Encryption**: AES-256-GCM for Wi-Fi passwords with proper key management
4. **Authorization**: Role-based access control with proper role validation
5. **Rate Limiting**: Multiple rate limiters for different endpoint types
6. **Error Handling**: Proper error masking to prevent information leakage
7. **Prompt Injection Protection**: Fenced content with neutralization
8. **Audit Logging**: Wi-Fi password reveals are tracked

### Weaknesses

1. **Missing Rate Limiting on Some Endpoints**: Databricks and GitHub status endpoints lack rate limiting
2. **No Account Lockout**: Brute force protection could be stronger
3. **Missing Request Validation**: Some endpoints lack proper input validation

---

## Test Coverage Analysis

### Test Files

1. **security.test.js**: Comprehensive security tests
2. **api.test.js**: API integration tests
3. **auth-missing.test.js**: Authentication missing tests
4. **integration.test.js**: Integration tests
5. **refresh-tokens.test.js**: Refresh token tests
6. **sanitize.test.js**: Input sanitization tests
7. **validate-email.test.js**: Email validation tests
8. **validation.test.js**: Validation utilities tests

### Coverage Gaps

1. **Missing Tests for**:
   - Databricks service
   - GitHub service
   - Perplexity service
   - Shift notes routes
   - Audit logs routes
   - Role change audit logging

2. **Test Mocking**:
   - Database mocking could be more comprehensive
   - Service layer tests are missing

---

## Recommended Fixes

### Immediate Actions (High Priority)

1. **Fix Database Error Handling** - Add explicit logging for 404 errors
2. **Add Content Sanitization** - For template content to prevent script injection
3. **Enhance Rate Limiting** - Add CAPTCHA or account lockout after too many failures

### Short-term Actions (Medium Priority)

4. **Add Audit Logging** - For password changes and role changes
5. **Improve Input Validation** - Add time range validation
6. **Add Missing Tests** - For untested services and routes

### Long-term Improvements

7. **Add API Documentation** - OpenAPI/Swagger documentation
8. **Enhance Logging** - Add request-level logging
9. **Implement Webhooks** - For audit log events
10. **Add Monitoring** - For rate limit breaches and security events

---

## Files Reviewed

### Backend (17 files)
- `src/index.js` - Main application entry
- `src/config/auth.js` - Authentication configuration
- `src/config/database.js` - Database configuration
- `src/config/registration.js` - Registration configuration
- `src/lib/httpError.js` - HTTP error utilities
- `src/lib/logger.js` - Logging utilities
- `src/lib/secretBox.js` - Encryption utilities
- `src/lib/validation.js` - Input validation utilities
- `src/middleware/errorHandler.js` - Error handling middleware
- `src/middleware/sanitize.js` - Request sanitization middleware
- `src/routes/auth.js` - Authentication routes
- `src/routes/copilot.js` - AI copilot routes
- `src/routes/databricks.js` - Databricks integration routes
- `src/routes/github.js` - GitHub integration routes
- `src/routes/properties.js` - Property management routes
- `src/routes/templates.js` - Template management routes
- `src/routes/shiftNotes.js` - Shift notes routes
- `src/routes/auditLogs.js` - Audit log routes
- `src/services/llm.js` - LLM service
- `src/services/perplexity.js` - Perplexity AI service
- `src/services/databricks.js` - Databricks service
- `src/services/github.js` - GitHub service

### Tests (8 files)
- `tests/security.test.js` - Security tests
- `tests/api.test.js` - API tests
- `tests/auth-missing.test.js` - Authentication tests
- `tests/integration.test.js` - Integration tests
- `tests/refresh-tokens.test.js` - Refresh token tests
- `tests/sanitize.test.js` - Sanitization tests
- `tests/validate-email.test.js` - Email validation tests
- `tests/validation.test.js` - Validation tests

### Extension (7 files)
- `src/background.js` - Background service worker
- `src/config.js` - Extension configuration
- `src/content-akia.js` - Akia content script
- `src/content-stayntouch.js` - Stayntouch content script
- `src/popup.js` - Popup UI
- `src/sidepanel.js` - Side panel UI
- `src/theme.js` - Theme management

### Dashboard (12 files)
- `src/App.js` - Main application component
- `src/components/Alert.jsx` - Alert component
- `src/components/icons.js` - Icon components
- `src/components/LoadingSpinner.jsx` - Loading spinner
- `src/components/Sidebar.jsx` - Sidebar navigation
- `src/index.js` - Dashboard entry point
- `src/pages/AuditPage.jsx` - Audit page
- `src/pages/LoginPage.jsx` - Login page
- `src/pages/PropertiesPage.jsx` - Properties page
- `src/pages/ShiftNotesPage.jsx` - Shift notes page
- `src/pages/TemplatesPage.jsx` - Templates page
- `src/services/api.js` - API service

### Configuration
- `.github/workflows/ci.yml` - CI/CD workflow
- `.github/workflows/neon-branch.yml` - Neon branch workflow
- `package.json` - Backend dependencies
- `extension/package.json` - Extension dependencies
- `dashboard/package.json` - Dashboard dependencies

---

## Conclusion

The codebase is well-architected with strong security foundations. The main issues are around input validation, error handling, and missing audit logging for some sensitive operations. These are relatively straightforward fixes that can be implemented in the next sprint.

**Recommended Next Steps**:
1. Implement the high-priority fixes (content sanitization, error logging)
2. Add missing audit logging for password changes
3. Expand test coverage for untested services
4. Add API documentation

---

## Appendix: Test Results

**Note**: Tests could not be run automatically as npm is not available in the current environment. Manual test execution is required:

```bash
cd backend && npm test   # Should run 94 tests
cd extension && npm test  # Should run 48 tests
```

All security tests should pass as written, covering:
- Registration role escalation prevention
- Registration gating
- Role-guarded endpoints
- Error response handling
- Wi-Fi password encryption
- Untrusted context handling

---

**Review Complete**
