/* eslint-disable @typescript-eslint/no-require-imports -- Node test harness for server action boundaries. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { z } = require('zod');
const source = fs.readFileSync('src/app/events/[slug]/actions.ts','utf8');
function setup({ webhook = true, failSave = false, failExpire = false, signedIn = true, live = true, totalCents = 2500, currency = "USD", withHotel = false } = {}) {
 const calls = { released:0, confirmed:0, expired:0, created:0, options:null };
 const order = { currency, id:'a'.repeat(24),accessToken:'private-token',totalCents,email:'test@example.com',event:{title:'Test event',slug:'regular-event'},items:[{name:'Test',quantity:1,priceCents:totalCents}],expiresAt:new Date(Date.now()+1800000) };
 if (withHotel) order.hotelStay = { hotelName:'Sydney Hotel',roomName:'King',rooms:2,nights:3,nightlyCents:14375,checkIn:'2026-10-09',checkOut:'2026-10-12' };
 const dependencies = {
  '@/lib/customer':{currentCustomer:async()=>signedIn?{id:'d'.repeat(24),email:'account@example.com'}:null},
  'next/navigation':{redirect: path=>{const error=new Error('redirect');error.path=path;throw error;}},
  zod:{z},
  '@/lib/booking':{BookingError:class extends Error{},createHold:async input=>{order.email=input.email;return order},releaseOrder:async()=>{calls.released++},confirmOrder:async()=>{calls.confirmed++}},
  '@/lib/payments':{expireStaleOrders:async()=>0},
  '@/lib/db':{prisma:{order:{update:async()=>{if(failSave)throw Error('write failed')}}}},
  '@/lib/stripe':{livePaymentsConfigured:live,stripe:{checkout:{sessions:{create:async options=>{calls.created++;calls.options=options;return{id:'cs_test_mock',client_secret:'mock_client_secret'}},expire:async()=>{calls.expired++;if(failExpire)throw Error('completed')}}}}},
 };
 const context={exports:{},require:name=>{if(!(name in dependencies))throw Error('Unexpected dependency: '+name);return dependencies[name]},process:{env:{NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:live?'pk_live_mock':'pk_test_mock',STRIPE_SECRET_KEY:live?'sk_live_mock':'sk_test_mock',...(webhook?{STRIPE_WEBHOOK_SECRET:'whsec_mock'}:{})}},console:{error:()=>{}}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 const form=new FormData();form.set('eventId','b'.repeat(24));form.set('email','test@example.com');form.append('ticketTypeId','c'.repeat(24));form.append('quantity','1');
 return {calls,run:()=>context.exports.startCheckout({},form)};
}
test('checkout works without a webhook secret and never confirms from the browser',async()=>{const x=setup({webhook:false});await assert.rejects(x.run(),e=>e.path==='/orders/'+'a'.repeat(24)+'/checkout?t=private-token');assert.equal(x.calls.created,1);assert.equal(x.calls.released,0);assert.equal(x.calls.confirmed,0)});
test('checkout uses trusted prices, embedded mode, and a local destination',async()=>{const x=setup();await assert.rejects(x.run(),e=>e.path==='/orders/'+ 'a'.repeat(24)+'/checkout?t=private-token');assert.equal(x.calls.options.ui_mode,'embedded_page');assert.equal(x.calls.options.redirect_on_completion,'never');assert.equal(x.calls.options.line_items[0].price_data.unit_amount,2500);assert.equal(x.calls.options.success_url,undefined);assert.equal(x.calls.options.cancel_url,undefined);assert.equal(x.calls.confirmed,0)});
test('failed order update expires Stripe session before releasing inventory',async()=>{const x=setup({failSave:true});assert.match((await x.run()).error,/Could not start/);assert.equal(x.calls.expired,1);assert.equal(x.calls.released,1)});
test('uncertain payment session retains hold to avoid overselling',async()=>{const x=setup({failSave:true,failExpire:true});assert.match((await x.run()).error,/expire automatically/);assert.equal(x.calls.released,0)});

test('guest cannot start checkout',async()=>{const x=setup({signedIn:false});assert.match((await x.run()).error,/sign in/);assert.equal(x.calls.created,0)});
test('receipt uses account email instead of submitted email',async()=>{const x=setup();await assert.rejects(x.run());assert.equal(x.calls.options.payment_intent_data.receipt_email,'account@example.com');assert.equal(x.calls.options.customer_email,'account@example.com')});


test('Australian checkout charges AUD on ticket and hotel lines',async()=>{const x=setup({currency:'AUD',withHotel:true});await assert.rejects(x.run(),e=>!!e.path);assert.equal(x.calls.options.line_items[0].price_data.currency,'aud');assert.equal(x.calls.options.line_items[0].price_data.unit_amount,2500);assert.equal(x.calls.options.line_items[1].price_data.currency,'aud');assert.equal(x.calls.options.line_items[1].price_data.unit_amount,14375);assert.equal(x.calls.options.line_items[1].quantity,6)});

test('missing or test payment configuration cannot create a payment or confirm an order',async()=>{const x=setup({live:false});assert.match((await x.run()).error,/Live payments are temporarily unavailable/);assert.equal(x.calls.created,0);assert.equal(x.calls.confirmed,0)});
test('zero-price orders cannot bypass payment',async()=>{const x=setup({totalCents:0});assert.match((await x.run()).error,/valid paid ticket price/);assert.equal(x.calls.confirmed,0);assert.equal(x.calls.created,0);assert.equal(x.calls.released,1)});
