# Verification — 1.0.0

Verified on 6 October 2026. Runtime code has no third-party dependencies.

- `npm test`: 19 passed, 0 failed. Real React/TanStack harness covers ten-minute
  playback, 1×/2× with a seven-second latency spike, retry cooldown, repeated
  failures, pause, seeks, exhausted history, and recording/channel changes.
- Response tests cover split UTF-8, invalid bytes, timeouts, size bounds,
  teardown, ambiguous signatures, identifier/module renames, quoted decoys,
  sender validation, storage failures, and live/VOD navigation.
- `npm run lint`: 0 errors, 0 notices, 0 warnings.
- `npm run build`: deterministic ZIP/XPI; only `extension/` is packaged.

## Firefox and actual Kick playback

Firefox 156.0.1 ran in an isolated temporary profile using Mozilla Marionette.
The user's profile, account and installed extensions were not used.
Public test recording:
https://kick.com/maddyson/videos/01a10d48-8960-7f24-aade-189d84b44b61

Native Kick video, replay chat rows and emote images were observed. A three-minute
unmodified baseline and a five-minute patched run were sampled once per second.
After the first 30 seconds:

| Observation | Baseline | Patched |
| --- | ---: | ---: |
| Last visible message age, P95 | 4.11 s | 2.86 s |
| Last visible message age, maximum | 5.52 s | 4.20 s |
| Completed history headroom | — | 13.03–19.94 s |

Message age includes the interval between messages; it is not a measurement
of network delivery latency. Runs were sequential, so this is observational
evidence, not a controlled performance guarantee. Pause/resume, a ten-second
backward seek, a sixty-second forward seek and 2× playback retained native
chat and numeric buffer diagnostics. The five-minute run used the earlier
1.0.0 candidate; the final package was checked separately.

Final XPI SHA-256:
`bd5533864efb460cdf0d06b841ee6362ea71f25fa716603f6509b2a69290caf4`.
This exact package passed 35 seconds of native playback and a cached reload:
video ready, native chat rendered, buffer diagnostics present, no buffer error.
The final toolbar popup was visually inspected in Firefox. Its runtime changes
also passed the pause/seek/context regression harness. Aggregated observations
are in `submission/firefox-results.json`; raw browser/session data is excluded.

## Limits

Kick intermittently left the video page loading during separate integration
attempts. A cached reload in the earlier five-minute run did not reach a ready
video and is not counted as passed. No changes bypass Kick's site protections.
The user's normal Firefox profile, third-party chat extensions and Android
were not tested. Very slow sustained requests can exhaust a finite buffer.
Changed website logic is intentionally left untouched until a compatible
extension update is available. Mozilla decides store approval independently.
