# Install RIVL without the App Store

Checked 17 October 2026 against Apple and SideStore documentation.

## Recommended free route: SideStore

SideStore installs an IPA using each person's own free Apple account. A computer is needed for initial setup; subsequent signing refreshes can happen on the iPhone. Free Apple provisioning still expires after seven days. SideStore attempts periodic background refreshes, but check the countdown and refresh before expiry rather than assuming it always succeeds. Free accounts allow three installed apps including SideStore and ten App IDs per week.

1. Follow [SideStore's prerequisites](https://docs.sidestore.io/docs/installation/prerequisites) and [installation guide](https://docs.sidestore.io/docs/installation/install), using its official stable installer.
2. Complete Apple sign-in and verification yourself. Enable Developer Mode/trust only as directed by the official setup. Set up the required local VPN and refresh SideStore itself once before adding apps.
3. Import a current RIVL IPA into SideStore. Each recipient must re-sign it with their own Apple account; another person's development signature is not a universal installer.
4. Refresh RIVL and SideStore before their seven-day counters expire. Keep the required local VPN available during refresh. iOS updates, resets or pairing problems can require a computer again.

RIVL's current installed build runs without Metro or a running Mac. It is already installed through free development signing; SideStore is a proposed way to manage renewal, not a claim that migration to SideStore has been tested.

## Preserve the existing RIVL data

Do not delete the installed app to switch installers. Export your workouts first. Keep the same signing account and bundle identifier where supported. Different signing/keychain access can make encrypted local data inaccessible even when the app container survives; verify restoration before relying on a transfer. HealthKit, background recording, Watch companion and all required entitlements need device validation after re-signing. Keep the current working installation until those checks pass.

## Sharing with other people

A downloadable IPA plus installation guide can support a small sideloading pilot. Each person completes SideStore setup and Apple signing. A public unsigned IPA should exclude personal provisioning profiles and signing material. A hosted download/source feed simplifies updates but does not remove Apple's signing limits.

A public RIVL IPA/feed has not been published by this documentation change. No SideStore installation, Apple-account sign-in, certificate revocation or app replacement was performed.

A web app can be hosted separately without iOS signing expiry, but it cannot be assumed to provide this native app's HealthKit, Watch, BLE and locked-screen recording behavior.

## Sources

- [Apple: free developer account and seven-day provisioning](https://developer.apple.com/help/account/basics/about-your-developer-account)
- [SideStore installation](https://docs.sidestore.io/docs/installation/install)
- [SideStore limits, refresh and transfer FAQ](https://docs.sidestore.io/docs/faq)
