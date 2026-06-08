DROP POLICY IF EXISTS "Users update own friendships" ON public.friendships;

CREATE POLICY "Addressee accepts pending request"
ON public.friendships
FOR UPDATE
TO authenticated
USING (auth.uid() = addressee_id AND status = 'pending')
WITH CHECK (auth.uid() = addressee_id AND status = 'accepted');