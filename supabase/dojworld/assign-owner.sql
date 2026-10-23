-- First create/invite your owner in Supabase Authentication > Users.
-- Replace this email with that person's actual email, then run as postgres.
-- Do not put passwords or API keys in this file.
begin;
do $$ declare owner_email text := 'REPLACE_WITH_OWNER_EMAIL'; u uuid; o uuid;begin
 if owner_email='REPLACE_WITH_OWNER_EMAIL' then raise exception 'Enter the owner email first.';end if;
 select id into u from auth.users where lower(email)=lower(owner_email) and email_confirmed_at is not null;
 if u is null then raise exception 'Create and confirm this user in Supabase Authentication first.';end if;
 select organization_id into o from public.dojworld_settings;
 if o is null then raise exception 'Install the dedicated Dojworld schema first.';end if;
 insert into public.organization_memberships(organization_id,user_id,role,active,all_properties,full_name)
 values(o,u,'owner',true,true,'Dojworld Owner')
 on conflict(organization_id,user_id) do update set role='owner',active=true,all_properties=true;
end $$;
commit;
