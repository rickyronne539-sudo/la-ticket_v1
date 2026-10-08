/* eslint-disable @typescript-eslint/no-require-imports -- Standalone currency regression tests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

function load(path, globals = {}) {
  const context = { exports: {}, ...globals };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const pricing = load('src/lib/pricing.ts');
const format = load('src/lib/format.ts');
function setup({ rate = 1.4375, date, fail = false } = {}) {
  let now = Date.now();
  const event = { id: 'event', slug: 'olivia-dean-sydney', venue: { country: 'Australia', timezone: 'Australia/Sydney' }, ticketTypes: [{ id: 'ticket', priceCents: 11000 }] };
  const exchange = load('src/lib/exchange-rates.ts', {
    require: name => ({ 'server-only': {}, 'node:crypto': crypto, './pricing': pricing })[name],
    Buffer, AbortSignal, Date: class extends Date { static now() { return now; } },
    process: { env: { TICKET_SECRET: 'test-secret' } },
    fetch: async () => ({ ok: !fail, json: async () => ({ base: 'USD', quote: 'AUD', rate, date: date ?? new Date(now).toISOString().slice(0, 10) }) }),
  });
  return { event, exchange, advance: ms => { now += ms; } };
}

test('Australian country codes and legacy timezones select AUD, US and Nairobi remain USD', () => {
  for (const country of ['Australia', 'AU', 'aus', ' australia ']) assert.equal(pricing.eventCurrency({ country }), 'AUD');
  assert.equal(pricing.eventCurrency({ timezone: 'Australia/Sydney' }), 'AUD');
  assert.equal(pricing.eventCurrency({ country: 'US', timezone: 'Australia/Sydney' }), 'USD');
  assert.equal(pricing.eventCurrency({ country: 'Kenya', timezone: 'Africa/Nairobi' }), 'USD');
});
test('conversion rounds each unit to cents and labels the currency explicitly', () => {
  assert.equal(pricing.convertCents(11000, 1.4375), 15813);
  assert.equal(pricing.convertCents(10000, 1.4375), 14375);
  assert.equal(pricing.convertCents(12000, 1.4375), 17250);
  assert.match(format.formatPrice(15813, 'AUD'), /AUD.*158\.13/);
  assert.match(format.formatPrice(50), /USD.*0\.50/);
  for (const rate of [NaN, Infinity, -1, 0]) assert.throws(() => pricing.convertCents(11000, rate));
});
test('server-signed quote locks the displayed exchange rate for this event', async () => {
  const x = setup();
  const quote = await x.exchange.createPriceQuote(x.event);
  assert.equal(x.exchange.verifyPriceQuote(quote.token, x.event).exchangeRate, 1.4375);
  assert.equal(x.exchange.verifyPriceQuote(quote.token, x.event).currency, 'AUD');
});
test('tampered, missing, cross-event and repriced AUD quotes are rejected', async () => {
  const x = setup();
  const quote = await x.exchange.createPriceQuote(x.event);
  assert.throws(() => x.exchange.verifyPriceQuote(undefined, x.event));
  assert.throws(() => x.exchange.verifyPriceQuote(quote.token + 'x', x.event));
  assert.throws(() => x.exchange.verifyPriceQuote(quote.token, { ...x.event, id: 'another-event' }));
  assert.throws(() => x.exchange.verifyPriceQuote(quote.token, { ...x.event, ticketTypes: [{ id: 'ticket', priceCents: 12000 }] }));
});
test('expired quotes require a refresh instead of silently changing the charge', async () => {
  const x = setup();
  const quote = await x.exchange.createPriceQuote(x.event);
  x.advance(31 * 60 * 1000);
  assert.throws(() => x.exchange.verifyPriceQuote(quote.token, x.event), /expired or changed/);
});
test('unavailable, invalid or stale AUD rates fail closed', async () => {
  for (const options of [{ fail: true }, { rate: 0 }, { rate: '1.4375' }, { date: '2000-01-01' }, { date: 'not-a-date' }]) {
    const x = setup(options);
    await assert.rejects(x.exchange.createPriceQuote(x.event));
  }
});
test('USD pricing does not depend on the AUD provider and old USD forms still work', async () => {
  const x = setup({ fail: true });
  x.event.venue = { country: 'US', timezone: 'America/Los_Angeles' };
  const quote = await x.exchange.createPriceQuote(x.event);
  assert.equal(quote.currency, 'USD');
  assert.equal(quote.exchangeRate, 1);
  assert.equal(x.exchange.verifyPriceQuote(undefined, x.event).currency, 'USD');
});
