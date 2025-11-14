import fs from "node:fs";
import path from "node:path";

// === Einstellungen ===
const EXPORT_PATH = "conversations.json"; // aus deinem ChatGPT-Export
const TARGET_TITLES = [
  "Codex perspective on Gene Keys",
  "Kangenwasser und EZ-Zone",
  "Heiliger Gral Reise",
];
const OUTPUT_FILE = "architekt_dialoge.md";

// === Hilfsfunktionen ===
function tsToStr(ts) {
  try {
    const ms = ts > 1e12 ? ts : ts * 1000;
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "";
  }
}

function linearize(mapping) {
  if (!mapping || typeof mapping !== "object") return [];
  let current = Object.keys(mapping).find(k => mapping[k]?.current) || null;
  if (!current) {
    const leaves = Object.keys(mapping).filter(k => !(mapping[k]?.children?.length));
    current = leaves[0] || Object.keys(mapping)[0];
  }
  const chain = [];
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = mapping[current];
    chain.push(node);
    current = node?.parent || null;
  }
  chain.reverse();

  const out = [];
  for (const node of chain) {
    const m = node.message || {};
    const role = m.author?.role || "";
    const c = m.content || {};
    let txt = "";
    if (Array.isArray(c.parts)) {
      txt = c.parts.filter(p => typeof p === "string").join("\n");
    } else if (typeof c.text === "string") {
      txt = c.text;
    }
    txt = (txt || "").trim();
    if ((role === "user" || role === "assistant") && txt) {
      out.push({
        role,
        text: txt,
        create_time: m.create_time || node.create_time || null,
      });
    }
  }
  return out;
}

function pairMessages(messages) {
  const pairs = [];
  let i = 0;
  while (i < messages.length) {
    const user = messages[i]?.role === "user" ? messages[i] : null;
    const assistant = messages[i + (user ? 1 : 0)];
    if (user && assistant && assistant.role === "assistant") {
      pairs.push({ user, assistant });
      i += 2;
    } else if (user && (!assistant || assistant.role !== "assistant")) {
      pairs.push({ user, assistant: null });
      i += 1;
    } else {
      pairs.push({ user: null, assistant: messages[i] });
      i += 1;
    }
  }
  return pairs;
}

// === Hauptfunktion ===
(function main() {
  if (!fs.existsSync(EXPORT_PATH)) {
    console.error("Datei conversations.json nicht gefunden.");
    process.exit(1);
  }

  // Robust JSON loading: support both array and object root
  const raw = JSON.parse(fs.readFileSync(EXPORT_PATH, "utf-8"));
  const convs = Array.isArray(raw) ? raw : raw.conversations || [];
  console.log(`[DEBUG] Loaded ${convs.length} conversations.`);

  // Normalize titles for matching
  function normalize(str) {
    return (str || "").toLowerCase().trim();
  }
  const normalizedTargets = TARGET_TITLES.map(normalize);

  const selected = convs.filter(c => normalizedTargets.includes(normalize(c.title)));
  console.log(`[DEBUG] Matched ${selected.length} conversations.`);
  if (!selected.length) {
    console.log("[DEBUG] First 5 titles:", convs.slice(0, 5).map(c => c.title));
    console.error("Keine passenden Konversationen gefunden. Prüfe TARGET_TITLES.");
    process.exit(1);
  }

  const lines = [];
  lines.push("# Gesamtextrakt des Werkes\n");

  for (const conv of selected) {
    lines.push(`\n---\n\n## Quelle: ${conv.title}\n`);
    const msgs = linearize(conv.mapping || {});
    const pairs = pairMessages(msgs);

    for (const pair of pairs) {
      if (pair.user) {
        const t = tsToStr(pair.user.create_time);
        lines.push(`**Karl (${t})**  `);
        lines.push(`> ${pair.user.text.replace(/\n/g, "\n> ")}\n`);
      }
      if (pair.assistant) {
        const t = tsToStr(pair.assistant.create_time);
        lines.push(`**Architekt (${t})**  `);
        lines.push(`> ${pair.assistant.text.replace(/\n/g, "\n> ")}\n`);
      }
      lines.push("\n---\n");
    }
  }

  fs.writeFileSync(path.resolve(OUTPUT_FILE), lines.join("\n"), "utf-8");
  console.log("Fertig. Datei erstellt:", OUTPUT_FILE);
})();