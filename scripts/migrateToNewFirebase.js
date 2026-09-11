/**
 * Automated Firestore Data Importer for migrating into the new project
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

async function runMigration() {
  const configFile = process.argv[2] || 'firebase-applet-config.json';
  if (!fs.existsSync(configFile)) {
    console.error('Config file not found:', configFile);
    process.exit(1);
  }

  const backupFile = 'firestore_backup_migration.json';
  if (!fs.existsSync(backupFile)) {
    console.error('Backup file not found:', backupFile);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

  console.log(`Connecting to target Firebase project: ${config.projectId}...`);
  const app = initializeApp(config);
  const db = config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, config.firestoreDatabaseId)
    : getFirestore(app);

  for (const [collectionName, documents] of Object.entries(backupData)) {
    if (!Array.isArray(documents) || documents.length === 0) {
      console.log(`Skipping empty collection: ${collectionName}`);
      continue;
    }

    console.log(`Migrating ${documents.length} records into "${collectionName}"...`);
    for (const item of documents) {
      const { id, ...data } = item;
      const docRef = doc(db, collectionName, id);
      await setDoc(docRef, data, { merge: true });
    }
    console.log(`✅ Successfully migrated collection: ${collectionName}`);
  }

  console.log('\n🎉 All collections successfully migrated to the new project!');
}

runMigration().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
