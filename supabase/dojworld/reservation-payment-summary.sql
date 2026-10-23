-- Additive update for existing Dojworld projects. No settings or inventory change.
-- Payment totals include the complete ledger history, independent of UI row limits.
begin;

create or replace function public.get_reservation_payment_summaries(
  p_property_id uuid,
  p_reservation_ids uuid[]
) returns table (
  reservation_id uuid,
  room_total_kobo bigint,
  gross_paid_kobo bigint,
  refunded_kobo bigint,
  net_paid_kobo bigint,
  payment_methods text[],
  latest_payment_id uuid
) language plpgsql stable security definer set search_path='' as $$
declare v_organization_id uuid;
begin
  select p.organization_id into v_organization_id
    from public.properties p where p.id=p_property_id;
  if v_organization_id is null
    or not public.can_access_property(v_organization_id,p_property_id)
    or not public.has_org_role(v_organization_id,array['owner','manager','front_desk','accountant']::public.member_role[])
  then
    raise exception 'Payment access to this hotel is required.' using errcode='42501';
  end if;
  if p_reservation_ids is null or array_position(p_reservation_ids,null) is not null then
    raise exception 'Choose valid reservation IDs.' using errcode='22023';
  end if;
  -- Never silently omit another property's or an unknown reservation.
  if exists (
    select 1 from unnest(p_reservation_ids) requested(id)
    left join public.reservations r on r.id=requested.id
      and r.organization_id=v_organization_id and r.property_id=p_property_id
    where r.id is null
  ) then
    raise exception 'Choose only reservations from this hotel.' using errcode='42501';
  end if;
  -- A missing quote must not be reported as a complimentary or fully paid stay.
  if exists (
    select 1 from public.reservations r
    where r.id=any(p_reservation_ids)
      and exists(select 1 from public.reservation_rooms rr where rr.reservation_id=r.id)
      and (select count(*) from public.reservation_night_rates n
        where n.reservation_id=r.id and n.organization_id=v_organization_id
          and n.property_id=p_property_id and n.service_date>=r.arrival_date
          and n.service_date<r.departure_date)<>r.departure_date-r.arrival_date
  ) then
    raise exception 'Some agreed nightly prices are missing. Ask the hotel administrator to review the stay.' using errcode='23514';
  end if;

  return query
  with requested as (
    select r.id,r.arrival_date,r.departure_date from public.reservations r
    where r.organization_id=v_organization_id and r.property_id=p_property_id
      and r.id=any(p_reservation_ids)
  ), quotes as (
    select r.id,sum(n.charged_rate_kobo)::bigint total
    from requested r join public.reservation_night_rates n
      on n.reservation_id=r.id and n.organization_id=v_organization_id
      and n.property_id=p_property_id and n.service_date>=r.arrival_date
      and n.service_date<r.departure_date
    group by r.id
  ), receipts as (
    select f.reservation_id,p.id,p.amount_kobo,p.received_at,m.name,
      coalesce((select sum(rf.amount_kobo) from public.payment_refunds rf
        where rf.payment_id=p.id and rf.organization_id=v_organization_id
          and rf.property_id=p_property_id),0)::bigint refunded
    from requested r join public.folios f on f.reservation_id=r.id
      and f.organization_id=v_organization_id and f.property_id=p_property_id
    join public.payments p on p.folio_id=f.id
      and p.organization_id=v_organization_id and p.property_id=p_property_id
    join public.payment_methods m on m.id=p.payment_method_id
      and m.organization_id=v_organization_id and m.property_id=p_property_id
  ), totals as (
    select rc.reservation_id,sum(rc.amount_kobo)::bigint gross,
      sum(rc.refunded)::bigint refunded,
      array_agg(distinct rc.name order by rc.name) methods,
      (array_agg(rc.id order by rc.received_at desc,rc.id desc))[1] latest
    from receipts rc group by rc.reservation_id
  )
  select r.id,coalesce(q.total,0)::bigint,coalesce(t.gross,0)::bigint,
    coalesce(t.refunded,0)::bigint,
    (coalesce(t.gross,0)-coalesce(t.refunded,0))::bigint,
    coalesce(t.methods,array[]::text[]),t.latest
  from requested r left join quotes q on q.id=r.id
    left join totals t on t.reservation_id=r.id
  order by r.id;
end $$;

revoke all on function public.get_reservation_payment_summaries(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.get_reservation_payment_summaries(uuid,uuid[]) to authenticated;
comment on function public.get_reservation_payment_summaries(uuid,uuid[]) is
  'Read-only staff totals: immutable quoted room prices and all actual receipts less recorded refunds. Full prepayments remain accounting advances; payment status must use net amounts.';

notify pgrst,'reload schema';
commit;
