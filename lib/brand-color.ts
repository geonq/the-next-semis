import { inflateSync } from "node:zlib";

const genericColors = new Set(["#fff", "#ffffff", "#000", "#000000"]);
const genericCssColors = new Set(["#18bc9c", "#2f96b4", "#51a351", "#bd362f", "#f89406", "#ff4136"]);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type ColorCandidate = {
  color: string;
  score: number;
  occurrences: number;
  runnerUpScore: number;
};

export function cleanHex(value: string | undefined): string | null {
  if (!value) return null;
  let color = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    color = "#" + [...color.slice(1)].map((char) => char + char).join("");
  }
  if (!/^#[0-9a-f]{3,8}$/i.test(color)) return null;
  color = color.slice(0, 7);
  if (genericColors.has(color.toLowerCase())) return null;
  return color;
}

export function themeColor(html: string): string | null {
  const match =
    html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i);
  return cleanHex(match?.[1]);
}

export function hexFromRgb(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function rgbFromHex(hex: string): [number, number, number] {
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
}

export function colorSignal(hex: string): number {
  if (genericCssColors.has(hex.toLowerCase())) return 0;
  const [r, g, b] = rgbFromHex(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const brightness = (r + g + b) / 3;
  if (brightness < 45 || brightness > 225 || saturation < 0.25) return 0;
  return saturation * (1 - Math.abs(brightness - 128) / 170);
}

export function saturationOf(hex: string): number {
  const [r, g, b] = rgbFromHex(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

export function isMonoHex(hex: string): boolean {
  return saturationOf(hex) < 0.15;
}

export function parseRawColor(value: string): string | null {
  const hex = value.match(/#[0-9a-f]{3,8}\b/i)?.[0];
  if (hex) {
    let color = hex;
    if (/^#[0-9a-f]{3}$/i.test(color)) color = "#" + [...color.slice(1)].map((c) => c + c).join("");
    if (!/^#[0-9a-f]{6,8}$/i.test(color)) return null;
    return color.slice(0, 7).toLowerCase();
  }
  const rgb = value.match(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
    if ([r, g, b].some((n) => n > 255)) return null;
    return hexFromRgb(r, g, b);
  }
  return null;
}

export function parseBrandColor(value: string): string | null {
  const raw = parseRawColor(value);
  return raw ? cleanHex(raw) : null;
}

export function mostSaturated(colors: string[]): string | null {
  let best: string | null = null;
  let bestSat = -1;
  for (const color of colors) {
    const sat = saturationOf(color);
    if (sat > bestSat) {
      bestSat = sat;
      best = color;
    }
  }
  return best;
}

export function colorClose(a: string, b: string): boolean {
  const [r1, g1, b1] = rgbFromHex(a);
  const [r2, g2, b2] = rgbFromHex(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) < 64;
}

export function extractTextAccent(text: string): ColorCandidate | null {
  const scores = new Map<string, { score: number; occurrences: number }>();
  for (const match of text.match(/#[0-9a-f]{3,8}\b/gi) ?? []) {
    const color = cleanHex(match);
    if (!color) continue;
    const signal = colorSignal(color);
    if (!signal) continue;
    const current = scores.get(color) ?? { score: 0, occurrences: 0 };
    current.score += signal;
    current.occurrences += 1;
    scores.set(color, current);
  }

  let best: string | null = null;
  let bestScore = 0;
  let bestOccurrences = 0;
  let runnerUpScore = 0;
  for (const [color, { score, occurrences }] of scores) {
    if (score > bestScore) {
      runnerUpScore = bestScore;
      best = color;
      bestScore = score;
      bestOccurrences = occurrences;
    } else if (score > runnerUpScore) {
      runnerUpScore = score;
    }
  }
  return best ? { color: best, score: bestScore, occurrences: bestOccurrences, runnerUpScore } : null;
}

export function isStrongStatisticalSignal(candidate: ColorCandidate): boolean {
  const dominance = candidate.runnerUpScore === 0 ? Number.POSITIVE_INFINITY : candidate.score / candidate.runnerUpScore;
  return candidate.occurrences >= 4 && candidate.score >= 2.5 && dominance >= 1.35;
}

const brandVarPattern = /--(?:brand|color-brand)(?:-[a-z0-9]+)?\s*:\s*([^;{}]+)[;}]/gi;
export function extractBrandVarColor(css: string): string | null {
  const candidates: string[] = [];
  for (const match of css.matchAll(brandVarPattern)) {
    const color = parseBrandColor(match[1]);
    if (color && !isMonoHex(color) && colorSignal(color) > 0) candidates.push(color);
  }
  return mostSaturated(candidates);
}

export function extractSvgColors(svg: string): string[] {
  const out: string[] = [];
  for (const match of svg.matchAll(/(?:fill|stroke|stop-color)\s*[=:]\s*["']?\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]+\))/gi)) {
    const color = parseRawColor(match[1]);
    if (color) out.push(color);
  }
  return out;
}

export function metaRefreshTarget(html: string, baseUrl: string): string | null {
  const meta =
    html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*http-equiv=["']?refresh["']?/i);
  const target = meta?.[1].match(/url\s*=\s*['"]?([^'";]+)/i)?.[1]?.trim();
  if (!target) return null;
  try {
    const resolved = new URL(target, baseUrl).toString();
    return resolved === baseUrl ? null : resolved;
  } catch {
    return null;
  }
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

export function extractPngAccent(buffer: Buffer): string | null {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(pngSignature)) return null;

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) return null;

    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return null;
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rows = new Uint8Array(height * stride);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowStart = y * stride;
    const previousRowStart = rowStart - stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= channels ? rows[rowStart + x - channels] : 0;
      const above = y > 0 ? rows[previousRowStart + x] : 0;
      const upperLeft = y > 0 && x >= channels ? rows[previousRowStart + x - channels] : 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      if (filter === 2) value = raw + above;
      if (filter === 3) value = raw + Math.floor((left + above) / 2);
      if (filter === 4) value = raw + paethPredictor(left, above, upperLeft);
      rows[rowStart + x] = value & 0xff;
    }
    sourceOffset += stride;
  }

  const buckets = new Map<string, { count: number; r: number; g: number; b: number; score: number }>();
  const sampleStep = Math.max(1, Math.floor(Math.sqrt((width * height) / 4096)));

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const pixel = y * stride + x * channels;
      const alpha = channels === 4 ? rows[pixel + 3] : 255;
      if (alpha < 180) continue;

      const r = rows[pixel];
      const g = rows[pixel + 1];
      const b = rows[pixel + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const brightness = (r + g + b) / 3;
      if (brightness < 60 || brightness > 225 || saturation < 0.3) continue;

      const quantized = [r, g, b].map((value) => Math.round(value / 24) * 24);
      const key = quantized.join(",");
      const current = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0, score: 0 };
      current.count += 1;
      current.r += r;
      current.g += g;
      current.b += b;
      current.score += saturation * Math.min(1, Math.abs(brightness - 128) / 128 + 0.4);
      buckets.set(key, current);
    }
  }

  let best: { count: number; r: number; g: number; b: number; score: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count * bucket.score > best.count * best.score) best = bucket;
  }
  if (!best || best.count < 3) return null;
  return hexFromRgb(Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count));
}

export function stylesheetUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const links = html.matchAll(/<link\b[^>]*>/gi);
  for (const link of links) {
    const tag = link[0];
    if (!/rel=["'][^"']*stylesheet[^"']*["']/i.test(tag)) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      urls.push(new URL(href, baseUrl).toString());
    } catch {
      // Ignore malformed stylesheet references.
    }
  }
  return urls.slice(0, 40);
}

export function sameOriginScripts(html: string, baseUrl: string): string[] {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }
  const urls: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js[^"'?]*)/gi)) {
    try {
      const url = new URL(match[1], baseUrl);
      if (url.origin === origin) urls.push(url.toString());
    } catch {
      // Ignore malformed script references.
    }
  }
  return Array.from(new Set(urls)).slice(0, 4);
}
