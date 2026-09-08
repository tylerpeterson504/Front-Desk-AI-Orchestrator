// Bootstrap or change a user's role from the server, without an HTTP call.
// Needed because `role` is no longer accepted at registration and only an
// existing admin can promote others.
//
// Usage:
//   npm run set-role -- someone@example.com admin

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });

const { db } = require('../src/config/database');

const ROLES = new Set(['agent', 'manager', 'admin']);

async function run() {
  const [email, role] = process.argv.slice(2);

  if (!email || !role) {
    console.error('Usage: npm run set-role -- <email> <agent|manager|admin>');
    process.exit(1);
  }
  if (!ROLES.has(role)) {
    console.error(`Invalid role "${role}". Expected one of: ${[...ROLES].join(', ')}`);
    process.exit(1);
  }

  const user = await db.oneOrNone(
    `UPDATE users SET role = $1, updated_at = NOW()
     WHERE LOWER(email) = LOWER($2)
     RETURNING id, email, role`,
    [role, email]
  );

  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  console.log(`${user.email} is now ${user.role}`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error.message);
    process.exit(1);
  });
