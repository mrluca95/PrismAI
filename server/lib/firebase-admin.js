import admin from 'firebase-admin';
import fs from 'node:fs';

const maybeParseJson = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error('[firebase] Failed to parse service account JSON from environment variable.', error);
    return null;
  }
};

const loadServiceAccount = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
      const parsed = maybeParseJson(decoded);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      console.error('[firebase] Failed to decode FIREBASE_SERVICE_ACCOUNT_BASE64.', error);
    }
  }

  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const parsedInline = maybeParseJson(inlineJson);
  if (parsedInline) {
    return parsedInline;
  }

  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (filePath) {
    try {
      const fileContents = fs.readFileSync(filePath, 'utf8');
      const parsed = maybeParseJson(fileContents);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      console.error('[firebase] Failed to read service account file.', error);
    }
  }

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  const providedCount = [FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY].filter(Boolean).length;
  if (providedCount > 0 && providedCount < 3) {
    console.error('[firebase] FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY must all be set when using direct environment variables.');
    return null;
  }
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return {
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }

  return null;
};

const resolveProjectId = (serviceAccount) => {
  return (
    serviceAccount?.project_id
    || serviceAccount?.projectId
    || process.env.FIREBASE_PROJECT_ID
    || process.env.GOOGLE_CLOUD_PROJECT
    || process.env.GCLOUD_PROJECT
    || null
  );
};

const initFirebaseApp = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccount = loadServiceAccount();
  const options = {};
  const projectId = resolveProjectId(serviceAccount);

  if (serviceAccount) {
    options.credential = admin.credential.cert(serviceAccount);
  } else {
    console.warn('[firebase] Service account credentials not provided; attempting application default credentials.');
    options.credential = admin.credential.applicationDefault();
  }

  if (projectId) {
    options.projectId = projectId;
  } else {
    console.error('[firebase] Project ID is not configured. Set FIREBASE_PROJECT_ID or include project_id in your service account JSON.');
  }

  if (process.env.FIREBASE_DATABASE_URL) {
    options.databaseURL = process.env.FIREBASE_DATABASE_URL;
  }

  return admin.initializeApp(options);
};

const app = initFirebaseApp();
const firestore = admin.firestore(app);
firestore.settings({ ignoreUndefinedProperties: true });

export { admin, firestore };
