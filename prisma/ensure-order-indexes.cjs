/* eslint-disable @typescript-eslint/no-require-imports -- Standalone database setup script. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const indexName = 'Order_stripeSessionId_partial_key';

async function main() {
  // Build the replacement first so real session IDs are always protected.
  await prisma.$runCommandRaw({
    createIndexes: 'Order',
    indexes: [{
      name: indexName,
      key: { stripeSessionId: 1 },
      unique: true,
      partialFilterExpression: { stripeSessionId: { $type: 'string' } },
    }],
  });
  // createIndexes succeeds only if this exact definition exists or was built.
  // Avoid listIndexes: Prisma cannot decode the nested $type filter it returns.
  try {
    await prisma.$runCommandRaw({ dropIndexes: 'Order', index: 'Order_stripeSessionId_key' });
  } catch (error) {
    const message = String(error.meta?.message ?? error.message);
    if (!/IndexNotFound|index not found/i.test(message)) throw error;
  }
  console.log('Verified: Stripe session IDs remain unique; orders without a session ID are allowed.');
}

main().catch(error => {
  console.error('Order index setup failed:', error.code ?? error.name);
  console.error(String(error.meta?.message ?? error.message).replaceAll(process.env.DATABASE_URL ?? '__unset__', '[redacted]'));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
