#!/usr/bin/env node
/**
 * Operator script: list / create Meta WhatsApp UTILITY templates via Composio.
 *
 * Env (required for live calls):
 *   COMPOSIO_API_KEY
 *   COMPOSIO_WHATSAPP_CONNECTED_ACCOUNT_ID  (e.g. whatsapp_lookum-behead)
 * Optional:
 *   COMPOSIO_USER_ID=bino-platform
 *
 * Usage:
 *   node scripts/composio-sync-meta-templates.mjs list
 *   node scripts/composio-sync-meta-templates.mjs create ticket_closed
 *   node scripts/composio-sync-meta-templates.mjs create ticket_closed --suffix=bamakor
 *
 * Service templates only — never MARKETING / cold outreach.
 */

const COMPOSIO_EXECUTE_BASE = 'https://backend.composio.dev/api/v3.1/tools/execute'

const SPECS = {
  ticket_closed: {
    name: 'ticket_closed',
    body:
      'שלום, התקלה שדיווחתם בבניין {{1}} טופלה ונסגרה.\n\n' +
      'אם יש בעיה נוספת, ניתן לפנות אלינו בכל עת.',
    samples: ['מקור חיים 40ב'],
  },
  sla_escalation_resident: {
    name: 'sla_escalation_resident',
    body:
      'שלום, הפנייה שלך #{{1}} בנושא "{{2}}" עדיין בטיפול.\n\n' +
      'אנחנו מטפלים בה. תודה על הסבלנות.',
    samples: ['123', 'תקלה במעלית'],
  },
  manager_reply: {
    name: 'manager_reply',
    body: 'שלום {{1}},\n\n{{2}}',
    samples: ['יוני', 'הטכנאי יגיע מחר בין 9:00 ל-11:00'],
  },
  worker_assignment_notice: {
    name: 'worker_assignment_notice',
    body: 'תקלה חדשה ב{{1}}\nמספר: #{{2}}\n{{3}}',
    samples: ['מקור חיים 40ב', '456', 'דליפה במקלחת'],
  },
}

function requireEnv() {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim()
  const accountId =
    process.env.COMPOSIO_WHATSAPP_CONNECTED_ACCOUNT_ID?.trim() ||
    process.env.COMPOSIO_WHATSAPP_ACCOUNT_ID?.trim()
  if (!apiKey || !accountId) {
    console.error('יש לחבר Composio / Meta')
    console.error('Set COMPOSIO_API_KEY and COMPOSIO_WHATSAPP_CONNECTED_ACCOUNT_ID')
    process.exit(1)
  }
  return {
    apiKey,
    accountId,
    userId: process.env.COMPOSIO_USER_ID?.trim() || 'bino-platform',
  }
}

async function executeTool(env, toolSlug, args) {
  const res = await fetch(`${COMPOSIO_EXECUTE_BASE}/${encodeURIComponent(toolSlug)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.apiKey,
    },
    body: JSON.stringify({
      user_id: env.userId,
      version: 'latest',
      connected_account_id: env.accountId,
      arguments: args,
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = json?.error || json?.message || `HTTP ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return json
}

function sanitizeSuffix(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

async function listTemplates(env) {
  const json = await executeTool(env, 'WHATSAPP_GET_MESSAGE_TEMPLATES', {
    limit: 50,
    fields: 'name,status,category,language,id',
    category: 'UTILITY',
  })
  const data = json?.data?.data || json?.data || []
  const rows = Array.isArray(data) ? data : []
  console.log(`Connected account: ${env.accountId}`)
  console.log(`UTILITY templates: ${rows.length}`)
  for (const t of rows) {
    console.log(`- ${t.name}\t${t.status}\t${t.language}\t${t.id || ''}`)
  }
}

async function createTemplate(env, specKey, suffix) {
  const spec = SPECS[specKey]
  if (!spec) {
    console.error(`Unknown spec. Choose one of: ${Object.keys(SPECS).join(', ')}`)
    process.exit(1)
  }
  const name = suffix ? `${spec.name}_${suffix}` : spec.name
  const json = await executeTool(env, 'WHATSAPP_CREATE_MESSAGE_TEMPLATE', {
    name,
    category: 'UTILITY',
    language: 'he',
    allow_category_change: true,
    components: [
      {
        type: 'BODY',
        text: spec.body,
        example: { body_text: [spec.samples] },
      },
    ],
  })
  console.log(`Submitted: ${name}`)
  console.log(JSON.stringify(json?.data ?? json, null, 2))
  console.log('Meta review is usually PENDING first — approval can take minutes to days.')
}

async function main() {
  const [, , cmd, arg, ...rest] = process.argv
  if (!cmd || !['list', 'create'].includes(cmd)) {
    console.log(`Usage:
  node scripts/composio-sync-meta-templates.mjs list
  node scripts/composio-sync-meta-templates.mjs create <spec> [--suffix=client]
Specs: ${Object.keys(SPECS).join(', ')}`)
    process.exit(cmd ? 1 : 0)
  }

  const env = requireEnv()
  if (cmd === 'list') {
    await listTemplates(env)
    return
  }

  const suffixArg = rest.find((a) => a.startsWith('--suffix='))
  const suffix = sanitizeSuffix(suffixArg ? suffixArg.slice('--suffix='.length) : '')
  await createTemplate(env, arg, suffix || null)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
