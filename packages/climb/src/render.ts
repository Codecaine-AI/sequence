import { useHarfBuzz } from "@codecaine-ai/text-measure/headless";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { chromium, type Browser } from "playwright";

// This checkout's sequence package, by relative path (see paths.ts).
import { parseSequenceProgram, serializeSequenceProgram } from "../../sequence/src/language/index.ts";
import { layoutSequence } from "../../sequence/src/layout.ts";
import { renderSequenceSvgString } from "../../sequence/src/render/SequenceDiagram.tsx";
import { validateSequenceDocument, type SequenceDocument, type SequenceItem } from "../../sequence/src/schema.ts";
import { SEQUENCE_THEME_DEFAULTS, sequenceThemeCssVars } from "../../sequence/src/theme.ts";
import { runLints } from "./lints.ts";
import { runPaths } from "./paths.ts";
import { readRound, type RoundBrief } from "./round.ts";
import { transcriptMetrics } from "./transcript.ts";

/** Fixed render settings: every round's PNGs are comparable. */
export const RENDER = { theme: "light", deviceScaleFactor: 2, padding: 24 } as const;
const INTER_WEIGHTS = { 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold" } as const;

/** @font-face rules for the bundled Inter, inlined as data URLs so the page needs no file access. */
async function interFontFaces(): Promise<string> {
  const fonts = join(dirname(Bun.resolveSync("@codecaine-ai/text-measure/fonts.css", import.meta.dir)), "fonts");
  const rules: string[] = [];
  for (const [weight, name] of Object.entries(INTER_WEIGHTS)) {
    const data = Buffer.from(await readFile(join(fonts, `Inter-${name}.woff2`))).toString("base64");
    rules.push(`@font-face { font-family: "Inter"; font-style: normal; font-weight: ${weight}; src: url(data:font/woff2;base64,${data}) format("woff2"); }`);
  }
  return rules.join("\n");
}

/** The page a PNG is cut from: the light-theme `--seq-*` values pinned, light page background, Inter loaded. */
function pageHtml({ svg, fontFaces }: { svg: string; fontFaces: string }): string {
  const variables = Object.entries(sequenceThemeCssVars(RENDER.theme)).map(([name, value]) => `${name}: ${value};`).join(" ");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces}
html, body { margin: 0; background: ${SEQUENCE_THEME_DEFAULTS.background}; }
#frame { display: inline-block; padding: ${RENDER.padding}px; background: ${SEQUENCE_THEME_DEFAULTS.background}; ${variables} }
#frame svg { display: block; }
</style></head><body><div id="frame">${svg}</div></body></html>`;
}

function countItems(items: readonly SequenceItem[]): { messages: number; fragments: number; notes: number } {
  const counts = { messages: 0, fragments: 0, notes: 0 };
  for (const item of items) {
    if (item.kind === "message") counts.messages += 1;
    else if (item.kind === "note") counts.notes += 1;
    else {
      counts.fragments += 1;
      for (const operand of item.operands) {
        const inner = countItems(operand.items);
        counts.messages += inner.messages;
        counts.fragments += inner.fragments;
        counts.notes += inner.notes;
      }
    }
  }
  return counts;
}

async function readTranscript(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch(() => undefined);
}

async function renderBrief({ entry, runDir, browser, fontFaces }: { entry: RoundBrief; runDir: string; browser: Browser; fontFaces: string }) {
  const paths = runPaths(runDir);
  const dir = paths.brief(entry.slug);
  const sidecarPath = join(paths.root, entry.sidecar);
  // A render that fails below must leave no earlier picture for the judges to score.
  await Promise.all(["program.txt", "diagram.svg", "diagram.png"].map((file) => rm(join(dir, file), { force: true })));
  const raw: unknown = JSON.parse(await readFile(sidecarPath, "utf8"));
  const schema = validateSequenceDocument(raw);
  const transcript = await readTranscript(join(dir, "transcript.jsonl"));
  const draw = transcript === undefined ? undefined : transcriptMetrics(transcript);
  const base = { slug: entry.slug, sidecar: entry.sidecar, schema, draw: draw ?? null };

  if (!schema.ok) {
    await writeFile(join(dir, "metrics.json"), `${JSON.stringify({ ...base, rendered: false }, null, 2)}\n`);
    return { slug: entry.slug, rendered: false, problems: schema.errors.length };
  }
  // validateSequenceDocument just accepted it.
  const sequence = raw as SequenceDocument;
  const program = serializeSequenceProgram(sequence);
  const reparsed = parseSequenceProgram(program);
  const lints = await runLints(sequence);
  const layout = layoutSequence(sequence);
  const svg = renderSequenceSvgString(sequence);
  await writeFile(join(dir, "program.txt"), program);
  await writeFile(join(dir, "diagram.svg"), svg);

  const page = await browser.newPage({ deviceScaleFactor: RENDER.deviceScaleFactor, viewport: { width: 800, height: 600 } });
  try {
    await page.setContent(pageHtml({ svg, fontFaces }), { waitUntil: "load" });
    // Load every bundled weight before the screenshot; a face the SVG uses but the page never loaded would paint a fallback.
    const fontsLoaded = await page.evaluate(async (weights) => {
      const loaded = await Promise.all(weights.map((weight) => document.fonts.load(`${weight} 12px Inter`)));
      await document.fonts.ready;
      return loaded.every((faces) => faces.length > 0) && weights.every((weight) => document.fonts.check(`${weight} 12px Inter`));
    }, Object.keys(INTER_WEIGHTS));
    await page.locator("#frame").screenshot({ path: join(dir, "diagram.png") });
    const counts = countItems(sequence.items);
    const metrics = {
      ...base,
      rendered: true,
      program: { ok: reparsed.ok, errors: reparsed.ok ? [] : reparsed.errors, lines: program.split("\n").length },
      lints: lints.results,
      lintsAvailable: lints.available,
      diagram: {
        title: sequence.title ?? null,
        participants: sequence.participants.length,
        ...counts,
        empty: sequence.participants.length === 0,
        width: layout.width,
        height: layout.height,
      },
      render: { ...RENDER, fontsLoaded },
    };
    await writeFile(join(dir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
    return { slug: entry.slug, rendered: true, problems: (reparsed.ok ? 0 : reparsed.errors.length) + lints.results.length + (fontsLoaded ? 0 : 1) };
  } finally {
    await page.close();
  }
}

export async function runRender({ runDir, only }: { runDir: string; only?: readonly string[] }) {
  const round = await readRound(runDir);
  const entries = only ? round.briefs.filter((entry) => only.includes(entry.slug)) : round.briefs;
  // Layout measures with the same bundled Inter the PNG paints with.
  await useHarfBuzz();
  const fontFaces = await interFontFaces();
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const entry of entries) results.push(await renderBrief({ entry, runDir, browser, fontFaces }));
    return results;
  } finally {
    await browser.close();
  }
}
