// Gravatar accepts either MD5 or SHA-256 hashes of the trimmed, lowercased
// email — SHA-256 lets us use the browser's native crypto.subtle instead of
// pulling in an MD5 dependency. https://docs.gravatar.com/general/hash/
export async function gravatarUrl(email: string, size = 128): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const data = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return `https://www.gravatar.com/avatar/${hashHex}?s=${size}&d=404`;
}
