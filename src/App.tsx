import { useCallback, useEffect, useState } from 'react';
import { Engine, loadConfig, type OnDeviceState, type RedlineConfig } from './lib/engine';
import { useData } from './lib/useStore';
import { Inbox } from './components/Inbox';
import { Rules } from './components/Rules';
import { Ledger } from './components/Ledger';
import { Settings } from './components/Settings';
import { HowItWorks } from './components/HowItWorks';
import { Icon } from './components/ui';

type View = 'inbox' | 'rules' | 'ledger' | 'settings' | 'how';

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    addEventListener('online', a); addEventListener('offline', b);
    return () => { removeEventListener('online', a); removeEventListener('offline', b); };
  }, []);
  return on;
}

export default function App() {
  const [view, setView] = useState<View>(() => (location.hash.slice(2) as View) || 'how');
  const [config, setConfig] = useState<RedlineConfig | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [onDevice, setOnDevice] = useState<OnDeviceState>('unsupported');
  const [localOnly, setLocalOnlyState] = useState(() => localStorage.getItem('redline.localOnly') === '1');
  const [ready, setReady] = useState(false);
  const online = useOnline();
  const data = useData();

  const refreshDevice = useCallback(() => { Engine.onDeviceState().then(setOnDevice); }, []);
  useEffect(() => {
    (async () => {
      const c = await loadConfig();
      setConfig(c);
      try { setEngine(new Engine(c)); } catch (e) { console.error(e); }
      setOnDevice(await Engine.onDeviceState());
      setReady(true);
    })();
  }, []);
  useEffect(() => { if (location.hash !== `#/${view}`) location.hash = `/${view}`; }, [view]);
  useEffect(() => {
    const h = () => { const v = location.hash.slice(2) as View; if (v) setView(v); };
    addEventListener('hashchange', h); return () => removeEventListener('hashchange', h);
  }, []);
  const setLocalOnly = (v: boolean) => { setLocalOnlyState(v); localStorage.setItem('redline.localOnly', v ? '1' : '0'); };

  const go = (v: string) => setView(v as View);
  const nav: [View, string, React.ReactNode, number?][] = [
    ['how', 'How it works', Icon.spark],
    ['inbox', 'Inbox', Icon.inbox],
    ['rules', 'Learned rules', Icon.rules, data.rules.length],
    ['ledger', 'Privacy ledger', Icon.ledger, data.ledger.length],
    ['settings', 'Settings', Icon.settings],
  ];
  const cloudState = !config ? 'not connected' : !online ? 'offline' : localOnly ? 'off (local-only)' : 'ready';

  return (
    <div className="shell">
      <nav className="side">
        <div className="brand"><span className="logo"><span /></span>Redline<span className="beta">beta</span></div>
        <div className="workspace">PaisaPal Support · demo</div>
        <div className="nav">
          {nav.map(([id, label, icon, n]) => (
            <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
              {icon}<span>{label}</span>{!!n && <span className="nav-count">{n}</span>}
            </button>
          ))}
        </div>
        <div className="side-foot">
          <div className="runtime">
            <div className="rt-title">Runtime</div>
            <div className="rt-row">{Icon.chip}<span>On-device</span><span className={`pill ${onDevice === 'available' ? 'ok' : onDevice === 'downloadable' || onDevice === 'downloading' ? 'warn' : 'off'}`}>{onDevice}</span></div>
            <div className="rt-row">{Icon.cloud}<span>Cloud</span><span className={`pill ${cloudState === 'ready' ? 'ok' : 'off'}`}>{cloudState}</span></div>
            <div className="rt-row">{Icon.wifi}<span>Network</span><span className={`pill ${online ? 'ok' : 'warn'}`}>{online ? 'online' : 'offline'}</span></div>
          </div>
          <div className="powered">Inference via Firebase AI Logic</div>
        </div>
      </nav>
      <main className="main">
        {!ready ? <div className="loading"><span className="spinner" /> Starting…</div> :
          view === 'inbox' ? <Inbox engine={engine} onDevice={onDevice} online={online} localOnly={localOnly} data={data} /> :
          view === 'rules' ? <Rules data={data} /> :
          view === 'ledger' ? <Ledger data={data} /> :
          view === 'settings' ? <Settings config={config} onDevice={onDevice} localOnly={localOnly} setLocalOnly={setLocalOnly} refreshDevice={refreshDevice} /> :
          <HowItWorks go={go} />}
      </main>
    </div>
  );
}
