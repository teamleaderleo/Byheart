import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { redactEvent } from "./evidence.js";
import type { EvidenceEvent, EvidenceRef, EvidenceSink } from "./types.js";

export class FileEvidenceSink implements EvidenceSink {
  private readonly file: string;
  private ready: Promise<void> | undefined;

  constructor(directory: string, filename = "events.jsonl") {
    const root = resolve(directory);
    this.file = resolve(root, filename);
    this.ready = mkdir(root, { recursive: true }).then(() => undefined);
  }

  async record(event: EvidenceEvent): Promise<void> {
    await this.ready;
    const safe = redactEvent(event);
    await appendFile(this.file, JSON.stringify(safe) + "\n", "utf8");
  }

  refs(): EvidenceRef[] {
    return [
      {
        kind: "log",
        uri: `file://${this.file}`,
        description: "redacted structured run event log",
      },
    ];
  }
}
