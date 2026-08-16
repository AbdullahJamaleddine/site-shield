#!/usr/bin/env node
/* Restore Firestore data from firestore-backup.json.
 *
 * Requirements:
 *   1. Have a Firebase service-account JSON file for your project.
 *   2. Set GOOGLE_APPLICATION_CREDENTIALS to its path, OR pass --creds path/to/service-account.json.
 *   3. Run:   node website/scripts/restore-firestore.js
 *      Options:  --only=collection1,collection2   (restore only listed collections)
 *                --dry                            (log what would be written, write nothing)
 *                --wipe                           (delete existing docs in each restored collection first)
 *
 * The script preserves the original document IDs.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

const credsPath = args.creds || process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credsPath || !fs.existsSync(credsPath)) {
  console.error('Missing service-account JSON. Pass --creds=path/to/sa.json or set GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(credsPath))) });
const db = admin.firestore();

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'firestore-backup.json'), 'utf8'));
const only = args.only ? String(args.only).split(',').map(s => s.trim()).filter(Boolean) : null;
const dry = !!args.dry;
const wipe = !!args.wipe;

async function wipeCollection(name) {
  const snap = await db.collection(name).get();
  console.log(`  wiping ${snap.size} existing docs from ${name}`);
  const batches = [];
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    batches.push(batch.commit());
  }
  await Promise.all(batches);
}

(async () => {
  const collections = Object.keys(data).filter(k => !only || only.includes(k));
  console.log(`Restoring collections: ${collections.join(', ')}${dry ? ' (DRY RUN)' : ''}`);
  for (const name of collections) {
    const docs = data[name] || [];
    console.log(`\n→ ${name}: ${docs.length} docs`);
    if (dry) continue;
    if (wipe) await wipeCollection(name);
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach(d => {
        const { id, ...rest } = d;
        const ref = id ? db.collection(name).doc(id) : db.collection(name).doc();
        batch.set(ref, rest, { merge: true });
      });
      await batch.commit();
      console.log(`  wrote ${Math.min(i + 400, docs.length)} / ${docs.length}`);
    }
  }
  console.log('\nDone.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
