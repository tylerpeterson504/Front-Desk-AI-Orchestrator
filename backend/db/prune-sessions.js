// Deletes expired refresh-token rows.
//
// Revoked and rotated rows are kept until they expire (they are the audit trail
// for reuse detection); past expiry they are dead weight. Safe to run on a
// schedule — it never touches a live session.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });

const { refreshTokenService } = require('../src/services/refreshTokenService');

refreshTokenService.cleanupExpired()
  .then((count) => {
    console.log(`removed ${count} expired refresh token${count === 1 ? '' : 's'}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('prune failed:', error.message);
    process.exit(1);
  });
