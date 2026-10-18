import { createAdminLoginClient, supabase } from '../lib/supabaseClient';
import { apiClient } from './apiClient';

function adminOnlyError() {
  return new Error('Admin sign-in is restricted to active administrator accounts.');
}

export async function loginAdmin(emailValue, password) {
  const client = createAdminLoginClient();
  let accepted = false;
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: emailValue.trim().toLowerCase(), password,
    });
    if (error) throw new Error('Invalid admin email or password.');
    const session = data?.session;
    if (!session?.access_token || !session.refresh_token || !session.user?.id) {
      throw new Error('Unable to verify Admin sign-in. Please try again.');
    }

    // Authorize the temporary session before storing or broadcasting any login.
    const options = { accessToken: session.access_token };
    const access = await apiClient.get('/auth/admin-access', options);
    if (access?.allowed !== true) throw new Error('Unable to verify Admin access. Please try again.');
    const profile = await apiClient.get('/profiles/me', options);
    if (profile?.role !== 'admin' || profile.accountStatus !== 'active' || profile.id !== session.user.id) {
      throw adminOnlyError();
    }

    const { data: saved, error: sessionError } = await supabase.auth.setSession({
      access_token: session.access_token, refresh_token: session.refresh_token,
    });
    if (sessionError || saved?.session?.user?.id !== profile.id) {
      throw new Error('Unable to complete Admin sign-in. Please try again.');
    }
    accepted = true;
    return profile;
  } catch (error) {
    if (error.status === 403 && error.code !== 'ADMIN_NETWORK_NOT_ALLOWED') throw adminOnlyError();
    throw error;
  } finally {
    if (!accepted) await client?.auth?.signOut?.({ scope: 'local' })?.catch?.(() => {});
    await client?.auth?.dispose?.()?.catch?.(() => {});
  }
}
