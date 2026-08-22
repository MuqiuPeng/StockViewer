/**
 * Create (or promote) the super admin account.
 *
 * There is no other way to get the first admin in: registration always lands
 * in PENDING, and only an admin can approve. Run this once after setting up a
 * fresh database.
 *
 *   npx tsx scripts/create-admin.ts <email> <password> [name]
 *
 * Re-running with an existing email resets that account's password and makes
 * sure it is an approved super admin, which is also the way to recover from a
 * forgotten password.
 */

import { PrismaClient, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

async function main() {
  const [email, password, ...nameParts] = process.argv.slice(2);

  if (!email || !password) {
    console.error(
      'Usage: npx tsx scripts/create-admin.ts <email> <password> [name]'
    );
    process.exit(1);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  const normalisedEmail = email.trim().toLowerCase();
  const name = nameParts.join(' ').trim() || 'Admin';
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.upsert({
    where: { email: normalisedEmail },
    create: {
      email: normalisedEmail,
      name,
      passwordHash,
      status: UserStatus.APPROVED,
      isAdmin: true,
      isSuperAdmin: true,
    },
    update: {
      passwordHash,
      status: UserStatus.APPROVED,
      isAdmin: true,
      isSuperAdmin: true,
    },
    select: { id: true, email: true, name: true },
  });

  console.log(`Super admin ready: ${user.name} <${user.email}>`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
