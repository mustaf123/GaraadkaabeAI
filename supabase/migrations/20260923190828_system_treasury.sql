-- The System Treasury wallet funds every $100.00 demo balance, so the ledger
-- always sums to zero. It is the only wallet allowed below zero.
-- Created here (not in seed.sql) because seed files never run on the hosted database.

insert into public.wallets (user_id, type, balance)
values (null, 'system', 0)
on conflict (type) where type = 'system' do nothing;
