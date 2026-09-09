import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Frame,
  type Locator as PlaywrightLocator,
  type Page,
} from "playwright";
import { resolvePath } from "../template.js";
import type {
  Action,
  ActionReceipt,
  CheckReceipt,
  Condition,
  EvidenceRef,
  ExtractionRule,
  JsonObject,
  JsonValue,
  Locator,
  Observation,
  ScalarType,
  Surface,
  SurfaceIdentity,
} from "../types.js";

export interface PlaywrightSurfaceOptions {
  entrypoint: string;
  headless?: boolean;
  artifactDir?: string;
  sessionId?: string;
  viewport?: { width: number; height: number };
}

export class PlaywrightSurface implements Surface {
  private evidenceSequence = 0;

  private constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private readonly page: Page,
    private readonly options: Required<Pick<PlaywrightSurfaceOptions, "entrypoint" | "artifactDir" | "sessionId">>,
  ) {}

  static async launch(options: PlaywrightSurfaceOptions): Promise<PlaywrightSurface> {
    const sessionId = options.sessionId ?? randomUUID();
    const artifactDir = resolve(options.artifactDir ?? `runtime/${sessionId}`);
    await mkdir(artifactDir, { recursive: true });

    const browser = await chromium.launch({ headless: options.headless ?? true });
    const context = await browser.newContext({
      viewport: options.viewport ?? { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(options.entrypoint, { waitUntil: "domcontentloaded" });

    return new PlaywrightSurface(browser, context, page, {
      entrypoint: options.entrypoint,
      artifactDir,
      sessionId,
    });
  }

  async identity(): Promise<SurfaceIdentity> {
    return {
      adapter: "browser",
      sessionId: this.options.sessionId,
      entrypoint: this.page.url(),
      metadata: {
        configuredEntrypoint: this.options.entrypoint,
        currentUrl: this.page.url(),
        pages: this.context.pages().length,
      },
    };
  }

  async observe(): Promise<Observation> {
    const raw = await this.describePage();
    const screenshot = await this.captureEvidence("observe");
    return {
      at: new Date().toISOString(),
      summary: summarize(raw),
      raw,
      ...(screenshot ? { screenshot } : {}),
    };
  }

  async act(action: Action): Promise<ActionReceipt> {
    const requestedAt = new Date().toISOString();
    const before = await this.observe();
    let delivered = false;
    let detail = "";
    let targetEffectObserved: boolean | undefined;

    try {
      switch (action.kind) {
        case "navigate":
          await this.page.goto(action.url, { waitUntil: "domcontentloaded" });
          delivered = true;
          detail = `navigated to ${action.url}`;
          break;
        case "click":
          if (action.target.kind === "point") {
            await this.page.mouse.click(action.target.x, action.target.y);
          } else {
            await (await this.uniqueLocator(action.target)).click();
          }
          delivered = true;
          detail = "click delivered";
          break;
        case "type": {
          const locator = await this.uniqueLocator(action.target);
          const beforeValue = await readLocatorValue(locator).catch(() => undefined);
          if (action.clear === false) await locator.pressSequentially(action.text);
          else await locator.fill(action.text);
          const afterValue = await readLocatorValue(locator).catch(() => undefined);
          delivered = true;
          if (action.clear === false) {
            targetEffectObserved = action.text.length === 0 || (
              beforeValue !== undefined &&
              afterValue !== undefined &&
              !deepEqual(beforeValue, afterValue)
            );
          } else {
            targetEffectObserved = afterValue === action.text || (
              beforeValue !== undefined &&
              afterValue !== undefined &&
              !deepEqual(beforeValue, afterValue)
            );
          }
          detail = `typed ${action.text.length} characters`;
          break;
        }
        case "select": {
          const locator = await this.uniqueLocator(action.target);
          await locator.selectOption(action.value);
          const afterValue = await readLocatorValue(locator).catch(() => undefined);
          delivered = true;
          targetEffectObserved = afterValue === action.value;
          detail = `selected ${action.value}`;
          break;
        }
        case "read":
          await this.uniqueLocator(action.target);
          delivered = true;
          detail = "read target resolved";
          break;
        case "wait":
          await this.waitForCondition(action.condition, action.timeoutMs);
          delivered = true;
          detail = "wait condition passed";
          break;
        case "semantic":
          detail = `browser adapter does not implement semantic action ${action.name}`;
          break;
      }
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }

    const after = await this.observe();
    const effectObserved = delivered && (
      targetEffectObserved ?? (
        action.kind === "read" ||
        action.kind === "wait" ||
        fingerprint(before) !== fingerprint(after)
      )
    );
    const evidence = [before.screenshot, after.screenshot].filter(
      (item): item is EvidenceRef => item !== undefined,
    );

    return {
      requestedAt,
      completedAt: new Date().toISOString(),
      delivered,
      effectObserved,
      detail,
      before,
      after,
      evidence,
    };
  }

  async check(condition: Condition): Promise<CheckReceipt> {
    try {
      switch (condition.kind) {
        case "exists": {
          const count = await this.countMatches(condition.target);
          return receipt(condition, count > 0, count, `${count} matches`);
        }
        case "text_present": {
          const matched = await this.anyFrameTextIncludes(condition.text);
          return receipt(condition, matched, matched, matched ? "text present" : "text absent");
        }
        case "text_equals": {
          const locator = await this.uniqueLocator(condition.target);
          const text = (await locator.textContent())?.trim() ?? "";
          return receipt(condition, text === condition.value, text, `observed ${JSON.stringify(text)}`);
        }
        case "url_matches": {
          const current = this.page.url();
          const passed = new RegExp(condition.pattern).test(current);
          return receipt(condition, passed, current, `observed ${current}`);
        }
        case "state_equals": {
          const raw = await this.describePage();
          const observed = resolvePath(raw, condition.path);
          const passed = observed !== undefined && JSON.stringify(observed) === JSON.stringify(condition.value);
          return receipt(condition, passed, observed ?? null, `state path ${condition.path}`);
        }
        case "semantic":
          return receipt(condition, false, null, `unsupported browser semantic check ${condition.name}`);
      }
    } catch (error) {
      return receipt(condition, false, null, error instanceof Error ? error.message : String(error));
    }
  }

  async extract(rule: ExtractionRule): Promise<JsonValue> {
    if (rule.fromStatePath) {
      const raw = await this.describePage();
      const value = resolvePath(raw, rule.fromStatePath);
      if (value === undefined) throw new Error(`state path missing: ${rule.fromStatePath}`);
      return coerce(value, rule.as);
    }
    if (!rule.target) throw new Error(`extraction ${rule.output} has no target`);

    const locator = await this.uniqueLocator(rule.target);
    const value = await readLocatorValue(locator);
    return coerce(value, rule.as);
  }

  async captureEvidence(label: string): Promise<EvidenceRef> {
    this.evidenceSequence += 1;
    const stem = `${String(this.evidenceSequence).padStart(4, "0")}-${slug(label)}.png`;
    const path = resolve(this.options.artifactDir, stem);
    await this.page.screenshot({ path, fullPage: true });
    return {
      kind: "screenshot",
      uri: `file://${path}`,
      description: `${label} at ${this.page.url()}`,
    };
  }

  async pause(): Promise<void> {
    // A headed browser remains alive and becomes the same-session handoff surface.
  }

  async resume(): Promise<void> {
    await this.page.bringToFront();
  }

  async close(): Promise<void> {
    await this.browser.close();
  }

  pageHandle(): Page {
    return this.page;
  }

  private async waitForCondition(condition: Condition, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let last = "condition failed";
    while (Date.now() <= deadline) {
      const check = await this.check(condition);
      if (check.passed) return;
      last = check.detail ?? last;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
    throw new Error(`condition timed out after ${timeoutMs}ms: ${last}`);
  }

  private async uniqueLocator(target: Locator): Promise<PlaywrightLocator> {
    if (target.kind === "point" || target.kind === "semantic") {
      throw new Error(`target kind ${target.kind} does not resolve to a Playwright locator`);
    }

    const found: Array<{ locator: PlaywrightLocator; frame: Frame; count: number }> = [];
    for (const frame of this.page.frames()) {
      const locator = buildLocator(frame, target);
      const count = await locator.count();
      if (count > 0) found.push({ locator, frame, count });
    }

    const total = found.reduce((sum, item) => sum + item.count, 0);
    if (total !== 1 || found.length !== 1) {
      const locations = found.map((item) => `${item.frame.url()}=${item.count}`).join(", ");
      throw new Error(`target must resolve exactly once; observed ${total}${locations ? ` (${locations})` : ""}`);
    }
    return found[0]!.locator.first();
  }

  private async countMatches(target: Locator): Promise<number> {
    if (target.kind === "point") return 1;
    if (target.kind === "semantic") return 0;
    let count = 0;
    for (const frame of this.page.frames()) count += await buildLocator(frame, target).count();
    return count;
  }

  private async anyFrameTextIncludes(text: string): Promise<boolean> {
    for (const frame of this.page.frames()) {
      const body = frame.locator("body");
      if ((await body.count()) === 0) continue;
      const content = await body.innerText().catch(() => "");
      if (content.includes(text)) return true;
    }
    return false;
  }

  private async describePage(): Promise<JsonObject> {
    const frames: JsonValue[] = [];
    for (const frame of this.page.frames()) {
      const bodyText = await frame.locator("body").innerText().catch(() => "");
      const controls = await frame
        .locator("button,input,select,textarea,a[href],[role]")
        .evaluateAll((elements) =>
          elements.slice(0, 200).map((element) => {
            const html = element as HTMLElement;
            const input = element as HTMLInputElement;
            const style = window.getComputedStyle(html);
            const rect = html.getBoundingClientRect();
            const labels = "labels" in input && input.labels
              ? Array.from(input.labels).map((label) => label.textContent?.trim() ?? "").filter(Boolean)
              : [];
            return {
              tag: element.tagName.toLowerCase(),
              role: element.getAttribute("role") ?? "",
              name: element.getAttribute("name") ?? "",
              type: element.getAttribute("type") ?? "",
              ariaLabel: element.getAttribute("aria-label") ?? "",
              placeholder: element.getAttribute("placeholder") ?? "",
              labels,
              text: (html.innerText || element.textContent || "").trim().slice(0, 220),
              value: "value" in input ? String(input.value ?? "").slice(0, 220) : "",
              checked: "checked" in input ? Boolean(input.checked) : false,
              disabled: "disabled" in input ? Boolean(input.disabled) : false,
              visible: style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0,
            };
          }),
        )
        .catch(() => []);
      const dialogs = await frame.locator("dialog").evaluateAll((elements) =>
        elements.map((element) => ({
          open: element.hasAttribute("open"),
          text: (element.textContent ?? "").trim().slice(0, 1000),
        })),
      ).catch(() => []);

      frames.push({
        name: frame.name(),
        url: frame.url(),
        text: bodyText.slice(0, 7000),
        controls: controls as JsonValue,
        dialogs: dialogs as JsonValue,
      });
    }

    return {
      url: this.page.url(),
      title: await this.page.title(),
      frames,
    };
  }
}

function buildLocator(
  frame: Frame,
  target: Exclude<Locator, { kind: "point" } | { kind: "semantic" }>,
): PlaywrightLocator {
  switch (target.kind) {
    case "role": {
      const exact = target.exact === undefined ? {} : { exact: target.exact };
      return frame.getByRole(target.role as Parameters<Frame["getByRole"]>[0], {
        name: target.name,
        ...exact,
      });
    }
    case "label": {
      const exact = target.exact === undefined ? {} : { exact: target.exact };
      return frame.getByLabel(target.label, exact);
    }
    case "text": {
      const exact = target.exact === undefined ? {} : { exact: target.exact };
      return frame.getByText(target.text, exact);
    }
    case "selector":
      return frame.locator(target.selector);
  }
}

function receipt(
  condition: Condition,
  passed: boolean,
  observed: JsonValue,
  detail: string,
): CheckReceipt {
  return { condition, passed, observed, detail };
}

async function readLocatorValue(locator: PlaywrightLocator): Promise<JsonValue> {
  const tag = await locator.evaluate((element) => element.tagName.toLowerCase());
  if (["input", "textarea", "select"].includes(tag)) return locator.inputValue();
  return (await locator.textContent())?.trim() ?? "";
}

function coerce(value: JsonValue, type: ScalarType): JsonValue {
  if (value === null || typeof value === "object") throw new Error(`cannot coerce complex value to ${type}`);
  if (type === "string") return String(value);
  if (type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`cannot coerce ${String(value)} to number`);
    return parsed;
  }
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`cannot coerce ${String(value)} to boolean`);
}

function deepEqual(a: JsonValue, b: JsonValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function summarize(raw: JsonObject): string {
  const title = String(raw.title ?? "");
  const url = String(raw.url ?? "");
  const frames = Array.isArray(raw.frames) ? raw.frames : [];
  const rendered = frames.map((frame, index) => `FRAME ${index}: ${JSON.stringify(frame)}`).join("\n");
  return `TITLE: ${title}\nURL: ${url}\n${rendered}`.slice(0, 30000);
}

function fingerprint(observation: Observation): string {
  return JSON.stringify(observation.raw ?? observation.summary);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "evidence";
}
