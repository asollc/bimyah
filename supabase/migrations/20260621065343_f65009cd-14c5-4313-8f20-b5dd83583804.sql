
CREATE TABLE public.how_to_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  youtube_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.how_to_videos TO anon;
GRANT SELECT ON public.how_to_videos TO authenticated;
GRANT ALL ON public.how_to_videos TO service_role;

ALTER TABLE public.how_to_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view how-to videos"
  ON public.how_to_videos FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage how-to videos"
  ON public.how_to_videos FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_how_to_videos_updated_at
  BEFORE UPDATE ON public.how_to_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX how_to_videos_order_idx ON public.how_to_videos (sort_order, created_at DESC);
