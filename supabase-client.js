// src/js/supabase-client.js
window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("Supabase client initialized!");