-- Disposable local dedicated database only. Changes roll back.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAILED: %',message;end if;end$$;
insert into auth.users(id,email,email_confirmed_at) values('51000000-0000-4000-8000-000000000001','channel-owner@doj-test.invalid',now()),('51000000-0000-4000-8000-000000000002','channel-housekeeping@doj-test.invalid',now());
insert into public.organization_memberships(organization_id,user_id,role,active,all_properties)
 select organization_id,'51000000-0000-4000-8000-000000000001','owner',true,true from public.dojworld_settings where singleton=true;
insert into public.organization_memberships(organization_id,user_id,role,active,all_properties)
 select organization_id,'51000000-0000-4000-8000-000000000002','housekeeping',true,true from public.dojworld_settings where singleton=true;
update public.dojworld_settings set online_enabled=true,cancellation_policy='Test policy: cancellation is free until 24 hours before arrival.' where singleton=true;
create function pg_temp.book(p_request uuid,p_slug text,p_source text,p_ref text default null,p_unit text default '1',p_collection text default 'unknown',p_deadline timestamptz default null) returns uuid language plpgsql as $$
declare s public.dojworld_settings%rowtype;r uuid;q jsonb;result jsonb;
begin
 select * into s from public.dojworld_settings where singleton=true;
 select room_id into r from public.online_room_listings where slug=p_slug;
 select jsonb_agg(jsonb_build_object('service_date',service_date,'standard_rate_kobo',standard_rate_kobo) order by service_date) into q from public.get_room_rate_quote(r,current_date+100,current_date+102);
 result:=public.create_channel_reservation(p_request,s.organization_id,s.property_id,r,'TEST Channel guest',null,'channel-guest@doj-test.invalid',current_date+100,current_date+102,1::smallint,null,null,null,q,'unpaid',null,null,null,p_source,p_ref,p_unit,null,p_collection,p_deadline is null,p_deadline);
 return (result->>'reservationId')::uuid;
end $$;
create temp table test_channels(name text primary key,id uuid);grant all on test_channels to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000001',true);
insert into test_channels values('phone',pg_temp.book('51000000-0000-4000-8000-000000000011','mambilla-plateau','phone'));
select pg_temp.assert((select source='phone' from public.reservations where id=(select id from test_channels where name='phone')),'phone reservation records its source');
do $$begin begin perform pg_temp.book('51000000-0000-4000-8000-000000000012','mambilla-plateau','whatsapp');raise exception 'Overlapping WhatsApp booking was accepted';exception when exclusion_violation then null;end;end$$;
insert into test_channels values('booking',pg_temp.book('51000000-0000-4000-8000-000000000013','ikogosi-springs','booking_com','TEST-BC-123','1','collected_by_channel'));
select pg_temp.assert(pg_temp.book('51000000-0000-4000-8000-000000000013','ikogosi-springs','booking_com','TEST-BC-123','1','collected_by_channel')=(select id from test_channels where name='booking'),'same attempt returns the same channel reservation');
select pg_temp.assert((select gross_paid_kobo=0 from public.get_reservation_payment_summaries((select property_id from public.dojworld_settings where singleton=true),array[(select id from test_channels where name='booking')])),'channel payment report does not invent hotel cash');
do $$begin begin perform pg_temp.book('51000000-0000-4000-8000-000000000014','obudu-ranch','booking_com','test-bc-123','1','collected_by_channel');raise exception 'Duplicate channel reference accepted';exception when unique_violation then null;end;end$$;
insert into test_channels values('booking-second-room',pg_temp.book('51000000-0000-4000-8000-000000000015','obudu-ranch','booking_com','TEST-BC-123','2','collected_by_channel'));
insert into test_channels values('temporary',pg_temp.book('51000000-0000-4000-8000-000000000016','yankari-reserve','whatsapp',null,'1','unknown',now()+interval '1 hour'));
insert into test_channels values('paid-hold',pg_temp.book('51000000-0000-4000-8000-000000000017','zuma-rock','phone',null,'1','unknown',now()+interval '1 hour'));
select public.record_reservation_deposit((select id from test_channels where name='paid-hold'),(select id from public.payment_methods where name='Cash' limit 1),10000,null,'channel-test-paid-hold');
select pg_temp.assert((select guaranteed_unpaid and payment_deadline is null from public.reservations where id=(select id from test_channels where name='paid-hold')),'receipt immediately protects the hold and clears its deadline');
select pg_temp.assert((select count(*)=1 from public.channel_inventory_tasks where reservation_id=(select id from test_channels where name='phone') and status='pending'),'inventory changes coalesce to one pending calendar check');
do $$declare t public.channel_inventory_tasks%rowtype;begin
 select * into t from public.channel_inventory_tasks where reservation_id=(select id from test_channels where name='phone') and status='pending';
 perform public.close_unchecked_reservation(t.reservation_id,'cancelled','TEST guest cancelled their phone booking.');
 begin perform public.complete_channel_inventory_task(t.id,t.updated_at,'Checked the calendar before cancellation');raise exception 'Stale calendar check accepted';exception when check_violation then null;end;
 select * into t from public.channel_inventory_tasks where id=t.id;
 perform public.complete_channel_inventory_task(t.id,t.updated_at,'Confirmed Booking.com availability after cancellation.');
end$$;
reset role;
update public.reservations set payment_deadline=now()-interval '1 minute' where id=(select id from test_channels where name='temporary');
set local role authenticated;
select pg_temp.assert((select count(*)>0 from public.get_available_rooms((select property_id from public.dojworld_settings where singleton=true),current_date+100,current_date+102)),'reception availability releases expired unpaid holds');
select pg_temp.assert((select status='cancelled' from public.reservations where id=(select id from test_channels where name='temporary')),'temporary unpaid hold expires');
select pg_temp.assert((select status='confirmed' and guaranteed_unpaid and payment_deadline is null from public.reservations where id=(select id from test_channels where name='paid-hold')),'actual receipt protects a temporary hold');
select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000002',true);
select pg_temp.assert((select count(*)=0 from public.channel_inventory_tasks),'housekeeping cannot read channel operations');
do $$begin begin perform pg_temp.book('51000000-0000-4000-8000-000000000018','tinapa-resort','phone');raise exception 'Housekeeping created a channel booking';exception when insufficient_privilege then null;end;end$$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert((select not(value->>'available')::boolean from jsonb_array_elements(public.online_availability(current_date+100,current_date+102,1::smallint)->'rooms') value where value->>'slug'='ikogosi-springs'),'Booking.com reservation removes room from website inventory');
select public.begin_online_booking('51000000-0000-4000-8000-000000000021',repeat('d',64),'tinapa-resort',current_date+70,current_date+73,1::smallint,'TEST Website guest','web-channel@doj-test.invalid','+2348000000000','full',24000000,(select cancellation_policy from public.dojworld_settings where singleton=true));
select public.confirm_online_payment('DOJ-51000000000040008000000000000021',24000000,'NGN');
-- Controlled fixture amendments exercise the projection without altering snapshots.
update public.reservations set departure_date=current_date+72 where id=(select reservation_id from public.online_bookings where id='51000000-0000-4000-8000-000000000021');
update public.reservation_rooms set room_id=(select room_id from public.online_room_listings where slug='olumo-rock'),check_out_date=current_date+72 where reservation_id=(select reservation_id from public.online_bookings where id='51000000-0000-4000-8000-000000000021');
select pg_temp.assert((public.online_booking_status('51000000-0000-4000-8000-000000000021',repeat('d',64))->>'roomName')='Olumo Rock','guest sees the current assigned room');
select pg_temp.assert((public.online_booking_status('51000000-0000-4000-8000-000000000021',repeat('d',64))->>'departure')=(current_date+72)::text,'guest sees the amended departure');
select pg_temp.assert((public.online_booking_status('51000000-0000-4000-8000-000000000021',repeat('d',64))->>'totalKobo')::bigint=16000000,'guest total uses current agreed stay nights');
select pg_temp.assert((select departure_date=current_date+73 and quoted_total_kobo=24000000 from public.online_bookings where id='51000000-0000-4000-8000-000000000021'),'original booking snapshot is retained');
rollback;
