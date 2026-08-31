// Email shape validation, deliberately regex-free on the unbounded parts.
//
// The obvious /^[^\s@]+@[^\s@]+\.[^\s@]+$/ is ambiguous between the two domain
// segments, so a long unmatchable address makes it backtrack polynomially —
// free CPU burn on an unauthenticated endpoint (CodeQL js/polynomial-redos).
// Splitting on the separators is linear and rejects the same inputs.
//
// This is a shape check, not RFC 5322 conformance: real verification is
// delivering mail to the address.

// RFC 5321 maximum path length; also the guard that bounds the work done here.
const MAX_EMAIL_LENGTH = 254;

function isValidEmail(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_EMAIL_LENGTH) {
    return false;
  }

  const parts = value.split('@');
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (!local || !domain) return false;
  if (/\s/.test(local) || /\s/.test(domain)) return false;

  const labels = domain.split('.');
  return labels.length >= 2 && labels.every((label) => label.length > 0);
}

module.exports = { isValidEmail, MAX_EMAIL_LENGTH };
