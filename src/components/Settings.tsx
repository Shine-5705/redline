import { useState } from 'react';
import { saveConfig, DEFAULT_CLOUD_MODEL, type RedlineConfig, type OnDeviceState, Engine } from '../lib/engine';
import { clearAll } from '../lib/store';

interface Props { config: RedlineConfig | null; onDevice: OnDeviceState; localOnly: boolean; setLocalOnly: (v: boolean) => void; refreshDevice: () => void }

const EXAMPLE = `{
  "firebase": { "apiKey": "…", "authDomain": "…", "projectId": "…", "appId": "…" },
  "appCheck": { "provider": "recaptcha-enterprise", "siteKey": "…" },
  "cloudModel": "${DEFAULT_CLOUD_MODEL}"
}`;

export function Settings({ config, onDevice, localOnly, setLocalOnly, refreshDevice }: Props) {
  const [text, setText] = useState(localStorage.getItem('redline.config') ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  function apply() {
    try {
      if (!text.trim()) { saveConfig(null); location.reload(); return; }
      const c = JSON.parse(text) as RedlineConfig;
      if (!c.firebase?.apiKey || !c.firebase?.appId || !c.firebase?.projectId) throw new Error('firebase.apiKey, projectId and appId are required');
      saveConfig(c); location.reload();
    } catch (e) { setMsg((e as Error).message); }
  }

  async function download() {
    setProgress(0);
    try { await Engine.downloadOnDevice((p) => setProgress(p)); refreshDevice(); }
    catch (e) { setMsg((e as Error).message); setProgress(null); }
  }

  return (
    <div className="page narrow">
      <header className="page-head"><div><div className="eyebrow">Settings</div><h1>Inference & privacy</h1></div></header>

      <section className="card section">
        <h3>Routing policy</h3>
        <label className="toggle"><input type="checkbox" checked={localOnly} onChange={(e) => setLocalOnly(e.target.checked)} /><span className="track"><span className="thumb" /></span>Local-only mode</label>
        <p className="muted small">When on, drafts use <code>ONLY_ON_DEVICE</code> and the cloud is never called. When off, drafts use <code>PREFER_ON_DEVICE</code> and fall back to the cloud. Learning from corrections is always on-device unless you opt in per correction.</p>
      </section>

      <section className="card section">
        <h3>On-device model</h3>
        <p>Chrome built-in model status: <b className="mono">{onDevice}</b></p>
        {onDevice === 'downloadable' && <button className="btn" onClick={download}>Download on-device model</button>}
        {progress !== null && <div className="bar"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        <p className="muted small">Needs desktop Chrome 139+ on supported hardware. If it says <span className="mono">unavailable</span> or <span className="mono">unsupported</span>, Redline drafts in the cloud and holds corrections on this device until you choose what to do.</p>
      </section>

      <section className="card section">
        <h3>Firebase project</h3>
        <p className="muted small">{config ? `Connected to ${config.firebase.projectId}. Cloud model: ${config.cloudModel || DEFAULT_CLOUD_MODEL}.` : 'Not connected. Cloud fallback is off; on-device inference still runs through the Firebase AI Logic SDK.'} Firebase web config values identify a project and are not secrets; App Check guards the AI endpoint. This is stored only in this browser.</p>
        <textarea className="editor mono" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} />
        <div className="row"><button className="btn btn-primary" onClick={apply}>Save & reload</button>{msg && <span className="error-inline">{msg}</span>}</div>
        <p className="muted small">Testing with an App Check debug token: open the app with <span className="mono">?appcheck_debug=&lt;token&gt;</span>.</p>
      </section>

      <section className="card section">
        <h3>Local data</h3>
        <p className="muted small">Corrections, rules and the ledger live in IndexedDB on this device.</p>
        <button className="btn btn-danger" onClick={async () => { await clearAll(); location.reload(); }}>Erase all local data</button>
      </section>
    </div>
  );
}
