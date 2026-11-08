# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.4] - 2026-11-09

### Fixed
- Added dropped binding reference validation in `rewrite.js` to prevent runtime ReferenceErrors if Kick uses variables removed by adapter replacement.
- Implemented query contract invalidation upon negative evidence (`getInfiniteHistoryByChannel` present with mismatched contract) and reduced contract wait timeout to 4000ms.
- Fixed hotkeys intercepting ArrowLeft/ArrowRight when the extension is disabled in storage or when focus is on `<select>`, `role="slider"`, `role="textbox"`, or other interactive elements.
- Added exponential backoff with jitter and 60-second cap on history query retries in `replay-template.js`.
- Added fast `includes` prefilters and tokenization precomputation for bundle rewriting; added irrelevant chunk URL caching in `background.js`.
- Throttled content script `METRICS` messages to at most once per second; cached badge status per tab with promise rejection handling.
- Added stream write safety guard in `finishResponse` preventing double-write on stream write failures.
- Unified seek interval normalization across all extension contexts in `seek-utils.js` and added auto-correction on input blur.

## [1.1.3] - 2026-10-28

### Fixed
- Fixed HTTP channel hanging during Kick initial page loading where `filter.onstop` fired and `finishResponse` waited for contract verification, but `RESPONSE_TIMEOUT_MS` (6000ms) fired prematurely and threw on `filter.disconnect()` without calling `filter.close()`.
- Increased `RESPONSE_TIMEOUT_MS` to 25000ms (exceeding `CONTRACT_WAIT_MS = 20000ms`).
- In `background.js`, cancelled `state.timer` on `filter.onstop` and tracked `state.stopped = true`.
- In `writeOriginal`, ensured `state.filter.close()` is safely called if `state.stopped` is true or if `disconnect()` throws.
- In `waitForContract` and `markContract`, ensured deterministic `setTimeout` fallback without background polling, safe map iteration, and session-wide verified contract reuse without blocking.
- In `content.js`, corrected `isPaused` evaluation to `!video || Boolean(video.paused)` to prevent prematurely emitting `stale` status (`?`) when the video element is unmounted or loading.
- Added adapter support and test fixtures for Kick's October 28 Turbopack bundle.
- Added comprehensive test coverage for out-of-order chunk arrival, contract wait timeout fallback, session-wide contract verification across tabs, safe filter closure on navigation while awaiting contract, and null video element handling.

## [1.1.2] - 2026-10-28

### Fixed
- Prepared support for Turbopack chunk structures and refined contract timeouts.

## [1.1.1] - 2026-10-21

### Fixed
- Fixed hanging on "Checking recording" state caused by Cloudflare port redirects (`:443`) and chunk query strings (`?dpl=...`) in Kick's October 21 deployment.
- Added session-wide contract verification persistence (`globalContractVerified`) to eliminate race conditions between query chunk and replay component chunk loading.
- Broadened document and top frame host verification to seamlessly handle `www.kick.com` and custom subdomains.
- Extended chunk interception pattern to catch Turbopack chunks with deployment parameters.
- Added test fixtures and regression coverage for October 21 chunks.

## [1.1.0] - 2026-10-19

### Added
- Customizable VOD seek intervals (backward and forward, 1–300 seconds; defaults: 10s backward, 30s forward).
- Extension popup settings section allowing real-time modification of seek intervals with English and Russian localizations.
- On-Screen Display (OSD) badge displaying seek distance and direction when navigating VODs with Arrow keys.
- Capture-phase keyboard handler intercepting `ArrowLeft` and `ArrowRight` on VOD pages while ignoring text inputs, textareas, and modal dialogs.
- Automatic live synchronization of seek settings between popup and active VOD tabs via `browser.storage.onChanged`.

## [1.0.3] - 2026-10-19

### Fixed
- Added adapter `october-19-2026` supporting Kick's mid-October 2026 bundle update where React Query and player store exports were minified into single-letter properties (`.f`, `.I`), resolving the `checking` hanging state.
- Added support for minified `infiniteQueryOptions` export (`(0,t.f)`) in query contract detection.
- Fixed false `stale` badge transition (grey `?`) when video playback is paused.
- Fixed `popstate` event passing `PopStateEvent` object as truthy `force` parameter to `checkRoute`.
- Added missing `.catch()` promise error handling in popup script for `SET_ENABLED` and `RELOAD_VOD`.
- Reported `unsupported` status when query contract verification times out instead of leaving status as `checking`.

## [1.0.2] - 2026-10-14

### Fixed
- Fixed filter matching across locale builds (e.g. Russian bundle `3vkl5g58x3oab.js`) where minified identifiers for the message array varied (`T.filter` vs `N.filter`). Dynamically resolves the filter target against the mapped video start and display variables.

## [1.0.1] - 2026-10-14

### Fixed
- Added adapter `october-14-2026` supporting Kick's mid-October 2026 bundle where the chat threads flag (`useFlag(FlagKey.ViewChatThread)`) was removed from `ChatroomReplayEntries`, resolving the `unsupported` status on VOD pages.
- Increased contract verification wait window (`CONTRACT_WAIT_MS`) from 1200ms to 2500ms in `background.js` to prevent race conditions on high-latency network connections.

### Added
- Added `scripts/pack-source.mjs` for cross-platform deterministic source archive generation.
- Added test coverage in `tests/rewrite.test.js` for the October 14 module fixture.
- Added GitHub Actions CI workflow (`.github/workflows/ci.yml`) to ensure automated test, lint, and build validation on pull requests and commits.

## [1.0.0] - 2026-10-06

### Added
- Initial release for Firefox desktop 142+.
- Buffer management maintaining ~15 seconds of history ahead of playback.
- Precise bijective token rewrite engine with strict validation safeguards.
- Toolbar popup with live diagnostics and metrics display.
