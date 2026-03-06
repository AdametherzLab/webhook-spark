import * as https from "https";
import * as crypto from "crypto";
import * as url from "url";
import type { BlueskyConfig, XConfig, SocialPostResult } from "./types.js";

function httpsPost(
  endpoint: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number = 15000
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(endpoint);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      }
    );
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.write(body);
    req.end();
  });
}

export async function postToBluesky(
  text: string,
  config: BlueskyConfig
): Promise<SocialPostResult> {
  const service = config.service ?? "https://bsky.social";
  const startTime = new Date();

  try {
    console.error(JSON.stringify({
      timestamp: startTime.toISOString(),
      level: 'info',
      platform: 'bluesky',
      message: 'Creating session',
      service,
      handle: config.handle,
    }));

    const sessionRes = await httpsPost(
      `${service}/xrpc/com.atproto.server.createSession`,
      JSON.stringify({
        identifier: config.handle,
        password: config.appPassword,
      }),
      {}
    );

    if (sessionRes.statusCode !== 200) {
      const errorDetails = {
        timestamp: new Date().toISOString(),
        level: 'error',
        platform: 'bluesky',
        message: 'Session creation failed',
        service,
        handle: config.handle,
        statusCode: sessionRes.statusCode,
        responseBody: sessionRes.body,
      };
      console.error(JSON.stringify(errorDetails));
      
      const err = JSON.parse(sessionRes.body);
      return {
        success: false,
        platform: "bluesky",
        error: `Auth failed: ${err.message ?? err.error ?? sessionRes.body}`,
      };
    }

    const session = JSON.parse(sessionRes.body);
    const accessJwt = session.accessJwt;
    const did = session.did;

    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      platform: 'bluesky',
      message: 'Session created',
      service,
      handle: config.handle,
      did,
    }));

    const now = new Date().toISOString();
    const postPayload = JSON.stringify({
      repo: did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text,
        createdAt: now,
      },
    });

    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      platform: 'bluesky',
      message: 'Posting record',
      service,
      did,
      textLength: text.length,
    }));

    const postRes = await httpsPost(
      `${service}/xrpc/com.atproto.repo.createRecord`,
      postPayload,
      { Authorization: `Bearer ${accessJwt}` }
    );

    if (postRes.statusCode !== 200) {
      const errorDetails = {
        timestamp: new Date().toISOString(),
        level: 'error',
        platform: 'bluesky',
        message: 'Post failed',
        service,
        did,
        statusCode: postRes.statusCode,
        responseBody: postRes.body,
      };
      console.error(JSON.stringify(errorDetails));
      
      const err = JSON.parse(postRes.body);
      return {
        success: false,
        platform: "bluesky",
        error: `Post failed: ${err.message ?? err.error ?? postRes.body}`,
      };
    }

    const result = JSON.parse(postRes.body);
    const rkey = result.uri?.split("/").pop() ?? "";
    const handle = config.handle.replace(/^@/, "");
    const postUrl = `https://bsky.app/profile/${handle}/post/${rkey}`;

    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      platform: 'bluesky',
      message: 'Post succeeded',
      service,
      postUrl,
      rkey,
      durationMs: new Date().getTime() - startTime.getTime(),
    }));

    return {
      success: true,
      platform: "bluesky",
      postId: result.uri,
      postUrl,
    };
  } catch (err) {
    const errorDetails = {
      timestamp: new Date().toISOString(),
      level: 'error',
      platform: 'bluesky',
      message: 'Unexpected error',
      service,
      handle: config.handle,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      durationMs: new Date().getTime() - startTime.getTime(),
    };
    console.error(JSON.stringify(errorDetails));
    
    return {
      success: false,
      platform: "bluesky",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Rest of social.ts remains unchanged...