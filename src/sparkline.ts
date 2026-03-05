import type { SparklineConfig, SparklineCharacterSet, ASCIIArtConfig } from "./types.js";

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