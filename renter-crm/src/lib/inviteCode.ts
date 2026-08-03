// URL-safe, unguessable invite token generated entirely client-side (Web
// Crypto) — no server round-trip needed just to mint a code.
export function generateInviteCode(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
