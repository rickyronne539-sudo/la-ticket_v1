/* eslint-disable @typescript-eslint/no-require-imports -- Standalone booking regression tests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

const pricingContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/pricing.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, pricingContext);
const pricing = pricingContext.exports;

function setup({ unlimited = true, available = 0, failOrder = false, slug = "regular-event", priceCents = 20000, currency = "USD", rate = 1 } = {}) {
  const type = { id: 'ticket', name: 'General Admission', priceCents, unlimited, available, maxPerOrder: 8 };
  const event = { id: 'event', slug, published: true, startsAt: new Date(Date.now() + 86400000), ticketTypes: [type] };
  const calls = { inventoryWrites: 0, issued: 0 };
  let order;
  const prisma = {
    event: { findUnique: async () => event },
    ticketType: {
      findUnique: async () => type,
      updateMany: async ({ where, data }) => {
        calls.inventoryWrites++;
        if (where.OR && unlimited) return { count: 0 };
        if (where.available && type.available < where.available.gte) return { count: 0 };
        type.available += data.available.increment ?? -data.available.decrement;
        return { count: 1 };
      },
    },
    order: {
      create: async ({ data }) => {
        if (failOrder) throw new Error('Order write failed');
        order = { ...data, id: 'order', status: 'PENDING' };
        return order;
      },
      findUnique: async () => order,
      findUniqueOrThrow: async () => order,
      updateMany: async ({ where, data }) => {
        if (order.status !== where.status) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      },
    },
    ticket: { create: async () => { calls.issued++; } },
  };
  const dependencies = {
    '@/lib/pricing': pricing,
    'server-only': {},
    'node:crypto': crypto,
    '@prisma/client': { Prisma: { PrismaClientKnownRequestError: class extends Error {} } },
    './db': { prisma },
    './exchange-rates': { verifyPriceQuote: () => ({currency, exchangeRate: rate}) },
    './hotels': {},
  };
  const context = { exports: {}, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  }, process: { env: { TICKET_SECRET: 'test-only-secret' } } };
  const source = fs.readFileSync('src/lib/booking.ts', 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { booking: context.exports, type, calls, hold: (quantity = 2) => context.exports.createHold({ eventId: 'event', email: 'test@example.com', userId: 'user', items: [{ ticketTypeId: 'ticket', quantity }] }) };
}

test('unlimited tickets book at $200 despite zero finite inventory', async () => {
  const x = setup();
  assert.equal((await x.hold()).totalCents, 40000);
  assert.equal(x.type.available, 0);
  assert.equal(x.calls.inventoryWrites, 0);
  await x.booking.releaseOrder('order');
  await x.booking.releaseOrder('order');
  assert.equal(x.type.available, 0);
});

test('expired unlimited order can be paid and tickets issued', async () => {
  const x = setup();
  await x.hold();
  await x.booking.releaseOrder('order');
  assert.equal(await x.booking.confirmOrder('order'), 'confirmed');
  assert.equal(x.calls.issued, 2);
  assert.equal(x.type.available, 0);
});

test('unlimited availability still respects the per-order limit', async () => {
  const x = setup();
  await assert.rejects(x.hold(9), /Max 8/);
});

test('failed unlimited order does not add finite inventory', async () => {
  const x = setup({ failOrder: true });
  await assert.rejects(x.hold(), /Order write failed/);
  assert.equal(x.type.available, 0);
});

test('finite inventory still sells out and is restored once on cancellation', async () => {
  const x = setup({ unlimited: false, available: 2 });
  await x.hold();
  assert.equal(x.type.available, 0);
  await assert.rejects(x.hold(), /Not enough/);
  await x.booking.releaseOrder('order');
  await x.booking.releaseOrder('order');
  assert.equal(x.type.available, 2);
});



test('Australian order stores rounded AUD amounts and its exchange rate', async () => {
  const x = setup({ priceCents: 11000, currency: 'AUD', rate: 1.4375 });
  const order = await x.hold(2);
  assert.equal(order.currency, 'AUD');
  assert.equal(order.exchangeRate, 1.4375);
  assert.equal(order.items[0].priceCents, 15813);
  assert.equal(order.totalCents, 31626);
});
