CREATE TABLE "public"."accounting_reconciliation_items" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "reconciliation_id" uuid                     NOT NULL,
  "transaction_id"    uuid,
  "statement_date"    date,
  "description"       text                     NOT NULL DEFAULT ''::text,
  "amount"            numeric(14,2)            NOT NULL,
  "matched"           boolean                  NOT NULL DEFAULT false,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "accounting_reconciliation_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "accounting_reconciliation_items_transaction_id_fkey" FOREIGN KEY (transaction_id) REFERENCES public.accounting_import_transactions(id) ON DELETE SET NULL,
  CONSTRAINT "accounting_reconciliation_items_reconciliation_id_fkey" FOREIGN KEY (reconciliation_id) REFERENCES public.accounting_reconciliations(id) ON DELETE CASCADE
);

ALTER TABLE "public"."accounting_reconciliation_items"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_reconciliation_items_read_via_reconciliation" ON "public"."accounting_reconciliation_items"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.accounting_reconciliations r
  WHERE ((r.id = accounting_reconciliation_items.reconciliation_id) AND ((r.customer_id = public.current_customer_id()) OR public.is_admin())))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."accounting_reconciliation_items"
  TO "anon", "authenticated", "postgres", "service_role";
