import type * as http from "http";
import type * as https from "https";

export interface SparklineConfig {
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly width: number;
  readonly height: number;
  readonly includeAxis?: boolean;
  readonly dataPoints: readonly number[];
}

export interface WebhookPayload {
  readonly timestamp: Date;
  readonly metricName: string;
  readonly sparkline: string;
  readonly rawValues: readonly number[];
  readonly metadata?: Record<string, unknown>;
}

export type WebhookProvider = "discord" | "slack" | "telegram";

export interface WebhookConfig {
  readonly endpoint: string;
  readonly provider: WebhookProvider;
  readonly authHeaders?: Record<string, string>;
  readonly timeoutMs?: number;
  readonly retryAttempts?: number;
  readonly telegram?: TelegramConfig;
}

export interface WebhookError extends Error {
  readonly code: "WEBHOOK_ERROR";
  readonly provider: WebhookProvider;
  readonly statusCode?: number;
  readonly endpoint?: string;
  readonly metricName?: string;
}

export interface ValidationError extends Error {
  readonly code: "VALIDATION_ERROR";
  readonly details: string[];
  readonly context?: Record<string, unknown>;
}

// Rest of types.ts remains unchanged...