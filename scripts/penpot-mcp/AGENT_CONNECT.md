# Penpot MCP — playbook for Cloud / IDE agents that cannot connect

Copy this folder into any repo. Use when an agent reports that Penpot is “Connected” in Cursor but design tools fail.

## Mental model (two layers)

Penpot remote MCP is **not** one checkbox.

| Layer | What it means | If missing |
| --- | --- | --- |
| **A. MCP client → Penpot hosted server** | HTTP Streamable URL with `userToken` (Integrations → MCP Server) | `initialize` fails / 401 / 403 |
| **B. Browser file → same user token** | Open a design file → **File → MCP Server → Connect** and keep that tab awake | `No Penpot instance connected for user token` |

Cursor **Customize → MCPs → penpot Connected** only proves Layer A for that client. It does **not** prove Layer B.

Cloud Agents often **do not** receive User MCPs from Customize. They need the HTTP server enabled under [cursor.com/agents](https://cursor.com/agents) MCP dropdown (or Team Plugins & MCPs). An **already-running** Cloud Agent usually will **not** hot-reload a newly added MCP — start a **new** agent after enabling.

## Get the URL

1. https://design.penpot.app → account → **Integrations → MCP Server**
2. Status = Enabled
3. Copy the stream URL (includes `userToken=…`)
4. Treat the token like a password. Never commit it. Prefer env `PENPOT_MCP_STREAM_URL`.

Official docs: https://help.penpot.app/mcp/

## Quick diagnosis with this script

```bash
export PENPOT_MCP_STREAM_URL='https://design.penpot.app/mcp/stream?userToken=YOUR_KEY'

# Layer A only
python3 scripts/penpot-mcp/penpot_mcp_client.py init

# Layer A + B (needs File → Connect)
python3 scripts/penpot-mcp/penpot_mcp_client.py probe

# Poll until the browser plugin connects
python3 scripts/penpot-mcp/penpot_mcp_client.py wait --timeout 120

# Run Plugin API JS (after probe succeeds)
python3 scripts/penpot-mcp/penpot_mcp_client.py exec --code 'return { page: penpot.currentPage?.name, file: penpot.currentFile?.name };'
```

Exit codes:

- `0` — success
- `2` — Layer A failed (bad/expired token, network, parse error)
- `3` — Layer A OK, Layer B missing (`No Penpot instance connected…`)
- `4` — tool/runtime error after connect

## Common failures

### 1. `No Penpot instance connected for user token`

**Cause:** Layer B missing, or tab slept / unloaded.

**Fix:**

1. Open the target **design file** (not only the projects list).
2. **File → MCP Server → Connect** until UI says Connected.
3. Keep that tab focused; Chrome → Settings → Performance → Always keep these sites active → add `design.penpot.app`.
4. Same Penpot account as the `userToken`.
5. If the key was regenerated, update `PENPOT_MCP_STREAM_URL` immediately.

### 2. Cursor UI shows penpot Connected, Cloud Agent catalog has no `penpot` namespace

**Cause:** Customize MCP ≠ Cloud Agent MCP injection.

**Fix:**

1. Add HTTP MCP named `penpot` with the stream URL in **Cloud Agents** MCP settings.
2. Start a **new** Cloud Agent.
3. Or bypass Cursor MCP injection and call the stream URL with `penpot_mcp_client.py` (same as this playbook).

### 3. Local / stdio `@penpot/mcp` vs remote URL

| Mode | URL | Extra requirement |
| --- | --- | --- |
| Remote (recommended for Cloud Agents) | `https://design.penpot.app/mcp/stream?userToken=…` | File → MCP Server → Connect |
| Local | `http://localhost:4401/mcp` | `npx @penpot/mcp` + plugin Load from URL + Connect |

Cloud Agent VMs **cannot** reach the user’s `localhost`. Use **remote** mode for cloud.

SSE / `mcp-remote` are not supported as Cloud Agent custom MCP transports — use **HTTP streamable** URL.

### 4. Token pasted in chat

Regenerate the MCP key in Penpot Integrations after the session. Update all clients.

### 5. Long `execute_code` then sudden disconnect

Browser froze the Penpot tab. Re-Connect, keep tab awake, split work into shorter `exec` calls, re-install any `storage.*` helpers after reconnect (`storage` is per plugin session).

## Minimal agent checklist

```
[ ] PENPOT_MCP_STREAM_URL set (not committed)
[ ] python3 …/penpot_mcp_client.py init   → session id printed
[ ] User opened design file + File → MCP Server → Connect
[ ] python3 …/penpot_mcp_client.py probe  → page + file names
[ ] Only then call execute_code / build screens
```

## Tools exposed by remote Penpot MCP

- `high_level_overview` — read once per session before coding
- `penpot_api_info` — API docs for types/members
- `execute_code` — JS in plugin context (`penpot`, `penpotUtils`, `storage`)
- `export_shape` — PNG/SVG preview (`shapeId`: id, `selection`, or `page`)

`import_image` from local paths is **not** available on remote MCP.
