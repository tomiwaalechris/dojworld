-- Atomic direct reservations and their initial payment. Safe to apply to an
-- existing dedicated installation; no guest data or historical amounts change.
create table if not exists booking_private.front_desk_requests (
  organization_id uuid not null references public.organizations,
  request_id uuid not null,
  created_by uuid not null references auth.users,
  request_payload jsonb not null,
  reservation_id uuid not null references public.reservations,
  payment_id uuid references public.payments,
  created_at timestamptz not null default now(),
  primary key (organization_id,request_id)
);
revoke all on booking_private.front_desk_requests from public,anon,authenticated;

create or replace function public.guard_verified_online_tender() returns trigger
language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.payment_methods where id=new.payment_method_id and name='Paystack online')
    and coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Online payments are recorded only after Paystack verification. Choose the method actually received at reception.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_verified_online_tender() from public,anon,authenticated;
drop trigger if exists payment_verified_online_tender on public.payments;
create trigger payment_verified_online_tender before insert on public.payments
  for each row execute function public.guard_verified_online_tender();

create or replace function public.create_front_desk_reservation(
  p_request_id uuid,p_organization_id uuid,p_property_id uuid,p_room_id uuid,
  p_guest_name text,p_guest_phone text,p_guest_email text,p_arrival_date date,p_departure_date date,
  p_adults smallint,p_nightly_rate_kobo bigint,p_notes text,p_pricing_reason text,p_expected_quote jsonb,
  p_payment_state text,p_payment_method_id uuid,p_amount_kobo bigint,p_reference text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_payload jsonb;v_existing booking_private.front_desk_requests%rowtype;
  v_reservation uuid;v_payment uuid;v_total bigint;
begin
  if auth.uid() is null or not public.has_org_role(p_organization_id,array['owner','manager','front_desk']::public.member_role[])
    or not public.can_access_property(p_organization_id,p_property_id) then
    raise exception 'You cannot create reservations for this property.' using errcode='42501';
  end if;
  if p_request_id is null or p_payment_state is null or p_payment_state not in ('unpaid','received') then
    raise exception 'Choose unpaid or payment received before confirming.' using errcode='22023';
  end if;
  if p_payment_state='unpaid' and (p_payment_method_id is not null or coalesce(p_amount_kobo,0)<>0 or nullif(btrim(p_reference),'') is not null) then
    raise exception 'Unpaid reservations cannot include a payment.' using errcode='22023';
  end if;
  if p_payment_state='received' and (p_payment_method_id is null or coalesce(p_amount_kobo,0)<=0 or p_amount_kobo>9007199254740991) then
    raise exception 'Enter the amount received and its payment method.' using errcode='22023';
  end if;
  if p_expected_quote is null or jsonb_typeof(p_expected_quote)<>'array' or jsonb_array_length(p_expected_quote)=0 then
    raise exception 'Load and review the nightly quote before confirming.' using errcode='22023';
  end if;
  if length(coalesce(p_reference,''))>150 then raise exception 'Payment reference must be 150 characters or fewer.' using errcode='22023';end if;
  v_payload:=jsonb_build_object('property',p_property_id,'room',p_room_id,'name',p_guest_name,'phone',p_guest_phone,
    'email',p_guest_email,'arrival',p_arrival_date,'departure',p_departure_date,'adults',p_adults,
    'rate',p_nightly_rate_kobo,'notes',p_notes,'reason',p_pricing_reason,'quote',p_expected_quote,
    'paymentState',p_payment_state,'method',p_payment_method_id,'amount',p_amount_kobo,'reference',p_reference);
  perform pg_advisory_xact_lock(hashtextextended('front-desk:'||p_organization_id::text||':'||p_request_id::text,0));
  select * into v_existing from booking_private.front_desk_requests
    where organization_id=p_organization_id and request_id=p_request_id;
  if found then
    if v_existing.created_by<>auth.uid() or v_existing.request_payload<>v_payload then
      raise exception 'This reservation was already saved with different details. Open a new reservation to make another booking.' using errcode='23505';
    end if;
    return jsonb_build_object('reservationId',v_existing.reservation_id,'paymentId',v_existing.payment_id);
  end if;
  v_reservation:=public.create_priced_reservation(p_organization_id,p_property_id,p_room_id,p_guest_name,p_guest_phone,
    p_guest_email,p_arrival_date,p_departure_date,p_adults,p_nightly_rate_kobo,p_notes,p_pricing_reason,p_expected_quote);
  select sum(charged_rate_kobo) into v_total from public.reservation_night_rates where reservation_id=v_reservation;
  if p_payment_state='received' then
    if p_amount_kobo>coalesce(v_total,0) then
      raise exception 'The initial payment cannot exceed the agreed room total.' using errcode='22023';
    end if;
    if not exists(select 1 from public.payment_methods where id=p_payment_method_id and organization_id=p_organization_id
      and property_id=p_property_id and active and name<>'Paystack online') then
      raise exception 'Choose an active reception payment method.' using errcode='22023';
    end if;
    v_payment:=public.record_reservation_deposit(v_reservation,p_payment_method_id,p_amount_kobo,p_reference,'front-desk:'||p_request_id::text);
  end if;
  insert into booking_private.front_desk_requests(organization_id,request_id,created_by,request_payload,reservation_id,payment_id)
    values(p_organization_id,p_request_id,auth.uid(),v_payload,v_reservation,v_payment);
  return jsonb_build_object('reservationId',v_reservation,'paymentId',v_payment);
end $$;
revoke all on function public.create_front_desk_reservation(uuid,uuid,uuid,uuid,text,text,text,date,date,smallint,bigint,text,text,jsonb,text,uuid,bigint,text) from public,anon;
grant execute on function public.create_front_desk_reservation(uuid,uuid,uuid,uuid,text,text,text,date,date,smallint,bigint,text,text,jsonb,text,uuid,bigint,text) to authenticated;
