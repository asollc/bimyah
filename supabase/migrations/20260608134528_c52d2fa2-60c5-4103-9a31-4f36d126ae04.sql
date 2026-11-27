CREATE POLICY "Admins upload decor defaults"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'public-assets'
  AND (storage.foldername(name))[1] = 'decor-defaults'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins update decor defaults"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'public-assets'
  AND (storage.foldername(name))[1] = 'decor-defaults'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins delete decor defaults"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'public-assets'
  AND (storage.foldername(name))[1] = 'decor-defaults'
  AND public.has_role(auth.uid(), 'admin')
);