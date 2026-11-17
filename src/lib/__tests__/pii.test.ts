import { describe, expect, it } from 'vitest';
import { detectPii, redact, rehydrate, leakCount, verhoeffValid, luhnValid } from '../pii';
import { SAMPLE_TICKETS } from '../samples';
import { draftPrompt, wordDiff } from '../prompts';

describe('checksums', () => {
  it('validates Verhoeff (Aadhaar) and Luhn (cards)', () => {
    expect(verhoeffValid('491827364553')).toBe(true);
    expect(verhoeffValid('491827364554')).toBe(false);
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
  });
});

describe('detectPii', () => {
  it('finds Indian identifiers', () => {
    const kinds = (s: string) => detectPii(s).map((m) => m.kind);
    expect(kinds('PAN ABCPM4821K')).toEqual(['PAN']);
    expect(kinds('Aadhaar 4918 2736 4553')).toEqual(['AADHAAR']);
    expect(kinds('pay priya.raman@okhdfcbank')).toEqual(['UPI']);
    expect(kinds('call +91 98201 44718')).toEqual(['PHONE']);
    expect(kinds('card 4111 1111 1111 1111')).toEqual(['CARD']);
    expect(kinds('IFSC HDFC0001234')).toEqual(['IFSC']);
    expect(kinds('mail neha.k@example.com')).toEqual(['EMAIL']);
  });
  it('ignores a 12-digit number that fails the Aadhaar checksum', () => {
    expect(detectPii('order 4918 2736 4554').filter((m) => m.kind === 'AADHAAR')).toHaveLength(0);
  });
});

describe('redact / rehydrate round trip on every sample ticket', () => {
  for (const t of SAMPLE_TICKETS) {
    it(t.id, () => {
      const r = redact(t.body, [t.customer]);
      expect(r.matches.length).toBeGreaterThan(0);
      expect(leakCount(r.text, r.vault, [t.customer])).toBe(0);
      expect(rehydrate(r.text, r.vault)).toBe(t.body);
      const prompt = draftPrompt(r.text, t.subject, []);
      expect(leakCount(prompt, r.vault)).toBe(0);
    });
  }
});

describe('wordDiff', () => {
  it('counts added and removed words', () => {
    const d = wordDiff('We will refund you today.', 'We will raise a dispute and share the ID.');
    expect(d.added).toBeGreaterThan(0);
    expect(d.removed).toBeGreaterThan(0);
  });
});
