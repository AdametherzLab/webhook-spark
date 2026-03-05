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