# Real end-to-end run against Firebase AI Logic (no mocks). Usage: python3 e2e/real_cloud_flow.py <url> <screenshot_dir>
# Needs an App Check debug token in ../.appcheck-debug-token (never committed) or a browser that passes reCAPTCHA Enterprise.
import asyncio, sys, json, re
from playwright.async_api import async_playwright
URL=sys.argv[1]; tok=open(__import__('os').environ.get('APPCHECK_TOKEN_FILE','../.appcheck-debug-token')).read().strip()
OUT={}
SH=sys.argv[2] if len(sys.argv)>2 else '/tmp'
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(channel='chrome')
    pg=await b.new_page(viewport={'width':1440,'height':900},device_scale_factor=2,timezone_id='Asia/Kolkata',locale='en-IN')
    reqs=[]
    pg.on('request',lambda r: reqs.append(r.post_data) if 'firebasevertexai' in r.url else None)
    await pg.goto(URL+'?appcheck_debug='+tok+'#/inbox'); await pg.wait_for_timeout(1500)
    await pg.click('button:has-text("Draft reply")'); await pg.wait_for_selector('.provenance', timeout=90000)
    await pg.wait_for_timeout(400); await pg.screenshot(path=SH+'/draft-cloud.png')
    OUT['prov1']=(await pg.inner_text('.provenance')).replace('\n',' ')
    d=await pg.input_value('.editor'); OUT['draft1']=d
    sents=re.split(r'(?<=[.!?])\s+|\n+', d)
    keep=[s for s in sents if s.strip() and not re.search(r'frustrat|apolog|understand|sorry|DISPUTE_ID', s, re.I)]
    greet=keep[0] if keep[0].lower().startswith(('hi','hello','dear')) else 'Hi Priya Raman,'
    rest=[s for s in keep if s!=greet]
    final=greet+'\n\nYour dispute ID is DSP-2291. '+' '.join(rest)
    await pg.fill('.editor', final); OUT['final1']=final
    await pg.click('text=Send & learn'); await pg.wait_for_selector('.held, .rule-born', timeout=30000)
    await pg.click('button:has-text("Opt in: learn in cloud")'); await pg.wait_for_selector('.rule-born, .error', timeout=90000)
    await pg.wait_for_timeout(400); await pg.locator('.learn').scroll_into_view_if_needed(); await pg.screenshot(path=SH+'/rule-learned.png')
    OUT['rule']=(await pg.inner_text('.learn')).replace('\n',' | ')
    await pg.click('text=Rohit Sharma'); await pg.wait_for_timeout(500)
    await pg.click('button:has-text("Draft reply")'); await pg.wait_for_selector('.provenance', timeout=90000)
    await pg.wait_for_timeout(400); await pg.screenshot(path=SH+'/rule-applied.png')
    OUT['prov2']=(await pg.inner_text('.provenance')).replace('\n',' ')
    OUT['draft2']=await pg.input_value('.editor')
    await pg.goto(URL+'?appcheck_debug='+tok+'#/ledger'); await pg.wait_for_timeout(800)
    await pg.screenshot(path=SH+'/ledger.png')
    OUT['ledger']=(await pg.inner_text('.page')).replace('\n',' | ')
    await pg.goto(URL+'?appcheck_debug='+tok+'#/rules'); await pg.wait_for_timeout(600); await pg.click('button:has-text("Promote")'); await pg.wait_for_timeout(400); await pg.screenshot(path=SH+'/promote.png')
    OUT['requests']=[json.loads(r)['contents'][0]['parts'][0]['text'] for r in reqs if r]
    raw=['priya.raman@okhdfcbank','98201 44718','Priya','Raman','Rohit','Sharma','50100234987612','HDFC0001234','9876543210']
    OUT['raw_in_requests']=[x for x in raw for t in OUT['requests'] if x in t]
    json.dump(OUT,open(SH+'/../realflow-result.json','w'),indent=1,ensure_ascii=False)
    for k,v in OUT.items():
      if k!='requests': print(k,':',v if isinstance(v,str) else v)
    print('n requests', len(OUT['requests']))
    await b.close()
asyncio.run(main())
