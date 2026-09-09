# Remote desktop surface

This is the lowest-common-denominator Byheart surface: screenshots in, bounded pointer/keyboard actions out.

The guest helper exposes **no shell, process, filesystem, or arbitrary code execution endpoint**. It serves one monitor and a closed input catalog.

## Guest

On the Linux/Windows/macOS desktop to control:

```bash
python -m venv .venv
# activate the environment
pip install -r remote/requirements.txt
python remote/guest.py
```

Defaults:

- bind `127.0.0.1:43127`;
- monitor 1;
- one process-lifetime session id;
- loopback-only operation can run without a bearer token.

Useful environment variables:

```text
BYHEART_REMOTE_HOST
BYHEART_REMOTE_PORT
BYHEART_REMOTE_MONITOR
BYHEART_REMOTE_TOKEN
```

Binding beyond loopback requires `BYHEART_REMOTE_TOKEN`. Prefer a private tunnel/network path and keep the endpoint off the public internet.

The protocol is tiny:

```text
GET  /v1/session  exact session/platform/display identity
GET  /v1/frame    PNG screenshot + dimensions
POST /v1/input    move/click/drag/text/key/hotkey
```

## Byheart side

```ts
const transport = new HttpRemoteTransport({
  endpoint: "http://127.0.0.1:43127",
  token: process.env.BYHEART_REMOTE_TOKEN,
});

const surface = new RemoteDesktopSurface({
  endpoint: "remote://windows-vm",
  transport,
  artifactDir: "runtime/windows-vm",
});
```

Discovery sees the screenshot and can choose screenshot-coordinate point targets. Replay uses the saved coordinates against the same declared coordinate space. The surface verifies exact session identity, display dimensions, bounded coordinates, action delivery, and before/after frame hashes.

This adapter is intentionally useful before accessibility or app-specific integrations exist. A stronger guest-side adapter can later add semantic state/actions while keeping the screenshot path as evidence and fallback.

## VM / Moonlight use

Two routes are viable:

1. run the helper inside the guest and connect Byheart to it directly;
2. point a host-native surface at the Moonlight/RDP client window and treat that window as the surface.

The first route gives exact guest pixels and avoids host-window coordinate offsets. The second route requires no guest install and remains useful for locked-down machines.
