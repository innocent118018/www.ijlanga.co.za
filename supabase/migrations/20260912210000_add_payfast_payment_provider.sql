ALTER TABLE public.payments
  ALTER COLUMN provider SET DEFAULT 'ikhokha';

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_provider_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_provider_check
  CHECK (provider IN ('ikhokha', 'payfast'));
