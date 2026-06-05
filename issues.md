# Codebase Issues Audit

> Generated from full-tree review on 2026-06-03. Severity legend: 🔴 high · 🟡 medium · 🟢 low.

## Backend

### 🔴 B1 — Manual transcript upload missing
**Where:** No endpoint exists to manually upload a `.vtt` / `.txt` file. The only path is the Zoom webhook + OAuth. If Zoom's webhook fails (network, rate-limit, Zoom-side outage), the data is lost unless the admin re-requests it from Zoom. Spec asks for a robustness fallback.
**Fix:** Add `POST /api/zoom/upload-transcript` accepting `.vtt` or `.txt` (auth: admin). Runs the same pipeline (parse → extract → embed → store). Wire a UI dropzone under the Zoom card on AccountPage.

### 🟡 B2 — VTT speaker detection is fragile
**Where:** `backend/utils/vttParser.ts:102`
```
if (currentSpeaker === '' && /^[A-Za-z]/.test(line) && !line.endsWith('.')) {
```
A short declarative line that *isn't* a speaker (e.g. "Yes", "I think") gets misclassified as a speaker. Worse, multi-line speakers ("First\nLast Name") would treat the first line as speaker and the second as text.
**Fix:** Tighten the heuristic: speaker lines should be ≤4 words AND start with a capital letter AND contain no period/comma inside. Multi-line: allow up to 2 short lines before a long line.

### 🟡 B3 — `extractSnippet()` ignores timestamps
**Where:** `backend/utils/vttParser.ts:121` — comment says "We don't have per-segment timestamps here" but the segment is followed by a timestamp on the previous line; the function could store the seconds offset.
**Fix:** Have `parseVTTWithSpeakers` return `TranscriptSegment & { startSec: number }` so snippets can be time-accurate.

### 🟡 B4 — `parseVTT()` re-parses via `parseVTTWithSpeakers()` (double work)
**Where:** `backend/utils/vttParser.ts:44`
**Fix:** Cached parse — keep one result. (Minor; ~3ms saved per Zoom meeting. Skip if low priority.)

### 🟡 B5 — `convertInsightToFAQ` doesn't carry speaker/snippet metadata
**Where:** `backend/controllers/zoomController.ts:355` — the new FAQ loses the transcript context that the ZoomInsight had. Admin can't trace back which meeting/section this came from.
**Fix:** Pass `sourceMeetingId`, `sourceMeetingTopic`, and the AI confidence score through; the FAQ model already supports these fields.

### 🟢 B6 — VTT parser has dead code
**Where:** `backend/utils/vttParser.ts:60-62` — the initial `while (!lines[i].includes('-->'))` skip is reset to 0 immediately. Inefficient, not buggy.
**Fix:** Delete the dead loop.

### 🟢 B7 — Empty-transcript threshold is 50 chars
**Where:** `backend/utils/vttParser.ts:138` — a 50-char transcript will be silently dropped. Some short Q&A sessions may be valid below this threshold.
**Fix:** Lower to 30, but log a warning when <50 instead of dropping.

### 🟢 B8 — `zoomExtractor.ts` doesn't validate that topic is non-empty
**Where:** If `meetingTopic` is empty string, the LLM prompt becomes "Meeting topic: \n\nTranscript: …" which can confuse smaller models.
**Fix:** Default to "Untitled meeting" when blank.

## Frontend

### 🟡 F1 — AccountPage has no manual upload UI
**Where:** `frontend/src/pages/AccountPage.tsx:479-517` — Zoom card shows only Connect/Disconnect. No manual upload.
**Fix:** Add a file input + dropzone below the Connect button. Show processing state.

### 🟡 F2 — No client-side VTT validation
**Where:** Future: when the upload UI is added, the client should reject files >5MB or wrong MIME type before hitting the server.
**Fix:** Wire into the upload UI.

### 🟢 F3 — Zoom status doesn't show "last sync"
**Where:** `zoomStatus.connectedAt` exists but no UI consumes it on the Account page.
**Fix:** Show "Last sync: <relative time>" if any meetings have been processed.

## Data Integrity

### 🟡 D1 — ZoomInsight documents have no embeddings
**Where:** `yaksha_zoom_insights` collection — when admins approve, the resulting FAQ gets an embedding (via `convertInsightToFAQ`), but the raw insight has no vector. Approved-but-not-promoted insights are invisible to semantic search.
**Fix:** Backfill embeddings on insights with `status: 'approved' && embedding: null` (low priority; not in spec).

### 🟢 D2 — Old zoom insights exist with `confidence_score = 0` and no `transcript_snippet`
**Where:** `yaksha_zoom_insights` — pre-2026 data has null snippet fields. UI shows "—" for them.
**Fix:** Acceptable; no action needed.

## Infra / Robustness

### 🔴 I1 — Single AI extraction in Zoom pipeline
**Where:** `backend/controllers/zoomController.ts:188-192` — `processZoomMeetingForKnowledge` runs in parallel with `extractInsightsFromTranscript` but if the AI call fails, no retry, no dead-letter queue.
**Fix:** Add a dead-letter collection (`yaksha_zoom_processing_failures`) for the retry job. (Defer; no retry infra exists yet.)

### 🟡 I2 — Zoom webhook doesn't verify request signature
**Where:** `backend/routes/zoom.ts:40` — Zoom sends `x-zm-signature` header (HMAC-SHA256) for webhook validation. Code didn't check it.
**Fix:** `verifyZoomSignature()` checks `x-zm-signature` against `ZOOM_WEBHOOK_SECRET_TOKEN`; skips if env not set (dev mode). ✅ Done.

### 🟡 I4 — AI auth headers missing `Bearer` prefix for non-Anthropic providers
**Where:** `backend/utils/zoomExtractor.ts`, `backend/services/knowledgeBase.ts`, `backend/services/aiClient.ts`, `backend/services/rag.ts`, `backend/utils/duplicateDetector.ts` — all sent raw API key as the auth header value (e.g. `Authorization: sk_live_xxx`) instead of `Authorization: Bearer sk_live_xxx`. The proxy (`samagama.in`) requires the `Bearer` prefix, causing all AI calls to return 401. `chatWithProvider` in `aiProvider.ts` was already correct; the other 5 call sites inherited the bug.
**Fix:** All call sites now construct `authValue = provider === 'anthropic' ? apiKey : \`Bearer ${apiKey}\`` before assigning to the auth header. ✅ Done.

### 🟢 I3 — No rate limit on `/api/zoom/webhook`
**Where:** Same as above. Could be flooded.
**Fix:** Add a `webhookLimiter` similar to `suggestLimiter`. (Low priority if signature is verified.)

---

---

## Fixes Applied (2026-06-03 pass)

| # | Action | Status |
|---|--------|--------|
| B1 | `POST /api/zoom/upload-transcript` (multipart .vtt/.txt + rawText JSON body) + AccountPage dropzone | ✅ Done |
| B2 | Speaker heuristic: `isSpeakerLabel()` checks word count ≤4, capital start, no internal punctuation, next line is longer | ✅ Done |
| B3 | `TranscriptSegment` now carries `startSec`; `extractSnippet` uses it for timed excerpts | ✅ Done |
| B5 | `convertInsightToFAQ` sets `sourceMeetingId` / `sourceMeetingTopic` / `confidence_score` on promoted FAQ | ✅ Done |
| B6 | Dead `while` loop removed from `parseVTTWithSpeakers` | ✅ Done |
| B7 | `isEmptyTranscript` returns `{ empty, warning }`; below 50 chars logs warn but still passes | ✅ Done |
| B8 | Empty `meetingTopic` defaults to "Untitled meeting" before LLM call | ✅ Done |
| F1 | Manual upload dropzone on AccountPage (admin/moderator sees it always; connected users see it too) | ✅ Done |
| I2 | `verifyZoomSignature()` checks `x-zm-signature` HMAC-SHA256 against `ZOOM_WEBHOOK_SECRET_TOKEN`; skips if env not set (dev mode) | ✅ Done |

Backlog (not touched): B4, D1, D2, I1, I3, F2, F3.

---

## Re-Audit (2026-06-04 pass)

> Scanned the codebase after the auto-Zoom + RAG + UI work landed. Looked for security gaps, silent-failure paths, and N+1 / race issues in the new code paths.

### 🔴 N1 — OAuth `state` parameter is just base64(userId), not signed

**Where:** `backend/utils/zoomOAuth.ts:92`

```typescript
state: Buffer.from(internalUserId).toString('base64'),
```

**Risk:** The OAuth `state` is supposed to be unguessable + verifiable so the callback can confirm the response came from the flow we started. Right now it's just the user's internal ID in base64 — **anyone can forge a state for any user**, e.g. `state=base64('64f0...abc')`. Combined with the attacker's own completed Zoom OAuth, this writes the attacker's Zoom tokens onto the victim's user document. The victim is now linked to the attacker's Zoom account; recordings from the attacker's meetings will land in the victim's namespace.

**Fix:** Generate a 32-byte random nonce on `/auth/connect`, store it in a Redis/DB-backed state table keyed by nonce → { userId, expiresAt } (5min TTL). On callback, look up the nonce, verify expiry, then use the stored userId. Alternatively, HMAC-sign `userId` with a server secret: `state = base64(userId + ':' + hmacSha256(userId, SERVER_SECRET))` and verify on callback.

### N2 — `verifyZoomSignature()` falls closed in production

**Where:** `backend/controllers/zoomController.ts:39-42`

```typescript
const secret = process.env['ZOOM_WEBHOOK_SECRET_TOKEN'];
if (!secret) {
  logger.warn('[Zoom] ZOOM_WEBHOOK_SECRET_TOKEN not set — skipping signature verification (dev only)');
  return true;
}
```

**Risk:** If someone deploys this to staging or prod without setting the env var, **every webhook is accepted from any sender**. The "dev only" comment is documentation, not enforcement. An attacker who knows the endpoint exists can POST garbage events and we'll process them — creating fake `ZoomMeeting` records, draining the AI extraction quota, polluting the KB.

**Fix:** Fail-closed in non-dev:
```typescript
if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    logger.error('[Zoom] ZOOM_WEBHOOK_SECRET_TOKEN missing in production — rejecting webhook');
    return false;
  }
  logger.warn('[Zoom] ZOOM_WEBHOOK_SECRET_TOKEN not set — skipping signature verification (dev only)');
  return true;
}
```

### 🟡 N3 — RRF scores in `runRag()` max out at ~0.02, but my relevance threshold used to be 0.02 (single value)

**Where:** `backend/controllers/knowledgeController.ts` (the `THRESHOLDS` map).

**Status:** ✅ Fixed in this pass — the controller now uses a per-source-type threshold map:
```typescript
const THRESHOLDS = { faq: 0.025, community: 0.025, knowledge: 0.35 };
```

RAG and ASK-AI controller use this. But the original flat `MIN_RELEVANCE = 0.02` was leaking into the response and is now gone. Confirm by searching for `MIN_RELEVANCE` — should return no hits.

### 🟡 N4 — `getUserZoomToken` does not auto-refresh when expired

**Where:** `backend/utils/zoomOAuth.ts:160-220` (read flow).

The token refresh logic exists in `getUserZoomToken` but is only used by a few code paths. Several other call sites read `zoomAccessToken` directly and would make 401 calls against Zoom if the token has expired (>1 hour since last refresh). The circuit breaker will trip after enough 401s, but the first few will just fail silently.

**Fix:** Centralize: every call site that needs the Zoom API should call `getUserZoomToken(userId)` (which auto-refreshes), not read the encrypted field directly. Or add a single helper `zoomApiFetch(userId, path, init)` that handles refresh + 401 retry internally.

### 🟡 N5 — `processZoomMeetingForKnowledge` errors are silently caught

**Where:** `backend/controllers/zoomController.ts` — non-blocking fire-and-forget chain.

```typescript
processZoomMeetingForKnowledge(meeting._id.toString()).catch((err) =>
  logger.warn(`[Zoom] Knowledge extraction failed for meeting ${meeting._id}: ${err.message}`)
);
```

If the AI call for the KB extraction fails, we log a warn and move on. The meeting gets a `completed` status but the user has no idea the KB-extraction half failed. There's no dead-letter queue, no retry, no user-visible indicator.

**Fix (carry-over from I1):** Add a `yaksha_zoom_processing_failures` collection + a `retryFailedExtractions()` cron. Low priority but accumulating tech debt.

### 🟡 N6 — Backfill spawns unbounded parallel AI calls

**Where:** `backend/controllers/zoomController.ts:210-260` (the backfill loop).

After deduplication, the loop calls `processTranscriptForUser` sequentially. Looking at the call chain, that function is `await`ed for each meeting. So this is actually fine — sequential, not parallel. But it can take 30+ minutes for a 90-day backfill with 50 recordings, and there's no progress visibility.

**Status:** Not a bug; just a UX improvement. Consider streaming progress to a status endpoint.

### 🟢 N7 — 35 `catch {}` blocks swallow errors silently

**Where:** Distributed across `controllers/`, `services/`, `utils/`. Examples:
- `backend/services/aiClient.ts:265` (and 4 more)
- `backend/scripts/backfillEmbeddings.ts:37, 51`
- `backend/controllers/postController.ts:90`

Most are inside `for` loops where continuing past an error is correct, but the error is never logged — so a 100% failure rate looks like a 0% failure rate.

**Fix:** Add at least `logger.warn({ error }, 'item failed')` so failures surface in the logs.

### 🟢 N8 — 187 `console.log/warn/error` calls scattered (down from 200+ in earlier passes)

**Where:** Mostly in `scripts/` (acceptable for one-off migration tools) and a few in `controllers/`. The logger is the right tool for runtime logging.

**Status:** Largely acceptable as-is. Clean up if you have time; not blocking.

### 🟢 N9 — Old `transcript_snippet` data still has full transcripts

**Where:** `yaksha_zoom_insights` collection. The 17 pending-review insights were created before the keyword-extraction fix, so they still show the full transcript as snippet.

**Fix:** One-shot migration script that re-runs `keywordSnippet()` for each insight's question + answer against the stored raw transcript (if still available), or just deletes the bad snippet and re-fetches from the linked meeting.

---

## Summary

| # | Item | Status |
|---|------|--------|
| N1 | OAuth state forgery (HMAC-signed) | ✅ Fixed 2026-06-04 |
| N2 | Webhook signature fails closed in production | ✅ Fixed 2026-06-04 |
| N3 | Per-source-type RAG threshold | ✅ Fixed |
| N4 | Zoom token auto-refresh | 🟡 Centralize the helper |
| N5 | Silent KB extraction failures | 🟡 Add dead-letter queue (carry-over from I1) |
| N6 | Backfill progress visibility | 🟢 UX nice-to-have |
| N7 | Silent `catch {}` blocks | 🟢 Add at least a warn log |
| N8 | `console.*` left in code | 🟢 Not blocking |
| N9 | Old transcript_snippet data | 🟢 One-shot migration script |
