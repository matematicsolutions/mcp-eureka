# Sources ledger - Poland / tax practice (PL)

Machine-diffable record of every Legal Data Hunter (`worldwidelaw/legal-sources`) source we have
checked for this repo's scope, and what we did about it. Machine-read by `eu-legal-mcp/gap_scan.py`.

| LDH id | LDH name | LDH status @ check | Our status | Our tool(s) | Notes / rejection reason |
|---|---|---|---|---|---|
| PL/KIS-EUREKA | EUREKA (KIS/MF) tax interpretations | complete | shipped | `search`, `get_interpretation`, `search_by_signature`, `list_categories` | shipped v0.1.0, 2026-07-08. Public JSON API of the Angular SPA, keyless: POST `/api/public/v1/wyszukiwarka/informacje/` (trailing slash mandatory), GET `/api/public/v1/informacje/{id}`. Verified live: 550 889 docs total (`totalHits`), 517 369 interpretacje indywidualne, exact-SYG lookup -> 1 hit -> full text. |
| PL/MF | sip.mf.gov.pl (legacy SIP) | blocked | rejected | - | `duplicate` - the legacy System Informacji Podatkowej was migrated into EUREKA; the corpus is served by PL/KIS-EUREKA above. No separate probe needed while EUREKA stays open. |

The `LDH status @ check` column records what LDH said WHEN WE CHECKED (2026-07-08).

## Status vocabulary

- `shipped` - live in this repo, has at least one MCP tool, tested and published.
- `rejected` - scouted, deliberately NOT built; `Notes` gives the reason (LDH taxonomy:
  `bot_protection`, `captcha_required`, `geo_restricted`, `duplicate`, `no_full_text_access`,
  `needs_separate_subscription`, `unreliable_exact_match`).
- `todo` - LDH has it as `complete`, we have not evaluated it yet.

## Not on this list

Anything NOT in this table has simply not been checked yet against this repo's LDH sources.
Other Poland sources live in their own single-source repos per fleet convention: `mcp-saos`,
`mcp-nsa`, `kio-orzeczenia-mcp`, `sejm-eli-mcp` / `mcp-isap`, `mcp-krs`.
