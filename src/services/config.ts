export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.startsWith("pk.")
    ? process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN
    : "",
  mapStyle: process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? "",
  googleMapsKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  googleMapsBaseUrl:
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_BASE_URL ?? "https://rivl.app/",
  googleSignInEnabled: process.env.EXPO_PUBLIC_GOOGLE_SIGNIN_ENABLED === "true",
  appleSignInEnabled: process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED === "true",
  demoEnabled: false,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
};
export const backendConfigured = !!config.supabaseUrl && !!config.supabaseKey;
