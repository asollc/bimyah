CREATE TABLE public.share_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  method text NOT NULL CHECK (method IN ('web_share','clipboard')),
  source text NOT NULL DEFAULT 'home',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX share_events_created_at_idx ON public.share_events (created_at DESC);
CREATE INDEX share_events_user_id_idx ON public.share_events (user_id);

ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record share events"
  ON public.share_events
  FOR INSERT
  TO public
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Admins can view share events"
  ON public.share_events
  FOR SELECT
  TO public
  USING (public.has_role(auth.uid(), 'admin'));
