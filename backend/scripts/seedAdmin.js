// One-off, idempotent admin bootstrap — replaces the old hardcoded
// admin@harvestlink.com / admin plaintext login with a real Supabase Auth user.
//
// Usage (run once, locally, against the target Supabase project):
//   ADMIN_EMAIL=admin@harvestlink.com ADMIN_PASSWORD=<a-strong-password> \
//     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:admin
//
// Never commit the real admin password anywhere.

import 'dotenv/config';
import { supabaseAdmin } from '../src/lib/supabaseClient.js';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD before running this script.');
  process.exit(1);
}

const { data: existing } = await supabaseAdmin.from('profiles').select('id').eq('email', email).maybeSingle();
if (existing) {
  console.log(`Admin profile for ${email} already exists (id: ${existing.id}) — nothing to do.`);
  process.exit(0);
}

const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createError) {
  console.error('Failed to create the admin auth user:', createError.message);
  process.exit(1);
}

const { error: profileError } = await supabaseAdmin.from('profiles').insert({
  id: created.user.id,
  email,
  role: 'admin',
  name: 'HarvestLink Admin',
  account_status: 'active',
});
if (profileError) {
  console.error('Auth user was created, but the profiles row failed:', profileError.message);
  process.exit(1);
}

console.log(`Admin account ready: ${email} (id: ${created.user.id}).`);
