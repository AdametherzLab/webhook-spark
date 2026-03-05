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

export interface DiscordEmbed {
  readonly title?: string;
  readonly description?: string;
  readonly color?: number;
  readonly fields?: Array<{
    readonly name: string;
    readonly value: string;
    readonly inline?: boolean;
  }>;
  readonly timestamp?: string;
}

export interface SlackBlock {
  readonly type: string;
  readonly text?: {
    readonly type: string;
    readonly text: string;
  };
  readonly fields?: Array<{
    readonly type: string;
    readonly text: string;
  }>;
}

export interface WebhookResponse {
  readonly success: boolean;
  readonly statusCode?: number;
  readonly statusMessage?: string;
  readonly body?: string;
  readonly error?: Error;
}

export type SparklineCharacterSet = "▁▂▃▄▅▆▇█" | "·∙●○◉◎" | "⠀⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒⠓⠔⠕⠖⠗⠘⠙⠚⠛⠜⠝⠞⠟⠠⠡⠢⠣⠤⠥⠦⠧⠨⠩⠪⠫⠬⠭⠮⠯⠰⠱⠲⠳⠴⠵⠶⠷⠸⠹⠺⠻⠼⠽⠾⠿";

export interface ASCIIArtConfig {
  readonly characterSet: SparklineCharacterSet;
  readonly invert?: boolean;
  readonly padding?: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  };
}

export interface ValidationError extends Error {
  readonly code: "VALIDATION_ERROR";
  readonly details: string[];
}

export interface WebhookError extends Error {
  readonly code: "WEBHOOK_ERROR";
  readonly provider: WebhookProvider;
  readonly statusCode?: number;
}

export interface ConfigFile {
  readonly webhooks: readonly WebhookConfig[];
  readonly defaultSparkline?: Partial<SparklineConfig>;
  readonly dataDir?: string;
  readonly maxHistory?: number;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface HttpRequestOptions {
  readonly method: HttpMethod;
  readonly headers?: Record<string, string>;
  readonly body?: string | Buffer;
  readonly timeout?: number;
}

export interface TelegramConfig {
  readonly botToken: string;
  readonly chatId: string;
  readonly parseMode?: "Markdown" | "MarkdownV2" | "HTML";
}

export type NumericArray = readonly number[];

export function isNumericArray(value: unknown): value is NumericArray {
  return Array.isArray(value) && value.every(item => typeof item === "number");
}

export function isSparklineConfig(value: unknown): value is SparklineConfig {
  if (typeof value !== "object" || value === null) return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config.width === "number" &&
    typeof config.height === "number" &&
    isNumericArray(config.dataPoints)
  );
}

export function isWebhookConfig(value: unknown): value is WebhookConfig {
  if (typeof value !== "object" || value === null) return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config.endpoint === "string" &&
    (config.provider === "discord" || config.provider === "slack" || config.provider === "telegram")
  );
}

export type WebhookSendResult =
  | { readonly success: true; readonly response: WebhookResponse }
  | { readonly success: false; readonly error: WebhookError };

export type SparklineGenerationResult =
  | { readonly success: true; readonly sparkline: string }
  | { readonly success: false; readonly error: ValidationError };