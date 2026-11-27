-- Preserve all existing product records and transaction history:
-- if a farmer already has multiple active listings with the exact same normalized
-- (name, grade, sales type, unit, expiration_date), keep the newest active listing
-- and mark older duplicates inactive before creating the partial unique index.

with ranked_active_duplicates as (
  select
    id,
    row_number() over (
      partition by
        farmer_id,
        lower(regexp_replace(trim(name), '\s+', ' ', 'g')),
        lower(trim(coalesce(grade, 'A'))),
        lower(trim(coalesce(selling_type, 'retail'))),
        lower(trim(unit)),
        coalesce(expiration_date, date '0001-01-01')
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.products
  where status = 'active'
)
update public.products p
set status = 'inactive',
    updated_at = now()
from ranked_active_duplicates r
where p.id = r.id
  and r.rn > 1;

-- Prevent future duplicate active product listings per farmer with identical
-- normalized product name, grade, sales type, unit, and expiration date.
create unique index if not exists products_farmer_active_duplicate_uidx
on public.products (
  farmer_id,
  lower(regexp_replace(trim(name), '\s+', ' ', 'g')),
  lower(trim(coalesce(grade, 'A'))),
  lower(trim(coalesce(selling_type, 'retail'))),
  lower(trim(unit)),
  coalesce(expiration_date, date '0001-01-01')
)
where status = 'active';

notify pgrst, 'reload schema';
