import fs from 'fs'
for (const f of ['.env.migrate.run', '.env.migrate.dev', '.env.migrate.tmp']) {
  if (!fs.existsSync(f)) {
    console.log(f, 'missing')
    continue
  }
  const t = fs.readFileSync(f, 'utf8')
  for (const k of ['POSTGRES_URL_NON_POOLING', 'POSTGRES_PASSWORD', 'SUPABASE_ACCESS_TOKEN']) {
    const m = t.match(new RegExp(`^${k}=(.*)$`, 'm'))
    const v = m ? m[1].replace(/^["']|["']$/g, '') : ''
    console.log(f, k, v.length)
  }
}
