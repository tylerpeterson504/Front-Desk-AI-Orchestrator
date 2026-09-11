const MAX_EMAIL_LENGTH = 254;

export { MAX_EMAIL_LENGTH };

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const trimmed = email.trim().toLowerCase();

  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return false;
  }

  // Reject internal whitespace (spaces, tabs, etc.)
  if (/\s/.test(trimmed)) {
    return false;
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return false;
  }

  const localPart = parts[0];
  const domain = parts[1];

  if (localPart.length === 0) {
    return false;
  }

  const lastDotIndex = domain.lastIndexOf('.');
  if (lastDotIndex === -1 || lastDotIndex === domain.length - 1) {
    return false;
  }

  const tld = domain.slice(lastDotIndex + 1);
  if (tld.length < 2 || tld.includes('.')) {
    return false;
  }

  const domainLabels = domain.split('.');
  if (domainLabels.some(label => label.length === 0)) {
    return false;
  }

  return true;
}