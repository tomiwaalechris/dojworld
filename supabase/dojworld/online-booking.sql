-- Dedicated Dojworld installation. No platform subscriptions or trial enforcement.
create schema if not exists booking_private;
revoke all on schema booking_private from public,anon,authenticated;

create table public.dojworld_settings (
  singleton boolean primary key default true check(singleton),
  organization_id uuid not null references public.organizations,
  property_id uuid not null references public.properties,
  online_enabled boolean not null default false,
  arrival_requests_enabled boolean not null default true,
  cancellation_policy text not null default 'Contact reception for cancellation or changes. Cancellation and refund terms must be agreed with the hotel before online payments are enabled.'
);
create table public.online_room_listings (
  slug text primary key,
  room_id uuid not null unique references public.rooms,
  enabled boolean not null default true
);
create table public.online_bookings (
  id uuid primary key,
  access_hash text not null,
  organization_id uuid not null references public.organizations,
  property_id uuid not null references public.properties,
  room_id uuid not null references public.rooms,
  slug text not null references public.online_room_listings,
  guest_name text not null,guest_email text not null,guest_phone text not null,
  arrival_date date not null,departure_date date not null,adults smallint not null,
  payment_plan text not null check(payment_plan in ('deposit','full','arrival')),
  state text not null check(state in ('payment_pending','requested','confirmed','expired','rejected','cancelled','payment_review')),
  quoted_total_kobo bigint not null check(quoted_total_kobo>0),
  due_now_kobo bigint not null check(due_now_kobo>=0),
  night_rates jsonb not null,
  accepted_policy text not null,
  expires_at timestamptz,
  reservation_id uuid unique references public.reservations,
  payment_reference text unique not null,
  checkout_url text,
  payment_id uuid references public.payments,
  decision_note text,
  created_at timestamptz not null default now(),
  check(departure_date>arrival_date),check(adults between 1 and 2),
  check((payment_plan='arrival' and due_now_kobo=0) or (payment_plan<>'arrival' and due_now_kobo>0))
);
create index online_expiry_lookup on public.online_bookings(expires_at) where state in ('payment_pending','confirmed');
create index online_staff_lookup on public.online_bookings(property_id,created_at desc);
create table public.online_rate_limits (key text primary key, window_start timestamptz not null, hits integer not null);

alter table public.dojworld_settings enable row level security;
alter table public.online_room_listings enable row level security;
alter table public.online_bookings enable row level security;
alter table public.online_rate_limits enable row level security;
revoke all on public.dojworld_settings,public.online_room_listings,public.online_bookings,public.online_rate_limits from public,anon,authenticated;
grant select on public.dojworld_settings,public.online_room_listings,public.online_bookings to authenticated;
grant all on public.dojworld_settings,public.online_room_listings,public.online_bookings,public.online_rate_limits to service_role;
create policy hotel_settings_read on public.dojworld_settings for select to authenticated using(public.can_access_property(organization_id,property_id));
create policy listing_staff_read on public.online_room_listings for select to authenticated using(exists(select 1 from public.dojworld_settings s where public.can_access_property(s.organization_id,s.property_id)));
create policy online_staff_read on public.online_bookings for select to authenticated using(public.can_access_property(organization_id,property_id) and public.has_org_role(organization_id,array['owner','manager','front_desk','accountant']::public.member_role[]));

-- Automated receipts have an explicit system provenance instead of pretending
-- a receptionist posted them. All balance and immutability checks still apply.
alter table public.journals add column posted_via text check(posted_via is null or posted_via='paystack_verified');
create or replace function public.guard_journal() returns trigger language plpgsql set search_path='' as $$
declare v_debits bigint; v_credits bigint; v_count integer;
begin
  if tg_op='DELETE' then
    if old.status<>'draft' then raise exception 'Posted journals cannot be deleted.' using errcode='23514'; end if;
    return old;
  end if;
  if old.status<>'draft' then raise exception 'Posted journals are immutable.' using errcode='23514'; end if;
  if new.status='draft' then return new; end if;
  if new.status<>'posted' or new.posted_at is null or (new.posted_by is null and not (coalesce(new.posted_via,'')='paystack_verified' and coalesce(auth.role(),'')='service_role' and exists(select 1 from public.online_bookings b where b.payment_id=new.source_id and b.organization_id=new.organization_id and b.property_id=new.property_id and new.source_type='guest_deposit'))) then
    raise exception 'A journal must be posted with actor and timestamp.' using errcode='23514';
  end if;
  select count(*),coalesce(sum(debit_kobo),0),coalesce(sum(credit_kobo),0)
    into v_count,v_debits,v_credits from public.journal_lines where organization_id=new.organization_id and journal_id=new.id;
  if v_count<2 or v_debits<>v_credits or v_debits<=0 then
    raise exception 'Journal debits and credits must balance.' using errcode='23514';
  end if;
  return new;
end $$;
-- Seed the website catalogue with listings enabled by default. The hotel-wide
-- booking switch remains off until the owner verifies inventory and terms.
do $$ declare o uuid;p uuid;t uuid;r uuid;x record;begin
  insert into public.organizations(name,slug) values('DOJ World Suites','dojworld') returning id into o;
  insert into public.properties(organization_id,name,address,city) values(o,'DOJ World Suites','13B Bamishile Street, Off Allen Avenue, Ikeja, Lagos','Lagos') returning id into p;
  insert into public.dojworld_settings(organization_id,property_id) values(o,p);
  for x in select * from (values('Standard',7000000),('Deluxe',8000000),('Royalty',9000000),('Executive',10000000)) v(name,rate) loop
    insert into public.room_types(organization_id,property_id,name,base_rate_kobo) values(o,p,x.name,x.rate);
  end loop;
  for x in select * from (values
    ('mambilla-plateau','Mambilla Plateau','Deluxe'),('tinapa-resort','Tinapa Resort','Deluxe'),
    ('ikogosi-springs','Ikogosi Springs','Deluxe'),('yankari-reserve','Yankari Reserve','Standard'),
    ('olumo-rock','Olumo Rock','Executive'),('zuma-rock','Zuma Rock','Royalty'),('obudu-ranch','Obudu Ranch','Deluxe')
  ) v(slug,name,category) loop
    select id into t from public.room_types where property_id=p and name=x.category;
    insert into public.rooms(organization_id,property_id,room_type_id,room_number) values(o,p,t,x.name) returning id into r;
    insert into public.online_room_listings(slug,room_id) values(x.slug,r);
  end loop;
  insert into public.payment_methods(organization_id,property_id,name,clearing_account_code) values(o,p,'Paystack online','1020');
end $$;
-- The generic SaaS onboarding RPC is deliberately unavailable in this hotel.
revoke execute on function public.setup_hotel(text,text,text,integer,bigint) from authenticated,anon,public;
revoke execute on function public.create_property(uuid,text,text,integer,bigint) from authenticated,anon,public;

create function booking_private.quote(p_room uuid,p_arrival date,p_departure date) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_agg(jsonb_build_object('service_date',d.night::date,'standard_rate_kobo',coalesce(p.nightly_rate_kobo,t.base_rate_kobo),'rate_name',coalesce(p.name,'Base rate')) order by d.night)
 from public.rooms r join public.room_types t on t.id=r.room_type_id and t.active
 cross join generate_series(p_arrival::timestamp,(p_departure-1)::timestamp,'1 day') d(night)
 left join public.room_rate_periods p on p.room_type_id=t.id and p.active and d.night::date>=p.starts_on and d.night::date<p.ends_before
 where r.id=p_room and r.active
$$;
create function booking_private.available(p_room uuid,p_arrival date,p_departure date,p_exclude uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rooms r where r.id=p_room and r.active and r.housekeeping_status<>'out_of_order')
 and not exists(select 1 from public.maintenance_work_orders m where m.room_id=p_room and m.blocks_inventory and m.status in ('open','in_progress'))
 and not exists(select 1 from public.reservation_rooms rr join public.reservations b on b.id=rr.reservation_id
 where rr.room_id=p_room and b.id is distinct from p_exclude and rr.check_in_date<p_departure and rr.check_out_date>p_arrival and b.status in ('inquiry','confirmed','checked_in'))
$$;
create function booking_private.expire_room(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
declare b public.online_bookings%rowtype; paid bigint;begin
 perform pg_advisory_xact_lock(hashtextextended(p_room::text,0));
 for b in select * from public.online_bookings where room_id=p_room and state in ('payment_pending','confirmed') and expires_at<=now() order by id for update loop
   -- A checked-in stay or any receipt at reception must never be auto-cancelled.
   select coalesce(sum(p.amount_kobo),0) into paid from public.payments p join public.folios f on f.id=p.folio_id where f.reservation_id=b.reservation_id;
   if paid>0 or exists(select 1 from public.reservations r where r.id=b.reservation_id and r.status<>'inquiry' and (b.payment_plan<>'arrival' or r.status<>'confirmed')) then update public.online_bookings set expires_at=null where id=b.id;continue; end if;
   update public.reservations set status='cancelled' where id=b.reservation_id and status in ('inquiry','confirmed');
   update public.online_bookings set state='expired',decision_note='The unpaid reservation deadline has passed.' where id=b.id;
 end loop;
end $$;
create function public.release_expired_online_bookings(p_property_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r record;o uuid;begin
 select organization_id into o from public.dojworld_settings where property_id=p_property_id;
 if o is null or (coalesce(auth.role(),'')<>'service_role' and not(public.can_access_property(o,p_property_id) and public.has_org_role(o,array['owner','manager','front_desk']::public.member_role[]))) then raise exception 'Hotel access required.' using errcode='42501';end if;
 for r in select distinct room_id from public.online_bookings where property_id=p_property_id and state in ('payment_pending','confirmed') and expires_at<=now() order by room_id loop perform booking_private.expire_room(r.room_id);end loop;
end $$;
revoke all on function public.release_expired_online_bookings(uuid) from public,anon;
grant execute on function public.release_expired_online_bookings(uuid) to authenticated,service_role;

create function public.online_availability(p_arrival date,p_departure date,p_adults smallint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.dojworld_settings%rowtype;v_listing record;q jsonb;total bigint;out jsonb:='[]';begin
 select * into s from public.dojworld_settings;
 if not s.online_enabled then return jsonb_build_object('enabled',false,'rooms','[]'::jsonb);end if;
 if p_arrival is null or p_departure is null or p_arrival<(now() at time zone 'Africa/Lagos')::date or p_arrival>(now() at time zone 'Africa/Lagos')::date+365 or p_departure<=p_arrival or p_departure-p_arrival>30 or p_adults is null or p_adults not between 1 and 2 then raise exception 'Choose valid dates for up to 30 nights and one or two guests.' using errcode='22023';end if;
 perform public.release_expired_online_bookings(s.property_id);
 for v_listing in select l.slug,l.room_id,t.max_occupancy from public.online_room_listings l join public.rooms r on r.id=l.room_id join public.room_types t on t.id=r.room_type_id where l.enabled and r.active and t.active and r.property_id=s.property_id order by l.slug loop
   q:=booking_private.quote(v_listing.room_id,p_arrival,p_departure);
   select sum((n->>'standard_rate_kobo')::bigint) into total from jsonb_array_elements(q) n;
   out:=out||jsonb_build_array(jsonb_build_object('slug',v_listing.slug,'available',total between 1 and 9007199254740991 and v_listing.max_occupancy>=p_adults and booking_private.available(v_listing.room_id,p_arrival,p_departure) and not exists(select 1 from jsonb_array_elements(q) n where (n->>'standard_rate_kobo')::bigint<=0),'totalKobo',total,'depositKobo',(q->0->>'standard_rate_kobo')::bigint,'nightRates',q));
 end loop;
 return jsonb_build_object('enabled',true,'arrivalRequests',s.arrival_requests_enabled,'policy',s.cancellation_policy,'rooms',out);
end $$;
revoke all on function public.online_availability(date,date,smallint) from public,anon,authenticated;
grant execute on function public.online_availability(date,date,smallint) to service_role;

create function booking_private.allocate(p_booking uuid,p_status public.reservation_status) returns uuid
language plpgsql security definer set search_path='' as $$
declare b public.online_bookings%rowtype;g uuid;r uuid;begin
 select * into b from public.online_bookings where id=p_booking;
 if not booking_private.available(b.room_id,b.arrival_date,b.departure_date) then raise exception 'This room was just reserved. Choose another room or dates.' using errcode='23P01';end if;
 insert into public.guests(organization_id,full_name,phone,email) values(b.organization_id,b.guest_name,b.guest_phone,b.guest_email) returning id into g;
 insert into public.reservations(organization_id,property_id,guest_id,status,source,arrival_date,departure_date,adults,notes)
 values(b.organization_id,b.property_id,g,p_status,'website',b.arrival_date,b.departure_date,b.adults,'Website reference: '||b.payment_reference) returning id into r;
 insert into public.reservation_rooms(organization_id,property_id,reservation_id,room_id,nightly_rate_kobo,quoted_standard_rate_kobo,check_in_date,check_out_date)
 values(b.organization_id,b.property_id,r,b.room_id,(b.night_rates->0->>'standard_rate_kobo')::bigint,(b.night_rates->0->>'standard_rate_kobo')::bigint,b.arrival_date,b.departure_date);
 insert into public.reservation_night_rates(organization_id,property_id,reservation_id,service_date,standard_rate_kobo,charged_rate_kobo,rate_name)
 select b.organization_id,b.property_id,r,n.service_date,n.standard_rate_kobo,n.standard_rate_kobo,n.rate_name from jsonb_to_recordset(b.night_rates) n(service_date date,standard_rate_kobo bigint,rate_name text);
 insert into public.folios(organization_id,property_id,reservation_id,status) values(b.organization_id,b.property_id,r,'open');
 update public.online_bookings set reservation_id=r where id=b.id;
 insert into public.audit_events(organization_id,property_id,actor_user_id,action,entity_type,entity_id,after_data) values(b.organization_id,b.property_id,auth.uid(),'website_reservation_created','reservation',r,jsonb_build_object('reference',b.payment_reference,'payment_plan',b.payment_plan));
 return r;
end $$;

create function public.begin_online_booking(p_id uuid,p_token text,p_slug text,p_arrival date,p_departure date,p_adults smallint,p_name text,p_email text,p_phone text,p_plan text,p_expected_total bigint,p_expected_policy text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.dojworld_settings%rowtype;rid uuid;q jsonb;total bigint;due bigint;b public.online_bookings%rowtype;occupancy integer;begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text||':online-request',0));
 select * into b from public.online_bookings where id=p_id;
 if found then
   if b.access_hash<>encode(public.digest(p_token,'sha256'),'hex') or b.slug<>p_slug or b.arrival_date<>p_arrival or b.departure_date<>p_departure or b.adults<>p_adults or b.guest_name<>btrim(p_name) or b.guest_email<>lower(btrim(p_email)) or b.guest_phone<>btrim(p_phone) or b.payment_plan<>p_plan then raise exception 'This booking attempt was already used. Start again.' using errcode='23505';end if;
   return jsonb_build_object('id',b.id,'state',b.state,'reference',b.payment_reference,'amountKobo',b.due_now_kobo,'email',b.guest_email,'checkoutUrl',b.checkout_url,'expiresAt',b.expires_at);
 end if;
 select * into s from public.dojworld_settings;
 if not s.online_enabled then raise exception 'Online reservations are not enabled yet.' using errcode='55000';end if;
 if p_id is null or p_token !~ '^[0-9a-f]{64}$' or p_slug is null or p_arrival is null or p_departure is null or p_arrival<(now() at time zone 'Africa/Lagos')::date or p_arrival>(now() at time zone 'Africa/Lagos')::date+365 or p_departure<=p_arrival or p_departure-p_arrival>30 or p_adults is null or p_adults not between 1 and 2 or p_plan is null or p_plan not in ('deposit','full','arrival') or length(btrim(coalesce(p_name,''))) not between 2 and 100 or length(coalesce(p_email,''))>254 or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(btrim(coalesce(p_phone,''))) not between 7 and 30 then raise exception 'Enter valid guest details and stay dates.' using errcode='22023';end if;
 if exists(select 1 from public.property_tax_rules where property_id=s.property_id and active and rate_basis_points>0) then raise exception 'Online checkout requires final tax-inclusive room rates. Ask reception to review the pricing setup.' using errcode='55000';end if;
 if p_expected_policy is distinct from s.cancellation_policy then raise exception 'Booking terms changed. Refresh and review the current terms before continuing.' using errcode='23514';end if;
 if p_plan='arrival' and not s.arrival_requests_enabled then raise exception 'Pay-at-hotel requests are currently unavailable.' using errcode='55000';end if;
 select l.room_id,t.max_occupancy into rid,occupancy from public.online_room_listings l join public.rooms r on r.id=l.room_id join public.room_types t on t.id=r.room_type_id where l.slug=p_slug and l.enabled and r.property_id=s.property_id and r.active and t.active for share of t;
 if rid is null or occupancy<p_adults then raise exception 'This room is unavailable.' using errcode='23P01';end if;
 perform pg_advisory_xact_lock(hashtextextended(rid::text,0));perform booking_private.expire_room(rid);
 if not booking_private.available(rid,p_arrival,p_departure) then raise exception 'This room was just reserved. Choose another room or dates.' using errcode='23P01';end if;
 q:=booking_private.quote(rid,p_arrival,p_departure);
 select sum((n->>'standard_rate_kobo')::bigint) into total from jsonb_array_elements(q) n;
 if total is null or total>9007199254740991 or p_expected_total is distinct from total or exists(select 1 from jsonb_array_elements(q) n where (n->>'standard_rate_kobo')::bigint<=0) then raise exception 'Room rates changed. Review the updated total before continuing.' using errcode='23514';end if;
 due:=case p_plan when 'arrival' then 0 when 'full' then total else (q->0->>'standard_rate_kobo')::bigint end;
 insert into public.online_bookings(id,access_hash,organization_id,property_id,room_id,slug,guest_name,guest_email,guest_phone,arrival_date,departure_date,adults,payment_plan,state,quoted_total_kobo,due_now_kobo,night_rates,accepted_policy,expires_at,payment_reference)
 values(p_id,encode(public.digest(p_token,'sha256'),'hex'),s.organization_id,s.property_id,rid,p_slug,btrim(p_name),lower(btrim(p_email)),btrim(p_phone),p_arrival,p_departure,p_adults,p_plan,case p_plan when 'arrival' then 'requested' else 'payment_pending' end,total,due,q,p_expected_policy,case when p_plan<>'arrival' then now()+interval '15 minutes' end,'DOJ-'||replace(p_id::text,'-','')) returning * into b;
 if p_plan<>'arrival' then perform booking_private.allocate(p_id,'inquiry');end if;
 return jsonb_build_object('id',b.id,'state',b.state,'reference',b.payment_reference,'amountKobo',b.due_now_kobo,'email',b.guest_email,'expiresAt',b.expires_at);
end $$;
revoke all on function public.begin_online_booking(uuid,text,text,date,date,smallint,text,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.begin_online_booking(uuid,text,text,date,date,smallint,text,text,text,text,bigint,text) to service_role;

create function public.set_online_checkout(p_id uuid,p_url text) returns void
language plpgsql security definer set search_path='' as $$ begin
 if p_url !~ '^https://checkout\.paystack\.com/' then raise exception 'Invalid checkout URL.';end if;
 update public.online_bookings set checkout_url=p_url where id=p_id and state='payment_pending';
end $$;
revoke all on function public.set_online_checkout(uuid,text) from public,anon,authenticated;
grant execute on function public.set_online_checkout(uuid,text) to service_role;

create function public.confirm_online_payment(p_reference text,p_amount bigint,p_currency text) returns text
language plpgsql security definer set search_path='' as $$
declare b public.online_bookings%rowtype;rid uuid;f uuid;m public.payment_methods%rowtype;pid uuid;j uuid;ok boolean;begin
 select room_id into rid from public.online_bookings where payment_reference=p_reference;
 if rid is null then raise exception 'Unknown transaction.';end if;
 perform pg_advisory_xact_lock(hashtextextended(rid::text,0));
 select * into b from public.online_bookings where payment_reference=p_reference for update;
 if p_currency is distinct from 'NGN' or p_amount is distinct from b.due_now_kobo or b.payment_plan='arrival' then raise exception 'The payment does not match this booking.' using errcode='23514';end if;
 if b.payment_id is not null then return b.state;end if;
 ok:=b.state='payment_pending' and b.expires_at>now() and booking_private.available(b.room_id,b.arrival_date,b.departure_date,b.reservation_id) and exists(select 1 from public.reservations where id=b.reservation_id and status='inquiry');
 select * into m from public.payment_methods where property_id=b.property_id and name='Paystack online' and active;
 if m.id is null then raise exception 'The online payment account is unavailable.';end if;
 select id into f from public.folios where reservation_id=b.reservation_id;
 insert into public.payments(organization_id,property_id,folio_id,payment_method_id,amount_kobo,reference,idempotency_key,is_deposit)
 values(b.organization_id,b.property_id,f,m.id,p_amount,p_reference,'paystack:'||p_reference,true) returning id into pid;
 update public.online_bookings set payment_id=pid where id=b.id;
 insert into public.journals(organization_id,property_id,source_type,source_id,journal_date,memo,idempotency_key,posted_via)
 values(b.organization_id,b.property_id,'guest_deposit',pid,(now() at time zone 'Africa/Lagos')::date,'Verified online guest advance via Paystack','deposit:paystack:'||p_reference,'paystack_verified') returning id into j;
 insert into public.journal_lines(organization_id,journal_id,property_id,account_id,description,debit_kobo,credit_kobo)
 select b.organization_id,j,b.property_id,a.id,'Verified online guest advance',case when a.code=m.clearing_account_code then p_amount else 0 end,case when a.code='2100' then p_amount else 0 end
 from public.accounts a where a.organization_id=b.organization_id and a.active and a.code in (m.clearing_account_code,'2100');
 update public.journals set status='posted',posted_at=now() where id=j;
 insert into public.guest_deposits(organization_id,property_id,folio_id,payment_id,amount_kobo) values(b.organization_id,b.property_id,f,pid,p_amount);
 if ok then update public.reservations set status='confirmed' where id=b.reservation_id;
 else update public.reservations set status='cancelled' where id=b.reservation_id and status='inquiry';end if;
 update public.online_bookings set payment_id=pid,state=case when ok then 'confirmed' else 'payment_review' end,expires_at=null,decision_note=case when not ok then 'Payment received after the hold expired or inventory changed. Reception must arrange a room or refund.' end where id=b.id;
 insert into public.audit_events(organization_id,property_id,action,entity_type,entity_id,after_data) values(b.organization_id,b.property_id,'online_payment_verified','payment',pid,jsonb_build_object('reference',p_reference,'amount_kobo',p_amount,'confirmed',ok));
 return case when ok then 'confirmed' else 'payment_review' end;
end $$;
revoke all on function public.confirm_online_payment(text,bigint,text) from public,anon,authenticated;
grant execute on function public.confirm_online_payment(text,bigint,text) to service_role;

create function booking_private.received(p_reservation uuid) returns bigint
language sql stable security definer set search_path='' as $$
 select coalesce(sum(p.amount_kobo-coalesce((select sum(r.amount_kobo) from public.payment_refunds r where r.payment_id=p.id),0)),0)::bigint from public.payments p join public.folios f on f.id=p.folio_id where f.reservation_id=p_reservation
$$;
create function public.online_booking_status(p_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.online_bookings%rowtype;rs text;paid bigint;begin
 select * into b from public.online_bookings where id=p_id and access_hash=encode(public.digest(p_token,'sha256'),'hex');
 if not found then raise exception 'Booking not found.' using errcode='P0002';end if;
 perform booking_private.expire_room(b.room_id);select * into b from public.online_bookings where id=p_id;
 select status::text into rs from public.reservations where id=b.reservation_id;
 paid:=booking_private.received(b.reservation_id);
 return jsonb_build_object('id',b.id,'reference',b.payment_reference,'slug',b.slug,'state',b.state,'reservationStatus',rs,'arrival',b.arrival_date,'departure',b.departure_date,'guests',b.adults,'totalKobo',b.quoted_total_kobo,'paidKobo',paid,'dueNowKobo',b.due_now_kobo,'balanceKobo',case when b.state in ('confirmed','payment_pending','requested') then greatest(b.quoted_total_kobo-paid,0) else 0 end,'paymentPlan',b.payment_plan,'expiresAt',b.expires_at,'note',b.decision_note,'policy',b.accepted_policy,'checkoutUrl',case when b.state='payment_pending' then b.checkout_url end);
end $$;
revoke all on function public.online_booking_status(uuid,text) from public,anon,authenticated;
grant execute on function public.online_booking_status(uuid,text) to service_role;

create function public.consume_online_limit(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;begin
 insert into public.online_rate_limits(key,window_start,hits) values(p_key,now(),1)
 on conflict(key) do update set hits=case when online_rate_limits.window_start<now()-make_interval(secs=>p_seconds) then 1 else online_rate_limits.hits+1 end,window_start=case when online_rate_limits.window_start<now()-make_interval(secs=>p_seconds) then now() else online_rate_limits.window_start end returning hits into n;
 return n<=p_limit;
end $$;
revoke all on function public.consume_online_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_online_limit(text,integer,integer) to service_role;

create function public.decide_online_request(p_id uuid,p_approve boolean,p_deadline timestamptz,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare b public.online_bookings%rowtype;rid uuid;q jsonb;begin
 select room_id into rid from public.online_bookings where id=p_id;
 perform pg_advisory_xact_lock(hashtextextended(rid::text,0));
 select * into b from public.online_bookings where id=p_id for update;
 if not found or not public.can_access_property(b.organization_id,b.property_id) or not public.has_org_role(b.organization_id,array['owner','manager','front_desk']::public.member_role[]) then raise exception 'Reception access required.' using errcode='42501';end if;
 if b.state<>'requested' then raise exception 'This request was already handled.' using errcode='23514';end if;
 if length(btrim(coalesce(p_note,''))) not between 5 and 500 then raise exception 'Add a note explaining the decision and the deadline communicated to the guest.';end if;
 if p_approve then
   if p_deadline is null or p_deadline<=now() or p_deadline>(b.arrival_date+time '23:59') at time zone 'Africa/Lagos' or b.arrival_date<(now() at time zone 'Africa/Lagos')::date then raise exception 'Choose a future payment deadline no later than the arrival day.';end if;
   perform booking_private.expire_room(rid);
   q:=booking_private.quote(rid,b.arrival_date,b.departure_date);
   if q is distinct from b.night_rates then raise exception 'Rates changed. Ask the guest to submit a new request with the current price.';end if;
   perform booking_private.allocate(b.id,'confirmed');
 end if;
 update public.online_bookings set state=case when p_approve then 'confirmed' else 'rejected' end,expires_at=case when p_approve then p_deadline end,decision_note=btrim(p_note) where id=b.id;
 insert into public.audit_events(organization_id,property_id,actor_user_id,action,entity_type,entity_id,after_data) values(b.organization_id,b.property_id,auth.uid(),case when p_approve then 'online_request_approved' else 'online_request_rejected' end,'online_booking',b.id,jsonb_build_object('deadline',p_deadline,'note',btrim(p_note)));
end $$;
revoke all on function public.decide_online_request(uuid,boolean,timestamptz,text) from public,anon;
grant execute on function public.decide_online_request(uuid,boolean,timestamptz,text) to authenticated;

create function public.configure_dojworld_booking(p_enabled boolean,p_arrival_requests boolean,p_policy text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.dojworld_settings%rowtype;begin
 select * into s from public.dojworld_settings where singleton=true for update;
 if not public.has_org_role(s.organization_id,array['owner']::public.member_role[]) then raise exception 'Hotel owner access required.' using errcode='42501';end if;
 if length(btrim(coalesce(p_policy,''))) not between 30 and 3000 or p_policy like 'Contact reception for cancellation or changes. Cancellation and refund terms must%' then raise exception 'Enter the actual cancellation and refund terms before enabling bookings.';end if;
 if p_enabled and exists(select 1 from public.property_tax_rules where property_id=s.property_id and active and rate_basis_points>0) then raise exception 'Use final tax-inclusive rates for online checkout. Separate tax rules are not included in web quotes.';end if;
 if p_enabled and not exists(select 1 from public.online_room_listings where enabled) then raise exception 'Verify and enable at least one room listing first.';end if;
 update public.dojworld_settings set online_enabled=p_enabled,arrival_requests_enabled=p_arrival_requests,cancellation_policy=btrim(p_policy)
 where singleton=true and organization_id=s.organization_id and property_id=s.property_id;
 insert into public.audit_events(organization_id,property_id,actor_user_id,action,entity_type,entity_id,after_data) values(s.organization_id,s.property_id,auth.uid(),'online_booking_settings_updated','property',s.property_id,jsonb_build_object('enabled',p_enabled,'policy',btrim(p_policy)));
end $$;
revoke all on function public.configure_dojworld_booking(boolean,boolean,text) from public,anon;
grant execute on function public.configure_dojworld_booking(boolean,boolean,text) to authenticated;
create function public.map_online_room(p_slug text,p_room_id uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare s public.dojworld_settings%rowtype;begin
 select * into s from public.dojworld_settings;
 if not public.has_org_role(s.organization_id,array['owner']::public.member_role[]) then raise exception 'Hotel owner access required.' using errcode='42501';end if;
 if not exists(select 1 from public.rooms where id=p_room_id and property_id=s.property_id and active) then raise exception 'Choose an active Dojworld room.';end if;
 update public.online_room_listings set room_id=p_room_id,enabled=p_enabled where slug=p_slug;
 if not found then raise exception 'Unknown website listing.';end if;
end $$;
revoke all on function public.map_online_room(text,uuid,boolean) from public,anon;
grant execute on function public.map_online_room(text,uuid,boolean) to authenticated;

-- Listing visibility is separate from live inventory. Enabling a listing never
-- bypasses existing stays, checkout holds, maintenance blocks or room closures.
create or replace function public.bulk_set_online_rooms(p_property_id uuid,p_slugs text[],p_enabled boolean) returns integer
language plpgsql security definer set search_path='' as $$
declare s public.dojworld_settings%rowtype;v_count integer;begin
 select * into s from public.dojworld_settings where singleton=true and property_id=p_property_id for update;
 if not found or not public.can_access_property(s.organization_id,s.property_id) or not public.has_org_role(s.organization_id,array['owner']::public.member_role[]) then
   raise exception 'Hotel owner access required.' using errcode='42501';
 end if;
 if p_enabled is null or p_slugs is null or cardinality(p_slugs) not between 1 and 1000
   or array_ndims(p_slugs)<>1 or exists(select 1 from unnest(p_slugs) slug where slug is null or length(slug) not between 1 and 100 or slug<>btrim(slug))
   or (select count(distinct slug) from unnest(p_slugs) slug)<>cardinality(p_slugs) then
   raise exception 'Choose one or more unique website room listings.' using errcode='22023';
 end if;
 -- Lock all selected mappings before validating; one invalid selection rolls
 -- back the entire request without partially changing the remaining listings.
 perform 1 from public.online_room_listings l where l.slug=any(p_slugs) order by l.slug for update;
 select count(*) into v_count from public.online_room_listings l where l.slug=any(p_slugs);
 if v_count<>cardinality(p_slugs) then raise exception 'One or more website room listings no longer exist.' using errcode='22023';end if;
 perform 1 from public.rooms r join public.room_types t on t.id=r.room_type_id
   join public.online_room_listings l on l.room_id=r.id where l.slug=any(p_slugs) order by r.id for share of r,t;
 if exists(select 1 from public.online_room_listings l
   left join public.rooms r on r.id=l.room_id left join public.room_types t on t.id=r.room_type_id
   where l.slug=any(p_slugs) and (r.id is null or t.id is null
     or r.organization_id<>s.organization_id or r.property_id<>s.property_id
     or t.organization_id<>s.organization_id or t.property_id<>s.property_id
     or (p_enabled and (not r.active or not t.active)))) then
   raise exception 'Choose valid Dojworld room mappings. Only active rooms and room types can be enabled online.' using errcode='22023';
 end if;
 update public.online_room_listings l set enabled=p_enabled
   from public.rooms r where l.slug=any(p_slugs) and l.room_id=r.id
   and r.organization_id=s.organization_id and r.property_id=s.property_id;
 insert into public.audit_events(organization_id,property_id,actor_user_id,action,entity_type,entity_id,after_data)
   values(s.organization_id,s.property_id,auth.uid(),'online_room_listings_updated','property',s.property_id,
     jsonb_build_object('enabled',p_enabled,'slugs',to_jsonb(p_slugs),'count',v_count));
 return v_count;
end $$;
revoke all on function public.bulk_set_online_rooms(uuid,text[],boolean) from public,anon;
grant execute on function public.bulk_set_online_rooms(uuid,text[],boolean) to authenticated;
-- Helpers remain inaccessible to anonymous callers and staff RPC clients.
revoke all on all functions in schema booking_private from public,anon,authenticated;

-- Reflect reception cancellations on the guest confirmation page as well.
create function booking_private.sync_cancellation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('cancelled','no_show') then update public.online_bookings set state='cancelled',expires_at=null where reservation_id=new.id and state in ('confirmed','payment_pending');end if;
 return new;
end $$;
revoke all on function booking_private.sync_cancellation() from public,anon,authenticated;
create trigger online_reservation_cancelled after update of status on public.reservations for each row execute function booking_private.sync_cancellation();
