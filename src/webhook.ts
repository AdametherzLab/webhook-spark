import * as http from "http";
import * as https from "https";
import * as url from "url";
import type {
  WebhookPayload,
  WebhookConfig,
  WebhookProvider,
  WebhookResponse,
  DiscordEmbed,
  SlackBlock,
  WebhookError,
  ValidationError,
  HttpRequestOptions,
  TelegramConfig,
} from "./types.js";

export interface WebhookDeliveryOptions {
  readonly timeoutMs?: number;
  readonly retryAttempts?: number;
  readonly backoffBaseMs?: number;
  readonly maxBackoffMs?: number;
}

const DEFAULT_DELIVERY_OPTIONS: Required<WebhookDeliveryOptions> = {
  timeoutMs: 10000,
  retryAttempts: 3,
  backoffBaseMs: 1000,
  maxBackoffMs: 30000,
};

function createValidationError(message: string, details: string[], context?: Record<string, unknown>): ValidationError {
  const error = new Error(message) as ValidationError;
  (error as any).code = "VALIDATION_ERROR";
  (error as any).details = details;
  (error as any).context = context;
  return error;
}

function createWebhookError(
  message: string,
  provider: WebhookProvider,
  statusCode?: number,
  endpoint?: string,
  metricName?: string
): WebhookError {
  const error = new Error(message) as WebhookError;
  (error as any).code = "WEBHOOK_ERROR";
  (error as any).provider = provider;
  (error as any).statusCode = statusCode;
  (error as any).endpoint = endpoint;
  (error as any).metricName = metricName;
  return error;
}

function validateWebhookConfig(config: WebhookConfig): void {
  const errors: string[] = [];
  if (!config.endpoint) {
    errors.push("Endpoint is required");
  } else {
    try {
      const parsed = new url.URL(config.endpoint);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        errors.push("Endpoint must be HTTP or HTTPS URL");
      }
    } catch {
      errors.push("Endpoint must be a valid URL");
    }
  }
  if (!config.provider) {
    errors.push("Provider is required");
  } else if (config.provider !== "discord" && config.provider !== "slack" && config.provider !== "telegram") {
    errors.push("Provider must be 'discord', 'slack', or 'telegram'");
  }
  if (config.timeoutMs !== undefined && (config.timeoutMs < 100 || config.timeoutMs > 60000)) {
    errors.push("Timeout must be between 100 and 60000 ms");
  }
  if (config.retryAttempts !== undefined && (config.retryAttempts < 0 || config.retryAttempts > 10)) {
    errors.push("Retry attempts must be between 0 and 10");
  }
  if (errors.length > 0) {
    throw createValidationError("Invalid webhook configuration", errors, {
      provider: config.provider,
      endpoint: config.endpoint,
    });
  }
}

function validateWebhookPayload(payload: WebhookPayload): void {
  const errors: string[] = [];
  if (!payload.timestamp || !(payload.timestamp instanceof Date)) {
    errors.push("Timestamp must be a valid Date");
  }
  if (!payload.metricName || typeof payload.metricName !== "string") {
    errors.push("Metric name must be a non-empty string");
  }
  if (!payload.sparkline || typeof payload.sparkline !== "string") {
    errors.push("Sparkline must be a non-empty string");
  }
  if (!Array.isArray(payload.rawValues) || payload.rawValues.length === 0) {
    errors.push("Raw values must be a non-empty array");
  } else if (!payload.rawValues.every(v => typeof v === "number")) {
    errors.push("All raw values must be numbers");
  }
  if (errors.length > 0) {
    throw createValidationError("Invalid webhook payload", errors, {
      metricName: payload.metricName,
      timestamp: payload.timestamp?.toISOString(),
      rawValuesLength: payload.rawValues.length,
    });
  }
}

async function httpRequest(
  url: string,
  options: HttpRequestOptions,
  timeoutMs: number = 10000
): Promise<WebhookResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const httpModule = parsedUrl.protocol === "https:" ? https : http;

    const req = httpModule.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method,
      headers: options.headers,
      timeout: timeoutMs,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          success: res.statusCode! >= 200 && res.statusCode! < 300,
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          body: Buffer.concat(chunks).toString("utf-8"),
        });
      });
    });

    req.on("error", (err) => {
      reject(err);
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

export async function sendWebhook(
  payload: WebhookPayload,
  config: WebhookConfig
): Promise<WebhookResponse> {
  validateWebhookPayload(payload);
  validateWebhookConfig(config);

  const parsed = new url.URL(config.endpoint);
  let requestOptions: HttpRequestOptions;

  switch (config.provider) {
    case "discord":
      requestOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...config.authHeaders,
        },
        body: formatDiscordPayload(payload),
      };
      break;
    case "slack":
      requestOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...config.authHeaders,
        },
        body: formatSlackPayload(payload),
      };
      break;
    case "telegram":
      requestOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...config.authHeaders,
        },
        body: formatTelegramPayload(payload, config.telegram?.parseMode),
      };
      break;
    default:
      throw new Error("Unsupported webhook provider");
  }

  const maxAttempts = config.retryAttempts ?? DEFAULT_DELIVERY_OPTIONS.retryAttempts;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Attempting webhook request',
        provider: config.provider,
        endpoint: config.endpoint,
        metric: payload.metricName,
        attempt,
        maxAttempts,
      }));

      const response = await httpRequest(parsed.href, requestOptions, config.timeoutMs);
      
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Webhook request succeeded',
        provider: config.provider,
        endpoint: config.endpoint,
        metric: payload.metricName,
        attempt,
        statusCode: response.statusCode,
      }));

      return response;
    } catch (err) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        code: (err as WebhookError).code || 'UNKNOWN_ERROR',
        message: 'Webhook request attempt failed',
        provider: config.provider,
        endpoint: config.endpoint,
        metric: payload.metricName,
        attempt,
        maxAttempts,
        error: (err as Error).message,
        statusCode: (err as WebhookError).statusCode,
      }));

      lastError = err;
      if (attempt < maxAttempts) {
        const delay = Math.min(
          DEFAULT_DELIVERY_OPTIONS.backoffBaseMs * Math.pow(2, attempt - 1),
          DEFAULT_DELIVERY_OPTIONS.maxBackoffMs
        );

        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Retrying webhook request after delay',
          provider: config.provider,
          endpoint: config.endpoint,
          metric: payload.metricName,
          nextAttempt: attempt + 1,
          delay,
        }));

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw createWebhookError(
    `Webhook request failed after ${maxAttempts} attempts`,
    config.provider,
    undefined,
    config.endpoint,
    payload.metricName
  );
}

// Rest of webhook.ts remains unchanged...