import { stripVTControlCharacters } from "node:util";
import chalk from "chalk";

interface TerminalAnswerRendererOptions {
  columns?: number;
  write?: (text: string) => void;
}

type InlineStyle = "plain" | "bold" | "code" | "citation" | "link";
type BaseStyle = "plain" | "heading" | "table-label";

interface InlineSegment {
  text: string;
  style: InlineStyle;
}

const INLINE_PATTERN = /(\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|((?:\[\d+\])+)|\[([^\]]+)\]\((https?:\/\/[^)]+)\))/g;
const TABLE_SEPARATOR = /^:?-{3,}:?$/;

function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), style: "plain" });
    }

    if (match[2] !== undefined || match[3] !== undefined) {
      segments.push({ text: match[2] ?? match[3], style: "bold" });
    } else if (match[4] !== undefined) {
      segments.push({ text: match[4], style: "code" });
    } else if (match[5] !== undefined) {
      const sourceIds = match[5].match(/\d+/g) ?? [];
      segments.push({
        text: `来源 ${sourceIds.join(" · ")}`,
        style: "citation",
      });
    } else if (match[6] !== undefined) {
      segments.push({ text: match[6], style: "link" });
    }

    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), style: "plain" });
  }
  return segments;
}

function isWideCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (
    code >= 0x1100 && (
      code <= 0x115f
      || code === 0x2329
      || code === 0x232a
      || (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f)
      || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xfe10 && code <= 0xfe19)
      || (code >= 0xfe30 && code <= 0xfe6f)
      || (code >= 0xff00 && code <= 0xff60)
      || (code >= 0xffe0 && code <= 0xffe6)
      || (code >= 0x1f300 && code <= 0x1faff)
      || (code >= 0x20000 && code <= 0x3fffd)
    )
  );
}

function characterWidth(character: string): number {
  if (/[\u0000-\u001f\u007f-\u009f\u0300-\u036f\ufe00-\ufe0f]/u.test(character)) {
    return 0;
  }
  return isWideCharacter(character) ? 2 : 1;
}

function textWidth(text: string): number {
  return [...text].reduce((width, character) => width + characterWidth(character), 0);
}

function splitSegment(segment: InlineSegment): InlineSegment[] {
  return (segment.text.match(/\s+|[\x21-\x7e]+|./gu) ?? [])
    .map(text => ({ text, style: segment.style }));
}

function appendSegment(target: InlineSegment[], segment: InlineSegment): void {
  const previous = target.at(-1);
  if (previous?.style === segment.style) {
    previous.text += segment.text;
  } else {
    target.push({ ...segment });
  }
}

function wrapSegments(
  segments: InlineSegment[],
  maxWidth: number,
): InlineSegment[][] {
  const lines: InlineSegment[][] = [[]];
  let lineWidth = 0;

  const newLine = () => {
    lines.push([]);
    lineWidth = 0;
  };

  for (const segment of segments.flatMap(splitSegment)) {
    const whitespace = /^\s+$/u.test(segment.text);
    if (whitespace) {
      if (lineWidth > 0) {
        appendSegment(lines.at(-1) as InlineSegment[], {
          ...segment,
          text: " ",
        });
        lineWidth += 1;
      }
      continue;
    }

    const width = textWidth(segment.text);
    if (lineWidth > 0 && lineWidth + width > maxWidth) {
      const current = lines.at(-1) as InlineSegment[];
      const trailing = current.at(-1);
      if (trailing && /^\s+$/u.test(trailing.text)) {
        current.pop();
      }
      newLine();
    }

    if (width <= maxWidth) {
      appendSegment(lines.at(-1) as InlineSegment[], segment);
      lineWidth += width;
      continue;
    }

    for (const character of segment.text) {
      const charWidth = characterWidth(character);
      if (lineWidth > 0 && lineWidth + charWidth > maxWidth) newLine();
      appendSegment(lines.at(-1) as InlineSegment[], {
        text: character,
        style: segment.style,
      });
      lineWidth += charWidth;
    }
  }

  return lines.filter(line => line.length > 0);
}

function styleSegment(segment: InlineSegment, baseStyle: BaseStyle): string {
  let styled = segment.text;
  switch (segment.style) {
    case "bold":
      styled = chalk.bold(styled);
      break;
    case "code":
      styled = chalk.cyan(styled);
      break;
    case "citation":
      styled = chalk.dim(styled);
      break;
    case "link":
      styled = chalk.cyan.underline(styled);
      break;
  }

  if (baseStyle === "heading") return chalk.bold.cyan(styled);
  if (baseStyle === "table-label") return chalk.bold.yellow(styled);
  return styled;
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map(cell => cell.trim());
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2;
}

function isTableSeparator(line: string): boolean {
  const cells = parseTableRow(line);
  return cells.length > 0 && cells.every(cell => TABLE_SEPARATOR.test(cell));
}

export class TerminalAnswerRenderer {
  private readonly columns: number;
  private readonly emit: (text: string) => void;
  private buffer = "";
  private pendingTableHeader: string | undefined;
  private tableHeader: string[] | undefined;
  private tableRows: string[][] = [];
  private suggestionBuffer: string[] | undefined;
  private suggestionCount = 0;
  private suggestionHeadingShown = false;
  private codeFence = false;
  private lastOutputBlank = true;
  private visibleOutput = false;
  private ended = false;

  constructor(options: TerminalAnswerRendererOptions = {}) {
    this.columns = Math.max(24, Math.floor(options.columns ?? process.stdout.columns ?? 80));
    this.emit = options.write ?? (text => process.stdout.write(text));
  }

  get hasVisibleOutput(): boolean {
    return this.visibleOutput;
  }

  write(chunk: string): void {
    if (this.ended || !chunk) return;
    this.buffer += chunk;

    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/u, "");
      this.buffer = this.buffer.slice(newline + 1);
      this.processLine(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.buffer) this.processLine(this.buffer.replace(/\r$/u, ""));
    this.buffer = "";

    if (this.suggestionBuffer) {
      this.emitSuggestion(this.suggestionBuffer.join(" ").trim());
      this.suggestionBuffer = undefined;
    }
    this.flushTableState();
  }

  private processLine(rawLine: string): void {
    const line = stripVTControlCharacters(rawLine);

    if (this.suggestionBuffer) {
      const closing = line.indexOf("[/建议]");
      if (closing < 0) {
        if (line.trim()) this.suggestionBuffer.push(line.trim());
        return;
      }

      const content = line.slice(0, closing).trim();
      if (content) this.suggestionBuffer.push(content);
      this.emitSuggestion(this.suggestionBuffer.join(" ").trim());
      this.suggestionBuffer = undefined;
      const remainder = line.slice(closing + "[/建议]".length);
      if (remainder.trim()) this.processLine(remainder);
      return;
    }

    const opening = line.indexOf("[建议]");
    if (opening >= 0) {
      const before = line.slice(0, opening);
      if (before.trim()) this.processStructuralLine(before);
      this.suggestionBuffer = [];
      this.processLine(line.slice(opening + "[建议]".length));
      return;
    }

    this.processStructuralLine(line);
  }

  private processStructuralLine(line: string): void {
    if (this.codeFence) {
      if (/^\s*```/u.test(line)) {
        this.codeFence = false;
        this.emitBlank();
      } else {
        this.emitLine(`  ${chalk.dim("│")} ${line}`);
      }
      return;
    }

    const fence = line.match(/^\s*```(.*)$/u);
    if (fence) {
      this.flushTableState();
      this.emitBlank();
      if (fence[1].trim()) this.emitLine(chalk.dim(`  ${fence[1].trim()}`));
      this.codeFence = true;
      return;
    }

    if (this.tableHeader) {
      if (isTableRow(line)) {
        if (!isTableSeparator(line)) this.tableRows.push(parseTableRow(line));
        return;
      }
      this.flushTable();
      this.processStructuralLine(line);
      return;
    }

    if (this.pendingTableHeader !== undefined) {
      if (isTableSeparator(line)) {
        this.tableHeader = parseTableRow(this.pendingTableHeader);
        this.pendingTableHeader = undefined;
        return;
      }
      const pending = this.pendingTableHeader;
      this.pendingTableHeader = undefined;
      this.emitNormalLine(pending);
      this.processStructuralLine(line);
      return;
    }

    if (isTableRow(line)) {
      this.pendingTableHeader = line;
      return;
    }

    this.emitNormalLine(line);
  }

  private emitNormalLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      this.emitBlank();
      return;
    }

    const heading = trimmed.match(/^#{1,6}\s+(.+)$/u);
    if (heading) {
      this.emitBlank();
      this.emitWrapped(heading[1], "  ", "  ", "heading");
      this.emitBlank();
      return;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/u.test(trimmed)) {
      const width = Math.max(12, Math.min(72, this.columns - 4));
      this.emitLine(`  ${chalk.dim("─".repeat(width))}`);
      this.emitBlank();
      return;
    }

    const bullet = line.match(/^(\s*)[-*+]\s+(.+)$/u);
    if (bullet) {
      const depth = Math.floor(bullet[1].length / 2);
      const leading = `  ${"  ".repeat(depth)}`;
      this.emitWrapped(bullet[2], `${leading}• `, `${leading}  `);
      return;
    }

    const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/u);
    if (ordered) {
      const depth = Math.floor(ordered[1].length / 2);
      const leading = `  ${"  ".repeat(depth)}`;
      const marker = `${ordered[2]}. `;
      this.emitWrapped(ordered[3], `${leading}${marker}`, `${leading}${" ".repeat(marker.length)}`);
      return;
    }

    const quote = trimmed.match(/^>\s?(.*)$/u);
    if (quote) {
      this.emitWrapped(quote[1], `  ${chalk.dim("│")} `, "    ");
      return;
    }

    this.emitWrapped(trimmed, "  ", "  ");
  }

  private emitWrapped(
    markdown: string,
    firstPrefix: string,
    continuationPrefix: string,
    baseStyle: BaseStyle = "plain",
  ): void {
    const prefixWidth = Math.max(
      textWidth(stripVTControlCharacters(firstPrefix)),
      textWidth(stripVTControlCharacters(continuationPrefix)),
    );
    const contentWidth = Math.max(12, Math.min(96, this.columns - prefixWidth));
    const lines = wrapSegments(parseInline(markdown), contentWidth);

    lines.forEach((segments, index) => {
      const prefix = index === 0 ? firstPrefix : continuationPrefix;
      const content = segments
        .map(segment => styleSegment(segment, baseStyle))
        .join("");
      this.emitLine(prefix + content);
    });
  }

  private emitSuggestion(content: string): void {
    if (!content) return;
    this.flushTableState();
    if (!this.suggestionHeadingShown) {
      this.emitBlank();
      this.emitWrapped("接着问", "  ", "  ", "heading");
      this.emitBlank();
      this.suggestionHeadingShown = true;
    }

    this.suggestionCount += 1;
    const marker = `${this.suggestionCount}. `;
    this.emitWrapped(content, `  ${marker}`, `  ${" ".repeat(marker.length)}`);
  }

  private flushTableState(): void {
    if (this.pendingTableHeader !== undefined) {
      const pending = this.pendingTableHeader;
      this.pendingTableHeader = undefined;
      this.emitNormalLine(pending);
    }
    this.flushTable();
  }

  private flushTable(): void {
    if (!this.tableHeader) return;
    const rows = this.tableRows;
    this.tableHeader = undefined;
    this.tableRows = [];

    for (const [index, row] of rows.entries()) {
      const [label, ...details] = row;
      if (!label && !details.some(Boolean)) continue;
      if (index > 0) this.emitBlank();
      if (label) this.emitWrapped(label, "  ", "  ", "table-label");
      const detail = details.filter(Boolean).join("  ·  ");
      if (detail) this.emitWrapped(detail, "    ", "    ");
    }
  }

  private emitBlank(): void {
    if (this.lastOutputBlank) return;
    this.emit("\n");
    this.lastOutputBlank = true;
  }

  private emitLine(line: string): void {
    this.emit(line + "\n");
    this.lastOutputBlank = false;
    this.visibleOutput = true;
  }
}
