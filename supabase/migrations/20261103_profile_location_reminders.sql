begin;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('verification','order','donation','message','payment','market_price','profile'));

notify pgrst, 'reload schema';
commit;
