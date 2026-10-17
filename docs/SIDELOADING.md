# Install RIVL on iPhone

[Download the native app](https://github.com/OjayitTanwar/rivl/releases/tag/v1.0.0-sideload.20261017) · [Watch the installation video](https://github.com/OjayitTanwar/rivl/releases/download/v1.0.0-sideload.20261017/RIVL-installation.mp4) · [Open the installation page](https://ojayittanwar.github.io/rivl/)

The downloadable **RIVL.ipa** is a standalone native iPhone app: it runs without Metro or a running computer. It requires iOS 16 or newer and must be signed with your own Apple account. This preview is iPhone-only; the Watch companion remains available in the source.

## First installation

1. **Back up first.** If RIVL is already installed, export your workouts. Keep the existing installation until a transfer has been verified. Different signing or keychain access can affect encrypted data even if the app container survives.
2. **Prepare SideStore.** Follow the official [prerequisites](https://docs.sidestore.io/docs/installation/prerequisites) and [installation guide](https://docs.sidestore.io/docs/installation/install). You need an iPhone, USB cable, Mac/Windows/Linux computer, Wi-Fi and your own Apple account. Install the official iLoader and required LocalDevVPN helper. The helper may use an App Store download; RIVL itself is distributed here.
3. **Install SideStore Stable.** Connect and unlock your phone, trust the computer, and use iLoader's “Install SideStore (Stable)” option. Complete Apple sign-in and verification yourself. Follow the official guide for trusting the developer app, Developer Mode and any restart.
4. **Finish SideStore setup.** Connect LocalDevVPN, open SideStore, and sign in with the same Apple account. With Wi-Fi and the VPN connected, refresh SideStore once from My Apps before adding RIVL.
5. **Download [RIVL.ipa](https://github.com/OjayitTanwar/rivl/releases/download/v1.0.0-sideload.20261017/RIVL.ipa)** to Files on your iPhone. In SideStore, choose **My Apps → +**, select the downloaded IPA, and wait for signing and installation to finish. If the browser only previews the file, use Share → Save to Files.
6. **Open RIVL**, sign in and choose the permissions you need. Check Health access and a short GPS recording before relying on the newly signed installation for a workout.

Already using SideStore? The [installation page](https://ojayittanwar.github.io/rivl/) includes an **Open in SideStore** button and an optional update source. These links require SideStore to be installed; the file import above remains the fallback.

## Keep it working

- Free Apple provisioning expires after **seven days**. Refresh **both RIVL and SideStore before their counters expire**, using Wi-Fi and LocalDevVPN. Check the counters; background refresh is not guaranteed.
- Free accounts allow **three installed apps including SideStore**, and **ten App IDs per week**. Remove/deactivate unused apps through SideStore if necessary. App extensions can consume additional IDs; this package excludes the Watch app.
- If an app expires, return to the official SideStore recovery guide. iOS updates or pairing failures may require your computer again. Do not delete RIVL as a first troubleshooting step.
- An Apple signing/entitlement error is different from a RIVL login error. Fix signing in SideStore first; for account confirmation use the email sent by RIVL and check spam.

## Download verification

This release's IPA is **16,620,327 bytes**. Its SHA-256 is:

```text
b9547458a892a02b341235be11bca8c9136dbe77881baf0769cd4cf55c12e4ca
```

[SHA256SUMS.txt](https://github.com/OjayitTanwar/rivl/releases/download/v1.0.0-sideload.20261017/SHA256SUMS.txt) and [release metadata](https://github.com/OjayitTanwar/rivl/releases/download/v1.0.0-sideload.20261017/release-metadata.json) accompany the download. The checksum verifies this file, not Apple's signing approval. The package has a sanitized ad-hoc signature so re-signers can read its requested HealthKit capabilities; it is not directly installable until your account signs it. Personal profiles, signing identities and the Watch bundle are excluded. No admin backend credential is included.

## Preview limits

The original Release build has been installed and opened on the development phone. **Installing this public IPA through SideStore, encrypted data migration, HealthKit and locked-screen GPS after recipient re-signing have not yet been validated.** The video is a narrated illustrated guide, not a recording of a completed SideStore installation. Use the official instructions if setup screens change. The repository and native build instructions remain available in [INSTALL.md](INSTALL.md).

Checked against [Apple account documentation](https://developer.apple.com/help/account/basics/about-your-developer-account), [SideStore installation](https://docs.sidestore.io/docs/installation/install), [FAQ](https://docs.sidestore.io/docs/faq) and [URL schema](https://docs.sidestore.io/docs/advanced/url-schema) on 17 October 2026.
