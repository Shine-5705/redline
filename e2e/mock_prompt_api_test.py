"""End-to-end test of Redline's on-device path with a MOCKED Chrome Prompt API.

This only checks wiring: that Redline -> Firebase AI Logic SDK (ONLY_ON_DEVICE / PREFER_ON_DEVICE)
-> window.LanguageModel is called, that prompts contain placeholders only, and that the UI,
rules and ledger behave. The model replies here are canned. It is NOT a quality benchmark
and none of its output is used in the demo video.
Run: npx vite preview --port 4173  then  python3 e2e/mock_prompt_api_test.py
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
MOCK = r"""
window.__prompts = [];
window.LanguageModel = {
  availability: async () => 'available',
  create: async (opts) => ({
    prompt: async (msgs, popts) => {
      const text = msgs.map(m => m.content.map(c => c.value).join('')).join('\n');
      window.__prompts.push(text);
      if (popts && popts.responseConstraint) return JSON.stringify({rule: 'Give the dispute ID and a 48-hour timeline instead of promising a same-day refund.', category: 'policy', generalizable: true});
      return 'Hi [NAME_1], sorry about the failed payment from [UPI_1]. We will refund you today. PaisaPal Support';
    },
    promptStreaming: () => { throw new Error('not used'); },
    destroy() {},
  }),
};
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome')
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        await ctx.add_init_script(MOCK)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL + '#/inbox'); await pg.wait_for_timeout(800)
        assert await pg.inner_text('.rt-row >> nth=0') and 'available' in await pg.inner_text('.runtime')
        await pg.click('text=Draft reply'); await pg.wait_for_selector('.provenance')
        prov = await pg.inner_text('.provenance'); print('provenance:', prov.replace('\n', ' '))
        assert 'On-device' in prov and 'Nothing left this device' in prov
        reply = await pg.input_value('.editor'); print('rehydrated reply:', reply)
        assert 'priya.raman@okhdfcbank' in reply  # placeholder rehydrated locally
        await pg.fill('.editor', reply.replace('We will refund you today.', 'I have raised dispute DSP-2291; the amount should reverse within 48 hours.'))
        await pg.click('text=Send & learn'); await pg.wait_for_selector('.rule-born')
        print('rule:', (await pg.inner_text('.rule-born')).replace('\n', ' '))
        prompts = await pg.evaluate('window.__prompts')
        for t in prompts:
            for raw in ['priya.raman@okhdfcbank', '98201 44718', 'Priya']:
                assert raw not in t, f'raw identifier {raw} reached a prompt'
        print('prompts sent to model:', len(prompts), '- raw identifiers in any prompt: 0')
        await pg.goto(URL + '#/ledger'); await pg.wait_for_timeout(500)
        rows = await pg.locator('.ledger .tr:not(.th)').count(); print('ledger rows:', rows)
        assert rows == 2
        await pg.goto(URL + '#/rules'); await pg.wait_for_timeout(300)
        assert await pg.locator('.table .tr:not(.th)').count() == 1
        assert not errs, errs
        print('PASS')
        await b.close()
asyncio.run(main())
