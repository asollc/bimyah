
CREATE POLICY "Admins upload bmart product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'public-assets'
    AND (storage.foldername(name))[1] = 'bmart'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins update bmart product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'public-assets'
    AND (storage.foldername(name))[1] = 'bmart'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins delete bmart product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'public-assets'
    AND (storage.foldername(name))[1] = 'bmart'
    AND public.has_role(auth.uid(), 'admin')
  );
