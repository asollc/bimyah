-- Bulletins table
CREATE TABLE public.bulletins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID NOT NULL,
  title TEXT NOT NULL,
  content_html TEXT NOT NULL,
  media_url TEXT,
  delivery TEXT NOT NULL DEFAULT 'bulletin', -- 'bulletin' | 'push' | 'both'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bulletins_created_at ON public.bulletins (created_at DESC);

ALTER TABLE public.bulletins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read bulletins"
  ON public.bulletins FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage bulletins"
  ON public.bulletins FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_bulletins_updated_at
  BEFORE UPDATE ON public.bulletins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Read receipts
CREATE TABLE public.bulletin_reads (
  bulletin_id UUID NOT NULL REFERENCES public.bulletins(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bulletin_id, user_id)
);
ALTER TABLE public.bulletin_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own reads"
  ON public.bulletin_reads FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Per-user hides (soft delete from user view)
CREATE TABLE public.bulletin_hides (
  bulletin_id UUID NOT NULL REFERENCES public.bulletins(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bulletin_id, user_id)
);
ALTER TABLE public.bulletin_hides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own hides"
  ON public.bulletin_hides FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Web push subscriptions
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions (user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own push subs"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('bulletin-media', 'bulletin-media', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Bulletin media public read"
  ON storage.objects FOR SELECT USING (bucket_id = 'bulletin-media');

CREATE POLICY "Admins upload bulletin media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bulletin-media' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update bulletin media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'bulletin-media' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete bulletin media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bulletin-media' AND public.has_role(auth.uid(), 'admin'));