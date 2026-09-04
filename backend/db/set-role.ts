// Bootstrap or change a user's role from the server, without an HTTP call.
// Needed because `role` is no longer accepted at registration and only an
// existing admin can promote others.
//
// Usage:
//   npm run set-role -- someone@example.com admin

import 'dotenv';
import { DataSource } from 'typeorm';
import { getDatabaseConfig } from '../src/config/index';
import { User } from '../src/entities';

const dbConfig = getDatabaseConfig();

const connectionString = dbConfig.connectionString;
const manualConfig = connectionString ? {} : {
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database
};

// Create a data source for the role update
const roleDataSource = new DataSource({
  type: 'postgres',
  ...(connectionString ? { url: connectionString } : manualConfig),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  entities: [User],
  migrations: [],
  synchronize: false,
  logging: process.env.LOG_LEVEL === 'debug'
});

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

  try {
    await roleDataSource.initialize();
    console.log('Connected to database for role update');
    
    const userRepo = roleDataSource.getRepository(User);
    
    // Find user by email (case-insensitive)
    const user = await userRepo.findOne({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      console.error(`No user found with email ${email}`);
      await roleDataSource.destroy();
      process.exit(1);
    }

    // Update the user's role
    await userRepo.update(user.id, {
      role: role as 'agent' | 'admin',
      updated_at: new Date()
    });

    console.log(`${user.email} is now ${role}`);
    
    await roleDataSource.destroy();
    
    return true;
  } catch (error) {
    console.error('Failed:', (error as Error).message);
    await roleDataSource.destroy();
    throw error;
  }
}

run()
  .then(() => {
    console.log('Role update completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Role update failed:', error);
    process.exit(1);
  });
