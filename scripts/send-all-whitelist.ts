import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const ENDPOINT = 'https://playbimyah.com/api/public/send-whitelist-email'

async function main() {
  const emails: string[] = []
  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    for (const u of data.users) if (u.email) emails.push(u.email.toLowerCase())
    if (data.users.length < perPage) break
    page++
  }
  const unique = Array.from(new Set(emails))
  console.log(`Found ${unique.length} unique emails`)
  let sent = 0, skipped = 0, failed = 0
  for (const email of unique) {
    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const j: any = await r.json().catch(() => ({}))
      if (j.success === true) sent++
      else if (j.reason === 'email_suppressed') skipped++
      else { failed++; console.log('fail', email, r.status, j) }
    } catch (e) {
      failed++
      console.log('err', email, e)
    }
    await new Promise(r => setTimeout(r, 50))
  }
  console.log({ total: unique.length, sent, skipped, failed })
}
main().catch(e => { console.error(e); process.exit(1) })
