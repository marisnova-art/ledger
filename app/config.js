// One place for names and keys, so the brand (a working name for now) can be changed in a single edit.
export const CONFIG = {
  BRAND: 'LEDGER',
  SUPABASE_URL: 'https://wpakjtlyfxwnrsuxkyjv.supabase.co',
  // Publishable (public) key. Data is protected by sign-in and row-level security, not by hiding this key.
  SUPABASE_KEY: 'sb_publishable_kw1ZI6jTAnvQqKGUUYIZVA_v7jRZjfl',
  // Same storage key as the current site, so the sign-in carries over when this version replaces it.
  AUTH_STORAGE_KEY: 'ledger.auth',
  TIME_ZONE: 'Asia/Seoul'
};
