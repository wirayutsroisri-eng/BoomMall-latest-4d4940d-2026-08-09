# Temporary Feed Focus

The Feed header's “เลือกดู” opens `/feed-focus`. Focus applies to the For You lane only. Search and interest-profile APIs are unchanged.

- `PUT /api/v1/feed/focus` requires authentication and `{ sessionId, query }`; `query: null` resets only that session's override.
- `GET /api/v1/feed/posts?focusSessionId=...` reads the override for the authenticated user. Requests without that parameter, other tabs and own-post requests retain their existing behavior.
- Redis key: `feed:focus:{encodedUserId}:{sessionId}`, without a TTL. The stored value contains `mode: temporary_focus`, `query`, and `targetWeight: 0.75`.
- With no Redis configured, single-process development uses session memory. With Redis configured but unavailable, focus requests fail rather than create inconsistent per-worker state. No Postgres profile/preference writes occur.
- Matching candidates are retrieved through the existing social feed safety/personalization pipeline. Topics match caption text or tags; “กำลังติดตาม” matches followed authors. Three matching posts are interleaved with one discovery post, preserving pool order. Insufficient eligible content falls back to the available pool without duplicates. This is text/tag matching, not semantic topic classification.
- Focus state and ordering are excluded from persisted app state. The normal cached order is retained separately during focus. Reset restores it immediately after the server acknowledges deletion, rotates the local focus session ID, invalidates in-flight responses using a generation counter, and requests a fresh normal feed. The current `/feed/posts` endpoint has no pagination cursor or server ranking-session cache to delete.
- Account switching discards local focus and invalidates pending responses. Closing and reopening the app creates a new in-memory session with no focus; backgrounding the app does not reset it. There is no expiry timer. OS termination cannot reliably send a deletion request: old Redis session keys are no longer used by the reopened app, while explicit reset deletes the current key. Reset does not call behavior, interest-profile, follow, like, or personalization deletion endpoints.

Validation covers Redis keys without expiry, session/user isolation, app restart, 75/25 mixing, shortages, state reset, stale response rejection, account switching, failed reload recovery, and preserving edits/reactions/new posts while restoring normal order. UI still needs visual/device verification.
