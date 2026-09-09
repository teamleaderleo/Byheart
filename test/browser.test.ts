import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlaywrightSurface } from "../src/adapters/playwright.js";

const html = `<!doctype html><html><body>
  <h1>Outer console</h1>
  <iframe title="Workspace" srcdoc="<!doctype html><html><body><label>Market code <input name='market'></label><button onclick=\"document.body.insertAdjacentHTML('beforeend','<p>ORDER STAGED</p>')\">Stage order</button></body></html>"></iframe>
</body></html>`;

const entrypoint = `data:text/html,${encodeURIComponent(html)}`;

test("Playwright adapter resolves semantic targets across frames", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "byheart-browser-"));
  const surface = await PlaywrightSurface.launch({ entrypoint, artifactDir, headless: true });
  try {
    const typed = await surface.act({
      kind: "type",
      target: { kind: "label", label: "Market code" },
      text: "ASH-17",
    });
    assert.equal(typed.delivered, true);
    assert.equal(typed.effectObserved, true);

    const extracted = await surface.extract({
      output: "market",
      target: { kind: "label", label: "Market code" },
      as: "string",
    });
    assert.equal(extracted, "ASH-17");

    const clicked = await surface.act({
      kind: "click",
      target: { kind: "role", role: "button", name: "Stage order" },
    });
    assert.equal(clicked.delivered, true);

    const done = await surface.check({ kind: "text_present", text: "ORDER STAGED" });
    assert.equal(done.passed, true);
  } finally {
    await surface.close();
  }
});
