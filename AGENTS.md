# AGENTS.md - mcp-eureka

Plik standardu [agents.md](https://agents.md) (Linux Foundation / Agentic AI Foundation) - kanoniczne instrukcje dla agentow AI pracujacych z tym repozytorium.

## Cel projektu

Serwer **MCP (Model Context Protocol)** dla **polskich interpretacji podatkowych i praktyki Ministerstwa Finansow** - przez publiczne JSON API systemu **EUREKA** (`eureka.mf.gov.pl`). 550 000+ dokumentow, w tym 517 000+ interpretacji indywidualnych KIS.

Jeden z konektorow polskiego prawa MateMatic: [`mcp-saos`](https://github.com/matematicsolutions/mcp-saos), [`mcp-nsa`](https://github.com/matematicsolutions/mcp-nsa), [`mcp-eureka`](https://github.com/matematicsolutions/mcp-eureka) (ten), [`mcp-isap`](https://github.com/matematicsolutions/mcp-isap), [`mcp-krs`](https://github.com/matematicsolutions/mcp-krs), [`kio-orzeczenia-mcp`](https://github.com/matematicsolutions/kio-orzeczenia-mcp).

## Kontekst MateMatic (TWARDE OGRANICZENIA)

Repo prowadzi [MateMatic Solutions](https://matematicsolutions.com). Konektor jest **infrastruktura zaufania**.

- **Kazde wywolanie narzedzia MUSI zwracac `structuredContent.citations`** z: tytulem, URL kanonicznym (`eureka.mf.gov.pl/informacje/podglad/{id}`), sygnatura, data wydania.
- **Stateless** - bez cache zapytan z PII (jedyny cache in-memory: publiczny slownik kategorii).
- **Bez modyfikacji tresci** - zwracamy verbatim z EUREKA.
- **Throttling** - max 2 req/s do infrastruktury MF, User-Agent z adresem repo.

## Czego NIE robic (twarde reguly)

- **NIE dodawaj tools ktore wysylaja dane uzytkownika do zewnetrznych API** poza EUREKA. Konektor jest **single-source**; kazdy dodatkowy source = osobne repo MCP (konwencja floty).
- **NIE modyfikuj zwracanej tresci** - dane primary, wartosc dowodowa.
- **NIE zgaduj znaczenia id slownikowych** (PRZEPISY/ZAGADNIENIA/SLOWA_KLUCZOWE w pelnym dokumencie) - odeslij do strony zrodlowej.
- **NIE breaking-changes bez bumpu MAJOR** + wpisu w CHANGELOG.

## Build i test

```bash
npm install        # Node 18+
npm run build      # tsc -> dist/
npm run drift      # spojnosc INSTRUCTIONS <-> TOOLS <-> ErrorCode
npm run test:parse # offline fixtures (prawdziwe odpowiedzi API z 2026-07-08)
npm run smoke      # LIVE smoke przeciw eureka.mf.gov.pl
```

## Gotchas upstreamu (zweryfikowane live 2026-07-08)

1. `POST /api/public/v1/wyszukiwarka/informacje/?...` - trailing slash przed `?` OBOWIAZKOWY (bez -> HTTP 500).
2. Filtry slownikowe = tablice numerycznych id (`KATEGORIA_INFORMACJI:[1]`); liczba/string -> HTTP 500.
3. `searchQuery` pomijaj w body gdy puste (null -> HTTP 500).
4. `searchInFullPhrase:true` = dokladna fraza, czesto 0 trafien; default false.
5. Totale TYLKO z pola `totalHits` odpowiedzi wyszukiwarki.

## Zrodla prawdy

1. [README.md](./README.md)
2. [CHANGELOG.md](./CHANGELOG.md)
3. `src/index.ts`
4. [SOURCES.md](./SOURCES.md) - ledger Legal Data Hunter
5. [EUREKA](https://eureka.mf.gov.pl) - upstream

## Licencja

**MIT** - patrz [LICENSE](./LICENSE).

Cytowanie: *MateMatic Solutions (2026), mcp-eureka - MCP server dla polskich interpretacji podatkowych (EUREKA/KIS), https://github.com/matematicsolutions/mcp-eureka, MIT.*
