-- Disposable dedicated database only. Fixture writes and all scenarios roll back.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('41000000-0000-4000-8000-000000000001','front-desk-flow@doj-test.invalid',now()),
 ('41000000-0000-4000-8000-000000000002','housekeeping-flow@doj-test.invalid',now());
insert into public.organization_memberships(organization_id,user_id,role,active,all_properties)
 select organization_id,'41000000-0000-4000-8000-000000000001','front_desk',true,true from public.dojworld_settings;
insert into public.organization_memberships(organization_id,user_id,role,active,all_properties)
 select organization_id,'41000000-0000-4000-8000-000000000002','housekeeping',true,true from public.dojworld_settings;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',message;end if;end$$;
create function pg_temp.book(request_id uuid,guest text,payment_state text,method uuid,amount bigint,day_offset integer default 0) returns jsonb
language plpgsql as $$
declare s public.dojworld_settings%rowtype;r uuid;q jsonb;begin
 select * into s from public.dojworld_settings;
 select room_id into r from public.online_room_listings where slug='zuma-rock';
 select jsonb_agg(jsonb_build_object('service_date',service_date,'standard_rate_kobo',standard_rate_kobo) order by service_date)
 into q from public.get_room_rate_quote(r,current_date+100+day_offset,current_date+102+day_offset);
 return public.create_front_desk_reservation(request_id,s.organization_id,s.property_id,r,guest,null,null,
   current_date+100+day_offset,current_date+102+day_offset,1::smallint,null,null,null,q,payment_state,method,amount,null);
end$$;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(not has_table_privilege('authenticated','booking_private.front_desk_requests','SELECT'),'idempotency payloads stay private');
select pg_temp.assert(not has_function_privilege('anon','public.create_front_desk_reservation(uuid,uuid,uuid,uuid,text,text,text,date,date,smallint,bigint,text,text,jsonb,text,uuid,bigint,text)','EXECUTE'),'anonymous cannot create staff reservation');

do $$declare before_res integer;before_pay integer;before_guests integer;a jsonb;b jsonb;m uuid;begin
 select count(*) into before_res from public.reservations;select count(*) into before_pay from public.payments;
 a:=pg_temp.book('42000000-0000-4000-8000-000000000001','Unpaid front desk guest','unpaid',null,null);
 b:=pg_temp.book('42000000-0000-4000-8000-000000000001','Unpaid front desk guest','unpaid',null,null);
 perform pg_temp.assert(a=b,'identical unpaid retry returns same reservation');
 perform pg_temp.assert((select count(*) from public.reservations)=before_res+1,'unpaid retry creates one reservation');
 perform pg_temp.assert(a->>'paymentId' is null and (select count(*) from public.payments)=before_pay,'unpaid has no receipt or money');
 begin perform pg_temp.book('42000000-0000-4000-8000-000000000001','Different guest','unpaid',null,null);raise exception 'Changed payload accepted';exception when unique_violation then null;end;
 select id into m from public.payment_methods where name='Cash' and property_id=(select property_id from public.dojworld_settings);
 perform pg_temp.assert(m is not null,'fixture has Cash method');
 a:=pg_temp.book('42000000-0000-4000-8000-000000000002','Paid front desk guest','received',m,9000000,4);
 b:=pg_temp.book('42000000-0000-4000-8000-000000000002','Paid front desk guest','received',m,9000000,4);
 perform pg_temp.assert(a=b,'identical paid retry returns same reservation and receipt');
 perform pg_temp.assert((select count(*) from public.reservations)=before_res+2,'paid retry creates one reservation');
 perform pg_temp.assert((select count(*) from public.payments)=before_pay+1,'paid retry creates one actual payment');
 perform pg_temp.assert(exists(select 1 from public.payments p join public.folios f on f.id=p.folio_id where p.id=(a->>'paymentId')::uuid and f.reservation_id=(a->>'reservationId')::uuid and p.amount_kobo=9000000 and p.is_deposit and p.received_by=auth.uid()),'receipt payment belongs to same reservation');
 perform pg_temp.assert(exists(select 1 from public.guest_deposits where payment_id=(a->>'paymentId')::uuid and amount_kobo=9000000),'payment has canonical guest advance');
 perform pg_temp.assert((select sum(debit_kobo)-sum(credit_kobo) from public.journal_lines l join public.journals j on j.id=l.journal_id where j.source_id=(a->>'paymentId')::uuid)=0,'advance journal balances');
 select count(*) into before_res from public.reservations;select count(*) into before_guests from public.guests;
 begin perform pg_temp.book('42000000-0000-4000-8000-000000000003','Invalid tender guest','received','ffffffff-ffff-4fff-8fff-ffffffffffff',9000000,8);raise exception 'Invalid method accepted';exception when invalid_parameter_value then null;end;
 perform pg_temp.assert((select count(*) from public.reservations)=before_res and (select count(*) from public.guests)=before_guests,'payment failure rolls back reservation and guest');
 begin perform pg_temp.book('42000000-0000-4000-8000-000000000004','Overpaid guest','received',m,999999999999,8);raise exception 'Overpayment accepted';exception when invalid_parameter_value then null;end;
 perform pg_temp.assert((select count(*) from public.reservations)=before_res,'overpayment rolls back reservation');
 select id into m from public.payment_methods where name='Paystack online' and property_id=(select property_id from public.dojworld_settings);
 begin perform pg_temp.book('42000000-0000-4000-8000-000000000005','Fake online guest','received',m,9000000,8);raise exception 'Manual online tender accepted';exception when invalid_parameter_value then null;end;
 begin perform public.record_reservation_deposit((a->>'reservationId')::uuid,m,100,'forged reference','front-desk-forged-online');raise exception 'Existing deposit function forged online tender';exception when insufficient_privilege then null;end;
end$$;
set local role authenticated;
select pg_temp.assert((select count(*) from public.payments where idempotency_key='front-desk:42000000-0000-4000-8000-000000000002')=1,'front desk can read actual receipt payment through RLS');
select pg_temp.book('42000000-0000-4000-8000-000000000007','Authenticated desk guest','unpaid',null,null,12);
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000002',true);
select pg_temp.assert((select count(*) from public.payments where idempotency_key='front-desk:42000000-0000-4000-8000-000000000002')=0,'housekeeping cannot read receipt payments');
select pg_temp.assert((select count(*) from public.guests where full_name='Paid front desk guest')=0,'housekeeping cannot read guest on confirmation');
do $$begin begin perform pg_temp.book('42000000-0000-4000-8000-000000000006','Unauthorized guest','unpaid',null,null,10);raise exception 'Housekeeper created reservation';exception when insufficient_privilege then null;end;end$$;
reset role;
rollback;
