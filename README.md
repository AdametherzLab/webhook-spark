# webhook-spark

**Zero-dep terminal sparklines, gauges, kaomoji, heatmaps, tables, histograms & dashboards for Discord/Slack/Telegram, LCD screens, IoT & AI agents.**

Zero dependencies. TypeScript first. Under 20KB.

## Who is this for?

- **Homelab / DevOps** -- server monitoring alerts with sparklines, heatmaps, and threshold status
- **LCD / OLED hackers** -- fixed-width output that fits 16x2, 20x4, and SSD1306 displays
- **DIY / IoT makers** -- multi-sensor dashboards for greenhouses, aquariums, server racks
- **AI agent builders** -- compact metric summaries that fit in LLM context windows
- **Dashboard addicts** -- kaomoji status faces, histograms, comparison charts, all in pure text

## Installation

```bash
bun add @adametherzlab/webhook-spark
# or: npm install @adametherzlab/webhook-spark
```

## Quick Start

```typescript
import { spark, gauge, kaomoji, kaomojiStatus, heatmap, dashboard } from '@adametherzlab/webhook-spark';

// Sparkline from numbers
spark([10, 25, 60, 85, 90, 45, 30]);
// => "▁▂▅▇█▃▂"

// Progress gauge
gauge(75, 100);
// => "████████████████░░░░ 75%"

// Kaomoji mood faces
kaomoji("happy");              // => "(*^▽^*)"
kaomoji("happy", { theme: "cats" }); // => "ᓚᘏᗢ"

// Status kaomoji from a value
kaomojiStatus(95, 100, { thresholds: { warning: 70, critical: 90 } });
// => { face: "(╥_╥)", mood: "critical" }

// Heatmap grid
heatmap([[2,5,8],[1,7,9],[3,6,7]], {
  showLabels: true, rowLabels: ["Mon","Tue","Wed"], colLabels: ["AM","PM","NT"]
});
// =>     AM PM NT
//   Mon  ░  ▒  ▓
//   Tue  ░  ▓  █
//   Wed  ░  ▒  ▓
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
gauge(92, 100, { thresholds: { warning: 70, critical: 90 } })
// => "████████████████████ 92% CRITICAL"
```

Options: `width`, `fill`, `empty`, `showPercent`, `showValue`, `label`, `thresholds`.

### `kaomoji(mood, options?)` -- Mood Kaomoji

Returns a kaomoji face for the given mood. 5 themes, 13 moods.

```typescript
kaomoji("happy")                        // => "(*^▽^*)"
kaomoji("happy", { theme: "cats" })     // => "ᓚᘏᗢ"
kaomoji("critical", { theme: "bears" }) // => "ʕ×ᴥ×ʔ"
kaomoji("celebrating")                  // => "☆*:.｡.o(≧▽≦)o.｡.:*☆"
kaomoji("sleeping", { theme: "minimal" }) // => "-_-zzz"
```

**Moods:** `happy`, `ok`, `warning`, `critical`, `sad`, `angry`, `love`, `surprised`, `sleeping`, `working`, `celebrating`, `confused`, `dead`

**Themes:** `classic`, `cats`, `bears`, `stars`, `minimal`

### `kaomojiAll(mood, options?)` -- All Faces for a Mood

```typescript
kaomojiAll("happy");
// => ["(*^▽^*)", "(´｡• ᵕ •｡`)", "(✿◠‿◠)", "(❁´◡`❁)"]
```

### `kaomojiStatus(value, max, options?)` -- Value-to-Mood Mapping

Maps a numeric value to a mood face based on thresholds. Compose with dashboard output.

```typescript
kaomojiStatus(50, 100)   // => { face: "(・_・)", mood: "ok" }
kaomojiStatus(95, 100, { thresholds: { warning: 70, critical: 90 } })
                          // => { face: "(╥_╥)", mood: "critical" }

// Compose with other metrics:
`CPU 85% ${kaomojiStatus(85, 100).face}` // => "CPU 85% (・_・;)"
```

### `kaomojiThemes()` -- List Available Themes

```typescript
kaomojiThemes(); // => ["classic", "cats", "bears", "stars", "minimal"]
```

### `heatmap(data, options?)` -- 2D Grid Heatmap

GitHub contribution graph style, pure text. Rows x columns of shade characters.

```typescript
heatmap([[2,5,8,3],[1,7,9,4],[3,6,7,2]], {
  showLabels: true,
  rowLabels: ["Mon","Tue","Wed"],
  colLabels: ["00","06","12","18"]
});
// =>     00 06 12 18
//   Mon  ░  ▒  ▓  ░
//   Tue  ░  ▓  █  ▒
//   Wed  ░  ▒  ▓  ░
```

Options: `chars` (default `[" ","░","▒","▓","█"]`), `showLabels`, `rowLabels`, `colLabels`, `min`, `max`.

### `miniTable(rows, options?)` -- Compact Box-Drawing Table

4 border styles: `single`, `double`, `rounded`, `none`.

```typescript
miniTable([["Metric","Value","Status"],["CPU","78%","OK"]], { header: true, border: "rounded" });
// => ╭────────┬───────┬────────╮
//    │ Metric │ Value │ Status │
//    ├────────┼───────┼────────┤
//    │ CPU    │ 78%   │ OK     │
//    ╰────────┴───────┴────────╯
```

Options: `border`, `align` (per-column), `header`, `compact`, `maxWidth`.

### `kvTable(entries)` -- Key-Value Table

```typescript
kvTable([{key:"CPU",value:"78%"},{key:"MEM",value:"4.2GB"}]);
// => ┌─────┬───────┐
//    │ CPU │ 78%   │
//    │ MEM │ 4.2GB │
//    └─────┴───────┘
```

### `histogram(values, options?)` -- Frequency Distribution

Groups values into bins, renders horizontal bar chart of frequencies.

```typescript
histogram([1,1,2,2,2,3,3,3,3,4,5,5,5,5,5], { bins: 5 });
// => 1.0-1.8 ████████             2
//    1.8-2.6 ████████████         3
//    2.6-3.4 ████████████████     4
//    3.4-4.2 ████                 1
//    4.2-5.0 ████████████████████ 5

histogram(latencies, { bins: 10, percentages: true, fill: "#" });
```

Options: `bins` (default 8), `barWidth` (default 20), `showCounts`, `fill`, `showBounds`, `percentages`.

### `compare(label1, val1, label2, val2, options?)` -- Side-by-Side Comparison

Visual before/after with delta, percentage change, and direction arrow.

```typescript
compare("Before", 45, "After", 78);
// => { display: "Before ██████████████████ 45\nAfter  ██████████████████████████████ 78\n↑ +33 (+73.3%)",
//      delta: 33, deltaPercent: 73.3, direction: "up", arrow: "↑" }

compare("Plan", 100, "Actual", 87, { mode: "compact", unit: "%" });
// => { display: "Plan 100% vs Actual 87% ↓-13 (-13.0%)", ... }

compare("Week1", [10,20,30], "Week2", [15,25,35], { mode: "spark" });
// => { display: "Week1 ▁▅█  avg=20.0\nWeek2 ▁▅█  avg=25.0\n↑ +5 (+25.0%)", ... }
```

Options: `barWidth`, `showDelta`, `showPercent`, `unit`, `mode` (`"bars"` | `"spark"` | `"compact"`).

### `stats(values, options?)` -- Summary Statistics

```typescript
stats([10, 20, 30, 40, 50]).summary;
// => "min=10 max=50 avg=30 p95=48"
```

### `sparkWithStatus(values, thresholds)` -- Threshold-Aware Sparkline

```typescript
sparkWithStatus([45, 50, 62, 78, 95], { warning: 70, critical: 90 });
// => { sparkline: "▂▃▅▆█", status: "critical", emoji: "🔴", color: 0xe74c3c, breachCount: 2 }
```

### `dashboard(metrics, options?)` -- Multi-Metric Display

```typescript
dashboard([
  { name: 'CPU',  values: [45,50,62,78], unit: '%', thresholds: { warning: 70, critical: 90 } },
  { name: 'MEM',  values: [78,80,82,85], unit: '%', thresholds: { warning: 80, critical: 95 } },
  { name: 'DISK', values: [62,63,63,64], unit: '%', thresholds: { warning: 85, critical: 95 } },
]);
// CPU   78% ▂▃▅█ ⚠️
// MEM   85% ▅▆▇█ ⚠️
// DISK  64% ▅▅▅▅ ✅
```

### `barChart(entries, options?)` -- Horizontal Bar Chart

```typescript
barChart([
  { label: 'GET',  value: 150 },
  { label: 'POST', value: 80 },
], { maxBarWidth: 15 });
```

### `trend(values, window?)` -- Trend Arrow

```typescript
trend([10, 20, 30]);  // => "↑"
trend([30, 20, 10]);  // => "↓"
```

### `sendWebhook(payload, config)` -- Webhook Delivery

Supports Discord, Slack, and Telegram webhooks with validation, retry, and timeout.

## Use Case Gallery

### IoT Greenhouse Dashboard

```typescript
const sensors = [
  { name: 'SOIL', values: moistureReadings, unit: '%', thresholds: { warning: 30, critical: 15, invert: true } },
  { name: 'TEMP', values: tempReadings, unit: 'C', thresholds: { warning: 35, critical: 40 } },
];
const status = dashboard(sensors);
const face = kaomojiStatus(moistureReadings.at(-1), 100, { theme: "cats" }).face;
console.log(`${status}\n${face}`);
```

### AI Agent System Prompt

```typescript
const status = dashboard([
  { name: 'Tokens', values: tokenHistory, unit: 'K', thresholds: { warning: 80, critical: 95 } },
], { compact: true });
const face = kaomojiStatus(tokenHistory.at(-1), 100).face;
// => "Tokens 82K ⚠️ (・_・;)" -- 1 line, minimal tokens
```

### Server Monitoring with Heatmap

```typescript
// 7-day x 24-hour load heatmap
const weeklyLoad = [ /* 7 arrays of 24 hourly values */ ];
console.log(heatmap(weeklyLoad, {
  showLabels: true,
  rowLabels: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
}));
```

### Performance Comparison

```typescript
const result = compare("v1.2", responseTimesOld, "v1.3", responseTimesNew, { mode: "spark", unit: "ms" });
console.log(result.display);
// v1.2 ▃▅▇█▆▅  avg=245.0
// v1.3 ▂▃▅▆▄▃  avg=189.0
// ↓ -56 (-22.9%)
```

### Arduino LCD (16x2)

```typescript
const line1 = gauge(analogRead(A0), 1023, { width: 16, showPercent: false });
const line2 = `T:${temp}C ${trend(tempHistory)}`;
lcd.print(line1 + '\n' + line2);
```

## Why webhook-spark?

| Feature | webhook-spark | blessed-contrib | cli-table3 | ink |
|---------|:---:|:---:|:---:|:---:|
| Zero deps | Yes | No (17) | No (4) | No (11) |
| Sparklines | Yes | Yes | No | No |
| Gauges | Yes | Yes | No | No |
| Kaomoji | Yes | No | No | No |
| Heatmaps | Yes | Yes | No | No |
| Tables | Yes | No | Yes | No |
| Histograms | Yes | Yes | No | No |
| Comparisons | Yes | No | No | No |
| Webhooks | Yes | No | No | No |
| Bundle size | <20KB | 2.5MB | 180KB | 400KB |
| Maintained | Yes | No | Minimal | Yes |

## License

MIT

---

Built for homelabs, hackerspaces, and AI agents.
