#!/usr/bin/env node
// Drift test - INSTRUCTIONS spojne z TOOLS i typem ErrorCode.
// Pattern z dograh v1.31.0 (BSD-2) via mcp-eu-compliance v0.2.0.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf-8");

const failures = [];

const instructionsMatch = SRC.match(/const INSTRUCTIONS = `([\s\S]*?)`;/);
if (!instructionsMatch) {
    failures.push("Nie znaleziono const INSTRUCTIONS w src/index.ts");
} else {
    const instructions = instructionsMatch[1];

    const toolsBlock = SRC.match(/const TOOLS\s*=\s*\[([\s\S]*?)\]\s*as const;|const TOOLS\s*=\s*\[([\s\S]*?)\];/);
    const toolsSource = toolsBlock ? (toolsBlock[1] || toolsBlock[2] || "") : SRC;
    const toolsMatches = [...toolsSource.matchAll(/name:\s*"([a-z][a-z0-9_]+)"/g)];
    const registered = new Set(toolsMatches.map((m) => m[1]));

    // Parametry toolow wolno wymieniac w INSTRUCTIONS bez bycia toolem.
    const paramNames = new Set(
        [...toolsSource.matchAll(/^\s{16}([a-z][a-z0-9_]+):\s*\{/gm)].map((m) => m[1]),
    );

    const referenced = new Set();
    for (const m of instructions.matchAll(/`([a-z][a-z0-9_]{3,})`/g)) {
        const skip = new Set([
            "isError", "true", "false", "null", "undefined", "structuredContent",
        ]);
        if (!skip.has(m[1])) referenced.add(m[1]);
    }

    for (const ref of referenced) {
        const looksLikeTool = ref.includes("_") || registered.has(ref);
        if (!looksLikeTool) continue;
        if (paramNames.has(ref)) continue;
        if (!registered.has(ref)) {
            failures.push(
                `INSTRUCTIONS referencuje tool '${ref}' ktorego nie ma w TOOLS. ` +
                    `Registered: ${[...registered].sort().join(", ")}`,
            );
        }
    }
}

const typeMatch = SRC.match(/type ErrorCode\s*=\s*([^;]+);/);
if (!typeMatch) {
    failures.push("Nie znaleziono type ErrorCode w src/index.ts");
} else {
    const codesInType = new Set();
    for (const m of typeMatch[1].matchAll(/"(\w+)"/g)) codesInType.add(m[1]);

    const instructionsText = instructionsMatch ? instructionsMatch[1] : "";
    for (const code of codesInType) {
        const docPattern = new RegExp("\\b" + code + "\\b");
        if (!docPattern.test(instructionsText)) {
            failures.push(`ErrorCode '${code}' w typie TS nie jest udokumentowany w INSTRUCTIONS.`);
        }
    }

    for (const m of SRC.matchAll(/errorResult\([^,)]+,\s*"(\w+)"\)/g)) {
        if (!codesInType.has(m[1])) {
            failures.push(`errorResult uzywa kodu '${m[1]}' ktorego nie ma w typie ErrorCode.`);
        }
    }
}

if (failures.length === 0) {
    console.log("OK drift - INSTRUCTIONS i ErrorCode spojne z TOOLS i kodem.");
    process.exit(0);
}

console.error("FAIL drift - znaleziono " + failures.length + " problemow:");
for (const f of failures) console.error("  - " + f);
process.exit(1);
