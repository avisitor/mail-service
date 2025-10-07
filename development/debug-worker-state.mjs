#!/usr/bin/env node

// Debug script to check worker state and database records
import dotenv from 'dotenv';
dotenv.config();

const { config } = await import('./src/config.ts');

console.log('🔍 Worker State Debug');
console.log('====================');

// Check environment and config
console.log('\n📋 Environment Check:');
console.log('  DATABASE_URL (process.env):', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('  DATABASE_URL (config):', config.databaseUrl ? 'SET' : 'NOT SET');
console.log('  DATABASE_URL starts with mysql://', config.databaseUrl?.startsWith('mysql://') ? 'YES' : 'NO');

// Import database utilities
const { isPrismaDisabled, getPrisma } = await import('./src/db/prisma.ts');
const { dbReady } = await import('./src/db/state.ts');

console.log('\n🛡️  Guard Conditions:');
console.log('  isPrismaDisabled():', isPrismaDisabled());
console.log('  dbReady:', dbReady);
console.log('  URL starts with mysql://', config.databaseUrl.startsWith('mysql://'));

// Check if we can create a Prisma client
console.log('\n💾 Database Check:');
try {
  const prisma = getPrisma();
  console.log('  Prisma client created: YES');
  
  // Check if we can query messageGroup
  const allGroups = await prisma.messageGroup.findMany({
    take: 10,
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      subject: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log(`  Total messageGroups found: ${allGroups.length}`);
  for (const group of allGroups) {
    console.log(`    - ${group.id}: ${group.status} scheduled: ${group.scheduledAt} subject: "${group.subject}"`);
  }

  const groups = await prisma.messageGroup.findMany({
    where: { 
      status: 'scheduled', 
      OR: [ 
        { scheduledAt: null }, 
        { scheduledAt: { lte: new Date() } } 
      ] 
    },
    take: 5,
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      subject: true,
      createdAt: true
    }
  });
  
  console.log(`  Scheduled messageGroups found: ${groups.length}`);
  for (const group of groups) {
    console.log(`    - ${group.id}: ${group.status} scheduled: ${group.scheduledAt} subject: "${group.subject}"`);
  }
  
  // Check recipients for the recent groups
  if (allGroups.length > 0) {
    const recentGroupIds = allGroups.slice(0, 3).map(g => g.id);
    const recipients = await prisma.recipient.findMany({
      where: { 
        groupId: { in: recentGroupIds }
      },
      take: 15,
      select: {
        id: true,
        email: true,
        status: true,
        groupId: true,
        lastError: true,
        failedAttempts: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`  Recipients for recent groups: ${recipients.length}`);
    for (const recipient of recipients) {
      console.log(`    - ${recipient.email} (${recipient.status}) group: ${recipient.groupId.slice(-8)} failed: ${recipient.failedAttempts} error: ${recipient.lastError?.slice(0, 80)}`);
    }
  }
  
  await prisma.$disconnect();
} catch (e) {
  console.log('  Database error:', e.message);
}

console.log('\n✅ Debug complete');