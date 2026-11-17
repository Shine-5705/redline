import { useCallback, useEffect, useState } from 'react';
import { all, put, del, type Correction, type LedgerEntry, type Rule } from './store';

export function useData() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const refresh = useCallback(async () => {
    const [r, c, l] = await Promise.all([all<Rule>('rules'), all<Correction>('corrections'), all<LedgerEntry>('ledger')]);
    setRules(r.sort((a, b) => b.createdAt - a.createdAt));
    setCorrections(c.sort((a, b) => b.createdAt - a.createdAt));
    setLedger(l.sort((a, b) => b.at - a.at));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const save = useCallback(async (store: 'rules' | 'corrections' | 'ledger', v: unknown) => { await put(store, v); await refresh(); }, [refresh]);
  const remove = useCallback(async (store: 'rules' | 'corrections' | 'ledger', id: string) => { await del(store, id); await refresh(); }, [refresh]);
  return { rules, corrections, ledger, refresh, save, remove };
}
