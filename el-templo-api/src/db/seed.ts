import 'dotenv/config';
import * as argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { branches, users } from './schema';

async function seed() {
  // Create database connection
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'eltemplo',
  });

  const db = drizzle(connection);

  console.log('🌱 Seeding database...');

  // Clear existing data
  console.log('Clearing existing data...');
  await db.delete(users);
  await db.delete(branches);

  // Insert branches
  console.log('Creating branches...');
  const branchesData = [
    { name: 'El Templo Centro', code: 'CENTRO' },
    { name: 'El Templo Alem', code: 'ALEM' },
    { name: 'El Templo Constitución', code: 'CONST' },
    { name: 'El Templo Jujuy', code: 'JUJUY' },
    { name: 'El Templo Mogotes', code: 'MOGOTES' },
  ];

  const insertedBranches = await db.insert(branches).values(branchesData);
  const branchIds = Array.from({ length: 5 }, (_, i) => i + 1);
  console.log(`✓ Created ${branchesData.length} branches`);

  // Hash default password
  const defaultPasswordHash = await argon2.hash('templo123');
  const adminPasswordHash = await argon2.hash('admin123');

  // Insert superadmin
  console.log('Creating superadmin...');
  await db.insert(users).values({
    email: 'admin@eltemplo.com',
    passwordHash: adminPasswordHash,
    firstName: 'Super',
    lastName: 'Admin',
    role: 'superadmin',
    branchId: branchIds[0], // Centro
    level: 'spartan',
  });
  console.log('✓ Created superadmin (admin@eltemplo.com / admin123)');

  // Insert coaches (1 per branch)
  console.log('Creating coaches...');
  const coaches = branchIds.map((branchId, index) => ({
    email: `coach${index + 1}@eltemplo.com`,
    passwordHash: defaultPasswordHash,
    firstName: `Coach`,
    lastName: `${index + 1}`,
    role: 'coach' as const,
    branchId,
    level: 'omega' as const,
  }));

  await db.insert(users).values(coaches);
  console.log(`✓ Created ${coaches.length} coaches (password: templo123)`);

  // Insert members (4 per branch)
  console.log('Creating members...');
  const levels = ['alfa', 'delta', 'sigma', 'omega'] as const;
  const members = branchIds.flatMap((branchId, branchIndex) =>
    levels.map((level, levelIndex) => ({
      email: `member${branchIndex * 4 + levelIndex + 1}@eltemplo.com`,
      passwordHash: defaultPasswordHash,
      firstName: `Member`,
      lastName: `${branchIndex * 4 + levelIndex + 1}`,
      role: 'member' as const,
      branchId,
      level,
    }))
  );

  await db.insert(users).values(members);
  console.log(`✓ Created ${members.length} members (password: templo123)`);

  // Summary
  console.log('\n✅ Seeding complete!');
  console.log(`
Summary:
- 5 branches
- 1 superadmin (admin@eltemplo.com / admin123)
- 5 coaches (coach1-5@eltemplo.com / templo123)
- 20 members (member1-20@eltemplo.com / templo123)

Total users: 26
  `);

  await connection.end();
}

seed().catch((error) => {
  console.error('❌ Seeding failed:', error);
  process.exit(1);
});
