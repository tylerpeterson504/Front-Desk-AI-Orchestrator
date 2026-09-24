/**
 * No-promise template rule (see docs/adr/ADR-002-guest-tone-and-no-promise-rule.md).
 *
 * Templates must never promise a follow-up or guarantee that a request will
 * be fulfilled unless the agent explicitly chooses that wording at send time.
 * This module detects promise-style content so the template service can
 * reject it at create/update time.
 */

// Each entry matches a phrasing family that commits the hotel to an outcome
// or a timeline. Patterns are case-insensitive.
const PROMISE_PATTERNS: RegExp[] = [
  /wes+(?:will|'ll|ares+goings+to)s+(?:fix|repair|resolve|replace|takes+cares+of|address|handle)/i,
  /wes+(?:will|'ll|ares+goings+to)s+(?:send|bring|deliver|provide)s+(?:it|this|one|as+w+|thes+w+)s+(?:rights+)?(?:up|over|out)?s*(?:shortly|immediately|rights+away|soon|asap)?/i,
  /(?:considers+its+done|it'?ss+ass+goods+ass+done|dones+deal)/i,
  /(?:guarantee|guaranteed|rests+assured)/i,
  /wills+bes+(?:fixed|repaired|resolved|replaced|ready|completed|takens+cares+of)s+(?:today|tomorrow|tonight|immediately|rights+away|bys+(?:thes+)?(?:ends+ofs+(?:thes+)?(?:day|shift)|d+(?::d+)?(?:s*(?:am|pm))?))/i,
  /yours+w+s+(?:will|would|'ll)s+bes+(?:ready|available|resolved|fixed)/i,
  /(?:we|i)s+(?:will|'ll)s+(?:follows+up|gets+backs+tos+you|reachs+backs+out|checks+back)/i
];

export interface PromiseCheckResult {
  hasPromise: boolean;
  matchedPattern?: string;
}

/**
 * Check template content for promise-style wording.
 * Returns a plain result object so callers decide how to react; the service
 * turns this into a ValidationError.
 */
export function findTemplatePromises(content: string): PromiseCheckResult {
  if (typeof content !== 'string' || !content) {
    return { hasPromise: false };
  }

  for (const pattern of PROMISE_PATTERNS) {
    if (pattern.test(content)) {
      return { hasPromise: true, matchedPattern: pattern.source };
    }
  }

  return { hasPromise: false };
}
