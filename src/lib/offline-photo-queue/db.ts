import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { QueuedPhotoUpload } from './types';

const DATABASE_NAME = 'fieldpilot-offline-photo-queue';
const DATABASE_VERSION = 1;

interface OfflinePhotoQueueDatabase extends DBSchema {
  photos: {
    key: string;
    value: QueuedPhotoUpload;
    indexes: {
      'by-user': string;
      'by-user-project': [string, string];
      'by-created-at': number;
    };
  };
}

let databasePromise: Promise<IDBPDatabase<OfflinePhotoQueueDatabase>> | null = null;

export function openOfflinePhotoQueueDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = openDB<OfflinePhotoQueueDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      const photos = database.createObjectStore('photos', { keyPath: 'clientUploadId' });
      photos.createIndex('by-user', 'userId');
      photos.createIndex('by-user-project', ['userId', 'projectId']);
      photos.createIndex('by-created-at', 'createdAt');
    },
    blocking() {
      void databasePromise?.then((database) => database.close());
      databasePromise = null;
    },
    terminated() {
      databasePromise = null;
    },
  });
  return databasePromise;
}

export async function deleteOfflinePhotoQueueDatabaseForTests() {
  const database = await databasePromise;
  database?.close();
  databasePromise = null;
  await deleteDB(DATABASE_NAME);
}
