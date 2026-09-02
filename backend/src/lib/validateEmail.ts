// Simple email validation regex
// This is not exhaustive but catches most invalid emails
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const trimmed = email.trim().toLowerCase();

  // Basic length checks
  if (trimmed.length > 254) {
    return false;
  }

  // Check local part and domain
  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return false;
  }

  const localPart = parts[0];
  const domain = parts[1];

  // Local part must not be empty
  if (localPart.length === 0) {
    return false;
  }

  // Domain must have at least one dot
  if (domain.indexOf('.') === -1) {
    return false;
  }

  // Check with regex
  return EMAIL_REGEX.test(trimmed);
}
