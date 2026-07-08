# AGENTS.md - mcp-eureka

An [agents.md](https://agents.md) standard file (Linux Foundation / Agentic AI Foundation) - canonical instructions for AI agents working with this repository.

## Project goal

An **MCP (Model Context Protocol)** server for **Polish tax interpretations and the practice of the Ministerstwo Finansow / MF (Ministry of Finance)** - via the public JSON API of the **EUREKA** system (`eureka.mf.gov.pl`). 550,000+ documents, including 517,000+ individual KIS tax interpretations.

One of the MateMatic Polish-law connectors: [`mcp-saos`](https://github.com/matematicsolutions/mcp-saos), [`mcp-nsa`](https://github.com/matematicsolutions/mcp-nsa), [`mcp-eureka`](https://github.com/matematicsolutions/mcp-eureka) (this one), [`mcp-isap`](https://github.com/matematicsolutions/mcp-isap), [`mcp-krs`](https://github.com/matematicsolutions/mcp-krs), [`kio-orzeczenia-mcp`](https://github.com/matematicsolutions/kio-orzeczenia-mcp).

## MateMatic context (HARD CONSTRAINTS)

The repo is run by [MateMatic Solutions](https://matematicsolutions.com). The connector is **trust infrastructure**.

- **Every tool call MUST return `structuredContent.citations`** with: title, canonical URL (`eureka.mf.gov.pl/informacje/podglad/{id}`), signature, issue date.
- **Stateless** - no caching of queries containing PII (the only in-memory cache: the public category dictionary).
- **No content modification** - we return verbatim from EUREKA.
- **Throttling** - max 2 req/s against MF infrastructure, User-Agent carrying the repo address.

## What NOT to do (hard rules)

- **Do NOT add tools that send user data to external APIs** other than EUREKA. The connector is **single-source**; every additional source = a separate MCP repo (fleet convention).
- **Do NOT modify returned content** - the data is primary, with evidentiary value.
- **Do NOT guess the meaning of dictionary ids** (PRZEPISY/ZAGADNIENIA/SLOWA_KLUCZOWE in the full document) - refer to the source page.
- **No breaking changes without a MAJOR bump** + a CHANGELOG entry.

## Build and test

```bash
npm install        # Node 18+
npm run build      # tsc -> dist/
npm run drift      # consistency INSTRUCTIONS <-> TOOLS <-> ErrorCode
npm run test:parse # offline fixtures (real API responses from 2026-07-08)
npm run smoke      # LIVE smoke against eureka.mf.gov.pl
```

## Upstream gotchas (verified live 2026-07-08)

1. `POST /api/public/v1/wyszukiwarka/informacje/?...` - the trailing slash before `?` is MANDATORY (without it -> HTTP 500).
2. Dictionary filters = arrays of numeric ids (`KATEGORIA_INFORMACJI:[1]`); a number/string -> HTTP 500.
3. Omit `searchQuery` from the body when empty (null -> HTTP 500).
4. `searchInFullPhrase:true` = exact phrase, often 0 hits; default false.
5. Totals ONLY from the `totalHits` field of the search response.

## Sources of truth

1. [README.md](./README.md)
2. [CHANGELOG.md](./CHANGELOG.md)
3. `src/index.ts`
4. [SOURCES.md](./SOURCES.md) - Legal Data Hunter ledger
5. [EUREKA](https://eureka.mf.gov.pl) - upstream

## License

**MIT** - see [LICENSE](./LICENSE).

Citation: *MateMatic Solutions (2026), mcp-eureka - MCP server for Polish tax interpretations (EUREKA/KIS), https://github.com/matematicsolutions/mcp-eureka, MIT.*
