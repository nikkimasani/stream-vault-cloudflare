# Stream Vault

Stream Vault is a responsive, private-first IPTV library and player for lawful public streams and user-supplied authorized Xtream Codes and M3U services. Its interface combines Stream Vault's visual identity with navigation patterns inspired by Lume and media-library patterns similar to NyxPlayer.

## Features

- Curated Free-TV and iptv-org collections
- Xtream Codes authentication, Live TV, VOD movies, series, seasons, and episodes
- HLS playback with native Safari support and hls.js elsewhere
- AirPlay, Google Cast, Remote Playback, and Picture-in-Picture controls when supported by the device
- Automatic network retries with direct-open fallback for blocked streams
- Search, groups, collection filters, favorites, and continue watching
- Named M3U URL and file playlists with refresh, removal, and current-channel export
- Installable PWA metadata
- Static output for both Vercel and Cloudflare Pages

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

Deploy the generated `dist` directory. No API key is required.

## Content policy

Stream Vault does not host, proxy, record, or rebroadcast video. Playback goes directly from the original provider to the viewer. Xtream credentials remain in session storage by default, or in local storage when the viewer explicitly chooses Remember. Only import playlists and streams you are authorized to access. The app does not bypass DRM, subscriptions, passwords, provider connection limits, or geographic restrictions.

## Upstream projects

The app uses public data formats and links from [iptv-org/iptv](https://github.com/iptv-org/iptv), [Free-TV/IPTV](https://github.com/Free-TV/IPTV), [iptv-org/database](https://github.com/iptv-org/database), and the wider iptv-org ecosystem. Product patterns were also informed by [Lume](https://github.com/nikkimasani/Lume), [Streamity](https://github.com/lKinderBueno/Streamity-Xtream-IPTV-Web-player), [IPTV-Restream](https://github.com/antebrl/IPTV-Restream), [ngo5/IPTV](https://github.com/ngo5/IPTV), and [Cigaras/IPTV.bundle](https://github.com/Cigaras/IPTV.bundle). No source code from Lume is copied into this web project. Upstream projects remain independently maintained under their respective licenses and policies.
