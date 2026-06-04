import fs from 'fs'
import path from 'path'

const authPath = path.join(process.env.APPDATA, 'com.vercel.cli', 'Data', 'auth.json')
const token = JSON.parse(fs.readFileSync(authPath, 'utf8')).token
const headers = { Authorization: `Bearer ${token}` }

const proj = await (await fetch('https://api.vercel.com/v9/projects/bamakor', { headers })).json()
const id = proj.id
console.log('projectId', id)

for (const url of [
  `https://api.vercel.com/v9/projects/${id}/env`,
  `https://api.vercel.com/v9/projects/${id}/env?decrypt=true`,
  `https://api.vercel.com/v10/projects/${id}/env?decrypt=true`,
  `https://api.vercel.com/v10/projects/bamakor/env?decrypt=true`,
]) {
  const r = await fetch(url, { headers })
  const j = await r.json().catch(() => ({}))
  console.log(url.replace(id, 'ID'), r.status, 'keys', Object.keys(j), 'envs', j.envs?.length)
  const pg = (j.envs || []).find((e) => e.key === 'POSTGRES_PASSWORD')
  if (pg) console.log('POSTGRES_PASSWORD len', pg.value?.length ?? 'null')
}
