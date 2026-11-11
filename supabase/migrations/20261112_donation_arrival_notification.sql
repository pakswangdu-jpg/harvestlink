begin;

alter table public.donations
  add column if not exists arrival_notified_at timestamptz;

alter table public.donation_claims
  add column if not exists arrival_notified_at timestamptz;

notify pgrst, 'reload schema';
commit;
