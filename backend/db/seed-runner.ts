// Database seed runner using TypeORM
// Replaces the legacy pg-promise based seed-runner.js

import 'dotenv';
import { DataSource } from 'typeorm';
import bcrypt from 'bcrypt';
import { getDatabaseConfig } from '../src/config/index';
import { User, Property, Template, ShiftNote } from '../src/entities';

const dbConfig = getDatabaseConfig();

const connectionString = dbConfig.connectionString;
const manualConfig = connectionString ? {} : {
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database
};

// Create a data source for seeding
const seedDataSource = new DataSource({
  type: 'postgres',
  ...(connectionString ? { url: connectionString } : manualConfig),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  entities: [User, Property, Template, ShiftNote],
  migrations: [],
  synchronize: false,
  logging: process.env.LOG_LEVEL === 'debug'
});

/**
 * Check if users already exist
 * If users exist, skip seeding to avoid overwriting existing data
 */
async function usersExist(): Promise<boolean> {
  const userRepo = seedDataSource.getRepository(User);
  const count = await userRepo.count();
  return count > 0;
}

/**
 * Create admin user
 */
async function createAdminUser() {
  const userRepo = seedDataSource.getRepository(User);
  
  const existing = await userRepo.findOne({ where: { email: 'admin@hotel.com' } });
  if (existing) {
    console.log('Admin user already exists, skipping...');
    return existing;
  }
  
  const hashedPassword = await bcrypt.hash('admin123', 12);
  
  const adminUser = userRepo.create({
    email: 'admin@hotel.com',
    password_hash: hashedPassword,
    name: 'Admin User',
    role: 'admin'
  });
  
  await userRepo.save(adminUser);
  console.log('Created admin user:', adminUser.email);
  
  return adminUser;
}

/**
 * Create sample agent user
 */
async function createAgentUser(adminUser: User) {
  const userRepo = seedDataSource.getRepository(User);
  
  const existing = await userRepo.findOne({ where: { email: 'agent@hotel.com' } });
  if (existing) {
    console.log('Agent user already exists, skipping...');
    return existing;
  }
  
  const hashedPassword = await bcrypt.hash('agent123', 12);
  
  const agentUser = userRepo.create({
    email: 'agent@hotel.com',
    password_hash: hashedPassword,
    name: 'Front Desk Agent',
    role: 'agent',
    property_id: 1
  });
  
  await userRepo.save(agentUser);
  console.log('Created agent user:', agentUser.email);
  
  return agentUser;
}

/**
 * Create sample property
 */
async function createSampleProperty(adminUser: User) {
  const propertyRepo = seedDataSource.getRepository(Property);
  
  const existing = await propertyRepo.findOne({ where: { name: 'Grand Hotel' } });
  if (existing) {
    console.log('Sample property already exists, skipping...');
    return existing;
  }
  
  const property = propertyRepo.create({
    name: 'Grand Hotel',
    address: '123 Main Street, Downtown, City',
    checkout_time: '11:00 AM',
    wifi_ssid: 'GrandHotel_WiFi',
    wifi_password: '',
    tone_guidelines: 'Friendly and professional',
    user_id: adminUser.id
  });
  
  await propertyRepo.save(property);
  console.log('Created sample property:', property.name);
  
  return property;
}

/**
 * Create sample templates
 */
async function createSampleTemplates(adminUser: User) {
  const templateRepo = seedDataSource.getRepository(Template);
  
  const templates = [
    {
      name: 'Welcome Guest',
      content: 'Welcome to Grand Hotel! We hope you have a pleasant stay.',
      is_global: true,
      user_id: adminUser.id
    },
    {
      name: 'Check-in Confirmation',
      content: 'Your check-in is confirmed. Our front desk is available 24/7 for any assistance.',
      is_global: true,
      user_id: adminUser.id
    },
    {
      name: 'Checkout Reminder',
      content: 'This is a friendly reminder that checkout time is at 11:00 AM. Late checkout may be available upon request.',
      is_global: true,
      user_id: adminUser.id
    },
    {
      name: 'WiFi Instructions',
      content: 'Our complimentary WiFi network is GrandHotel_WiFi. Please contact the front desk for the password.',
      is_global: true,
      user_id: adminUser.id
    },
    {
      name: 'Amenities Info',
      content: 'Our hotel offers complimentary breakfast, fitness center access, and an outdoor pool. Don\'t hesitate to ask for more information!',
      is_global: true,
      user_id: adminUser.id
    }
  ];
  
  let createdCount = 0;
  for (const templateData of templates) {
    const existing = await templateRepo.findOne({ where: { name: templateData.name } });
    if (!existing) {
      const template = templateRepo.create(templateData);
      await templateRepo.save(template);
      console.log('Created template:', template.name);
      createdCount++;
    } else {
      console.log('Template already exists:', templateData.name);
    }
  }
  
  console.log(`Created ${createdCount} sample templates`);
  
  return templates.map(t => ({ ...t, id: t.name }));
}

/**
 * Create sample shift notes
 */
async function createSampleShiftNotes(agentUser: User, property: Property) {
  const shiftNoteRepo = seedDataSource.getRepository(ShiftNote);
  
  const notes = [
    {
      content: 'VIP guest arriving today - John Smith, Room 201. Ensure special welcome.',
      user_id: agentUser.id,
      property_id: property.id,
      shift_date: new Date()
    },
    {
      content: 'Maintenance scheduled for Room 105 tomorrow at 9 AM. Guest has been notified.',
      user_id: agentUser.id,
      property_id: property.id,
      shift_date: new Date()
    },
    {
      content: 'Restaurant reservation for 4 guests at 7:30 PM in the Grand Ballroom.',
      user_id: agentUser.id,
      property_id: property.id,
      shift_date: new Date()
    }
  ];
  
  let createdCount = 0;
  for (const noteData of notes) {
    const note = shiftNoteRepo.create(noteData);
    await shiftNoteRepo.save(note);
    console.log('Created shift note');
    createdCount++;
  }
  
  console.log(`Created ${createdCount} sample shift notes`);
}

/**
 * Run all seeds
 */
async function runSeeds() {
  try {
    console.log('Starting database seeding...');
    
    await seedDataSource.initialize();
    console.log('Connected to database for seeding');
    
    // Check if users already exist
    const shouldSeed = process.env.RUN_SEEDS === 'true' && !(await usersExist());
    
    if (!shouldSeed) {
      console.log('Seeding skipped - users already exist or RUN_SEEDS is not true');
      await seedDataSource.destroy();
      return;
    }
    
    console.log('Creating admin user...');
    const adminUser = await createAdminUser();
    
    console.log('Creating agent user...');
    const agentUser = await createAgentUser(adminUser);
    
    console.log('Creating sample property...');
    const property = await createSampleProperty(adminUser);
    
    console.log('Creating sample templates...');
    await createSampleTemplates(adminUser);
    
    console.log('Creating sample shift notes...');
    await createSampleShiftNotes(agentUser, property);
    
    console.log('Seeding completed successfully!');
    
    await seedDataSource.destroy();
    
    return true;
  } catch (error) {
    console.error('Seeding failed:', error);
    await seedDataSource.destroy();
    throw error;
  }
}

// Run seeds
runSeeds()
  .then(() => {
    console.log('Database seeding completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Database seeding failed:', error);
    process.exit(1);
  });
