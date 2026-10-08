/* eslint-disable @typescript-eslint/no-require-imports -- Database regression check; all writes roll back. */
const { PrismaClient } = require('@prisma/client');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const prisma = new PrismaClient();

async function main() {
  const event = await prisma.event.findFirst({ select: { id: true } });
  assert.ok(event, 'Need an existing event for the rollback-only check');
  const data = () => ({ eventId: event.id, email: 'index-check@example.invalid', items: [], totalCents: 0, status: 'EXPIRED', accessToken: randomBytes(24).toString('hex'), expiresAt: new Date() });
  const rollback = new Error('Intentional rollback');
  await assert.rejects(prisma.$transaction(async tx => {
    await tx.order.create({ data: data() });
    await tx.order.create({ data: data() });
    await tx.order.create({ data: { ...data(), stripeSessionId: null } });
    await tx.order.create({ data: { ...data(), stripeSessionId: null } });
    throw rollback;
  }, { timeout: 20000 }), error => error === rollback);
  console.log('PASS: Multiple missing and null Stripe session IDs are accepted. Test orders rolled back.');
  const session = `index-check-${randomBytes(24).toString('hex')}`;
  await assert.rejects(prisma.$transaction(async tx => {
    await tx.order.create({ data: { ...data(), stripeSessionId: session } });
    await tx.order.create({ data: { ...data(), stripeSessionId: session } });
    throw new Error('Duplicate session ID was incorrectly accepted');
  }, { timeout: 20000 }), error => error.code === 'P2002' && String(error.meta?.target).includes('stripeSessionId'));
  console.log('PASS: Duplicate Stripe session IDs are rejected. Test orders rolled back.');
}

main().catch(error => {
  console.error('Order index check failed:', error.code ?? error.name);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
