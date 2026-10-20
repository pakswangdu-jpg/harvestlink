begin;

-- Receipt metadata only: existing order, payment and delivery transitions are unchanged.
alter table public.orders add column if not exists completed_at timestamptz;

create table if not exists public.order_receipt_emails (
  order_id uuid primary key references public.orders(id),
  status text not null default 'pending' check (status in ('pending','sending','failed','sent','needs_review','skipped')),
  payload jsonb,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  locked_until timestamptz,
  claim_token uuid,
  sent_at timestamptz,
  provider_message_id text,
  last_error text
);
alter table public.order_receipt_emails enable row level security;
revoke all on public.order_receipt_emails from public, anon, authenticated;
grant select, insert, update on public.order_receipt_emails to service_role;
create index if not exists order_receipt_emails_pending_idx on public.order_receipt_emails(next_attempt_at)
  where status in ('pending','failed','sending');

create or replace function public.record_order_completion_time() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.completed_at is not null then
    new.completed_at := old.completed_at;
  elsif new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := now();
  else
    new.completed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists record_order_completion_time on public.orders;
create trigger record_order_completion_time before insert or update on public.orders
  for each row execute function public.record_order_completion_time();

create or replace function public.queue_final_order_receipt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and new.payment_status = 'paid'
    and ((new.delivery_method = 'buyer_pickup' and new.delivery_status = 'picked_up')
      or (new.delivery_method in ('farmer_delivery','courier') and new.delivery_status = 'delivered'))
    and (new.payment_method = 'cod' or (new.payment_method = 'gcash' and new.payment_verification_status = 'approved')) then
    insert into public.order_receipt_emails(order_id) values(new.id) on conflict(order_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists queue_final_order_receipt on public.orders;
create trigger queue_final_order_receipt after insert or update of status,payment_status,delivery_status,payment_verification_status on public.orders
  for each row execute function public.queue_final_order_receipt();

create or replace function public.claim_final_receipt_emails(p_limit integer default 10)
returns setof public.order_receipt_emails language plpgsql security definer set search_path = public as $$
begin
  -- Resend deduplicates for 24 hours. Ambiguous older attempts require review, never a blind resend.
  update public.order_receipt_emails set status = 'needs_review', last_error = 'retry_window_expired'
    where status in ('sending','failed') and (locked_until is null or locked_until < now())
      and (first_attempt_at < now() - interval '23 hours' or attempts >= 10);
  return query
    with candidates as (
      select order_id from public.order_receipt_emails
      where ((status in ('pending','failed') and next_attempt_at <= now())
        or (status = 'sending' and locked_until < now()))
        and attempts < 10 and (first_attempt_at is null or first_attempt_at >= now() - interval '23 hours')
      order by next_attempt_at limit greatest(1, least(coalesce(p_limit,10),20)) for update skip locked
    )
    update public.order_receipt_emails q set status = 'sending', attempts = q.attempts + 1,
      first_attempt_at = coalesce(q.first_attempt_at, now()), locked_until = now() + interval '5 minutes',
      claim_token = gen_random_uuid()
    from candidates c where q.order_id = c.order_id returning q.*;
end $$;

revoke all on function public.record_order_completion_time() from public, anon, authenticated;
revoke all on function public.queue_final_order_receipt() from public, anon, authenticated;
revoke all on function public.claim_final_receipt_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_final_receipt_emails(integer) to service_role;

-- Do not backfill: installing this migration must not email old completed orders.
notify pgrst, 'reload schema';
commit;
