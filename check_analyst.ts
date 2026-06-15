import { db } from './packages/web/src/api/database';
import * as schema from './packages/web/src/api/database/schema';
import { desc } from 'drizzle-orm';

async function main() {
  const rows = await db.select({
    id: schema.analyses.id,
    llm1Output: schema.analyses.llm1Output,
  }).from(schema.analyses).orderBy(desc(schema.analyses.id)).limit(1);

  const row = rows[0];
  if (!row?.llm1Output) { console.log('NO OUTPUT'); return; }

  const raw = row.llm1Output.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let j: any;
  try { j = JSON.parse(raw); } catch(e: any) { console.log('PARSE FAIL:', e.message, '\n', raw.slice(0,300)); return; }

  console.log('deal_type raw value:', JSON.stringify(j.deal_type));
  console.log('classification_confidence:', j.classification_confidence);
  console.log('suppressions count:', (j.suppressions ?? []).length);
  console.log('suppressions:', JSON.stringify(j.suppressions ?? [], null, 2));
}

main().then(() => process.exit(0)).catch((e: any) => { console.error(e); process.exit(1); });
