import { useState, useMemo, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronUp, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ASSET_KEY  = "my_assets_v2";
const STOCK_KEY  = "my_stocks_v1";
const CAT_KEY    = "my_asset_cats_v1";

const _fl = document.createElement("link");
_fl.rel = "stylesheet";
_fl.href = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap";
document.head.appendChild(_fl);

const fmt  = n => n.toLocaleString("ko-KR") + "원";
const fmtS = n => {
  if (n >= 1e8) return (n / 1e8).toFixed(1) + "억";
  if (n >= 1e4) return Math.round(n / 1e4) + "만";
  return n.toLocaleString("ko-KR");
};
const fmtPrice = (n, currency) =>
  currency === "USD"
    ? "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString("ko-KR") + "원";

const DEFAULT_CATS = [
  { key: "주식",      color: "#2d6a4f" },
  { key: "달러/외화", color: "#1d4e89" },
  { key: "부동산",    color: "#b5451b" },
  { key: "예금/적금", color: "#0077b6" },
  { key: "가상화폐",  color: "#7b2d00" },
  { key: "기타",      color: "#6b5c4e" },
];
const CAT_COLORS = ["#2d6a4f","#1d4e89","#b5451b","#0077b6","#7b2d00","#4a1942","#831843","#6b5c4e","#374151"];

const C = {
  bg: "#f5f0e8", paper: "#faf8f4", white: "#ffffff",
  ink: "#1a1410", inkMid: "#4a3f35", inkLight: "#9c8e82",
  border: "#e8e0d4", cream: "#f5f0e8",
  header: "linear-gradient(160deg,#1a3258 0%,#234080 50%,#2a4e96 100%)",
};
const F = "'Inter',sans-serif";

/* ── Yahoo Finance price fetch ── */
async function fetchYahoo(symbol) {
  // query2 has more permissive CORS headers than query1
  for (const host of ["query2", "query1"]) {
    try {
      const res = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`);
      if (!res.ok) continue;
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) return meta.regularMarketPrice ?? meta.previousClose ?? null;
    } catch {}
  }
  throw new Error("fetch failed");
}

async function fetchStockPrice(ticker, market) {
  const sym = market === "KR" ? `${ticker}.KS` : ticker.toUpperCase();
  return fetchYahoo(sym);
}

async function fetchUSDKRW() {
  // open.er-api.com: free, no key, CORS-enabled
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (res.ok) {
      const data = await res.json();
      const krw = data?.rates?.KRW;
      if (krw) return krw;
    }
  } catch {}
  // fallback to Yahoo Finance
  return fetchYahoo("USDKRW=X");
}

/* ── Storage ── */
function load(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

/* ── DB field mapping ── */
const toDbStock   = s => ({ id: s.id, ticker: s.ticker, name: s.name, market: s.market, shares: s.shares, avg_price: s.avgPrice, current_price: s.currentPrice ?? null, last_fetched: s.lastFetched ?? null, purchase_date: s.purchaseDate ?? null });
const fromDbStock = s => ({ id: s.id, ticker: s.ticker, name: s.name, market: s.market, shares: Number(s.shares), avgPrice: Number(s.avg_price), currentPrice: s.current_price != null ? Number(s.current_price) : null, lastFetched: s.last_fetched ?? null, purchaseDate: s.purchase_date ?? null });
const toDbAsset   = a => ({ id: a.id, name: a.name, cat: a.cat, amount: a.amount, memo: a.memo || "", date: a.date });
const fromDbAsset = a => ({ id: a.id, name: a.name, cat: a.cat, amount: Number(a.amount), memo: a.memo || "", date: a.date });

function isConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON && !SUPABASE_ANON.includes("여기에"));
}

async function sb(path, opts = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, "Content-Type": "application/json", Prefer: opts.prefer || "" },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json().catch(() => null);
}

/* ── UI helpers ── */
function SLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: C.inkLight, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7, fontFamily: F }}>{children}</div>;
}

function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: "24px 24px 0 0", padding: "8px 20px 36px", width: "100%", maxWidth: 660, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: "10px auto 18px", cursor: "pointer" }} onClick={onClose} />
        {children}
      </div>
    </div>
  );
}

/* ── Stock Form ── */
function StockForm({ initial, onSave, onDelete, saving }) {
  const init = initial || {};
  const [ticker,       setTicker]       = useState(init.ticker       || "");
  const [name,         setName]         = useState(init.name         || "");
  const [market,       setMarket]       = useState(init.market       || "KR");
  const [shares,       setShares]       = useState(init.shares       ? String(init.shares) : "");
  const [avgPrice,     setAvgPrice]     = useState(init.avgPrice     ? Number(init.avgPrice).toLocaleString(market === "US" ? "en-US" : "ko-KR") : "");
  const [purchaseDate, setPurchaseDate] = useState(init.purchaseDate || "");
  const [err, setErr] = useState(false);
  const isEdit = !!initial;

  function submit() {
    const sh = parseFloat(String(shares).replace(/,/g, ""));
    const ap = parseFloat(String(avgPrice).replace(/,/g, ""));
    if (!ticker.trim() || !sh || sh <= 0 || !ap || ap <= 0) {
      setErr(true); setTimeout(() => setErr(false), 400); return;
    }
    onSave({ id: init.id || Date.now(), ticker: ticker.trim().toUpperCase(), name: name.trim() || ticker.trim().toUpperCase(), market, shares: sh, avgPrice: ap, currentPrice: init.currentPrice || null, lastFetched: init.lastFetched || null });
  }

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{isEdit ? "종목 수정" : "종목 추가"}</span>
        {isEdit && <button onClick={onDelete} style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff1ee", border: "1px solid #f4c5b2", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#b5451b", fontSize: 12, fontWeight: 600 }}><Trash2 size={13} /> 삭제</button>}
      </div>

      {/* Market */}
      <div style={{ marginBottom: 12 }}>
        <SLabel>시장</SLabel>
        <div style={{ display: "flex", gap: 8 }}>
          {[["KR", "🇰🇷 한국"], ["US", "🇺🇸 미국"]].map(([m, l]) => {
            const sel = market === m;
            return <button key={m} onClick={() => setMarket(m)} style={{ flex: 1, padding: "8px", borderRadius: 10, border: `1.5px solid ${sel ? "#1d4e89" : C.border}`, background: sel ? "#1d4e89" : C.white, color: sel ? "#fff" : C.inkMid, fontFamily: F, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{l}</button>;
          })}
        </div>
      </div>

      {/* Ticker + Name */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 12 }}>
        <div>
          <SLabel>티커</SLabel>
          <input value={ticker} onChange={e => setTicker(e.target.value)} placeholder={market === "KR" ? "005930" : "AAPL"}
            style={{ width: "100%", border: `1.5px solid ${err && !ticker.trim() ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", textTransform: "uppercase" }} />
        </div>
        <div>
          <SLabel>종목명</SLabel>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={market === "KR" ? "삼성전자" : "Apple Inc."}
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
      </div>

      {/* Shares + AvgPrice */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        <div>
          <SLabel>보유수량</SLabel>
          <input type="text" inputMode="decimal" value={shares} onChange={e => setShares(e.target.value)} placeholder="0"
            style={{ width: "100%", border: `1.5px solid ${err && !parseFloat(shares) ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 15, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", fontVariantNumeric: "tabular-nums" }} />
        </div>
        <div>
          <SLabel>평균단가 ({market === "US" ? "USD" : "KRW"})</SLabel>
          <input type="text" inputMode="decimal" value={avgPrice}
            onChange={e => { const raw = e.target.value.replace(/[^0-9.]/g, ""); setAvgPrice(raw); }}
            placeholder={market === "US" ? "150.00" : "70,000"}
            style={{ width: "100%", border: `1.5px solid ${err && !parseFloat(String(avgPrice).replace(/,/g,"")) ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 15, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", fontVariantNumeric: "tabular-nums" }} />
        </div>
      </div>

      <button onClick={submit} disabled={saving} style={{
        width: "100%", padding: 13, borderRadius: 12, border: "none",
        background: "#2d6a4f", color: "#fff", fontSize: 15, fontWeight: 700,
        cursor: saving ? "not-allowed" : "pointer", fontFamily: F,
        boxShadow: "0 4px 18px #2d6a4f55", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        {saving ? "저장 중…" : isEdit ? <><Check size={16} /> 저장</> : <><Plus size={16} /> 추가</>}
      </button>
    </div>
  );
}

/* ── Asset Form ── */
function AssetForm({ initial, cats, onSave, onDelete, saving }) {
  const init = initial || {};
  const [name,   setName]   = useState(init.name   || "");
  const [cat,    setCat]    = useState(init.cat     || cats.find(c => c.key !== "주식")?.key || "기타");
  const [amount, setAmount] = useState(init.amount  ? Number(init.amount).toLocaleString("ko-KR") : "");
  const [memo,   setMemo]   = useState(init.memo    || "");
  const [date,   setDate]   = useState(init.date    || new Date().toISOString().slice(0, 10));
  const [err,    setErr]    = useState(false);
  const isEdit = !!initial;

  const nonStockCats = cats.filter(c => c.key !== "주식");

  function submit() {
    const num = parseInt(String(amount).replace(/,/g, ""));
    if (!name.trim() || !num || num <= 0) { setErr(true); setTimeout(() => setErr(false), 400); return; }
    onSave({ id: init.id || Date.now(), name: name.trim(), cat, amount: num, memo: memo.trim(), date });
  }

  const catObj = cats.find(c => c.key === cat) || { color: C.inkMid };

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{isEdit ? "자산 수정" : "자산 추가"}</span>
        {isEdit && <button onClick={onDelete} style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff1ee", border: "1px solid #f4c5b2", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#b5451b", fontSize: 12, fontWeight: 600 }}><Trash2 size={13} /> 삭제</button>}
      </div>

      <div style={{ marginBottom: 12 }}>
        <SLabel>분류</SLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {nonStockCats.map(c => {
            const sel = cat === c.key;
            return <button key={c.key} onClick={() => setCat(c.key)} style={{ padding: "6px 14px", borderRadius: 99, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1.5px solid ${sel ? c.color : C.border}`, background: sel ? c.color : C.white, color: sel ? "#fff" : C.inkMid, fontFamily: F, boxShadow: sel ? `0 2px 8px ${c.color}44` : "none" }}>{c.key}</button>;
          })}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <SLabel>자산명</SLabel>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="예: KB 정기예금, 강남 오피스텔"
          style={{ width: "100%", border: `1.5px solid ${err && !name.trim() ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <SLabel>현재 평가액</SLabel>
        <div style={{ display: "flex", alignItems: "center", background: err && !parseInt(String(amount).replace(/,/g,"")) ? "#fff5f0" : C.white, border: `1.5px solid ${err && !parseInt(String(amount).replace(/,/g,"")) ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "0 14px" }}>
          <span style={{ color: C.inkLight, fontSize: 16, marginRight: 8 }}>₩</span>
          <input type="text" inputMode="numeric" value={amount}
            onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ""); setAmount(raw ? Number(raw).toLocaleString("ko-KR") : raw); }}
            placeholder="0"
            style={{ flex: 1, border: "none", background: "transparent", fontSize: 20, fontWeight: 700, color: C.ink, padding: "10px 0", outline: "none", fontFamily: F, fontVariantNumeric: "tabular-nums" }} />
          <span style={{ color: C.inkLight, fontSize: 13 }}>원</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
        <div>
          <SLabel>메모</SLabel>
          <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="선택사항"
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
        <div>
          <SLabel>기준일</SLabel>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
      </div>

      <button onClick={submit} disabled={saving} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: catObj.color, color: "#fff", fontSize: 15, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: F, boxShadow: `0 4px 18px ${catObj.color}55`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {saving ? "저장 중…" : isEdit ? <><Check size={16} /> 저장</> : <><Plus size={16} /> 추가</>}
      </button>
    </div>
  );
}

/* ── Cat Settings ── */
function CatSettings({ cats, onChange }) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(CAT_COLORS[0]);

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 18 }}>분류 관리</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 18 }}>
        {cats.map(c => (
          <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10, background: C.paper, borderRadius: 10, padding: "9px 14px", border: `1px solid ${C.border}` }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.ink }}>{c.key}</div>
            {c.key !== "주식" && !DEFAULT_CATS.find(d => d.key === c.key) && (
              <button onClick={() => onChange(cats.filter(x => x.key !== c.key))} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkLight, display: "flex" }}><X size={14} /></button>
            )}
          </div>
        ))}
      </div>
      <SLabel>새 분류 추가</SLabel>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="분류명" style={{ flex: 1, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", fontFamily: F, color: C.ink }} />
        <button onClick={() => { const n = newName.trim(); if (!n || cats.find(c => c.key === n)) return; onChange([...cats, { key: n, color: newColor }]); setNewName(""); }} style={{ background: C.ink, border: "none", borderRadius: 8, padding: "8px 14px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><Plus size={14} /></button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {CAT_COLORS.map(col => <button key={col} onClick={() => setNewColor(col)} style={{ width: 26, height: 26, borderRadius: "50%", background: col, border: newColor === col ? "3px solid #1a1410" : "2px solid transparent", cursor: "pointer" }} />)}
      </div>
    </div>
  );
}

/* ── Main ── */
export default function AssetsApp() {
  const [assets,  setAssets]  = useState(() => load(ASSET_KEY, []));
  const [stocks,  setStocks]  = useState(() => load(STOCK_KEY, []));
  const [cats,    setCats]    = useState(() => load(CAT_KEY, DEFAULT_CATS));
  const [usdKrw,  setUsdKrw]  = useState(() => load("my_usdkrw", null));
  const [prices,  setPrices]  = useState({});   // { [id]: currentPrice }
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState(0);
  const [lastSync, setLastSync] = useState(() => load("my_stocks_lastsync", null));
  const [modal,   setModal]   = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [tab,     setTab]     = useState("stock");  // "stock" | "asset"
  const [saving,  setSaving]  = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => { save(ASSET_KEY, assets); }, [assets]);
  useEffect(() => { save(STOCK_KEY, stocks); }, [stocks]);
  useEffect(() => { save(CAT_KEY, cats); }, [cats]);

  /* ── Supabase: initial load ── */
  useEffect(() => {
    if (!isConfigured()) return;
    Promise.all([
      sb("assets?select=*&order=id"),
      sb("stocks?select=*&order=id"),
      sb("settings?select=*&key=eq.cats"),
    ]).then(([dbAssets, dbStocks, dbSettings]) => {
      if (dbAssets !== null) setAssets(dbAssets.map(fromDbAsset));
      if (dbStocks !== null) setStocks(dbStocks.map(fromDbStock));
      const dbCats = dbSettings?.[0]?.value;
      if (dbCats?.length) setCats(dbCats);
    }).catch(() => {});
  }, []);

  /* ── Price refresh ── */
  const refreshPrices = useCallback(async () => {
    if (!stocks.length) return;
    setFetching(true);
    setFetchErr(0);
    const newPrices = {};
    let rate = usdKrw;

    try { rate = await fetchUSDKRW(); setUsdKrw(rate); save("my_usdkrw", rate); } catch {}

    const results = await Promise.allSettled(
      stocks.map(async s => {
        const p = await fetchStockPrice(s.ticker, s.market);
        if (p) newPrices[s.id] = p;
      })
    );
    const errCount = results.filter(r => r.status === "rejected").length;
    setFetchErr(errCount);
    setPrices(prev => ({ ...prev, ...newPrices }));
    setStocks(prev => prev.map(s => newPrices[s.id] != null ? { ...s, currentPrice: newPrices[s.id], lastFetched: new Date().toISOString() } : s));
    if (isConfigured()) {
      const ts = new Date().toISOString();
      Object.entries(newPrices).forEach(([id, p]) =>
        sb(`stocks?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ current_price: p, last_fetched: ts }) }).catch(() => {})
      );
    }
    const now = new Date().toLocaleString("ko-KR");
    setLastSync(now); save("my_stocks_lastsync", now);
    setFetching(false);
  }, [stocks, usdKrw]);

  useEffect(() => {
    const saved = {};
    stocks.forEach(s => { if (s.currentPrice) saved[s.id] = s.currentPrice; });
    setPrices(saved);
  }, []);

  /* ── Stock value calc ── */
  const rate = usdKrw || 1380;
  const stockValue = useMemo(() =>
    stocks.reduce((sum, s) => {
      const p = prices[s.id] ?? s.currentPrice ?? s.avgPrice;
      const val = p * s.shares;
      return sum + (s.market === "US" ? Math.round(val * rate) : val);
    }, 0), [stocks, prices, rate]);

  const stockCost = useMemo(() =>
    stocks.reduce((sum, s) => {
      const val = s.avgPrice * s.shares;
      return sum + (s.market === "US" ? Math.round(val * rate) : val);
    }, 0), [stocks, rate]);

  const stockGain = stockValue - stockCost;
  const stockGainPct = stockCost > 0 ? ((stockGain / stockCost) * 100).toFixed(2) : "0.00";

  const assetTotal = useMemo(() => assets.reduce((s, a) => s + a.amount, 0), [assets]);
  const total = stockValue + assetTotal;

  /* ── Pie data ── */
  const pieData = useMemo(() => {
    const m = {};
    if (stockValue > 0) m["주식"] = (m["주식"] || 0) + stockValue;
    assets.forEach(a => { m[a.cat] = (m[a.cat] || 0) + a.amount; });
    return cats.filter(c => m[c.key] > 0)
      .map(c => ({ name: c.key, value: m[c.key], color: c.color }))
      .sort((a, b) => b.value - a.value);
  }, [assets, stockValue, cats]);

  /* ── CRUD: stocks ── */
  function addStock(s)    { setStocks(p => [...p, s]); setModal(null); if (isConfigured()) sb("stocks", { method: "POST", body: JSON.stringify(toDbStock(s)) }).catch(() => {}); }
  function updateStock(s) { setStocks(p => p.map(x => x.id === s.id ? s : x)); setModal(null); setEditItem(null); if (isConfigured()) sb(`stocks?id=eq.${s.id}`, { method: "PATCH", body: JSON.stringify(toDbStock(s)) }).catch(() => {}); }
  function deleteStock(id){ setStocks(p => p.filter(x => x.id !== id)); setModal(null); setEditItem(null); if (isConfigured()) sb(`stocks?id=eq.${id}`, { method: "DELETE" }).catch(() => {}); }

  /* ── CRUD: assets ── */
  function addAsset(a)    { setAssets(p => [...p, a]); setModal(null); if (isConfigured()) sb("assets", { method: "POST", body: JSON.stringify(toDbAsset(a)) }).catch(() => {}); }
  function updateAsset(a) { setAssets(p => p.map(x => x.id === a.id ? a : x)); setModal(null); setEditItem(null); if (isConfigured()) sb(`assets?id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify(toDbAsset(a)) }).catch(() => {}); }
  function deleteAsset(id){ setAssets(p => p.filter(x => x.id !== id)); setModal(null); setEditItem(null); if (isConfigured()) sb(`assets?id=eq.${id}`, { method: "DELETE" }).catch(() => {}); }

  const catColor = key => cats.find(c => c.key === key)?.color || C.inkMid;
  const tt = { background: C.paper, border: `1px solid ${C.border}`, borderRadius: 10, fontFamily: F, fontSize: 12 };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, paddingBottom: 80, fontFamily: F }}>

      {/* Header */}
      <div style={{ background: C.header, color: "#fff", paddingBottom: 28 }}>
        <div style={{ maxWidth: 660, margin: "0 auto", padding: "28px 20px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.35, letterSpacing: "0.2em", marginBottom: 4 }}>NET WORTH</div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" }}>내 자산</div>
            </div>
            <button onClick={() => setModal("cats")} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "7px 12px", color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>분류 관리</button>
          </div>

          {/* Total */}
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 18, padding: "18px 20px", border: "1px solid rgba(255,255,255,0.12)", marginBottom: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.4, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>총 자산</div>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-1px", fontVariantNumeric: "tabular-nums" }}>
              {fmtS(total)}<span style={{ fontSize: 14, fontWeight: 400, opacity: 0.5, marginLeft: 4 }}>원</span>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
              <div style={{ fontSize: 11, opacity: 0.5 }}>주식 {fmtS(stockValue)}</div>
              <div style={{ fontSize: 11, opacity: 0.5 }}>기타자산 {fmtS(assetTotal)}</div>
            </div>
          </div>

          {/* Exchange rate + sync */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 11, opacity: 0.45 }}>
              USD/KRW {rate.toLocaleString("ko-KR")}원
              {lastSync && <span style={{ marginLeft: 8 }}>· {lastSync} 기준</span>}
              {fetchErr > 0 && <span style={{ marginLeft: 8, color: "#f4a261", opacity: 1 }}>· {fetchErr}종목 조회 실패</span>}
            </div>
            <button onClick={refreshPrices} disabled={fetching} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 11, fontWeight: 600, cursor: fetching ? "not-allowed" : "pointer" }}>
              <RefreshCw size={12} className={fetching ? "spin" : ""} />
              {fetching ? "조회 중…" : "시세 갱신"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 660, margin: "0 auto", padding: "0 14px" }}>

        {/* Donut */}
        {pieData.length > 0 && (
          <div style={{ background: C.white, borderRadius: "0 0 20px 20px", padding: "16px 18px 10px", border: `1px solid ${C.border}`, borderTop: "none", marginBottom: 14 }}>
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={38} outerRadius={56} paddingAngle={3}>
                  {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={v => [fmt(v)]} contentStyle={tt} />
                <Legend iconType="circle" iconSize={7} formatter={v => <span style={{ fontSize: 10, color: C.inkMid, fontFamily: F }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Tab */}
        <div style={{ display: "flex", background: C.white, borderRadius: 10, padding: 3, border: `1px solid ${C.border}`, gap: 3, marginBottom: 14 }}>
          {[["stock", "📈 주식"], ["asset", "🏦 기타자산"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "8px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: tab === k ? 700 : 400, fontSize: 13, background: tab === k ? C.ink : "transparent", color: tab === k ? "#fff" : C.inkLight, fontFamily: F, transition: "all 0.15s" }}>{l}</button>
          ))}
        </div>

        {/* ── Stock Tab ── */}
        {tab === "stock" && (
          <>
            {/* Stock summary */}
            {stocks.length > 0 && (
              <div style={{ background: C.white, borderRadius: 14, padding: "14px 16px", border: `1px solid ${C.border}`, marginBottom: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { label: "평가금액", val: fmtS(stockValue), color: "#2d6a4f" },
                    { label: "수익금", val: (stockGain >= 0 ? "+" : "") + fmtS(stockGain), color: stockGain >= 0 ? "#2d6a4f" : "#b5451b" },
                    { label: "수익률", val: (stockGain >= 0 ? "+" : "") + stockGainPct + "%", color: stockGain >= 0 ? "#2d6a4f" : "#b5451b" },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.inkLight, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stock list */}
            {stocks.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", background: C.white, borderRadius: 16, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.inkMid, marginBottom: 6 }}>보유 종목을 추가해보세요</div>
                <div style={{ fontSize: 12, color: C.inkLight }}>한국·미국 주식 모두 지원</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {stocks.map(s => {
                  const p = prices[s.id] ?? s.currentPrice;
                  const hasPrice = p != null;
                  const valueKrw = hasPrice ? (s.market === "US" ? Math.round(p * s.shares * rate) : p * s.shares) : null;
                  const costKrw  = s.market === "US" ? Math.round(s.avgPrice * s.shares * rate) : s.avgPrice * s.shares;
                  const gainKrw  = valueKrw != null ? valueKrw - costKrw : null;
                  const gainPct  = gainKrw != null && costKrw > 0 ? ((gainKrw / costKrw) * 100).toFixed(2) : null;
                  const isPos    = gainKrw != null && gainKrw >= 0;
                  const isOpen   = expanded === s.id;

                  return (
                    <div key={s.id} style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                      <button onClick={() => setExpanded(isOpen ? null : s.id)} style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
                        {/* Market badge */}
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: "#2d6a4f18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: 16 }}>{s.market === "KR" ? "🇰🇷" : "🇺🇸"}</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{s.name}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: C.inkLight, background: C.cream, borderRadius: 4, padding: "1px 5px" }}>{s.ticker}</span>
                          </div>
                          <div style={{ fontSize: 11, color: C.inkLight }}>
                            {s.shares}주 · 평균단가 {fmtPrice(s.avgPrice, s.market === "US" ? "USD" : "KRW")}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                            {valueKrw != null ? fmtS(valueKrw) : "—"}
                          </div>
                          {gainPct != null && (
                            <div style={{ fontSize: 11, fontWeight: 600, color: isPos ? "#2d6a4f" : "#b5451b", display: "flex", alignItems: "center", gap: 2, justifyContent: "flex-end" }}>
                              {isPos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                              {isPos ? "+" : ""}{gainPct}%
                            </div>
                          )}
                        </div>
                        {isOpen ? <ChevronUp size={13} color={C.inkLight} /> : <ChevronDown size={13} color={C.inkLight} />}
                      </button>

                      {isOpen && (
                        <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px", background: C.paper }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
                            {[
                              { label: "현재가", val: hasPrice ? fmtPrice(p, s.market === "US" ? "USD" : "KRW") : "미조회" },
                              { label: "수익금(원)", val: gainKrw != null ? (gainKrw >= 0 ? "+" : "") + fmtS(gainKrw) : "—" },
                              { label: "원화평가", val: valueKrw != null ? fmtS(valueKrw) : "—" },
                            ].map(({ label, val }) => (
                              <div key={label} style={{ textAlign: "center", background: C.white, borderRadius: 8, padding: "8px 4px" }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: C.inkLight, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                              </div>
                            ))}
                          </div>
                          {s.market === "US" && (
                            <div style={{ fontSize: 10, color: C.inkLight, marginBottom: 10 }}>환율 적용: 1 USD = {rate.toLocaleString("ko-KR")}원</div>
                          )}
                          <button onClick={() => { setEditItem(s); setModal("editStock"); }} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 14px", cursor: "pointer", color: C.inkMid, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600 }}>
                            <Pencil size={12} /> 수정
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Asset Tab ── */}
        {tab === "asset" && (
          <>
            {/* Category bars */}
            {pieData.filter(c => c.name !== "주식").length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                {pieData.filter(c => c.name !== "주식").map(c => {
                  const pct = Math.round((c.value / (total || 1)) * 100);
                  return (
                    <div key={c.name} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 13, padding: "11px 14px 9px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                        <div style={{ width: 9, height: 9, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.ink }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: c.color, fontWeight: 700, marginRight: 4 }}>{pct}%</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtS(c.value)}</div>
                      </div>
                      <div style={{ background: C.cream, borderRadius: 99, height: 4 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: c.color, borderRadius: 99 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {assets.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", background: C.white, borderRadius: 16, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.inkMid, marginBottom: 6 }}>자산을 추가해보세요</div>
                <div style={{ fontSize: 12, color: C.inkLight }}>부동산, 예금, 달러 등</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {assets.map(a => {
                  const color = catColor(a.cat);
                  const isOpen = expanded === a.id;
                  return (
                    <div key={a.id} style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                      <button onClick={() => setExpanded(isOpen ? null : a.id)} style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 6, height: 36, borderRadius: 3, background: color, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{a.name}</div>
                          <div style={{ fontSize: 11, color: C.inkLight }}>{a.cat} · {a.date}</div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtS(a.amount)}</div>
                        {isOpen ? <ChevronUp size={13} color={C.inkLight} /> : <ChevronDown size={13} color={C.inkLight} />}
                      </button>
                      {isOpen && (
                        <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 16px", background: C.paper, display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>{fmt(a.amount)}</div>
                            {a.memo && <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>{a.memo}</div>}
                          </div>
                          <button onClick={() => { setEditItem(a); setModal("editAsset"); }} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: C.inkMid, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600 }}>
                            <Pencil size={12} /> 수정
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      <button onClick={() => setModal(tab === "stock" ? "addStock" : "addAsset")} style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 200,
        width: 56, height: 56, borderRadius: "50%", border: "none",
        background: tab === "stock" ? "#2d6a4f" : "#234080", color: "#fff", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 4px 20px ${tab === "stock" ? "#2d6a4f88" : "#23408088"}`,
        transition: "transform 0.15s, background 0.2s",
      }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
        <Plus size={26} />
      </button>

      {/* Modals */}
      <Modal open={modal === "addStock"}  onClose={() => setModal(null)}>
        <StockForm onSave={addStock} saving={saving} />
      </Modal>
      <Modal open={modal === "editStock" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <StockForm initial={editItem} onSave={updateStock} onDelete={() => deleteStock(editItem.id)} saving={saving} />}
      </Modal>
      <Modal open={modal === "addAsset"}  onClose={() => setModal(null)}>
        <AssetForm cats={cats} onSave={addAsset} saving={saving} />
      </Modal>
      <Modal open={modal === "editAsset" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <AssetForm initial={editItem} cats={cats} onSave={updateAsset} onDelete={() => deleteAsset(editItem.id)} saving={saving} />}
      </Modal>
      <Modal open={modal === "cats"} onClose={() => setModal(null)}>
        <CatSettings cats={cats} onChange={c => {
          setCats(c); save(CAT_KEY, c);
          if (isConfigured()) sb("settings", { method: "POST", body: JSON.stringify({ key: "cats", value: c }), prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
        }} />
      </Modal>
    </div>
  );
}
