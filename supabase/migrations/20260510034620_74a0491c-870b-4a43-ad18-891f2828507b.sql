CREATE OR REPLACE FUNCTION public.lock_profile_display_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    IF auth.role() = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Display name is locked and cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;