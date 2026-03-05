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

function createValidationError(message: string, details: string[]): ValidationError {
  const error = new Error(message) as ValidationError;
  (error as any).code = "VALIDATION_ERROR";
  (error as any).details = details;
  return error;
}

function createWebhookError(
  message: string,
  provider: WebhookProvider,
  statusCode?: number
): WebhookError {
  const error = new Error(message) as WebhookError;
  (error as any).code = "WEBHOOK_ERROR";
  (error as any).provider = provider;
  (error as any).statusCode = statusCode;
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
    throw createValidationError("Invalid webhook configuration", errors);
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
    throw createValidationError("Invalid webhook payload", errors);
  }
}

function formatDiscordPayload(payload: WebhookPayload): string {
  const baseFields = [
    {
      name: "Values",
      value: payload.rawValues.map(v => v.toFixed(2)).join(", "),
      inline: false,
    },
    {
      name: "Count",
      value: payload.rawValues.length.toString(),
      inline: true,
    },
    {
      name: "Timestamp",
      value: payload.timestamp.toISOString(),
      inline: true,
    },
  ];

  const fields = [...baseFields];
  
  if (payload.metadata && Object.keys(payload.metadata).length > 0) {
    fields.push({
      name: "Metadata",
      value: `\`\`\`json\n${JSON.stringify(payload.metadata, null, 2)}\n\`\`\``,
      inline: false,
    });
  }

  const embed: DiscordEmbed = {
    title: `Metric: ${payload.metricName}`,
    description: `\`\`\`\n${payload.sparkline}\n\`\`\``,
    color: 0x3498db,
    fields,
    timestamp: payload.timestamp.toISOString(),
  };

  return JSON.stringify({ embeds: [embed] });
}

function formatSlackPayload(payload: WebhookPayload): string {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Metric: ${payload.metricName}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `\`\`\`\n${payload.sparkline}\n\`\`\``,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Count:*\n${payload.rawValues.length}`,
        },
        {
          type: "mrkdwn",
          text: `*Timestamp:*\n${payload.timestamp.toISOString()}`,
        },
      ],
    },
  ];
  if (payload.metadata && Object.keys(payload.metadata).length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Metadata:*\n\`\`\`json\n${JSON.stringify(payload.metadata, null, 2)}\n\`\`\``,
      },
    });
  }
  return JSON.stringify({ blocks });
}

function formatTelegramPayload(payload: WebhookPayload, parseMode: string = "Markdown"): string {
  const values = payload.rawValues.map(v => v.toFixed(2)).join(", ");
  const lines = [
    `*${payload.metricName}*`,
    `\`${payload.sparkline}\``,
    `Count: ${payload.rawValues.length} | Values: ${values}`,
    `Time: ${payload.timestamp.toISOString()}`,
  ];
  if (payload.metadata && Object.keys(payload.metadata).length > 0) {
    lines.push(`Metadata: \`${JSON.stringify(payload.metadata)}\``);
  }
  return lines.join("\n");
}

function formatPayload(payload: WebhookPayload, provider: WebhookProvider, telegramParseMode?: string): string {
  switch (provider) {
    case "discord":
      return formatDiscordPayload(payload);
    case "slack":
      return formatSlackPayload(payload);
    case "telegram":
      return formatTelegramPayload(payload, telegramParseMode);
    default:
      throw createWebhookError(`Unsupported provider: ${provider}`, provider);
  }
}

function makeHttpRequest(
  endpoint: string,
  options: HttpRequestOptions
): Promise<{ statusCode: number; statusMessage: string; body: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new url.URL(endpoint);
    const isHttps = parsedUrl.protocol === "https:";
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method,
      headers: options.headers,
      timeout: options.timeout,
    };
    const req = (isHttps ? https : http).request(requestOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        resolve({
          statusCode: res.statusCode || 0,
          statusMessage: res.statusMessage || "",
          body,
        });
      });
    });
    req.on("error", (err) => reject(err));
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

async function attemptDelivery(
  endpoint: string,
  provider: WebhookProvider,
  body: string,
  authHeaders: Record<string, string> = {},
  timeoutMs: number
): Promise<WebhookResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "webhook-spark/1.0",
    ...authHeaders,
  };
  const options: HttpRequestOptions = {
    method: "POST",
    headers,
    body,
    timeout: timeoutMs,
  };
  try {
    const response = await makeHttpRequest(endpoint, options);
    const success = response.statusCode >= 200 && response.statusCode < 300;
    return {
      success,
      statusCode: response.statusCode,
      statusMessage: response.statusMessage,
      body: response.body,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateBackoffMs(
  attempt: number,
  baseMs: number,
  maxMs: number
): number {
  const backoff = baseMs * Math.pow(2, attempt);
  return Math.min(backoff, maxMs);
}

export async function sendWebhook(
  payload: WebhookPayload,
  config: WebhookConfig,
  options?: WebhookDeliveryOptions
): Promise<WebhookResponse> {
  validateWebhookPayload(payload);
  validateWebhookConfig(config);
  const mergedOptions: Required<WebhookDeliveryOptions> = {
    ...DEFAULT_DELIVERY_OPTIONS,
    ...options,
    timeoutMs: config.timeoutMs ?? options?.timeoutMs ?? DEFAULT_DELIVERY_OPTIONS.timeoutMs,
    retryAttempts: config.retryAttempts ?? options?.retryAttempts ?? DEFAULT_DELIVERY_OPTIONS.retryAttempts,
  };
  // For Telegram, format as text and wrap in Bot API JSON body
  const isTelegram = config.provider === "telegram";
  const telegramConfig = config.telegram;
  let endpoint = config.endpoint;
  let formattedBody: string;

  if (isTelegram) {
    if (!telegramConfig) {
      throw createWebhookError("Telegram config (botToken, chatId) required for telegram provider", "telegram");
    }
    endpoint = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;
    const text = formatPayload(payload, "telegram", telegramConfig.parseMode);
    formattedBody = JSON.stringify({
      chat_id: telegramConfig.chatId,
      text,
      parse_mode: telegramConfig.parseMode || "Markdown",
    });
  } else {
    formattedBody = formatPayload(payload, config.provider);
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= mergedOptions.retryAttempts; attempt++) {
    if (attempt > 0) {
      const backoff = calculateBackoffMs(
        attempt - 1,
        mergedOptions.backoffBaseMs,
        mergedOptions.maxBackoffMs
      );
      await sleep(backoff);
    }
    const result = await attemptDelivery(
      endpoint,
      config.provider,
      formattedBody,
      config.authHeaders,
      mergedOptions.timeoutMs
    );
    if (result.success) {
      return result;
    }
    lastError = result.error;
    const isTransient = result.statusCode && (
      result.statusCode === 429 ||
      result.statusCode >= 500
    );
    if (!isTransient) {
      break;
    }
    if (attempt === mergedOptions.retryAttempts) {
      break;
    }
  }
  if (lastError) {
    throw createWebhookError(
      `Webhook delivery failed after ${mergedOptions.retryAttempts + 1} attempts: ${lastError.message}`,
      config.provider
    );
  }
  const finalResponse: WebhookResponse = {
    success: false,
    error: lastError,
  };
  return finalResponse;
}