// One place for names and keys, so the brand (a working name for now) can be changed in a single edit.
export const CONFIG = {
  BRAND: 'LEDGER',
  // App version shown on the intro screen and in Settings. Bump together with VERSION in sw.js on every push.
  VERSION: '2.0.42',
  // Testing aid: show the version on the intro screen. Set to false at launch (Settings keeps showing it).
  SHOW_VERSION_ON_INTRO: true,
  BUILT: '2026-11-19 20:24',
  SUPABASE_URL: 'https://wpakjtlyfxwnrsuxkyjv.supabase.co',
  // Publishable (public) key. Data is protected by sign-in and row-level security, not by hiding this key.
  SUPABASE_KEY: 'sb_publishable_kw1ZI6jTAnvQqKGUUYIZVA_v7jRZjfl',
  // Same storage key as the current site, so the sign-in carries over when this version replaces it.
  AUTH_STORAGE_KEY: 'ledger.auth',
  TIME_ZONE: 'Asia/Seoul'
};
