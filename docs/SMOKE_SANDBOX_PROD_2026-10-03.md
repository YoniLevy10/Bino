# Sandbox smoke — deployed prod (2026-10-03)

**Deployment:** `https://bino.casa` · git `edd27bb` · Vercel `dpl_68zCkLfqbhF8z4PGck5TG2GvUHx9`

## PRs / commits on prod tip

| PR | Commit | Title |
|----|--------|-------|
| #235 | `edd27bb` | Grow webhook Approve/sum/wallet guards |
| #236 | `aa0c5e1` | source×client public report rate limits |
| #233 | `557479d` | viewer write-access gates |
| #232 | `c550e43` | collections false-success toasts |
| #231 | `0322821` | Next 16.3.8 |
| #234 | `064a5b7` | remediation docs + apply package |

## Flow (BINO Sandbox only)

| Step | Result | Evidence |
|------|--------|----------|
| Login | Manager session on `/dashboard` | Playwright: `bino-wa-manager@bino.casa` |
| Create worker | **200** | worker `44a35a15-…` |
| Create ticket | **200** ticket **#5** `ca27afcc-…` | create-ticket multipart |
| Assign | **200** status `ASSIGNED` | assign-ticket |
| Update | **200** status `IN_PROGRESS` | update-ticket |
| Close | **200** status `CLOSED` | update-ticket |
| File | **200** ticket **#6** + Storage object in `ticket-attachments` | JPEG create-ticket (txt rejected by mime allow-list — expected) |

No customer tenants modified beyond Sandbox lab data.
