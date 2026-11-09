begin;

create table if not exists public.commodity_catalog (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  name_normalized text not null,
  variety text,
  variety_normalized text not null default '',
  category_id uuid not null references public.categories(id) on update cascade on delete restrict,
  unit text not null,
  unit_normalized text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name_normalized, variety_normalized, unit_normalized)
);

create index if not exists commodity_catalog_active_name_idx
  on public.commodity_catalog (is_active, name_normalized);

alter table public.commodity_catalog enable row level security;
grant select on public.commodity_catalog to authenticated;
grant select on public.units to authenticated;

drop policy if exists "Authenticated users can read measurement units" on public.units;
create policy "Authenticated users can read measurement units"
  on public.units for select to authenticated using (true);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop policy if exists "Authenticated users can read active commodities" on public.commodity_catalog;
create policy "Authenticated users can read active commodities"
  on public.commodity_catalog for select to authenticated
  using (
    is_active
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop trigger if exists set_commodity_catalog_updated_at on public.commodity_catalog;
create trigger set_commodity_catalog_updated_at before update on public.commodity_catalog
  for each row execute function public.set_updated_at();

alter table public.market_price_overrides
  add column if not exists unit text not null default 'kg',
  add column if not exists source text not null default 'admin_entered',
  add column if not exists effective_date date not null default current_date,
  add column if not exists supporting_reference text,
  add column if not exists is_active boolean not null default true;

alter table public.market_price_overrides
  drop constraint if exists market_price_overrides_source_check;
alter table public.market_price_overrides
  add constraint market_price_overrides_source_check
  check (source in ('admin_entered', 'verified_local_market'));

alter table public.market_price_override_history
  add column if not exists previous_unit text,
  add column if not exists new_unit text,
  add column if not exists previous_source text,
  add column if not exists new_source text,
  add column if not exists effective_date date,
  add column if not exists supporting_reference text;

grant select on public.market_price_overrides, public.market_price_override_history to authenticated;

drop policy if exists "Authenticated users can read market price overrides" on public.market_price_overrides;
create policy "Authenticated users can read market price overrides"
  on public.market_price_overrides for select to authenticated using (true);

drop policy if exists "Authenticated users can read market price history" on public.market_price_override_history;
create policy "Authenticated users can read market price history"
  on public.market_price_override_history for select to authenticated using (true);

create or replace function public.set_market_price_override(
  p_commodity_id text,
  p_commodity_label text,
  p_reference_price numeric,
  p_reference_year integer,
  p_baseline_price numeric,
  p_unit text,
  p_source text,
  p_effective_date date,
  p_reason text,
  p_supporting_reference text,
  p_updated_by uuid,
  p_updated_by_name text
) returns public.market_price_overrides
language plpgsql
security definer
set search_path = public
as $$
declare
  previous public.market_price_overrides%rowtype;
  saved public.market_price_overrides%rowtype;
begin
  select * into previous
  from public.market_price_overrides
  where commodity_id = p_commodity_id
  for update;

  insert into public.market_price_overrides (
    commodity_id, commodity_label, reference_price, reference_year, baseline_price,
    unit, source, effective_date, supporting_reference, is_active, reason,
    updated_by, updated_by_name, updated_at
  ) values (
    p_commodity_id, p_commodity_label, p_reference_price, p_reference_year, p_baseline_price,
    p_unit, p_source, p_effective_date, p_supporting_reference, true, p_reason,
    p_updated_by, p_updated_by_name, now()
  )
  on conflict (commodity_id) do update set
    commodity_label = excluded.commodity_label,
    reference_price = excluded.reference_price,
    reference_year = excluded.reference_year,
    baseline_price = excluded.baseline_price,
    unit = excluded.unit,
    source = excluded.source,
    effective_date = excluded.effective_date,
    supporting_reference = excluded.supporting_reference,
    is_active = true,
    reason = excluded.reason,
    updated_by = excluded.updated_by,
    updated_by_name = excluded.updated_by_name,
    updated_at = now()
  returning * into saved;

  insert into public.market_price_override_history (
    commodity_id, commodity_label, previous_price, new_price, reason,
    updated_by, updated_by_name, previous_unit, new_unit, previous_source,
    new_source, effective_date, supporting_reference
  ) values (
    p_commodity_id, p_commodity_label,
    previous.reference_price, p_reference_price, p_reason,
    p_updated_by, p_updated_by_name, previous.unit, p_unit, previous.source,
    p_source, p_effective_date, p_supporting_reference
  );

  return saved;
end;
$$;

revoke all on function public.set_market_price_override(
  text, text, numeric, integer, numeric, text, text, date, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.set_market_price_override(
  text, text, numeric, integer, numeric, text, text, date, text, text, uuid, text
) to service_role;

create or replace function public.clear_market_price_override(
  p_commodity_id text,
  p_updated_by uuid,
  p_updated_by_name text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous public.market_price_overrides%rowtype;
begin
  select * into previous
  from public.market_price_overrides
  where commodity_id = p_commodity_id and is_active
  for update;

  if not found then return; end if;

  update public.market_price_overrides set is_active = false, updated_at = now()
  where commodity_id = p_commodity_id;

  insert into public.market_price_override_history (
    commodity_id, commodity_label, previous_price, new_price, reason,
    updated_by, updated_by_name, previous_unit, previous_source, effective_date,
    supporting_reference
  ) values (
    previous.commodity_id, previous.commodity_label, previous.reference_price, null,
    'Reset to PSA reference price.', p_updated_by, p_updated_by_name,
    previous.unit, previous.source, previous.effective_date, previous.supporting_reference
  );
end;
$$;

revoke all on function public.clear_market_price_override(text, uuid, text) from public, anon, authenticated;
grant execute on function public.clear_market_price_override(text, uuid, text) to service_role;

create or replace function public.notify_admin_market_price()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.is_active then return new; end if;

  if tg_op = 'UPDATE' then
    if old.reference_price is not distinct from new.reference_price
      and old.reference_year is not distinct from new.reference_year
      and old.unit is not distinct from new.unit
      and old.source is not distinct from new.source
      and old.effective_date is not distinct from new.effective_date
      and old.is_active is not distinct from new.is_active then
      return new;
    end if;
  end if;

  insert into public.notifications(user_id, type, title, message, link)
  select id, 'market_price', 'Admin updated the market reference',
    new.commodity_label || ': ' || to_char(new.reference_price, 'FM999999990.00')
      || '/' || new.unit || ' (' || replace(new.source, '_', ' ') || '). '
      || 'Farmer selling prices are unchanged.'
      || case when nullif(btrim(new.reason), '') is null then '' else ' Reason: ' || left(new.reason, 500) end,
    '/marketplace'
  from public.profiles
  where role in ('buyer','farmer','stakeholder') and account_status = 'active';
  return new;
end $$;

drop trigger if exists market_price_override_notification on public.market_price_overrides;
create trigger market_price_override_notification
after insert or update on public.market_price_overrides
for each row execute function public.notify_admin_market_price();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'market_price_overrides'
  ) then
    alter publication supabase_realtime add table public.market_price_overrides;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'commodity_catalog'
  ) then
    alter publication supabase_realtime add table public.commodity_catalog;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'units'
  ) then
    alter publication supabase_realtime add table public.units;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
