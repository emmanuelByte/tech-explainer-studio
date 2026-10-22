# Technique catalog: all seven references, equal weight (2026-10-22)

Every reference video counts equally. There is no primary or secondary reference:
each technique below is credited to whichever video demonstrates it, and the agent
should take it from there. Render every technique in **our house style** (the
approved hero shot, `src/remotion/hero/`), never in the source creator's style.

References: **CI** = CodewithIddris, Replication vs Partitioning vs Sharding
([frames](README.md)); **KT** = Kuls Tech, Kernel; **WF** = So That's How, Wi-Fi;
**RV** = Rick, Computer Vision; **RS** = Rick, System Design 101;
**KK-TLS** = KodeKloud, TCP/TLS/HTTP; **KK-Auth** = KodeKloud, Authentication
([frames](extra-six/README.md)).

Status: **hero** = already built in `src/remotion/hero/primitives/`;
**build** = still needed as a library component or action.

## Persistent actors and app UI

| Technique | Seen in | What it teaches | Library piece | Status |
| --- | --- | --- | --- | --- |
| Phone with a real app screen that changes state | CI 00:30, RV 00:05, RS 01:20, KK-Auth 00:18–02:32 | The user's action causes the system event | `phoneScreen` (states) | hero (profile); build more screens: list, login, chat |
| Browser window chrome with an address bar as a fixed actor | KK-TLS 00:16–01:51 | The client stays put while the protocol changes around it | `browserWindow` | build |
| Service panel with named list rows (login server, servers: home feed, messages, likes, comments) | KK-Auth 00:18, 00:42, 01:30 | A backend is a set of named responsibilities, not a box | `servicePanel` | build |
| Named people inside the app (John, Emma, Liam, Olivia) reused across scenes | KK-Auth | Continuity: the same user is followed through every step | world file: cast | build |
| Persistent node positions; the fix is overlaid on the same layout | CI 01:42–01:54, KK-TLS, KK-Auth, WF | Spatial continuity beats cutting to a new slide | layout rule | hero |

## Messages, sequences and protocols

| Technique | Seen in | What it teaches | Library piece | Status |
| --- | --- | --- | --- | --- |
| Labelled message travels between two anchored actors | KK-TLS 00:48, 01:21; CI 01:06 | Who sends what, in which order | action `send(from, to, payload)` | hero |
| Protocol layers as horizontal lanes (HTTP / TLS / TCP / IP) with coloured labels | KK-TLS 01:51, 02:17 | Layering: each protocol rides on the one below | `protocolLanes` | build |
| Sequence arrows inside a lane between client and server columns (SYN, ACK, Client Hello) | KK-TLS 00:48, 01:21 | Handshakes as ordered exchanges | action `exchange(lane, steps[])` | build |
| State pill on an endpoint (ESTABLISHED) | KK-TLS 00:48 | Connection state is something both sides hold | `statePill` | build |
| Pipe between actors with a lock that opens/closes | KK-TLS 01:10, 01:21 | Encryption as a property of the connection | `pipe` + `lock` state | build |
| Payload card showing the real request text (GET / HTTP/1.1, Host) | KK-TLS 01:10 | Show the actual bytes, not a vague arrow | `payloadCard` | build |

## Data objects and state

| Technique | Seen in | What it teaches | Library piece | Status |
| --- | --- | --- | --- | --- |
| Short ID chip handed from server to app (session ID `7f3a9c`) | KK-Auth 00:42 | Identity travels as data | `chip` | hero |
| Key/value table with the matching row highlighted by a dashed outline | KK-Auth 00:42, CI 06:30 | A lookup is a match against stored rows | `kvTable` + action `lookup(key)` | build |
| Token card with fields (user, for, expires 10:45) | KK-Auth 01:30 | A token is a structured claim with an expiry | `tokenCard` | build |
| Lifetime bars on a timeline (access token 15 min vs refresh token weeks) | KK-Auth 02:32 | Compare lifetimes visually | `lifetimeBars` | build |
| Clock/timer badge next to an object (15 min) | KK-Auth 02:07 | Expiry is time-based state | `timerBadge` | build |
| Data table with rows that filter or partition | CI 02:30–04:42 | Data organisation follows query behaviour | `dataTable` + `partition` | build |
| Counters and meters tied to load | CI 00:42, 01:42 | Load is measurable | `meter`, `bigNumber` | hero |
| Skewed distribution chart | CI 07:18 | Show the drawback with numbers | `barChart` | build |
| Primary/replica cylinders with failed and promoted states | CI 01:18–01:54 | Failover is a state change with a cause | `database` states | hero (pressure); build failed/promoted |

## Scale, threat and consequence

| Technique | Seen in | What it teaches | Library piece | Status |
| --- | --- | --- | --- | --- |
| Crowd of user icons streaming into one gateway with a big number (1 million requests every second) | KK-Auth 01:07 | Scale changes the design | `crowd` + `bigNumber` | build (bigNumber: hero) |
| Attacker figure in red stealing an object | KK-Auth 02:07 | Security only makes sense against a threat | `threatActor` | build |
| Obstacle in the signal path; consequence on the receiving device | WF 00:24–00:46 | Show the effect at the endpoint, not just the cause | `obstacle` + endpoint state | build (2D first) |
| Observability panel (metrics, logs) next to the architecture | RS 01:52 | How you find the bottleneck | `metricsPanel` | build |

## Structure, type and pacing

| Technique | Seen in | What it teaches | Library piece | Status |
| --- | --- | --- | --- | --- |
| Handwritten chapter heading fixed at the top (Secure this connection, Session ID, Access token, Refresh token) | KK-TLS, KK-Auth, CI 00:06 | Viewer always knows which part of the story they are in | `chapterHeading` | build |
| Handwritten question that frames the mystery (How do servers recognise John without his password again?) | KK-Auth 00:18 | Hook by question | `annotation` | hero |
| Requirements card that drives the architecture | RS 00:16 | Design follows product needs | `requirementCard` | build |
| Layered stack building up from hardware to app | KT 00:24–00:45 | Layers and boundaries | `layerStack` | build |
| Processing stages shown on real data (pixel grid, segmentation) | RV 00:47–02:20 | Show the transformation on data | `dataGrid` | build |
| Keyword-highlight captions | WF, RV, RS | Shorts-standard legibility | `caption` | hero |
| Changed pace and typography for the outro or summary | CI 08:30–09:30 | Signal the takeaway | `summaryCard` | build |

## How the agent should use this

1. Storyboard the lesson first, then pick techniques per beat from this catalog,
   whichever reference they come from.
2. If a technique is **build**, add it as a library component or action with
   states, in house style, and mark it **hero/library** here once it exists.
3. Never copy a creator's assets, logos, icons or exact layouts; reproduce the
   teaching idea.
4. Verify the technical claim behind any technique before using it in a script.
