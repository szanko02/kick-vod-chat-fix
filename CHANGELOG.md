# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
