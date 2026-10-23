-- Preserve original booking/payment snapshots while showing current stays.
begin;
create or replace function booking_private.expire_direct_room(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r record;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_room::text,0));
 for r in select b.id,b.organization_id,b.property_id from public.reservations b
  where b.status='confirmed' and not b.guaranteed_unpaid and b.payment_deadline<=now()
  and exists(select 1 from public.reservation_rooms rr where rr.reservation_id=b.id and rr.room_id=p_room)
  order by b.id for update loop
  if exists(select 1 from public.payments p join public.folios f on f.id=p.folio_id where f.reservation_id=r.id) then
   update public.reservations set guaranteed_unpaid=true,payment_deadline=null where id=r.id;
  else
   update public.reservations set status='cancelled',payment_deadline=null where id=r.id and status='confirmed';
   insert into public.audit_events(organization_id,property_id,action,entity_type,entity_id,after_data)
    values(r.organization_id,r.property_id,'unpaid_hold_expired','reservation',r.id,jsonb_build_object('reason','The temporary unpaid hold deadline passed.'));
  end if;
 end loop;
end $$;
revoke all on function booking_private.expire_direct_room(uuid) from public,anon,authenticated;
create or replace function booking_private.protect_paid_hold() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.reservations r set guaranteed_unpaid=true,payment_deadline=null from public.folios f
 where f.id=new.folio_id and r.id=f.reservation_id and not r.guaranteed_unpaid;
 return new;
end $$;
revoke all on function booking_private.protect_paid_hold() from public,anon,authenticated;
drop trigger if exists protect_paid_reservation_hold on public.payments;
create trigger protect_paid_reservation_hold after insert on public.payments for each row execute function booking_private.protect_paid_hold();

create or replace function booking_private.expire_room(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
declare b public.online_bookings%rowtype;paid bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_room::text,0));
 for b in select * from public.online_bookings where room_id=p_room and state in ('payment_pending','confirmed') and expires_at<=now() order by id for update loop
  select coalesce(sum(p.amount_kobo),0) into paid from public.payments p join public.folios f on f.id=p.folio_id where f.reservation_id=b.reservation_id;
  if paid>0 or exists(select 1 from public.reservations r where r.id=b.reservation_id and r.status<>'inquiry' and (b.payment_plan<>'arrival' or r.status<>'confirmed')) then
   update public.online_bookings set expires_at=null where id=b.id;continue;
  end if;
  update public.reservations set status='cancelled' where id=b.reservation_id and status in ('inquiry','confirmed');
  update public.online_bookings set state='expired',decision_note='The unpaid reservation deadline has passed.' where id=b.id;
 end loop;
 perform booking_private.expire_direct_room(p_room);
end $$;

create or replace function public.release_expired_online_bookings(p_property_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r record;o uuid;
begin
 select organization_id into o from public.dojworld_settings where property_id=p_property_id;
 if o is null or (coalesce(auth.role(),'')<>'service_role' and not(public.can_access_property(o,p_property_id) and public.has_org_role(o,array['owner','manager','front_desk']::public.member_role[]))) then raise exception 'Hotel access required.' using errcode='42501';end if;
 for r in select room_id from public.online_bookings where property_id=p_property_id and state in ('payment_pending','confirmed') and expires_at<=now()
  union select rr.room_id from public.reservations b join public.reservation_rooms rr on rr.reservation_id=b.id
   where b.property_id=p_property_id and b.status='confirmed' and not b.guaranteed_unpaid and b.payment_deadline<=now()
  order by room_id loop perform booking_private.expire_room(r.room_id);end loop;
end $$;

create or replace function public.get_available_rooms(p_property_id uuid,p_arrival date,p_departure date)
returns table(room_id uuid,room_number text,room_type text,nightly_rate_kobo bigint,housekeeping_status public.room_housekeeping_status)
language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_room record;
begin
 select organization_id into v_org from public.properties where id=p_property_id;
 if not found or not public.can_access_property(v_org,p_property_id) then raise exception 'You cannot view this property.' using errcode='42501';end if;
 if p_arrival is null or p_departure is null or p_departure<=p_arrival or p_departure-p_arrival>366 then raise exception 'Choose valid dates up to one year apart.' using errcode='22023';end if;
 for v_room in select rr.room_id from public.reservations b join public.reservation_rooms rr on rr.reservation_id=b.id
  where b.property_id=p_property_id and b.status='confirmed' and not b.guaranteed_unpaid and b.payment_deadline<=now()
  union select b.room_id from public.online_bookings b where b.property_id=p_property_id and b.state in ('payment_pending','confirmed') and b.expires_at<=now()
  order by room_id loop perform booking_private.expire_room(v_room.room_id);end loop;
 return query select r.id,r.room_number,rt.name,rt.base_rate_kobo,r.housekeeping_status from public.rooms r
  join public.room_types rt on rt.organization_id=r.organization_id and rt.id=r.room_type_id and rt.property_id=r.property_id
  where r.organization_id=v_org and r.property_id=p_property_id and r.active and rt.active and r.housekeeping_status<>'out_of_order'
  and not exists(select 1 from public.maintenance_work_orders m where m.room_id=r.id and m.blocks_inventory and m.status in ('open','in_progress'))
  and not exists(select 1 from public.reservation_rooms rr join public.reservations rs on rs.organization_id=rr.organization_id and rs.id=rr.reservation_id
   where rr.organization_id=v_org and rr.room_id=r.id and rs.status in ('inquiry','confirmed','checked_in') and rr.check_in_date<p_departure and rr.check_out_date>p_arrival)
  order by r.room_number;
end $$;

create or replace function public.online_booking_status(p_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.online_bookings%rowtype;r public.reservations%rowtype;paid bigint;total bigint;v_slug text;v_room_name text;v_room uuid;
begin
 select * into b from public.online_bookings where id=p_id and booking_private.has_booking_access(id,p_token);
 if not found then raise exception 'Booking not found.' using errcode='P0002';end if;
 perform booking_private.expire_room(b.room_id);select * into b from public.online_bookings where id=p_id;
 select * into r from public.reservations where id=b.reservation_id;
 select rr.room_id,rm.room_number,l.slug into v_room,v_room_name,v_slug from public.reservation_rooms rr
  join public.rooms rm on rm.id=rr.room_id left join public.online_room_listings l on l.room_id=rr.room_id
  where rr.reservation_id=b.reservation_id order by rr.id limit 1;
 if r.id is not null then
  select sum(n.charged_rate_kobo) into total from public.reservation_night_rates n where n.reservation_id=r.id and n.service_date>=r.arrival_date and n.service_date<r.departure_date;
  if total is null then raise exception 'The current agreed stay price is unavailable.' using errcode='23514';end if;
 else total:=b.quoted_total_kobo;end if;
 paid:=booking_private.received(b.reservation_id);
 return jsonb_build_object('id',b.id,'reference',b.payment_reference,'slug',coalesce(v_slug,b.slug),'roomName',v_room_name,
  'state',b.state,'reservationStatus',r.status,'arrival',coalesce(r.arrival_date,b.arrival_date),'departure',coalesce(r.departure_date,b.departure_date),
  'guests',coalesce(r.adults,b.adults),'actualDeparture',r.actual_departure_date,'totalKobo',total,'paidKobo',paid,'dueNowKobo',b.due_now_kobo,
  'balanceKobo',case when b.state in ('confirmed','payment_pending','requested') then greatest(total-paid,0) else 0 end,
  'paymentPlan',b.payment_plan,'expiresAt',b.expires_at,'note',b.decision_note,'policy',b.accepted_policy,
  'checkoutUrl',case when b.state='payment_pending' then b.checkout_url end);
end $$;
notify pgrst,'reload schema';
commit;
