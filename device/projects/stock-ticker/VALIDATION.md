# Validation and hardware findings

Observed on one learner JD79661 CrowPanel, November 2, 2026:

1. One static refresh stayed clear with Wi-Fi off.
2. Wi-Fi, NTP and verified HTTPS succeeded without disturbing the existing image.
3. A single quote display using a fresh panel object stayed clear.
4. Two refreshes on the same panel object, ten seconds apart with Wi-Fi off, reproduced persistent corruption. Serial heartbeats continued, so this did not establish a processor freeze.
5. Three refreshes with fresh public CrowPanel objects produced clear completed images. The learner observed a brief transitional artifact before one completed image; it cleared in less than a second. The underlying driver cause is not established.
6. The new watchlist source was saved as main.py, read back exactly and executed. ARM, QCOM and GOOG all passed verified HTTPS with 15-minute delay reported.
7. Physical wheel navigation logged ARM -> QCOM -> GOOG -> ARM. Menu queued and fetched all three successfully again. The learner confirmed everything looked good.
8. The existing main.py was backed up and verified before installation. No firmware/driver waveform changes were made.

The packaged entry files differ from that deployed source only in their leading deployment docstrings. Both include the same application logic. The RAM version does not install or write itself. The startup variant becomes persistent only through an explicit save as main.py.

Offline simulation checks initial held Menu suppression, rejected input bounce, wheel selection, repeated Menu coalescing, 60-second cooldown, 900-second scheduling after a manual refresh, per-symbol outage retention/stale marking, new panel instance per display, minimum spacing, Wi-Fi off while showing and text length limits.

Not observed on hardware: an entire scheduled 15-minute cycle, cold power-on of the final watchlist app, a physical network outage, every supported ticker, and other panel revisions. Clock rollover uses ticks_diff but this simulation does not cross the rollover boundary. Do not represent simulation as hardware evidence.

Before merging, Casey should run both offline entry-file checks, review dependency versions/CA packaging, test RAM execution, test explicitly backed-up startup deployment and cold power-on, allow a scheduled cycle, exercise Menu cooldown and held buttons, and test loss/recovery of NTP and HTTPS. Confirm the MAC-registration link in the actual website source. Keep API endpoint stability and data licensing review separate from functional testing.
