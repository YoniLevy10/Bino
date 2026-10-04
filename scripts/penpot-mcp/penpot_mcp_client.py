#!/usr/bin/env python3
"""
Penpot remote MCP client (Streamable HTTP).

For agents that cannot see a `penpot` namespace in Cursor, or that get:
  "No Penpot instance connected for user token"

Requires:
  export PENPOT_MCP_STREAM_URL='https://design.penpot.app/mcp/stream?userToken=…'

See AGENT_CONNECT.md in this folder.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

DEFAULT_URL_ENV = "PENPOT_MCP_STREAM_URL"
DEFAULT_TOKEN_ENV = "PENPOT_MCP_USER_TOKEN"
DEFAULT_BASE = "https://design.penpot.app/mcp/stream"
STATE_DIR = Path(os.environ.get("PENPOT_MCP_STATE_DIR", "/tmp/penpot-mcp-state"))


class PenpotMcpError(RuntimeError):
    def __init__(self, message: str, exit_code: int = 4):
        super().__init__(message)
        self.exit_code = exit_code


def resolve_url(cli_url: str | None = None) -> str:
    if cli_url:
        return cli_url.strip()
    env_url = os.environ.get(DEFAULT_URL_ENV, "").strip()
    if env_url:
        return env_url
    token = os.environ.get(DEFAULT_TOKEN_ENV, "").strip()
    if token:
        return f"{DEFAULT_BASE}?userToken={token}"
    raise PenpotMcpError(
        f"Set {DEFAULT_URL_ENV} (full stream URL) or {DEFAULT_TOKEN_ENV}. "
        "Get it from Penpot → Integrations → MCP Server. Never commit the token.",
        exit_code=2,
    )


def _state_paths() -> tuple[Path, Path]:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    return STATE_DIR / "session", STATE_DIR / "url"


class PenpotMcpClient:
    def __init__(self, url: str, timeout: int = 120):
        self.url = url
        self.timeout = timeout
        self.session: str | None = None
        self._id = 0
        session_path, url_path = _state_paths()
        self._session_path = session_path
        self._url_path = url_path
        if session_path.exists():
            self.session = session_path.read_text().strip() or None
        url_path.write_text(url)

    def _persist_session(self) -> None:
        if self.session:
            self._session_path.write_text(self.session)

    def rpc(
        self,
        method: str,
        params: dict[str, Any] | None = None,
        *,
        notify: bool = False,
        timeout: int | None = None,
    ) -> Any:
        payload: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if not notify:
            self._id += 1
            payload["id"] = self._id
        if params is not None:
            payload["params"] = params

        hdr = tempfile.NamedTemporaryFile("w+", delete=False)
        bodyf = tempfile.NamedTemporaryFile("w+", delete=False)
        hdr.close()
        bodyf.close()
        try:
            cmd = [
                "curl",
                "-sS",
                "-D",
                hdr.name,
                "-o",
                bodyf.name,
                "-X",
                "POST",
                self.url,
                "-H",
                "Content-Type: application/json",
                "-H",
                "Accept: application/json, text/event-stream",
                "-H",
                "MCP-Protocol-Version: 2025-03-26",
                "-H",
                "User-Agent: Mozilla/5.0 PenpotMcpAgentClient/1.0",
                "--max-time",
                str(timeout or self.timeout),
                "--data-binary",
                json.dumps(payload),
            ]
            if self.session:
                cmd.extend(["-H", f"Mcp-Session-Id: {self.session}"])
            try:
                subprocess.check_call(cmd)
            except subprocess.CalledProcessError as e:
                raise PenpotMcpError(
                    f"curl failed for {method}: exit {e.returncode}",
                    exit_code=2,
                ) from e

            headers = Path(hdr.name).read_text(errors="replace")
            body = Path(bodyf.name).read_text(errors="replace")
        finally:
            for p in (hdr.name, bodyf.name):
                try:
                    os.unlink(p)
                except OSError:
                    pass

        for line in headers.splitlines():
            if line.lower().startswith("mcp-session-id:"):
                self.session = line.split(":", 1)[1].strip()
                self._persist_session()

        # HTTP status from curl -D first line
        status_line = headers.splitlines()[0] if headers else ""
        if " 401 " in f" {status_line} " or status_line.endswith("401"):
            raise PenpotMcpError(
                "HTTP 401 — token invalid/expired. Regenerate MCP key in Penpot Integrations.",
                exit_code=2,
            )
        if " 403 " in f" {status_line} " or status_line.endswith("403"):
            raise PenpotMcpError(
                "HTTP 403 — blocked or forbidden. Retry with browser-like UA (already set) "
                "or check egress allowlist for design.penpot.app.",
                exit_code=2,
            )

        if not body.strip():
            return None

        if "data: " in body:
            msgs: list[Any] = []
            for block in body.split("\n\n"):
                for line in block.split("\n"):
                    if line.startswith("data: "):
                        msgs.append(json.loads(line[6:]))
            return msgs[-1] if msgs else None

        try:
            return json.loads(body)
        except json.JSONDecodeError as e:
            raise PenpotMcpError(
                f"Invalid JSON from Penpot MCP: {body[:300]}",
                exit_code=2,
            ) from e

    def initialize(self) -> dict[str, Any]:
        # Fresh session for a clean handshake
        self.session = None
        if self._session_path.exists():
            self._session_path.unlink()
        result = self.rpc(
            "initialize",
            {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "penpot-mcp-agent-client", "version": "1.0.0"},
            },
        )
        self.rpc("notifications/initialized", {}, notify=True)
        if not isinstance(result, dict) or "result" not in result:
            raise PenpotMcpError(
                f"initialize failed: {json.dumps(result, ensure_ascii=False)[:500]}",
                exit_code=2,
            )
        return result

    def call_tool(self, name: str, arguments: dict[str, Any] | None = None, timeout: int | None = None) -> Any:
        return self.rpc(
            "tools/call",
            {"name": name, "arguments": arguments or {}},
            timeout=timeout,
        )

    def tools_list(self) -> Any:
        return self.rpc("tools/list", {})

    @staticmethod
    def unwrap_text(response: Any) -> str:
        try:
            return response["result"]["content"][0]["text"]
        except (TypeError, KeyError, IndexError):
            return json.dumps(response, ensure_ascii=False)

    def probe(self) -> dict[str, Any]:
        resp = self.call_tool(
            "execute_code",
            {
                "code": (
                    "return {"
                    " ok: true,"
                    " page: penpot.currentPage?.name || null,"
                    " pageId: penpot.currentPage?.id || null,"
                    " file: penpot.currentFile?.name || null,"
                    " fileId: penpot.currentFile?.id || null,"
                    " boards: (penpot.currentPage?.findShapes({ type: 'board' }) || [])"
                    ".filter(b => b.name !== 'Root Frame')"
                    ".map(b => ({ name: b.name, id: b.id }))"
                    "};"
                )
            },
        )
        text = self.unwrap_text(resp)
        if "No Penpot instance connected" in text:
            raise PenpotMcpError(
                "Layer A OK, Layer B missing: open the design file → "
                "File → MCP Server → Connect, keep the tab awake, then retry probe.",
                exit_code=3,
            )
        if text.startswith("Tool execution failed") or text.startswith("Error"):
            raise PenpotMcpError(text, exit_code=4)
        # execute_code wraps return value as JSON text often under result.result
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict) and "result" in parsed:
                return parsed["result"]
            return parsed
        except json.JSONDecodeError:
            return {"raw": text}


def cmd_init(client: PenpotMcpClient) -> int:
    result = client.initialize()
    tools = client.tools_list()
    names = []
    try:
        names = [t["name"] for t in tools["result"]["tools"]]
    except (TypeError, KeyError):
        pass
    print(
        json.dumps(
            {
                "ok": True,
                "layer": "A",
                "session": client.session,
                "server": result.get("result", {}).get("serverInfo"),
                "tools": names,
                "next": "Open Penpot file → File → MCP Server → Connect → run: probe",
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def cmd_probe(client: PenpotMcpClient) -> int:
    client.initialize()
    info = client.probe()
    print(json.dumps({"ok": True, "layer": "A+B", **info}, ensure_ascii=False, indent=2))
    return 0


def cmd_wait(client: PenpotMcpClient, timeout: int, interval: float) -> int:
    deadline = time.time() + timeout
    last_err = "not started"
    while time.time() < deadline:
        try:
            client.initialize()
            info = client.probe()
            print(json.dumps({"ok": True, "layer": "A+B", **info}, ensure_ascii=False, indent=2))
            return 0
        except PenpotMcpError as e:
            last_err = str(e)
            if e.exit_code == 2:
                raise
            print(f"[wait] {e}", file=sys.stderr)
            time.sleep(interval)
    raise PenpotMcpError(f"Timed out after {timeout}s. Last: {last_err}", exit_code=3)


def cmd_exec(client: PenpotMcpClient, code: str) -> int:
    client.initialize()
    # Ensure Layer B before expensive work
    client.probe()
    resp = client.call_tool("execute_code", {"code": code}, timeout=max(client.timeout, 180))
    text = client.unwrap_text(resp)
    if "No Penpot instance connected" in text:
        raise PenpotMcpError(text, exit_code=3)
    print(text)
    return 0


def cmd_overview(client: PenpotMcpClient) -> int:
    client.initialize()
    resp = client.call_tool("high_level_overview", {})
    print(client.unwrap_text(resp))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Penpot remote MCP connect/probe helper for agents",
    )
    parser.add_argument("--url", help=f"Full stream URL (else ${DEFAULT_URL_ENV})")
    parser.add_argument("--timeout", type=int, default=120, help="Per-request timeout seconds")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init", help="Layer A: initialize session + list tools")
    sub.add_parser("probe", help="Layer A+B: require File→Connect, print page/file")
    wait_p = sub.add_parser("wait", help="Poll until File→Connect succeeds")
    wait_p.add_argument("--timeout", type=int, default=120, dest="wait_timeout")
    wait_p.add_argument("--interval", type=float, default=5.0)
    exec_p = sub.add_parser("exec", help="execute_code after successful probe")
    exec_p.add_argument("--code", required=True, help="JavaScript body for Penpot plugin")
    sub.add_parser("overview", help="Call high_level_overview")

    args = parser.parse_args(argv)
    try:
        url = resolve_url(args.url)
        client = PenpotMcpClient(url, timeout=args.timeout)
        if args.cmd == "init":
            return cmd_init(client)
        if args.cmd == "probe":
            return cmd_probe(client)
        if args.cmd == "wait":
            return cmd_wait(client, args.wait_timeout, args.interval)
        if args.cmd == "exec":
            return cmd_exec(client, args.code)
        if args.cmd == "overview":
            return cmd_overview(client)
        parser.error(f"unknown command {args.cmd}")
        return 2
    except PenpotMcpError as e:
        print(
            json.dumps({"ok": False, "error": str(e), "exit_code": e.exit_code}, ensure_ascii=False, indent=2),
            file=sys.stderr,
        )
        return e.exit_code


if __name__ == "__main__":
    sys.exit(main())
