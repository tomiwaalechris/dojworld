-- Existing Dojworld projects: scope the booking settings update to the hotel.
-- Preserves all settings, room mappings, policies and permissions.
begin;
create or replace function public.configure_dojworld_booking(p_enabled boolean,p_arrival_requests boolean,p_policy text) returns void
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

commit;
