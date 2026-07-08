# mcp-eureka

<!-- mcp-name: io.github.matematicsolutions/mcp-eureka -->

An **MCP (Model Context Protocol)** server for the **EUREKA** system of the
Ministerstwo Finansow / MF (Ministry of Finance) (`eureka.mf.gov.pl`) -
**550,000+ documents of Polish tax practice**, including **517,000+ individual
interpretacje podatkowe (tax interpretations) of the Krajowa Informacja
Skarbowa / KIS (National Revenue Information)**, general interpretations, tax
explanations, and binding rate (WIS) and excise (WIA) information.

The largest single corpus of tax practice in Poland, available to Claude /
Cursor / VS Code MCP agents with verifiable citations (signature + URL + date).

**Status: v0.1.0** | License: **MIT** | Maintainer: [MateMatic](https://matematicsolutions.com)

> Tax interpretations are not a source of law - they are the practice of
> authorities (art. 14a-14s of the Tax Ordinance). Legal protection applies to
> the applicant of a given individual interpretation.

## Data source

The public JSON API of the EUREKA portal (Angular SPA backend, no key required),
verified live on 2026-07-08:

- `POST /api/public/v1/wyszukiwarka/informacje/?size=N&page=N&sort=DT_WYD,desc` -
  search (filters: `SYG`, `KATEGORIA_INFORMACJI` as an array of ids,
  `DT_WYD_start`/`DT_WYD_end`; `searchQuery` in the body). **The trailing slash
  before `?` is mandatory** - without it the backend returns HTTP 500.
- `GET /api/public/v1/informacje/{id}` - full document (metadata + HTML content).
- `GET /api/public/v1/pozycje-slownika/wyszukiwarka?kodSlownika=KATEGORIA_INFORMACJI` -
  category dictionary (28 entries).

## MCP tools

- **`search(query?, full_phrase?, signature?, category_ids?, date_from?, date_to?, page?, page_size?)`** -
  search with filters; sorted by issue date descending.
- **`get_interpretation(id)`** - full document by ID_INFORMACJI (thesis + first
  3000 characters of content).
- **`search_by_signature(signature)`** - shortcut: by signature, full
  (`0112-KDIL3.4012.367.2026.2.AK`) or prefix (`0112-KDIL3`).
- **`list_categories()`** - category dictionary (id -> name) for `category_ids`.

Every response includes `structuredContent.citations` (title, url, signature,
issue_date) - the contract consumed by [Patron](https://github.com/matematicsolutions/patron)
and any MCP agent.

## Quickstart

```bash
npm install
npm run build
npm start                # stdio transport

npm run drift            # consistency INSTRUCTIONS <-> TOOLS <-> ErrorCode
npm run test:parse       # offline - fixtures from real API responses
npm run smoke            # LIVE - eureka.mf.gov.pl (throttled 2 req/s)
```

MCP client configuration (`mcp-servers.json`):

```json
{
  "mcpServers": {
    "eureka": {
      "command": "node",
      "args": ["<path>/mcp-eureka/dist/index.js"]
    }
  }
}
```

## MateMatic Polish-law connectors

[`mcp-saos`](https://github.com/matematicsolutions/mcp-saos) (common courts/SN/TK/KIO) ·
[`mcp-nsa`](https://github.com/matematicsolutions/mcp-nsa) (NSA + 16 WSA) ·
[`mcp-eureka`](https://github.com/matematicsolutions/mcp-eureka) (this one) ·
[`mcp-isap`](https://github.com/matematicsolutions/mcp-isap) (Dz.U. + M.P.) ·
[`mcp-krs`](https://github.com/matematicsolutions/mcp-krs) (KRS) ·
[`kio-orzeczenia-mcp`](https://github.com/matematicsolutions/kio-orzeczenia-mcp) (KIO)

Fleet convention: one connector = one source (single-source). Every call returns
a citable source, zero content modification, stateless.

## Disclaimer

The data comes from the public EUREKA system of the Ministry of Finance. The
connector does not modify content, throttles requests (max 2 req/s), and
identifies itself with a User-Agent carrying the repo address. Interpreting the
law in a specific case requires your own individual interpretation or the
opinion of a tax advisor.

## License

MIT - see [LICENSE](./LICENSE).

Citation: *MateMatic Solutions (2026), mcp-eureka - MCP server for Polish tax
interpretations (EUREKA/KIS), https://github.com/matematicsolutions/mcp-eureka, MIT.*
