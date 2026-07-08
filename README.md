# mcp-eureka

<!-- mcp-name: io.github.matematicsolutions/mcp-eureka -->

Serwer **MCP (Model Context Protocol)** dla systemu **EUREKA** Ministerstwa Finansow
(`eureka.mf.gov.pl`) - **550 000+ dokumentow polskiej praktyki podatkowej**, w tym
**517 000+ interpretacji indywidualnych Krajowej Informacji Skarbowej (KIS)**,
interpretacje ogolne, objasnienia podatkowe, wiazace informacje stawkowe (WIS)
i akcyzowe (WIA).

Najwiekszy pojedynczy korpus praktyki podatkowej w Polsce, dostepny dla agentow
Claude / Cursor / VS Code MCP z weryfikowalnymi cytatami (sygnatura + URL + data).

**Status: v0.1.0** | Licencja: **MIT** | Maintainer: [MateMatic](https://matematicsolutions.com)

> Interpretacje podatkowe nie sa zrodlem prawa - to praktyka organow
> (art. 14a-14s Ordynacji podatkowej). Ochrona prawna przysluguje wnioskodawcy
> danej interpretacji indywidualnej.

## Skad dane

Publiczne JSON API portalu EUREKA (backend Angular SPA, bez klucza), zweryfikowane
live 2026-07-08:

- `POST /api/public/v1/wyszukiwarka/informacje/?size=N&page=N&sort=DT_WYD,desc` -
  wyszukiwarka (filtry: `SYG`, `KATEGORIA_INFORMACJI` jako tablica id,
  `DT_WYD_start`/`DT_WYD_end`; `searchQuery` w body). **Trailing slash przed `?`
  jest obowiazkowy** - bez niego backend zwraca HTTP 500.
- `GET /api/public/v1/informacje/{id}` - pelny dokument (metadane + tresc HTML).
- `GET /api/public/v1/pozycje-slownika/wyszukiwarka?kodSlownika=KATEGORIA_INFORMACJI` -
  slownik kategorii (28 pozycji).

## Narzedzia MCP

- **`search(query?, full_phrase?, signature?, category_ids?, date_from?, date_to?, page?, page_size?)`** -
  wyszukiwanie z filtrami; sort po dacie wydania malejaco.
- **`get_interpretation(id)`** - pelny dokument po ID_INFORMACJI (teza + pierwsze
  3000 znakow tresci).
- **`search_by_signature(signature)`** - skrot: po sygnaturze, pelnej
  (`0112-KDIL3.4012.367.2026.2.AK`) lub prefiksie (`0112-KDIL3`).
- **`list_categories()`** - slownik kategorii (id -> nazwa) do `category_ids`.

Kazda zwrotka zawiera `structuredContent.citations` (title, url, signature,
issue_date) - kontrakt konsumowany przez [Patron](https://github.com/matematicsolutions/patron)
i dowolnego agenta MCP.

## Quickstart

```bash
npm install
npm run build
npm start                # stdio transport

npm run drift            # spojnosc INSTRUCTIONS <-> TOOLS <-> ErrorCode
npm run test:parse       # offline - fixtures z prawdziwych odpowiedzi API
npm run smoke            # LIVE - eureka.mf.gov.pl (throttled 2 req/s)
```

Konfiguracja klienta MCP (`mcp-servers.json`):

```json
{
  "mcpServers": {
    "eureka": {
      "command": "node",
      "args": ["<sciezka>/mcp-eureka/dist/index.js"]
    }
  }
}
```

## Konektory polskiego prawa MateMatic

[`mcp-saos`](https://github.com/matematicsolutions/mcp-saos) (sady powszechne/SN/TK/KIO) ·
[`mcp-nsa`](https://github.com/matematicsolutions/mcp-nsa) (NSA + 16 WSA) ·
[`mcp-eureka`](https://github.com/matematicsolutions/mcp-eureka) (ten) ·
[`mcp-isap`](https://github.com/matematicsolutions/mcp-isap) (Dz.U. + M.P.) ·
[`mcp-krs`](https://github.com/matematicsolutions/mcp-krs) (KRS) ·
[`kio-orzeczenia-mcp`](https://github.com/matematicsolutions/kio-orzeczenia-mcp) (KIO)

Konwencja floty: jeden konektor = jedno zrodlo (single-source). Kazde wywolanie
zwraca cytowalne zrodlo, zero modyfikacji tresci, stateless.

## Disclaimer

Dane pochodza z publicznego systemu EUREKA Ministerstwa Finansow. Konektor nie
modyfikuje tresci, throttluje zapytania (max 2 req/s) i identyfikuje sie
User-Agentem z adresem repo. Interpretacja przepisow w konkretnej sprawie wymaga
wlasnej interpretacji indywidualnej lub opinii doradcy podatkowego.

## Licencja

MIT - patrz [LICENSE](./LICENSE).

Cytowanie: *MateMatic Solutions (2026), mcp-eureka - MCP server dla polskich
interpretacji podatkowych (EUREKA/KIS), https://github.com/matematicsolutions/mcp-eureka, MIT.*
