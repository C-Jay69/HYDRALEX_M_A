import { db } from './src/api/database';
import * as schema from './src/api/database/schema';
import { desc } from 'drizzle-orm';

async function main() {
  const rows = await db.select({ llm1Output: schema.analyses.llm1Output })
    .from(schema.analyses).orderBy(desc(schema.analyses.id)).limit(1);
  const raw = rows[0]?.llm1Output ?? '';
  const cleaned = raw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
  const j = JSON.parse(cleaned);
  console.log('Top-level keys:', Object.keys(j).join(', '));
  const suppIdx = cleaned.indexOf('suppression');
  console.log('"suppression" present in raw string:', suppIdx !== -1);
  if (suppIdx !== -1) console.log('Context:', cleaned.slice(Math.max(0,suppIdx-30), suppIdx+300));
}
main().then(() => process.exit(0)).catch(e => { console.error(String(e)); process.exit(1); });
