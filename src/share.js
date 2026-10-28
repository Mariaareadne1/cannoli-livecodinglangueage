/* cannoli — links that carry code in the URL (#code=…). */

export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

export function fromBase64(b64) {
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

/** A link to the editor with this code loaded. */
export function codeLink(code, base = "index.html") {
  return `${base}#code=${encodeURIComponent(toBase64(code))}`;
}

/** Code carried in the current URL, or null. */
export function codeFromUrl() {
  const match = location.hash.match(/code=([^&]+)/);
  if (!match) return null;
  try {
    return fromBase64(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}
