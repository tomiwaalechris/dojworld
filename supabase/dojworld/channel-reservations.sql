-- Booking sources share the hotel's existing reservations and room locks.
-- Booking.com automation is not enabled by this update. Tasks are manual checks.
begin;
alter table public.reservations
 add column if not exists external_reference text check(length(external_reference)<=100),
 add column if not exists external_unit_reference text check(length(external_unit_reference)<=100),
 add column if not exists channel_name text check(length(channel_name)<=80),
 add column if not exists guaranteed_unpaid boolean not null default true,
 add column if not exists payment_deadline timestamptz,
 add column if not exists channel_collection text not null default 'unknown'
   check(channel_collection in ('unknown','pay_at_hotel','collected_by_channel'));
create unique index if not exists reservation_booking_com_reference
 on public.reservations(property_id,lower(btrim(external_reference)),lower(coalesce(nullif(btrim(external_unit_reference),''),'1')))
 where source='booking_com' and nullif(btrim(external_reference),'') is not null;

create table if not exists booking_private.channel_requests (
 organization_id uuid not null references public.organizations,
 request_id uuid not null,
 channel_payload jsonb not null,
 reservation_id uuid not null references public.reservations,
 primary key(organization_id,request_id)
);
revoke all on booking_private.channel_requests from public,anon,authenticated;

drop function if exists public.create_channel_reservation(uuid,uuid,uuid,uuid,text,text,text,date,date,smallint,bigint,text,text,jsonb,text,uuid,bigint,text,text,text,text,text,text);
create or replace function public.create_channel_reservation(
 p_request_id uuid,p_organization_id uuid,p_property_id uuid,p_room_id uuid,
 p_guest_name text,p_guest_phone text,p_guest_email text,p_arrival_date date,p_departure_date date,
 p_adults smallint,p_nightly_rate_kobo bigint,p_notes text,p_pricing_reason text,p_expected_quote jsonb,
 p_payment_state text,p_payment_method_id uuid,p_amount_kobo bigint,p_reference text,
 p_source text,p_external_reference text,p_external_unit_reference text,p_channel_name text,p_channel_collection text,
 p_guaranteed_unpaid boolean,p_payment_deadline timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_metadata jsonb;v_previous booking_private.channel_requests%rowtype;v_result jsonb;
 v_external text:=nullif(btrim(p_external_reference),'');v_unit text:=nullif(btrim(p_external_unit_reference),'');
 v_name text:=nullif(btrim(p_channel_name),'');v_reservation uuid;
begin
 if auth.uid() is null or not public.can_access_property(p_organization_id,p_property_id)
  or not public.has_org_role(p_organization_id,array['owner','manager','front_desk']::public.member_role[]) then
  raise exception 'You cannot create reservations for this property.' using errcode='42501';end if;
 if p_request_id is null or p_source is null or p_source not in ('direct','phone','whatsapp','booking_com','other')
  or coalesce(length(v_external),0)>100 or coalesce(length(v_unit),0)>100 or coalesce(length(v_name),0)>80
  or (p_source='booking_com' and v_external is null) or (p_source='other' and coalesce(length(v_name),0)<2)
  or p_channel_collection is null or p_channel_collection not in ('unknown','pay_at_hotel','collected_by_channel')
  or (p_source not in ('booking_com','other') and p_channel_collection<>'unknown') then
  raise exception 'Choose a booking source and valid channel reference and collection details.' using errcode='22023';end if;
 if p_guaranteed_unpaid is null or (p_source in ('booking_com','other') and not p_guaranteed_unpaid) or (p_guaranteed_unpaid and p_payment_deadline is not null)
  or (not p_guaranteed_unpaid and (p_payment_state<>'unpaid' or p_payment_deadline is null
  or p_payment_deadline>(p_arrival_date+time '23:59') at time zone 'Africa/Lagos')) then
  raise exception 'Choose a guaranteed reservation or an unpaid hold with a future deadline no later than arrival day.' using errcode='22023';end if;
 if p_source<>'other' then v_name:=null;end if;
 if p_source='booking_com' then v_unit:=coalesce(v_unit,'1');end if;
 v_metadata:=jsonb_build_object('source',p_source,'reference',v_external,'unit',v_unit,'name',v_name,'collection',p_channel_collection,'guaranteed',p_guaranteed_unpaid,'deadline',p_payment_deadline);
 -- Use the same request lock as the atomic reservation/payment transaction.
 perform pg_advisory_xact_lock(hashtextextended('front-desk:'||p_organization_id::text||':'||p_request_id::text,0));
 select * into v_previous from booking_private.channel_requests where organization_id=p_organization_id and request_id=p_request_id;
 if found then
  if v_previous.channel_payload<>v_metadata then raise exception 'This booking attempt already used different channel details. Open a new reservation.' using errcode='23505';end if;
 elsif exists(select 1 from booking_private.front_desk_requests where organization_id=p_organization_id and request_id=p_request_id) then
  raise exception 'This booking attempt was already used. Open a new reservation.' using errcode='23505';
 end if;
 if v_previous.reservation_id is null and not p_guaranteed_unpaid and p_payment_deadline<=now() then
  raise exception 'Choose a future unpaid hold deadline.' using errcode='22023';end if;
 if p_source='booking_com' then
  perform pg_advisory_xact_lock(hashtextextended('booking-com:'||p_property_id::text||':'||lower(v_external)||':'||lower(v_unit),0));
  if exists(select 1 from public.reservations r where r.property_id=p_property_id and r.source='booking_com'
   and lower(btrim(r.external_reference))=lower(v_external)
   and lower(coalesce(nullif(btrim(r.external_unit_reference),''),'1'))=lower(v_unit)
   and r.id is distinct from v_previous.reservation_id) then
   raise exception 'This Booking.com reservation and room item are already recorded. Open the existing booking to make changes.' using errcode='23505';
  end if;
 end if;
 -- Existing pricing approvals, physical-room locks, receipts and retry checks apply.
 v_result:=public.create_front_desk_reservation(p_request_id,p_organization_id,p_property_id,p_room_id,p_guest_name,p_guest_phone,p_guest_email,
  p_arrival_date,p_departure_date,p_adults,p_nightly_rate_kobo,p_notes,p_pricing_reason,p_expected_quote,
  p_payment_state,p_payment_method_id,p_amount_kobo,p_reference);
 v_reservation:=(v_result->>'reservationId')::uuid;
 if v_previous.reservation_id is null then
  update public.reservations set source=p_source,external_reference=v_external,external_unit_reference=v_unit,
   channel_name=v_name,channel_collection=p_channel_collection,guaranteed_unpaid=p_guaranteed_unpaid,payment_deadline=p_payment_deadline
   where id=v_reservation and organization_id=p_organization_id and property_id=p_property_id;
  insert into booking_private.channel_requests(organization_id,request_id,channel_payload,reservation_id)
   values(p_organization_id,p_request_id,v_metadata,v_reservation);
  insert into public.audit_events(organization_id,property_id,actor_user_id,action,entity_type,entity_id,after_data)
   values(p_organization_id,p_property_id,auth.uid(),'reservation_channel_recorded','reservation',v_reservation,v_metadata);
 end if;
 return v_result;
end $$;
revoke all on function public.create_channel_reservation(uuid,uuid,uuid,uuid,text,text,text,date,date,smallint,bigint,text,text,jsonb,text,uuid,bigint,text,text,text,text,text,text,boolean,timestamptz) from public,anon;
grant execute on function public.create_channel_reservation(uuid,uuid,uuid,uuid,text,text,text,date,date,smallint,bigint,text,text,jsonb,text,uuid,bigint,text,text,text,text,text,text,boolean,timestamptz) to authenticated;

create table if not exists public.channel_inventory_tasks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations,
 property_id uuid not null references public.properties,
 reservation_id uuid not null references public.reservations,
 reason text not null,
 status text not null default 'pending' check(status in ('pending','completed')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz,
 completed_by uuid references auth.users,
 completion_note text
);
create unique index if not exists channel_pending_inventory_task on public.channel_inventory_tasks(reservation_id) where status='pending';
alter table public.channel_inventory_tasks enable row level security;
revoke all on public.channel_inventory_tasks from public,anon,authenticated;
grant select on public.channel_inventory_tasks to authenticated;
drop policy if exists channel_inventory_staff_read on public.channel_inventory_tasks;
create policy channel_inventory_staff_read on public.channel_inventory_tasks for select to authenticated
 using(public.can_access_property(organization_id,property_id) and public.has_org_role(organization_id,array['owner','manager','front_desk']::public.member_role[]));

create or replace function booking_private.queue_channel_inventory(p_reservation_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.channel_inventory_tasks(organization_id,property_id,reservation_id,reason)
  select r.organization_id,r.property_id,r.id,p_reason from public.reservations r
  join public.dojworld_settings s on s.property_id=r.property_id and s.singleton=true where r.id=p_reservation_id
  on conflict(reservation_id) where status='pending' do update set reason=excluded.reason,updated_at=clock_timestamp();
end $$;
revoke all on function booking_private.queue_channel_inventory(uuid,text) from public,anon,authenticated;

create or replace function booking_private.channel_reservation_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.status in ('inquiry','confirmed','checked_in') then perform booking_private.queue_channel_inventory(new.id,'New reservation / checkout hold');end if;
 elsif (new.status,new.arrival_date,new.departure_date) is distinct from (old.status,old.arrival_date,old.departure_date) then
  perform booking_private.queue_channel_inventory(new.id,'Reservation status or stay dates changed');
 end if;
 return new;
end $$;
revoke all on function booking_private.channel_reservation_changed() from public,anon,authenticated;
drop trigger if exists reservation_channel_inventory_changed on public.reservations;
create trigger reservation_channel_inventory_changed after insert or update of status,arrival_date,departure_date on public.reservations
 for each row execute function booking_private.channel_reservation_changed();

create or replace function booking_private.channel_room_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  perform booking_private.queue_channel_inventory(old.reservation_id,'Room assignment removed');return old;
 elsif tg_op='INSERT' then
  perform booking_private.queue_channel_inventory(new.reservation_id,'Room assignment added');
 elsif (new.room_id,new.check_in_date,new.check_out_date) is distinct from (old.room_id,old.check_in_date,old.check_out_date) then
  perform booking_private.queue_channel_inventory(new.reservation_id,'Assigned room or dates changed');
 end if;
 return new;
end $$;
revoke all on function booking_private.channel_room_changed() from public,anon,authenticated;
drop trigger if exists reservation_room_channel_inventory_changed on public.reservation_rooms;
create trigger reservation_room_channel_inventory_changed after insert or update of room_id,check_in_date,check_out_date or delete on public.reservation_rooms
 for each row execute function booking_private.channel_room_changed();

create or replace function public.complete_channel_inventory_task(p_id uuid,p_expected_updated_at timestamptz,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare t public.channel_inventory_tasks%rowtype;
begin
 select * into t from public.channel_inventory_tasks where id=p_id for update;
 if not found or not public.can_access_property(t.organization_id,t.property_id)
  or not public.has_org_role(t.organization_id,array['owner','manager','front_desk']::public.member_role[]) then
  raise exception 'Reception access required.' using errcode='42501';end if;
 if t.status='completed' then return;end if;
 if p_expected_updated_at is distinct from t.updated_at then raise exception 'This reservation changed. Refresh and check Booking.com again before completing this task.' using errcode='23514';end if;
 if length(btrim(coalesce(p_note,''))) not between 5 and 500 then raise exception 'Record what you checked or updated in Booking.com.' using errcode='22023';end if;
 update public.channel_inventory_tasks set status='completed',completed_at=clock_timestamp(),completed_by=auth.uid(),completion_note=btrim(p_note)
  where id=t.id and status='pending';
 insert into public.audit_events(organization_id,property_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(t.organization_id,t.property_id,auth.uid(),'channel_inventory_manually_checked','reservation',t.reservation_id,jsonb_build_object('task',t.id,'note',btrim(p_note)));
end $$;
revoke all on function public.complete_channel_inventory_task(uuid,timestamptz,text) from public,anon;
grant execute on function public.complete_channel_inventory_task(uuid,timestamptz,text) to authenticated;

-- Existing active stays also need a calendar check. Replaying preserves completions.
insert into public.channel_inventory_tasks(organization_id,property_id,reservation_id,reason)
 select r.organization_id,r.property_id,r.id,'Existing reservation: check Booking.com calendar'
 from public.reservations r join public.dojworld_settings s on s.property_id=r.property_id and s.singleton=true
 where r.status in ('inquiry','confirmed','checked_in') and not exists(select 1 from public.channel_inventory_tasks t where t.reservation_id=r.id)
 on conflict(reservation_id) where status='pending' do nothing;
notify pgrst,'reload schema';
commit;
