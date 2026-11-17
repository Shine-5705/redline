// All model inference in Redline goes through the Firebase AI Logic Web SDK (firebase/ai).
// On-device runs on Chrome's built-in model (Prompt API) via the SDK's hybrid adapter;
// cloud runs on the Gemini Developer API through Firebase, protected by App Check.

import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  Schema,
  type AI,
  type GenerativeModel,
} from 'firebase/ai';

export interface RedlineConfig {
  firebase: FirebaseOptions;
  appCheck?: { provider: 'recaptcha-enterprise' | 'recaptcha-v3'; siteKey: string };
  cloudModel?: string;
}

export type OnDeviceState = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported';
export type CloudState = 'ready' | 'not_configured';

export interface GenResult {
  text: string;
  source: 'on_device' | 'in_cloud';
  ms: number;
  model: string;
}

export const DEFAULT_CLOUD_MODEL = 'gemini-3.5-flash-lite';
const LS_KEY = 'redline.config';

declare global {
  interface Window { LanguageModel?: { availability: (o?: unknown) => Promise<string>; create: (o?: unknown) => Promise<unknown> }; FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }
}

export async function loadConfig(): Promise<RedlineConfig | null> {
  const local = localStorage.getItem(LS_KEY);
  if (local) { try { return JSON.parse(local); } catch { /* ignore */ } }
  try {
    const r = await fetch('./firebase-config.json', { cache: 'no-store' });
    if (r.ok) {
      const c = await r.json();
      if (c?.firebase?.apiKey && c?.firebase?.appId) return c;
    }
  } catch { /* not deployed with a config */ }
  return null;
}
export function saveConfig(c: RedlineConfig | null) {
  if (c) localStorage.setItem(LS_KEY, JSON.stringify(c)); else localStorage.removeItem(LS_KEY);
}

const LANG = [{ type: 'text', languages: ['en'] }];
const RULE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    rule: { type: 'string' },
    category: { type: 'string', enum: ['tone', 'policy', 'format', 'facts', 'other'] },
    generalizable: { type: 'boolean' },
  },
  required: ['rule', 'category', 'generalizable'],
};

export class Engine {
  app: FirebaseApp;
  ai: AI;
  cloud: CloudState;
  cloudModel: string;
  private hybrid: GenerativeModel;
  private deviceOnly: GenerativeModel;
  private cloudOnly: GenerativeModel | null;
  private deviceJson: GenerativeModel;
  private cloudJson: GenerativeModel | null;

  constructor(cfg: RedlineConfig | null) {
    this.cloud = cfg ? 'ready' : 'not_configured';
    this.cloudModel = cfg?.cloudModel || DEFAULT_CLOUD_MODEL;
    // Without a project config the SDK still runs ONLY_ON_DEVICE requests locally; nothing is sent anywhere.
    const existing = getApps().find((a) => a.name === 'redline');
    this.app = existing ?? initializeApp(cfg?.firebase ?? { apiKey: 'local-only', projectId: 'local-only', appId: 'local-only' }, 'redline');

    if (cfg?.appCheck?.siteKey && !existing) {
      const dbg = new URLSearchParams(location.search).get('appcheck_debug');
      if (dbg) window.FIREBASE_APPCHECK_DEBUG_TOKEN = dbg === 'true' ? true : dbg;
      const provider = cfg.appCheck.provider === 'recaptcha-v3'
        ? new ReCaptchaV3Provider(cfg.appCheck.siteKey)
        : new ReCaptchaEnterpriseProvider(cfg.appCheck.siteKey);
      initializeAppCheck(this.app, { provider, isTokenAutoRefreshEnabled: true });
    }

    this.ai = getAI(this.app, { backend: new GoogleAIBackend() });
    const onDeviceParams = { createOptions: { expectedInputs: LANG, expectedOutputs: LANG } } as never;
    const inCloudParams = { model: this.cloudModel, generationConfig: { temperature: 0.4, maxOutputTokens: 400 } };

    // Feature 1 — reply drafts: hybrid. Prompts only ever contain placeholders, so either path is safe.
    this.hybrid = getGenerativeModel(this.ai, {
      mode: cfg ? InferenceMode.PREFER_ON_DEVICE : InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams,
      inCloudParams,
    });
    this.deviceOnly = getGenerativeModel(this.ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams });
    this.cloudOnly = cfg ? getGenerativeModel(this.ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams }) : null;

    // Feature 2 — learning from corrections: ON-DEVICE ONLY by default. Cloud only after explicit opt-in.
    const ruleSchema = Schema.object({
      properties: {
        rule: Schema.string({ description: 'One reusable instruction for future replies, imperative, under 25 words, no customer-specific details.' }),
        category: Schema.enumString({ enum: ['tone', 'policy', 'format', 'facts', 'other'] }),
        generalizable: Schema.boolean({ description: 'false if the edit was a one-off fix that should not become a rule' }),
      },
    });
    this.deviceJson = getGenerativeModel(this.ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: { expectedInputs: LANG, expectedOutputs: LANG },
        // Chrome Prompt API structured output
        promptOptions: { responseConstraint: RULE_JSON_SCHEMA },
      } as never,
    });
    this.cloudJson = cfg
      ? getGenerativeModel(this.ai, {
          mode: InferenceMode.ONLY_IN_CLOUD,
          inCloudParams: { model: this.cloudModel, generationConfig: { responseMimeType: 'application/json', responseSchema: ruleSchema, temperature: 0.2 } },
        })
      : null;
  }

  static async onDeviceState(): Promise<OnDeviceState> {
    const LM = window.LanguageModel;
    if (!LM) return 'unsupported';
    try {
      const a = await LM.availability({ expectedInputs: LANG, expectedOutputs: LANG });
      return (['available', 'downloadable', 'downloading', 'unavailable'].includes(a) ? a : 'unavailable') as OnDeviceState;
    } catch {
      return 'unavailable';
    }
  }

  /** Starts the Chrome on-device model download (needs a user gesture). */
  static async downloadOnDevice(onProgress: (p: number) => void) {
    const LM = window.LanguageModel;
    if (!LM) throw new Error('Prompt API not supported in this browser');
    await LM.create({
      expectedInputs: LANG, expectedOutputs: LANG,
      monitor(m: EventTarget) { m.addEventListener('downloadprogress', (e) => onProgress((e as unknown as { loaded: number }).loaded)); },
    });
  }

  private async run(model: GenerativeModel, prompt: string, modelLabel: string): Promise<GenResult> {
    const t0 = performance.now();
    const res = await model.generateContent(prompt);
    const ms = Math.round(performance.now() - t0);
    const source = (res.response.inferenceSource as GenResult['source']) ?? 'in_cloud';
    return { text: res.response.text().trim(), source, ms, model: source === 'on_device' ? 'Gemini Nano (Chrome built-in)' : modelLabel };
  }

  draft(prompt: string, force?: 'device' | 'cloud') {
    if (force === 'device') return this.run(this.deviceOnly, prompt, this.cloudModel);
    if (force === 'cloud') {
      if (!this.cloudOnly) throw new Error('Cloud is not configured');
      return this.run(this.cloudOnly, prompt, this.cloudModel);
    }
    return this.run(this.hybrid, prompt, this.cloudModel);
  }

  async distill(prompt: string, where: 'device' | 'cloud') {
    const model = where === 'device' ? this.deviceJson : this.cloudJson;
    if (!model) throw new Error('Cloud is not configured');
    const p = where === 'device'
      ? `${prompt}\n\nRespond with ONLY a JSON object: {"rule": string, "category": "tone"|"policy"|"format"|"facts"|"other", "generalizable": boolean}`
      : prompt;
    const r = await this.run(model, p, this.cloudModel);
    const json = JSON.parse(r.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    return { ...r, parsed: json as { rule: string; category: string; generalizable: boolean } };
  }
}
