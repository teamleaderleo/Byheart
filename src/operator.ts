import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { InterventionContext, InterventionDisposition } from "./replay.js";

interface PendingIntervention {
  context: InterventionContext;
  screenshotUri?: string;
  resolve: (value: InterventionDisposition) => void;
}

export interface OperatorGateOptions {
  host?: string;
  port?: number;
}

export class OperatorGate {
  private readonly host: string;
  private readonly requestedPort: number;
  private server?: Server;
  private pending?: PendingIntervention;
  private listeningPort?: number;

  constructor(options: OperatorGateOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.requestedPort = options.port ?? 0;
  }

  async start(): Promise<void> {
    if (this.server) return;
    this.server = createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? this.host}`);

      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(this.render());
        return;
      }

      if (request.method === "GET" && url.pathname === "/screenshot") {
        const uri = this.pending?.screenshotUri;
        if (!uri?.startsWith("file://")) {
          response.writeHead(404).end("no screenshot");
          return;
        }
        try {
          const bytes = await readFile(fileURLToPath(uri));
          response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
          response.end(bytes);
        } catch {
          response.writeHead(404).end("screenshot unavailable");
        }
        return;
      }

      if (request.method === "POST" && (url.pathname === "/resume" || url.pathname === "/abort")) {
        if (!this.pending) {
          response.writeHead(409).end("no intervention is waiting");
          return;
        }
        const pending = this.pending;
        this.pending = undefined;
        pending.resolve(url.pathname === "/resume" ? "resume" : "abort");
        response.writeHead(303, { location: "/" }).end();
        return;
      }

      response.writeHead(404).end("not found");
    });

    await new Promise<void>((resolvePromise, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.requestedPort, this.host, () => {
        this.server!.off("error", reject);
        const address = this.server!.address();
        if (!address || typeof address === "string") {
          reject(new Error("operator server did not expose a TCP address"));
          return;
        }
        this.listeningPort = address.port;
        resolvePromise();
      });
    });
  }

  url(): string {
    if (!this.listeningPort) throw new Error("operator gate has not started");
    return `http://${this.host}:${this.listeningPort}`;
  }

  handler = async (context: InterventionContext): Promise<InterventionDisposition> => {
    await this.start();
    if (this.pending) throw new Error("operator gate already has a pending intervention");

    const screenshot = await context.surface.captureEvidence?.("human-handoff");
    return new Promise<InterventionDisposition>((resolvePromise) => {
      this.pending = {
        context,
        ...(screenshot ? { screenshotUri: screenshot.uri } : {}),
        resolve: resolvePromise,
      };
      console.log(`Human takeover requested. Operator surface: ${this.url()}`);
    });
  };

  async close(): Promise<void> {
    if (this.pending) {
      const pending = this.pending;
      this.pending = undefined;
      pending.resolve("abort");
    }
    if (!this.server) return;
    const server = this.server;
    this.server = undefined;
    this.listeningPort = undefined;
    await new Promise<void>((resolvePromise, reject) => {
      server.close((error) => error ? reject(error) : resolvePromise());
    });
  }

  private render(): string {
    const pending = this.pending;
    if (!pending) {
      return page("Byheart operator", `<h1>No intervention waiting</h1><p>The operator surface is ready.</p>`);
    }

    const { context } = pending;
    const screenshot = pending.screenshotUri
      ? `<img src="/screenshot?${Date.now()}" alt="Current session screenshot">`
      : `<p>No screenshot was captured.</p>`;

    return page(
      "Byheart intervention",
      `<header><strong>BYHEART // HUMAN TAKEOVER</strong><span>same live session</span></header>
       <main>
         <h1>${escapeHtml(context.capability.name)}</h1>
         <dl>
           <dt>Run</dt><dd>${escapeHtml(context.runId)}</dd>
           <dt>Step</dt><dd>${escapeHtml(context.step.id)}</dd>
           <dt>Session</dt><dd>${escapeHtml(context.session.sessionId)}</dd>
           <dt>Reason</dt><dd>${escapeHtml(context.reason)}</dd>
         </dl>
         <p>Operate the live target session directly. When the required postcondition is true, hand control back.</p>
         ${screenshot}
         <div class="actions">
           <form method="post" action="/resume"><button class="primary">Resume automation</button></form>
           <form method="post" action="/abort"><button>Stop run</button></form>
         </div>
       </main>`,
    );
  }
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  :root{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#12151b;color:#ece9de}body{margin:0}header{display:flex;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #565b66}main{max-width:920px;margin:32px auto;padding:0 20px}dl{display:grid;grid-template-columns:120px 1fr;gap:8px}dt{color:#9ea7b8}dd{margin:0}img{max-width:100%;border:1px solid #565b66;margin:18px 0}.actions{display:flex;gap:12px;margin-top:24px}.actions form{margin:0}button{font:inherit;padding:10px 14px;background:#252b35;color:#ece9de;border:1px solid #6d7480;cursor:pointer}.primary{background:#ece9de;color:#12151b}p{line-height:1.55}</style></head><body>${body}</body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}
