-- Disposable local Dojworld database only. All data fixtures roll back.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAILED: %',message;end if;end$$;
insert into auth.users(id,email,email_confirmed_at) values
 ('31000000-0000-4000-8000-000000000001','bulk-owner@doj-test.invalid',now()),
 ('31000000-0000-4000-8000-000000000002','bulk-desk@doj-test.invalid',now());
insert into public.organization_memberships(organization_id,user_id,role,active,all_properties)
 select organization_id,'31000000-0000-4000-8000-000000000001','owner',true,true from public.dojworld_settings;
insert into public.organization_memberships(organization_id,user_id,role,active,all_properties)
 select organization_id,'31000000-0000-4000-8000-000000000002','front_desk',true,true from public.dojworld_settings;
insert into public.room_types(id,organization_id,property_id,name,base_rate_kobo)
 select '31000000-0000-4000-8000-000000000100',organization_id,property_id,'Bulk Test',5000000 from public.dojworld_settings;
insert into public.rooms(id,organization_id,property_id,room_type_id,room_number,housekeeping_status)
 select x.id::uuid,s.organization_id,s.property_id,'31000000-0000-4000-8000-000000000100',x.name,x.cleanliness::public.room_housekeeping_status
 from public.dojworld_settings s cross join (values
 ('31000000-0000-4000-8000-000000000101','Bulk A','clean'),
 ('31000000-0000-4000-8000-000000000102','Bulk B','clean'),
 ('31000000-0000-4000-8000-000000000103','Bulk OOO','out_of_order'),
 ('31000000-0000-4000-8000-000000000104','Bulk Maintenance','clean'),
 ('31000000-0000-4000-8000-000000000105','Bulk Inactive','clean')) x(id,name,cleanliness);
insert into public.online_room_listings(slug,room_id) values
 ('test-online-a','31000000-0000-4000-8000-000000000101'),
 ('test-online-b','31000000-0000-4000-8000-000000000102'),
 ('test-online-out-of-order','31000000-0000-4000-8000-000000000103'),
 ('test-online-maintenance','31000000-0000-4000-8000-000000000104'),
 ('test-online-inactive','31000000-0000-4000-8000-000000000105');
select pg_temp.assert((select bool_and(enabled) from public.online_room_listings where slug like 'test-online-%'),'new listings default enabled');
select pg_temp.assert(not has_function_privilege('anon','public.bulk_set_online_rooms(uuid,text[],boolean)','EXECUTE'),'anonymous caller cannot bulk edit');

-- A mapping from a different property must never join a Dojworld batch.
insert into public.organizations(id,name,slug) values('32000000-0000-4000-8000-000000000001','Foreign fixture','bulk-foreign-fixture');
insert into public.properties(id,organization_id,name) values('32000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000001','Foreign fixture');
insert into public.room_types(id,organization_id,property_id,name,base_rate_kobo)
 values('32000000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000002','Foreign fixture',5000000);
insert into public.rooms(id,organization_id,property_id,room_type_id,room_number)
 values('32000000-0000-4000-8000-000000000004','32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000003','Foreign fixture');
insert into public.online_room_listings(slug,room_id,enabled) values('test-online-foreign','32000000-0000-4000-8000-000000000004',false);
update public.rooms set active=false where id='31000000-0000-4000-8000-000000000105';
update public.online_room_listings set enabled=false where slug='test-online-inactive';
update public.dojworld_settings set online_enabled=false where singleton=true;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(public.bulk_set_online_rooms((select property_id from public.dojworld_settings),array['test-online-a','test-online-b'],false)=2,'owner can bulk pause two listings');
select pg_temp.assert((select bool_and(not enabled) from public.online_room_listings where slug in ('test-online-a','test-online-b')),'both selected rooms paused');
select pg_temp.assert((select enabled from public.online_room_listings where slug='test-online-maintenance'),'unselected listing unchanged');
select pg_temp.assert((select not online_enabled from public.dojworld_settings),'bulk editing never turns on global booking switch');

-- Reject an invalid batch before changing any valid selection.
do $$declare p uuid;begin select property_id into p from public.dojworld_settings;
 begin perform public.bulk_set_online_rooms(p,array['test-online-a','does-not-exist'],true);raise exception 'Unknown listing accepted';exception when invalid_parameter_value then null;end;
 begin perform public.bulk_set_online_rooms(p,array['test-online-a','test-online-foreign'],true);raise exception 'Foreign mapping accepted';exception when invalid_parameter_value then null;end;
 begin perform public.bulk_set_online_rooms(p,array['test-online-a','test-online-inactive'],true);raise exception 'Inactive mapping accepted';exception when invalid_parameter_value then null;end;
 begin perform public.bulk_set_online_rooms(p,array['test-online-a','test-online-a'],true);raise exception 'Duplicate listing accepted';exception when invalid_parameter_value then null;end;
 begin perform public.bulk_set_online_rooms(p,array[]::text[],true);raise exception 'Empty batch accepted';exception when invalid_parameter_value then null;end;
 begin perform public.bulk_set_online_rooms(p,array['test-online-a',null],true);raise exception 'Null slug accepted';exception when invalid_parameter_value then null;end;
 begin perform public.bulk_set_online_rooms(p,array['test-online-a'],null);raise exception 'Null enabled accepted';exception when invalid_parameter_value then null;end;
 begin perform public.bulk_set_online_rooms('32000000-0000-4000-8000-000000000002',array['test-online-foreign'],true);raise exception 'Foreign property accepted';exception when insufficient_privilege then null;end;
end$$;
select pg_temp.assert((select bool_and(not enabled) from public.online_room_listings where slug in ('test-online-a','test-online-b','test-online-inactive')),'invalid batches leave all selections unchanged');
select pg_temp.assert((select count(*) from public.audit_events where action='online_room_listings_updated' and actor_user_id='31000000-0000-4000-8000-000000000001')=1,'failed batches create no success audit event');

select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000002',true);
do $$begin begin perform public.bulk_set_online_rooms((select property_id from public.dojworld_settings),array['test-online-a'],true);raise exception 'Front desk changed online listings';exception when insufficient_privilege then null;end;end$$;
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(public.bulk_set_online_rooms((select property_id from public.dojworld_settings),array['test-online-a','test-online-b','test-online-maintenance','test-online-out-of-order'],true)=4,'owner can bulk resume');
select pg_temp.assert(public.bulk_set_online_rooms((select property_id from public.dojworld_settings),array['test-online-a','test-online-b'],true)=2,'repeating bulk enable is safe');
select public.report_maintenance('31000000-0000-4000-8000-000000000104','Bulk test maintenance',null,'normal',true,'bulk-online-maintenance-test');
select public.create_priced_reservation((select organization_id from public.dojworld_settings),(select property_id from public.dojworld_settings),'31000000-0000-4000-8000-000000000101','Bulk staff reservation',null,null,current_date+40,current_date+42,2::smallint,null);
reset role;

update public.dojworld_settings set online_enabled=true,cancellation_policy='Test cancellation policy for bulk checks: contact reception before arrival. All room prices include mandatory charges.' where singleton=true;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select public.begin_online_booking('31000000-0000-4000-8000-000000000201',repeat('3',64),'test-online-b',current_date+40,current_date+42,2::smallint,'Bulk hold guest','bulk-hold@doj-test.invalid','+2348000000009','full',10000000,(select cancellation_policy from public.dojworld_settings));
select pg_temp.assert((select bool_and(not (q->>'available')::boolean) from jsonb_array_elements(public.online_availability(current_date+40,current_date+42,2::smallint)->'rooms') q where q->>'slug' in ('test-online-a','test-online-b','test-online-maintenance','test-online-out-of-order')),'bulk enabled listings still respect staff stays, online holds, maintenance and out-of-order');
select pg_temp.assert((select (q->>'available')::boolean from jsonb_array_elements(public.online_availability(current_date+50,current_date+52,2::smallint)->'rooms') q where q->>'slug'='test-online-a'),'a booked room remains available outside its booked dates');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
select public.bulk_set_online_rooms((select property_id from public.dojworld_settings),array['test-online-a','test-online-b'],false);
select public.bulk_set_online_rooms((select property_id from public.dojworld_settings),array['test-online-a','test-online-b'],true);
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert((select bool_and(not (q->>'available')::boolean) from jsonb_array_elements(public.online_availability(current_date+40,current_date+42,2::smallint)->'rooms') q where q->>'slug' in ('test-online-a','test-online-b')),'pause/resume cannot erase existing stays or holds');
select pg_temp.assert((select count(*) from public.online_bookings where id='31000000-0000-4000-8000-000000000201' and state='payment_pending')=1,'bulk edit never marks a hold paid');
rollback;
