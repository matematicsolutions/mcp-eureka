#!/usr/bin/env node
/**
 * Live smoke test for mcp-eureka (EUREKA MF upstream).
 *
 * Spawns the built server over stdio (MCP JSON-RPC) and validates against the
 * LIVE API:
 *   1. tools/list            -> 4 tools
 *   2. search_by_signature   -> exact sygnatura returns exactly 1 hit
 *   3. search + date range   -> total narrower than category-only query
 *   4. get_interpretation    -> full text present, matching sygnatura
 *   5. list_categories       -> id 1 = Interpretacja indywidualna
 *
 * Usage: node test/smoke.mjs   (requires `npm run build` first)
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(__dirname, "../dist/index.js");

const SIG = "0112-KDIL3.4012.367.2026.2.AK";
const DOC_ID = "698723";

let idCounter = 1;

async function runSmoke() {
    console.log("--- mcp-eureka smoke test (LIVE eureka.mf.gov.pl) ---\n");

    const child = spawn("node", [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
    child.stderr.on("data", (d) => process.stderr.write(`[server stderr] ${d}`));

    const rl = createInterface({ input: child.stdout });
    const pending = new Map();
    rl.on("line", (line) => {
        if (!line.trim()) return;
        try {
            const msg = JSON.parse(line);
            if (msg.id !== undefined && pending.has(msg.id)) {
                const { resolve, reject } = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.error) reject(new Error(`RPC error: ${msg.error.message}`));
                else resolve(msg.result);
            }
        } catch {
            /* ignore non-JSON lines */
        }
    });

    function rpc(method, params, timeoutMs = 90000) {
        return new Promise((resolveP, rejectP) => {
            const id = idCounter++;
            pending.set(id, { resolve: resolveP, reject: rejectP });
            child.stdin.write(
                JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
            );
            setTimeout(() => {
                if (pending.has(id)) {
                    pending.delete(id);
                    rejectP(new Error(`timeout ${method}`));
                }
            }, timeoutMs);
        });
    }

    const failures = [];
    const check = (cond, msg) => {
        console.log(`${cond ? "OK  " : "FAIL"} ${msg}`);
        if (!cond) failures.push(msg);
    };

    try {
        await rpc("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "smoke", version: "0.0.0" },
        });
        child.stdin.write(
            JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
        );

        // 1. tools/list
        const tools = await rpc("tools/list", {});
        check(tools.tools?.length === 4, `tools/list -> ${tools.tools?.length} tools`);

        // 2. exact signature -> 1 hit
        const bySig = await rpc("tools/call", {
            name: "search_by_signature",
            arguments: { signature: SIG },
        });
        const bySigText = bySig.content?.[0]?.text ?? "";
        check(!bySig.isError, "search_by_signature bez isError");
        check(/Znaleziono: 1 /.test(bySigText), "sygnatura exact -> 1 trafienie");
        const cits = bySig.structuredContent?.citations ?? [];
        check(cits[0]?.signature === SIG, `citation signature: ${cits[0]?.signature}`);

        // 3. date narrowing within interpretacje indywidualne
        const totalOf = (r) => {
            const m = (r.content?.[0]?.text ?? "").match(/Znaleziono:\s+(\d+)/);
            return m ? parseInt(m[1], 10) : -1;
        };
        const broad = await rpc("tools/call", {
            name: "search",
            arguments: { category_ids: [1] },
        });
        const narrow = await rpc("tools/call", {
            name: "search",
            arguments: {
                category_ids: [1],
                date_from: "2026-01-01",
                date_to: "2026-01-31",
            },
        });
        const tBroad = totalOf(broad);
        const tNarrow = totalOf(narrow);
        check(tBroad > 500000, `interpretacje indywidualne total ${tBroad} > 500000`);
        check(
            tNarrow > 0 && tNarrow < tBroad,
            `date filter narrows: ${tNarrow} < ${tBroad}`,
        );

        // 4. full document
        const doc = await rpc("tools/call", {
            name: "get_interpretation",
            arguments: { id: DOC_ID },
        });
        const docText = doc.content?.[0]?.text ?? "";
        check(!doc.isError, "get_interpretation bez isError");
        check(docText.includes(SIG), "get_interpretation sygnatura zgodna");
        check(/Tresc \(pierwsze 3000 znakow/.test(docText), "get_interpretation ma tresc");

        // 5. categories dictionary
        const cats = await rpc("tools/call", { name: "list_categories", arguments: {} });
        const catList = cats.structuredContent?.categories ?? [];
        check(
            catList.some((c) => c.id === 1 && c.name === "Interpretacja indywidualna"),
            "list_categories: id 1 = Interpretacja indywidualna",
        );
    } catch (err) {
        failures.push(String(err));
        console.error("FAIL", err);
    } finally {
        child.kill();
    }

    if (failures.length === 0) {
        console.log("\nOK smoke - wszystkie asercje live przeszly.");
        process.exit(0);
    }
    console.error(`\nFAIL smoke - ${failures.length} problemow.`);
    process.exit(1);
}

runSmoke();
