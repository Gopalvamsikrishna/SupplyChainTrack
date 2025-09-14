// frontend/utils.ts
export function shortenHex(hex: string | null | undefined, prefixLen = 8, suffixLen = 4) {
  if (!hex) return '';
  const h = String(hex);
  if (h.length <= prefixLen + suffixLen + 3) return h;
  return `${h.slice(0, prefixLen)}…${h.slice(-suffixLen)}`;
}

export function formatTs(ts?: number | string) {
  if (!ts) return 'Unknown time';
  let t = Number(ts);
  // if value looks like ms (>= 10^12) use directly, else seconds -> ms
  if (t < 1e12) t = t * 1000;
  try {
    return new Date(t).toLocaleString();
  } catch {
    return String(ts);
  }
}

export function parsePayload(rawPayload: any) {
  if (!rawPayload) return null;
  if (typeof rawPayload === 'string') {
    try { return JSON.parse(rawPayload); } catch { return null; }
  }
  return rawPayload;
}

export function tempSeverityClass(tempC: number | null | undefined) {
  if (tempC === null || tempC === undefined || Number.isNaN(tempC)) return 'bg-gray-100 text-gray-800';
  if (tempC < 2) return 'bg-blue-50 text-blue-800';        // cold
  if (tempC <= 8) return 'bg-green-50 text-green-800';      // good
  if (tempC <= 15) return 'bg-amber-50 text-amber-800';     // caution
  return 'bg-red-50 text-red-800';                          // hot / alert
}
