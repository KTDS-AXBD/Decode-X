/**
 * LPON 온누리상품권 R2 .skill.json domain 수정 스크립트
 *
 * R2에 저장된 .skill.json 파일들의 metadata.domain을 'pension' → 'giftvoucher'로 수정.
 * Workers API를 통해 R2 객체를 읽고 수정 후 다시 쓰는 방식.
 *
 * 실행 방법:
 *   1. wrangler dev로 로컬 서버 실행 (svc-skill)
 *   2. bun run scripts/lpon-r2-domain-fix.ts
 *
 * 또는 직접 D1에서 skill_id 목록을 가져와 R2 API로 수정:
 *   npx wrangler d1 execute db-skill --remote \
 *     --command "SELECT skill_id, r2_key FROM skills WHERE organization_id = 'LPON'"
 */

// --- Configuration ---
const SVC_SKILL_BASE_URL = process.env['SVC_SKILL_URL'] ?? 'http://localhost:8787';
const INTERNAL_SECRET = process.env['INTERNAL_API_SECRET'] ?? '';
const ORG_ID = 'LPON';
const OLD_DOMAIN = 'pension';
const NEW_DOMAIN = 'giftvoucher';
const BATCH_SIZE = 20;
const DRY_RUN = process.argv.includes('--dry-run');

interface SkillRow {
  skill_id: string;
  r2_key: string;
}

interface SkillJson {
  metadata?: {
    domain?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

async function fetchSkillIds(): Promise<SkillRow[]> {
  // D1에서 LPON skill 목록 가져오기 (svc-skill API 또는 직접 쿼리)
  const res = await fetch(`${SVC_SKILL_BASE_URL}/skills?organizationId=${ORG_ID}&limit=1000`, {
    headers: {
      'X-Internal-Secret': INTERNAL_SECRET,
      'X-Organization-Id': ORG_ID,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch skills: ${res.status}`);
  const data = await res.json() as { skills: SkillRow[] };
  return data.skills;
}

async function readR2Object(r2Key: string): Promise<SkillJson | null> {
  const res = await fetch(`${SVC_SKILL_BASE_URL}/internal/r2/${encodeURIComponent(r2Key)}`, {
    headers: {
      'X-Internal-Secret': INTERNAL_SECRET,
      'X-Organization-Id': ORG_ID,
    },
  });
  if (!res.ok) return null;
  return res.json() as Promise<SkillJson>;
}

async function writeR2Object(r2Key: string, content: SkillJson): Promise<boolean> {
  const res = await fetch(`${SVC_SKILL_BASE_URL}/internal/r2/${encodeURIComponent(r2Key)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': INTERNAL_SECRET,
      'X-Organization-Id': ORG_ID,
    },
    body: JSON.stringify(content),
  });
  return res.ok;
}

async function main() {
  console.log(`=== LPON R2 .skill.json Domain Fix ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Target: ${OLD_DOMAIN} → ${NEW_DOMAIN}`);
  console.log('');

  // NOTE: 이 스크립트는 svc-skill에 /internal/r2/* 엔드포인트가 있어야 동작해요.
  // 그런 엔드포인트가 없다면, 대안으로 wrangler r2 object get/put 명령을 사용해야 해요.
  //
  // 대안 실행 방법 (wrangler CLI):
  //   1. D1에서 r2_key 목록 추출
  //   2. 각 r2_key에 대해:
  //      npx wrangler r2 object get skill-packages {r2_key} --file=/tmp/skill.json
  //      # JSON 수정 (jq 또는 node 스크립트)
  //      npx wrangler r2 object put skill-packages {r2_key} --file=/tmp/skill.json
  //
  // 아래는 API 기반 접근 (svc-skill에 해당 엔드포인트가 있을 때만):

  let totalProcessed = 0;
  let totalFixed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  try {
    const skills = await fetchSkillIds();
    console.log(`Found ${skills.length} LPON skills`);

    for (let i = 0; i < skills.length; i += BATCH_SIZE) {
      const batch = skills.slice(i, i + BATCH_SIZE);
      console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(skills.length / BATCH_SIZE)}`);

      for (const skill of batch) {
        totalProcessed++;
        try {
          const json = await readR2Object(skill.r2_key);
          if (!json) {
            console.log(`  ⚠ ${skill.skill_id}: R2 object not found`);
            totalErrors++;
            continue;
          }

          const currentDomain = json.metadata?.domain;
          if (currentDomain !== OLD_DOMAIN) {
            console.log(`  ⏭ ${skill.skill_id}: domain="${currentDomain}" (not ${OLD_DOMAIN}, skipping)`);
            totalSkipped++;
            continue;
          }

          if (DRY_RUN) {
            console.log(`  🔍 ${skill.skill_id}: would fix domain "${OLD_DOMAIN}" → "${NEW_DOMAIN}"`);
            totalFixed++;
            continue;
          }

          // Update domain in JSON
          if (json.metadata) {
            json.metadata.domain = NEW_DOMAIN;
          }

          const ok = await writeR2Object(skill.r2_key, json);
          if (ok) {
            console.log(`  ✅ ${skill.skill_id}: fixed`);
            totalFixed++;
          } else {
            console.log(`  ❌ ${skill.skill_id}: write failed`);
            totalErrors++;
          }
        } catch (err) {
          console.log(`  ❌ ${skill.skill_id}: ${err}`);
          totalErrors++;
        }
      }
    }
  } catch (err) {
    console.error(`Fatal error: ${err}`);
    process.exit(1);
  }

  console.log('\n=== Summary ===');
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Fixed: ${totalFixed}`);
  console.log(`Skipped (already correct): ${totalSkipped}`);
  console.log(`Errors: ${totalErrors}`);
}

main().catch(console.error);
