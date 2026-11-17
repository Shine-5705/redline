import { useEffect, useMemo, useState } from 'react';
import { SAMPLE_TICKETS, type Ticket } from '../lib/samples';
import { detectPii, redact, rehydrate, leakCount, type PiiMatch } from '../lib/pii';
import { draftPrompt, distillPrompt, wordDiff } from '../lib/prompts';
import { uid, type Correction, type LedgerEntry, type Rule } from '../lib/store';
import type { Engine, GenResult, OnDeviceState } from '../lib/engine';
import { SourceBadge, Icon } from './ui';

type Data = ReturnType<typeof import('../lib/useStore').useData>;

interface Props {
  engine: Engine | null;
  onDevice: OnDeviceState;
  online: boolean;
  localOnly: boolean;
  data: Data;
}

function Highlighted({ text, matches, showRedacted, names }: { text: string; matches: PiiMatch[]; showRedacted: boolean; names: string[] }) {
  if (showRedacted) {
    const r = redact(text, names);
    const parts = r.text.split(/(\[[A-Z]+_\d+\])/g);
    return <p className="msg">{parts.map((p, i) => /^\[[A-Z]+_\d+\]$/.test(p) ? <span key={i} className="ph">{p}</span> : <span key={i}>{p}</span>)}</p>;
  }
  const out: React.ReactNode[] = [];
  let c = 0;
  matches.forEach((m, i) => {
    out.push(<span key={`t${i}`}>{text.slice(c, m.start)}</span>);
    out.push(<mark key={`m${i}`} className="pii" data-kind={m.kind} title={`${m.kind} — detected on-device, never sent to a model`}>{m.value}</mark>);
    c = m.end;
  });
  out.push(<span key="end">{text.slice(c)}</span>);
  return <p className="msg">{out}</p>;
}

interface DraftState extends GenResult { promptChars: number; charsOff: number; piiRedacted: number; piiInPrompt: number; rulesUsed: number; redactedDraft: string; vault: Map<string, string> }

export function Inbox({ engine, onDevice, online, localOnly, data }: Props) {
  const [activeId, setActiveId] = useState(SAMPLE_TICKETS[0].id);
  const [showRedacted, setShowRedacted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [reply, setReply] = useState('');
  const [learn, setLearn] = useState<{ correction: Correction; rule?: Rule; diff: ReturnType<typeof wordDiff> } | null>(null);
  const [manualRule, setManualRule] = useState('');
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const ticket = SAMPLE_TICKETS.find((t) => t.id === activeId)!;
  const names = useMemo(() => [ticket.customer], [ticket]);
  const matches = useMemo(() => detectPii(ticket.body, names), [ticket, names]);
  const activeRules = data.rules.filter((r) => r.active);

  useEffect(() => { setDraft(null); setReply(''); setLearn(null); setError(null); setManualRule(''); }, [activeId]);

  const cloudAllowed = !!engine && engine.cloud === 'ready' && online && !localOnly;
  const deviceReady = onDevice === 'available';
  const canDraft = !!engine && (deviceReady || cloudAllowed || onDevice === 'downloadable' || onDevice === 'downloading');

  async function log(e: Omit<LedgerEntry, 'id' | 'at'>) {
    await data.save('ledger', { id: uid(), at: Date.now(), ...e });
  }

  async function runDraft() {
    if (!engine) return;
    setBusy('draft'); setError(null); setLearn(null);
    const seed = new Map([['[NAME_1]', ticket.customer]]);
    const r = redact(ticket.body, names, seed);
    const subj = redact(ticket.subject, names, r.vault);
    const prompt = draftPrompt(r.text, subj.text, activeRules, '[NAME_1]');
    const piiInPrompt = leakCount(prompt, r.vault);
    const force = localOnly || !online ? 'device' : undefined;
    try {
      if (piiInPrompt > 0) throw new Error('Blocked: an identifier survived redaction. Nothing was sent.');
      const res = await engine.draft(prompt, force);
      const charsOff = res.source === 'in_cloud' ? prompt.length : 0;
      const shown = rehydrate(res.text, r.vault);
      setDraft({ ...res, promptChars: prompt.length, charsOff, piiRedacted: r.matches.length + subj.matches.length + 1, piiInPrompt, rulesUsed: activeRules.length, redactedDraft: res.text, vault: r.vault });
      setReply(shown);
      for (const rule of activeRules) await data.save('rules', { ...rule, uses: rule.uses + 1 });
      await log({ feature: 'draft', mode: force ? 'ONLY_ON_DEVICE' : engine.cloud === 'ready' ? 'PREFER_ON_DEVICE' : 'ONLY_ON_DEVICE', source: res.source, model: res.model, latencyMs: res.ms, promptChars: prompt.length, charsOffDevice: charsOff, piiRedacted: r.matches.length + subj.matches.length + 1, piiInPrompt });
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      await log({ feature: 'draft', mode: force ? 'ONLY_ON_DEVICE' : 'PREFER_ON_DEVICE', source: piiInPrompt > 0 ? 'blocked' : 'error', model: '—', latencyMs: 0, promptChars: prompt.length, charsOffDevice: 0, piiRedacted: r.matches.length, piiInPrompt, note: msg.slice(0, 140) });
    } finally { setBusy(null); }
  }

  async function sendAndLearn() {
    if (!draft) return;
    // Re-tokenise the agent's final text with the same vault, so stored corrections hold placeholders only.
    const finalRedacted = redact(reply, names, new Map(draft.vault)).text;
    const diff = wordDiff(draft.redactedDraft, finalRedacted);
    setSent((s) => ({ ...s, [ticket.id]: true }));
    const correction: Correction = { id: uid(), ticketId: ticket.id, createdAt: Date.now(), draft: draft.redactedDraft, final: finalRedacted, added: diff.added, removed: diff.removed, status: 'held' };
    if (diff.added + diff.removed === 0) { const c = { ...correction, status: 'accepted' as const }; await data.save('corrections', c); setLearn({ correction: c, diff }); return; }
    await data.save('corrections', correction);
    setLearn({ correction, diff });
    if (deviceReady && engine) await distill(correction, 'device');
  }

  async function distill(correction: Correction, where: 'device' | 'cloud') {
    if (!engine) return;
    setBusy(where === 'device' ? 'learn-device' : 'learn-cloud'); setError(null);
    const prompt = distillPrompt(correction.draft, correction.final);
    const piiInPrompt = leakCount(prompt, new Map());
    try {
      if (where === 'cloud' && piiInPrompt > 0) throw new Error('Blocked: the correction still contains an identifier. Nothing was sent.');
      const res = await engine.distill(prompt, where);
      const rule: Rule = { id: uid(), text: res.parsed.rule.trim(), category: (['tone', 'policy', 'format', 'facts'].includes(res.parsed.category) ? res.parsed.category : 'other') as Rule['category'], createdAt: Date.now(), distilledBy: res.source, correctionId: correction.id, active: res.parsed.generalizable !== false, promoted: false, uses: 0 };
      await data.save('rules', rule);
      const c2 = { ...correction, status: 'distilled' as const, ruleId: rule.id };
      await data.save('corrections', c2);
      setLearn((l) => l && { ...l, correction: c2, rule });
      await log({ feature: 'distill', mode: where === 'device' ? 'ONLY_ON_DEVICE' : 'ONLY_IN_CLOUD (opt-in)', source: res.source, model: res.model, latencyMs: res.ms, promptChars: prompt.length, charsOffDevice: res.source === 'in_cloud' ? prompt.length : 0, piiRedacted: 0, piiInPrompt, note: res.parsed.generalizable === false ? 'Model judged this a one-off fix; rule saved inactive' : undefined });
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      await log({ feature: 'distill', mode: where === 'device' ? 'ONLY_ON_DEVICE' : 'ONLY_IN_CLOUD (opt-in)', source: piiInPrompt > 0 ? 'blocked' : 'error', model: '—', latencyMs: 0, promptChars: prompt.length, charsOffDevice: 0, piiRedacted: 0, piiInPrompt, note: msg.slice(0, 140) });
    } finally { setBusy(null); }
  }

  async function saveManual() {
    if (!learn || !manualRule.trim()) return;
    const rule: Rule = { id: uid(), text: manualRule.trim(), category: 'other', createdAt: Date.now(), distilledBy: 'manual', correctionId: learn.correction.id, active: true, promoted: false, uses: 0 };
    await data.save('rules', rule);
    const c2 = { ...learn.correction, status: 'manual' as const, ruleId: rule.id };
    await data.save('corrections', c2);
    setLearn({ ...learn, correction: c2, rule });
    setManualRule('');
  }

  const engineLabel = localOnly || !online ? 'On-device only' : engine?.cloud === 'ready' ? 'Hybrid · prefers on-device' : 'On-device only';

  return (
    <div className="inbox">
      <aside className="tickets">
        <div className="pane-head"><span>Inbox</span><span className="count">{SAMPLE_TICKETS.length}</span></div>
        {SAMPLE_TICKETS.map((t: Ticket) => (
          <button key={t.id} className={`ticket-row ${t.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(t.id)}>
            <div className="tr-top"><span className="tr-name">{t.customer}</span><span className="tr-time">{t.receivedAt}</span></div>
            <div className="tr-subj">{t.subject}</div>
            <div className="tr-meta"><span className="tag">{t.tag}</span><span className="muted">{t.id}</span>{sent[t.id] && <span className="tag tag-ok">Replied</span>}</div>
          </button>
        ))}
        <div className="tickets-foot">Synthetic data. Every name and number is invented.</div>
      </aside>

      <section className="thread">
        <header className="thread-head">
          <div>
            <div className="eyebrow">{ticket.id} · {ticket.channel}</div>
            <h1>{ticket.subject}</h1>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={showRedacted} onChange={(e) => setShowRedacted(e.target.checked)} />
            <span className="track"><span className="thumb" /></span>
            What the model sees
          </label>
        </header>

        <div className="card message">
          <div className="msg-from"><div className="avatar">{ticket.customer.split(' ').map((p) => p[0]).join('')}</div><div><b>{ticket.customer}</b><span className="muted"> · {ticket.receivedAt}</span></div></div>
          <Highlighted text={ticket.body} matches={matches} showRedacted={showRedacted} names={names} />
          <div className="pii-strip">
            {Icon.chip}<span>{matches.length} identifiers found on this device</span>
            {[...new Set(matches.map((m) => m.kind))].map((k) => <span key={k} className="kind">{k}</span>)}
          </div>
        </div>

        <div className="card composer">
          <div className="composer-head">
            <div className="composer-title">Reply</div>
            <div className="composer-actions">
              <span className="muted small">{activeRules.length} learned rule{activeRules.length === 1 ? '' : 's'} · {engineLabel}</span>
              <button className="btn btn-primary" disabled={!canDraft || !!busy} onClick={runDraft}>
                {busy === 'draft' ? <span className="spinner" /> : Icon.spark}{draft ? 'Redraft' : 'Draft reply'}
              </button>
            </div>
          </div>

          {!engine || !canDraft ? (
            <div className="notice">
              <b>No model path is available in this browser.</b> On-device: {onDevice}. Cloud: {engine?.cloud === 'ready' ? (online ? (localOnly ? 'disabled by Local-only mode' : 'ready') : 'offline') : 'not configured'}.
              {' '}Open Settings to connect a Firebase project, or use desktop Chrome with the built-in model enabled.
            </div>
          ) : null}

          {draft && (
            <div className="provenance">
              <SourceBadge source={draft.source} />
              <span>{draft.model}</span><span className="sep">·</span>
              <span>{draft.ms.toLocaleString()} ms</span><span className="sep">·</span>
              <span>{draft.charsOff === 0 ? 'Nothing left this device' : `${draft.charsOff.toLocaleString()} chars sent, placeholders only`}</span><span className="sep">·</span>
              <span>{draft.piiRedacted} redacted · {draft.piiInPrompt} identifiers in prompt</span>
              {draft.rulesUsed > 0 && <><span className="sep">·</span><span>{draft.rulesUsed} rules applied</span></>}
            </div>
          )}

          <textarea className="editor" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={draft ? '' : 'Draft a reply, then edit it the way you actually would. Redline learns from the difference, on this device.'} rows={8} />

          <div className="composer-foot">
            <span className="muted small">Edits are compared on-device. The correction is stored in this browser with placeholders, never raw identifiers.</span>
            <button className="btn" disabled={!draft || !!busy || sent[ticket.id]} onClick={sendAndLearn}>{sent[ticket.id] ? 'Sent' : 'Send & learn'}</button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>

        {learn && (
          <div className="card learn">
            <div className="learn-head">
              <div className="composer-title">Correction captured</div>
              <span className="muted small">+{learn.diff.added} / −{learn.diff.removed} words · stored locally</span>
            </div>
            {learn.diff.added + learn.diff.removed === 0 ? (
              <p className="muted">Sent unchanged: no edits needed, so there is nothing new to learn. Logged as an accepted draft.</p>
            ) : (
              <>
                <p className="diff">{learn.diff.parts.map((p, i) => <span key={i} className={p.added ? 'ins' : p.removed ? 'del' : ''}>{p.value}</span>)}</p>
                {learn.rule ? (
                  <div className="rule-born">
                    <SourceBadge source={learn.rule.distilledBy} />
                    <div><div className="rule-text">{learn.rule.text}</div><div className="muted small">{learn.rule.active ? 'Active. It will shape the next draft.' : 'Saved inactive: judged a one-off fix.'} {learn.rule.distilledBy === 'on_device' && 'Learned without the correction leaving this device.'}</div></div>
                  </div>
                ) : busy === 'learn-device' ? (
                  <div className="muted"><span className="spinner" /> Learning on-device…</div>
                ) : (
                  <div className="held">
                    <div><b>Held on this device.</b> {deviceReady ? '' : `The on-device model is ${onDevice}, so Redline won't learn automatically.`} Choose how to turn it into a rule:</div>
                    <div className="held-actions">
                      {deviceReady && <button className="btn" onClick={() => distill(learn.correction, 'device')}>Learn on-device</button>}
                      <button className="btn" disabled={!cloudAllowed || !!busy} onClick={() => distill(learn.correction, 'cloud')} title="Sends this one redacted diff to the cloud model, once">
                        {busy === 'learn-cloud' ? <span className="spinner" /> : Icon.cloud} Opt in: learn in cloud (this diff only)
                      </button>
                    </div>
                    <div className="manual">
                      <input value={manualRule} onChange={(e) => setManualRule(e.target.value)} placeholder="Or write the rule yourself, e.g. ‘Give the dispute ID in the first line’" />
                      <button className="btn" disabled={!manualRule.trim()} onClick={saveManual}>Save rule</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
