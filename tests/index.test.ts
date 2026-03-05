import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
  generateSparkline,
  generateSparklineWithOutliers,
  generateASCIIArt,
  sendWebhook,
  gauge,
  stats,
  sparkWithStatus,
  dashboard,
  kaomoji,
  kaomojiAll,
  kaomojiStatus,
  kaomojiThemes,
  heatmap,
  miniTable,
  kvTable,
  histogram,
  compare,
} from "../src/index.js";
import type {
  SparklineConfig,
  ASCIIArtConfig,
  WebhookPayload,
  WebhookConfig,
} from "../src/index.js";

describe("sparkline generation", () => {
  it("should generate a basic sparkline from numeric data", () => {
    const data = [1, 2, 3, 4, 5];
    const options: SparklineConfig = { width: 5, height: 8, dataPoints: data };
    const result = generateSparkline(data, options);
    expect(result).toBeString();
    expect(result.length).toBe(5);
    expect(result).toMatch(/^[▁▂▃▄▅▆▇█]+$/);
  });

  it("should throw on empty data array", () => {
    const options: SparklineConfig = { width: 5, height: 8, dataPoints: [] };
    expect(() => generateSparkline([], options)).toThrow("Data points array cannot be empty");
  });

  it("should handle all identical values", () => {
    const data = [42, 42, 42, 42];
    const options: SparklineConfig = { width: 4, height: 8, dataPoints: data };
    const result = generateSparkline(data, options);
    expect(result).toBeString();
    expect(result.length).toBe(4);
    expect(result).toBe("▅▅▅▅");
  });

  it("should respect min/max clamping", () => {
    const data = [0, 10, 20, 30, 40];
    const options: SparklineConfig = {
      width: 5,
      height: 8,
      minValue: 10,
      maxValue: 30,
      dataPoints: data,
    };
    const result = generateSparkline(data, options);
    expect(result).toBeString();
    expect(result.length).toBe(5);
    expect(result[0]).toBe("▂");
    expect(result[4]).toBe("█");
  });

  it("should detect outliers", () => {
    const data = [1, 2, 100, 3, 4];
    const options = {
      width: 5,
      height: 8,
      outlierBounds: { upper: 10 },
    } as any;
    const result = generateSparklineWithOutliers(data, options);
    expect(result.sparkline).toBeString();
    expect(result.outliers.indices).toEqual([2]);
    expect(result.outliers.values).toEqual([100]);
  });
});

describe("ASCII art generation", () => {
  it("should generate ASCII art with custom character set", () => {
    const data = [1, 2, 3, 4, 5];
    const config: ASCIIArtConfig = {
      characterSet: "·∙●○◉◎",
      invert: false,
    };
    const result = generateASCIIArt(data, config);
    expect(result).toBeString();
    expect(result.length).toBe(5);
    expect(result).toMatch(/^[·∙●○◉◎]+$/);
  });

  it("should apply padding", () => {
    const data = [1, 2, 3];
    const config: ASCIIArtConfig = {
      characterSet: "▁▂▃▄▅▆▇█",
      padding: { left: 2, right: 2, top: 1, bottom: 1 },
    };
    const result = generateASCIIArt(data, config);
    expect(result).toStartWith("\n");
    expect(result).toEndWith("\n");
    expect(result).toInclude("  ▁▄█  ");
  });
});

describe("webhook sending", () => {
  beforeEach(() => {
    mock.module("https", () => ({
      request: (options: any, callback: any) => {
        const mockRes = {
          statusCode: 200,
          statusMessage: "OK",
          on: (event: string, handler: any) => {
            if (event === "data") handler(Buffer.from("{}"));
            if (event === "end") handler();
          },
        };
        callback(mockRes);
        return {
          on: () => {},
          write: () => {},
          end: () => {},
        };
      },
    }));
  });

  it("should validate payload before sending", async () => {
    const payload: WebhookPayload = {
      timestamp: new Date(),
      metricName: "cpu_usage",
      sparkline: "▁▃█",
      rawValues: [1, 2, 3],
    };
    const config: WebhookConfig = {
      endpoint: "https://discord.com/api/webhooks/123",
      provider: "discord",
    };
    const response = await sendWebhook(payload, config);
    expect(response.success).toBeTrue();
    expect(response.statusCode).toBe(200);
  });

  it("should throw validation error for invalid payload", async () => {
    const payload = {
      timestamp: "not a date",
      metricName: "",
      sparkline: "",
      rawValues: [],
    } as unknown as WebhookPayload;
    const config: WebhookConfig = {
      endpoint: "https://discord.com/api/webhooks/123",
      provider: "discord",
    };
    await expect(sendWebhook(payload, config)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("should throw validation error for invalid config", async () => {
    const payload: WebhookPayload = {
      timestamp: new Date(),
      metricName: "cpu_usage",
      sparkline: "▁▃█",
      rawValues: [1, 2, 3],
    };
    const config = {
      endpoint: "not-a-url",
      provider: "discord",
    } as unknown as WebhookConfig;
    await expect(sendWebhook(payload, config)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});

describe("edge cases", () => {
  it("should handle negative values in sparkline", () => {
    const data = [-5, 0, 5];
    const options: SparklineConfig = { width: 3, height: 8, dataPoints: data };
    const result = generateSparkline(data, options);
    expect(result).toBeString();
    expect(result.length).toBe(3);
    expect(result[0]).toBe("▁");
    expect(result[2]).toBe("█");
  });

  it("should handle very large arrays with interpolation", () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const options: SparklineConfig = { width: 10, height: 8, dataPoints: data };
    const result = generateSparkline(data, options);
    expect(result).toBeString();
    expect(result.length).toBe(10);
  });

  it("should throw on invalid character set", () => {
    const data = [1, 2, 3];
    const config: ASCIIArtConfig = {
      characterSet: "a" as any,
      invert: false,
    };
    expect(() => generateASCIIArt(data, config)).toThrow("Character set must contain at least 2 characters");
  });
});

describe("gauge", () => {
  it("should generate basic gauge with default options", () => {
    const result = gauge(75, 100);
    expect(result).toInclude("75%");
    expect(result).toInclude("\u2588");
    expect(result).toInclude("\u2591");
  });

  it("should use custom width and fill/empty characters", () => {
    const result = gauge(6, 20, { width: 10, fill: "#", empty: "." });
    expect(result).toInclude("###.......");
    expect(result).toInclude("30%");
  });

  it("should include label prefix", () => {
    const result = gauge(3.7, 4.2, { label: "BATT" });
    expect(result).toStartWith("BATT ");
    expect(result).toInclude("88%");
  });

  it("should append threshold status", () => {
    const result = gauge(92, 100, { thresholds: { warning: 70, critical: 90 } });
    expect(result).toInclude("CRITICAL");

    const warnResult = gauge(75, 100, { thresholds: { warning: 70, critical: 90 } });
    expect(warnResult).toInclude("WARNING");
    expect(warnResult).not.toInclude("CRITICAL");
  });
});

describe("stats", () => {
  it("should compute basic statistics", () => {
    const result = stats([10, 20, 30, 40, 50]);
    expect(result.min).toBe(10);
    expect(result.max).toBe(50);
    expect(result.avg).toBe(30);
    expect(result.median).toBe(30);
    expect(result.count).toBe(5);
    expect(result.sum).toBe(150);
    expect(result.stdDev).toBeGreaterThan(0);
  });

  it("should calculate percentiles", () => {
    const result = stats(Array.from({ length: 100 }, (_, i) => i + 1), { percentiles: [95, 99] });
    expect(result.percentiles[95]).toBeGreaterThanOrEqual(95);
    expect(result.percentiles[99]).toBeGreaterThanOrEqual(99);
  });

  it("should handle single-value array", () => {
    const result = stats([42]);
    expect(result.min).toBe(42);
    expect(result.max).toBe(42);
    expect(result.avg).toBe(42);
    expect(result.median).toBe(42);
    expect(result.stdDev).toBe(0);
  });

  it("should produce summary string", () => {
    const result = stats([10, 20, 30, 40, 50]);
    expect(result.summary).toInclude("min=10");
    expect(result.summary).toInclude("max=50");
    expect(result.summary).toInclude("avg=30");
    expect(result.summary).toInclude("p95=");
  });
});

describe("sparkWithStatus", () => {
  it("should return ok when all values below thresholds", () => {
    const result = sparkWithStatus([10, 20, 30], { warning: 50, critical: 80 });
    expect(result.status).toBe("ok");
    expect(result.emoji).toBe("\u2705");
    expect(result.color).toBe(0x2ecc71);
    expect(result.breachCount).toBe(0);
  });

  it("should detect warning threshold breach", () => {
    const result = sparkWithStatus([45, 50, 62, 78], { warning: 70, critical: 90 });
    expect(result.status).toBe("warning");
    expect(result.breachCount).toBe(1);
    expect(result.breachPercent).toBe(25);
  });

  it("should detect critical threshold breach", () => {
    const result = sparkWithStatus([45, 50, 62, 78, 95], { warning: 70, critical: 90 });
    expect(result.status).toBe("critical");
    expect(result.emoji).toBe("\ud83d\udd34");
    expect(result.color).toBe(0xe74c3c);
    expect(result.breachCount).toBe(2);
  });

  it("should support inverted mode (low = bad)", () => {
    const result = sparkWithStatus([15, 10, 5, 3], { warning: 10, critical: 5, invert: true });
    expect(result.status).toBe("critical");
    expect(result.breachCount).toBeGreaterThanOrEqual(2);
  });
});

describe("dashboard", () => {
  const testMetrics = [
    { name: "CPU", values: [45, 50, 62, 78], unit: "%", thresholds: { warning: 70, critical: 90 } },
    { name: "MEM", values: [78, 80, 82, 85], unit: "%", thresholds: { warning: 80, critical: 95 } },
    { name: "DISK", values: [62, 63, 63, 64], unit: "%", thresholds: { warning: 85, critical: 95 } },
    { name: "TEMP", values: [42, 44, 45, 43], unit: "\u00b0C", thresholds: { warning: 60, critical: 75 } },
  ];

  it("should render multi-metric full mode with sparklines", () => {
    const result = dashboard(testMetrics);
    const lines = result.split("\n");
    expect(lines.length).toBe(4);
    expect(lines[0]).toInclude("CPU");
    expect(lines[3]).toInclude("TEMP");
  });

  it("should render compact mode without sparklines", () => {
    const result = dashboard(testMetrics, { compact: true });
    const lines = result.split("\n");
    expect(lines.length).toBe(4);
    // Compact lines are shorter (no sparkline chars)
    for (const line of lines) {
      expect(line).not.toInclude("\u2581");
    }
  });

  it("should show mixed statuses across metrics", () => {
    const result = dashboard(testMetrics);
    // CPU 78% → warning, MEM 85% → warning, DISK/TEMP → ok
    expect(result).toInclude("\u26a0\ufe0f");
    expect(result).toInclude("\u2705");
  });

  it("should align names with different lengths", () => {
    const mixedNames = [
      { name: "A", values: [50], unit: "%" },
      { name: "LONGNAME", values: [50], unit: "%" },
    ];
    const result = dashboard(mixedNames);
    const lines = result.split("\n");
    // First line should be padded to match longest name
    expect(lines[0]).toStartWith("A       ");
  });
});

// --- v0.4.0 Tests ---

describe("kaomoji", () => {
  it("should return a classic happy face", () => {
    const result = kaomoji("happy");
    expect(result).toBeString();
    expect(result).toBe("(*^▽^*)");
  });

  it("should return a cat face with cats theme", () => {
    const result = kaomoji("happy", { theme: "cats" });
    expect(result).toBe("ᓚᘏᗢ");
  });

  it("should map value to ok mood via kaomojiStatus", () => {
    const result = kaomojiStatus(50, 100);
    expect(result.mood).toBe("ok");
    expect(result.face).toBeString();
  });

  it("should detect critical via kaomojiStatus with custom thresholds", () => {
    const result = kaomojiStatus(95, 100, { thresholds: { warning: 70, critical: 90 } });
    expect(result.mood).toBe("critical");
  });

  it("should return multiple faces from kaomojiAll", () => {
    const faces = kaomojiAll("happy");
    expect(faces.length).toBeGreaterThanOrEqual(3);
    for (const f of faces) expect(f).toBeString();
  });

  it("should list all themes", () => {
    const themes = kaomojiThemes();
    expect(themes).toContain("classic");
    expect(themes).toContain("cats");
    expect(themes).toContain("bears");
    expect(themes).toContain("stars");
    expect(themes).toContain("minimal");
  });

  it("should fallback gracefully for unknown theme/mood combo", () => {
    // All moods should have entries in all themes
    const result = kaomoji("dead", { theme: "minimal" });
    expect(result).toBeString();
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("heatmap", () => {
  it("should render a 3x4 grid with 3 lines", () => {
    const result = heatmap([[2, 5, 8, 3], [1, 7, 9, 4], [3, 6, 7, 2]]);
    const lines = result.split("\n");
    expect(lines.length).toBe(3);
  });

  it("should use all middle chars for same values", () => {
    const result = heatmap([[5, 5], [5, 5]]);
    // All same → maps to middle index
    const chars = [" ", "░", "▒", "▓", "█"];
    const midChar = chars[2]; // ▒
    expect(result).toInclude(midChar);
  });

  it("should use custom chars", () => {
    const result = heatmap([[0, 5, 10]], { chars: [".", "o", "O", "@", "#"] });
    expect(result).toInclude(".");
    expect(result).toInclude("#");
  });

  it("should show row labels when enabled", () => {
    const result = heatmap([[1, 2], [3, 4]], {
      showLabels: true,
      rowLabels: ["Mon", "Tue"],
    });
    expect(result).toInclude("Mon");
    expect(result).toInclude("Tue");
  });

  it("should return empty string for empty data", () => {
    expect(heatmap([])).toBe("");
  });

  it("should handle jagged rows gracefully", () => {
    const result = heatmap([[1, 2, 3], [4]]);
    const lines = result.split("\n");
    expect(lines.length).toBe(2);
  });
});

describe("miniTable", () => {
  it("should render a kvTable with all keys and values", () => {
    const result = kvTable([
      { key: "CPU", value: "78%" },
      { key: "MEM", value: "4.2GB" },
      { key: "DISK", value: "120GB" },
    ]);
    expect(result).toInclude("CPU");
    expect(result).toInclude("78%");
    expect(result).toInclude("MEM");
    expect(result).toInclude("4.2GB");
    expect(result).toInclude("DISK");
  });

  it("should add separator line after header row", () => {
    const result = miniTable(
      [["Name", "Value"], ["CPU", "78%"]],
      { header: true }
    );
    expect(result).toInclude("├");
    expect(result).toInclude("┼");
  });

  it("should not include box chars with border none", () => {
    const result = miniTable(
      [["A", "B"], ["C", "D"]],
      { border: "none" }
    );
    expect(result).not.toInclude("│");
    expect(result).not.toInclude("┌");
    expect(result).not.toInclude("└");
  });

  it("should auto-size columns to longest cell", () => {
    const result = miniTable([
      ["Short", "X"],
      ["LongerLabel", "YY"],
    ]);
    // Both rows should have same-width structure
    const lines = result.split("\n");
    // Top and bottom borders should be same length
    expect(lines[0].length).toBe(lines[lines.length - 1].length);
  });

  it("should return empty string for empty rows", () => {
    expect(miniTable([])).toBe("");
  });

  it("should render rounded borders", () => {
    const result = miniTable([["A", "B"]], { border: "rounded" });
    expect(result).toInclude("╭");
    expect(result).toInclude("╯");
  });

  it("should return empty string for empty kvTable", () => {
    expect(kvTable([])).toBe("");
  });
});

describe("histogram", () => {
  it("should produce correct number of lines for 5 bins", () => {
    const result = histogram([1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 5, 5, 5, 5, 5], { bins: 5 });
    const lines = result.split("\n");
    expect(lines.length).toBe(5);
  });

  it("should handle all-same values with 1 effective bin", () => {
    const result = histogram([7, 7, 7, 7], { bins: 3 });
    const lines = result.split("\n");
    // All values go into first bin since range is 0
    expect(lines.length).toBe(3);
    expect(result).toInclude("█");
  });

  it("should show percentages when enabled", () => {
    const result = histogram([1, 2, 3], { bins: 3, percentages: true });
    expect(result).toInclude("%");
  });

  it("should use custom fill character", () => {
    const result = histogram([1, 2, 3, 4, 5], { bins: 5, fill: "#" });
    expect(result).toInclude("#");
    expect(result).not.toInclude("█");
  });

  it("should handle single value", () => {
    const result = histogram([42], { bins: 3 });
    expect(result).toBeString();
    expect(result.split("\n").length).toBe(3);
  });

  it("should handle negative values", () => {
    const result = histogram([-5, -3, 0, 2, 4], { bins: 3 });
    expect(result).toInclude("-");
  });

  it("should return empty string for empty array", () => {
    expect(histogram([])).toBe("");
  });
});

describe("compare", () => {
  it("should detect upward change", () => {
    const result = compare("Before", 45, "After", 78);
    expect(result.delta).toBe(33);
    expect(result.direction).toBe("up");
    expect(result.arrow).toBe("↑");
    expect(result.deltaPercent).toBeGreaterThan(0);
    expect(result.display).toInclude("Before");
    expect(result.display).toInclude("After");
  });

  it("should detect downward change", () => {
    const result = compare("Before", 100, "After", 60);
    expect(result.delta).toBe(-40);
    expect(result.direction).toBe("down");
    expect(result.arrow).toBe("↓");
  });

  it("should detect same values", () => {
    const result = compare("A", 50, "B", 50);
    expect(result.delta).toBe(0);
    expect(result.direction).toBe("same");
    expect(result.arrow).toBe("→");
  });

  it("should compute avg-based delta for arrays", () => {
    const result = compare("Week1", [10, 20, 30], "Week2", [15, 25, 35]);
    expect(result.delta).toBe(5);
    expect(result.direction).toBe("up");
  });

  it("should render compact mode as single line", () => {
    const result = compare("Plan", 100, "Actual", 87, { mode: "compact", unit: "%" });
    expect(result.display).not.toInclude("\n");
    expect(result.display).toInclude("Plan");
    expect(result.display).toInclude("Actual");
    expect(result.display).toInclude("%");
  });

  it("should render spark mode with sparklines for arrays", () => {
    const result = compare("Week1", [10, 20, 30], "Week2", [15, 25, 35], { mode: "spark" });
    expect(result.display).toInclude("avg=");
    expect(result.display).toInclude("↑");
  });

  it("should handle val1=0 without division error", () => {
    const result = compare("Before", 0, "After", 10);
    expect(result.delta).toBe(10);
    expect(result.direction).toBe("up");
    expect(result.deltaPercent).toBe(100);
  });

  it("should handle both values zero", () => {
    const result = compare("A", 0, "B", 0);
    expect(result.delta).toBe(0);
    expect(result.direction).toBe("same");
    expect(result.deltaPercent).toBe(0);
  });
});