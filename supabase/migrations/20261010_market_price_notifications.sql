begin;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('verification','order','donation','message','payment','market_price'));

create or replace function public.notify_admin_market_price()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if old.reference_price is not distinct from new.reference_price
      and old.reference_year is not distinct from new.reference_year then
      return new;
    end if;
  end if;

  insert into public.notifications(user_id, type, title, message, link)
  select id, 'market_price', 'Admin updated the market reference',
    new.commodity_label || ': Admin set the reference to PHP '
      || to_char(new.reference_price, 'FM999999990.00') || '/kg (' || new.reference_year || '). '
      || 'Farmer selling prices are unchanged.'
      || case when nullif(btrim(new.reason), '') is null then '' else ' Reason: ' || left(new.reason, 500) end,
    '/marketplace'
  from public.profiles
  where role in ('buyer','farmer','stakeholder') and account_status = 'active';
  return new;
end $$;

revoke all on function public.notify_admin_market_price() from public, anon, authenticated, service_role;
drop trigger if exists market_price_override_notification on public.market_price_overrides;
create trigger market_price_override_notification
after insert or update of reference_price, reference_year on public.market_price_overrides
for each row execute function public.notify_admin_market_price();

notify pgrst, 'reload schema';
commit;
