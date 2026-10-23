-- Provider observations are separate from cash receipts and approved ledger refunds.
begin;
create table if not exists public.booking_payment_checks(
 booking_id uuid primary key references public.online_bookings,organization_id uuid not null references public.organizations,
 property_id uuid not null references public.properties,checked_at timestamptz not null default now(),
 outcome text not null check(outcome in ('paid','unpaid','error')),last_error text
);
create table if not exists public.booking_provider_refunds(
 provider_id text primary key,booking_id uuid not null references public.online_bookings,organization_id uuid not null references public.organizations,
 property_id uuid not null references public.properties,amount_kobo bigint not null check(amount_kobo>0),
 provider_status text not null,checked_at timestamptz not null default now()
);
alter table public.booking_payment_checks enable row level security;
alter table public.booking_provider_refunds enable row level security;
revoke all on public.booking_payment_checks,public.booking_provider_refunds from public,anon,authenticated;
grant select on public.booking_payment_checks,public.booking_provider_refunds to authenticated,service_role;
drop policy if exists booking_payment_checks_staff_read on public.booking_payment_checks;
create policy booking_payment_checks_staff_read on public.booking_payment_checks for select to authenticated
 using(public.can_access_property(organization_id,property_id) and public.has_org_role(organization_id,array['owner','manager','front_desk','accountant']::public.member_role[]));
drop policy if exists booking_provider_refunds_staff_read on public.booking_provider_refunds;
create policy booking_provider_refunds_staff_read on public.booking_provider_refunds for select to authenticated
 using(public.can_access_property(organization_id,property_id) and public.has_org_role(organization_id,array['owner','manager','front_desk','accountant']::public.member_role[]));
create or replace function public.record_booking_payment_check(p_reference text,p_outcome text,p_error text) returns void
language plpgsql security definer set search_path='' as $$
declare b public.online_bookings%rowtype;
begin
 select * into b from public.online_bookings where payment_reference=p_reference;
 if not found then raise exception 'Booking not found.' using errcode='P0002';end if;
 if p_outcome is null or p_outcome not in ('paid','unpaid','error') or (p_outcome='paid' and b.payment_id is null) then raise exception 'Invalid payment check.' using errcode='22023';end if;
 insert into public.booking_payment_checks(booking_id,organization_id,property_id,outcome,last_error) values(b.id,b.organization_id,b.property_id,case when p_outcome='unpaid' and b.payment_id is not null then 'paid' else p_outcome end,left(p_error,200))
 on conflict(booking_id) do update set outcome=excluded.outcome,last_error=excluded.last_error,checked_at=now();
end $$;
create or replace function public.record_booking_provider_refund(p_provider_id text,p_reference text,p_amount bigint,p_currency text,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare b public.online_bookings%rowtype;v_old public.booking_provider_refunds%rowtype;
begin
 select * into b from public.online_bookings where payment_reference=p_reference;
 if not found then return;end if;
 if p_provider_id is null or p_provider_id !~ '^[0-9]{1,25}$' or p_amount is null or p_amount<=0 or p_amount>b.due_now_kobo or p_currency<>'NGN' or p_currency is null
  or p_status is null or p_status not in ('pending','processing','processed','failed','needs-attention') then raise exception 'Invalid provider refund observation.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('provider-refund:'||p_provider_id,0));
 select * into v_old from public.booking_provider_refunds where provider_id=p_provider_id;
 if found and (v_old.booking_id<>b.id or v_old.amount_kobo<>p_amount) then raise exception 'Provider refund identity changed.' using errcode='23514';end if;
 insert into public.booking_provider_refunds(provider_id,booking_id,organization_id,property_id,amount_kobo,provider_status)
 values(p_provider_id,b.id,b.organization_id,b.property_id,p_amount,p_status)
 on conflict(provider_id) do update set provider_status=excluded.provider_status,checked_at=now();
end $$;
revoke all on function public.record_booking_payment_check(text,text,text),public.record_booking_provider_refund(text,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.record_booking_payment_check(text,text,text),public.record_booking_provider_refund(text,text,bigint,text,text) to service_role;
create or replace function public.claim_booking_payment_checks(p_limit integer) returns table(booking_id uuid,payment_reference text)
language plpgsql security definer set search_path='' as $$
begin
 return query with candidates as (
  select b.id,b.payment_reference,b.organization_id,b.property_id from public.online_bookings b
  left join public.booking_payment_checks c on c.booking_id=b.id
  where b.payment_plan<>'arrival' and b.payment_id is null and b.state in ('payment_pending','expired','cancelled')
   and b.checkout_url is not null and b.created_at>now()-interval '7 days' and (c.checked_at is null or c.checked_at<now()-interval '10 minutes')
  order by coalesce(c.checked_at,b.created_at) for update of b skip locked limit least(greatest(p_limit,1),10)
 ), claimed as (
  insert into public.booking_payment_checks as checks(booking_id,organization_id,property_id,outcome,last_error)
  select id,organization_id,property_id,'error','Payment check started; awaiting provider response.' from candidates
  on conflict on constraint booking_payment_checks_pkey do update set checked_at=now(),outcome='error',last_error=excluded.last_error returning checks.booking_id
 ) select c.id,c.payment_reference from candidates c join claimed j on j.booking_id=c.id;
end $$;
revoke all on function public.claim_booking_payment_checks(integer) from public,anon,authenticated;
grant execute on function public.claim_booking_payment_checks(integer) to service_role;
create or replace function public.get_booking_refund_reconciliation(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o uuid;v_result jsonb;
begin
 select organization_id into o from public.dojworld_settings where property_id=p_property_id;
 if o is null or not(public.can_access_property(o,p_property_id) and public.has_org_role(o,array['owner','manager','front_desk','accountant']::public.member_role[])) then raise exception 'Hotel access required.' using errcode='42501';end if;
 select coalesce(jsonb_agg(row_data order by latest desc),'[]'::jsonb) into v_result from (
  select max(p.checked_at) latest,jsonb_build_object('bookingId',b.id,'reference',b.payment_reference,'reservationId',b.reservation_id,
   'processedKobo',coalesce(sum(p.amount_kobo) filter(where p.provider_status='processed'),0),
   'recordedKobo',(select coalesce(sum(r.amount_kobo),0) from public.payment_refunds r where r.payment_id=b.payment_id),
   'refunds',jsonb_agg(jsonb_build_object('id',p.provider_id,'amountKobo',p.amount_kobo,'status',p.provider_status,'checkedAt',p.checked_at) order by p.provider_id)) row_data
  from public.online_bookings b join public.booking_provider_refunds p on p.booking_id=b.id
  where b.organization_id=o and b.property_id=p_property_id group by b.id
 ) rows;
 return v_result;
end $$;
revoke all on function public.get_booking_refund_reconciliation(uuid) from public,anon;
grant execute on function public.get_booking_refund_reconciliation(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
