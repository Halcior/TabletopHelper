import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim()
// Private rosters use an independent SDK client. Multiplayer keeps its own
// capability headers and never receives this client's user access token.
function configuredClient() {
  if (!url || !key) return null
  try {
    return createClient(url, key, {
      auth: {
        storageKey: 'tabletophelper-account',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  } catch {
    // A malformed deployment setting must not disable the guest library.
    return null
  }
}
export const accountClient = configuredClient()

export const authRedirect = () => `${window.location.origin}/account`
