import PocketBase from 'pocketbase';

// In dev, point VITE_POCKETBASE_URL at your local `pocketbase serve` (default
// http://127.0.0.1:8090). In production, point it at wherever PocketBase runs
// on your VPS (typically reverse-proxied behind the same nginx as the rest of
// your self-hosted apps).
const url = import.meta.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';

export const pb = new PocketBase(url);

// Persist the auth store across reloads (pocketbase-js already does this via
// localStorage by default) and keep React in sync with it.
pb.autoCancellation(false);
