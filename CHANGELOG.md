# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) +
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-07-08

Initial release. Built in the 2026-07-08 Poland widen-round after a live probe of the
EUREKA public JSON backend (LDH id `PL/KIS-EUREKA`, status `complete` - confirmed live).

### Verified live at release time

- 550 889 documents total (dedicated `totalHits` field, unfiltered query).
- 517 369+ interpretacje indywidualne (`KATEGORIA_INFORMACJI:[1]`).
- Exact-signature lookup: `SYG` filter -> 1 hit -> full text (`0112-KDIL3.4012.367.2026.2.AK`).
- Date filter narrows (2 145 interpretations issued 2026-01), category filter narrows,
  prefix signature matches (6 048 for `0112-KDIL3`).

### Added

- 4 tools: `search`, `get_interpretation`, `search_by_signature`, `list_categories`.
- `structuredContent.citations` in every response (Patron contract).
- `instructions` + `ToolAnnotations` + structured `ErrorCode` (MateMatic MCP canon).
- Offline fixture tests on real API captures, live smoke test, drift test.
- 500 ms request throttle, no API key required, zero runtime deps beyond MCP SDK.

### Known gotchas (do not rediscover)

- The search endpoint REQUIRES a trailing slash before the query string
  (`/wyszukiwarka/informacje/?...`) - without it the backend returns HTTP 500.
- Dictionary filters take ARRAYS of numeric position ids (`KATEGORIA_INFORMACJI:[1]`);
  a bare number or string returns HTTP 500.
- `searchQuery` must be omitted from the body when empty (null -> HTTP 500).
- `searchInFullPhrase:true` requires an exact phrase and often returns 0 hits -
  default is word-independent search.
