/**
 * Automated Firestore Provisioning and Migration Script
 */
import http from 'http';
import https from 'https';
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

async function getAccessToken() {
  return new Promise((resolve, reject) => {
    http.get({
      host: 'metadata.google.internal',
      path: '/computeMetadata/v1/instance/service-accounts/default/token',
      headers: { 'Metadata-Flavor': 'Google' }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body).access_token);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function createFirestoreDatabase(projectId, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      locationId: 'nam5',
      type: 'FIRESTORE_NATIVE'
    });

    const req = https.request({
      host: 'firestore.googleapis.com',
      path: `/v1/projects/${projectId}/databases?databaseId=(default)`,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        console.log('Create DB API Status:', res.statusCode);
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else if (res.statusCode === 409) {
            console.log('Database already exists!');
            resolve({ alreadyExists: true });
          } else {
            reject(new Error(json.error?.message || body));
          }
        } catch {
          reject(new Error(body));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  const projectId = 'hbma-hbma';
  console.log('Fetching Google Cloud access token...');
  const token = await getAccessToken();

  console.log(`Attempting to provision Firestore on ${projectId}...`);
  try {
    await createFirestoreDatabase(projectId, token);
    console.log('✅ Firestore Database created successfully via API!');
  } catch (err) {
    console.error('Provisioning failed:', err.message);
    process.exit(1);
  }

  // Now migrate data
  console.log('Running data migration...');
  const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
  const backup = JSON.parse(fs.readFileSync('firestore_backup_migration.json', 'utf8'));
  const app = initializeApp(config);
  const db = getFirestore(app);

  for (const [col, docs] of Object.entries(backup)) {
    if (!Array.isArray(docs) || docs.length === 0) continue;
    console.log(`Migrating ${docs.length} items to "${col}"...`);
    for (const item of docs) {
      const { id, ...data } = item;
      await setDoc(doc(db, col, id), data, { merge: true });
    }
  }
  console.log('🎉 Migration completed successfully!');
}

main().catch(console.error);
