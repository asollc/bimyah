
CREATE TABLE IF NOT EXISTS public.user_keybinds (
  user_id uuid PRIMARY KEY,
  bindings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_keybinds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own keybinds"
  ON public.user_keybinds FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own keybinds"
  ON public.user_keybinds FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own keybinds"
  ON public.user_keybinds FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own keybinds"
  ON public.user_keybinds FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
