# Benchmark queue (one video at a time, in this order)

Goal: prove what the studio can do by teaching the same topics as the reference
videos, in our own style, with original scripts. Start with a 45–60 s portrait clip
of the section listed; go full length only after the clip passes review.

All references carry equal weight. The order only reflects dependencies: the early
videos force the most new library pieces, which later videos reuse.

| # | Slug | Reference (topic only) | Section to target first | Techniques it forces (see TECHNIQUES.md) |
| --- | --- | --- | --- | --- |
| 1 | kodekloud-auth | KodeKloud, Authentication | session ID → access token → refresh token (ref 00:42–02:32) | phone app state, service panel, kvTable + lookup, tokenCard, timerBadge, lifetimeBars, threatActor, crowd, chapterHeading |
| 2 | kodekloud-tls | KodeKloud, TCP/TLS/HTTP | TCP handshake → TLS handshake → HTTP over both (ref 00:48–02:17) | browserWindow, protocolLanes, exchange steps, statePill, pipe + lock, payloadCard |
| 3 | rick-system-design | Rick, System Design 101 | requirement → one service → cache, DB, replicas → metrics (ref 00:16–01:52) | requirementCard, growing architecture, metricsPanel |
| 4 | kuls-kernel | Kuls Tech, Kernel | app → system call → kernel → hardware; user vs kernel mode (ref 00:24–01:05) | layerStack, boundary crossing |
| 5 | rick-computer-vision | Rick, Computer Vision | image → pixel values → pattern → prediction (ref 00:47–02:20) | dataGrid, processing stages |
| 6 | wifi | So That's How, Wi-Fi | router → wave → obstacle → phone (ref 00:06–00:46) | wave propagation (2D), obstacle, endpoint consequence |

Reference frames: `docs/visual-references/extra-six/<nn>-<slug>/` and the CodewithIddris
frames in `docs/visual-references/`. Use them for comparison only; never as assets.
