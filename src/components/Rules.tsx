import { useState } from 'react';
import type { Rule } from '../lib/store';
import { detectPii } from '../lib/pii';
import { SourceBadge, Empty } from './ui';

type Data = ReturnType<typeof import('../lib/useStore').useData>;

export function Rules({ data }: { data: Data }) {
  const [promoting, setPromoting] = useState<Rule | null>(null);
  const [ack, setAck] = useState(false);
  const promoted = data.rules.filter((r) => r.promoted);

  function exportPlaybook() {
    const payload = { kind: 'redline.team-playbook', version: 1, exportedAt: new Date().toISOString(), rules: promoted.map((r) => ({ text: r.text, category: r.category })) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'redline-team-playbook.json'; a.click();
  }

  async function importPlaybook(file: File) {
    const j = JSON.parse(await file.text());
    if (j?.kind !== 'redline.team-playbook') return alert('Not a Redline playbook file');
    for (const r of j.rules as { text: string; category: Rule['category'] }[]) {
      if (data.rules.some((x) => x.text === r.text)) continue;
      await data.save('rules', { id: Math.random().toString(36).slice(2), text: r.text, category: r.category, createdAt: Date.now(), distilledBy: 'manual', active: true, promoted: true, uses: 0 } satisfies Rule);
    }
  }

  const piiInRule = promoting ? detectPii(promoting.text).length + (/\[[A-Z]+_\d+\]/.test(promoting.text) ? 1 : 0) : 0;

  return (
    <div className="page">
      <header className="page-head">
        <div><div className="eyebrow">Memory</div><h1>Learned rules</h1><p className="lede">Every rule came from a correction you made. They live in this browser’s IndexedDB. A rule leaves this device only when you promote it.</p></div>
        <div className="head-actions">
          <label className="btn">Import playbook<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importPlaybook(e.target.files[0])} /></label>
          <button className="btn btn-primary" disabled={!promoted.length} onClick={exportPlaybook}>Export team playbook ({promoted.length})</button>
        </div>
      </header>

      {data.rules.length === 0 ? (
        <Empty title="No rules yet">Draft a reply in the Inbox, edit it the way you really would, then choose Send & learn.</Empty>
      ) : (
        <div className="table">
          <div className="tr th"><div>Rule</div><div>Learned by</div><div>Used</div><div>Status</div><div /></div>
          {data.rules.map((r) => (
            <div className="tr" key={r.id}>
              <div><div className="rule-text">{r.text}</div><div className="muted small">{r.category} · {new Date(r.createdAt).toLocaleString()}</div></div>
              <div><SourceBadge source={r.distilledBy} /></div>
              <div className="num">{r.uses}</div>
              <div>
                <label className="toggle sm"><input type="checkbox" checked={r.active} onChange={(e) => data.save('rules', { ...r, active: e.target.checked })} /><span className="track"><span className="thumb" /></span>{r.active ? 'Active' : 'Off'}</label>
              </div>
              <div className="row-actions">
                {r.promoted ? <span className="tag tag-ok">In playbook</span> : <button className="btn btn-sm" onClick={() => { setPromoting(r); setAck(false); }}>Promote…</button>}
                <button className="btn btn-sm btn-ghost" onClick={() => data.remove('rules', r.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {promoting && (
        <div className="modal-bg" onClick={() => setPromoting(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Promote this rule to the team playbook?</h2>
            <p className="muted">Only the text below is added to the shareable playbook. The original ticket, your draft and your edit stay on this device.</p>
            <pre className="payload">{JSON.stringify({ text: promoting.text, category: promoting.category }, null, 2)}</pre>
            <div className={`check ${piiInRule ? 'bad' : 'good'}`}>{piiInRule ? `On-device re-scan found ${piiInRule} identifier(s). Edit the rule before promoting.` : 'On-device re-scan: 0 identifiers or placeholders in this payload.'}</div>
            <label className="ack"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I approve sharing this one rule.</label>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setPromoting(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!ack || piiInRule > 0} onClick={async () => { await data.save('rules', { ...promoting, promoted: true, promotedAt: Date.now() }); setPromoting(null); }}>Promote</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
