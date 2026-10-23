-- Server-only recovery links and a durable transactional email outbox.
begin;
create table if not exists booking_private.guest_booking_sessions(
 token_hash text primary key,booking_id uuid not null references public.online_bookings,expires_at timestamptz not null
);
create table if not exists booking_private.booking_recovery_links(
 token_hash text primary key,booking_id uuid not null references public.online_bookings,expires_at timestamptz not null,used_at timestamptz
);
revoke all on booking_private.guest_booking_sessions,booking_private.booking_recovery_links from public,anon,authenticated;
create or replace function booking_private.has_booking_access(p_id uuid,p_token text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.online_bookings b where b.id=p_id and (b.access_hash=encode(public.digest(p_token,'sha256'),'hex')
  or exists(select 1 from booking_private.guest_booking_sessions s where s.booking_id=b.id and s.token_hash=encode(public.digest(p_token,'sha256'),'hex') and s.expires_at>now())))
$$;
revoke all on function booking_private.has_booking_access(uuid,text) from public,anon,authenticated;

create or replace function public.prepare_booking_recovery(p_reference text,p_email text,p_token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.online_bookings%rowtype;
begin
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid recovery token.' using errcode='22023';end if;
 select * into b from public.online_bookings where payment_reference=upper(btrim(p_reference)) and guest_email=lower(btrim(p_email));
 -- Payment reference has a mixed-case prefix followed by lower-case UUID hex.
 if not found then select * into b from public.online_bookings where lower(payment_reference)=lower(btrim(p_reference)) and guest_email=lower(btrim(p_email));end if;
 if not found then return null;end if;
 insert into booking_private.booking_recovery_links(token_hash,booking_id,expires_at) values(p_token_hash,b.id,now()+interval '20 minutes');
 return jsonb_build_object('id',b.id,'email',b.guest_email);
end $$;
create or replace function public.consume_booking_recovery(p_token_hash text,p_session_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare l booking_private.booking_recovery_links%rowtype;
begin
 if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session token.' using errcode='22023';end if;
 select * into l from booking_private.booking_recovery_links where token_hash=p_token_hash and used_at is null and expires_at>now() for update;
 if not found then raise exception 'This recovery link has expired or was already used. Request another link.' using errcode='P0002';end if;
 update booking_private.booking_recovery_links set used_at=now() where token_hash=l.token_hash and used_at is null;
 insert into booking_private.guest_booking_sessions(token_hash,booking_id,expires_at) values(p_session_hash,l.booking_id,now()+interval '30 days');
 return l.booking_id;
end $$;
revoke all on function public.prepare_booking_recovery(text,text,text),public.consume_booking_recovery(text,text) from public,anon,authenticated;
grant execute on function public.prepare_booking_recovery(text,text,text),public.consume_booking_recovery(text,text) to service_role;

create table if not exists public.booking_notifications(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations,property_id uuid not null references public.properties,
 booking_id uuid not null references public.online_bookings,transaction_id bigint not null,
 kind text not null,recipient text not null,payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
 attempts integer not null default 0,lease_id uuid,lease_until timestamptz,last_error text,provider_id text,
 created_at timestamptz not null default clock_timestamp(),sent_at timestamptz,
 unique(booking_id,transaction_id)
);
alter table public.booking_notifications enable row level security;
revoke all on public.booking_notifications from public,anon,authenticated;
grant select on public.booking_notifications to authenticated;
drop policy if exists booking_notification_staff_read on public.booking_notifications;
create policy booking_notification_staff_read on public.booking_notifications for select to authenticated
 using(public.can_access_property(organization_id,property_id) and public.has_org_role(organization_id,array['owner','manager','front_desk']::public.member_role[]));

create or replace function booking_private.enqueue_booking_notification(p_booking_id uuid,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
declare b public.online_bookings%rowtype;r public.reservations%rowtype;v_room text;v_payload jsonb;
begin
 select * into b from public.online_bookings where id=p_booking_id;
 if not found or (p_kind='stay_updated' and b.state<>'confirmed') then return;end if;
 select * into r from public.reservations where id=b.reservation_id;
 select rm.room_number into v_room from public.reservation_rooms rr join public.rooms rm on rm.id=rr.room_id where rr.reservation_id=b.reservation_id order by rr.id limit 1;
 v_payload:=jsonb_build_object('reference',b.payment_reference,'state',b.state,'room',coalesce(v_room,b.slug),
  'arrival',coalesce(r.arrival_date,b.arrival_date),'departure',coalesce(r.departure_date,b.departure_date),'reservationStatus',r.status);
 insert into public.booking_notifications(organization_id,property_id,booking_id,transaction_id,kind,recipient,payload)
 values(b.organization_id,b.property_id,b.id,txid_current(),p_kind,b.guest_email,v_payload)
 on conflict(booking_id,transaction_id) do update set kind=excluded.kind,payload=excluded.payload,recipient=excluded.recipient;
end $$;
revoke all on function booking_private.enqueue_booking_notification(uuid,text) from public,anon,authenticated;
create or replace function booking_private.online_state_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.state='requested' then perform booking_private.enqueue_booking_notification(new.id,'requested');end if;
 elsif new.state is distinct from old.state and new.state in ('confirmed','expired','rejected','cancelled','payment_review') then
  perform booking_private.enqueue_booking_notification(new.id,new.state);
 end if;
 return new;
end $$;
drop trigger if exists online_booking_state_notification on public.online_bookings;
create trigger online_booking_state_notification after insert or update of state on public.online_bookings for each row execute function booking_private.online_state_notification();
create or replace function booking_private.stay_change_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_res uuid;v_booking uuid;
begin
 if tg_table_name='reservations' then
  if (new.status,new.arrival_date,new.departure_date,new.adults) is not distinct from (old.status,old.arrival_date,old.departure_date,old.adults) then return new;end if;
  v_res:=new.id;
 else
  if (new.room_id,new.check_in_date,new.check_out_date) is not distinct from (old.room_id,old.check_in_date,old.check_out_date) then return new;end if;
  v_res:=new.reservation_id;
 end if;
 select id into v_booking from public.online_bookings where reservation_id=v_res;
 if found then perform booking_private.enqueue_booking_notification(v_booking,'stay_updated');end if;
 return new;
end $$;
drop trigger if exists zz_stay_change_notification on public.reservations;
create trigger zz_stay_change_notification after update of status,arrival_date,departure_date,adults on public.reservations for each row execute function booking_private.stay_change_notification();
drop trigger if exists zz_room_change_notification on public.reservation_rooms;
create trigger zz_room_change_notification after update of room_id,check_in_date,check_out_date on public.reservation_rooms for each row execute function booking_private.stay_change_notification();
revoke all on function booking_private.online_state_notification(),booking_private.stay_change_notification() from public,anon,authenticated;

create or replace function public.claim_booking_notifications(p_limit integer) returns setof public.booking_notifications
language plpgsql security definer set search_path='' as $$
begin
 return query with jobs as (select id from public.booking_notifications where attempts<5 and (status in ('pending','failed') or (status='processing' and lease_until<now()))
  order by created_at for update skip locked limit least(greatest(p_limit,1),25))
 update public.booking_notifications n set status='processing',attempts=n.attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',last_error=null
 from jobs where n.id=jobs.id returning n.*;
end $$;
create or replace function public.finish_booking_notification(p_id uuid,p_lease uuid,p_success boolean,p_provider text,p_error text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.booking_notifications set status=case when p_success then 'sent' else 'failed' end,sent_at=case when p_success then now() end,
  provider_id=left(p_provider,150),last_error=left(p_error,200),lease_until=null
 where id=p_id and lease_id=p_lease and status='processing';
 if not found then raise exception 'Notification lease expired.' using errcode='23514';end if;
end $$;
revoke all on function public.claim_booking_notifications(integer),public.finish_booking_notification(uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.claim_booking_notifications(integer),public.finish_booking_notification(uuid,uuid,boolean,text,text) to service_role;
create or replace function public.retry_booking_notification(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare n public.booking_notifications%rowtype;
begin
 select * into n from public.booking_notifications where id=p_id for update;
 if not found or not(public.can_access_property(n.organization_id,n.property_id) and public.has_org_role(n.organization_id,array['owner','manager','front_desk']::public.member_role[])) then raise exception 'Hotel access required.' using errcode='42501';end if;
 if n.status<>'failed' and not(n.status='processing' and n.lease_until<now()) then raise exception 'Only failed or stalled messages can be retried.' using errcode='23514';end if;
 update public.booking_notifications set status='pending',attempts=0,lease_id=null,lease_until=null,last_error=null where id=n.id;
 insert into public.audit_events(organization_id,property_id,actor_user_id,action,entity_type,entity_id)
 values(n.organization_id,n.property_id,auth.uid(),'booking_email_retry','booking_notification',n.id);
end $$;
revoke all on function public.retry_booking_notification(uuid) from public,anon;
grant execute on function public.retry_booking_notification(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
