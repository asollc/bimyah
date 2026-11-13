-- Bmart purge tombstones (Ronya 2026-11-09): deleting a product in
-- the Bmart admin now purges it from the game globally instead of
-- hiding it. Custom products lose their bmart_products row outright,
-- but built-in products are defined in code, so a deleted built-in
-- needs a tombstone row here: the shop merge and the bots skip any
-- product id listed in this table, and re-adding the id in the admin
-- (Save on a fresh product with the same id) clears the tombstone.
-- New public table, so explicit grants are included per the
-- 2026-10-30 grants rule.
CREATE TABLE IF NOT EXISTS public.bmart_purged_items (
  id text PRIMARY KEY,
  purged_at timestamptz NOT NULL DEFAULT now(),
  purged_by uuid
);

GRANT SELECT ON public.bmart_purged_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bmart_purged_items TO service_role;

ALTER TABLE public.bmart_purged_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read purged items" ON public.bmart_purged_items;
CREATE POLICY "Anyone can read purged items"
  ON public.bmart_purged_items FOR SELECT
  USING (true);
