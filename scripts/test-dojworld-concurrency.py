"""Test only a disposable local dedicated Dojworld database. Leaves fixtures."""
import concurrent.futures
import json
import os
import subprocess
import uuid

host=os.environ.get('DOJ_TEST_PGHOST','/tmp')
port=os.environ.get('DOJ_TEST_PGPORT','55439')
database=os.environ.get('DOJ_TEST_PGDATABASE','postgres')
if host not in ('/tmp','127.0.0.1','localhost'):
    raise SystemExit('Only a disposable local test database is permitted.')

def execute(sql):
    return subprocess.run(['psql','-h',host,'-p',port,'-d',database,'-v','ON_ERROR_STOP=1','-q','-t','-A'],input=sql,text=True,capture_output=True,timeout=20)
def checked(sql):
    r=execute(sql)
    if r.returncode:raise RuntimeError(r.stderr)
    return r.stdout.strip()
if checked("select count(*) from public.reservations;")!='0' or checked('select count(*) from auth.users;')!='0':
    raise SystemExit('Refusing fixtures: the disposable database must have no reservations or auth users.')
owner=str(uuid.uuid4())
checked(f"""insert into auth.users(id,email,email_confirmed_at) values('{owner}','concurrency@doj-test.invalid',now());
insert into public.organization_memberships(organization_id,user_id,role,active,all_properties) select organization_id,'{owner}','owner',true,true from public.dojworld_settings;
update public.dojworld_settings set online_enabled=true,cancellation_policy='Cancellation policy for isolated tests. All room prices include mandatory charges.' where singleton=true;
update public.online_room_listings set enabled=true where room_id is not null;
""")
org,prop=checked('select organization_id::text||\'|\'||property_id::text from public.dojworld_settings;').split('|')
room=checked("select room_id from public.online_room_listings where slug='yankari-reserve';")
bid=str(uuid.uuid4())
web=f"""begin;set local role service_role;select set_config('request.jwt.claim.role','service_role',true);
select public.begin_online_booking('{bid}',repeat('a',64),'yankari-reserve',current_date+30,current_date+32,2::smallint,'Web guest','web@doj-test.invalid','+2348000000000','deposit',14000000,(select cancellation_policy from public.dojworld_settings));select pg_sleep(0.2);commit;"""
staff=f"""begin;set local role authenticated;select set_config('request.jwt.claim.sub','{owner}',true);
select public.create_priced_reservation('{org}','{prop}','{room}','Desk guest',null,null,current_date+30,current_date+32,2::smallint,null);select pg_sleep(0.2);commit;"""
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(execute,[web,staff]))
assert sum(r.returncode==0 for r in results)==1,[(r.returncode,r.stderr) for r in results]
assert 'reserved' in next(r.stderr for r in results if r.returncode),[r.stderr for r in results]
assert checked('select count(*) from public.reservations;')=='1'
print(json.dumps({'scenario':'simultaneous website and reception booking','accepted':1,'conflict_rejected':1}))
# Both callback and webhook can arrive at once. They must post one receipt.
payment_id=str(uuid.uuid4());reference='DOJ-'+payment_id.replace('-','')
checked(f"""select set_config('request.jwt.claim.role','service_role',false);
select public.begin_online_booking('{payment_id}',repeat('b',64),'tinapa-resort',current_date+30,current_date+32,2::smallint,'Paid guest','paid@doj-test.invalid','+2348000000001','full',16000000,(select cancellation_policy from public.dojworld_settings));""")
payment=f"begin;set local role service_role;select set_config('request.jwt.claim.role','service_role',true);select public.confirm_online_payment('{reference}',16000000,'NGN');select pg_sleep(0.2);commit;"
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(execute,[payment,payment]))
assert all(r.returncode==0 for r in results),[r.stderr for r in results]
assert checked('select count(*) from public.payments;')=='1'
assert checked('select count(*) from public.guest_deposits;')=='1'
assert checked("select count(*) from public.journals where status='posted';")=='1'
print(json.dumps({'scenario':'simultaneous verified payment callbacks','receipts':1,'deposit_records':1,'posted_journals':1}))

# Two staff must not enter the same channel booking on different rooms.
channel_sql=[]
for slug in ['obudu-ranch','ikogosi-springs']:
    request=str(uuid.uuid4())
    rid=checked(f"select room_id from public.online_room_listings where slug='{slug}';")
    channel_sql.append(f"""begin;set local role authenticated;select set_config('request.jwt.claim.sub','{owner}',true);
    with q as(select jsonb_agg(jsonb_build_object('service_date',service_date,'standard_rate_kobo',standard_rate_kobo) order by service_date) rates from public.get_room_rate_quote('{rid}',current_date+60,current_date+62))
    select public.create_channel_reservation('{request}','{org}','{prop}','{rid}','TEST concurrent channel guest',null,null,current_date+60,current_date+62,1::smallint,null,null,null,q.rates,'unpaid',null,null,null,'booking_com','TEST-CONCURRENT-BC','1',null,'collected_by_channel',true,null) from q;select pg_sleep(0.2);commit;""")
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(execute,channel_sql))
assert sum(r.returncode==0 for r in results)==1,[(r.returncode,r.stderr) for r in results]
assert checked("select count(*) from public.reservations where external_reference='TEST-CONCURRENT-BC';")=='1'
print(json.dumps({'scenario':'simultaneous duplicate Booking.com entry on different rooms','accepted':1,'duplicate_rejected':1}))
# Concurrent workers claim the same confirmation at most once.
claim="begin;set local role service_role;select set_config('request.jwt.claim.role','service_role',true);select count(*) from public.claim_booking_notifications(3);select pg_sleep(0.2);commit;"
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(execute,[claim,claim]))
assert all(r.returncode==0 for r in results),[r.stderr for r in results]
assert sorted(int(next(line for line in r.stdout.splitlines() if line in ('0','1'))) for r in results)==[0,1],[r.stdout for r in results]
print(json.dumps({'scenario':'simultaneous confirmation email workers','claimed_once':1,'duplicate_claims':0}))
