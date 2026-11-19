/**
 * Staging smoke (read-only).
 *
 * Usage:
 *   npm run test:staging-smoke
 *   STAGING_SMOKE_BASE=https://staging.bino.casa npm run test:staging-smoke
 */

const base = (process.env.STAGING_SMOKE_BASE || 'https://staging.bino.casa').replace(/\/$/, '')

async function check(name, url, expect) {
  const res = await fetch(url, { redirect: 'manual' })
  const status = res.status
  const location = res.headers.get('location') || ''
  let ok = true
  let detail = `status=${status}`
  if (expect.status != null && status !== expect.status) {
    ok = false
    detail += ` (expected ${expect.status})`
  }
  if (expect.not5xx && status >= 500) {
    ok = false
    detail += ' (unexpected 5xx)'
  }
  if (expect.locationIncludes && !location.includes(expect.locationIncludes)) {
    ok = false
    detail += ` location=${location}`
  }
  // Password / SSO protection may return 401 before the app
  if (expect.allowAuthGate && (status === 401 || status === 403)) {
    ok = true
    detail += ' (deployment protection — expected)'
  }
  // Before first staging-branch deploy, the custom domain may 404
  if (expect.allowPendingDeploy && status === 404) {
    ok = true
    detail += ' (pending first staging deploy)'
  }
  return { ok, line: `${ok ? 'OK' : 'FAIL'} ${name}: ${detail}` }
}

const checks = []
checks.push(
  await check('staging login', `${base}/login`, {
    status: 200,
    allowAuthGate: true,
    allowPendingDeploy: true,
  })
)
checks.push(
  await check('staging home', `${base}/`, {
    not5xx: true,
    allowAuthGate: true,
    allowPendingDeploy: true,
  })
)
checks.push(
  await check('prod login unchanged', 'https://bino.casa/login', { status: 200 })
)
checks.push(
  await check('bamakor alias still prod gate', 'https://bamakor.vercel.app/login', {
    status: 308,
    locationIncludes: 'bino.casa',
  })
)

for (const c of checks) console.log(c.line)
const ok = checks.every((c) => c.ok)
if (!ok) {
  console.error('\nStaging smoke FAILED')
  process.exit(1)
}
console.log('\nStaging smoke PASSED')
process.exit(0)
