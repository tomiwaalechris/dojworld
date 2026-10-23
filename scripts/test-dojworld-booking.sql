-- Run on the dedicated local test database ONLY; all scenarios roll back.
begin;
insert into auth.users(id,email,email_confirmed_at) values('10000000-0000-4000-8000-000000000001','owner@doj-test.invalid',now()),('10000000-0000-4000-8000-000000000002','housekeeping@doj-test.invalid',now());
insert into public.organization_memberships(organization_id,user_id,role,active,all_properties)
 select organization_id,'10000000-0000-4000-8000-000000000001','owner',true,true from public.dojworld_settings;
insert into public.organization_memberships(organization_id,user_id,role,active,all_properties)
 select organization_id,'10000000-0000-4000-8000-000000000002','housekeeping',true,true from public.dojworld_settings;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAILED: %',message;end if;end$$;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert((public.online_availability(current_date+10,current_date+13,2::smallint)->>'enabled')::boolean=false,'booking disabled on fresh install');
select pg_temp.assert(not has_function_privilege('anon','public.begin_online_booking(uuid,text,text,date,date,smallint,text,text,text,text,bigint,text)','EXECUTE'),'anon cannot call checkout RPC');
select pg_temp.assert(not has_table_privilege('anon','public.online_bookings','SELECT'),'anon cannot read guest data');
select pg_temp.assert(not has_function_privilege('authenticated','public.confirm_online_payment(text,bigint,text)','EXECUTE'),'staff cannot forge online payment');
select pg_temp.assert(not has_function_privilege('authenticated','public.setup_hotel(text,text,text,integer,bigint)','EXECUTE'),'generic hotel onboarding disabled');
select pg_temp.assert(to_regclass('public.saas_subscriptions') is null,'no SaaS billing schema');
select pg_temp.assert((select bool_and(enabled) from public.online_room_listings),'room listings default to available online');
update public.dojworld_settings set online_enabled=true,cancellation_policy='Test cancellation policy: contact reception before arrival. All mandatory charges are included in the quoted room price.' where singleton=true;
update public.online_room_listings set enabled=true where room_id in (select id from public.rooms where property_id=(select property_id from public.dojworld_settings where singleton=true));
select pg_temp.assert(jsonb_array_length(public.online_availability(current_date+10,current_date+13,2::smallint)->'rooms')=7,'seven verified room mappings');
-- Schedule a real price for just the second night; the online quote must match.
insert into public.room_rate_periods(organization_id,property_id,room_type_id,name,starts_on,ends_before,nightly_rate_kobo,created_by)
 select r.organization_id,r.property_id,r.room_type_id,'Test special night',current_date+11,current_date+12,9000000,'10000000-0000-4000-8000-000000000001' from public.rooms r join public.online_room_listings l on l.room_id=r.id where l.slug='yankari-reserve';
select public.begin_online_booking('20000000-0000-4000-8000-000000000001',repeat('a',64),'yankari-reserve',current_date+10,current_date+13,2::smallint,'Test paid guest','guest@doj-test.invalid','+2348000000000','deposit',23000000,(select cancellation_policy from public.dojworld_settings));
select pg_temp.assert((select count(*) from public.online_bookings)=1,'one booking created');
select pg_temp.assert((select due_now_kobo from public.online_bookings)=7000000,'first-night deposit');
select pg_temp.assert((select count(*) from public.reservation_night_rates)=3,'three immutable nightly snapshots');
select pg_temp.assert((select count(*) from public.journals)=0,'checkout hold is not revenue or payment');
select public.begin_online_booking('20000000-0000-4000-8000-000000000001',repeat('a',64),'yankari-reserve',current_date+10,current_date+13,2::smallint,'Test paid guest','guest@doj-test.invalid','+2348000000000','deposit',23000000,(select cancellation_policy from public.dojworld_settings));
select pg_temp.assert((select count(*) from public.online_bookings)=1,'checkout retries are idempotent');
select pg_temp.assert((select not(q->>'available')::boolean from jsonb_array_elements(public.online_availability(current_date+10,current_date+13,2::smallint)->'rooms') q where q->>'slug'='yankari-reserve'),'hold removed room from public availability');
-- Existing authenticated staff booking competes with exactly the same inventory.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ declare s public.dojworld_settings%rowtype;r uuid;begin
 select * into s from public.dojworld_settings;select room_id into r from public.online_room_listings where slug='yankari-reserve';
 begin perform public.create_priced_reservation(s.organization_id,s.property_id,r,'Walk-in test',null,null,current_date+10,current_date+13,2::smallint,null);raise exception 'Staff booking incorrectly succeeded';exception when exclusion_violation then null;end;
end$$;
select set_config('request.jwt.claim.sub','',true);
do $$begin begin perform public.confirm_online_payment('DOJ-20000000000040008000000000000001',1,'NGN');raise exception 'Wrong amount accepted';exception when check_violation then null;end;end$$;
select public.confirm_online_payment('DOJ-20000000000040008000000000000001',7000000,'NGN');
select public.confirm_online_payment('DOJ-20000000000040008000000000000001',7000000,'NGN');
select pg_temp.assert((select count(*) from public.payments)=1,'duplicate callbacks record one payment');
select pg_temp.assert((select count(*) from public.guest_deposits)=1,'one guest advance');
select pg_temp.assert((select count(*) from public.reservations where status='confirmed')=1,'paid hold confirmed');
select pg_temp.assert((public.online_booking_status('20000000-0000-4000-8000-000000000001',repeat('a',64))->>'balanceKobo')::bigint=16000000,'deposit credited against quoted room total');
select pg_temp.assert((select sum(debit_kobo)-sum(credit_kobo) from public.journal_lines)=0,'online deposit journal balances');
select pg_temp.assert((select count(*) from public.journals where source_type='room_charge')=0,'advance is not room revenue');
do $$begin begin perform public.online_booking_status('20000000-0000-4000-8000-000000000001',repeat('b',64));raise exception 'Wrong guest token accepted';exception when no_data_found then null;end;end$$;
-- Expired checkout releases inventory, and a late paid transaction is retained
-- as a liability for review without confirming an unavailable room.
select public.begin_online_booking('20000000-0000-4000-8000-000000000002',repeat('b',64),'mambilla-plateau',current_date+10,current_date+13,2::smallint,'Late guest','late@doj-test.invalid','+2348000000001','full',24000000,(select cancellation_policy from public.dojworld_settings));
update public.online_bookings set expires_at=now()-interval '1 minute' where id='20000000-0000-4000-8000-000000000002';
select public.begin_online_booking('20000000-0000-4000-8000-000000000003',repeat('c',64),'mambilla-plateau',current_date+10,current_date+13,2::smallint,'Next guest','next@doj-test.invalid','+2348000000002','full',24000000,(select cancellation_policy from public.dojworld_settings));
select public.confirm_online_payment('DOJ-20000000000040008000000000000002',24000000,'NGN');
select pg_temp.assert((select state from public.online_bookings where id='20000000-0000-4000-8000-000000000002')='payment_review','late payment goes to staff review');
select pg_temp.assert((select status from public.reservations where id=(select reservation_id from public.online_bookings where id='20000000-0000-4000-8000-000000000002'))='cancelled','late payment cannot reclaim room');
select pg_temp.assert((select count(*) from public.payments)=2,'late funds recorded exactly once');
-- A pay-at-hotel request leaves the room sellable until staff approve it.
select public.begin_online_booking('20000000-0000-4000-8000-000000000004',repeat('d',64),'tinapa-resort',current_date+10,current_date+13,2::smallint,'Arrival guest','arrival@doj-test.invalid','+2348000000003','arrival',24000000,(select cancellation_policy from public.dojworld_settings));
select pg_temp.assert((select reservation_id is null from public.online_bookings where id='20000000-0000-4000-8000-000000000004'),'arrival request does not allocate inventory');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$begin begin perform public.decide_online_request('20000000-0000-4000-8000-000000000004',true,now()+interval '1 day','Test decision');raise exception 'Housekeeper approved booking';exception when insufficient_privilege then null;end;end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.decide_online_request('20000000-0000-4000-8000-000000000004',true,now()+interval '1 day','Called the guest and agreed the payment deadline.');
select pg_temp.assert((select reservation_id is not null and state='confirmed' from public.online_bookings where id='20000000-0000-4000-8000-000000000004'),'staff approval allocates room');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert(public.consume_online_limit('test',2,60),'first rate-limit attempt');
select pg_temp.assert(public.consume_online_limit('test',2,60),'second rate-limit attempt');
select pg_temp.assert(not public.consume_online_limit('test',2,60),'third rate-limit attempt rejected');
-- Prove RLS with actual staff roles, not merely UI visibility.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.assert((select count(*) from public.online_bookings)=0,'housekeeping cannot read website guest details');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert((select count(*) from public.online_bookings)=4,'owner can read website bookings');
reset role;
rollback;
