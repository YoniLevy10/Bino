import fs from 'fs'
const files = ['.env.local', '.env.migrate.run', '.env.migrate.tmp']
let t = ''
for (const f of files) {
  if (fs.existsSync(f)) t += fs.readFileSync(f, 'utf8') + '\n'
}
for (const k of ['POSTGRES_HOST', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DATABASE', 'POSTGRES_URL']) {
  const re = new RegExp(`^${k}=(.*)$`, 'm')
  const m = t.match(re)
  const v = m ? m[1].replace(/^["']|["']$/g, '') : ''
  console.log(k, v.length)
}
