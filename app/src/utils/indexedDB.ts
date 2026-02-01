// IndexedDB helper for storing audio files and pieces
import type { Piece, PieceSettings } from '../types/audio';

const DB_NAME = 'PracticeTracksDB';
const STORE_NAME = 'audioFiles';
const PIECES_STORE = 'pieces';
const PIECE_SETTINGS_STORE = 'pieceSettings';
const DB_VERSION = 2;

let db: IDBDatabase | null = null;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      // Create audioFiles store if it doesn't exist
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      
      // Create pieces store if it doesn't exist
      if (!database.objectStoreNames.contains(PIECES_STORE)) {
        database.createObjectStore(PIECES_STORE, { keyPath: 'id' });
      }
      
      // Create pieceSettings store if it doesn't exist
      if (!database.objectStoreNames.contains(PIECE_SETTINGS_STORE)) {
        database.createObjectStore(PIECE_SETTINGS_STORE, { keyPath: 'id' });
      }
    };
  });
};

export const saveAudioFile = async (id: string, file: File): Promise<void> => {
  const database = await initDB();
  const arrayBuffer = await file.arrayBuffer();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.put({
      id,
      name: file.name,
      type: file.type,
      data: arrayBuffer,
      timestamp: Date.now(),
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAudioFile = async (id: string): Promise<File | null> => {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        const file = new File([result.data], result.name, { type: result.type });
        resolve(file);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
};

export const getAllAudioFiles = async (): Promise<{ id: string; file: File }[]> => {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result.map((item: { id: string; data: ArrayBuffer; name: string; type: string }) => ({
        id: item.id,
        file: new File([item.data], item.name, { type: item.type }),
      }));
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteAudioFile = async (id: string): Promise<void> => {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const clearAllAudioFiles = async (): Promise<void> => {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Piece management functions
export const savePiece = async (piece: Piece): Promise<void> => {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PIECES_STORE], 'readwrite');
    const store = transaction.objectStore(PIECES_STORE);
    const request = store.put(piece);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getPiece = async (id: string): Promise<Piece | null> => {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PIECES_STORE], 'readonly');
    const store = transaction.objectStore(PIECES_STORE);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

export const getAllPieces = async (): Promise<Piece[]> => {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PIECES_STORE], 'readonly');
    const store = transaction.objectStore(PIECES_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const deletePiece = async (id: string): Promise<void> => {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PIECES_STORE], 'readwrite');
    const store = transaction.objectStore(PIECES_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const clearAllPieces = async (): Promise<void> => {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PIECES_STORE], 'readwrite');
    const store = transaction.objectStore(PIECES_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Piece settings functions
export const savePieceSettings = async (id: string, settings: PieceSettings): Promise<void> => {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PIECE_SETTINGS_STORE], 'readwrite');
    const store = transaction.objectStore(PIECE_SETTINGS_STORE);
    const request = store.put({ id, ...settings });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getPieceSettings = async (id: string): Promise<PieceSettings | null> => {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PIECE_SETTINGS_STORE], 'readonly');
    const store = transaction.objectStore(PIECE_SETTINGS_STORE);
    const request = store.get(id);

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, ...settings } = result;
        resolve(settings as PieceSettings);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
};

export const deletePieceSettings = async (id: string): Promise<void> => {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PIECE_SETTINGS_STORE], 'readwrite');
    const store = transaction.objectStore(PIECE_SETTINGS_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const clearAllPieceSettings = async (): Promise<void> => {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PIECE_SETTINGS_STORE], 'readwrite');
    const store = transaction.objectStore(PIECE_SETTINGS_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Get file size for a specific track
export const getAudioFileSize = async (id: string): Promise<number> => {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const result = request.result;
      if (result && result.data) {
        resolve(result.data.byteLength);
      } else {
        resolve(0);
      }
    };
    request.onerror = () => reject(request.error);
  });
};
