# webhook-spark

**ASCII sparklines, gauges, dashboards & threshold alerts for Discord/Slack/Telegram, LCD screens, IoT & AI agents.**

Zero dependencies. TypeScript first. Under 15KB.

## Who is this for?

- **Homelab / DevOps** -- server monitoring alerts with sparklines and threshold status
- **LCD / OLED hackers** -- fixed-width output that fits 16x2, 20x4, and SSD1306 displays
- **DIY / IoT makers** -- multi-sensor dashboards for greenhouses, aquariums, server racks
- **AI agent builders** -- compact metric summaries that fit in LLM context windows

## Installation

```bash
bun add @adametherzlab/webhook-spark
# or: npm install @adametherzlab/webhook-spark
```

## Quick Start

```typescript
import { spark, gauge, stats, sparkWithStatus, dashboard, sendWebhook } from '@adametherzlab/webhook-spark';

// Sparkline from numbers
spark([10, 25, 60, 85, 90, 45, 30]);
// => "▁▂▅▇█▃▂"

// Progress gauge (battery, tank level, task completion)
gauge(75, 100);
// => "████████████████░░░░ 75%"

// Summary statistics
stats([10, 20, 30, 40, 50]).summary;
// => "min=10 max=50 avg=30 p95=48"

// Threshold-aware sparkline
sparkWithStatus([45, 50, 62, 78, 95], { warning: 70, critical: 90 });
// => { sparkline: "▂▃▅▆█", status: "critical", emoji: "🔴", ... }

// Multi-metric dashboard in one call
dashboard([
  { name: 'CPU',  values: [45,50,62,78], unit: '%', thresholds: { warning: 70, critical: 90 } },
  { name: 'MEM',  values: [78,80,82,85], unit: '%', thresholds: { warning: 80, critical: 95 } },
  { name: 'DISK', values: [62,63,63,64], unit: '%', thresholds: { warning: 85, critical: 95 } },
]);
// =>
// CPU    78% ▂▃▅█ ⚠️
// MEM    85% ▅▆▇█ ⚠️
// DISK   64% ▅▅▅▅ ✅
```

## API Reference

### `spark(values)` -- Simple Sparkline

```typescript
spark([1, 5, 2, 8, 3, 7]);  // => "▁▅▂█▃▆"
```

### `gauge(value, max, options?)` -- Progress / Level Gauge

```typescript
gauge(75, 100)                          // => "████████████████░░░░ 75%"
gauge(3.7, 4.2, { label: "BATT" })     // => "BATT ██████████████████░░ 88%"
gauge(6, 20, { width: 10, fill: "#", empty: "." })  // => "###....... 30%"

// Threshold alerts
gauge(92, 100, { thresholds: { warning: 70, critical: 90 } })
// => "████████████████████ 92% CRITICAL"
```

**LCD use case:** `lcd.print(gauge(sensorVal, 1023, { width: 16 }))` -- fits a 16-char LCD line.

Options: `width` (default 20), `fill` (default `█`), `empty` (default `░`), `showPercent` (default true), `showValue`, `label`, `thresholds`.

### `stats(values, options?)` -- Summary Statistics

```typescript
const s = stats([10, 20, 30, 40, 50]);
// s.min=10, s.max=50, s.avg=30, s.median=30, s.stdDev=14.14
// s.percentiles = { 95: 48 }
// s.summary = "min=10 max=50 avg=30 p95=48"

// Custom percentiles
stats(data, { percentiles: [50, 90, 99], decimals: 1 });
```

**AI agent use case:** `stats([...tokenCosts]).summary` -- one-line data summary an LLM can reason about.

### `sparkWithStatus(values, thresholds)` -- Threshold-Aware Sparkline

```typescript
sparkWithStatus([45, 50, 62, 78, 95], { warning: 70, critical: 90 })
// => {
//   sparkline: "▂▃▅▆█",
//   status: "critical",
//   emoji: "🔴",
//   color: 0xe74c3c,    // Discord embed color
//   breachCount: 2,
//   breachPercent: 40
// }

// Inverted mode: low values are bad (disk space, battery)
sparkWithStatus([15, 10, 5, 3], { warning: 10, critical: 5, invert: true })
// => status: "critical"
```

Discord embed color auto-maps: green (ok) / yellow (warning) / red (critical).

### `dashboard(metrics, options?)` -- Multi-Metric Display

```typescript
// Full mode (with sparklines)
dashboard([
  { name: 'CPU',  values: [45,50,62,78], unit: '%', thresholds: { warning: 70, critical: 90 } },
  { name: 'MEM',  values: [78,80,82,85], unit: '%', thresholds: { warning: 80, critical: 95 } },
  { name: 'DISK', values: [62,63,63,64], unit: '%', thresholds: { warning: 85, critical: 95 } },
  { name: 'TEMP', values: [42,44,45,43], unit: '°C', thresholds: { warning: 60, critical: 75 } },
]);
// CPU   78% ▂▃▅█ ⚠️
// MEM   85% ▅▆▇█ ⚠️
// DISK  64% ▅▅▅▅ ✅
// TEMP  43°C ▃▄▅▃ ✅

// Compact mode (for 20x4 LCD or AI context)
dashboard([...], { compact: true });
// CPU  78% ⚠️
// MEM  85% ⚠️
// DISK 64% ✅
// TEMP 43°C ✅
```

**LCD use case:** Render to 20x4 or 128x64 OLED in one call.
**AI agent use case:** Paste entire system status into context in 4 lines.

### `barChart(entries, options?)` -- Horizontal Bar Chart

```typescript
barChart([
  { label: 'GET',  value: 150 },
  { label: 'POST', value: 80 },
  { label: 'PUT',  value: 30 },
], { maxBarWidth: 15 });
// GET  ███████████████ 150
// POST ████████       80
// PUT  ███            30
```

### `trend(values, window?)` -- Trend Arrow

```typescript
trend([10, 20, 30]);  // => "↑"
trend([30, 20, 10]);  // => "↓"
trend([10, 10, 10]);  // => "→"
```

### `sendWebhook(payload, config)` -- Webhook Delivery

Supports Discord, Slack, and Telegram webhooks with validation, retry, and timeout.

```typescript
await sendWebhook(
  { timestamp: new Date(), metricName: 'cpu', sparkline: spark(cpuData), rawValues: cpuData },
  { endpoint: 'https://discord.com/api/webhooks/...', provider: 'discord' }
);
```

### `generateSparkline(data, options)` -- Advanced Sparkline

Full control: custom character sets, interpolation, axis, outlier detection.

## Use Case Examples

### IoT Greenhouse Dashboard

```typescript
const sensors = [
  { name: 'SOIL', values: moistureReadings, unit: '%', thresholds: { warning: 30, critical: 15, invert: true } },
  { name: 'TEMP', values: tempReadings, unit: '°C', thresholds: { warning: 35, critical: 40 } },
  { name: 'HUM',  values: humidityReadings, unit: '%' },
];
console.log(dashboard(sensors));
```

### AI Agent System Prompt

```typescript
const status = dashboard([
  { name: 'Tokens', values: tokenHistory, unit: 'K', thresholds: { warning: 80, critical: 95 } },
  { name: 'Tasks',  values: taskCounts, thresholds: { warning: 50, critical: 100 } },
], { compact: true });
// Inject into system prompt: 2 lines, minimal tokens
```

### Arduino LCD (16x2)

```typescript
const line1 = gauge(analogRead(A0), 1023, { width: 16, showPercent: false });
const line2 = `T:${temp}C ${trend(tempHistory)}`;
lcd.print(line1 + '\n' + line2);
```

## License

MIT

---

Built for homelabs, hackerspaces, and AI agents.
