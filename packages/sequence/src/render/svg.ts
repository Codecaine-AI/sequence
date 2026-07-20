import type {
  SeqPoint,
  SeqTextAnchor,
  SequenceFragmentLayout,
  SequenceLayout,
  SequenceMessageLayout,
  SequenceNoteLayout,
  SequenceParticipantLayout,
} from "../layout";
import type { SequenceDocument } from "../schema";
import {
  SEQUENCE_CSS_VARIABLES,
  SEQUENCE_THEME_DEFAULTS,
  sequenceStyleToCssVars,
} from "../theme";

const color = (variable: string, fallback: string): string =>
  `var(${variable}, ${fallback})`;

const COLORS = {
  accent: color(SEQUENCE_CSS_VARIABLES.accent, SEQUENCE_THEME_DEFAULTS.accent),
  fragment: color(
    SEQUENCE_CSS_VARIABLES.fragmentAccent,
    SEQUENCE_THEME_DEFAULTS.fragmentAccent,
  ),
  participantFill: color(
    SEQUENCE_CSS_VARIABLES.participantFill,
    SEQUENCE_THEME_DEFAULTS.participantFill,
  ),
  text: color(SEQUENCE_CSS_VARIABLES.text, SEQUENCE_THEME_DEFAULTS.text),
  muted: color(SEQUENCE_CSS_VARIABLES.muted, SEQUENCE_THEME_DEFAULTS.muted),
  background: color(SEQUENCE_CSS_VARIABLES.background, SEQUENCE_THEME_DEFAULTS.background),
} as const;

const FONT_FAMILY =
  "var(--seq-font-family, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif)";

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function pointsPath(points: SeqPoint[], close = false): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  const commands = [`M ${number(first.x)} ${number(first.y)}`];
  for (const point of rest) commands.push(`L ${number(point.x)} ${number(point.y)}`);
  if (close) commands.push("Z");
  return commands.join(" ");
}

function textAnchor(anchor: SeqTextAnchor): string {
  return `x="${number(anchor.x)}" y="${number(anchor.y)}" text-anchor="${anchor.anchor}"`;
}

function renderDefs(scale: number): string {
  return [
    "<defs>",
    `<marker id="seq-arrow-sync" data-seq-marker="sync" viewBox="0 0 10 9" refX="9" refY="4.5" markerWidth="${number(10 * scale)}" markerHeight="${number(9 * scale)}" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M 0 0 L 9 4.5 L 0 9 Z" fill="${COLORS.accent}" /></marker>`,
    `<marker id="seq-arrow-async" data-seq-marker="async" viewBox="0 0 10 9" refX="9" refY="4.5" markerWidth="${number(10 * scale)}" markerHeight="${number(9 * scale)}" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M 1 1 L 9 4.5 L 1 8" fill="none" stroke="${COLORS.accent}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></marker>`,
    `<marker id="seq-arrow-return" data-seq-marker="return" viewBox="0 0 10 9" refX="9" refY="4.5" markerWidth="${number(10 * scale)}" markerHeight="${number(9 * scale)}" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M 1 1 L 9 4.5 L 1 8" fill="none" stroke="${COLORS.accent}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></marker>`,
    "</defs>",
  ].join("");
}

function renderParticipant(participant: SequenceParticipantLayout, scale: number): string {
  const name = participant.label ?? participant.name;
  const stereotype = participant.stereotype && participant.stereotype.length > 0
    ? `«${participant.stereotype}»`
    : undefined;

  if (participant.actor) {
    const center = participant.centerX;
    const headY = participant.header.y + 5 * scale;
    const bodyTop = participant.header.y + 10 * scale;
    const bodyBottom = participant.header.y + 20 * scale;
    const armY = participant.header.y + 15 * scale;
    const label = {
      ...participant.labelAnchor,
      y: participant.header.y + participant.header.height - 2 * scale,
    };
    const actorStereotype = participant.stereotypeAnchor
      ? { ...participant.stereotypeAnchor, y: participant.header.y + 29 * scale }
      : undefined;
    const glyph = [
      `<circle cx="${number(center)}" cy="${number(headY)}" r="${number(4 * scale)}" fill="${COLORS.background}" stroke="${COLORS.accent}" stroke-width="${number(1.5 * scale)}" />`,
      `<path d="M ${number(center)} ${number(bodyTop)} V ${number(bodyBottom)} M ${number(center - 7 * scale)} ${number(armY)} H ${number(center + 7 * scale)} M ${number(center)} ${number(bodyBottom)} L ${number(center - 6 * scale)} ${number(bodyBottom + 7 * scale)} M ${number(center)} ${number(bodyBottom)} L ${number(center + 6 * scale)} ${number(bodyBottom + 7 * scale)}" fill="none" stroke="${COLORS.accent}" stroke-width="${number(1.5 * scale)}" stroke-linecap="round" />`,
    ].join("");
    return [
      `<g class="seq-participant seq-participant--actor" data-participant-id="${escapeXml(participant.id)}">`,
      glyph,
      stereotype && actorStereotype
        ? `<text ${textAnchor(actorStereotype)} class="seq-stereotype" fill="${COLORS.text}" font-family="${FONT_FAMILY}" font-size="${number(11 * scale)}">${escapeXml(stereotype)}</text>`
        : "",
      `<text ${textAnchor(label)} class="seq-participant-label" fill="${COLORS.text}" font-family="${FONT_FAMILY}" font-size="${number(12 * scale)}" font-weight="600">${escapeXml(name)}</text>`,
      "</g>",
    ].join("");
  }

  return [
    `<g class="seq-participant seq-participant--box" data-participant-id="${escapeXml(participant.id)}">`,
    `<rect x="${number(participant.header.x)}" y="${number(participant.header.y)}" width="${number(participant.header.width)}" height="${number(participant.header.height)}" rx="${number(4 * scale)}" fill="${COLORS.participantFill}" stroke="${COLORS.accent}" stroke-width="${number(1.5 * scale)}" />`,
    stereotype && participant.stereotypeAnchor
      ? `<text ${textAnchor(participant.stereotypeAnchor)} class="seq-stereotype" fill="${COLORS.text}" font-family="${FONT_FAMILY}" font-size="${number(11 * scale)}">${escapeXml(stereotype)}</text>`
      : "",
    `<text ${textAnchor(participant.labelAnchor)} class="seq-participant-label" fill="${COLORS.text}" font-family="${FONT_FAMILY}" font-size="${number(12 * scale)}" font-weight="600">${escapeXml(name)}</text>`,
    "</g>",
  ].join("");
}

function renderMessage(message: SequenceMessageLayout, scale: number): string {
  const marker = message.line === "sync"
    ? "seq-arrow-sync"
    : message.line === "async"
      ? "seq-arrow-async"
      : "seq-arrow-return";
  const dash = message.line === "return"
    ? ` stroke-dasharray="${number(6 * scale)} ${number(4 * scale)}"`
    : "";
  const geometry = message.selfLoop && message.selfLoop.length > 1
    ? `<path d="${pointsPath(message.selfLoop)}" fill="none" stroke="${COLORS.accent}" stroke-width="${number(1.5 * scale)}"${dash} marker-end="url(#${marker})" />`
    : `<line x1="${number(message.x1)}" y1="${number(message.y1)}" x2="${number(message.x2)}" y2="${number(message.y2)}" stroke="${COLORS.accent}" stroke-width="${number(1.5 * scale)}"${dash} marker-end="url(#${marker})" />`;
  return [
    `<g class="seq-message seq-message--${message.line}" data-item-id="${escapeXml(message.id)}">`,
    geometry,
    `<text ${textAnchor(message.label)} fill="${COLORS.text}" font-family="${FONT_FAMILY}" font-size="${number(12 * scale)}">${escapeXml(message.text)}</text>`,
    "</g>",
  ].join("");
}

function bracketed(value: string): string {
  return value.startsWith("[") && value.endsWith("]") ? value : `[${value}]`;
}

function renderFragment(fragment: SequenceFragmentLayout, scale: number): string {
  const frame = fragment.outer;
  return [
    `<g class="seq-fragment seq-fragment--${fragment.op}" data-item-id="${escapeXml(fragment.id)}">`,
    `<rect x="${number(frame.x)}" y="${number(frame.y)}" width="${number(frame.width)}" height="${number(frame.height)}" fill="none" stroke="${COLORS.fragment}" stroke-width="${number(1.5 * scale)}" />`,
    `<path class="seq-fragment-tab" data-seq-fragment-tab="true" d="${pointsPath(fragment.tabPath, true)}" fill="${COLORS.background}" stroke="${COLORS.fragment}" stroke-width="${number(1.5 * scale)}" stroke-linejoin="miter" />`,
    `<text x="${number(fragment.tab.x + 6 * scale)}" y="${number(fragment.tab.y + 14 * scale)}" fill="${COLORS.fragment}" font-family="${FONT_FAMILY}" font-size="${number(12 * scale)}" font-weight="700">${escapeXml(fragment.op)}</text>`,
    ...fragment.dividerYs.map((y) =>
      `<line class="seq-operand-divider" data-seq-operand-divider="true" x1="${number(frame.x)}" y1="${number(y)}" x2="${number(frame.x + frame.width)}" y2="${number(y)}" stroke="${COLORS.fragment}" stroke-width="${number(scale)}" stroke-dasharray="${number(6 * scale)} ${number(4 * scale)}" />`
    ),
    ...fragment.guardLabels.map((guard) => guard.label
      ? `<text ${textAnchor(guard.anchor)} class="seq-fragment-guard" data-operand="${guard.operand}" fill="${COLORS.text}" font-family="${FONT_FAMILY}" font-size="${number(11 * scale)}">${escapeXml(bracketed(guard.label))}</text>`
      : ""),
    "</g>",
  ].join("");
}

function renderNote(note: SequenceNoteLayout, scale: number): string {
  const box = note.box;
  const fold = Math.min(12 * scale, box.width / 4, box.height / 3);
  const outline = [
    `M ${number(box.x)} ${number(box.y)}`,
    `H ${number(box.x + box.width - fold)}`,
    `L ${number(box.x + box.width)} ${number(box.y + fold)}`,
    `V ${number(box.y + box.height)}`,
    `H ${number(box.x)}`,
    "Z",
  ].join(" ");
  const foldPath = note.foldPath.length > 1
    ? pointsPath(note.foldPath)
    : `M ${number(box.x + box.width - fold)} ${number(box.y)} V ${number(box.y + fold)} H ${number(box.x + box.width)}`;
  return [
    `<g class="seq-note seq-note--${note.side}" data-item-id="${escapeXml(note.id)}">`,
    `<path d="${outline}" fill="${COLORS.participantFill}" stroke="${COLORS.accent}" stroke-width="${number(1.25 * scale)}" stroke-linejoin="round" />`,
    `<path class="seq-note-fold" data-seq-note-fold="true" d="${foldPath}" fill="none" stroke="${COLORS.accent}" stroke-width="${number(1.25 * scale)}" stroke-linejoin="round" />`,
    `<text ${textAnchor(note.label)} fill="${COLORS.text}" font-family="${FONT_FAMILY}" font-size="${number(12 * scale)}">${escapeXml(note.text)}</text>`,
    "</g>",
  ].join("");
}

export function renderSequenceSvgContents(
  document: SequenceDocument,
  layout: SequenceLayout,
): string {
  return [
    renderDefs(layout.scale),
    `<rect class="seq-background" x="0" y="0" width="${number(layout.width)}" height="${number(layout.height)}" fill="${COLORS.background}" />`,
    layout.title
      ? `<text ${textAnchor(layout.title.anchor)} class="seq-title" fill="${COLORS.text}" font-family="${FONT_FAMILY}" font-size="${number(16 * layout.scale)}" font-weight="700">${escapeXml(layout.title.text)}</text>`
      : "",
    `<g class="seq-lifelines">${layout.lifelines.map((lifeline) =>
      `<line data-participant-id="${escapeXml(lifeline.participantId)}" x1="${number(lifeline.x)}" y1="${number(lifeline.y1)}" x2="${number(lifeline.x)}" y2="${number(lifeline.y2)}" stroke="${COLORS.accent}" stroke-width="${number(layout.scale)}" stroke-dasharray="${number(5 * layout.scale)} ${number(5 * layout.scale)}" />`
    ).join("")}</g>`,
    `<g class="seq-fragments">${layout.fragments.map((fragment) => renderFragment(fragment, layout.scale)).join("")}</g>`,
    `<g class="seq-activations">${layout.activations.map((activation) =>
      `<rect data-participant-id="${escapeXml(activation.participantId)}" data-level="${activation.level}" x="${number(activation.rect.x)}" y="${number(activation.rect.y)}" width="${number(activation.rect.width)}" height="${number(activation.rect.height)}" fill="${COLORS.muted}" stroke="${COLORS.muted}" stroke-width="${number(layout.scale)}" />`
    ).join("")}</g>`,
    `<g class="seq-messages">${layout.messages.map((message) => renderMessage(message, layout.scale)).join("")}</g>`,
    `<g class="seq-notes">${layout.notes.map((note) => renderNote(note, layout.scale)).join("")}</g>`,
    `<g class="seq-participants">${layout.participants.map((participant) => renderParticipant(participant, layout.scale)).join("")}</g>`,
  ].join("");
}

export function sequenceSvgStyleAttribute(document: SequenceDocument): string {
  return Object.entries(sequenceStyleToCssVars(document.style))
    .map(([name, value]) => `${name}: ${value}`)
    .join("; ");
}

export function wrapSequenceSvg(
  document: SequenceDocument,
  layout: SequenceLayout,
  contents: string,
): string {
  const style = sequenceSvgStyleAttribute(document);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="sequence-diagram" role="img" aria-label="${escapeXml(document.title ?? "Sequence diagram")}" width="${number(layout.width)}" height="${number(layout.height)}" viewBox="0 0 ${number(layout.width)} ${number(layout.height)}"${style ? ` style="${escapeXml(style)}"` : ""}>`,
    contents,
    "</svg>",
  ].join("");
}
