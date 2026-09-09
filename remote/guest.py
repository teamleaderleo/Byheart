#!/usr/bin/env python3
"""Small closed remote-desktop endpoint for Byheart.

It exposes screenshots plus bounded pointer/keyboard actions. It deliberately exposes no shell,
filesystem, process, or arbitrary code execution endpoint.
"""

from __future__ import annotations

import hmac
import json
import math
import os
import platform
import threading
import time
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from mss import mss, tools as mss_tools
from pynput.keyboard import Controller as KeyboardController, Key
from pynput.mouse import Button, Controller as MouseController

FORMAT = "byheart-remote-session/v1"
MAX_BODY = 64 * 1024
SESSION_ID = str(uuid.uuid4())
LOCK = threading.RLock()
MOUSE = MouseController()
KEYBOARD = KeyboardController()
TOKEN = os.environ.get("BYHEART_REMOTE_TOKEN", "")
MONITOR_INDEX = int(os.environ.get("BYHEART_REMOTE_MONITOR", "1"))

BUTTONS = {
    "left": Button.left,
    "right": Button.right,
    "middle": Button.middle,
}

KEYS = {
    "alt": Key.alt,
    "backspace": Key.backspace,
    "cmd": Key.cmd,
    "ctrl": Key.ctrl,
    "delete": Key.delete,
    "down": Key.down,
    "end": Key.end,
    "enter": Key.enter,
    "esc": Key.esc,
    "escape": Key.esc,
    "home": Key.home,
    "left": Key.left,
    "page_down": Key.page_down,
    "page_up": Key.page_up,
    "right": Key.right,
    "shift": Key.shift,
    "space": Key.space,
    "tab": Key.tab,
    "up": Key.up,
}
for number in range(1, 13):
    KEYS[f"f{number}"] = getattr(Key, f"f{number}")


def monitor() -> dict[str, int]:
    with mss() as capture:
        monitors = capture.monitors
        if MONITOR_INDEX < 1 or MONITOR_INDEX >= len(monitors):
            raise RuntimeError(
                f"BYHEART_REMOTE_MONITOR={MONITOR_INDEX} is unavailable; "
                f"select 1..{len(monitors) - 1}"
            )
        selected = monitors[MONITOR_INDEX]
        return {
            "left": int(selected["left"]),
            "top": int(selected["top"]),
            "width": int(selected["width"]),
            "height": int(selected["height"]),
        }


def capture_png() -> tuple[bytes, dict[str, int]]:
    selected = monitor()
    with mss() as capture:
        shot = capture.grab(selected)
        png = mss_tools.to_png(shot.rgb, shot.size)
    return png, selected


def point(payload: dict[str, Any], selected: dict[str, int], x_name: str = "x", y_name: str = "y") -> tuple[int, int]:
    x = payload.get(x_name)
    y = payload.get(y_name)
    if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        raise ValueError(f"{x_name}/{y_name} must be numbers")
    if not math.isfinite(x) or not math.isfinite(y):
        raise ValueError(f"{x_name}/{y_name} must be finite")
    if x < 0 or y < 0 or x >= selected["width"] or y >= selected["height"]:
        raise ValueError(
            f"point {x},{y} is outside {selected['width']}x{selected['height']}"
        )
    return selected["left"] + round(x), selected["top"] + round(y)


def key_value(name: Any):
    if not isinstance(name, str) or not name:
        raise ValueError("key must be a non-empty string")
    lower = name.lower()
    if lower in KEYS:
        return KEYS[lower]
    if len(name) == 1:
        return name
    raise ValueError(f"unsupported key: {name}")


def execute(payload: dict[str, Any]) -> str:
    kind = payload.get("kind")
    selected = monitor()

    if kind == "move":
        x, y = point(payload, selected)
        MOUSE.position = (x, y)
        return "pointer moved"

    if kind == "click":
        x, y = point(payload, selected)
        button_name = payload.get("button", "left")
        button = BUTTONS.get(button_name)
        if button is None:
            raise ValueError(f"unsupported mouse button: {button_name}")
        count = payload.get("count", 1)
        if not isinstance(count, int) or count < 1 or count > 3:
            raise ValueError("click count must be 1..3")
        MOUSE.position = (x, y)
        MOUSE.click(button, count)
        return f"{button_name} click x{count}"

    if kind == "drag":
        start_x, start_y = point(payload, selected, "fromX", "fromY")
        end_x, end_y = point(payload, selected, "toX", "toY")
        button_name = payload.get("button", "left")
        button = BUTTONS.get(button_name)
        if button is None:
            raise ValueError(f"unsupported mouse button: {button_name}")
        duration_ms = payload.get("durationMs", 250)
        if not isinstance(duration_ms, (int, float)) or duration_ms < 0 or duration_ms > 5000:
            raise ValueError("durationMs must be 0..5000")
        steps = max(1, min(120, round(duration_ms / 12)))
        MOUSE.position = (start_x, start_y)
        MOUSE.press(button)
        try:
            for index in range(1, steps + 1):
                fraction = index / steps
                MOUSE.position = (
                    round(start_x + (end_x - start_x) * fraction),
                    round(start_y + (end_y - start_y) * fraction),
                )
                if duration_ms:
                    time.sleep(duration_ms / steps / 1000.0)
        finally:
            MOUSE.release(button)
        return f"{button_name} drag completed"

    if kind == "text":
        text = payload.get("text")
        if not isinstance(text, str):
            raise ValueError("text must be a string")
        if len(text) > 16_384:
            raise ValueError("text is too long")
        if payload.get("replace", False):
            modifier = Key.cmd if platform.system() == "Darwin" else Key.ctrl
            with KEYBOARD.pressed(modifier):
                KEYBOARD.press("a")
                KEYBOARD.release("a")
        KEYBOARD.type(text)
        return f"typed {len(text)} characters"

    if kind == "key":
        key = key_value(payload.get("key"))
        KEYBOARD.press(key)
        KEYBOARD.release(key)
        return "key delivered"

    if kind == "hotkey":
        names = payload.get("keys")
        if not isinstance(names, list) or not 1 <= len(names) <= 8:
            raise ValueError("keys must be a list of 1..8 key names")
        keys = [key_value(name) for name in names]
        for key in keys:
            KEYBOARD.press(key)
        for key in reversed(keys):
            KEYBOARD.release(key)
        return "hotkey delivered"

    raise ValueError(f"unsupported input kind: {kind}")


class Handler(BaseHTTPRequestHandler):
    server_version = "ByheartRemote/1"

    def do_GET(self) -> None:
        if not self.authorized():
            return
        if self.path == "/v1/session":
            selected = monitor()
            self.json_response(
                HTTPStatus.OK,
                {
                    "format": FORMAT,
                    "sessionId": SESSION_ID,
                    "platform": platform.system().lower(),
                    "width": selected["width"],
                    "height": selected["height"],
                    "scale": 1,
                    "metadata": {
                        "monitor": MONITOR_INDEX,
                        "host": platform.node(),
                    },
                },
            )
            return
        if self.path == "/v1/frame":
            with LOCK:
                png, selected = capture_png()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(png)))
            self.send_header("X-Byheart-Width", str(selected["width"]))
            self.send_header("X-Byheart-Height", str(selected["height"]))
            self.send_header("X-Byheart-Captured-At", utc_now())
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(png)
            return
        self.json_response(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_POST(self) -> None:
        if not self.authorized():
            return
        if self.path != "/v1/input":
            self.json_response(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return
        try:
            payload = self.read_json()
            with LOCK:
                detail = execute(payload)
            self.json_response(HTTPStatus.OK, {"delivered": True, "detail": detail})
        except ValueError as error:
            self.json_response(HTTPStatus.BAD_REQUEST, {"delivered": False, "error": str(error)})
        except Exception as error:  # noqa: BLE001 - turn platform input failures into bounded receipts.
            self.json_response(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"delivered": False, "error": f"{type(error).__name__}: {error}"},
            )

    def authorized(self) -> bool:
        if not TOKEN:
            return True
        expected = f"Bearer {TOKEN}"
        observed = self.headers.get("Authorization", "")
        if hmac.compare_digest(expected, observed):
            return True
        self.json_response(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
        return False

    def read_json(self) -> dict[str, Any]:
        raw_length = self.headers.get("Content-Length")
        if raw_length is None:
            raise ValueError("Content-Length is required")
        length = int(raw_length)
        if length <= 0 or length > MAX_BODY:
            raise ValueError("request body size is invalid")
        value = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("request body must be an object")
        return value

    def json_response(self, status: HTTPStatus, value: dict[str, Any]) -> None:
        body = (json.dumps(value, separators=(",", ":")) + "\n").encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")


def utc_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> None:
    host = os.environ.get("BYHEART_REMOTE_HOST", "127.0.0.1")
    port = int(os.environ.get("BYHEART_REMOTE_PORT", "43127"))
    if host not in {"127.0.0.1", "::1", "localhost"} and not TOKEN:
        raise SystemExit("BYHEART_REMOTE_TOKEN is required when binding beyond loopback")
    selected = monitor()
    print(
        f"Byheart remote guest session {SESSION_ID} on {host}:{port}; "
        f"monitor {MONITOR_INDEX} {selected['width']}x{selected['height']}"
    )
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
