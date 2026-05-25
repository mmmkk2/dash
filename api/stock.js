export default async function handler(req, res) {
  const { symbol } = req.query;
  if (!symbol) {
    res.status(400).json({ error: 'symbol required' });
    return;
  }

  const isKR = symbol.endsWith('.KS') || symbol.endsWith('.KQ');
  const krCode = isKR ? symbol.replace(/\.(KS|KQ)$/, '') : null;

  // Start Naver fetch in parallel for KR stocks
  const naverPromise = krCode
    ? fetch(`https://m.stock.naver.com/api/stock/${krCode}/basic`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      }).then(r => r.ok ? r.json() : null).catch(() => null)
    : Promise.resolve(null);

  for (const host of ['query2', 'query1']) {
    try {
      const r = await fetch(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
      );
      if (!r.ok) continue;
      const data = await r.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) {
        const price = meta.regularMarketPrice ?? meta.previousClose ?? null;
        let name = meta.shortName ?? meta.longName ?? null;

        // Yahoo sometimes returns composite identifiers (e.g. "028300.KS,0P0000BZRU,123") — discard those
        if (name && (name.includes(',') || /^\d{5,6}\.(KS|KQ)/i.test(name))) name = null;

        if (krCode) {
          const naverData = await naverPromise;
          if (naverData?.stockName) name = naverData.stockName;
        }

        res.status(200).json({ price, name });
        return;
      }
    } catch {}
  }
  res.status(502).json({ error: 'fetch failed' });
}
