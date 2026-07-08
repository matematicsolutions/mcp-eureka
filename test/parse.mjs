#!/usr/bin/env node
// Offline fixture test - formattery na PRAWDZIWYCH odpowiedziach JSON API
// EUREKA zrzuconych live 2026-07-08 (probe widen-round).
//   search-fotowoltaika.json - POST wyszukiwarka/informacje/ (searchQuery=fotowoltaika)
//   detail-698723.json       - GET informacje/698723 (interpretacja indywidualna VAT)
//   categories.json          - GET pozycje-slownika/wyszukiwarka?kodSlownika=KATEGORIA_INFORMACJI

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
    formatSearchResults,
    formatDetail,
    buildSearchCitations,
    buildDetailCitation,
    buildSearchBody,
    fieldMap,
    stripHtml,
} = require(join(__dirname, "..", "dist", "index.js"));

const failures = [];
function check(cond, msg) {
    if (!cond) failures.push(msg);
}
const fx = (name) =>
    JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf-8"));

// --- buildSearchBody: ksztalt requestu ------------------------------------
{
    const { body, urlQuery } = buildSearchBody({
        query: "fotowoltaika",
        signature: "0112-KDIL3",
        categoryIds: [1],
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
        page: 2,
        pageSize: 25,
    });
    check(body.searchQuery === "fotowoltaika", "body.searchQuery");
    check(body.filter.SYG === "0112-KDIL3", "body.filter.SYG");
    check(
        Array.isArray(body.filter.KATEGORIA_INFORMACJI) &&
            body.filter.KATEGORIA_INFORMACJI[0] === 1,
        "KATEGORIA_INFORMACJI musi byc tablica liczb",
    );
    check(body.filter.DT_WYD_start === "2026-01-01", "DT_WYD_start");
    check(body.filter.DT_WYD_end === "2026-01-31", "DT_WYD_end");
    check(body.searchInFullPhrase === false, "searchInFullPhrase default false");
    check(urlQuery === "size=25&page=2&sort=DT_WYD%2Cdesc", `urlQuery: ${urlQuery}`);
}
{
    // bez query nie wysylamy searchQuery (upstream 500-uje na searchQuery:null)
    const { body } = buildSearchBody({});
    check(!("searchQuery" in body), "searchQuery pomijane gdy brak query");
}

// --- search fixture ---------------------------------------------------------
{
    const raw = fx("search-fotowoltaika.json");
    const text = formatSearchResults(raw);
    check(text.includes("Znaleziono: 721"), "formatSearchResults total 721");
    check(
        text.includes("0112-KDIL3.4012.367.2026.2.AK"),
        "formatSearchResults zawiera sygnature",
    );
    check(
        text.includes("eureka.mf.gov.pl/informacje/podglad/698723"),
        "formatSearchResults link portalu",
    );
    const cits = buildSearchCitations(raw);
    check(cits.length === raw.results.length, `citations: ${cits.length}`);
    check(
        cits[0].signature === "0112-KDIL3.4012.367.2026.2.AK",
        `citation signature: ${cits[0].signature}`,
    );
    check(cits[0].issue_date === "2026-07-03", `citation issue_date: ${cits[0].issue_date}`);
    check(
        cits[0].url === "https://eureka.mf.gov.pl/informacje/podglad/698723",
        `citation url: ${cits[0].url}`,
    );
}

// --- detail fixture ---------------------------------------------------------
{
    const detail = fx("detail-698723.json");
    const f = fieldMap(detail);
    check(f.SYG === "0112-KDIL3.4012.367.2026.2.AK", `fieldMap SYG: ${f.SYG}`);
    const text = formatDetail(detail, "Interpretacja indywidualna");
    check(text.includes("0112-KDIL3.4012.367.2026.2.AK"), "formatDetail sygnatura");
    check(text.includes("Interpretacja indywidualna"), "formatDetail kategoria");
    check(text.includes("Data wyd.  : 2026-07-03"), "formatDetail data wydania");
    check(/Tresc \(pierwsze 3000 znakow/.test(text), "formatDetail ma tresc");
    check(!/<p|<span|style=/.test(text), "formatDetail bez surowego HTML");
    const cit = buildDetailCitation(detail, "Interpretacja indywidualna");
    check(cit !== null && cit.eureka_id === "698723", `detail citation id`);
}

// --- categories fixture ------------------------------------------------------
{
    const cats = fx("categories.json");
    const interp = (cats.content ?? []).find((c) => c.id === 1);
    check(
        interp && interp.wartosc === "Interpretacja indywidualna",
        "slownik: id 1 = Interpretacja indywidualna",
    );
}

// --- stripHtml ---------------------------------------------------------------
check(
    stripHtml("<p style='x'>a&nbsp;&amp;&nbsp;b</p>") === "a & b",
    "stripHtml entity handling",
);

if (failures.length === 0) {
    console.log("OK parse - fixtures search/detail/categories + buildSearchBody.");
    process.exit(0);
}
console.error(`FAIL parse - ${failures.length} problemow:`);
for (const f of failures) console.error("  - " + f);
process.exit(1);
