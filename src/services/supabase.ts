import { createClient } from "@supabase/supabase-js";
import { authStorage } from "../security/auth-storage";
import { apiFetch } from "../security/transport";
import { config, backendConfigured } from "./config";
import { AppFailure } from "../security/errors";
export let configurationError: AppFailure | null = null;
function configuredClient() {
  if (!backendConfigured) {
    if (config.supabaseUrl || config.supabaseKey)
      configurationError = new AppFailure(
        "validation",
        "RIVL’s cloud configuration is incomplete. Install a correctly configured build.",
      );
    return null;
  }
  try {
    return createClient(config.supabaseUrl, config.supabaseKey, {
      global: { fetch: apiFetch(config.supabaseUrl) },
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  } catch {
    configurationError = new AppFailure(
      "validation",
      "RIVL’s cloud configuration is invalid. Install a correctly configured build.",
    );
    return null;
  }
}
export const supabase = configuredClient();
