const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {exports, require:name => name === 'server-only' ? {} : Object.hasOwn(mocks,name) ? mocks[name] : require(name), process:{env:{}}, Buffer, URL, Date, Number, AbortSignal, ...globals});
  return exports;
}
const channels = load('lib/booking/channels.ts');
test('channel references and collection state are explicit and source-bound', () => {
  assert.equal(channels.channelDetailsError('booking_com','ABC123','1','','collected_by_channel'), undefined);
  assert.match(channels.channelDetailsError('booking_com','','1','','unknown'), /reservation number/);
  assert.match(channels.channelDetailsError('website','','','','unknown'), /Choose where/);
  assert.match(channels.channelDetailsError('phone','','','','collected_by_channel'), /only to external/);
  assert.match(channels.channelDetailsError('other','','','','unknown'), /channel name/);
  assert.equal(channels.channelLabel('website'), 'Hotel website');
});
test('email remains disconnected until both server credentials and a sender are present', async () => {
  const email = load('lib/booking/email.ts',{}, {fetch:()=>{throw new Error('must not call provider');}});
  assert.equal(email.emailReady(), false);
  await assert.rejects(email.sendBookingEmail('guest@doj-test.invalid','Booking','Message','key'), /not connected/);
});
test('provider acceptance is required, stable idempotency keys prevent email retries duplicating', async () => {
  const calls=[]; let accepted=true;
  const email = load('lib/booking/email.ts',{}, {process:{env:{RESEND_API_KEY:'test-private-key',BOOKING_EMAIL_FROM:'Dojworld <bookings@doj-test.invalid>'}},fetch:async (url,options)=>{calls.push({url,options});return {ok:accepted,json:async()=>accepted?{id:'provider-email-1'}:{message:'private provider detail'}};}});
  assert.equal(await email.sendBookingEmail('guest@doj-test.invalid','Booking','Text','job-1'),'provider-email-1');
  await email.sendBookingEmail('guest@doj-test.invalid','Booking','Text','job-1');
  assert.equal(calls[0].options.headers['Idempotency-Key'],calls[1].options.headers['Idempotency-Key']);
  assert.equal(JSON.parse(calls[0].options.body).to[0],'guest@doj-test.invalid');
  accepted=false;
  await assert.rejects(email.sendBookingEmail('guest@doj-test.invalid','Booking','Text','job-2'), error=>/did not accept/.test(error.message)&&!error.message.includes('private'));
});
test('request and late-payment emails do not promise a confirmed room',()=>{
  const {notificationEmail}=load('lib/booking/email.ts');
  const payload={reference:'DOJ-test',room:'Zuma',arrival:'2026-11-01',departure:'2026-11-02',state:'payment_review'};
  assert.match(notificationEmail('requested',payload,'https://example.invalid').text,/must approve/);
  assert.match(notificationEmail('payment_review',payload,'https://example.invalid').text,/room is not confirmed/);
  assert.match(notificationEmail('payment_review',payload,'https://example.invalid').text,/Do not pay again/);
  assert.match(notificationEmail('confirmed',payload,'https://example.invalid').text,/\/booking\/recover/);
});
function serverMock(rpc) {
  class BookingError extends Error {constructor(message,status=400){super(message);this.status=status;}}
  return {BookingError,assertOrigin:()=>{},readBody:r=>r.json(),rateLimit:async()=>{},bookingClient:()=>({rpc}),siteOrigin:()=> 'https://doj-test.invalid',privateJson:value=>({status:200,value}),errorResponse:error=>({status:error.status??500,value:{error:error.message}}),rpcError:error=>{throw new BookingError(error.message,503);}};
}
test('recovery gives identical responses for known, unknown and delivery-failed bookings',async()=>{
  let found=false, fail=false;const deliveries=[];const requests=[];
  const server=serverMock(async(name,args)=>{requests.push({name,args});return {data:found?{id:'booking-id',email:'saved@doj-test.invalid'}:null,error:null};});
  const route=load('app/api/booking/recover/route.ts',{'@/lib/booking/server':server,'@/lib/booking/email':{emailReady:()=>true,sendBookingEmail:async(...args)=>{deliveries.push(args);if(fail)throw new Error('provider failed');}}});
  const request=()=>({json:async()=>({reference:'DOJ-61000000000040008000000000000011',email:'guest@doj-test.invalid'})});
  const unknown=await route.POST(request());found=true;
  const known=await route.POST(request());fail=true;
  const failed=await route.POST(request());
  assert.equal(JSON.stringify(unknown),JSON.stringify(known));assert.equal(JSON.stringify(known),JSON.stringify(failed));
  assert.equal(deliveries.length,2);assert.equal(deliveries[0][0],'saved@doj-test.invalid');
  assert.match(requests[0].args.p_token_hash,/^[a-f0-9]{64}$/);assert.match(deliveries[0][2],/\/booking\/access\?token=[a-f0-9]{64}/);
});
test('missing email credentials do not claim to send a recovery link',async()=>{
  const route=load('app/api/booking/recover/route.ts',{'@/lib/booking/server':serverMock(()=>{throw new Error('must not look up guest');}),'@/lib/booking/email':{emailReady:()=>false}});
  const result=await route.POST({json:async()=>({reference:'DOJ-61000000000040008000000000000011',email:'guest@doj-test.invalid'})});
  assert.equal(result.status,503);assert.match(result.value.error,/being connected/);
});
test('recovery access needs a POST and successful one-use token consumption before setting a cookie',async()=>{
  let valid=false,cookies=0;
  const server=serverMock(async()=>valid?{data:'61000000-0000-4000-8000-000000000011'}:{error:{code:'P0002'}});
  server.setBookingCookie=(response,id,token)=>{cookies++;assert.match(token,/^[a-f0-9]{64}$/);return response;};
  const route=load('app/api/booking/access/route.ts',{'@/lib/booking/server':server});
  assert.equal(route.GET,undefined);
  const req=()=>({json:async()=>({token:'a'.repeat(64)})});
  assert.equal((await route.POST(req())).status,410);assert.equal(cookies,0);
  valid=true;const result=await route.POST(req());assert.equal(cookies,1);assert.match(result.value.url,/^\/booking\/return\?id=/);
});
test('worker does not claim emails when the sender connection is missing',async()=>{
  const called=[];
  const client={rpc:async(name)=>{called.push(name);return {data:name==='claim_booking_payment_checks'?[]:null,error:null};},from:name=>{
    const b={select:()=>b,eq:()=>b,in:()=>b,lt:()=>b,order:()=>b,limit:async()=>({data:[],error:null}),single:async()=>({data:{property_id:'property'},error:null})};return b;
  }};
  const tasks=load('lib/booking/tasks.ts',{'./server':{bookingClient:()=>client,siteOrigin:()=> 'https://example.invalid',rpcError:error=>{throw error;},verifyPayment:async()=>false},'./email':{emailReady:()=>false},'./reconciliation':{refreshProviderRefund:async()=>{}}});
  const result=await tasks.runBookingTasks();assert.equal(result.emailConnected,false);assert.equal(result.accepted,0);assert.ok(!called.includes('claim_booking_notifications'));assert.ok(called.includes('release_expired_online_bookings'));
});
test('refund discovery reads all pages and never records another transaction',async()=>{
  const recorded=[];let foreign=false;
  const reconciliation=load('lib/booking/reconciliation.ts',{'./server':{...serverMock(async(name,args)=>{recorded.push(args);return {error:null};}),paystack:async route=>{
    if(route.startsWith('transaction/verify/'))return {id:123,reference:'DOJ-61000000000040008000000000000011'};
    if(route.endsWith('page=1'))return Array.from({length:100},(_,i)=>({id:i+1,transaction:foreign?999:123,amount:100,currency:'NGN',status:'processed'}));
    return [{id:101,transaction:123,amount:100,currency:'NGN',status:'pending'}];
  }}});
  await reconciliation.refreshBookingRefunds('DOJ-61000000000040008000000000000011');assert.equal(recorded.length,101);
  recorded.length=0;foreign=true;await assert.rejects(reconciliation.refreshBookingRefunds('DOJ-61000000000040008000000000000011'),/different transaction/);assert.equal(recorded.length,0);
});
test('documented refund webhooks use transaction_reference and requery the provider',async()=>{
  const observed=[];
  const route=load('app/api/paystack/webhook/route.ts',{'next/server':{NextResponse:{json:value=>value}},'@/lib/booking/security':{validPaystackSignature:()=>true},'@/lib/booking/server':{errorResponse:e=>{throw e;},verifyPayment:async()=>{}},'@/lib/booking/reconciliation':{refreshBookingRefunds:async reference=>observed.push(reference),refreshProviderRefund:async()=>{throw new Error('documented payload has no refund ID');}}});
  const ref='DOJ-61000000000040008000000000000011';
  await route.POST({text:async()=>JSON.stringify({event:'refund.processed',data:{transaction_reference:ref,amount:'100000',currency:'NGN'}}),headers:{get:()=> 'signed'}});
  assert.equal(observed[0],ref);
});
