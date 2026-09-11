import { createClient } from '@supabase/supabase-js';

// This is the browser-safe Supabase publishable key for the IJ Langa project.
// Keep privileged service-role keys out of the frontend.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pyhcmceyhrulkwzedwgf.supabase.co';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_INoEkMWhNEbysI8f7OLz9w_99Ohyyeg';

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
