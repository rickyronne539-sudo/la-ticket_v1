/* eslint-disable @typescript-eslint/no-require-imports -- Node test harness for confirming payments without the webhook. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('src/lib/payments.ts', 'utf8');
const ORDER = 'a'.repeat(24);
function setup({ session = { id: 'cs_1', status: 'complete', payment_status: 'paid', payment_intent: 'pi_1', metadata: { orderId: ORDER } }, lookupError = null, confirmResult = 'confirmed', expireFails = false, stale = [] } = {}) {
  const calls = { confirmed: [], released: [], refunds: [], expired: 0, statusUpdates: [] };
  const stripe = {
    checkout: { sessions: {
      retrieve: async () => { if (lookupError) throw lookupError; return session; },
      expire: async () => { calls.expired++; if (expireFails) throw Error('already complete'); return { ...session, status: 'expired' }; },
    } },
    refunds: { create: async (args, opts) => { calls.refunds.push([args, opts]); } },
  };
  const deps = {
    'server-only': {},
    './booking': { confirmOrder: async (id, sid) => { calls.confirmed.push([id, sid]); return confirmResult; }, releaseOrder: async (id) => { calls.released.push(id); } },
    './db': { prisma: { order: { findMany: async () => stale, updateMany: async (q) => { calls.statusUpdates.push(q.data.status); } } } },
    './stripe': { stripe },
  };
  const ctx = { exports: {}, require: (n) => { if (!(n in deps)) throw Error('Unexpected dependency: ' + n); return deps[n]; }, console: { error: () => {} } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
  return { calls, m: ctx.exports };
}
const pending = { id: ORDER, status: 'PENDING', stripeSessionId: 'cs_1' };

test('paid session confirms the order', async () => {
  const x = setup(); await x.m.syncOrderPayment(pending);
  assert.deepEqual(x.calls.confirmed, [[ORDER, 'cs_1']]);
});
test('unpaid open session confirms nothing', async () => {
  const x = setup({ session: { id: 'cs_1', status: 'open', payment_status: 'unpaid', metadata: { orderId: ORDER } } });
  await x.m.syncOrderPayment(pending);
  assert.equal(x.calls.confirmed.length, 0); assert.equal(x.calls.released.length, 0);
});
test('session belonging to another order is ignored', async () => {
  const x = setup({ session: { id: 'cs_1', status: 'complete', payment_status: 'paid', metadata: { orderId: 'b'.repeat(24) } } });
  await x.m.syncOrderPayment(pending); assert.equal(x.calls.confirmed.length, 0);
});
test('paid but sold out refunds once with an idempotency key', async () => {
  const x = setup({ confirmResult: 'sold_out' }); await x.m.syncOrderPayment(pending);
  assert.equal(x.calls.refunds.length, 1); assert.equal(x.calls.refunds[0][1].idempotencyKey, 'refund-order-' + ORDER);
  assert.deepEqual(x.calls.statusUpdates, ['REFUNDED']);
});
test('stale hold that was paid gets confirmed, not released', async () => {
  const x = setup({ stale: [pending] }); await x.m.expireStaleOrders();
  assert.equal(x.calls.confirmed.length, 1); assert.equal(x.calls.released.length, 0);
});
test('stale hold keeps its seats when Stripe is unreachable', async () => {
  const x = setup({ stale: [pending], lookupError: Object.assign(Error('network'), { code: undefined }) });
  await x.m.expireStaleOrders(); assert.equal(x.calls.released.length, 0);
});
test('stale hold whose session no longer exists is released', async () => {
  const x = setup({ stale: [pending], lookupError: Object.assign(Error('No such session'), { code: 'resource_missing' }) });
  await x.m.expireStaleOrders(); assert.deepEqual(x.calls.released, [ORDER]);
});
test('stale open session is closed in Stripe before seats are released', async () => {
  const x = setup({ stale: [pending], session: { id: 'cs_1', status: 'open', payment_status: 'unpaid', metadata: { orderId: ORDER } } });
  await x.m.expireStaleOrders(); assert.equal(x.calls.expired, 1); assert.deepEqual(x.calls.released, [ORDER]);
});
test('stale open session that cannot be closed is not released', async () => {
  const x = setup({ stale: [pending], expireFails: true, session: { id: 'cs_1', status: 'open', payment_status: 'unpaid', metadata: { orderId: ORDER } } });
  await x.m.expireStaleOrders(); assert.equal(x.calls.released.length, 0);
});
test('stale hold without a Stripe session is released', async () => {
  const x = setup({ stale: [{ id: ORDER, status: 'PENDING', stripeSessionId: null }] });
  await x.m.expireStaleOrders(); assert.deepEqual(x.calls.released, [ORDER]);
});
