import { cert, deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const APP_NAME = "voxel-backend";

function parseServiceAccount(rawJson) {
  let parsed;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain a Firebase service account object");
  }

  const required = ["project_id", "client_email", "private_key"];
  for (const key of required) {
    if (typeof parsed[key] !== "string" || parsed[key].trim() === "") {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is missing ${key}`);
    }
  }

  return {
    projectId: parsed.project_id.trim(),
    clientEmail: parsed.client_email.trim(),
    privateKey: parsed.private_key.replace(/\\n/g, "\n")
  };
}

export function createFirebaseContext({ databaseUrl, serviceAccountJson }) {
  const serviceAccount = parseServiceAccount(serviceAccountJson);
  const existing = getApps().find((app) => app.name === APP_NAME);
  const app = existing ?? initializeApp({
    credential: cert(serviceAccount),
    databaseURL: databaseUrl
  }, APP_NAME);

  return Object.freeze({
    app,
    database: getDatabase(app),
    projectId: serviceAccount.projectId,
    databaseUrl
  });
}

export async function closeFirebaseContext(context) {
  if (!context?.app) return;
  await deleteApp(context.app).catch(() => {});
}
