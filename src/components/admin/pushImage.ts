import { supabase } from "@/integrations/supabase/client";

/* Shared push big-image upload (Creator Shout rules): image files only,
   2 MB max, stored in the public push-images bucket. Used by the admin
   Push tab and the bell's admin Send push form. */
export async function uploadPushImageFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Image must be under 2MB.");
  const ext =
    (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `push-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("push-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("push-images").getPublicUrl(path);
  return data.publicUrl;
}
