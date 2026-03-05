import type { SparklineConfig, SparklineCharacterSet, ASCIIArtConfig, GaugeOptions, StatsOptions, StatsResult, ThresholdConfig, SparkStatusResult, DashboardMetric, DashboardOptions, KaomojiMood, KaomojiTheme, KaomojiOptions, KaomojiStatusOptions, KaomojiResult, HeatmapOptions, MiniTableOptions, HistogramOptions, CompareOptions, CompareResult } from "./types.js";

const DEFAULT_CHARACTER_SET: SparklineCharacterSet = "▁▂▃▄▅▆▇█";
const BLOCK_CHARACTERS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export interface SparklineOptions {
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly width: number;
  readonly height: number;
  readonly includeAxis?: boolean;
  readonly characterSet?: SparklineCharacterSet;
  readonly invert?: boolean;
  readonly outlierBounds?: {
    readonly lower?: number;
    readonly upper?: number;
  };
}

function normalizeValue(
  value: number,
  dataMin: number,
  dataMax: number,
  height: number,
  minClamp?: number,
  maxClamp?: number
): number {
  let clamped = value;
  if (minClamp !== undefined) clamped = Math.max(clamped, minClamp);
  if (maxClamp !== undefined) clamped = Math.min(clamped, maxClamp);

  if (dataMax === dataMin) return Math.floor(height / 2);

  const normalized = (clamped - dataMin) / (dataMax - dataMin);
  const scaled = normalized * (height - 1);
  return Math.max(0, Math.min(height - 1, scaled));
}

function interpolateData(
  data: readonly number[],
  width: number,
  dataMin: number,
  dataMax: number,
  height: number,
  minClamp?: number,
  maxClamp?: number
): number[] {
  if (data.length === 0) return Array(width).fill(0);
  if (data.length === width) {
    return data.map(v => normalizeValue(v, dataMin, dataMax, height, minClamp, maxClamp));
  }

  const result: number[] = [];
  for (let i = 0; i < width; i++) {
    const pos = (i / (width - 1)) * (data.length - 1);
    const leftIdx = Math.floor(pos);
    const rightIdx = Math.ceil(pos);
    const fraction = pos - leftIdx;

    if (leftIdx === rightIdx) {
      const val = data[leftIdx];
      result.push(normalizeValue(val, dataMin, dataMax, height, minClamp, maxClamp));
    } else {
      const leftVal = data[leftIdx];
      const rightVal = data[rightIdx];
      const interpolated = leftVal + (rightVal - leftVal) * fraction;
      result.push(normalizeValue(interpolated, dataMin, dataMax, height, minClamp, maxClamp));
    }
  }
  return result;
}

function detectOutliers(
  data: readonly number[],
  lowerBound?: number,
  upperBound?: number
): { indices: number[]; values: number[] } {
  const outliers: number[] = [];
  const outlierValues: number[] = [];

  data.forEach((value, index) => {
    if (lowerBound !== undefined && value < lowerBound) {
      outliers.push(index);
      outlierValues.push(value);
    } else if (upperBound !== undefined && value > upperBound) {
      outliers.push(index);
      outlierValues.push(value);
    }
  });

  return { indices: outliers, values: outlierValues };
}

function getCharactersFromSet(set: SparklineCharacterSet, invert: boolean): string[] {
  if (set === "▁▂▃▄▅▆▇█") {
    return invert ? [...BLOCK_CHARACTERS].reverse() : BLOCK_CHARACTERS;
  }

  const chars = Array.from(set);
  if (chars.length < 2) {
    throw new Error("Character set must contain at least 2 characters");
  }
  return invert ? chars.reverse() : chars;
}

function mapToCharacter(value: number, height: number, characters: string[]): string {
  const step = (height - 1) / (characters.length - 1);
  const index = Math.min(characters.length - 1, Math.floor(value / step));
  return characters[index];
}

export function generateSparkline(
  dataPoints: readonly number[],
  options: SparklineOptions
): string {
  if (dataPoints.length === 0) {
    throw new Error("Data points array cannot be empty");
  }
  if (options.width <= 0) {
    throw new Error("Width must be positive");
  }
  if (options.height <= 0) {
    throw new Error("Height must be positive");
  }

  const {
    minValue,
    maxValue,
    width,
    height,
    includeAxis = false,
    characterSet = DEFAULT_CHARACTER_SET,
    invert = false,
    outlierBounds
  } = options;

  const dataMin = Math.min(...dataPoints);
  const dataMax = Math.max(...dataPoints);

  const characters = getCharactersFromSet(characterSet, invert);
  const normalized = interpolateData(dataPoints, width, dataMin, dataMax, height, minValue, maxValue);
  const sparkline = normalized.map(v => mapToCharacter(v, height, characters)).join("");

  if (includeAxis) {
    const axisLine = "─".repeat(width);
    return `${sparkline}\n${axisLine}`;
  }

  return sparkline;
}

export function generateSparklineWithOutliers(
  dataPoints: readonly number[],
  options: SparklineOptions
): { sparkline: string; outliers: { indices: number[]; values: number[] } } {
  const sparkline = generateSparkline(dataPoints, options);
  const outliers = detectOutliers(dataPoints, options.outlierBounds?.lower, options.outlierBounds?.upper);
  return { sparkline, outliers };
}

/**
 * Simple sparkline from just an array of numbers.
 * Returns a single line of block characters (▁▂▃▄▅▆▇█).
 */
export function spark(values: readonly number[]): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return BLOCK_CHARACTERS[3].repeat(values.length);
  return values.map(v => {
    const idx = Math.round(((v - min) / (max - min)) * (BLOCK_CHARACTERS.length - 1));
    return BLOCK_CHARACTERS[idx];
  }).join("");
}

/**
 * Horizontal bar chart as text lines.
 * Each entry: "label ████████ value"
 */
export function barChart(
  entries: readonly { label: string; value: number }[],
  options?: { maxBarWidth?: number; showValues?: boolean }
): string {
  if (entries.length === 0) return "";
  const maxWidth = options?.maxBarWidth ?? 20;
  const showValues = options?.showValues ?? true;
  const maxVal = Math.max(...entries.map(e => e.value));
  const maxLabelLen = Math.max(...entries.map(e => e.label.length));

  return entries.map(e => {
    const barLen = maxVal === 0 ? 0 : Math.round((e.value / maxVal) * maxWidth);
    const bar = "█".repeat(barLen);
    const label = e.label.padEnd(maxLabelLen);
    return showValues ? `${label} ${bar} ${e.value}` : `${label} ${bar}`;
  }).join("\n");
}

/**
 * Trend indicator: ↑ ↓ → based on last N values.
 */
export function trend(values: readonly number[], window: number = 3): string {
  if (values.length < 2) return "→";
  const recent = values.slice(-window);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const diff = last - first;
  const threshold = Math.abs(first) * 0.05 || 0.01;
  if (diff > threshold) return "↑";
  if (diff < -threshold) return "↓";
  return "→";
}

export function generateASCIIArt(
  dataPoints: readonly number[],
  config: ASCIIArtConfig
): string {
  const { characterSet, invert = false, padding } = config;
  const characters = getCharactersFromSet(characterSet, invert);

  const dataMin = Math.min(...dataPoints);
  const dataMax = Math.max(...dataPoints);
  const height = characters.length - 1;

  const normalized = dataPoints.map(v => {
    if (dataMax === dataMin) return Math.floor(height / 2);
    return ((v - dataMin) / (dataMax - dataMin)) * height;
  });

  let result = normalized.map(v => {
    const index = Math.min(characters.length - 1, Math.floor(v));
    return characters[index];
  }).join("");

  if (padding) {
    const leftPad = " ".repeat(padding.left);
    const rightPad = " ".repeat(padding.right);
    const topPad = "\n".repeat(padding.top);
    const bottomPad = "\n".repeat(padding.bottom);
    result = `${topPad}${leftPad}${result}${rightPad}${bottomPad}`;
  }

  return result;
}

/**
 * Progress/level gauge bar.
 * gauge(75, 100) → "████████████████░░░░ 75%"
 */
export function gauge(value: number, max: number, options?: GaugeOptions): string {
  const width = options?.width ?? 20;
  const fill = options?.fill ?? "\u2588";
  const empty = options?.empty ?? "\u2591";
  const showPercent = options?.showPercent ?? true;
  const showValue = options?.showValue ?? false;
  const label = options?.label;
  const thresholds = options?.thresholds;

  const ratio = Math.max(0, Math.min(1, value / max));
  const filled = Math.round(ratio * width);
  const bar = fill.repeat(filled) + empty.repeat(width - filled);
  const pct = Math.round(ratio * 100);

  const parts: string[] = [];
  if (label) parts.push(label);
  parts.push(bar);
  if (showPercent) parts.push(`${pct}%`);
  if (showValue) parts.push(`${value}/${max}`);

  if (thresholds) {
    if (thresholds.critical !== undefined && pct >= thresholds.critical) {
      parts.push("CRITICAL");
    } else if (thresholds.warning !== undefined && pct >= thresholds.warning) {
      parts.push("WARNING");
    }
  }

  return parts.join(" ");
}

/**
 * Summary statistics for a numeric array.
 */
export function stats(values: readonly number[], options?: StatsOptions): StatsResult {
  const decimals = options?.decimals ?? 2;
  const pctiles = options?.percentiles ?? [95];

  const count = values.length;
  if (count === 0) {
    return { min: 0, max: 0, avg: 0, median: 0, stdDev: 0, percentiles: {}, count: 0, sum: 0, summary: "no data" };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((s, v) => s + v, 0);
  const avg = sum / count;
  const min = sorted[0];
  const max = sorted[count - 1];

  const mid = Math.floor(count / 2);
  const median = count % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / count;
  const stdDev = Math.sqrt(variance);

  const percentiles: Record<number, number> = {};
  for (const p of pctiles) {
    const idx = (p / 100) * (count - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const frac = idx - lo;
    percentiles[p] = lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
  }

  const r = (n: number) => Number(n.toFixed(decimals));

  const pctStr = pctiles.map(p => `p${p}=${r(percentiles[p])}`).join(" ");
  const summary = `min=${r(min)} max=${r(max)} avg=${r(avg)} ${pctStr}`;

  return { min: r(min), max: r(max), avg: r(avg), median: r(median), stdDev: r(stdDev), percentiles, count, sum: r(sum), summary };
}

/**
 * Sparkline with threshold status evaluation.
 */
export function sparkWithStatus(
  values: readonly number[],
  thresholds: ThresholdConfig
): SparkStatusResult {
  const sparkline = spark(values);
  const { warning, critical, invert = false } = thresholds;

  let breachCount = 0;
  let maxSeverity: "ok" | "warning" | "critical" = "ok";

  for (const v of values) {
    const isCritBreach = critical !== undefined && (invert ? v <= critical : v >= critical);
    const isWarnBreach = warning !== undefined && (invert ? v <= warning : v >= warning);

    if (isCritBreach) {
      breachCount++;
      maxSeverity = "critical";
    } else if (isWarnBreach) {
      breachCount++;
      if (maxSeverity !== "critical") maxSeverity = "warning";
    }
  }

  const breachPercent = values.length > 0 ? Math.round((breachCount / values.length) * 100) : 0;

  const statusMap = {
    ok: { emoji: "\u2705", color: 0x2ecc71 },
    warning: { emoji: "\u26a0\ufe0f", color: 0xf39c12 },
    critical: { emoji: "\ud83d\udd34", color: 0xe74c3c },
  };

  return {
    sparkline,
    status: maxSeverity,
    emoji: statusMap[maxSeverity].emoji,
    color: statusMap[maxSeverity].color,
    breachCount,
    breachPercent,
  };
}

/**
 * Multi-metric compact dashboard display.
 */
export function dashboard(
  metrics: readonly DashboardMetric[],
  options?: DashboardOptions
): string {
  const compact = options?.compact ?? false;
  const defaultSparkWidth = options?.sparkWidth ?? 8;
  const align = options?.align ?? true;
  const separator = options?.separator ?? "\n";

  const maxNameLen = align ? Math.max(...metrics.map(m => m.name.length)) : 0;

  const lines = metrics.map(m => {
    const name = align ? m.name.padEnd(maxNameLen) : m.name;
    const lastVal = m.values[m.values.length - 1];
    const unit = m.unit ?? "";
    const valStr = `${lastVal}${unit}`;

    if (m.thresholds) {
      const result = sparkWithStatus(m.values, m.thresholds);
      if (compact) {
        return `${name} ${valStr} ${result.emoji}`;
      }
      const sw = m.sparkWidth ?? defaultSparkWidth;
      const trimmedValues = m.values.slice(-sw);
      const sparkStr = spark(trimmedValues);
      return `${name} ${valStr.padStart(6)} ${sparkStr} ${result.emoji}`;
    }

    if (compact) {
      return `${name} ${valStr}`;
    }
    const sw = m.sparkWidth ?? defaultSparkWidth;
    const trimmedValues = m.values.slice(-sw);
    const sparkStr = spark(trimmedValues);
    return `${name} ${valStr.padStart(6)} ${sparkStr}`;
  });

  return lines.join(separator);
}

// --- v0.4.0: Kaomoji, Heatmap, Table, Histogram, Compare ---

const KAOMOJI_DICT: Record<KaomojiTheme, Record<KaomojiMood, readonly string[]>> = {
  classic: {
    happy: ["(*^▽^*)", "(´｡• ᵕ •｡`)", "(✿◠‿◠)", "(❁´◡`❁)"],
    ok: ["(・_・)", "(¬_¬)", "(─‿─)"],
    warning: ["(・_・;)", "(°△°|||)", "(⊙_⊙;)"],
    critical: ["(╥_╥)", "(×_×;)", "(☍﹏⁰)"],
    sad: ["(╥﹏╥)", "(T_T)", "(;_;)"],
    angry: ["(╬▔皿▔)╯", "(ノಠ益ಠ)ノ", "(`Д´)"],
    love: ["(♥‿♥)", "(◕‿◕)♡", "(´,,•ω•,,)♡"],
    surprised: ["(⊙_⊙)", "(°o°)", "(○o○)"],
    sleeping: ["(-.-)Zzz", "(¦3[▓▓]", "(∪｡∪)｡｡｡zzz"],
    working: ["(•̀ᴗ•́)و", "(╯°□°)╯", "( •_•)>⌐■-■"],
    celebrating: ["☆*:.｡.o(≧▽≦)o.｡.:*☆", "ヽ(>∀<☆)ノ", "\\(★ω★)/"],
    confused: ["(？_？)", "(⊙.⊙)?", "(¬‿¬ )"],
    dead: ["(×_×)", "(✖╭╮✖)", "(☠_☠)"],
  },
  cats: {
    happy: ["ᓚᘏᗢ", "(=^・ω・^=)", "(=①ω①=)"],
    ok: ["(=・ω・=)", "(=^-ω-^=)", "(=｀ω´=)"],
    warning: ["(=ↀωↀ=)", "(=xェx=)", "(=;ェ;=)"],
    critical: ["(=✖ω✖=)", "(=☓ω☓=)", "(=✘ω✘=)"],
    sad: ["(=T_T=)", "(=;ω;=)", "(=TェT=)"],
    angry: ["(=`ω´=)ノ", "(=`皿´=)", "(=▼ω▼=)"],
    love: ["(=♡ω♡=)", "(=^-ω-^=)♡", "(=◕ᆺ◕=)♡"],
    surprised: ["(=⊙ω⊙=)", "(=OωO=)", "(=°ω°=)"],
    sleeping: ["(=- ω -=)zzZ", "(=^-ω-^=)zzz", "(=- ェ -=)"],
    working: ["(=•̀ω•́=)و", "(=^ω^=)✧", "(=ↀωↀ=)✧"],
    celebrating: ["(=^▽^=)☆", "(=✧ω✧=)☆", "ヽ(=^▽^=)ノ"],
    confused: ["(=？ω？=)", "(=⊙ω⊙=)?", "(=~ω~=)"],
    dead: ["(=✖_✖=)", "(=×ω×=)", "(=☠ω☠=)"],
  },
  bears: {
    happy: ["ʕ•ᴥ•ʔ", "ʕ·ᴥ·ʔ", "ʕ♡ᴥ♡ʔ"],
    ok: ["ʕ-ᴥ-ʔ", "ʕ·ᴥ·ʔ", "ʕᵔᴥᵔʔ"],
    warning: ["ʕ⊙ᴥ⊙ʔ", "ʕ;ᴥ;ʔ", "ʕ°ᴥ°ʔ!"],
    critical: ["ʕ×ᴥ×ʔ", "ʕ✖ᴥ✖ʔ", "ʕ╥ᴥ╥ʔ"],
    sad: ["ʕ╥ᴥ╥ʔ", "ʕTᴥTʔ", "ʕ;ᴥ;ʔ"],
    angry: ["ʕ`ᴥ´ʔ", "ʕ▼ᴥ▼ʔ", "ʕ◣ᴥ◢ʔ"],
    love: ["ʕ♡ᴥ♡ʔ", "ʕ´ᴥ`ʔ♡", "ʕ◕ᴥ◕ʔ♡"],
    surprised: ["ʕ⊙ᴥ⊙ʔ!", "ʕ°ᴥ°ʔ", "ʕOᴥOʔ"],
    sleeping: ["ʕ-ᴥ-ʔzzz", "ʕ￣ᴥ￣ʔzZ", "ʕ˘ᴥ˘ʔzzz"],
    working: ["ʕ•̀ᴥ•́ʔ✧", "ʕ•ᴥ•ʔو", "ʕ·ᴥ·ʔ✧"],
    celebrating: ["ʕ☆ᴥ☆ʔ!", "ヽʕ•ᴥ•ʔノ", "ʕ≧ᴥ≦ʔ☆"],
    confused: ["ʕ？ᴥ？ʔ", "ʕ~ᴥ~ʔ?", "ʕ⊙ᴥ⊙ʔ?"],
    dead: ["ʕ×ᴥ×ʔ", "ʕ✖ᴥ✖ʔ", "ʕ☠ᴥ☠ʔ"],
  },
  stars: {
    happy: ["☆(◒‿◒)☆", "✧(≧▽≦)✧", "★(•‿•)★"],
    ok: ["☆(・_・)☆", "✧(─‿─)✧", "★(•_•)★"],
    warning: ["☆(・_・;)☆", "✧(°△°)✧", "★(⊙_⊙)★"],
    critical: ["☆(╥_╥)☆", "✧(×_×)✧", "★(✖_✖)★"],
    sad: ["☆(T_T)☆", "✧(;_;)✧", "★(╥﹏╥)★"],
    angry: ["☆(╬▔皿▔)☆", "✧(ノ°□°)✧", "★(`Д´)★"],
    love: ["☆(♥‿♥)☆", "✧(◕‿◕)♡✧", "★(´♡`)★"],
    surprised: ["☆(⊙o⊙)☆", "✧(°o°)✧", "★(○_○)★"],
    sleeping: ["☆(-.-)zzz☆", "✧(∪.∪)zzz✧", "★(¦3)zzz★"],
    working: ["☆(•̀ᴗ•́)و☆", "✧(╯°□°)╯✧", "★(•_•)>⌐■★"],
    celebrating: ["☆ヽ(≧▽≦)ノ☆", "✧\\(★ω★)/✧", "★(✧ω✧)★"],
    confused: ["☆(？_？)☆", "✧(⊙_⊙)?✧", "★(¬_¬)★"],
    dead: ["☆(×_×)☆", "✧(✖_✖)✧", "★(☠_☠)★"],
  },
  minimal: {
    happy: [":)", ":]", ":D"],
    ok: [":|", ":-|", ":/"],
    warning: [":S", ":/", ":?"],
    critical: ["D:", ">:(", "X("],
    sad: [":(", ";(", ":'("],
    angry: [">:(", ">(", ":@"],
    love: ["<3", ":*", ";)"],
    surprised: [":O", ":0", "=O"],
    sleeping: ["-_-zzz", "(-_-)zzz", "=.=zzz"],
    working: [":P", ";P", "B)"],
    celebrating: ["\\o/", ":D!", "*:D*"],
    confused: [":S", "?_?", ":/"],
    dead: ["x_x", "X_X", "x.x"],
  },
};

/**
 * Get a kaomoji face for a given mood.
 */
export function kaomoji(mood: KaomojiMood, options?: KaomojiOptions): string {
  const theme = options?.theme ?? "classic";
  const faces = KAOMOJI_DICT[theme]?.[mood];
  if (!faces || faces.length === 0) {
    return KAOMOJI_DICT.classic[mood]?.[0] ?? "(・_・)";
  }
  return faces[0];
}

/**
 * Get all kaomoji faces for a given mood.
 */
export function kaomojiAll(mood: KaomojiMood, options?: KaomojiOptions): readonly string[] {
  const theme = options?.theme ?? "classic";
  const faces = KAOMOJI_DICT[theme]?.[mood];
  if (!faces || faces.length === 0) {
    return KAOMOJI_DICT.classic[mood] ?? ["(・_・)"];
  }
  return faces;
}

/**
 * Map a numeric value to a kaomoji mood + face based on thresholds.
 */
export function kaomojiStatus(value: number, max: number, options?: KaomojiStatusOptions): KaomojiResult {
  const theme = options?.theme ?? "classic";
  const thresholds = options?.thresholds;
  const pct = max === 0 ? 0 : (value / max) * 100;

  let mood: KaomojiMood;

  if (thresholds) {
    const critPct = thresholds.critical ?? 90;
    const warnPct = thresholds.warning ?? 70;
    const invert = thresholds.invert ?? false;

    if (invert) {
      if (pct <= critPct) mood = "critical";
      else if (pct <= warnPct) mood = "warning";
      else mood = "happy";
    } else {
      if (pct >= critPct) mood = "critical";
      else if (pct >= warnPct) mood = "warning";
      else if (pct >= 40) mood = "ok";
      else mood = "happy";
    }
  } else {
    if (pct >= 90) mood = "critical";
    else if (pct >= 70) mood = "warning";
    else if (pct >= 40) mood = "ok";
    else mood = "happy";
  }

  return { face: kaomoji(mood, { theme }), mood };
}

/**
 * List all available kaomoji themes.
 */
export function kaomojiThemes(): readonly KaomojiTheme[] {
  return ["classic", "cats", "bears", "stars", "minimal"];
}

/**
 * 2D grid heatmap using shade characters.
 */
export function heatmap(data: readonly (readonly number[])[], options?: HeatmapOptions): string {
  if (data.length === 0) return "";

  const chars = options?.chars ?? [" ", "░", "▒", "▓", "█"];
  const showLabels = options?.showLabels ?? false;
  const rowLabels = options?.rowLabels;
  const colLabels = options?.colLabels;

  // Find min/max across all data
  let dataMin = options?.min ?? Infinity;
  let dataMax = options?.max ?? -Infinity;
  if (options?.min === undefined || options?.max === undefined) {
    for (const row of data) {
      for (const v of row) {
        if (options?.min === undefined && v < dataMin) dataMin = v;
        if (options?.max === undefined && v > dataMax) dataMax = v;
      }
    }
  }
  if (dataMin === Infinity) dataMin = 0;
  if (dataMax === -Infinity) dataMax = 0;

  const maxCols = Math.max(...data.map(r => r.length));
  const labelPad = showLabels && rowLabels ? Math.max(...rowLabels.map(l => l.length)) + 1 : 0;
  const lines: string[] = [];

  // Column labels
  if (showLabels && colLabels) {
    const prefix = " ".repeat(labelPad);
    const colLine = colLabels.slice(0, maxCols).map(l => l.padStart(2)).join(" ");
    lines.push(prefix + colLine);
  }

  // Data rows
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    let prefix = "";
    if (showLabels && rowLabels && r < rowLabels.length) {
      prefix = rowLabels[r].padEnd(labelPad);
    }

    const cells = [];
    for (let c = 0; c < maxCols; c++) {
      const v = c < row.length ? row[c] : dataMin;
      const ratio = dataMax === dataMin ? 0.5 : (v - dataMin) / (dataMax - dataMin);
      const idx = Math.min(chars.length - 1, Math.max(0, Math.round(ratio * (chars.length - 1))));
      cells.push(` ${chars[idx]}`);
    }

    lines.push(prefix + cells.join(""));
  }

  return lines.join("\n");
}

/**
 * Compact box-drawing table.
 */
export function miniTable(rows: readonly (readonly string[])[], options?: MiniTableOptions): string {
  if (rows.length === 0) return "";

  const border = options?.border ?? "single";
  const hasHeader = options?.header ?? false;
  const alignments = options?.align ?? [];
  const maxWidth = options?.maxWidth;

  // Calculate column widths
  const numCols = Math.max(...rows.map(r => r.length));
  const colWidths: number[] = Array(numCols).fill(0);
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      colWidths[c] = Math.max(colWidths[c], row[c].length);
    }
  }

  // Apply maxWidth truncation
  if (maxWidth) {
    const overhead = numCols + 1; // border chars
    const available = maxWidth - overhead - numCols * 2; // padding
    if (available > 0) {
      const maxPerCol = Math.floor(available / numCols);
      for (let c = 0; c < numCols; c++) {
        colWidths[c] = Math.min(colWidths[c], maxPerCol);
      }
    }
  }

  const chars = border === "double"
    ? { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║", tee: "╦", btee: "╩", ltee: "╠", rtee: "╣", cross: "╬" }
    : border === "rounded"
    ? { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│", tee: "┬", btee: "┴", ltee: "├", rtee: "┤", cross: "┼" }
    : border === "none"
    ? null
    : { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", tee: "┬", btee: "┴", ltee: "├", rtee: "┤", cross: "┼" };

  if (!chars) {
    // No border
    return rows.map(row => {
      return row.map((cell, c) => {
        const w = colWidths[c] ?? cell.length;
        const truncated = cell.length > w ? cell.slice(0, w) : cell;
        return padCell(truncated, w, alignments[c]);
      }).join("  ");
    }).join("\n");
  }

  const hLine = (left: string, mid: string, right: string) => {
    return left + colWidths.map(w => chars.h.repeat(w + 2)).join(mid) + right;
  };

  const dataRow = (row: readonly string[]) => {
    const cells = [];
    for (let c = 0; c < numCols; c++) {
      const raw = c < row.length ? row[c] : "";
      const w = colWidths[c];
      const truncated = raw.length > w ? raw.slice(0, w) : raw;
      cells.push(` ${padCell(truncated, w, alignments[c])} `);
    }
    return chars.v + cells.join(chars.v) + chars.v;
  };

  const lines: string[] = [];
  lines.push(hLine(chars.tl, chars.tee, chars.tr));

  for (let r = 0; r < rows.length; r++) {
    lines.push(dataRow(rows[r]));
    if (hasHeader && r === 0 && rows.length > 1) {
      lines.push(hLine(chars.ltee, chars.cross, chars.rtee));
    }
  }

  lines.push(hLine(chars.bl, chars.btee, chars.br));
  return lines.join("\n");
}

function padCell(text: string, width: number, align?: "left" | "right" | "center"): string {
  if (align === "right") return text.padStart(width);
  if (align === "center") {
    const left = Math.floor((width - text.length) / 2);
    return " ".repeat(left) + text + " ".repeat(width - text.length - left);
  }
  return text.padEnd(width);
}

/**
 * Key-value table with single border.
 */
export function kvTable(entries: readonly { key: string; value: string }[]): string {
  if (entries.length === 0) return "";
  const rows = entries.map(e => [e.key, e.value]);
  return miniTable(rows, { border: "single" });
}

/**
 * Frequency distribution histogram.
 */
export function histogram(values: readonly number[], options?: HistogramOptions): string {
  if (values.length === 0) return "";

  const numBins = options?.bins ?? 8;
  const barWidth = options?.barWidth ?? 20;
  const showCounts = options?.showCounts ?? true;
  const fill = options?.fill ?? "█";
  const showBounds = options?.showBounds ?? true;
  const percentages = options?.percentages ?? false;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const binSize = range === 0 ? 1 : range / numBins;

  // Count frequencies
  const counts: number[] = Array(numBins).fill(0);
  for (const v of values) {
    let bin = range === 0 ? 0 : Math.floor((v - min) / binSize);
    if (bin >= numBins) bin = numBins - 1;
    counts[bin]++;
  }

  const maxCount = Math.max(...counts);
  const total = values.length;

  // Build labels
  const labels = counts.map((_, i) => {
    if (!showBounds) return `${i}`;
    const lo = (min + i * binSize).toFixed(1);
    const hi = (min + (i + 1) * binSize).toFixed(1);
    return `${lo}-${hi}`;
  });

  const maxLabelLen = Math.max(...labels.map(l => l.length));

  return counts.map((count, i) => {
    const barLen = maxCount === 0 ? 0 : Math.round((count / maxCount) * barWidth);
    const bar = fill.repeat(barLen).padEnd(barWidth);
    const label = labels[i].padStart(maxLabelLen);
    const suffix = percentages
      ? `${((count / total) * 100).toFixed(1)}%`
      : `${count}`;
    return showCounts ? `${label} ${bar} ${suffix}` : `${label} ${bar}`;
  }).join("\n");
}

/**
 * Side-by-side value comparison with delta and direction.
 */
export function compare(
  label1: string, val1: number | readonly number[],
  label2: string, val2: number | readonly number[],
  options?: CompareOptions
): CompareResult {
  const barWidth = options?.barWidth ?? 30;
  const showDelta = options?.showDelta ?? true;
  const showPercent = options?.showPercent ?? true;
  const unit = options?.unit ?? "";
  const mode = options?.mode ?? "bars";

  const num1 = typeof val1 === "number" ? val1 : (val1.length === 0 ? 0 : val1.reduce((s, v) => s + v, 0) / val1.length);
  const num2 = typeof val2 === "number" ? val2 : (val2.length === 0 ? 0 : val2.reduce((s, v) => s + v, 0) / val2.length);

  const delta = num2 - num1;
  const deltaPercent = num1 === 0 ? (num2 === 0 ? 0 : 100) : (delta / Math.abs(num1)) * 100;
  const direction: "up" | "down" | "same" = delta > 0 ? "up" : delta < 0 ? "down" : "same";
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";

  const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
  const pctStr = `(${deltaPercent >= 0 ? "+" : ""}${deltaPercent.toFixed(1)}%)`;

  let display: string;

  if (mode === "compact") {
    const parts = [`${label1} ${num1}${unit} vs ${label2} ${num2}${unit}`];
    if (showDelta) parts.push(`${arrow}${deltaStr}`);
    if (showPercent) parts.push(pctStr);
    display = parts.join(" ");
  } else if (mode === "spark" && Array.isArray(val1) && Array.isArray(val2)) {
    const s1 = spark(val1 as readonly number[]);
    const s2 = spark(val2 as readonly number[]);
    const avg1 = num1.toFixed(1);
    const avg2 = num2.toFixed(1);
    const lines = [`${label1} ${s1}  avg=${avg1}`, `${label2} ${s2}  avg=${avg2}`];
    const deltaParts = [arrow];
    if (showDelta) deltaParts.push(deltaStr);
    if (showPercent) deltaParts.push(pctStr);
    lines.push(deltaParts.join(" "));
    display = lines.join("\n");
  } else {
    // bars mode
    const maxVal = Math.max(Math.abs(num1), Math.abs(num2));
    const maxLabel = Math.max(label1.length, label2.length);
    const bar1Len = maxVal === 0 ? 0 : Math.round((Math.abs(num1) / maxVal) * barWidth);
    const bar2Len = maxVal === 0 ? 0 : Math.round((Math.abs(num2) / maxVal) * barWidth);
    const bar1 = "█".repeat(bar1Len);
    const bar2 = "█".repeat(bar2Len);
    const lines = [
      `${label1.padEnd(maxLabel)} ${bar1} ${num1}${unit}`,
      `${label2.padEnd(maxLabel)} ${bar2} ${num2}${unit}`,
    ];
    const deltaParts = [arrow];
    if (showDelta) deltaParts.push(deltaStr);
    if (showPercent) deltaParts.push(pctStr);
    lines.push(deltaParts.join(" "));
    display = lines.join("\n");
  }

  return { display, delta, deltaPercent: Number(deltaPercent.toFixed(1)), direction, arrow };
}