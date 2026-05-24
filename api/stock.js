export default async function handler(req, res) {
  const { symbol } = req.query;
  if (!symbol) {
    res.status(400).json({ error: 'symbol required' });
    return;
  }

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
        const name  = meta.shortName ?? meta.longName ?? null;
        res.status(200).json({ price, name });
        return;
      }
    } catch {}
  }
  res.status(502).json({ error: 'fetch failed' });
}
