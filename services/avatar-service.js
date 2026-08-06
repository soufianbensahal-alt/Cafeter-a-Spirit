import { getCurrentUser } from './auth-service.js';
import { requireSupabase } from './supabase-client.js';

export const AVATAR_BUCKET = 'spirit-avatars';

const avatarPath = (userId) => `${userId}/avatar.jpg`;

export function versionedAvatarUrl(avatarUrl, version) {
  const cleanUrl = String(avatarUrl || '').trim();
  if (!cleanUrl) return '';
  if (/^(blob:|data:)/i.test(cleanUrl)) return cleanUrl;
  const separator = cleanUrl.includes('?') ? '&' : '?';
  return `${cleanUrl}${separator}v=${encodeURIComponent(String(version || Date.now()))}`;
}

const requireCurrentUser = async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error('No existe una sesión activa.');
  return user;
};

const updateAvatarProfile = async (userId, avatarUrl) => {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId)
    .select('avatar_url, updated_at')
    .single();
  if (error) throw error;
  return data;
};

export async function uploadOwnAvatar(imageBlob) {
  if (!(imageBlob instanceof Blob) || imageBlob.type !== 'image/jpeg') {
    throw new Error('La imagen procesada no es un JPEG válido.');
  }

  const user = await requireCurrentUser();
  const supabase = requireSupabase();
  const path = avatarPath(user.id);
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, imageBlob, {
      cacheControl: '31536000',
      contentType: 'image/jpeg',
      upsert: true
    });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const publicUrl = String(publicUrlData?.publicUrl || '').trim();
  if (!publicUrl) throw new Error('Supabase Storage no ha devuelto una URL pública para el avatar.');

  return updateAvatarProfile(user.id, publicUrl);
}

export async function removeOwnAvatar() {
  const user = await requireCurrentUser();
  const supabase = requireSupabase();
  const profile = await updateAvatarProfile(user.id, null);
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .remove([avatarPath(user.id)]);
  if (error && error.statusCode !== '404') {
    console.warn('No se ha podido eliminar el objeto antiguo del avatar.', error);
  }
  return profile;
}
