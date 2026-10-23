-- Disposable local Dojworld test database only. All fixtures roll back.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',message;end if;end $$;
create temporary table summary_test_fixtures(name text primary key,id uuid not null);
grant select on summary_test_fixtures to authenticated;

insert into auth.users(id,email,email_confirmed_at) values
 ('41000000-0000-4000-8000-000000000001','summary-owner@doj-test.invalid',now()),
 ('41000000-0000-4000-8000-000000000002','summary-housekeeper@doj-test.invalid',now()),
 ('41000000-0000-4000-8000-000000000003','summary-reception@doj-test.invalid',now()),
 ('41000000-0000-4000-8000-000000000004','summary-accountant@doj-test.invalid',now()),
 ('41000000-0000-4000-8000-000000000005','summary-inactive@doj-test.invalid',now());
insert into public.organizations(id,name,slug)
 values('42000000-0000-4000-8000-000000000001','Payment summary test','payment-summary-test');
insert into public.properties(id,organization_id,name) values
 ('43000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','Payment summary property'),
 ('43000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000001','Other property');
insert into public.organization_memberships(organization_id,user_id,role,active,all_properties) values
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','owner',true,true),
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002','housekeeping',true,true),
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000003','front_desk',true,false),
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000004','accountant',true,true),
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000005','manager',false,true);
insert into public.membership_properties(organization_id,user_id,property_id) values
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000001');
insert into public.room_types(id,organization_id,property_id,name,base_rate_kobo)
 values('44000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','Test room type',1000000);
insert into public.rooms(id,organization_id,property_id,room_type_id,room_number)
 values('45000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001','Summary test room');
insert into public.room_rate_periods(organization_id,property_id,room_type_id,name,starts_on,ends_before,nightly_rate_kobo,created_by)
 values('42000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001','Second-night special',current_date+11,current_date+12,1200000,'41000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);

do $$declare r uuid;cash uuid;bank uuid;first_payment uuid;second_payment uuid;s record;i integer;begin
  insert into summary_test_fixtures(name,id) values('paid',public.create_priced_reservation(
    '42000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001',
    'Summary paid guest',null,null,current_date+10,current_date+13,1::smallint,null));
  select id into r from summary_test_fixtures where name='paid';
  select * into s from public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',array[r,r]);
  perform pg_temp.assert(s.room_total_kobo=3200000 and s.gross_paid_kobo=0 and s.net_paid_kobo=0 and cardinality(s.payment_methods)=0 and s.latest_payment_id is null,'unpaid quote includes scheduled nightly price without duplicate requested IDs');
  update public.room_types set base_rate_kobo=2000000 where id='44000000-0000-4000-8000-000000000001';
  perform pg_temp.assert((select room_total_kobo from public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',array[r]))=3200000,'current rate changes do not reprice immutable booking quote');
  select id into cash from public.payment_methods where property_id='43000000-0000-4000-8000-000000000001' and name='Cash';
  select id into bank from public.payment_methods where property_id='43000000-0000-4000-8000-000000000001' and name='Bank transfer';
  first_payment:=public.record_reservation_deposit(r,cash,1000000,'Cash desk test','summary-first-payment');
  second_payment:=public.record_reservation_deposit(r,bank,2200000,'BANK-SUMMARY-TEST','summary-second-payment');
  select * into s from public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',array[r]);
  perform pg_temp.assert(s.gross_paid_kobo=3200000 and s.net_paid_kobo=3200000 and s.refunded_kobo=0,'full prepayment counted as paid although both receipts are accounting deposits');
  perform pg_temp.assert(s.payment_methods=array['Bank transfer','Cash']::text[],'distinct historical payment method names');
  perform pg_temp.assert(s.latest_payment_id=(select p.id from public.payments p where p.id in(first_payment,second_payment) order by p.received_at desc,p.id desc limit 1),'deterministic latest payment');
  perform public.refund_guest_payment(first_payment,250000,'Partial refund one','summary-refund-one');
  perform public.refund_guest_payment(first_payment,125000,'Partial refund two','summary-refund-two');
  perform public.refund_guest_payment(second_payment,500000,'Bank refund test','summary-refund-three');
  select * into s from public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',array[r]);
  perform pg_temp.assert(s.gross_paid_kobo=3200000 and s.refunded_kobo=875000 and s.net_paid_kobo=2325000,'multiple refunds do not multiply payment rows');
  update public.payment_methods set active=false where id=cash;
  perform pg_temp.assert((select payment_methods from public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',array[r]))=array['Bank transfer','Cash']::text[],'disabled methods retained in payment history');

  insert into summary_test_fixtures(name,id) values('many',public.create_priced_reservation(
    '42000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001',
    'Summary many payments guest',null,null,current_date+20,current_date+23,1::smallint,null));
  select id into r from summary_test_fixtures where name='many';
  for i in 1..1001 loop perform public.record_reservation_deposit(r,bank,1,null,'summary-many-payment-'||i);end loop;
  perform pg_temp.assert((select gross_paid_kobo=1001 and net_paid_kobo=1001 from public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',array[r])),'all 1001 receipts counted beyond UI and default REST page limits');
  insert into summary_test_fixtures(name,id) values('unpaid',public.create_priced_reservation(
    '42000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001',
    'Summary unpaid guest',null,null,current_date+30,current_date+33,1::smallint,null));
  select id into r from summary_test_fixtures where name='unpaid';
  first_payment:=public.record_reservation_deposit(r,bank,500000,null,'summary-full-refund-payment');
  perform public.refund_guest_payment(first_payment,500000,'Full refund test','summary-full-refund');
  perform pg_temp.assert((select gross_paid_kobo=500000 and refunded_kobo=500000 and net_paid_kobo=0 from public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',array[r])),'fully refunded receipts are distinguishable from no payments');
  perform pg_temp.assert((select count(*) from public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',array[]::uuid[]))=0,'empty requested list returns no records');
end $$;

-- Cross-property and missing-quote fixtures are intentionally synthetic.
insert into public.guests(id,organization_id,full_name)
 values('46000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','Summary fixture guest');
insert into public.reservations(id,organization_id,property_id,guest_id,arrival_date,departure_date) values
 ('47000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000002','46000000-0000-4000-8000-000000000001',current_date+40,current_date+41),
 ('47000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000001',current_date+50,current_date+52);
insert into public.reservation_rooms(organization_id,property_id,reservation_id,room_id,nightly_rate_kobo,check_in_date,check_out_date)
 values('42000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000002','45000000-0000-4000-8000-000000000001',2000000,current_date+50,current_date+52);
select pg_temp.assert(not has_function_privilege('anon','public.get_reservation_payment_summaries(uuid,uuid[])','EXECUTE'),'anonymous callers cannot read payment totals');
set local role authenticated;
do $$declare ids uuid[];begin
  select array_agg(id) into ids from summary_test_fixtures;
  perform pg_temp.assert((select count(*) from public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',ids))=3,'owner works as actual authenticated database role');
  begin perform public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',array['47000000-0000-4000-8000-000000000001']::uuid[]);raise exception 'Cross-property ID accepted';exception when insufficient_privilege then null;end;
  begin perform public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',array['47000000-0000-4000-8000-999999999999']::uuid[]);raise exception 'Unknown ID accepted';exception when insufficient_privilege then null;end;
  begin perform public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',array['47000000-0000-4000-8000-000000000002']::uuid[]);raise exception 'Missing snapshot accepted';exception when check_violation then null;end;
  begin perform public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',array[null]::uuid[]);raise exception 'Null ID accepted';exception when invalid_parameter_value then null;end;
  perform set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000003',true);
  perform pg_temp.assert((select count(*) from public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',ids))=3,'front desk can read assigned property');
  begin perform public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000002',array[]::uuid[]);raise exception 'Unassigned property accepted';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000004',true);
  perform pg_temp.assert((select count(*) from public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',ids))=3,'accountant can read totals');
  perform set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000002',true);
  begin perform public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',ids);raise exception 'Housekeeping accepted';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000005',true);
  begin perform public.get_reservation_payment_summaries('43000000-0000-4000-8000-000000000001',ids);raise exception 'Inactive membership accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
