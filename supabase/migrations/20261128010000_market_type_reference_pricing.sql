begin;

-- Separate Retail and Wholesale admin reference prices without modifying
-- or reclassifying existing legacy records whose market basis is unknown.
alter table public.market_price_overrides
  add column if not exists market_type text;

alter table public.market_price_overrides
  drop constraint if exists market_price_overrides_market_type_check;
alter table public.market_price_overrides
  add constraint market_price_overrides_market_type_check
  check (market_type is null or market_type in ('retail', 'wholesale'));

-- Replace the single-commodity unique constraint so the same commodity can
-- maintain independent active Retail and Wholesale reference prices.
alter table public.market_price_overrides
  drop constraint if exists market_price_overrides_commodity_id_key;

create unique index if not exists market_price_overrides_commodity_market_type_uidx
  on public.market_price_overrides (commodity_id, market_type)
  where market_type is not null;

create unique index if not exists market_price_overrides_active_scope_uidx
  on public.market_price_overrides (
    commodity_id,
    market_type,
    lower(btrim(unit)),
    coalesce(lower(btrim(supporting_reference)), '')
  )
  where is_active and market_type is not null;

-- Preserve historical records without forcing a Retail classification.
alter table public.market_price_override_history
  add column if not exists market_type text;

alter table public.market_price_override_history
  drop constraint if exists market_price_override_history_market_type_check;
alter table public.market_price_override_history
  add constraint market_price_override_history_market_type_check
  check (market_type is null or market_type in ('retail', 'wholesale'));

create index if not exists market_price_override_history_commodity_market_idx
  on public.market_price_override_history (commodity_id, market_type, created_at desc);

drop function if exists public.set_market_price_override(
  text, text, numeric, integer, numeric, text, text, date, text, text, uuid, text
);

create or replace function public.set_market_price_override(
  p_commodity_id text,
  p_commodity_label text,
  p_market_type text,
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
  normalized_market_type text := lower(btrim(coalesce(p_market_type, '')));
  previous public.market_price_overrides%rowtype;
  saved public.market_price_overrides%rowtype;
begin
  if normalized_market_type not in ('retail', 'wholesale') then
    raise exception 'Market type must be retail or wholesale.';
  end if;

  select * into previous
  from public.market_price_overrides
  where commodity_id = p_commodity_id
    and market_type = normalized_market_type
  for update;

  insert into public.market_price_overrides (
    commodity_id, commodity_label, market_type, reference_price, reference_year, baseline_price,
    unit, source, effective_date, supporting_reference, is_active, reason,
    updated_by, updated_by_name, updated_at
  ) values (
    p_commodity_id, p_commodity_label, normalized_market_type, p_reference_price, p_reference_year, p_baseline_price,
    p_unit, p_source, p_effective_date, p_supporting_reference, true, p_reason,
    p_updated_by, p_updated_by_name, now()
  )
  on conflict (commodity_id, market_type) where market_type is not null do update set
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
    commodity_id, commodity_label, market_type, previous_price, new_price, reason,
    updated_by, updated_by_name, previous_unit, new_unit, previous_source,
    new_source, effective_date, supporting_reference
  ) values (
    p_commodity_id, p_commodity_label, normalized_market_type,
    previous.reference_price, p_reference_price, p_reason,
    p_updated_by, p_updated_by_name, previous.unit, p_unit, previous.source,
    p_source, p_effective_date, p_supporting_reference
  );

  return saved;
end;
$$;

revoke all on function public.set_market_price_override(
  text, text, text, numeric, integer, numeric, text, text, date, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.set_market_price_override(
  text, text, text, numeric, integer, numeric, text, text, date, text, text, uuid, text
) to service_role;

drop function if exists public.clear_market_price_override(text, uuid, text);

create or replace function public.clear_market_price_override(
  p_commodity_id text,
  p_market_type text,
  p_updated_by uuid,
  p_updated_by_name text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_market_type text := lower(btrim(coalesce(p_market_type, '')));
  previous public.market_price_overrides%rowtype;
begin
  if normalized_market_type not in ('retail', 'wholesale') then
    raise exception 'Market type must be retail or wholesale.';
  end if;

  select * into previous
  from public.market_price_overrides
  where commodity_id = p_commodity_id
    and market_type = normalized_market_type
    and is_active
  for update;

  if not found then return; end if;

  update public.market_price_overrides
  set is_active = false, updated_at = now()
  where id = previous.id;

  insert into public.market_price_override_history (
    commodity_id, commodity_label, market_type, previous_price, new_price, reason,
    updated_by, updated_by_name, previous_unit, previous_source, effective_date,
    supporting_reference
  ) values (
    previous.commodity_id, previous.commodity_label, normalized_market_type,
    previous.reference_price, null,
    'Deactivated ' || normalized_market_type || ' reference price.',
    p_updated_by, p_updated_by_name,
    previous.unit, previous.source, previous.effective_date, previous.supporting_reference
  );
end;
$$;

revoke all on function public.clear_market_price_override(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.clear_market_price_override(text, text, uuid, text) to service_role;

create or replace function public.notify_admin_market_price()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  market_label text := case new.market_type
    when 'wholesale' then 'Wholesale'
    when 'retail' then 'Retail'
    else 'Market'
  end;
begin
  if not new.is_active then return new; end if;

  if tg_op = 'UPDATE' then
    if old.market_type is not distinct from new.market_type
      and old.reference_price is not distinct from new.reference_price
      and old.reference_year is not distinct from new.reference_year
      and old.unit is not distinct from new.unit
      and old.source is not distinct from new.source
      and old.effective_date is not distinct from new.effective_date
      and old.is_active is not distinct from new.is_active then
      return new;
    end if;
  end if;

  insert into public.notifications(user_id, type, title, message, link)
  select id, 'market_price', 'Admin updated the ' || lower(market_label) || ' market reference',
    new.commodity_label || ' (' || market_label || '): ' || to_char(new.reference_price, 'FM999999990.00')
      || '/' || new.unit || ' (' || replace(new.source, '_', ' ') || '). '
      || 'Farmer selling prices are unchanged.'
      || case when nullif(btrim(new.reason), '') is null then '' else ' Reason: ' || left(new.reason, 500) end,
    '/marketplace'
  from public.profiles
  where role in ('buyer','farmer','stakeholder') and account_status = 'active';
  return new;
end $$;

notify pgrst, 'reload schema';
commit;
