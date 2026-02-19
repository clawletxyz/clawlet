/**
 * Mock x402-enabled API server for demo purposes.
 *
 * Endpoints charge USDC via the x402 protocol (402 -> sign -> retry).
 * No real on-chain settlement — signatures are accepted and a fake txHash
 * is returned so the full flow can be demonstrated locally.
 *
 * Usage:  npx tsx demo/server.ts
 * Runs on: http://localhost:4020
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";

const DEFAULT_PORT = 4020;
const MERCHANT_ADDRESS = "0x" + "a".repeat(40); // fake merchant

/* -- Endpoint catalogue --------------------------------------------------- */

interface PaidEndpoint {
  /** Human amount in USDC (6 decimals) */
  price: string;
  /** Atomic units (price * 1e6) */
  amount: string;
  description: string;
  handler: () => unknown;
}

const ENDPOINTS: Record<string, PaidEndpoint> = {
  "/api/joke": {
    price: "0.01",
    amount: "10000",
    description: "Premium AI joke",
    handler: () => ({
      joke: "Why do AI agents carry wallets? Because they heard the cloud charges by the hour.",
      source: "clawlet-demo",
    }),
  },
  "/api/weather": {
    price: "0.05",
    amount: "50000",
    description: "Weather forecast for San Francisco",
    handler: () => ({
      location: "San Francisco, CA",
      temperature: "62\u00b0F",
      condition: "Partly cloudy",
      forecast: [
        { day: "Tue", high: 64, low: 52, condition: "Sunny" },
        { day: "Wed", high: 61, low: 50, condition: "Fog" },
        { day: "Thu", high: 65, low: 53, condition: "Sunny" },
      ],
    }),
  },
  "/api/market-data": {
    price: "0.10",
    amount: "100000",
    description: "Crypto market snapshot",
    handler: () => ({
      timestamp: new Date().toISOString(),
      prices: {
        ETH: { usd: 3842.5, change24h: "+2.1%" },
        BTC: { usd: 97215.0, change24h: "+0.8%" },
        SOL: { usd: 184.3, change24h: "+4.5%" },
        USDC: { usd: 1.0, change24h: "0.0%" },
      },
      gasPrice: "0.003 gwei (Base L2)",
    }),
  },
  "/api/sentiment": {
    price: "0.02",
    amount: "20000",
    description: "Social sentiment analysis",
    handler: () => ({
      topic: "AI agents",
      sentiment: "bullish",
      score: 0.87,
      trending: ["x402", "agent wallets", "MCP", "on-chain AI"],
      volume: "12.4k mentions/hr",
    }),
  },
  "/api/code-review": {
    price: "0.25",
    amount: "250000",
    description: "AI code review",
    handler: () => ({
      rating: "A",
      issues: 0,
      suggestions: [
        "Consider adding input validation on line 42",
        "The retry logic could use exponential backoff",
      ],
      securityScore: "98/100",
      reviewed: true,
    }),
  },
};

/* -- Helpers --------------------------------------------------------------- */

function json(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    ...extraHeaders,
  });
  res.end(data);
}

function makePaymentRequired(endpoint: PaidEndpoint, url: string): string {
  const payload = {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:84532",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount: endpoint.amount,
        payTo: MERCHANT_ADDRESS,
        maxTimeoutSeconds: 600,
        extra: {},
      },
    ],
    resource: {
      url,
      description: endpoint.description,
    },
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function makePaymentResponse(): string {
  const fakeTxHash = "0x" + randomBytes(32).toString("hex");
  const receipt = { transaction: fakeTxHash, settled: true };
  return Buffer.from(JSON.stringify(receipt)).toString("base64");
}

function getBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => resolve(data));
  });
}

/* -- Request handler ------------------------------------------------------- */

function createHandler(port: number) {
  return async function handler(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const path = url.pathname;
    const method = req.method ?? "GET";

    // CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT",
        "Access-Control-Expose-Headers": "payment-required, payment-response",
      });
      return res.end();
    }

    // Landing page
    if (path === "/" || path === "/api") {
      return json(res, 200, {
        name: "clawlet-demo-server",
        description: "Mock x402-enabled API for testing agent payments",
        network: "eip155:84532 (Base Sepolia)",
        merchant: MERCHANT_ADDRESS,
        endpoints: Object.entries(ENDPOINTS).map(([p, e]) => ({
          path: p,
          price: `${e.price} USDC`,
          description: e.description,
        })),
      });
    }

    // Paid endpoints
    const endpoint = ENDPOINTS[path];
    if (!endpoint) {
      return json(res, 404, { error: "Not found", available: Object.keys(ENDPOINTS) });
    }

    // Check for payment signature (retry request)
    const paymentSig =
      req.headers["payment-signature"] ??
      req.headers["PAYMENT-SIGNATURE"] ??
      req.headers["x-payment"] ??
      req.headers["X-PAYMENT"];

    if (paymentSig) {
      // Accept any valid-looking signature — this is a demo server
      try {
        const decoded = JSON.parse(
          Buffer.from(paymentSig as string, "base64").toString("utf-8"),
        );
        if (decoded.payload?.signature) {
          const data = endpoint.handler();
          return json(res, 200, data, {
            "payment-response": makePaymentResponse(),
            "Access-Control-Expose-Headers": "payment-response",
          });
        }
      } catch {
        // Invalid signature format
      }
      return json(res, 402, { error: "Invalid payment signature" });
    }

    // No payment — return 402
    const paymentRequired = makePaymentRequired(endpoint, `http://localhost:${port}${path}`);
    res.writeHead(402, {
      "Content-Type": "application/json",
      "payment-required": paymentRequired,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "payment-required",
    });
    res.end(JSON.stringify({
      error: "Payment Required",
      price: `${endpoint.price} USDC`,
      description: endpoint.description,
      hint: "Send x402 payment to access this endpoint",
    }, null, 2));
  };
}

/* -- Exported start function ----------------------------------------------- */

export function startDemoServer(port?: number): void {
  const p = port ?? DEFAULT_PORT;
  const server = createServer(createHandler(p));
  server.listen(p, () => {
    console.log(`
  x402 Demo Server
  http://localhost:${p}

  Endpoints:
${Object.entries(ENDPOINTS)
  .map(([path, e]) => `    ${e.price.padStart(5)} USDC  ${path.padEnd(20)} ${e.description}`)
  .join("\n")}

  Try:  curl http://localhost:${p}/api/joke
        -> 402 Payment Required
`);
  });
}

// CLI usage: run directly
const isDirectRun = process.argv[1] &&
  (process.argv[1].endsWith("/server.js") || process.argv[1].endsWith("/server.ts"));
if (isDirectRun) {
  startDemoServer();
}
