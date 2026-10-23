-- Isolated local dedicated database only. All fixtures roll back.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAILED: %',message;end if;end$$;
insert into auth.users(id,email,email_confirmed_at) values
 ('61000000-0000-4000-8000-000000000001','recovery-owner@doj-test.invalid',now()),
 ('61000000-0000-4000-8000-000000000002','recovery-desk@doj-test.invalid',now()),
 ('61000000-0000-4000-8000-000000000003','recovery-housekeeping@doj-test.invalid',now());
insert into public.organization_memberships(organization_id,user_id,role,active,all_properties)
 select organization_id,u.id,u.role::public.member_role,true,true from public.dojworld_settings,
 (values('61000000-0000-4000-8000-000000000001'::uuid,'owner'),('61000000-0000-4000-8000-000000000002'::uuid,'front_desk'),('61000000-0000-4000-8000-000000000003'::uuid,'housekeeping')) u(id,role) where singleton=true;
update public.dojworld_settings set online_enabled=true,arrival_requests_enabled=true,cancellation_policy='Testing policy only. Free cancellation until 24 hours before arrival.' where singleton=true;
select set_config('request.jwt.claim.role','service_role',true);
select public.begin_online_booking('61000000-0000-4000-8000-000000000011',repeat('a',64),'zuma-rock',current_date+80,current_date+82,1::smallint,'TEST Recovery guest','recovery-guest@doj-test.invalid','+2348000000000','deposit',18000000,(select cancellation_policy from public.dojworld_settings where singleton=true));
select public.set_online_checkout('61000000-0000-4000-8000-000000000011','https://checkout.paystack.com/test-no-network');
select pg_temp.assert((select count(*)=1 from public.claim_booking_payment_checks(3)),'worker claims an initialized unpaid checkout');
select pg_temp.assert((select count(*)=0 from public.claim_booking_payment_checks(3)),'worker does not immediately repeat a claimed payment check');
select public.record_booking_payment_check('DOJ-61000000000040008000000000000011','unpaid',null);
select pg_temp.assert((select payment_id is null from public.online_bookings where id='61000000-0000-4000-8000-000000000011'),'unpaid check never marks a booking paid');
do $$begin begin perform public.record_booking_payment_check('DOJ-61000000000040008000000000000011','paid',null);raise exception 'Unverified paid status accepted';exception when invalid_parameter_value then null;end;end$$;
select public.confirm_online_payment('DOJ-61000000000040008000000000000011',9000000,'NGN');
select public.record_booking_payment_check('DOJ-61000000000040008000000000000011','paid',null);
select pg_temp.assert((select count(*)=1 from public.booking_notifications where booking_id='61000000-0000-4000-8000-000000000011' and kind='confirmed'),'confirmation queued in the payment transaction');
select pg_temp.assert(public.prepare_booking_recovery('DOJ-61000000000040008000000000000011','wrong@doj-test.invalid',repeat('b',64)) is null,'wrong email returns no private details');
select pg_temp.assert(public.prepare_booking_recovery('DOJ-00000000000040008000000000000011','recovery-guest@doj-test.invalid',repeat('b',64)) is null,'unknown booking returns no private details');
select pg_temp.assert(public.prepare_booking_recovery('doj-61000000000040008000000000000011','RECOVERY-GUEST@doj-test.invalid',repeat('b',64))->>'email'='recovery-guest@doj-test.invalid','only the saved email is returned to the server');
select pg_temp.assert(public.consume_booking_recovery(repeat('b',64),encode(public.digest(repeat('c',64),'sha256'),'hex'))='61000000-0000-4000-8000-000000000011'::uuid,'one-use recovery creates guest access');
select pg_temp.assert(public.online_booking_status('61000000-0000-4000-8000-000000000011',repeat('c',64))->>'state'='confirmed','recovered session opens actual confirmation');
select pg_temp.assert(public.online_booking_status('61000000-0000-4000-8000-000000000011',repeat('a',64))->>'state'='confirmed','original browser access remains valid');
do $$begin begin perform public.consume_booking_recovery(repeat('b',64),repeat('d',64));raise exception 'Recovery link replay accepted';exception when no_data_found then null;end;end$$;
select public.prepare_booking_recovery('DOJ-61000000000040008000000000000011','recovery-guest@doj-test.invalid',repeat('e',64));
update booking_private.booking_recovery_links set expires_at=now()-interval '1 minute' where token_hash=repeat('e',64);
do $$begin begin perform public.consume_booking_recovery(repeat('e',64),repeat('f',64));raise exception 'Expired recovery accepted';exception when no_data_found then null;end;end$$;
update booking_private.guest_booking_sessions set expires_at=now()-interval '1 minute' where token_hash=encode(public.digest(repeat('c',64),'sha256'),'hex');
do $$begin begin perform public.online_booking_status('61000000-0000-4000-8000-000000000011',repeat('c',64));raise exception 'Expired session accepted';exception when no_data_found then null;end;end$$;
-- The latest stay projection and notification coalesce without rewriting checkout snapshots.
update public.reservations set departure_date=current_date+81 where id=(select reservation_id from public.online_bookings where id='61000000-0000-4000-8000-000000000011');
update public.reservation_rooms set room_id=(select room_id from public.online_room_listings where slug='yankari-reserve'),check_out_date=current_date+81 where reservation_id=(select reservation_id from public.online_bookings where id='61000000-0000-4000-8000-000000000011');
select pg_temp.assert((select count(*)=1 and bool_and(payload->>'room'='Yankari Reserve' and payload->>'departure'=(current_date+81)::text) from public.booking_notifications where booking_id='61000000-0000-4000-8000-000000000011'),'one transaction queues the final room and date update');
create temp table email_claim as select * from public.claim_booking_notifications(3);
select pg_temp.assert((select count(*)=1 from email_claim),'outbox worker claims a queued email');
select pg_temp.assert((select count(*)=0 from public.claim_booking_notifications(3)),'active email lease cannot be claimed twice');
do $$begin begin perform public.finish_booking_notification((select id from email_claim),gen_random_uuid(),true,'fake',null);raise exception 'Stale notification lease accepted';exception when check_violation then null;end;end$$;
select public.finish_booking_notification(id,lease_id,false,null,'TEST provider unavailable') from email_claim;
select pg_temp.assert((select status='failed' and sent_at is null from public.booking_notifications where id=(select id from email_claim)),'failed provider call is not marked sent');
create temp table email_retry as select * from public.claim_booking_notifications(3);
select public.finish_booking_notification(id,lease_id,true,'test-provider-ack',null) from email_retry;
select pg_temp.assert((select status='sent' and attempts=2 and sent_at is not null from public.booking_notifications where id=(select id from email_claim)),'provider acknowledgement completes one retried job');
select pg_temp.assert((select count(*)=0 from public.claim_booking_notifications(3)),'accepted email is never automatically resent');
-- Provider refund observations must not create ledger money or duplicate on replay.
select public.record_booking_provider_refund('987654','DOJ-61000000000040008000000000000011',100000,'NGN','pending');
select public.record_booking_provider_refund('987654','DOJ-61000000000040008000000000000011',100000,'NGN','processed');
select public.record_booking_provider_refund('987654','DOJ-61000000000040008000000000000011',100000,'NGN','processed');
select pg_temp.assert((select count(*)=1 from public.booking_provider_refunds),'duplicate provider refund observation is idempotent');
select pg_temp.assert((select count(*)=0 from public.payment_refunds),'provider refund observation does not invent a ledger refund');
do $$begin begin perform public.record_booking_provider_refund('987654','DOJ-61000000000040008000000000000011',100001,'NGN','processed');raise exception 'Changed refund amount accepted';exception when check_violation then null;end;end$$;
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select pg_temp.assert((public.get_booking_refund_reconciliation((select property_id from public.dojworld_settings where singleton=true))->0->>'processedKobo')::bigint=100000,'staff sees processed provider refund total');
select pg_temp.assert((public.get_booking_refund_reconciliation((select property_id from public.dojworld_settings where singleton=true))->0->>'recordedKobo')::bigint=0,'unmatched provider refund remains visible');
select public.request_guest_payment_refund((select payment_id from public.online_bookings where id='61000000-0000-4000-8000-000000000011'),100000,'TEST actual provider refund completed','recovery-refund-test');
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
select public.review_guest_payment_refund((select id from public.refund_approval_requests where idempotency_key='recovery-refund-test'),true,'Matched to provider refund 987654');
select pg_temp.assert((public.get_booking_refund_reconciliation((select property_id from public.dojworld_settings where singleton=true))->0->>'recordedKobo')::bigint=100000,'approved original-payment refund reconciles to the provider');
select pg_temp.assert(not has_function_privilege('authenticated','public.prepare_booking_recovery(text,text,text)','EXECUTE'),'staff cannot mint recovery links');
select pg_temp.assert(not has_function_privilege('anon','public.claim_booking_notifications(integer)','EXECUTE'),'anonymous cannot claim email jobs');
select pg_temp.assert(not has_function_privilege('authenticated','public.record_booking_provider_refund(text,text,bigint,text,text)','EXECUTE'),'staff cannot forge provider observations');
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000003',true);
select pg_temp.assert((select count(*)=0 from public.booking_notifications),'housekeeping cannot read guest email queue');
select pg_temp.assert((select count(*)=0 from public.booking_payment_checks),'housekeeping cannot read payment follow-up');
select pg_temp.assert((select count(*)=0 from public.booking_provider_refunds),'housekeeping cannot read provider refunds');
reset role;
rollback;
