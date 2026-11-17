// Deterministic, on-device PII detection for Indian support tickets.
// Runs before ANY prompt is built, so raw identifiers never enter a model prompt
// regardless of whether Firebase AI Logic routes the request on-device or to the cloud.

export type PiiKind = 'AADHAAR' | 'PAN' | 'UPI' | 'PHONE' | 'EMAIL' | 'CARD' | 'IFSC' | 'ACCOUNT' | 'NAME';

export interface PiiMatch {
  kind: PiiKind;
  value: string;
  start: number;
  end: number;
}

// Verhoeff tables (Aadhaar check digit)
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export function verhoeffValid(num: string): boolean {
  let c = 0;
  const digits = num.split('').reverse().map(Number);
  for (let i = 0; i < digits.length; i++) c = D[c][P[i % 8][digits[i]]];
  return c === 0;
}
export function luhnValid(num: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

interface Rule { kind: PiiKind; re: RegExp; check?: (digits: string) => boolean }

const RULES: Rule[] = [
  { kind: 'EMAIL', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: 'UPI', re: /\b[A-Za-z0-9._-]{2,}@(?:ok(?:axis|hdfcbank|icici|sbi)|ybl|ibl|axl|paytm|upi|apl|icici|sbi|hdfcbank|axisbank|kotak|yesbank)\b/gi },
  { kind: 'CARD', re: /\b(?:\d[ -]?){15,18}\d\b/g, check: luhnValid },
  { kind: 'AADHAAR', re: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g, check: verhoeffValid },
  { kind: 'PAN', re: /\b[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]\b/g },
  { kind: 'IFSC', re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  { kind: 'PHONE', re: /(?:\+91[ -]?|\b0?)[6-9]\d{4}[ -]?\d{5}\b/g },
  { kind: 'ACCOUNT', re: /\b(?:a\/c|acct|account)(?:\s*(?:no\.?|number))?\s*[:#]?\s*(\d{9,18})\b/gi },
];

export function detectPii(text: string, names: string[] = []): PiiMatch[] {
  const found: PiiMatch[] = [];
  const taken = (s: number, e: number) => found.some((m) => s < m.end && e > m.start);
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text))) {
      let value = m[0];
      let start = m.index;
      if (rule.kind === 'ACCOUNT' && m[1]) { start = m.index + m[0].lastIndexOf(m[1]); value = m[1]; }
      const end = start + value.length;
      if (rule.check && !rule.check(value.replace(/\D/g, ''))) continue;
      if (taken(start, end)) continue;
      found.push({ kind: rule.kind, value, start, end });
    }
  }
  for (const name of names.filter((n) => n.trim().length > 1)) {
    const parts = [name, ...name.split(/\s+/).filter((p) => p.length > 2)];
    for (const p of parts) {
      const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        if (!taken(m.index, m.index + p.length)) found.push({ kind: 'NAME', value: p, start: m.index, end: m.index + p.length });
      }
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

export interface Redaction {
  text: string;
  vault: Map<string, string>; // token -> original value
  matches: PiiMatch[];
}

/** Replace every identifier with a stable placeholder such as [PHONE_1]. */
export function redact(text: string, names: string[] = [], vault = new Map<string, string>()): Redaction {
  const matches = detectPii(text, names);
  const reverse = new Map<string, string>();
  for (const [t, v] of vault) reverse.set(v, t);
  const counters: Record<string, number> = {};
  for (const t of vault.keys()) {
    const k = t.slice(1, t.lastIndexOf('_'));
    counters[k] = Math.max(counters[k] ?? 0, Number(t.slice(t.lastIndexOf('_') + 1, -1)));
  }
  let out = '';
  let cursor = 0;
  for (const m of matches) {
    out += text.slice(cursor, m.start);
    let token = reverse.get(m.value);
    if (!token) {
      counters[m.kind] = (counters[m.kind] ?? 0) + 1;
      token = `[${m.kind}_${counters[m.kind]}]`;
      vault.set(token, m.value);
      reverse.set(m.value, token);
    }
    out += token;
    cursor = m.end;
  }
  out += text.slice(cursor);
  return { text: out, vault, matches };
}

export function rehydrate(text: string, vault: Map<string, string>): string {
  let out = text;
  for (const [token, value] of vault) out = out.split(token).join(value);
  return out;
}

/** Independent re-scan of an outbound prompt. Used by the privacy ledger to prove 0 identifiers left. */
export function leakCount(outbound: string, vault: Map<string, string>, names: string[] = []): number {
  let n = detectPii(outbound, names).length;
  for (const v of vault.values()) if (outbound.includes(v)) n++;
  return n;
}
