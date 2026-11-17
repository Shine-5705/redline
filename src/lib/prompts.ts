import { diffWords } from 'diff';
import { TEAM_POLICY } from './samples';
import type { Rule } from './store';

export function draftPrompt(ticketRedacted: string, subject: string, rules: Rule[], customerToken = '[NAME_1]'): string {
  const learned = rules.filter((r) => r.active);
  return [
    TEAM_POLICY,
    learned.length
      ? `Rules this agent taught you from past corrections (follow all of them):\n${learned.map((r, i) => `${i + 1}. ${r.text}`).join('\n')}`
      : '',
    'Identifiers appear as placeholders like [PHONE_1] or [NAME_1]. Keep placeholders exactly as written; never invent numbers.',
    `Customer: ${customerToken}`,
    `Ticket subject: ${subject}`,
    `Customer message:\n"""${ticketRedacted}"""`,
    'Write only the reply text.',
  ].filter(Boolean).join('\n\n');
}

export interface DiffPart { value: string; added?: boolean; removed?: boolean }

export function wordDiff(a: string, b: string) {
  const parts = diffWords(a, b) as DiffPart[];
  const count = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const added = parts.filter((p) => p.added).reduce((n, p) => n + count(p.value), 0);
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + count(p.value), 0);
  return { parts, added, removed };
}

export function distillPrompt(draft: string, final: string): string {
  const { parts } = wordDiff(draft, final);
  const changes = parts
    .filter((p) => p.added || p.removed)
    .map((p) => `${p.added ? '+ ' : '- '}${p.value.trim()}`)
    .join('\n');
  return [
    'A support agent corrected an AI-drafted reply. Infer the ONE reusable rule behind the correction, so future drafts need less editing.',
    'The rule must be general (apply to other customers), imperative, and under 25 words. Do not include names, amounts or placeholders.',
    'If the edit is only a one-off factual fix, set generalizable to false.',
    `Draft:\n"""${draft}"""`,
    `Agent's final version:\n"""${final}"""`,
    `Word-level changes:\n${changes}`,
  ].join('\n\n');
}
