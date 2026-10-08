/* eslint-disable @typescript-eslint/no-require-imports -- Isolated payment configuration tests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/lib/stripe.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function config(secret, publishable) {
  const context = { exports: {}, process: { env: { STRIPE_SECRET_KEY: secret, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: publishable } }, require: () => ({ default: class Stripe {} }) };
  vm.runInNewContext(source, context);
  return context.exports;
}
test('missing and test secret keys never initialize payment processing', () => {
  for (const key of [undefined, '', 'sk_test_mock', 'rk_test_mock']) {
    const c = config(key, 'pk_live_mock');
    assert.equal(c.stripe, null);
    assert.equal(c.livePaymentsConfigured, false);
  }
});
test('checkout requires matching live key modes', () => {
  for (const key of [undefined, 'pk_test_mock']) assert.equal(config('sk_live_mock', key).livePaymentsConfigured, false);
  assert.equal(config('sk_live_mock', 'pk_live_mock').livePaymentsConfigured, true);
  assert.equal(config('rk_live_mock', 'pk_live_mock').livePaymentsConfigured, true);
});
