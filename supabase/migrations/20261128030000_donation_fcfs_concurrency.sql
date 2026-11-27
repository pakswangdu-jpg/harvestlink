begin;

-- Enforce non-negative remaining stock at the database constraint level.
alter table public.donations
  drop constraint if exists donations_available_quantity_non_negative;
alter table public.donations
  add constraint donations_available_quantity_non_negative
  check (available_quantity >= 0);

-- Support idempotent claim retries so network retries or repeated clicks
-- cannot create duplicate claims or deduct stock twice.
alter table public.donation_claims
  add column if not exists claim_key text;

create unique index if not exists donation_claims_stakeholder_claim_key_uidx
  on public.donation_claims (stakeholder_id, claim_key)
  where claim_key is not null;

-- Prevent a stakeholder from holding multiple concurrent active claims on the same donation.
create unique index if not exists donation_claims_active_per_stakeholder_uidx
  on public.donation_claims (donation_id, stakeholder_id)
  where status in ('pending', 'scheduled');

drop function if exists public.claim_surplus_donation(uuid, uuid, numeric);
drop function if exists public.claim_surplus_donation(uuid, uuid, numeric, text);

create or replace function public.claim_surplus_donation(
  actor_id uuid,
  target_donation_id uuid,
  requested_quantity numeric,
  p_claim_key text default null
)
returns public.donation_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles;
  donation public.donations;
  existing_claim public.donation_claims;
  claim public.donation_claims;
  normalized_key text := nullif(btrim(coalesce(p_claim_key, '')), '');
  updated_rows integer := 0;
begin
  perform public.expire_donations();

  select * into actor from public.profiles where id = actor_id for share;
  if not found or actor.role <> 'stakeholder' or actor.account_status <> 'active'
    or actor.verification_status is distinct from 'verified' then
    raise exception 'Your active, verified organization is required to claim donations.' using errcode = '42501';
  end if;

  if requested_quantity is null or requested_quantity <= 0 or requested_quantity = 'NaN'::numeric
    or requested_quantity <> round(requested_quantity, 2) then
    raise exception 'Enter a positive donation quantity.' using errcode = '22007';
  end if;

  -- Idempotent replay protection for network retries / double clicks.
  if normalized_key is not null then
    select * into existing_claim
    from public.donation_claims
    where stakeholder_id = actor_id and claim_key = normalized_key;
    if found then
      if existing_claim.donation_id = target_donation_id and existing_claim.quantity = requested_quantity then
        return existing_claim;
      end if;
      raise exception 'DUPLICATE_DONATION_CLAIM' using errcode = '23505';
    end if;
  end if;

  -- First-Come, First-Served row-level exclusive lock on the donation row.
  -- Concurrent transactions block here until the first transaction commits or rolls back.
  select * into donation
  from public.donations
  where id = target_donation_id
  for update;

  if not found then
    raise exception 'Donation was not found.' using errcode = 'P0002';
  end if;

  if donation.expiration_at is not null and donation.expiration_at <= now() then
    raise exception 'DONATION_EXPIRED' using errcode = '23514';
  end if;

  if donation.status <> 'available' or coalesce(donation.available_quantity, 0) <= 0 then
    raise exception 'DONATION_NO_LONGER_AVAILABLE' using errcode = '23514';
  end if;

  if requested_quantity > donation.available_quantity then
    raise exception 'INSUFFICIENT_DONATION_STOCK' using errcode = '23514';
  end if;

  if exists(
    select 1 from public.donation_claims
    where donation_id = donation.id
      and stakeholder_id = actor_id
      and status in ('pending', 'scheduled')
  ) then
    raise exception 'DUPLICATE_DONATION_CLAIM' using errcode = '23505';
  end if;

  -- Atomic conditional inventory deduction inside the same transaction.
  update public.donations
  set available_quantity = available_quantity - requested_quantity,
      claimed_quantity = claimed_quantity + requested_quantity,
      status = case when available_quantity - requested_quantity <= 0 then 'fully_claimed' else 'available' end,
      updated_at = now()
  where id = donation.id
    and status = 'available'
    and available_quantity >= requested_quantity;

  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    raise exception 'DONATION_NO_LONGER_AVAILABLE' using errcode = '23514';
  end if;

  insert into public.donation_claims(
    donation_id, stakeholder_id, stakeholder_name, quantity, pickup_status, claim_key
  )
  values(
    donation.id,
    actor.id,
    coalesce(nullif(actor.organization_name, ''), actor.name),
    requested_quantity,
    'requested',
    normalized_key
  )
  returning * into claim;

  -- Notify the farmer and the successful stakeholder atomically within the same transaction.
  insert into public.notifications(user_id, type, title, message, link)
  values
    (
      donation.farmer_id,
      'donation',
      'Donation claim received',
      claim.stakeholder_name || ' claimed ' || claim.quantity || ' ' || donation.unit || ' of ' || donation.product_name || '.',
      '/farmer-donations'
    ),
    (
      actor.id,
      'donation',
      'Donation Claimed Successfully',
      'Your donation claim for ' || claim.quantity || ' ' || donation.unit || ' of ' || donation.product_name || ' has been submitted. Please check your donation details for further instructions.',
      '/stakeholder-requests'
    );

  return claim;
end;
$$;

revoke all on function public.claim_surplus_donation(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.claim_surplus_donation(uuid, uuid, numeric, text) to service_role;

-- Ensure real-time inventory synchronization across connected stakeholder clients.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'donations'
  ) then
    alter publication supabase_realtime add table public.donations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'donation_claims'
  ) then
    alter publication supabase_realtime add table public.donation_claims;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
