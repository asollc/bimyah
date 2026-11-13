
-- 1. Unique case-insensitive index on display_name
CREATE UNIQUE INDEX IF NOT EXISTS profiles_display_name_lower_unique
  ON public.profiles (lower(display_name));

-- 2. Trigger to lock display_name once set (prevent updates that change it)
CREATE OR REPLACE FUNCTION public.lock_profile_display_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    -- Allow admins to change names if needed
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Display name is locked and cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_profile_display_name_trigger ON public.profiles;
CREATE TRIGGER lock_profile_display_name_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.lock_profile_display_name();

-- 3. Update handle_new_user to dedupe display_name on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_name text;
  candidate text;
  suffix int := 0;
BEGIN
  base_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data ->> 'name'), ''),
    split_part(NEW.email, '@', 1)
  );
  base_name := substring(base_name from 1 for 14);
  candidate := base_name;

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(display_name) = lower(candidate)) LOOP
    suffix := suffix + 1;
    candidate := substring(base_name from 1 for 14 - length(suffix::text)) || suffix::text;
    IF suffix > 9999 THEN
      candidate := base_name || substr(NEW.id::text, 1, 4);
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id, candidate, NEW.raw_user_meta_data ->> 'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;
