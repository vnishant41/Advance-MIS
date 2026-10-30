# Progress — worker_r3_2
Last visited: 2026-10-29T14:09:50Z

## Completed Work
1. Re-read instructions, `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `reviewer_r3_2/handoff.md`.
2. Verified the defect:
   - `pulseSubs.some(s => rCat.includes(s))` in `app/static/js/report.js` caused `'Turmeric'` to match `'tur'`.
   - Selecting "Pulses" matched 94 reports instead of 64.
   - Quick pill count for Pulses was 94 instead of 64.
   - Selecting "Tur" matched 30 Turmeric reports.
3. Updated `app/static/js/report.js`:
   - Added regex escape and word boundary helper:
     `const escapeRegex = s => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');`
     `const matchWord = (text, token) => new RegExp('(^|[^a-zA-Z])' + escapeRegex(token) + '([^a-zA-Z]|$)', 'i').test(text || '');`
   - Added `pulseSubAliases` to accurately map pulse sub-commodities without colliding with Spices or other categories.
   - Replaced substring matching in `getFilteredHistoryReports()` with exact category equality and `matchWord` on title/subject.
   - Replaced substring matching in quick pill count (`line 427`) for `c === 'Pulses'` to strictly compare `(r.category || '').toLowerCase() === s`.
4. Verified:
   - Unit tests: `Ran 135 tests in 13.017s ... OK`.
   - DB invariants: `Users=9, Reports=27, Catalogs=158` (intact).
   - Server health: HTTP 200 OK on port 5000.
   - JS filtering logic assertion test:
     - Pulses total reports: 64 (Expected: 64).
     - Tur total reports: 2 (Expected: 2).
     - Turmeric leaked into Pulses: 0 (Expected: 0).
     - Turmeric leaked into Tur: 0 (Expected: 0).
     - Pill Pulses count: 64 (Expected: 64).
     - Pill Turmeric count: 30 (Expected: 30).
5. All checks and assertions passed.
