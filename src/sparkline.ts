import type { SparklineConfig, SparklineCharacterSet, ASCIIArtConfig, GaugeOptions, StatsOptions, StatsResult, ThresholdConfig, SparkStatusResult, DashboardMetric, DashboardOptions } from "./types.js";

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