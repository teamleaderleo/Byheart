import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import {
  RemoteDesktopSurface,
  type RemoteFrame,
  type RemoteInput,
  type RemoteSession,
  type RemoteTransport,
} from "../src/adapters/remote.js";

class FakeRemoteTransport implements RemoteTransport {
  readonly inputs: RemoteInput[] = [];
  currentSession = "remote-1";
  private frameVersion = 1;

  async session(): Promise<RemoteSession> {
    return {
      format: "byheart-remote-session/v1",
      sessionId: this.currentSession,
      platform: "windows",
      width: 800,
      height: 600,
      scale: 1,
    };
  }

  async frame(): Promise<RemoteFrame> {
    const png = new TextEncoder().encode(`fake-png-${this.frameVersion}`);
    return {
      png,
      width: 800,
      height: 600,
      capturedAt: "2026-09-09T00:00:00.000Z",
      sha256: createHash("sha256").update(png).digest("hex"),
    };
  }

  async input(action: RemoteInput): Promise<{ delivered: boolean; detail?: string }> {
    this.inputs.push(action);
    this.frameVersion += 1;
    return { delivered: true, detail: action.kind };
  }
}

test("remote desktop surface records point actions against an exact session", async () => {
  const transport = new FakeRemoteTransport();
  const artifactDir = await mkdtemp(join(tmpdir(), "byheart-remote-"));
  const surface = new RemoteDesktopSurface({
    endpoint: "remote://windows-vm",
    transport,
    artifactDir,
    sessionId: "remote-1",
  });

  const identity = await surface.identity();
  assert.equal(identity.adapter, "remote-desktop");
  assert.equal(identity.sessionId, "remote-1");

  const receipt = await surface.act({
    kind: "click",
    target: { kind: "point", x: 250, y: 175, coordinateSpace: "surface" },
  });
  assert.equal(receipt.delivered, true, receipt.detail);
  assert.equal(receipt.effectObserved, true, receipt.detail);
  assert.deepEqual(transport.inputs[0], { kind: "click", x: 250, y: 175 });
});

test("remote desktop rejects points outside the declared display", async () => {
  const transport = new FakeRemoteTransport();
  const surface = new RemoteDesktopSurface({
    endpoint: "remote://windows-vm",
    transport,
  });
  const check = await surface.check({
    kind: "exists",
    target: { kind: "point", x: 900, y: 175, coordinateSpace: "surface" },
  });
  assert.equal(check.passed, false);
});

test("remote desktop fails closed if the guest session changes", async () => {
  const transport = new FakeRemoteTransport();
  const surface = new RemoteDesktopSurface({
    endpoint: "remote://windows-vm",
    transport,
  });
  await surface.identity();
  transport.currentSession = "remote-2";
  await assert.rejects(() => surface.identity(), /remote session changed/);
});

test("remote semantic hotkeys pass through the closed input catalog", async () => {
  const transport = new FakeRemoteTransport();
  const surface = new RemoteDesktopSurface({
    endpoint: "remote://windows-vm",
    transport,
  });
  const receipt = await surface.act({
    kind: "semantic",
    name: "remote.hotkey",
    args: { keys: ["ctrl", "l"] },
  });
  assert.equal(receipt.delivered, true, receipt.detail);
  assert.deepEqual(transport.inputs[0], { kind: "hotkey", keys: ["ctrl", "l"] });
});
