#!/usr/bin/env node
// MCP server - Polish tax interpretations and MF guidance via EUREKA
// (System Informacji Celno-Skarbowej EUREKA, eureka.mf.gov.pl).
//
// Najwiekszy pojedynczy korpus polskiej praktyki podatkowej: 550 000+
// dokumentow, w tym 517 000+ interpretacji indywidualnych KIS (Krajowa
// Informacja Skarbowa), interpretacje ogolne, objasnienia podatkowe, WIS/WIA.
//
// Backend: publiczne JSON API Angular SPA (bez klucza), zweryfikowane live
// 2026-07-08. POST /api/public/v1/wyszukiwarka/informacje/ (UWAGA: trailing
// slash przed query stringiem jest OBOWIAZKOWY - bez niego HTTP 500).
//
// Tooly:
//   - search              - fraza + filtry (sygnatura, kategoria, zakres dat)
//   - get_interpretation  - pelny dokument po ID_INFORMACJI
//   - search_by_signature - skrot: po sygnaturze (np. 0112-KDIL3.4012.367.2026.2.AK)
//   - list_categories     - slownik kategorii (id -> nazwa) do filtra category_ids
//
// structuredContent.citations w kazdej zwrotce - Patron czyta automatycznie.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import https from "node:https";
import { URL } from "node:url";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EUREKA_BASE = "https://eureka.mf.gov.pl/api/public/v1";
const PORTAL_BASE = "https://eureka.mf.gov.pl";
const USER_AGENT =
    "Mozilla/5.0 (compatible; mcp-eureka/0.1; +https://github.com/matematicsolutions/mcp-eureka)";
const HTTP_TIMEOUT_MS = 40000;

const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 50;

// Kolumny zwracane w wynikach wyszukiwania (podzbior kolumn UI EUREKA).
const SEARCH_COLUMNS = [
    "ID_INFORMACJI",
    "KATEGORIA_INFORMACJI",
    "SYG",
    "DT_WYD",
    "TEZA",
    "STATUS_INFORMACJI",
];

// ---------------------------------------------------------------------------
// Throttle - grzecznie max 2 req/s do infrastruktury MF
// ---------------------------------------------------------------------------

const MIN_INTERVAL_MS = 500;
let lastRequestAt = 0;
async function throttled<T>(fn: () => Promise<T>): Promise<T> {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
}

// ---------------------------------------------------------------------------
// HTTP helper - JSON in / JSON out, bez zewnetrznych zaleznosci
// ---------------------------------------------------------------------------

function httpJson(args: {
    url: string;
    method?: "GET" | "POST";
    body?: unknown;
}): Promise<unknown> {
    const { url, method = "GET", body } = args;
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const payload = body !== undefined ? JSON.stringify(body) : undefined;
        const headers: Record<string, string> = {
            "User-Agent": USER_AGENT,
            Accept: "application/json",
        };
        if (payload) {
            headers["Content-Type"] = "application/json";
            headers["Content-Length"] = String(Buffer.byteLength(payload));
        }
        const req = https.request(
            {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method,
                headers,
                timeout: HTTP_TIMEOUT_MS,
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on("data", (c: Buffer) => chunks.push(c));
                res.on("end", () => {
                    const text = Buffer.concat(chunks).toString("utf8");
                    if (!res.statusCode || res.statusCode >= 400) {
                        reject(
                            new Error(
                                `HTTP ${res.statusCode} for ${url}: ${text.slice(0, 300)}`,
                            ),
                        );
                        return;
                    }
                    try {
                        resolve(JSON.parse(text));
                    } catch {
                        reject(
                            new Error(`Invalid JSON from EUREKA: ${text.slice(0, 200)}`),
                        );
                    }
                });
                res.on("error", reject);
            },
        );
        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy(new Error(`HTTP timeout ${HTTP_TIMEOUT_MS}ms for ${url}`));
        });
        if (payload) req.write(payload);
        req.end();
    });
}

// ---------------------------------------------------------------------------
// HTML stripping (tresc interpretacji przychodzi jako HTML)
// ---------------------------------------------------------------------------

export function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/\s{2,}/g, " ")
        .trim();
}

// ---------------------------------------------------------------------------
// EUREKA API wrappers
// ---------------------------------------------------------------------------

export interface EurekaSearchParams {
    query?: string;
    fullPhrase?: boolean;
    signature?: string;
    categoryIds?: number[];
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
}

interface EurekaSearchResult {
    ID_INFORMACJI?: string;
    KATEGORIA_INFORMACJI?: string[] | string;
    SYG?: string;
    DT_WYD?: string;
    TEZA?: string;
    STATUS_INFORMACJI?: string[] | string;
    [key: string]: unknown;
}

interface EurekaSearchResponse {
    results?: EurekaSearchResult[];
    totalHits?: number | null;
}

export function buildSearchBody(params: EurekaSearchParams): {
    body: Record<string, unknown>;
    urlQuery: string;
} {
    const filter: Record<string, unknown> = {};
    if (params.signature) filter["SYG"] = params.signature;
    // Filtr slownikowy przyjmuje TABLICE numerycznych id pozycji slownika
    // (KATEGORIA_INFORMACJI:[1] = interpretacje indywidualne). Pojedyncza
    // liczba lub string -> HTTP 500 (zweryfikowane live 2026-07-08).
    if (params.categoryIds && params.categoryIds.length > 0) {
        filter["KATEGORIA_INFORMACJI"] = params.categoryIds;
    }
    if (params.dateFrom) filter["DT_WYD_start"] = params.dateFrom;
    if (params.dateTo) filter["DT_WYD_end"] = params.dateTo;

    const body: Record<string, unknown> = {
        filter,
        columns: SEARCH_COLUMNS,
        searchInFullPhrase: params.fullPhrase ?? false,
        searchInContent: false,
        searchInSynonyms: false,
        warunkiDodatkowe: [],
    };
    if (params.query) body["searchQuery"] = params.query;

    const size = Math.min(
        PAGE_SIZE_MAX,
        Math.max(1, params.pageSize ?? PAGE_SIZE_DEFAULT),
    );
    const page = Math.max(0, params.page ?? 0);
    const urlQuery = `size=${size}&page=${page}&sort=DT_WYD%2Cdesc`;
    return { body, urlQuery };
}

async function eurekaSearch(
    params: EurekaSearchParams,
): Promise<EurekaSearchResponse> {
    const { body, urlQuery } = buildSearchBody(params);
    // Trailing slash przed "?" jest wymagany - bez niego backend zwraca 500.
    const url = `${EUREKA_BASE}/wyszukiwarka/informacje/?${urlQuery}`;
    return (await throttled(() =>
        httpJson({ url, method: "POST", body }),
    )) as EurekaSearchResponse;
}

interface EurekaDocField {
    key: string;
    value?: unknown;
}

interface EurekaDetail {
    id?: number;
    nazwa?: string;
    dokument?: { fields?: EurekaDocField[] };
}

async function eurekaGetDetail(id: string | number): Promise<EurekaDetail> {
    const safeId = String(id).replace(/[^0-9]/g, "");
    if (!safeId) throw new Error("Pusty identyfikator informacji");
    const url = `${EUREKA_BASE}/informacje/${safeId}`;
    return (await throttled(() => httpJson({ url }))) as EurekaDetail;
}

interface CategoryEntry {
    id: number;
    wartosc: string;
}

interface CategoriesResponse {
    content?: CategoryEntry[];
    totalElements?: number;
}

// In-memory cache slownika kategorii (publiczny slownik, zero PII).
let categoriesCache: CategoryEntry[] | null = null;

async function eurekaCategories(): Promise<CategoryEntry[]> {
    if (categoriesCache) return categoriesCache;
    const url =
        `${EUREKA_BASE}/pozycje-slownika/wyszukiwarka` +
        `?kodSlownika=KATEGORIA_INFORMACJI&size=100&page=0&sort=kolejnosc,asc`;
    const raw = (await throttled(() => httpJson({ url }))) as CategoriesResponse;
    categoriesCache = (raw.content ?? []).map((c) => ({
        id: c.id,
        wartosc: c.wartosc,
    }));
    return categoriesCache;
}

// ---------------------------------------------------------------------------
// Field helpers + formatters
// ---------------------------------------------------------------------------

export function fieldMap(detail: EurekaDetail): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of detail.dokument?.fields ?? []) {
        if (f.key) out[f.key] = f.value;
    }
    return out;
}

function asText(v: unknown): string {
    if (v === undefined || v === null) return "";
    if (Array.isArray(v)) return v.map(String).join(", ");
    return String(v);
}

function dateOnly(v: unknown): string {
    const s = asText(v);
    return s.length >= 10 ? s.slice(0, 10) : s;
}

function portalUrl(id: string | number): string {
    return `${PORTAL_BASE}/informacje/podglad/${id}`;
}

export function formatSearchResults(raw: EurekaSearchResponse): string {
    const items = raw.results ?? [];
    const total = raw.totalHits ?? 0;
    if (items.length === 0) {
        return (
            "Brak wynikow w bazie EUREKA dla podanych kryteriow.\n\n" +
            "Podpowiedz: searchQuery szuka slow niezaleznie (full_phrase=false " +
            "domyslnie); fraza w cudzyslowie z full_phrase=true wymaga DOKLADNEGO " +
            "wystapienia i czesto daje 0 trafien. Sygnatura moze byc czesciowa " +
            "(prefiks, np. '0112-KDIL3')."
        );
    }
    const lines: string[] = [
        `Znaleziono: ${total} dokumentow (pokazano ${items.length}).`,
        "",
    ];
    for (const it of items) {
        const id = asText(it.ID_INFORMACJI);
        const syg = asText(it.SYG) || "brak_sygnatury";
        const kat = asText(it.KATEGORIA_INFORMACJI);
        const teza = asText(it.TEZA);
        lines.push(`[${id}] ${syg}`);
        lines.push(`  Data wydania: ${dateOnly(it.DT_WYD)} | Kategoria: ${kat || "?"}`);
        if (teza) lines.push(`  Teza: ${teza.slice(0, 300)}`);
        lines.push(`  Link: ${portalUrl(id)}`);
        lines.push("");
    }
    if (typeof total === "number" && total > items.length) {
        lines.push(`[Wiecej wynikow: ${total - items.length}. Zwieksz page o 1.]`);
    }
    return lines.join("\n");
}

const TEXT_PREVIEW_CHARS = 3000;

export function formatDetail(
    detail: EurekaDetail,
    categoryName?: string,
): string {
    const f = fieldMap(detail);
    const id = asText(f["ID_INFORMACJI"]) || String(detail.id ?? "?");
    const syg = asText(f["SYG"]);
    const teza = asText(f["TEZA"]);
    const fullText = stripHtml(asText(f["TRESC_INTERESARIUSZ"]));

    const lines: string[] = [
        "=== DOKUMENT EUREKA (KIS / Ministerstwo Finansow) ===",
        "",
        `ID         : ${id}`,
        `Sygnatura  : ${syg || "-"}`,
        `Kategoria  : ${categoryName ?? detail.nazwa ?? "-"}`,
        `Data wyd.  : ${dateOnly(f["DT_WYD"])}`,
        `Data publ. : ${dateOnly(f["DATA_PUBLIKACJI"])}`,
    ];
    if (teza) lines.push(`Teza       : ${teza}`);
    lines.push("", `URL        : ${portalUrl(id)}`);
    lines.push(
        "",
        "Uwaga: pola slownikowe (PRZEPISY, ZAGADNIENIA, SLOWA_KLUCZOWE) to id " +
            "pozycji slownika EUREKA - pelne wartosci na stronie zrodlowej.",
    );
    if (fullText) {
        const preview = fullText.slice(0, TEXT_PREVIEW_CHARS);
        lines.push(
            "",
            `--- Tresc (pierwsze ${Math.min(TEXT_PREVIEW_CHARS, fullText.length)} znakow z ${fullText.length} lacznie) ---`,
            preview,
        );
        if (fullText.length > TEXT_PREVIEW_CHARS) {
            lines.push(`[...] Skrocono. Pelna tresc: ${portalUrl(id)}`);
        }
    }
    return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Citations (kontrakt Patron: structuredContent.citations)
// ---------------------------------------------------------------------------

interface EurekaCitation {
    title: string;
    url: string;
    snippet?: string;
    signature?: string;
    category?: string;
    issue_date?: string;
    eureka_id?: string;
}

export function buildSearchCitations(raw: EurekaSearchResponse): EurekaCitation[] {
    const out: EurekaCitation[] = [];
    for (const it of raw.results ?? []) {
        const id = asText(it.ID_INFORMACJI);
        if (!id) continue;
        const syg = asText(it.SYG);
        const kat = asText(it.KATEGORIA_INFORMACJI);
        const teza = asText(it.TEZA);
        out.push({
            title: [syg, kat].filter(Boolean).join(" - ") || `EUREKA #${id}`,
            url: portalUrl(id),
            ...(teza && { snippet: teza.slice(0, 200) }),
            ...(syg && { signature: syg }),
            ...(kat && { category: kat }),
            ...(it.DT_WYD !== undefined && { issue_date: dateOnly(it.DT_WYD) }),
            eureka_id: id,
        });
    }
    return out;
}

export function buildDetailCitation(
    detail: EurekaDetail,
    categoryName?: string,
): EurekaCitation | null {
    const f = fieldMap(detail);
    const id = asText(f["ID_INFORMACJI"]) || (detail.id ? String(detail.id) : "");
    if (!id) return null;
    const syg = asText(f["SYG"]);
    const teza = asText(f["TEZA"]);
    return {
        title: [syg, categoryName ?? detail.nazwa].filter(Boolean).join(" - ") ||
            `EUREKA #${id}`,
        url: portalUrl(id),
        ...(teza && { snippet: teza.slice(0, 200) }),
        ...(syg && { signature: syg }),
        ...(categoryName && { category: categoryName }),
        ...(f["DT_WYD"] !== undefined && { issue_date: dateOnly(f["DT_WYD"]) }),
        eureka_id: id,
    };
}

// ---------------------------------------------------------------------------
// Instructions (procedural orchestration)
// Pattern z dograh v1.31.0 (BSD-2) via mcp-eu-compliance v0.2.0.
// ---------------------------------------------------------------------------

const INSTRUCTIONS = `Ten serwer MCP udostepnia system EUREKA Ministerstwa Finansow (eureka.mf.gov.pl) - 550 000+ dokumentow polskiej praktyki podatkowej, w tym 517 000+ interpretacji indywidualnych Krajowej Informacji Skarbowej (KIS), interpretacje ogolne, objasnienia podatkowe, wiazace informacje stawkowe (WIS) i akcyzowe (WIA).

## Kolejnosc wywolan

### Szukanie po sygnaturze
1. \`search_by_signature\` - jesli uzytkownik podal sygnature interpretacji (np. '0112-KDIL3.4012.367.2026.2.AK'). Dziala tez prefiks (np. '0112-KDIL3').

### Szerokie szukanie
2. \`search\` - fraza (query), kategoria (category_ids - id ze slownika, np. [1] = interpretacje indywidualne), zakres dat wydania (date_from/date_to, YYYY-MM-DD). Sort: data wydania malejaco.
3. \`list_categories\` - slownik kategorii dokumentow (28 pozycji, id -> nazwa) gdy trzeba dobrac category_ids.

### Pelny tekst
4. \`get_interpretation\` - po ID_INFORMACJI (z wynikow search) zwraca teze + pierwsze 3000 znakow pelnej tresci.

## Twarde ograniczenia

- **Interpretacje nie sa zrodlem prawa** - to praktyka organow (Ordynacja podatkowa art. 14a-14s). Ochrona prawna przysluguje wnioskodawcy danej interpretacji indywidualnej. Zawsze to zaznacz.
- **Pola slownikowe w pelnym dokumencie** (PRZEPISY, ZAGADNIENIA, SLOWA_KLUCZOWE) to numeryczne id - NIE zgaduj ich znaczenia, odeslij do strony zrodlowej.
- **Bez modyfikacji tresci** - zwracamy verbatim z EUREKA. To wartosc dowodowa.
- **Stateless, bez cache PII** - kazde wywolanie idzie do upstream (jedyny cache: publiczny slownik kategorii).
- **\`structuredContent.citations\`** zawsze: title, url (eureka.mf.gov.pl/informacje/podglad/{id}), signature, issue_date. Cytuj w odpowiedzi koncowej.

## Iteracja po bledach

Tool zwraca \`isError: true\` + tekst z prefixem \`[code]\`. Kody:
- \`missing_arg\` - brak wymaganego parametru (id / signature). Przeczytaj inputSchema.
- \`not_found\` - dokument o tym ID nie istnieje w EUREKA.
- \`invalid_filter\` - zly ksztalt filtra (np. category_ids nie-numeryczne).
- \`upstream_error\` - blad API EUREKA (HTTP 5xx, timeout 40s). Retry raz przed surface do uzytkownika.

## Styl odpowiedzi

- Cytuj sygnature z data wydania: "0112-KDIL3.4012.367.2026.2.AK (KIS, 2026-07-03)".
- Przy pytaniu o linie interpretacyjna sortuj chronologicznie i wskazuj zmiany stanowiska organow.
- NIE wymyslaj sygnatur - kazda z \`structuredContent.citations\`.
- Dodawaj disclaimer: interpretacja chroni wnioskodawce; w indywidualnej sprawie potrzebna wlasna interpretacja lub opinia doradcy podatkowego.`;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const READ_ONLY_ANNOTATIONS = {
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    openWorldHint: true, // upstream API zywe
} as const;

const TOOLS = [
    {
        name: "search",
        annotations: READ_ONLY_ANNOTATIONS,
        description:
            "Przeszukuje EUREKA (eureka.mf.gov.pl) - 550 000+ dokumentow praktyki " +
            "podatkowej Ministerstwa Finansow i KIS: interpretacje indywidualne " +
            "(517 000+), interpretacje ogolne, objasnienia podatkowe, WIS, WIA. " +
            "Fraza (query) szuka slow niezaleznie; filtry: sygnatura (takze prefiks), " +
            "kategoria (category_ids ze slownika list_categories), zakres dat wydania. " +
            "Wyniki sortowane data wydania malejaco. " +
            "Bledy: `invalid_filter` (zly filtr), `upstream_error` (HTTP/timeout).",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description:
                        "Fraza wyszukiwania, np. 'fotowoltaika' albo 'ulga badawczo-rozwojowa'.",
                },
                full_phrase: {
                    type: "boolean",
                    description:
                        "true = fraza musi wystapic DOKLADNIE (czesto 0 trafien); " +
                        "false (domyslnie) = slowa niezaleznie.",
                },
                signature: {
                    type: "string",
                    description:
                        "Sygnatura dokumentu, pelna ('0112-KDIL3.4012.367.2026.2.AK') " +
                        "lub prefiks ('0112-KDIL3').",
                },
                category_ids: {
                    type: "array",
                    items: { type: "number" },
                    description:
                        "Id kategorii ze slownika (list_categories). Np. [1] = " +
                        "interpretacja indywidualna, [3] = interpretacja ogolna, " +
                        "[11] = objasnienia podatkowe.",
                },
                date_from: {
                    type: "string",
                    description: "Data wydania od (YYYY-MM-DD).",
                },
                date_to: {
                    type: "string",
                    description: "Data wydania do (YYYY-MM-DD).",
                },
                page: {
                    type: "number",
                    description: "Numer strony (od 0). Do paginacji.",
                    minimum: 0,
                },
                page_size: {
                    type: "number",
                    description: "Liczba wynikow na strone (1-50). Domyslnie 10.",
                    minimum: 1,
                    maximum: 50,
                },
            },
            required: [],
        },
    },
    {
        name: "get_interpretation",
        annotations: READ_ONLY_ANNOTATIONS,
        description:
            "Pobiera pelny dokument EUREKA po ID_INFORMACJI (z wynikow 'search'). " +
            "Zwraca metadane (sygnatura, kategoria, daty), teze i pierwsze 3000 " +
            "znakow pelnej tresci (HTML odarty do tekstu). " +
            "Bledy: `missing_arg` (brak id), `not_found` (id poza baza), `upstream_error`.",
        inputSchema: {
            type: "object",
            properties: {
                id: {
                    type: ["string", "number"],
                    description: "Numeryczne ID_INFORMACJI, np. 698723 lub '698723'.",
                },
            },
            required: ["id"],
        },
    },
    {
        name: "search_by_signature",
        annotations: READ_ONLY_ANNOTATIONS,
        description:
            "Skrot: szuka dokumentu po sygnaturze (pelnej lub prefiksie). " +
            "Odpowiednik search z parametrem signature. " +
            "Bledy: `missing_arg` (brak signature), `upstream_error`.",
        inputSchema: {
            type: "object",
            properties: {
                signature: {
                    type: "string",
                    description:
                        "Sygnatura, np. '0112-KDIL3.4012.367.2026.2.AK' albo prefiks '0114-KDIP2'.",
                },
            },
            required: ["signature"],
        },
    },
    {
        name: "list_categories",
        annotations: READ_ONLY_ANNOTATIONS,
        description:
            "Zwraca slownik kategorii dokumentow EUREKA (id -> nazwa, 28 pozycji): " +
            "interpretacje indywidualne/ogolne, objasnienia podatkowe, WIS, WIA, " +
            "orzeczenia sadow itd. Uzyj id w parametrze category_ids narzedzia search. " +
            "Bledy: `upstream_error`.",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
] as const;

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

type ErrorCode = "missing_arg" | "not_found" | "upstream_error" | "invalid_filter";

function errorResult(text: string, code: ErrorCode) {
    return {
        content: [{ type: "text" as const, text: `[${code}] ${text}` }],
        structuredContent: { error_code: code },
        isError: true,
    };
}

const server = new Server(
    { name: "mcp-eureka", version: "0.1.0" }, // keep in sync with package.json "version"
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: t.annotations,
    })),
}));

async function categoryNameFor(detail: EurekaDetail): Promise<string | undefined> {
    try {
        const catId = fieldMap(detail)["KATEGORIA_INFORMACJI"];
        const idNum = parseInt(asText(catId), 10);
        if (!Number.isFinite(idNum)) return undefined;
        const cats = await eurekaCategories();
        return cats.find((c) => c.id === idNum)?.wartosc;
    } catch {
        return undefined; // slownik jest opcjonalnym ulepszeniem, nie blokuje detail
    }
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;

    try {
        switch (name) {
            case "search": {
                let categoryIds: number[] | undefined;
                if (a.category_ids !== undefined) {
                    if (
                        !Array.isArray(a.category_ids) ||
                        a.category_ids.some((x) => typeof x !== "number")
                    ) {
                        return errorResult(
                            "category_ids musi byc tablica liczb (id ze slownika list_categories), np. [1].",
                            "invalid_filter",
                        );
                    }
                    categoryIds = a.category_ids as number[];
                }
                const raw = await eurekaSearch({
                    query: typeof a.query === "string" ? a.query : undefined,
                    fullPhrase:
                        typeof a.full_phrase === "boolean" ? a.full_phrase : undefined,
                    signature:
                        typeof a.signature === "string" ? a.signature : undefined,
                    categoryIds,
                    dateFrom:
                        typeof a.date_from === "string" ? a.date_from : undefined,
                    dateTo: typeof a.date_to === "string" ? a.date_to : undefined,
                    page: typeof a.page === "number" ? a.page : undefined,
                    pageSize:
                        typeof a.page_size === "number" ? a.page_size : undefined,
                });
                return {
                    content: [{ type: "text", text: formatSearchResults(raw) }],
                    structuredContent: { citations: buildSearchCitations(raw) },
                };
            }

            case "get_interpretation": {
                if (a.id === undefined || a.id === null || a.id === "") {
                    return errorResult("parametr 'id' jest wymagany.", "missing_arg");
                }
                let detail: EurekaDetail;
                try {
                    detail = await eurekaGetDetail(a.id as string | number);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (/HTTP 404/.test(msg)) {
                        return errorResult(
                            `Dokument ID ${a.id} nie istnieje w EUREKA. Sprawdz ID przez 'search'.`,
                            "not_found",
                        );
                    }
                    throw err;
                }
                const catName = await categoryNameFor(detail);
                const citation = buildDetailCitation(detail, catName);
                return {
                    content: [{ type: "text", text: formatDetail(detail, catName) }],
                    structuredContent: { citations: citation ? [citation] : [] },
                };
            }

            case "search_by_signature": {
                if (!a.signature || typeof a.signature !== "string") {
                    return errorResult(
                        "parametr 'signature' jest wymagany.",
                        "missing_arg",
                    );
                }
                const raw = await eurekaSearch({ signature: a.signature });
                return {
                    content: [{ type: "text", text: formatSearchResults(raw) }],
                    structuredContent: { citations: buildSearchCitations(raw) },
                };
            }

            case "list_categories": {
                const cats = await eurekaCategories();
                const lines = [
                    `Kategorie dokumentow EUREKA (${cats.length}):`,
                    "",
                    ...cats.map((c) => `  ${c.id} - ${c.wartosc}`),
                    "",
                    "Uzyj id w parametrze category_ids narzedzia search, np. category_ids=[1].",
                ];
                return {
                    content: [{ type: "text", text: lines.join("\n") }],
                    structuredContent: {
                        categories: cats.map((c) => ({ id: c.id, name: c.wartosc })),
                    },
                };
            }

            default:
                return errorResult(`Nieznane narzedzie: ${name}`, "missing_arg");
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResult(
            `Blad komunikacji z API EUREKA (eureka.mf.gov.pl): ${msg}. Sprobuj ponownie za chwile.`,
            "upstream_error",
        );
    }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Log to stderr only - stdout is reserved for MCP JSON-RPC protocol
    process.stderr.write("mcp-eureka server started (stdio transport)\n");
}

// Uruchamiaj serwer tylko przy bezposrednim wykonaniu - testy fixture
// importuja formattery z tego modulu bez startowania stdio transportu.
if (require.main === module) {
    main().catch((err) => {
        process.stderr.write(`Fatal error: ${err}\n`);
        process.exit(1);
    });
}
