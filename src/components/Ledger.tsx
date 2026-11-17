import { SourceBadge, Stat, Empty } from './ui';

type Data = ReturnType<typeof import('../lib/useStore').useData>;

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

export function Ledger({ data }: { data: Data }) {
  const L = data.ledger;
  const ok = L.filter((e) => e.source === 'on_device' || e.source === 'in_cloud');
  const dev = ok.filter((e) => e.source === 'on_device');
  const cloud = ok.filter((e) => e.source === 'in_cloud');
  const off = L.reduce((n, e) => n + e.charsOffDevice, 0);
  const red = L.reduce((n, e) => n + e.piiRedacted, 0);
  const leaked = ok.filter((e) => e.source === 'in_cloud').reduce((n, e) => n + e.piiInPrompt, 0);
  const corrections = data.corrections;
  const learnedOnDevice = data.rules.filter((r) => r.distilledBy === 'on_device').length;
  const chrono = [...corrections].sort((a, b) => a.createdAt - b.createdAt).map((c) => c.added + c.removed);
  const half = Math.floor(chrono.length / 2);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const early = chrono.length >= 2 ? avg(chrono.slice(0, half)) : null;
  const late = chrono.length >= 2 ? avg(chrono.slice(half)) : null;

  function exportCsv() {
    const head = 'time,feature,mode,source,model,latency_ms,prompt_chars,chars_off_device,pii_redacted,pii_in_prompt,note';
    const rows = L.map((e) => [new Date(e.at).toISOString(), e.feature, e.mode, e.source, e.model, e.latencyMs, e.promptChars, e.charsOffDevice, e.piiRedacted, e.piiInPrompt, (e.note ?? '').replace(/,/g, ';')].join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[head, ...rows].join('\n')], { type: 'text/csv' }));
    a.download = 'redline-privacy-ledger.csv'; a.click();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div><div className="eyebrow">Privacy ledger</div><h1>Where every inference ran</h1><p className="lede">Written by the app for every model call, from Firebase AI Logic’s <code>inferenceSource</code>. Counts are measured in this browser, not estimated.</p></div>
        <div className="head-actions"><button className="btn" disabled={!L.length} onClick={exportCsv}>Export CSV</button></div>
      </header>
      <div className="stats">
        <Stat label="Inferences" value={ok.length} hint={`${dev.length} on-device · ${cloud.length} cloud`} />
        <Stat label="Median latency" value={<>{median(dev.map((e) => e.latencyMs)) ?? '—'}<small> / </small>{median(cloud.map((e) => e.latencyMs)) ?? '—'}<small> ms</small></>} hint="on-device / cloud" />
        <Stat label="Chars that left the device" value={off.toLocaleString()} hint="placeholders only" />
        <Stat label="Identifiers redacted" value={red} hint={`${leaked} found in any cloud prompt`} />
        <Stat label="Words edited per reply" value={early === null ? '—' : <>{early}<small> → </small>{late}</>} hint={early === null ? 'needs 2+ sent replies' : `first ${half} vs last ${chrono.length - half} of ${chrono.length} replies · ${learnedOnDevice} rules learned on-device`} />
      </div>
      {L.length === 0 ? <Empty title="Nothing logged yet">Draft a reply in the Inbox and it will appear here.</Empty> : (
        <div className="table ledger">
          <div className="tr th"><div>Time</div><div>Feature</div><div>Requested mode</div><div>Ran</div><div>Model</div><div className="num">Latency</div><div className="num">Off-device</div><div className="num">PII in prompt</div></div>
          {L.map((e) => (
            <div className="tr" key={e.id} title={e.note}>
              <div className="mono">{new Date(e.at).toLocaleTimeString()}</div>
              <div>{e.feature}</div>
              <div className="mono small">{e.mode}</div>
              <div><SourceBadge source={e.source} /></div>
              <div className="small">{e.model}{e.note && <div className="muted small">{e.note}</div>}</div>
              <div className="num mono">{e.latencyMs ? `${e.latencyMs} ms` : '—'}</div>
              <div className="num mono">{e.charsOffDevice}</div>
              <div className="num mono">{e.piiInPrompt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
