<p align="center"><img src="docs/artwork/rivl-banner.svg" alt="RIVL — Move. Recover. Repeat." width="100%" /></p>

<p align="center"><strong>One app for your activity, health, nutrition and training.</strong><br />Native iOS &amp; Android · Open source · Built with Expo and React Native</p>

<p align="center"><a href="docs/INSTALL.md">Install</a> · <a href="docs/HOSTED-BACKEND.md">Hosted backend</a> · <a href="docs/REMAINING.md">What’s next</a> · <a href="docs/CREATOR-TRAINING.md">Creator training</a></p>

## Install on iPhone

**[Open the installation page](https://ojayittanwar.github.io/rivl/) · [Download the native app](https://github.com/OjayitTanwar/rivl/releases/tag/v1.0.0-sideload.20261017) · [Watch the installation video](https://github.com/OjayitTanwar/rivl/releases/download/v1.0.0-sideload.20261017/RIVL-installation.mp4)**

Native iPhone preview, iOS 16+. Use SideStore with your own free Apple account; initial setup needs a computer, and signing needs renewal within seven days. [Full guide and preview limits](docs/SIDELOADING.md). Watch companion is excluded from the download.

## A connected routine

**Activity** — record runs, rides, walks and hikes; review routes, splits and measured effort.

**Health** — movement, sleep, hydration and recorded heart-rate peaks, with supported Apple Health / Health Connect imports.

**Nutrition** — a food diary, gram-based recipes, targets, weekly meal planning and grocery quantities.

**Training** — interval sessions, history and creator-authored programs with attributed JSON sharing.

Each workspace has its own bottom bar and a RIVL action to return to the main app. They share your account and recording engine.

## Get it on your phone

Download the source ZIP from **Releases**, then follow the [installation guide](docs/INSTALL.md). On a Mac with Xcode, Node.js and CocoaPods, configure `.env`, connect your iPhone and run:

```sh
bash scripts/install-iphone.sh
```

The helper builds a standalone Release using your Apple signing setup. The installed app runs without your Mac. Free provisioning expires and needs refreshing. This is a **source preview**, not an App Store/TestFlight release or a universal signed IPA. Android installation is documented for developers; a verified APK is not included yet.

## Online when your computer is off

Login and community use hosted Supabase. Your computer only builds the app; it does not host your friends’ data. Follow the [hosted backend guide](docs/HOSTED-BACKEND.md) to configure the database, Auth, private storage and workers.

The design targets free hosted allowances. No provider can promise unlimited, always-free hosting: storage, bandwidth, inactivity and email limits still apply. Portable SQL migrations and a read-only reachability check are included.

```sh
npm run backend:check
```

## What works—and what needs finishing

The latest standalone iPhone build was installed and launched successfully. Workspace navigation and local domain logic have checks. Source implementation is broader than hosted/device verification: cloud creator publication, community GPS rollout, Android, physical sensors and background behavior still need their release gates.

See [remaining work](docs/REMAINING.md): hosted reliability first, then richer guided training, nutrition capture, health trends, dedicated-track reconstruction and store distribution. No demo activity or invented health readings are presented as real.

## Develop

```sh
npm ci
cp .env.example .env
npm run typecheck
npm test
npm run security:check
```

For iOS Simulator: `npm run ios:simulator`. Expo Go cannot run the required native modules. Each installer uses their own Apple team; optionally set `RIVL_APPLE_TEAM_ID` for prebuild. Keep private credentials, signing files and activity data out of commits.

Source lives in `app/`, `src/`, `modules/` and `targets/`; backend schema/functions live in `supabase/`. [Developer reference](docs/DEVELOPER-REFERENCE.md), [feature detail](docs/FEATURE-EXPANSION.md) and [validation history](docs/IOS-VALIDATION.md) provide deeper context.

## Open-source training

Creator programs support CC BY 4.0 or CC0 sharing with attribution. OpenHIIT, wger and structured cycling resources are linked in the [creator guide](docs/CREATOR-TRAINING.md); third-party course content is not bundled or relicensed by this release.

RIVL source uses the ISC licence. Dependencies and external training content retain their own licences.
