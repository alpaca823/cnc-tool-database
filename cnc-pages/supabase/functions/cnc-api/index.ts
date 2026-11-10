import { createHandler } from './handler.mjs';
import { createDatabase } from './engine.mjs';
Deno.serve(createHandler({
  url: Deno.env.get('SUPABASE_URL'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  origins: Deno.env.get('CNC_ALLOWED_ORIGINS') || 'https://alpaca823.github.io',
}, { createDatabase }));
