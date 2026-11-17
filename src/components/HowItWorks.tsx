export function HowItWorks({ go }: { go: (v: string) => void }) {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">How Redline works</div>
          <h1>Your edits teach the AI. They don’t leave your laptop.</h1>
          <p className="lede">Support agents fix AI drafts all day. Those fixes are the best training signal a team has, and they’re full of customer data. Redline captures each correction in the browser, turns it into a reusable rule with the on-device model, and only lets anything reach the cloud when you say so.</p>
        </div>
        <div className="head-actions"><button className="btn btn-primary" onClick={() => go('inbox')}>Open the inbox</button></div>
      </header>

      <div className="flow">
        <div className="flow-step">
          <div className="flow-n">1</div>
          <h3>Redact on-device</h3>
          <p>A deterministic detector finds Aadhaar (Verhoeff-checked), PAN, UPI IDs, cards (Luhn-checked), IFSC, phones, emails and the customer’s name, and swaps them for placeholders before any prompt is built.</p>
          <code>[AADHAAR_1] · [UPI_1] · [NAME_1]</code>
        </div>
        <div className="flow-step">
          <div className="flow-n">2</div>
          <h3>Draft, hybrid</h3>
          <p>Firebase AI Logic with <code>PREFER_ON_DEVICE</code>: Gemini Nano in Chrome when it’s available, the cloud Gemini model when it isn’t. Every draft shows which path ran, from <code>inferenceSource</code>.</p>
          <code>ON_DEVICE · IN_CLOUD</code>
        </div>
        <div className="flow-step">
          <div className="flow-n">3</div>
          <h3>Learn, on-device only</h3>
          <p>When you edit and send, the word-level diff is distilled into one rule by <code>ONLY_ON_DEVICE</code> with structured JSON output. No on-device model? The correction is held locally until you opt in.</p>
          <code>ONLY_ON_DEVICE → {'{'} rule, category {'}'}</code>
        </div>
        <div className="flow-step">
          <div className="flow-n">4</div>
          <h3>Promote by choice</h3>
          <p>Rules shape the next draft right away. To share one with the team, you approve the exact payload after an on-device re-scan for identifiers. The ledger records every call.</p>
          <code>opt-in · per rule · audited</code>
        </div>
      </div>

      <div className="card arch">
        <div className="arch-col">
          <div className="arch-title">This browser</div>
          <div className="arch-box">Ticket + customer identifiers</div>
          <div className="arch-box accent">PII vault · redact / rehydrate</div>
          <div className="arch-box">Gemini Nano via Prompt API</div>
          <div className="arch-box">IndexedDB · corrections · rules · ledger</div>
        </div>
        <div className="arch-mid">
          <div className="arch-line"><span>placeholders only</span></div>
          <div className="arch-line"><span>opt-in, one diff</span></div>
        </div>
        <div className="arch-col">
          <div className="arch-title">Firebase</div>
          <div className="arch-box">App Check (reCAPTCHA Enterprise)</div>
          <div className="arch-box accent">Firebase AI Logic · Gemini Developer API</div>
          <div className="arch-box">gemini-3.5-flash-lite (fallback)</div>
        </div>
      </div>
    </div>
  );
}
