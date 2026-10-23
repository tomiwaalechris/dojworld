-- Existing Dojworld projects: add atomic bulk listing controls.
-- Existing paused rooms remain paused. Only newly inserted listings default on;
-- the hotel-wide online_enabled switch and live availability rules are unchanged.
begin;
alter table public.online_room_listings alter column enabled set default true;

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
commit;
