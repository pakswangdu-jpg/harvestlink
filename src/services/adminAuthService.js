import { supabase } from '../lib/supabaseClient';
import { apiClient } from './apiClient';

function adminOnlyError() {
  return Object.assign(new Error('Admin sign-in is restricted to active administrator accounts.'), { code: 'ADMIN_ONLY' });
}

export async function loginAdmin(emailValue, password, captchaToken) {
  let sessionStored = false;
  try {
    const result = await apiClient.post('/auth/admin-login', {
      email: emailValue.trim().toLowerCase(), password, captchaToken,
    });
    const session = result?.session;
    if (!session?.access_token || !session.refresh_token) {
      throw new Error('Unable to verify Admin sign-in. Please try again.', { cause: new Error('Backend returned an incomplete session.') });
    }

    const { data: saved, error: sessionError } = await supabase.auth.setSession(session);
    if (sessionError || !saved?.session?.user?.id) {
      throw new Error('Unable to complete Admin sign-in. Please try again.', { cause: sessionError || new Error('Supabase did not persist the session.') });
    }
    sessionStored = true;

    const options = { accessToken: session.access_token };
    const access = await apiClient.get('/auth/admin-access', options);
    if (access?.allowed !== true) throw new Error('Unable to verify Admin access. Please try again.');
    const profile = await apiClient.get('/profiles/me', options);
    if (profile?.role !== 'admin' || profile.accountStatus !== 'active' || profile.id !== saved.session.user.id) {
      throw adminOnlyError();
    }
    return profile;
  } catch (error) {
    if (sessionStored) {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw new Error('Unable to clear the temporary Admin session. Please reload and try again.', { cause: error });
    }
    if (error.code === 'ADMIN_ONLY') throw error;
    if (error.status === 403 && error.code !== 'ADMIN_NETWORK_NOT_ALLOWED') throw adminOnlyError(error);
    if (error.status === 401 && error.code === 'INVALID_CREDENTIALS') {
      throw new Error('Invalid admin email or password.', { cause: error });
    }
    if (error.status === 401 && error.code === 'email_not_confirmed') {
      throw new Error('Email not confirmed', { cause: error });
    }
    throw error;
  }
}
