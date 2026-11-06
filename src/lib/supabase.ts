import { createClient } from '@supabase/supabase-js';

const configuredUrl = (import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined;
const configuredKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) as string | undefined;
const url = configuredUrl?.startsWith('http://') || configuredUrl?.startsWith('https://') ? configuredUrl : undefined;
const publishableKey = configuredKey?.startsWith('sb_') || configuredKey?.startsWith('eyJ') ? configuredKey : undefined;

export const supabaseConfig = {
  configured: Boolean(url && publishableKey),
  url,
  publishableKey,
};

export const supabase = url && publishableKey
  ? createClient(url, publishableKey)
  : null;
