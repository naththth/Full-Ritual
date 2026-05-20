import { hasSupabase, supabase } from './supabase';

export async function uploadImageOrPreview({
  bucket,
  userId,
  file,
  prefix,
}: {
  bucket: 'avatars' | 'meals' | 'skin' | 'products';
  userId: string | null;
  file: File;
  prefix: string;
}) {
  if (!hasSupabase || !userId) return readFileAsDataUrl(file);

  const extension = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${prefix}-${Date.now()}.${extension}`;
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  });
  if (error) throw error;

  const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return publicUrl.publicUrl;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
}
