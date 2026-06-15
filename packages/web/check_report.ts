import { db } from './src/api/database';
import * as schema from './src/api/database/schema';
import { desc } from 'drizzle-orm';

async function main() {
  const rows = await db.select({ reportMarkdown: schema.analyses.reportMarkdown })
    .from(schema.analyses).orderBy(desc(schema.analyses.id)).limit(1);
  const md = rows[0]?.reportMarkdown ?? '';
  // Find every occurrence of "equity" near "suppression" or "L3-B" or "CROSS-LAYER"
  const sections = md.split('\n###');
  for (const s of sections) {
    if (/equity|suppression|L3-B|cross.layer/i.test(s)) {
      console.log('--- SECTION ---');
      console.log(s.slice(0, 600));
      console.log();
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(String(e)); process.exit(1); });
