-- Disposable local dedicated database ONLY. All records and changes roll back.
-- Run with pg-safeupdate loaded in the same connection to exercise its guard.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',message;end if;end $$;

insert into auth.users(id,email,email_confirmed_at) values
 ('90000000-0000-4000-8000-000000000001','settings-owner@doj-test.invalid',now()),
 ('90000000-0000-4000-8000-000000000002','settings-housekeeping@doj-test.invalid',now());
insert into public.organization_memberships(organization_id,user_id,role,active,all_properties)
 select organization_id,'90000000-0000-4000-8000-000000000001','owner',true,true
 from public.dojworld_settings where singleton=true;
insert into public.organization_memberships(organization_id,user_id,role,active,all_properties)
 select organization_id,'90000000-0000-4000-8000-000000000002','housekeeping',true,true
 from public.dojworld_settings where singleton=true;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select public.configure_dojworld_booking(false,false,'  Test policy: free cancellation until 24 hours before arrival.  ');
select pg_temp.assert((select not online_enabled and not arrival_requests_enabled
 and cancellation_policy='Test policy: free cancellation until 24 hours before arrival.'
 from public.dojworld_settings where singleton=true),'owner can save settings with safe updates enforced');
select public.map_online_room('zuma-rock',(select room_id from public.online_room_listings where slug='zuma-rock'),true);
select public.configure_dojworld_booking(true,true,'Test policy: free cancellation until 24 hours before arrival.');
select pg_temp.assert((select online_enabled and arrival_requests_enabled from public.dojworld_settings where singleton=true),'owner can enable bookings after verifying inventory');
select pg_temp.assert((select count(*)=2 from public.audit_events where actor_user_id='90000000-0000-4000-8000-000000000001' and action='online_booking_settings_updated'),'successful settings saves are audited');
do $$ begin
 begin
  perform public.configure_dojworld_booking(false,false,'Too short');
  raise exception 'An invalid policy was accepted';
 exception when raise_exception then
  if sqlerrm<>'Enter the actual cancellation and refund terms before enabling bookings.' then raise;end if;
 end;
end $$;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin
  perform public.configure_dojworld_booking(false,false,'Test policy: free cancellation until 24 hours before arrival.');
  raise exception 'Housekeeping changed booking settings';
 exception when insufficient_privilege then null;
 end;
end $$;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select pg_temp.assert((select online_enabled and arrival_requests_enabled from public.dojworld_settings where singleton=true),'denied saves leave the owner settings intact');
reset role;
rollback;
