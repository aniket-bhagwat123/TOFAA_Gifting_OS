# Performance plan: lowest latency first

Goal: every screen answers with as few, and as fast, round trips as possible.
Where the time goes: the browser calls this API, and this API calls Supabase over the internet.
Each Supabase call costs one network round trip (roughly 50-300 ms). So latency = number of
round trips in a row × cost of one. We attack both numbers.

| # | Step | What it removes | Risk |
|---|------|-----------------|------|
| 0 | **Measure.** Count Supabase calls and time per request; log them and send a `Server-Timing` header. | Guessing. Every later step is checked against these numbers. | None |
| 1 | **One shared, tuned HTTP client** for Supabase: HTTP/2, kept-open connections, bigger pool. | A new TCP/TLS handshake per call; parallel calls queuing. | Low |
| 2 | **Short-lived cache** for "who is this user" (profile + tenant), a KAM's client list, and a tenant's status. Cleared after any successful write, and expires on its own (default 15 s, `AUTH_CACHE_SECONDS`, `0` turns it off). | The 1-3 calls every request pays before doing real work. | Low. A deactivation can take up to the cache time to reach other server processes. |
| 3 | **Fewer, parallel round trips** in hot flows: gift request create and update, request detail, credits, occasion budget. | Checks that ran one after another. | Low |
| 4 | **Frontend caching and de-duplication**: identical GETs in flight share one request; lookups (recipients, events, occasions, pricing) are remembered for 30 s and dropped after any change. | Repeated fetches when moving between screens, and double fetches in dev. | Low |
| 5 | *Later, only if numbers still say so:* async Supabase client. | Thread-pool overhead. | High: rewrites about 8,000 lines for a small gain after steps 1-4. |

Judge speed on a production build (`npm run build && npm start`, and `uvicorn` without `--reload`).
Dev mode compiles each page the first time you open it, which feels slow but is not the API.

Verify: open any screen, then read the `Server-Timing` header (`db;desc="calls=N";dur=ms`) or the
`request_timing` line in the backend log.
