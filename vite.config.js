import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const devStockApi = {
  name: 'dev-stock-api',
  configureServer(server) {
    server.middlewares.use('/api/stock', async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const symbol = url.searchParams.get('symbol');
      if (!symbol) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'symbol required' }));
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
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ price, name }));
            return;
          }
        } catch {}
      }
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'fetch failed' }));
    });
  },
};

export default defineConfig({
  plugins: [react(), devStockApi],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})),
  },
})
