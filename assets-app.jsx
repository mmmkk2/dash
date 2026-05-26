import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronUp, RefreshCw, TrendingUp, TrendingDown, Copy } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { supabase } from "./src/lib/supabase";

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  { key: "달러/외화", color: "#2469b3" },
  { key: "부동산",    color: "#b5451b" },
  { key: "예금/적금", color: "#0077b6" },
  { key: "가상화폐",  color: "#7b2d00" },
  { key: "기타",      color: "#6b5c4e" },
];
const CAT_COLORS = ["#2d6a4f","#2469b3","#b5451b","#0077b6","#7b2d00","#4a1942","#831843","#6b5c4e","#374151"];

const C = {
  bg: "#f0f2f5", paper: "#ffffff", white: "#ffffff",
  ink: "#1a1f2e", inkMid: "#556070", inkLight: "#a8b3c0",
  border: "#e3e8ef", cream: "#eef1f6",
  header: "#1a1f2e",
};
const F = "'Inter',sans-serif";

/* ── Stock price fetch (via server proxy to avoid CORS) ── */
async function fetchStockPrice(ticker, market) {
  if (market === "KR") {
    for (const suffix of [".KS", ".KQ"]) {
      const res = await fetch(`/api/stock?symbol=${encodeURIComponent(ticker + suffix)}`);
      if (!res.ok) continue;
      const { price } = await res.json();
      if (price != null) return price;
    }
    throw new Error("no price");
  }
  const res = await fetch(`/api/stock?symbol=${encodeURIComponent(ticker.toUpperCase())}`);
  if (!res.ok) throw new Error("fetch failed");
  const { price } = await res.json();
  if (price == null) throw new Error("no price");
  return price;
}

async function fetchUSDKRW() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (res.ok) {
      const data = await res.json();
      const krw = data?.rates?.KRW;
      if (krw) return krw;
    }
  } catch {}
  const res = await fetch("/api/stock?symbol=USDKRW%3DX");
  if (res.ok) {
    const { price } = await res.json();
    if (price) return price;
  }
  throw new Error("rate fetch failed");
}

async function fetchRateOnDate(date) {
  const res = await fetch(`https://api.frankfurter.app/${date}?from=USD&to=KRW`);
  if (!res.ok) throw new Error("rate fetch failed");
  const data = await res.json();
  const krw = data?.rates?.KRW;
  if (!krw) throw new Error("no rate");
  return krw;
}

/* ── DB field mapping ── */
const toDbStock   = s => ({ id: s.id, ticker: s.ticker, name: s.name, market: s.market, shares: s.shares, avg_price: s.avgPrice, current_price: s.currentPrice ?? null, last_fetched: s.lastFetched ?? null, purchase_date: s.purchaseDate ?? null, purchase_rate: s.purchaseRate ?? null, institution: s.institution || null, account_suffix: s.accountSuffix || null });
const fromDbStock = s => ({ id: s.id, ticker: s.ticker, name: s.name, market: s.market, shares: Number(s.shares), avgPrice: Number(s.avg_price), currentPrice: s.current_price != null ? Number(s.current_price) : null, lastFetched: s.last_fetched ?? null, purchaseDate: s.purchase_date ?? null, purchaseRate: s.purchase_rate != null ? Number(s.purchase_rate) : null, institution: s.institution || "", accountSuffix: s.account_suffix || "" });
const toDbAsset   = a => ({ id: a.id, name: a.name, cat: a.cat, amount: a.amount, memo: a.memo || "", date: a.date, institution: a.institution || null, account_suffix: a.accountSuffix || null });
const fromDbAsset = a => ({ id: a.id, name: a.name, cat: a.cat, amount: Number(a.amount), memo: a.memo || "", date: a.date, institution: a.institution || "", accountSuffix: a.account_suffix || "" });
const fromDbSnap  = s => ({ id: s.id, date: s.recorded_at, total: Number(s.total), stockVal: Number(s.stock_val), assetVal: Number(s.asset_val) });
const toDbVesting   = v => ({ id: v.id, type: v.type, ticker: v.ticker, name: v.name, shares: v.shares, vest_date: v.vestDate, grant_price: v.grantPrice ?? null, vest_price: v.vestPrice ?? null, vested: v.vested ?? false, grant_date: v.grantDate ?? null, institution: v.institution || null, account_suffix: v.accountSuffix || null, memo: v.memo || "" });
const fromDbVesting = v => ({ id: v.id, type: v.type, ticker: v.ticker, name: v.name, shares: Number(v.shares), vestDate: v.vest_date, grantPrice: v.grant_price != null ? Number(v.grant_price) : null, vestPrice: v.vest_price != null ? Number(v.vest_price) : null, vested: v.vested ?? false, grantDate: v.grant_date || null, institution: v.institution || "", accountSuffix: v.account_suffix || "", memo: v.memo || "" });
const toDbOffering  = o => ({ id: o.id, ticker: o.ticker, name: o.name, start_date: o.startDate, end_date: o.endDate, start_price: o.startPrice ?? null, monthly_krw: o.monthlyKrw ?? null, discount_pct: o.discountPct ?? 15, institution: o.institution || null, account_suffix: o.accountSuffix || null, memo: o.memo || "" });
const fromDbOffering= o => ({ id: o.id, ticker: o.ticker, name: o.name, startDate: o.start_date, endDate: o.end_date, startPrice: o.start_price != null ? Number(o.start_price) : null, monthlyKrw: o.monthly_krw != null ? Number(o.monthly_krw) : null, discountPct: o.discount_pct != null ? Number(o.discount_pct) : 15, institution: o.institution || "", accountSuffix: o.account_suffix || "", memo: o.memo || "" });

function isConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON && !SUPABASE_ANON.includes("여기에"));
}

async function sb(path, opts = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || SUPABASE_ANON;
  const { prefer, ...fetchOpts } = opts;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: prefer || "" },
    ...fetchOpts,
  });
  if (!res.ok) {
    const msg = await res.text();
    console.error(`[Supabase] ${opts.method || "GET"} ${path} →`, res.status, msg);
    throw new Error(msg);
  }
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

/* ── AutoInput (계좌 자동완성) ── */
function AutoInput({ value, onChange, suggestions = [], placeholder, style }) {
  const [open, setOpen] = useState(false);
  const filtered = suggestions.filter(s => s && s.toLowerCase().includes((value || "").toLowerCase()));

  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        style={style}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.12)", zIndex: 500, overflow: "hidden" }}>
          {filtered.map(s => (
            <div key={s} onMouseDown={() => { onChange(s); setOpen(false); }}
              style={{ padding: "10px 14px", fontSize: 13, color: C.ink, cursor: "pointer", borderBottom: `1px solid ${C.border}`, fontFamily: F }}
              onMouseEnter={e => e.currentTarget.style.background = C.cream}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Stock Form ── */
function StockForm({ initial, onSave, onDelete, onCopy, saving, suggestions = [] }) {
  const init = initial || {};
  const [ticker,       setTicker]       = useState(init.ticker       || "");
  const [name,         setName]         = useState(init.name         || "");
  const [market,       setMarket]       = useState(init.market       || "KR");
  const [shares,       setShares]       = useState(init.shares       ? String(init.shares) : "");
  const [avgPrice,     setAvgPrice]     = useState(init.avgPrice     ? Number(init.avgPrice).toLocaleString(market === "US" ? "en-US" : "ko-KR") : "");
  const [purchaseDate,  setPurchaseDate]  = useState(init.purchaseDate  || "");
  const [purchaseRate,  setPurchaseRate]  = useState(init.purchaseRate  ? String(init.purchaseRate) : "");
  const [institution,   setInstitution]   = useState(init.institution   || "");
  const [nameFetching,  setNameFetching]  = useState(false);
  const [rateFetching,  setRateFetching]  = useState(false);
  const [err, setErr] = useState(false);
  const isEdit = !!onDelete;

  async function lookupRate(date) {
    if (!date || market !== "US") return;
    setRateFetching(true);
    try {
      const r = await fetchRateOnDate(date);
      setPurchaseRate(String(Math.round(r)));
    } catch {}
    finally { setRateFetching(false); }
  }

  async function lookupTicker(raw) {
    const t = raw.trim();
    if (!t) return;
    const sym = market === "KR" ? `${t}.KS` : t.toUpperCase();
    setNameFetching(true);
    try {
      const res = await fetch(`/api/stock?symbol=${encodeURIComponent(sym)}`);
      if (!res.ok) return;
      const { name: fetchedName } = await res.json();
      if (fetchedName) setName(fetchedName);
    } catch {}
    finally { setNameFetching(false); }
  }

  useEffect(() => {
    if (isEdit && init.ticker && init.name === init.ticker) lookupTicker(init.ticker);
  }, []);

  function submit() {
    const sh = parseFloat(String(shares).replace(/,/g, ""));
    const ap = parseFloat(String(avgPrice).replace(/,/g, ""));
    if (!ticker.trim() || !sh || sh <= 0 || !ap || ap <= 0) {
      setErr(true); setTimeout(() => setErr(false), 400); return;
    }
    const pr = purchaseRate ? parseFloat(purchaseRate) : null;
    onSave({ id: init.id || Date.now(), ticker: ticker.trim().toUpperCase(), name: name.trim() || ticker.trim().toUpperCase(), market, shares: sh, avgPrice: ap, currentPrice: init.currentPrice || null, lastFetched: init.lastFetched || null, purchaseDate: purchaseDate || null, purchaseRate: market === "US" ? pr : null, institution: institution.trim(), accountSuffix: init.accountSuffix || "" });
  }

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{isEdit ? "종목 수정" : "종목 추가"}</span>
        {isEdit && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onCopy({ id: Date.now(), ticker: ticker.trim().toUpperCase(), name: name.trim() || ticker.trim().toUpperCase(), market, shares: parseFloat(String(shares).replace(/,/g,"")), avgPrice: parseFloat(String(avgPrice).replace(/,/g,"")), currentPrice: null, lastFetched: null, purchaseDate: purchaseDate || null, purchaseRate: market === "US" && purchaseRate ? parseFloat(purchaseRate) : null, institution: institution.trim(), accountSuffix: "" })}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "#f0f4ff", border: "1px solid #c7d4f4", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#2469b3", fontSize: 12, fontWeight: 600 }}>
              <Copy size={13} /> 복사
            </button>
            <button onClick={onDelete} style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff1ee", border: "1px solid #f4c5b2", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#b5451b", fontSize: 12, fontWeight: 600 }}><Trash2 size={13} /> 삭제</button>
          </div>
        )}
      </div>

      {/* Market */}
      <div style={{ marginBottom: 12 }}>
        <SLabel>시장</SLabel>
        <div style={{ display: "flex", gap: 8 }}>
          {[["KR", "🇰🇷 한국"], ["US", "🇺🇸 미국"]].map(([m, l]) => {
            const sel = market === m;
            return <button key={m} onClick={() => setMarket(m)} style={{ flex: 1, padding: "8px", borderRadius: 10, border: `1.5px solid ${sel ? "#2469b3" : C.border}`, background: sel ? "#2469b3" : C.white, color: sel ? "#fff" : C.inkMid, fontFamily: F, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{l}</button>;
          })}
        </div>
      </div>

      {/* Ticker + Name */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 12 }}>
        <div>
          <SLabel>티커</SLabel>
          <input value={ticker} onChange={e => setTicker(e.target.value)} onBlur={e => lookupTicker(e.target.value)} placeholder={market === "KR" ? "005930" : "AAPL"}
            style={{ width: "100%", border: `1.5px solid ${err && !ticker.trim() ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", textTransform: "uppercase" }} />
        </div>
        <div>
          <SLabel>종목명</SLabel>
          <input value={nameFetching ? "" : name} onChange={e => setName(e.target.value)} placeholder={nameFetching ? "조회 중…" : market === "KR" ? "삼성전자" : "Apple Inc."}
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: nameFetching ? C.cream : C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
      </div>

      {/* Shares + AvgPrice */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
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

      {/* Account */}
      <div style={{ marginBottom: 12 }}>
        <SLabel>계좌 <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(선택)</span></SLabel>
        <AutoInput value={institution} onChange={setInstitution} suggestions={suggestions} placeholder="미래에셋, 키움…"
          style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>

      {/* Purchase Date (optional) */}
      <div style={{ marginBottom: market === "US" ? 12 : 20 }}>
        <SLabel>매입일자 <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(선택)</span></SLabel>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={purchaseDate}
            onChange={e => { setPurchaseDate(e.target.value); lookupRate(e.target.value); }}
            style={{ flex: 1, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: purchaseDate ? C.ink : C.inkLight, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
          {purchaseDate && (
            <button onClick={() => { setPurchaseDate(""); setPurchaseRate(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkLight, display: "flex", padding: 4 }}><X size={15} /></button>
          )}
        </div>
      </div>

      {market === "US" && (
        <div style={{ marginBottom: 20 }}>
          <SLabel>매입 환율 <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(USD/KRW, 선택)</span></SLabel>
          <div style={{ display: "flex", alignItems: "center", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "0 12px", background: rateFetching ? C.cream : C.white }}>
            <span style={{ fontSize: 12, color: C.inkLight, marginRight: 6 }}>1 USD =</span>
            <input type="text" inputMode="numeric" value={rateFetching ? "" : purchaseRate}
              onChange={e => setPurchaseRate(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder={rateFetching ? "조회 중…" : purchaseDate ? "자동 조회됨" : "매입일자 입력 시 자동"}
              style={{ flex: 1, border: "none", background: "transparent", fontSize: 14, fontWeight: 600, color: C.ink, padding: "9px 0", outline: "none", fontFamily: F, fontVariantNumeric: "tabular-nums" }} />
            <span style={{ fontSize: 12, color: C.inkLight }}>원</span>
          </div>
        </div>
      )}

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
function AssetForm({ initial, cats, onSave, onDelete, saving, suggestions = [] }) {
  const init = initial || {};
  const [name,          setName]          = useState(init.name          || "");
  const [cat,           setCat]           = useState(init.cat           || cats.find(c => c.key !== "주식")?.key || "기타");
  const [amount,        setAmount]        = useState(init.amount        ? Number(init.amount).toLocaleString("ko-KR") : "");
  const [memo,          setMemo]          = useState(init.memo          || "");
  const [date,          setDate]          = useState(init.date          || new Date().toISOString().slice(0, 10));
  const [institution,   setInstitution]   = useState(init.institution   || "");
  const [err,           setErr]           = useState(false);
  const isEdit = !!initial;

  const nonStockCats = cats.filter(c => c.key !== "주식" && c.key !== "예수금");

  function submit() {
    const num = parseInt(String(amount).replace(/,/g, ""));
    if (!name.trim() || !num || num <= 0) { setErr(true); setTimeout(() => setErr(false), 400); return; }
    onSave({ id: init.id || Date.now(), name: name.trim(), cat, amount: num, memo: memo.trim(), date, institution: institution.trim(), accountSuffix: init.accountSuffix || "" });
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

      {/* Account */}
      <div style={{ marginBottom: 12 }}>
        <SLabel>계좌 <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(선택)</span></SLabel>
        <AutoInput value={institution} onChange={setInstitution} suggestions={suggestions} placeholder="국민은행, 미래에셋…"
          style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
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

/* ── Deposit Form (예수금 / 단기자금) ── */
function DepositForm({ initial, onSave, onDelete, saving, suggestions = [] }) {
  const init = initial || {};
  const [amount,      setAmount]      = useState(init.amount ? Number(init.amount).toLocaleString("ko-KR") : "");
  const [institution, setInstitution] = useState(init.institution || "");
  const [memo,        setMemo]        = useState(init.memo || "");
  const [date,        setDate]        = useState(init.date || new Date().toISOString().slice(0, 10));
  const [err,         setErr]         = useState(false);
  const isEdit = !!initial;

  function submit() {
    const num = parseInt(String(amount).replace(/,/g, ""));
    if (!num || num <= 0) { setErr(true); setTimeout(() => setErr(false), 400); return; }
    onSave({ id: init.id || Date.now(), name: institution.trim() || "예수금", cat: "예수금", amount: num, memo: memo.trim(), date, institution: institution.trim(), accountSuffix: init.accountSuffix || "" });
  }

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{isEdit ? "예수금 수정" : "예수금 추가"}</span>
        {isEdit && <button onClick={onDelete} style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff1ee", border: "1px solid #f4c5b2", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#b5451b", fontSize: 12, fontWeight: 600 }}><Trash2 size={13} /> 삭제</button>}
      </div>

      <div style={{ marginBottom: 12 }}>
        <SLabel>금액</SLabel>
        <div style={{ display: "flex", alignItems: "center", background: err ? "#fff5f0" : C.white, border: `1.5px solid ${err ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "0 14px" }}>
          <span style={{ color: C.inkLight, fontSize: 16, marginRight: 8 }}>₩</span>
          <input type="text" inputMode="numeric" value={amount}
            onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ""); setAmount(raw ? Number(raw).toLocaleString("ko-KR") : raw); }}
            placeholder="0"
            style={{ flex: 1, border: "none", background: "transparent", fontSize: 20, fontWeight: 700, color: C.ink, padding: "10px 0", outline: "none", fontFamily: F, fontVariantNumeric: "tabular-nums" }} />
          <span style={{ color: C.inkLight, fontSize: 13 }}>원</span>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <SLabel>계좌 <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(선택)</span></SLabel>
        <AutoInput value={institution} onChange={setInstitution} suggestions={suggestions} placeholder="미래에셋, 키움…"
          style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
        <div>
          <SLabel>메모 <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(선택)</span></SLabel>
          <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="대기 자금, CMA…"
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
        <div>
          <SLabel>기준일</SLabel>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
      </div>

      <button onClick={submit} disabled={saving} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#0d7377", color: "#fff", fontSize: 15, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: F, boxShadow: "0 4px 18px #0d737755", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {saving ? "저장 중…" : isEdit ? <><Check size={16} /> 저장</> : <><Plus size={16} /> 추가</>}
      </button>
    </div>
  );
}

/* ── Pension Form ── */
const PENSION_TYPES       = ["IRP", "노란우산", "DC"];
const PENSION_MONTHLY     = new Set(["IRP", "노란우산"]);
const PENSION_TYPE_COLORS = { IRP: "#2d5cb8", "노란우산": "#b8860b", DC: "#2d6a4f", "기타": "#6b5c4e" };
const DC_ETF_MARKER       = "dc_pension";

const LOAN_TYPES       = ["신용", "마이너스통장", "사업자", "주택담보", "기타"];
const LOAN_TYPE_COLORS = { "신용": "#2d5cb8", "마이너스통장": "#6b2d8b", "사업자": "#b8860b", "주택담보": "#7b2d00", "기타": "#6b5c4e" };

function pensionMonths(startDate) {
  if (!startDate) return 0;
  const s = new Date(startDate), n = new Date();
  return Math.max(0, (n.getFullYear() - s.getFullYear()) * 12 + (n.getMonth() - s.getMonth()));
}

function PensionForm({ initial = {}, onSave, onDelete }) {
  const init = initial;
  const isMonthly = t => PENSION_MONTHLY.has(t);
  const [type,        setType]        = useState(init.accountSuffix || "IRP");
  const [institution, setInstitution] = useState(init.institution || "");
  const [name,        setName]        = useState(init.name || "");
  const [amountStr,   setAmountStr]   = useState(init.amount ? String(init.amount) : "");
  const [startDate,   setStartDate]   = useState(init.date || new Date().toISOString().slice(0, 10));
  const [monthlyStr,  setMonthlyStr]  = useState(isMonthly(init.accountSuffix) ? (init.memo || "") : "");
  const [memo,        setMemo]        = useState(!isMonthly(init.accountSuffix) ? (init.memo || "") : "");
  const [err,         setErr]         = useState("");

  const submit = () => {
    const num = parseInt(amountStr.replace(/,/g, ""), 10);
    if (!institution.trim()) { setErr("금융기관을 입력해주세요"); return; }
    if (!num && type !== "DC") { setErr("현재 평가액을 입력해주세요"); return; }
    setErr("");
    const memoVal = isMonthly(type) ? monthlyStr.replace(/[^\d]/g, "") : memo.trim();
    onSave({ id: init.id || Date.now(), cat: "퇴직연금", name: name.trim() || institution.trim(), institution: institution.trim(), accountSuffix: type, amount: num || 0, date: startDate, memo: memoVal });
  };

  const months   = isMonthly(type) ? pensionMonths(startDate) : 0;
  const monthly  = isMonthly(type) ? parseInt(monthlyStr.replace(/[^\d]/g, "")) || 0 : 0;
  const accum    = monthly * months;
  const current  = parseInt(amountStr.replace(/,/g, "")) || 0;
  const gain     = accum > 0 ? current - accum : null;
  const gainPct  = accum > 0 ? ((gain / accum) * 100).toFixed(1) : null;

  return (
    <div style={{ padding: "4px 0 8px" }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>연금·공제</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 18, marginBottom: 12 }}>
        {PENSION_TYPES.map(t => (
          <button key={t} onClick={() => setType(t)} style={{ flex: "1 1 auto", padding: "9px 0", border: `1.5px solid ${type === t ? "#2d5cb8" : C.border}`, borderRadius: 9, cursor: "pointer", fontWeight: 700, fontSize: 13, background: type === t ? "#2d5cb8" : C.white, color: type === t ? "#fff" : C.inkMid, fontFamily: F }}>
            {t}
          </button>
        ))}
      </div>
      <SLabel>금융기관</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <input value={institution} onChange={e => setInstitution(e.target.value)} placeholder={type === "노란우산" ? "중소기업중앙회" : "미래에셋증권"}
          style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 15, fontWeight: 600, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      <SLabel>계좌명 (선택)</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder=""
          style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 15, fontWeight: 600, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      {isMonthly(type) && (
        <>
          <SLabel>불입 시작일</SLabel>
          <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 14, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
          </div>
          <SLabel>월 납입액</SLabel>
          <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12, display: "flex", alignItems: "center" }}>
            <input value={monthlyStr} onChange={e => setMonthlyStr(e.target.value.replace(/[^\d]/g, ""))} placeholder="300000"
              style={{ flex: 1, border: "none", padding: "11px 12px", fontSize: 18, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, fontVariantNumeric: "tabular-nums" }} />
            <span style={{ padding: "0 14px 0 4px", color: C.inkLight, fontSize: 13 }}>원/월</span>
          </div>
          {accum > 0 && (
            <div style={{ background: C.cream, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: C.inkMid }}>
              {months}개월 · 누적 원금 <strong style={{ color: C.ink }}>{fmtS(accum)}</strong>
              {gain !== null && <span style={{ marginLeft: 8, color: gain >= 0 ? "#2d9e6b" : "#d95f4b", fontWeight: 700 }}>{gain >= 0 ? "+" : ""}{fmtS(gain)} ({gainPct}%)</span>}
            </div>
          )}
        </>
      )}
      {!isMonthly(type) && (
        <>
          <SLabel>기준일</SLabel>
          <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 14, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
          </div>
        </>
      )}
      <SLabel>현재 평가액 {type === "DC" ? "(ETF 미입력 시 기준값)" : ""}</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 8, display: "flex", alignItems: "center" }}>
        <input value={amountStr} onChange={e => setAmountStr(e.target.value.replace(/[^\d]/g, ""))} placeholder="10000000"
          style={{ flex: 1, border: "none", padding: "11px 12px", fontSize: 20, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, fontVariantNumeric: "tabular-nums" }} />
        <span style={{ padding: "0 14px 0 4px", color: C.inkLight, fontSize: 13 }}>원</span>
      </div>
      {type === "DC" && (
        <div style={{ background: "#f0f7f4", border: "1px solid #b7dece", borderRadius: 9, padding: "9px 12px", marginBottom: 12, fontSize: 12, color: "#2d6a4f", lineHeight: 1.5 }}>
          저장 후 카드의 펼침 버튼(∨)으로 ETF 종목을 추가할 수 있습니다.<br />
          종목 추가 시 현재 평가액은 자동 계산됩니다.
        </div>
      )}
      {!isMonthly(type) && (
        <>
          <SLabel>메모 (선택)</SLabel>
          <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
            <input value={memo} onChange={e => setMemo(e.target.value)} placeholder=""
              style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 14, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
          </div>
        </>
      )}
      {err && <div style={{ fontSize: 12, color: "#e07a5f", fontWeight: 600, marginBottom: 10 }}>{err}</div>}
      <button onClick={submit} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#2d5cb8", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F, marginBottom: onDelete ? 10 : 0 }}>
        {init.id ? "저장" : "추가"}
      </button>
      {onDelete && (
        <button onClick={() => window.confirm("삭제할까요?") && onDelete()} style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid #e07a5f`, background: C.white, color: "#e07a5f", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: F, marginTop: 0 }}>
          삭제
        </button>
      )}
    </div>
  );
}

/* ── DC ETF Form ── */
function DCEtfForm({ initial = {}, institution, onSave, onDelete }) {
  const init = initial;
  const [ticker,       setTicker]       = useState(init.ticker       || "");
  const [name,         setName]         = useState(init.name         || "");
  const [shares,       setShares]       = useState(init.shares       ? String(init.shares) : "");
  const [avgPrice,     setAvgPrice]     = useState(init.avgPrice     ? String(init.avgPrice) : "");
  const [currentPrice, setCurrentPrice] = useState(init.currentPrice ? String(init.currentPrice) : "");
  const [market,       setMarket]       = useState(init.market       || "KR");
  const [nameLoading,  setNameLoading]  = useState(false);

  const [err, setErr] = useState("");

  const fetchName = async (tk, mkt) => {
    if (!tk.trim()) return;
    setNameLoading(true);
    try {
      const suffixes = mkt === "KR" ? [".KS", ".KQ"] : [""];
      for (const suf of suffixes) {
        const sym = tk.trim().toUpperCase() + suf;
        const res = await fetch(`/api/stock?symbol=${encodeURIComponent(sym)}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.name) { setName(data.name); break; }
      }
    } catch {}
    setNameLoading(false);
  };

  const submit = () => {
    const sh = parseFloat(shares);
    const ap = parseFloat(avgPrice.replace(/,/g, ""));
    const cp = currentPrice.trim() ? parseFloat(currentPrice.replace(/,/g, "")) : null;
    if (!ticker.trim()) { setErr("티커를 입력해주세요"); return; }
    if (!sh)            { setErr("보유 수량을 입력해주세요"); return; }
    if (!ap)            { setErr("평균 단가를 입력해주세요"); return; }
    setErr("");
    onSave({ id: init.id || Date.now(), ticker: ticker.trim().toUpperCase(), name: name.trim() || ticker.trim().toUpperCase(), market, shares: sh, avgPrice: ap, currentPrice: cp, lastFetched: null, purchaseDate: null, purchaseRate: null, institution: institution || init.institution || "", accountSuffix: DC_ETF_MARKER });
  };

  return (
    <div style={{ padding: "4px 0 8px" }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>DC 연금 ETF</span>
      <div style={{ display: "flex", gap: 6, marginTop: 16, marginBottom: 14 }}>
        {[["KR", "국내"], ["US", "해외"]].map(([m, l]) => (
          <button key={m} onClick={() => setMarket(m)} style={{ flex: 1, padding: "9px 0", border: `1.5px solid ${market === m ? "#2d6a4f" : C.border}`, borderRadius: 9, fontWeight: 700, fontSize: 13, background: market === m ? "#2d6a4f" : C.white, color: market === m ? "#fff" : C.inkMid, fontFamily: F, cursor: "pointer" }}>{l}</button>
        ))}
      </div>
      <SLabel>티커</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <input value={ticker} onChange={e => setTicker(e.target.value)} onBlur={() => fetchName(ticker, market)} placeholder={market === "KR" ? "069500" : "SPY"}
          style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 17, fontWeight: 800, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", letterSpacing: "0.05em" }} />
      </div>
      <SLabel>종목명 {nameLoading ? <span style={{ fontSize: 11, color: C.inkLight, fontWeight: 400 }}>조회 중…</span> : "(자동 조회 · 수정 가능)"}</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={market === "KR" ? "KODEX 200" : "S&P500 ETF"}
          style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 14, fontWeight: 600, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <SLabel>보유 수량</SLabel>
          <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <input value={shares} onChange={e => setShares(e.target.value.replace(/[^\d.]/g, ""))} placeholder="10"
              style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 16, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", fontVariantNumeric: "tabular-nums" }} />
          </div>
        </div>
        <div>
          <SLabel>평균 단가</SLabel>
          <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <input value={avgPrice} onChange={e => setAvgPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder={market === "KR" ? "35000" : "450.0"}
              style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 16, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", fontVariantNumeric: "tabular-nums" }} />
          </div>
        </div>
      </div>
      <SLabel>현재가 (선택 · 미입력 시 자동 조회)</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
        <input value={currentPrice} onChange={e => setCurrentPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder={market === "KR" ? "36500" : "460.0"}
          style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 16, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", fontVariantNumeric: "tabular-nums" }} />
      </div>
      {err && <div style={{ fontSize: 12, color: "#e07a5f", fontWeight: 600, marginBottom: 10 }}>{err}</div>}
      <button onClick={submit} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#2d6a4f", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F, marginBottom: onDelete ? 10 : 0 }}>
        {init.id ? "저장" : "ETF 추가"}
      </button>
      {onDelete && (
        <button onClick={() => window.confirm("삭제할까요?") && onDelete()} style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid #e07a5f`, background: C.white, color: "#e07a5f", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
          삭제
        </button>
      )}
    </div>
  );
}

/* ── Loan Form ── */
const REPAY_TYPES = ["원리금균등", "원금균등", "부분원금균등", "이자만", "직접입력"];

function calcLoanMonthly(repayType, prin, bal, annualRate, termMonths, maturity) {
  const mr = annualRate / 12 / 100;
  const remFromMaturity = maturity
    ? Math.max(1, Math.round((new Date(maturity) - new Date()) / (1000 * 60 * 60 * 24 * 30.44)))
    : 0;
  if (repayType === "원리금균등" && mr > 0) {
    if (termMonths > 0 && prin > 0) {
      // 대출 기간 직접 입력: 원금 + 총 기간으로 정확 계산
      const t = Math.pow(1 + mr, termMonths);
      return Math.round(prin * mr * t / (t - 1));
    } else if (remFromMaturity > 0 && bal > 0) {
      // 대출 기간 미입력: 현재 잔액 + 남은 개월로 계산
      const t = Math.pow(1 + mr, remFromMaturity);
      return Math.round(bal * mr * t / (t - 1));
    }
  }
  if (repayType === "원금균등" && bal > 0 && mr > 0) {
    const rem = termMonths > 0 ? termMonths : remFromMaturity;
    if (rem > 0) return Math.round(bal / rem + bal * mr);
  }
  if (repayType === "이자만" && bal > 0 && mr > 0) {
    return Math.round(bal * mr);
  }
  return null;
}

function LoanForm({ initial = {}, onSave, onDelete }) {
  const init = initial;
  const parseMemo = raw => { try { return JSON.parse(raw || "{}"); } catch { return {}; } };
  const initMemo  = parseMemo(init.memo);

  const [loanType,       setLoanType]       = useState(init.accountSuffix || "주택담보");
  const [repayType,      setRepayType]      = useState(initMemo.repayType || "직접입력");
  const [institution,    setInstitution]    = useState(init.institution || "");
  const [name,           setName]           = useState(init.name || "");
  const [principal,      setPrincipal]      = useState(initMemo.principal ? String(initMemo.principal) : "");
  const [balance,        setBalance]        = useState(init.amount ? String(init.amount) : "");
  const [rate,           setRate]           = useState(initMemo.rate != null ? String(initMemo.rate) : "");
  const [termMonths,     setTermMonths]     = useState(initMemo.termMonths ? String(initMemo.termMonths) : "");
  const [monthly,        setMonthly]        = useState(initMemo.monthly ? String(initMemo.monthly) : "");
  const [monthlyPrinStr, setMonthlyPrinStr] = useState(initMemo.monthlyPrincipal ? String(initMemo.monthlyPrincipal) : "");
  const [maturity,       setMaturity]       = useState(init.date || "");
  const [memo,           setMemo]           = useState(initMemo.memo || "");
  const [err,            setErr]            = useState("");

  const bal   = parseInt(balance.replace(/[^\d]/g, ""), 10) || 0;
  const prin  = parseInt(principal.replace(/[^\d]/g, ""), 10) || 0;
  const r     = parseFloat(rate) || 0;
  const term  = parseInt(termMonths) || 0;

  const monthlyPrin   = parseInt(monthlyPrinStr.replace(/[^\d]/g, ""), 10) || 0;
  const monthlyInt    = bal > 0 && r > 0 ? Math.round(bal * r / 12 / 100) : 0;
  const calcedMonthly = repayType === "부분원금균등"
    ? (monthlyPrin > 0 ? monthlyPrin + monthlyInt : null)
    : calcLoanMonthly(repayType, prin, bal, r, term, maturity);
  const dispMonthly   = repayType !== "직접입력" ? calcedMonthly : (parseInt(monthly.replace(/[^\d]/g, ""), 10) || 0);

  const annualInterest = bal > 0 && r > 0 ? Math.round(bal * r / 100) : 0;
  const repaidPct      = prin > 0 && bal > 0 ? Math.max(0, Math.round((1 - bal / prin) * 100)) : null;

  const needsTermInput = repayType === "원리금균등" || repayType === "원금균등";

  const submit = () => {
    if (!institution.trim()) { setErr("금융기관을 입력해주세요"); return; }
    if (!bal)                { setErr("현재 잔액을 입력해주세요"); return; }
    setErr("");
    const finalMonthly = repayType !== "직접입력" ? calcedMonthly : (parseInt(monthly.replace(/[^\d]/g, ""), 10) || 0);
    const memoObj = {};
    if (prin)            memoObj.principal  = prin;
    if (r)               memoObj.rate       = r;
    if (finalMonthly)    memoObj.monthly    = finalMonthly;
    if (term)            memoObj.termMonths = term;
    if (repayType !== "직접입력") memoObj.repayType = repayType;
    if (repayType === "부분원금균등" && monthlyPrin) memoObj.monthlyPrincipal = monthlyPrin;
    if (memo.trim())     memoObj.memo       = memo.trim();
    onSave({
      id: init.id || Date.now(),
      cat: "대출",
      name: name.trim() || institution.trim(),
      institution: institution.trim(),
      accountSuffix: loanType,
      amount: bal,
      date: maturity || new Date().toISOString().slice(0, 10),
      memo: JSON.stringify(memoObj),
    });
  };

  return (
    <div style={{ padding: "4px 0 8px" }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>대출</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 18, marginBottom: 12 }}>
        {LOAN_TYPES.map(t => (
          <button key={t} onClick={() => setLoanType(t)}
            style={{ flex: "1 1 auto", padding: "8px 0", border: `1.5px solid ${loanType === t ? (LOAN_TYPE_COLORS[t] || "#555") : C.border}`, borderRadius: 9, cursor: "pointer", fontWeight: 700, fontSize: 12, background: loanType === t ? (LOAN_TYPE_COLORS[t] || "#555") : C.white, color: loanType === t ? "#fff" : C.inkMid, fontFamily: F }}>
            {t}
          </button>
        ))}
      </div>
      <SLabel>금융기관</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <input value={institution} onChange={e => setInstitution(e.target.value)} placeholder="국민은행"
          style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 15, fontWeight: 600, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      <SLabel>대출명 (선택)</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="KB 주택담보대출"
          style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 14, fontWeight: 600, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <SLabel>대출 원금</SLabel>
          <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center" }}>
            <input value={principal} onChange={e => setPrincipal(e.target.value.replace(/[^\d]/g, ""))} placeholder="300000000"
              style={{ flex: 1, border: "none", padding: "11px 10px", fontSize: 14, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, fontVariantNumeric: "tabular-nums", minWidth: 0 }} />
            <span style={{ padding: "0 8px 0 2px", color: C.inkLight, fontSize: 11, flexShrink: 0 }}>원</span>
          </div>
        </div>
        <div>
          <SLabel>현재 잔액</SLabel>
          <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center" }}>
            <input value={balance} onChange={e => setBalance(e.target.value.replace(/[^\d]/g, ""))} placeholder="250000000"
              style={{ flex: 1, border: "none", padding: "11px 10px", fontSize: 14, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, fontVariantNumeric: "tabular-nums", minWidth: 0 }} />
            <span style={{ padding: "0 8px 0 2px", color: C.inkLight, fontSize: 11, flexShrink: 0 }}>원</span>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: needsTermInput ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <SLabel>금리 (%)</SLabel>
          <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center" }}>
            <input value={rate} onChange={e => setRate(e.target.value.replace(/[^\d.]/g, ""))} placeholder="3.5"
              style={{ flex: 1, border: "none", padding: "11px 10px", fontSize: 16, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, fontVariantNumeric: "tabular-nums", minWidth: 0 }} />
            <span style={{ padding: "0 8px 0 2px", color: C.inkLight, fontSize: 12, flexShrink: 0 }}>%</span>
          </div>
        </div>
        {needsTermInput && (
          <div>
            <SLabel>대출 기간</SLabel>
            <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center" }}>
              <input value={termMonths} onChange={e => setTermMonths(e.target.value.replace(/[^\d]/g, ""))} placeholder="360"
                style={{ flex: 1, border: "none", padding: "11px 10px", fontSize: 16, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, fontVariantNumeric: "tabular-nums", minWidth: 0 }} />
              <span style={{ padding: "0 8px 0 2px", color: C.inkLight, fontSize: 11, flexShrink: 0 }}>개월</span>
            </div>
          </div>
        )}
      </div>
      <SLabel>상환 방식</SLabel>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {REPAY_TYPES.map(t => (
          <button key={t} onClick={() => setRepayType(t)}
            style={{ flex: "1 1 auto", padding: "8px 0", border: `1.5px solid ${repayType === t ? "#7b2d00" : C.border}`, borderRadius: 9, cursor: "pointer", fontWeight: 700, fontSize: 11, background: repayType === t ? "#7b2d00" : C.white, color: repayType === t ? "#fff" : C.inkMid, fontFamily: F }}>
            {t}
          </button>
        ))}
      </div>
      {repayType === "부분원금균등" ? (
        <div style={{ marginBottom: 12 }}>
          <SLabel>월 상환 원금</SLabel>
          <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center", marginBottom: 8 }}>
            <input value={monthlyPrinStr} onChange={e => setMonthlyPrinStr(e.target.value.replace(/[^\d]/g, ""))} placeholder="500000"
              style={{ flex: 1, border: "none", padding: "11px 10px", fontSize: 14, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, fontVariantNumeric: "tabular-nums", minWidth: 0 }} />
            <span style={{ padding: "0 8px 0 2px", color: C.inkLight, fontSize: 11, flexShrink: 0 }}>원</span>
          </div>
          {monthlyPrin > 0 && (
            <div style={{ background: "#fff5f5", border: "1px solid #f5c6cb", borderRadius: 10, padding: "12px 16px", display: "flex", gap: 16, alignItems: "baseline" }}>
              <span style={{ fontSize: 12, color: C.inkMid }}>월 상환액</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#7b2d00", fontVariantNumeric: "tabular-nums" }}>{fmtS(monthlyPrin + monthlyInt)}원</span>
              <span style={{ fontSize: 11, color: C.inkLight }}>원금 {fmtS(monthlyPrin)} + 이자 {fmtS(monthlyInt)}</span>
            </div>
          )}
        </div>
      ) : repayType !== "직접입력" ? (
        <div style={{ background: calcedMonthly ? "#fff5f5" : C.paper, border: `1px solid ${calcedMonthly ? "#f5c6cb" : C.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.inkMid }}>월 상환액</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#7b2d00", fontVariantNumeric: "tabular-nums" }}>
            {calcedMonthly ? `${fmtS(calcedMonthly)}원` : "—"}
          </span>
          {repayType === "원금균등" && <span style={{ fontSize: 10, color: C.inkLight }}>(현재 잔액 기준)</span>}
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <SLabel>월 상환액 (선택)</SLabel>
          <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center" }}>
            <input value={monthly} onChange={e => setMonthly(e.target.value.replace(/[^\d]/g, ""))} placeholder="800000"
              style={{ flex: 1, border: "none", padding: "11px 10px", fontSize: 14, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, fontVariantNumeric: "tabular-nums", minWidth: 0 }} />
            <span style={{ padding: "0 8px 0 2px", color: C.inkLight, fontSize: 11, flexShrink: 0 }}>원</span>
          </div>
        </div>
      )}
      <SLabel>만기일</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <input type="date" value={maturity} onChange={e => setMaturity(e.target.value)}
          style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 14, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      <SLabel>메모 (선택)</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <input value={memo} onChange={e => setMemo(e.target.value)} placeholder=""
          style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 14, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      {(annualInterest > 0 || repaidPct != null) && (
        <div style={{ background: "#fff5f5", border: "1px solid #f5c6cb", borderRadius: 9, padding: "9px 12px", marginBottom: 12, fontSize: 12, color: "#7b2d00", lineHeight: 1.6 }}>
          {annualInterest > 0 && <div>연간 이자 약 <strong>{fmtS(annualInterest)}</strong>원 · 월 이자 {fmtS(Math.round(annualInterest / 12))}원</div>}
          {repaidPct != null && <div>원금 상환률 <strong>{repaidPct}%</strong> ({fmtS(prin - bal)}원 상환)</div>}
          {dispMonthly > 0 && r > 0 && bal > 0 && <div>월 상환 중 이자 비중 <strong>{Math.min(100, Math.round(annualInterest / 12 / dispMonthly * 100))}%</strong></div>}
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: "#e07a5f", fontWeight: 600, marginBottom: 10 }}>{err}</div>}
      <button onClick={submit} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#7b2d00", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F, marginBottom: onDelete ? 10 : 0 }}>
        {init.id ? "저장" : "대출 추가"}
      </button>
      {onDelete && (
        <button onClick={() => window.confirm("삭제할까요?") && onDelete()} style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid #e07a5f`, background: C.white, color: "#e07a5f", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
          삭제
        </button>
      )}
    </div>
  );
}

/* ── Loan Pay Form ── */
function LoanPayForm({ loan, onSave }) {
  const parseMemo = raw => { try { return JSON.parse(raw || "{}"); } catch { return {}; } };
  const m = parseMemo(loan.memo);

  const monthlyInt  = m.rate ? Math.round(loan.amount * m.rate / 12 / 100) : 0;
  const calcedTotal = m.repayType && m.repayType !== "직접입력" ? calcLoanMonthly(m.repayType, m.principal || 0, loan.amount, m.rate || 0, m.termMonths || 0, loan.date) : m.monthly;
  const defaultTotal = calcedTotal || m.monthly || 0;
  const defaultPrin = m.repayType === "이자만" ? 0 : Math.max(0, (defaultTotal || 0) - monthlyInt);

  const [totalStr, setTotalStr] = useState(defaultTotal ? String(defaultTotal) : "");
  const [prinStr,  setPrinStr]  = useState(defaultPrin  ? String(defaultPrin)  : "");
  const [dateStr,  setDateStr]  = useState(new Date().toISOString().slice(0, 10));
  const [err,      setErr]      = useState("");

  const total = parseInt(totalStr.replace(/[^\d]/g, ""), 10) || 0;
  const prin  = parseInt(prinStr.replace(/[^\d]/g, ""),  10) || 0;
  const intAmt = Math.max(0, total - prin);

  const submit = () => {
    if (!total) { setErr("납입액을 입력해주세요"); return; }
    setErr("");
    const newBalance = Math.max(0, loan.amount - prin);
    const newMemo = { ...m };
    if (!newMemo.payments) newMemo.payments = [];
    newMemo.payments.push({ date: dateStr, total, principal: prin, interest: intAmt });
    onSave({ ...loan, amount: newBalance, memo: JSON.stringify(newMemo) });
  };

  return (
    <div style={{ padding: "4px 0 8px" }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>납입 기록</span>
      <div style={{ background: "#fff5f5", border: "1px solid #f5c6cb", borderRadius: 10, padding: "12px 14px", margin: "14px 0 16px", fontSize: 12, color: "#7b2d00", lineHeight: 1.7 }}>
        <div style={{ fontWeight: 700, marginBottom: 3 }}>{loan.name || loan.institution} · 잔액 {fmtS(loan.amount)}</div>
        {monthlyInt > 0 && <div>이번 달 이자 {fmtS(monthlyInt)}원 (잔액 × {m.rate}% ÷ 12)</div>}
      </div>
      <SLabel>납입일</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)}
          style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 14, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      <SLabel>납입 총액</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12, display: "flex", alignItems: "center" }}>
        <input value={totalStr} onChange={e => setTotalStr(e.target.value.replace(/[^\d]/g, ""))} placeholder={defaultTotal ? String(defaultTotal) : "0"}
          style={{ flex: 1, border: "none", padding: "11px 12px", fontSize: 20, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, fontVariantNumeric: "tabular-nums" }} />
        <span style={{ padding: "0 14px 0 4px", color: C.inkLight, fontSize: 13 }}>원</span>
      </div>
      <SLabel>원금 상환액 (납입액 중 이자 제외 부분)</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 8, display: "flex", alignItems: "center" }}>
        <input value={prinStr} onChange={e => setPrinStr(e.target.value.replace(/[^\d]/g, ""))} placeholder={defaultPrin ? String(defaultPrin) : "0"}
          style={{ flex: 1, border: "none", padding: "11px 12px", fontSize: 20, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, fontVariantNumeric: "tabular-nums" }} />
        <span style={{ padding: "0 14px 0 4px", color: C.inkLight, fontSize: 13 }}>원</span>
      </div>
      {total > 0 && (
        <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: C.inkMid, lineHeight: 1.7 }}>
          <div>원금 {fmtS(prin)} + 이자 {fmtS(intAmt)} = 총 {fmtS(total)}</div>
          <div style={{ fontWeight: 700, color: "#7b2d00" }}>납입 후 잔액 → {fmtS(Math.max(0, loan.amount - prin))}</div>
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: "#e07a5f", fontWeight: 600, marginBottom: 10 }}>{err}</div>}
      <button onClick={submit} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#7b2d00", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
        납입 완료
      </button>
    </div>
  );
}

/* ── Pension Pay Form ── */
function PensionPayForm({ pension, onSave }) {
  const monthly = parseInt(pension.memo) || 0;
  const [amtStr, setAmtStr] = useState(monthly ? String(monthly) : "");
  const [dateStr, setDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState("");

  const amt = parseInt(amtStr.replace(/[^\d]/g, ""), 10) || 0;

  const submit = () => {
    if (!amt) { setErr("납입액을 입력해주세요"); return; }
    setErr("");
    onSave({ ...pension, amount: pension.amount + amt });
  };

  return (
    <div style={{ padding: "4px 0 8px" }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>납입 기록</span>
      <div style={{ background: "#eef3fc", border: "1px solid #c7d4f4", borderRadius: 10, padding: "12px 14px", margin: "14px 0 16px", fontSize: 12, color: "#2d5cb8", lineHeight: 1.7 }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>{pension.accountSuffix} · {pension.name || pension.institution}</div>
        <div>현재 적립액 <strong>{fmtS(pension.amount)}</strong></div>
        {monthly > 0 && <div>설정 월 납입액 <strong>{fmtS(monthly)}</strong></div>}
      </div>
      <SLabel>납입일</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)}
          style={{ width: "100%", border: "none", padding: "11px 12px", fontSize: 14, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      <SLabel>납입액</SLabel>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 8, display: "flex", alignItems: "center" }}>
        <input value={amtStr} onChange={e => setAmtStr(e.target.value.replace(/[^\d]/g, ""))} placeholder={monthly ? String(monthly) : "0"}
          style={{ flex: 1, border: "none", padding: "11px 12px", fontSize: 20, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, fontVariantNumeric: "tabular-nums" }} />
        <span style={{ padding: "0 14px 0 4px", color: C.inkLight, fontSize: 13 }}>원</span>
      </div>
      {amt > 0 && (
        <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: C.inkMid }}>
          납입 후 적립액 → <strong style={{ color: "#2d5cb8" }}>{fmtS(pension.amount + amt)}</strong>
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: "#e07a5f", fontWeight: 600, marginBottom: 10 }}>{err}</div>}
      <button onClick={submit} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#2d5cb8", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
        납입 완료
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

/* ── Grant Edit Form ── */
function GrantEditForm({ grantName, grantDate, onSave }) {
  const [name, setName] = useState(grantName);
  const [date, setDate] = useState(grantDate || "");
  const [err,  setErr]  = useState(false);
  function submit() {
    if (!name.trim()) { setErr(true); setTimeout(() => setErr(false), 400); return; }
    onSave({ oldName: grantName, newName: name.trim(), newDate: date || null });
  }
  return (
    <div style={{ fontFamily: F }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 16 }}>그랜트 수정</div>
      <div style={{ marginBottom: 12 }}>
        <SLabel>Grant ID</SLabel>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="AMK1066155"
          style={{ width: "100%", border: `1.5px solid ${err && !name.trim() ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <SLabel>Award Date <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(선택)</span></SLabel>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: date ? C.ink : C.inkLight, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      <button onClick={submit} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#2d6a4f", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Check size={16} /> 저장
      </button>
    </div>
  );
}

/* ── Vesting Form (RSU) ── */
function VestingForm({ initial, onSave, onDelete }) {
  const init = initial || {};
  const [ticker,       setTicker]       = useState(init.ticker       || "AMAT");
  const [name,         setName]         = useState(init.name         || "");
  const [shares,       setShares]       = useState(init.shares       ? String(init.shares) : "");
  const [vestDate,     setVestDate]     = useState(init.vestDate     || "");
  const [grantDate,    setGrantDate]    = useState(init.grantDate    || "");
  const [vestPrice,    setVestPrice]    = useState(init.vestPrice    ? String(init.vestPrice) : "");
  const [grantPrice,   setGrantPrice]   = useState(init.grantPrice   ? String(init.grantPrice) : "");
  const [err, setErr] = useState(false);
  const isEdit = !!onDelete;

  function submit() {
    const sh = parseFloat(shares);
    if (!ticker.trim() || !name.trim() || !sh || sh <= 0 || !vestDate) {
      setErr(true); setTimeout(() => setErr(false), 400); return;
    }
    onSave({ id: init.id || Date.now(), type: "RSU", ticker: ticker.trim().toUpperCase(), name: name.trim(), shares: sh, vestDate, grantDate: grantDate || null, grantPrice: grantPrice ? parseFloat(grantPrice) : null, vestPrice: vestPrice ? parseFloat(vestPrice) : (init.vestPrice ?? null), vested: init.vested ?? false, institution: init.institution || "UBS", accountSuffix: init.accountSuffix || "", memo: init.memo || "" });
  }

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{isEdit ? "RSU 수정" : "RSU 추가"}</span>
        {isEdit && <button onClick={onDelete} style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff1ee", border: "1px solid #f4c5b2", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#b5451b", fontSize: 12, fontWeight: 600 }}><Trash2 size={13} /> 삭제</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 10 }}>
        <div><SLabel>티커</SLabel>
          <input value={ticker} onChange={e => setTicker(e.target.value)} placeholder="AMAT"
            style={{ width: "100%", border: `1.5px solid ${err && !ticker.trim() ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", textTransform: "uppercase" }} />
        </div>
        <div><SLabel>그랜트명 / Grant ID</SLabel>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="AMK1066155"
            style={{ width: "100%", border: `1.5px solid ${err && !name.trim() ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div><SLabel>어워드일 <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(선택)</span></SLabel>
          <input type="date" value={grantDate} onChange={e => setGrantDate(e.target.value)}
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: grantDate ? C.ink : C.inkLight, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
        <div><SLabel>부여가 (USD) <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(선택)</span></SLabel>
          <input type="text" inputMode="decimal" value={grantPrice} onChange={e => setGrantPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="175.00"
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div><SLabel>베스팅 주수</SLabel>
          <input type="text" inputMode="decimal" value={shares} onChange={e => setShares(e.target.value)} placeholder="50"
            style={{ width: "100%", border: `1.5px solid ${err && !parseFloat(shares) ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 15, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
        <div><SLabel>베스팅일</SLabel>
          <input type="date" value={vestDate} onChange={e => setVestDate(e.target.value)}
            style={{ width: "100%", border: `1.5px solid ${err && !vestDate ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: vestDate ? C.ink : C.inkLight, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
      </div>
      {init.vested && (
        <div style={{ marginBottom: 10 }}>
          <SLabel>취득가 / 베스팅가 (USD)</SLabel>
          <input type="text" inputMode="decimal" value={vestPrice} onChange={e => setVestPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="256.99"
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
      )}
      <button onClick={submit} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#2d6a4f", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F, boxShadow: "0 4px 18px #2d6a4f55", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10 }}>
        {isEdit ? <><Check size={16} /> 저장</> : <><Plus size={16} /> 추가</>}
      </button>
    </div>
  );
}

/* ── Vest Complete Form ── */
function VestCompleteForm({ item, currentPrice, onComplete, onClose }) {
  const [vestPrice, setVestPrice] = useState(currentPrice ? String(currentPrice.toFixed(2)) : "");
  const [addToStocks, setAddToStocks] = useState(true);
  const [err, setErr] = useState(false);

  function submit() {
    const vp = parseFloat(vestPrice);
    if (!vp || vp <= 0) { setErr(true); setTimeout(() => setErr(false), 400); return; }
    onComplete(vp, addToStocks);
  }

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 6 }}>베스팅 완료 처리</div>
      <div style={{ fontSize: 13, color: C.inkMid, marginBottom: 20 }}>{item.name} · {item.shares}주 · {item.vestDate}</div>
      <div style={{ marginBottom: 16 }}>
        <SLabel>베스팅 시점 주가 (USD)</SLabel>
        <input type="text" inputMode="decimal" value={vestPrice} onChange={e => setVestPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="45.00" autoFocus
          style={{ width: "100%", border: `1.5px solid ${err ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 16, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      <button onClick={() => setAddToStocks(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: addToStocks ? "#2d6a4f18" : C.paper, border: `1.5px solid ${addToStocks ? "#2d6a4f" : C.border}`, borderRadius: 10, padding: "11px 14px", cursor: "pointer", marginBottom: 18, textAlign: "left" }}>
        <div style={{ width: 18, height: 18, borderRadius: 5, background: addToStocks ? "#2d6a4f" : C.white, border: `2px solid ${addToStocks ? "#2d6a4f" : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {addToStocks && <Check size={11} color="#fff" />}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: addToStocks ? "#2d6a4f" : C.inkMid }}>보유주식에 자동 등록 (베스팅가를 매입가로)</span>
      </button>
      <button onClick={submit} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#2d6a4f", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F }}>완료 처리</button>
    </div>
  );
}

/* ── ESPP Form (완료된 구매 직접 입력 → 포트폴리오 추가) ── */
function EsppForm({ initial, onSave, onDelete }) {
  const init = initial || {};
  const defaultPlanId = init.accountSuffix || (init.name && !/^\s*AMAT\s*\(ESPP\)\s*$/i.test(init.name) ? init.name : "");
  const [planId,   setPlanId]   = useState(defaultPlanId);
  const [date,     setDate]     = useState(init.purchaseDate  || "");
  const [shares,   setShares]   = useState(init.shares        ? String(init.shares) : "");
  const [avgPrice, setAvgPrice] = useState(init.avgPrice      ? String(init.avgPrice) : "");
  const [err, setErr] = useState(false);
  const isEdit = !!onDelete;

  function submit() {
    const sh = parseInt(shares);
    const ap = parseFloat(avgPrice);
    if (!date || !sh || sh <= 0 || !ap || ap <= 0) {
      setErr(true); setTimeout(() => setErr(false), 400); return;
    }
    onSave({ id: init.id || Date.now(), ticker: "AMAT", name: "AMAT (ESPP)", market: "US", shares: sh, avgPrice: ap, currentPrice: null, lastFetched: null, purchaseDate: date, purchaseRate: null, institution: init.institution || "UBS", accountSuffix: planId.trim() });
  }

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{isEdit ? "ESPP 수정" : "ESPP 추가"}</span>
        {isEdit && <button onClick={onDelete} style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff1ee", border: "1px solid #f4c5b2", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#b5451b", fontSize: 12, fontWeight: 600 }}><Trash2 size={13} /> 삭제</button>}
      </div>
      <div style={{ marginBottom: 12 }}>
        <SLabel>Plan ID <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>— 오퍼링 구분용 (예: 2026 H1)</span></SLabel>
        <input value={planId} onChange={e => setPlanId(e.target.value)} placeholder="2026 H1"
          style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        <div><SLabel>구매일</SLabel>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width: "100%", border: `1.5px solid ${err && !date ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: date ? C.ink : C.inkLight, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
        <div><SLabel>주식수</SLabel>
          <input type="text" inputMode="numeric" value={shares} onChange={e => setShares(e.target.value.replace(/\D/g, ""))} placeholder="48"
            style={{ width: "100%", border: `1.5px solid ${err && !parseInt(shares) ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 15, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
        <div><SLabel>취득가 USD <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>Cost/Other Basis</span></SLabel>
          <input type="text" inputMode="decimal" value={avgPrice} onChange={e => setAvgPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="133.9345"
            style={{ width: "100%", border: `1.5px solid ${err && !parseFloat(avgPrice) ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
      </div>
      <button onClick={submit} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#2469b3", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F, boxShadow: "0 4px 18px #2469b355", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {isEdit ? <><Check size={16} /> 저장</> : <><Plus size={16} /> 추가</>}
      </button>
    </div>
  );
}

/* ── (구) ESPP Complete Form — 더 이상 사용 안 함 ── */
function EsppCompleteForm({ item, currentPrice, rate, onComplete }) {
  const offerBase = item.startPrice && currentPrice ? Math.min(item.startPrice, currentPrice) : (item.startPrice || currentPrice || 0);
  const calcPrice = offerBase ? offerBase * (1 - (item.discountPct || 15) / 100) : 0;
  const [purchasePrice, setPurchasePrice] = useState(calcPrice ? calcPrice.toFixed(2) : "");
  const start = new Date(item.startDate), end = new Date(item.endDate);
  const months = Math.max(1, Math.round((end - start) / (30.44 * 86400000)));
  const totalKrw = (item.monthlyKrw || 0) * months;
  const pp = parseFloat(purchasePrice);
  const estShares = pp && rate ? Math.floor(totalKrw / (pp * rate)) : 0;
  const [err, setErr] = useState(false);

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 6 }}>ESPP 구매 완료</div>
      <div style={{ fontSize: 13, color: C.inkMid, marginBottom: 20 }}>{item.name} · {item.startDate} ~ {item.endDate}</div>
      <div style={{ marginBottom: 16 }}>
        <SLabel>실제 매입가 (USD)</SLabel>
        <input type="text" inputMode="decimal" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value.replace(/[^0-9.]/g, ""))} autoFocus
          style={{ width: "100%", border: `1.5px solid ${err ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 16, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      {estShares > 0 && (
        <div style={{ background: "#2469b310", border: "1px solid #2469b330", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: "#2469b3", fontWeight: 600 }}>
          예상 매입 주수: {estShares}주 ({fmtS(totalKrw)} ÷ ${pp?.toFixed(2)} × {rate?.toLocaleString("ko-KR")}원)
        </div>
      )}
      <button onClick={() => { const vp = parseFloat(purchasePrice); if (!vp) { setErr(true); setTimeout(() => setErr(false), 400); return; } onComplete(vp, estShares); }}
        style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#2469b3", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F }}>주식에 등록</button>
    </div>
  );
}

/* ── Vesting Batch Form (RSU 일괄 입력) ── */
function VestingBatchForm({ onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const [ticker,          setTicker]        = useState("AMAT");
  const [grantName,       setGrantName]     = useState("");
  const [awardDate,       setAwardDate]     = useState("");
  const [totalShares,     setTotalShares]   = useState("");
  const [grantPrice,      setGrantPrice]    = useState("");
  const [rows,            setRows]          = useState([]); // {date, shares, vested, vestPrice}
  const [bulkVestPrice,   setBulkVestPrice] = useState(""); // 완료 항목 일괄 베스팅가
  const [autoPortfolio,   setAutoPortfolio] = useState(true);
  const [generated,       setGenerated]     = useState(false);
  const [saving,          setSaving]        = useState(false);
  const [err,             setErr]           = useState(false);

  // 배분 함수: n개 분기에 total주 균등 분배 (나머지는 뒤 분기부터)
  function distribute(total, n) {
    const base = Math.floor(total / n);
    const rem  = total % n;
    return Array.from({ length: n }, (_, i) => base + (i >= n - rem ? 1 : 0));
  }

  function generateSchedule() {
    const year  = awardDate ? parseInt(awardDate.slice(0, 4)) : 0;
    const total = parseInt(totalShares);
    if (!year || year < 2000 || !total || total <= 0) { setErr(true); setTimeout(() => setErr(false), 400); return; }
    const startYear = year + 2;
    const dates = [];
    for (let i = 0; i < 13; i++) {
      const month = [1, 4, 7, 10][i % 4];
      const y     = startYear + Math.floor(i / 4);
      dates.push(`${y}-${String(month).padStart(2, "0")}-01`);
    }
    // 첫 베스팅 = floor(총주수/4), 나머지 12회에 균등 분배
    const first = Math.floor(total / 4);
    const rest  = distribute(total - first, 12);
    const shares = [first, ...rest];
    setRows(dates.map((date, i) => ({ date, shares: String(shares[i]), vested: date < today, vestPrice: "" })));
    setGenerated(true);
  }

  const toggleVested = i => setRows(p => p.map((r, j) => j === i ? { ...r, vested: !r.vested } : r));
  const setRowVPrice = (i, v) => setRows(p => p.map((r, j) => j === i ? { ...r, vestPrice: v } : r));

  // 행 주수 수정 시 총합 유지 — 이후 행들에 차액 자동 재분배
  const setRowShares = (i, v) => {
    setRows(p => {
      const newVal = parseInt(v) || 0;
      const oldVal = parseInt(p[i].shares) || 0;
      const delta  = newVal - oldVal;
      if (delta === 0) return p.map((r, j) => j === i ? { ...r, shares: String(newVal) } : r);
      const afterIdx = p.slice(i + 1).map((_, k) => i + 1 + k);
      if (afterIdx.length === 0) return p.map((r, j) => j === i ? { ...r, shares: String(newVal) } : r);
      const totalAfter = afterIdx.reduce((s, j) => s + (parseInt(p[j].shares) || 0), 0);
      const newTotalAfter = totalAfter - delta;
      if (newTotalAfter < 0) return p; // 불가능한 조정 무시
      const redist = distribute(newTotalAfter, afterIdx.length);
      return p.map((r, j) => {
        if (j === i) return { ...r, shares: String(newVal) };
        const k = afterIdx.indexOf(j);
        if (k !== -1) return { ...r, shares: String(redist[k]) };
        return r;
      });
    });
  };

  // 완료 항목 전체에 일괄 베스팅가 적용
  const applyBulkVestPrice = () => {
    const v = bulkVestPrice.replace(/[^0-9.]/g, "");
    if (!v) return;
    setRows(p => p.map(r => r.vested ? { ...r, vestPrice: v } : r));
  };

  const rowTotal    = rows.reduce((s, r) => s + (parseInt(r.shares) || 0), 0);
  const vestedCount = rows.filter(r => r.vested).length;
  const pendingCount= rows.length - vestedCount;

  async function saveAll() {
    if (!grantName.trim() || !ticker.trim() || rows.length === 0) return;
    setSaving(true);
    const base = Date.now();
    const gp  = grantPrice ? parseFloat(grantPrice) : null;
    const tkr = ticker.trim().toUpperCase();
    const nm  = grantName.trim();
    const vestings = rows.map((r, i) => ({
      id: base + i, type: "RSU", ticker: tkr, name: nm,
      shares: parseInt(r.shares) || 0, vestDate: r.date,
      grantDate: awardDate || null,
      grantPrice: gp, vestPrice: r.vestPrice ? parseFloat(r.vestPrice) : null,
      vested: r.vested, institution: "UBS", accountSuffix: "", memo: "",
    }));
    // 포트폴리오 자동 등록: vested + vestPrice 있는 행
    const stocksToAdd = autoPortfolio
      ? rows.filter(r => r.vested && r.vestPrice && parseFloat(r.vestPrice) > 0 && parseInt(r.shares) > 0)
          .map((r, i) => ({
            id: base + 1000 + i, ticker: tkr, name: tkr, market: "US",
            shares: parseInt(r.shares), avgPrice: parseFloat(r.vestPrice),
            currentPrice: null, lastFetched: null,
            purchaseDate: r.date, purchaseRate: null,
            institution: "UBS", accountSuffix: "",
          }))
      : [];
    await onSave(vestings, stocksToAdd);
    setSaving(false);
  }

  const awardYear = awardDate ? awardDate.slice(0, 4) : "";
  const startYear = awardYear ? parseInt(awardYear) + 2 : "";

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 16 }}>RSU 일괄 입력</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 10 }}>
        <div><SLabel>티커</SLabel>
          <input value={ticker} onChange={e => setTicker(e.target.value)} placeholder="AMAT"
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", textTransform: "uppercase" }} />
        </div>
        <div><SLabel>그랜트 ID <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>— UBS의 Grant ID (예: AMK1066155)</span></SLabel>
          <input value={grantName} onChange={e => setGrantName(e.target.value)} placeholder="AMK1066155"
            style={{ width: "100%", border: `1.5px solid ${err && !grantName.trim() ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><SLabel>어워드일</SLabel>
          <input type="date" value={awardDate} onChange={e => { setAwardDate(e.target.value); setGenerated(false); }}
            style={{ width: "100%", border: `1.5px solid ${err && !awardDate ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: awardDate ? C.ink : C.inkLight, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
        <div><SLabel>총 부여 주수</SLabel>
          <input type="text" inputMode="numeric" value={totalShares} onChange={e => { setTotalShares(e.target.value.replace(/\D/g, "")); setGenerated(false); }} placeholder="55"
            style={{ width: "100%", border: `1.5px solid ${err && !parseInt(totalShares) ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
        <div><SLabel>부여가 USD <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(선택)</span></SLabel>
          <input type="text" inputMode="decimal" value={grantPrice} onChange={e => setGrantPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="175.00"
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button onClick={generateSchedule}
            style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "none", background: "#2d6a4f", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
            일정 생성
          </button>
        </div>
      </div>
      {awardYear && parseInt(awardYear) > 2000 && (
        <div style={{ fontSize: 11, color: C.inkLight, marginBottom: 10, paddingLeft: 2 }}>
          {awardDate} 어워드 → {startYear}-01-01 ~ {startYear + 3}-01-01 · 분기별 13회
        </div>
      )}

      {generated && rows.length > 0 && (<>
        {/* 완료 항목 일괄 베스팅가 */}
        {vestedCount > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <SLabel>완료 항목 베스팅가 (USD) <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>— Cost/Other Basis 값 입력 후 일괄 적용</span></SLabel>
              <input type="text" inputMode="decimal" value={bulkVestPrice}
                onChange={e => setBulkVestPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="256.99"
                style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
            </div>
            <button onClick={applyBulkVestPrice}
              style={{ padding: "10px 14px", borderRadius: 10, border: `1.5px solid #2d6a4f`, background: "#fff", color: "#2d6a4f", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: F, whiteSpace: "nowrap", marginBottom: 0 }}>
              완료 항목에<br/>일괄 적용
            </button>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 76px 68px", gap: 0, padding: "4px 6px", background: C.paper, borderRadius: "10px 10px 0 0", border: `1px solid ${C.border}` }}>
            <div />
            <div style={{ fontSize: 10, fontWeight: 700, color: C.inkLight, letterSpacing: "0.06em", textTransform: "uppercase" }}>베스팅일</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "center" }}>베스팅가$</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.inkLight, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "right", paddingRight: 8 }}>주수</div>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${C.border}`, borderTop: "none" }}>
            {rows.map((row, i) => (
              <div key={i} onClick={() => toggleVested(i)}
                style={{ display: "grid", gridTemplateColumns: "28px 1fr 76px 68px", background: row.vested ? "#2d6a4f0a" : (i % 2 === 0 ? C.white : C.paper), borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none", alignItems: "center", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: 6 }}>
                  <div style={{ width: 15, height: 15, borderRadius: 4, background: row.vested ? "#2d6a4f" : C.white, border: `2px solid ${row.vested ? "#2d6a4f" : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {row.vested && <Check size={8} color="#fff" />}
                  </div>
                </div>
                <div style={{ padding: "7px 4px", fontSize: 12, color: row.vested ? C.inkMid : C.ink, fontVariantNumeric: "tabular-nums" }}>{row.date}</div>
                <div style={{ padding: "3px 4px" }} onClick={e => e.stopPropagation()}>
                  {row.vested
                    ? <input type="text" inputMode="decimal" value={row.vestPrice}
                        onChange={e => setRowVPrice(i, e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="—"
                        style={{ width: "100%", border: `1.5px solid ${row.vestPrice ? "#2d6a4f50" : C.border}`, borderRadius: 6, padding: "3px 5px", fontSize: 12, fontWeight: 700, color: "#2d6a4f", background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", textAlign: "right" }} />
                    : <div style={{ textAlign: "center", fontSize: 11, color: C.inkLight }}>—</div>
                  }
                </div>
                <div style={{ padding: "3px 8px 3px 4px" }} onClick={e => e.stopPropagation()}>
                  <input type="text" inputMode="numeric" value={row.shares}
                    onChange={e => setRowShares(i, e.target.value.replace(/\D/g, ""))}
                    style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 6, padding: "3px 5px", fontSize: 12, fontWeight: 700, color: row.vested ? C.inkMid : C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", textAlign: "right" }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", background: rowTotal === parseInt(totalShares) ? "#2d6a4f15" : "#e07a5f15", border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 10px 10px", fontSize: 12, fontWeight: 700 }}>
            <span style={{ color: C.inkMid }}>합계</span>
            <span style={{ color: rowTotal === parseInt(totalShares) ? "#2d6a4f" : "#b5451b" }}>{rowTotal}주 / {totalShares}주</span>
          </div>
        </div>
      </>)}

      {generated && vestedCount > 0 && (
        <button onClick={() => setAutoPortfolio(v => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: autoPortfolio ? "#2d6a4f18" : C.paper, border: `1.5px solid ${autoPortfolio ? "#2d6a4f" : C.border}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", marginBottom: 12, textAlign: "left" }}>
          <div style={{ width: 17, height: 17, borderRadius: 5, background: autoPortfolio ? "#2d6a4f" : C.white, border: `2px solid ${autoPortfolio ? "#2d6a4f" : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {autoPortfolio && <Check size={10} color="#fff" />}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: autoPortfolio ? "#2d6a4f" : C.inkMid }}>완료 항목 보유주식에 자동 등록</div>
            <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>베스팅가가 입력된 완료 항목을 포트폴리오에 추가 (베스팅가 = 취득단가)</div>
          </div>
        </button>
      )}

      <button onClick={saveAll} disabled={saving || !generated || rows.length === 0}
        style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: generated ? "#2d6a4f" : C.border, color: "#fff", fontSize: 15, fontWeight: 700, cursor: generated ? "pointer" : "default", fontFamily: F, opacity: saving ? 0.6 : 1, boxShadow: generated ? "0 4px 18px #2d6a4f55" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Check size={16} /> {saving ? "저장 중…" : generated ? `전체 저장 (완료 ${vestedCount} + 예정 ${pendingCount}건)` : "일정을 먼저 생성하세요"}
      </button>
    </div>
  );
}

/* ── Main ── */
export default function AssetsApp() {
  const [assets,   setAssets]   = useState([]);
  const [stocks,   setStocks]   = useState([]);
  const [cats,     setCats]     = useState(DEFAULT_CATS);
  const [usdKrw,   setUsdKrw]   = useState(null);
  const [prices,   setPrices]   = useState({});
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [modal,    setModal]    = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [tab,      setTab]      = useState("stock");
  const [expanded, setExpanded] = useState(null);
  const [expandedAccounts, setExpandedAccounts] = useState(new Set());
  const [expandedCats, setExpandedCats] = useState(new Set());
  const [lastSaved, setLastSaved] = useState(null);
  const [dbLoading, setDbLoading] = useState(true);
  const [addInitial, setAddInitial] = useState(null);
  const [snapshots,     setSnapshots]     = useState([]);
  const [vestings,      setVestings]      = useState([]);
  const [offerings,     setOfferings]     = useState([]);
  const [openHoldings,  setOpenHoldings]  = useState(new Set());
  const [openDCAccts,   setOpenDCAccts]   = useState(new Set());
  const [dcEtfInst,     setDcEtfInst]     = useState("");
  const [vestingPrices, setVestingPrices] = useState({});
  const snapshotsRef = useRef([]);
  useEffect(() => { snapshotsRef.current = snapshots; }, [snapshots]);

  /* ── Supabase: initial load ── */
  useEffect(() => {
    if (!isConfigured()) { setDbLoading(false); return; }
    Promise.all([
      sb("assets?select=*&order=id"),
      sb("stocks?select=*&order=id"),
      sb("settings?select=*"),
      sb("asset_snapshots?select=*&order=recorded_at&limit=60"),
      sb("vesting_schedule?select=*&order=vest_date"),
      sb("espp_offerings?select=*&order=end_date"),
    ]).then(([dbAssets, dbStocks, dbSettings, dbSnaps, dbVestings, dbOfferings]) => {
      if (dbAssets) setAssets(dbAssets.map(fromDbAsset));
      if (dbStocks) {
        const loaded = dbStocks.map(fromDbStock);
        setStocks(loaded);
        // DB에 저장된 현재가를 prices에 반영
        const savedPrices = {};
        loaded.forEach(s => { if (s.currentPrice != null) savedPrices[s.id] = s.currentPrice; });
        setPrices(savedPrices);
        // 종목명이 티커와 같거나 오염된 형태면 백그라운드에서 실명으로 자동 갱신
        const isBadName = s => s.name === s.ticker || s.name.includes(',') || /^\d{5,6}\.(KS|KQ)/i.test(s.name);
        loaded.filter(isBadName).forEach(async s => {
          const sym = s.market === "KR" ? `${s.ticker}.KS` : s.ticker;
          try {
            const r = await fetch(`/api/stock?symbol=${encodeURIComponent(sym)}`);
            if (!r.ok) return;
            const { name } = await r.json();
            if (!name) return;
            setStocks(prev => prev.map(x => x.id === s.id ? { ...x, name } : x));
            sb("stocks", { method: "POST", body: JSON.stringify({ ...toDbStock(s), name }), prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
          } catch {}
        });
      }
      if (dbSettings) {
        const byKey = Object.fromEntries(dbSettings.map(r => [r.key, r.value]));
        if (byKey.cats?.length) setCats(byKey.cats);
        if (byKey.usdKrw)      setUsdKrw(byKey.usdKrw);
      }
      if (dbSnaps)     setSnapshots(dbSnaps.map(fromDbSnap));
      if (dbVestings)  setVestings(dbVestings.map(fromDbVesting));
      if (dbOfferings) setOfferings(dbOfferings.map(fromDbOffering));
    }).catch(e => console.error("[DB load]", e))
      .finally(() => setDbLoading(false));
  }, []);

  /* ── Price refresh ── */
  const refreshPrices = useCallback(async () => {
    if (!stocks.length) return;
    setFetching(true);
    setFetchErr(0);
    const newPrices = {};
    let rate = usdKrw;

    try {
      rate = await fetchUSDKRW();
      setUsdKrw(rate);
      if (isConfigured()) sb("settings", { method: "POST", body: JSON.stringify({ key: "usdKrw", value: rate }), prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
    } catch {}

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
        sb(`stocks?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ current_price: p, last_fetched: ts }), prefer: "return=minimal" }).catch(() => {})
      );
    }
    // vesting 티커 시세도 갱신
    const vtickers = [...new Set([...vestings.filter(v => !v.vested).map(v => v.ticker), ...offerings.map(o => o.ticker)])];
    if (vtickers.length) {
      const vprices = {};
      await Promise.allSettled(vtickers.map(async t => {
        const p = await fetchStockPrice(t, "US");
        if (p) vprices[t.toUpperCase()] = p;
      }));
      setVestingPrices(prev => ({ ...prev, ...vprices }));
    }
    const now = new Date().toLocaleString("ko-KR");
    setLastSync(now);
    setFetching(false);
  }, [stocks, usdKrw, vestings, offerings]);

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
      return sum + (s.market === "US" ? Math.round(val * (s.purchaseRate ?? rate)) : val);
    }, 0), [stocks, rate]);

  const stockGain = stockValue - stockCost;
  const stockGainPct = stockCost > 0 ? ((stockGain / stockCost) * 100).toFixed(2) : "0.00";

  const depositTotal = useMemo(() => assets.filter(a => a.cat === "예수금").reduce((s, a) => s + a.amount, 0), [assets]);

  const dcEtfStocks = useMemo(() => stocks.filter(s => s.accountSuffix === DC_ETF_MARKER), [stocks]);
  const dcAccounts  = useMemo(() => assets.filter(a => a.cat === "퇴직연금" && a.accountSuffix === "DC"), [assets]);

  // ETF 종목 → 소유 DC 계좌 ID 매핑
  // 1순위: institution 필드가 DC 계좌 id와 일치 (새 방식)
  // 2순위: institution 필드가 DC 계좌 institution명과 일치하되 유일한 경우만 (구 방식 backward compat)
  const etfToAcctId = useMemo(() => {
    const map = {};
    dcEtfStocks.forEach(s => {
      if (dcAccounts.some(a => String(a.id) === s.institution)) {
        map[s.id] = s.institution;
        return;
      }
      const matches = dcAccounts.filter(a => a.institution === s.institution);
      if (matches.length === 1) map[s.id] = String(matches[0].id);
    });
    return map;
  }, [dcEtfStocks, dcAccounts]);

  const dcEtfValueByAcctId = useMemo(() => {
    const m = {};
    dcEtfStocks.forEach(s => {
      const acctId = etfToAcctId[s.id];
      if (!acctId) return;
      const p = prices[s.id] ?? s.currentPrice ?? s.avgPrice ?? 0;
      const val = s.market === "US" ? Math.round(p * s.shares * rate) : Math.round(p * s.shares);
      m[acctId] = (m[acctId] || 0) + val;
    });
    return m;
  }, [dcEtfStocks, etfToAcctId, prices, rate]);

  const pensionTotal = useMemo(() => assets.filter(a => a.cat === "퇴직연금").reduce((sum, a) => {
    if (a.accountSuffix === "DC" && dcEtfValueByAcctId[String(a.id)] != null)
      return sum + dcEtfValueByAcctId[String(a.id)];
    return sum + (a.amount || 0);
  }, 0), [assets, dcEtfValueByAcctId]);
  const assetTotal = useMemo(() => assets.filter(a => a.cat !== "예수금" && a.cat !== "퇴직연금" && a.cat !== "대출").reduce((s, a) => s + a.amount, 0), [assets]);
  const loanTotal  = useMemo(() => assets.filter(a => a.cat === "대출").reduce((s, a) => s + a.amount, 0), [assets]);

  const institutionSuggestions = useMemo(() => {
    const seen = new Set();
    const result = [];
    [...stocks].reverse().forEach(s => { if (s.institution && !seen.has(s.institution)) { seen.add(s.institution); result.push(s.institution); } });
    [...assets].reverse().forEach(a => { if (a.institution && !seen.has(a.institution)) { seen.add(a.institution); result.push(a.institution); } });
    return result;
  }, [stocks, assets]);
  const total = stockValue + depositTotal + assetTotal + pensionTotal;

  /* ── Pie data ── */
  const pieData = useMemo(() => {
    const m = {};
    if (stockValue > 0) m["주식"] = (m["주식"] || 0) + stockValue;
    assets.forEach(a => { m[a.cat] = (m[a.cat] || 0) + a.amount; });
    const effectiveCats = cats.find(c => c.key === "예수금") ? cats : [...cats, { key: "예수금", color: "#0d7377" }];
    return effectiveCats.filter(c => m[c.key] > 0)
      .map(c => ({ name: c.key, value: m[c.key], color: c.color }))
      .sort((a, b) => b.value - a.value);
  }, [assets, stockValue, cats]);

  /* ── unvested RSU 예상가치 ── */
  const unvestedValue = useMemo(() =>
    vestings.filter(v => !v.vested).reduce((sum, v) => {
      const p = vestingPrices[v.ticker.toUpperCase()];
      return p ? sum + Math.round(p * v.shares * rate) : sum;
    }, 0), [vestings, vestingPrices, rate]);

  /* ── CRUD: vestings ── */
  const upsertVesting = v => isConfigured() && sb("vesting_schedule", { method: "POST", body: JSON.stringify(toDbVesting(v)), prefer: "resolution=merge-duplicates,return=minimal" }).then(markSaved).catch(e => console.error("[upsertVesting]", e));
  function addVesting(v)    { setVestings(p => [...p, v]); setModal(null); upsertVesting(v); }
  async function addBatchVestings(vs, stocksToAdd = []) {
    setVestings(p => [...p, ...vs]);
    if (stocksToAdd.length > 0) setStocks(p => [...p, ...stocksToAdd]);
    setModal(null);
    if (isConfigured()) {
      await sb("vesting_schedule", { method: "POST", body: JSON.stringify(vs.map(toDbVesting)), prefer: "resolution=merge-duplicates,return=minimal" }).catch(e => console.error("[batchVesting]", e));
      if (stocksToAdd.length > 0) {
        await sb("stocks", { method: "POST", body: JSON.stringify(stocksToAdd.map(toDbStock)), prefer: "resolution=merge-duplicates,return=minimal" }).catch(e => console.error("[batchStocks]", e));
      }
      markSaved();
    }
  }
  function updateVesting(v) {
    setVestings(p => p.map(x => x.id === v.id ? v : x));
    setModal(null); setEditItem(null);
    upsertVesting(v);
    // 보유에서 수정한 경우 연결된 stock의 avgPrice/shares 싱크
    if (v.vested && v.vestPrice != null) {
      const linked = stocks.find(s => s.ticker.toUpperCase() === v.ticker.toUpperCase() && s.purchaseDate === v.vestDate && !/espp/i.test(s.name));
      if (linked && (linked.avgPrice !== v.vestPrice || linked.shares !== v.shares)) {
        const updated = { ...linked, avgPrice: v.vestPrice, shares: v.shares };
        setStocks(p => p.map(x => x.id === linked.id ? updated : x));
        upsertStock(updated);
      }
    }
  }
  function deleteVesting(id){ setVestings(p => p.filter(x => x.id !== id)); setModal(null); setEditItem(null); if (isConfigured()) sb(`vesting_schedule?id=eq.${id}`, { method: "DELETE" }).catch(() => {}); }
  function updateGrant({ oldName, newName, newDate }) {
    const toUpdate = vestings.filter(v => v.name === oldName);
    setVestings(p => p.map(v => v.name === oldName ? { ...v, name: newName, grantDate: newDate } : v));
    setModal(null); setEditItem(null);
    if (isConfigured()) toUpdate.forEach(v => upsertVesting({ ...v, name: newName, grantDate: newDate }));
  }
  function deleteGrant(name) {
    const grantVestings = vestings.filter(v => v.name === name);
    const vestDates     = new Set(grantVestings.filter(v => v.vested).map(v => v.vestDate));
    const stocksToKill  = stocks.filter(s => s.ticker.toUpperCase() === "AMAT" && !/espp/i.test(s.name) && vestDates.has(s.purchaseDate));
    const vestingIds    = grantVestings.map(v => v.id);
    const stockIds      = stocksToKill.map(s => s.id);
    setVestings(p => p.filter(v => v.name !== name));
    if (stockIds.length > 0) setStocks(p => p.filter(s => !stockIds.includes(s.id)));
    if (isConfigured()) {
      if (vestingIds.length > 0) sb(`vesting_schedule?id=in.(${vestingIds.join(",")})`, { method: "DELETE" }).catch(() => {});
      if (stockIds.length > 0)   sb(`stocks?id=in.(${stockIds.join(",")})`,           { method: "DELETE" }).catch(() => {});
    }
  }
  function vestComplete(item, vestPrice, addToPortfolio) {
    const updated = { ...item, vestPrice, vested: true };
    setVestings(p => p.map(x => x.id === item.id ? updated : x));
    sb(`vesting_schedule?id=eq.${item.id}`, { method: "PATCH", body: JSON.stringify({ vest_price: vestPrice, vested: true }), prefer: "return=minimal" }).catch(() => {});
    if (addToPortfolio) {
      const stock = { id: Date.now(), ticker: item.ticker, name: item.ticker, market: "US", shares: item.shares, avgPrice: vestPrice, currentPrice: null, lastFetched: null, purchaseDate: item.vestDate, purchaseRate: rate || null, institution: item.institution, accountSuffix: item.accountSuffix };
      addStock(stock);
    } else { setModal(null); setEditItem(null); }
  }

  /* ── CRUD: offerings ── */
  const upsertOffering = o => isConfigured() && sb("espp_offerings", { method: "POST", body: JSON.stringify(toDbOffering(o)), prefer: "resolution=merge-duplicates,return=minimal" }).then(markSaved).catch(e => console.error("[upsertOffering]", e));
  function addOffering(o)    { setOfferings(p => [...p, o]); setModal(null); upsertOffering(o); }
  function updateOffering(o) { setOfferings(p => p.map(x => x.id === o.id ? o : x)); setModal(null); setEditItem(null); upsertOffering(o); }
  function deleteOffering(id){ setOfferings(p => p.filter(x => x.id !== id)); setModal(null); setEditItem(null); if (isConfigured()) sb(`espp_offerings?id=eq.${id}`, { method: "DELETE" }).catch(() => {}); }
  function esppComplete(item, purchasePrice, shares) {
    deleteOffering(item.id);
    if (shares > 0 && purchasePrice > 0) {
      const stock = { id: Date.now(), ticker: item.ticker, name: `${item.ticker} (ESPP)`, market: "US", shares, avgPrice: purchasePrice, currentPrice: null, lastFetched: null, purchaseDate: item.endDate, purchaseRate: rate || null, institution: item.institution, accountSuffix: item.accountSuffix };
      addStock(stock);
    }
  }

  /* ── CRUD: stocks ── */
  const markSaved = () => setLastSaved(new Date().toLocaleString("ko-KR"));
  const upsertStock = s => isConfigured() && sb("stocks", { method: "POST", body: JSON.stringify(toDbStock(s)), prefer: "resolution=merge-duplicates,return=minimal" }).then(markSaved).catch(e => console.error("[upsertStock]", e));
  const upsertAsset = a => isConfigured() && sb("assets", { method: "POST", body: JSON.stringify(toDbAsset(a)), prefer: "resolution=merge-duplicates,return=minimal" }).then(markSaved).catch(e => console.error("[upsertAsset]", e));

  function addStock(s)    { setStocks(p => [...p, s]); setModal(null); upsertStock(s); }
  function updateStock(s) { setStocks(p => p.map(x => x.id === s.id ? s : x)); setModal(null); setEditItem(null); upsertStock(s); }
  function deleteStock(id){ setStocks(p => p.filter(x => x.id !== id)); setModal(null); setEditItem(null); if (isConfigured()) sb(`stocks?id=eq.${id}`, { method: "DELETE" }).catch(() => {}); }

  /* ── CRUD: assets ── */
  function addAsset(a)    { setAssets(p => [...p, a]); setModal(null); upsertAsset(a); }
  function updateAsset(a) { setAssets(p => p.map(x => x.id === a.id ? a : x)); setModal(null); setEditItem(null); upsertAsset(a); }
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
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 18, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.12)", marginBottom: 16 }}>
            {/* 총 자산 */}
            <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.4, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 3 }}>총 자산 (퇴직연금 포함)</div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-1px", fontVariantNumeric: "tabular-nums" }}>
              {fmtS(total)}<span style={{ fontSize: 14, fontWeight: 400, opacity: 0.5, marginLeft: 4 }}>원</span>
            </div>
            {/* 순자산 / 퇴직연금 제외 — 한 줄 */}
            {(loanTotal > 0 || pensionTotal > 0) && (
              <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", gap: 20, flexWrap: "wrap" }}>
                {loanTotal > 0 && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.4, letterSpacing: "0.1em" }}>순자산</span>
                    <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" }}>{fmtS(total - loanTotal)}</span>
                  </div>
                )}
                {pensionTotal > 0 && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.4, letterSpacing: "0.1em" }}>퇴직연금 제외</span>
                    <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>{fmtS(total - pensionTotal - loanTotal)}</span>
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, opacity: 0.5 }}>주식 {fmtS(stockValue)}</div>
              {depositTotal > 0 && <div style={{ fontSize: 11, opacity: 0.5 }}>예수금 {fmtS(depositTotal)}</div>}
              <div style={{ fontSize: 11, opacity: 0.5 }}>기타자산 {fmtS(assetTotal)}</div>
              {pensionTotal > 0 && <div style={{ fontSize: 11, opacity: 0.5 }}>퇴직연금 {fmtS(pensionTotal)}</div>}
              {loanTotal > 0 && <div style={{ fontSize: 11, color: "#f87171", opacity: 0.85 }}>대출 -{fmtS(loanTotal)}</div>}
              {unvestedValue > 0 && <div style={{ fontSize: 11, opacity: 0.5 }}>미확정 RSU {fmtS(unvestedValue)}</div>}
            </div>
          </div>

          {/* Exchange rate + sync */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 11, opacity: 0.45 }}>
              USD/KRW {rate.toLocaleString("ko-KR")}원
              {lastSync && <span style={{ marginLeft: 8 }}>· {lastSync} 기준</span>}
              {fetchErr > 0 && <span style={{ marginLeft: 8, color: "#f4a261", opacity: 1 }}>· {fetchErr}종목 조회 실패</span>}
              {lastSaved && <span style={{ marginLeft: 8, opacity: 0.7 }}>· 저장 {lastSaved}</span>}
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
          {[["stock", "📈 주식"], ["asset", "🏦 기타자산"], ["pension", "💼 연금·공제"], ["loan", "💳 대출"], ["vest", "🏢 AMAT"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "8px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: tab === k ? 700 : 400, fontSize: 13, background: tab === k ? C.ink : "transparent", color: tab === k ? "#fff" : C.inkLight, fontFamily: F, transition: "all 0.15s" }}>{l}</button>
          ))}
        </div>

        {/* Loading */}
        {dbLoading && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.inkLight, fontSize: 13, fontFamily: F }}>
            <RefreshCw size={18} style={{ marginBottom: 10, opacity: 0.4, display: "inline-block" }} />
            <div>불러오는 중…</div>
          </div>
        )}

        {/* ── Stock Tab ── */}
        {!dbLoading && tab === "stock" && (() => {
          const nonAmat = stocks.filter(s => s.ticker.toUpperCase() !== "AMAT" && s.accountSuffix !== DC_ETF_MARKER);
          const nonAmatValue = nonAmat.reduce((sum, s) => {
            const p = prices[s.id] ?? s.currentPrice ?? s.avgPrice;
            return sum + (s.market === "US" ? Math.round(p * s.shares * rate) : p * s.shares);
          }, 0);
          const nonAmatCost = nonAmat.reduce((sum, s) => {
            const val = s.avgPrice * s.shares;
            return sum + (s.market === "US" ? Math.round(val * (s.purchaseRate ?? rate)) : val);
          }, 0);
          const nonAmatGain = nonAmatValue - nonAmatCost;
          const nonAmatGainPct = nonAmatCost > 0 ? ((nonAmatGain / nonAmatCost) * 100).toFixed(2) : "0.00";
          return (
          <>
            {/* Stock summary */}
            {nonAmat.length > 0 && (
              <div style={{ background: "#2d6a4f", borderRadius: 14, padding: "14px 16px", marginBottom: 10, color: "#fff" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { label: "평가금액", val: fmtS(nonAmatValue), color: "#fff" },
                    { label: "수익금", val: (nonAmatGain >= 0 ? "+" : "") + fmtS(nonAmatGain), color: nonAmatGain >= 0 ? "#6ee7b7" : "#fca5a5" },
                    { label: "수익률", val: (nonAmatGain >= 0 ? "+" : "") + nonAmatGainPct + "%", color: nonAmatGain >= 0 ? "#6ee7b7" : "#fca5a5" },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deposits (예수금) */}
            {(() => {
              const deposits = assets.filter(a => a.cat === "예수금");
              if (deposits.length === 0) return null;
              return (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 8px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, letterSpacing: "0.1em", textTransform: "uppercase" }}>예수금 / 단기자금</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtS(depositTotal)}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {deposits.map(d => (
                      <div key={d.id} style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 6, height: 32, borderRadius: 3, background: "#0d7377", flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {d.institution && (
                              <span style={{ fontSize: 11, fontWeight: 600, color: "#0d7377", background: "#0d737718", border: "1px solid #0d737744", borderRadius: 5, padding: "1px 6px" }}>
                                {d.institution}
                              </span>
                            )}
                            {d.memo && <span style={{ fontSize: 11, color: C.inkLight }}>{d.memo}</span>}
                          </div>
                          <div style={{ fontSize: 10, color: C.inkLight, marginTop: 2 }}>{d.date}</div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtS(d.amount)}</div>
                        <button onClick={() => { setEditItem(d); setModal("editDeposit"); }} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: C.inkMid, display: "flex", alignItems: "center", flexShrink: 0 }}>
                          <Pencil size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Stock list — grouped by account */}
            {nonAmat.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", background: C.white, borderRadius: 16, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.inkMid, marginBottom: 6 }}>보유 종목을 추가해보세요</div>
                <div style={{ fontSize: 12, color: C.inkLight }}>한국·미국 주식 모두 지원</div>
              </div>
            ) : (() => {
              const acctGroups = Object.entries(
                nonAmat.reduce((acc, s) => { const k = s.institution || "계좌 미지정"; (acc[k] = acc[k] || []).push(s); return acc; }, {})
              );
              const toggleAcct = key => setExpandedAccounts(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {acctGroups.map(([acctName, acctStocks]) => {
                    const acctValue = acctStocks.reduce((sum, s) => { const p = prices[s.id] ?? s.currentPrice ?? s.avgPrice; return sum + (s.market === "US" ? Math.round(p * s.shares * rate) : p * s.shares); }, 0);
                    const acctCost  = acctStocks.reduce((sum, s) => { const v = s.avgPrice * s.shares; return sum + (s.market === "US" ? Math.round(v * (s.purchaseRate ?? rate)) : v); }, 0);
                    const acctGain  = acctValue - acctCost;
                    const acctGainPct = acctCost > 0 ? ((acctGain / acctCost) * 100).toFixed(1) : null;
                    const acctPos   = acctGain >= 0;
                    const isAcctOpen = expandedAccounts.has(acctName);

                    return (
                      <div key={acctName} style={{ borderRadius: 16, overflow: "hidden" }}>
                        {/* Account header card */}
                        <button onClick={() => toggleAcct(acctName)} style={{ width: "100%", border: "none", cursor: "pointer", background: "#265a8c", padding: "13px 16px", textAlign: "left", fontFamily: F }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em", flex: 1 }}>{acctName}</div>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{acctStocks.length}종목</span>
                            {isAcctOpen ? <ChevronUp size={13} color="rgba(255,255,255,0.35)" /> : <ChevronDown size={13} color="rgba(255,255,255,0.35)" />}
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                            <div>
                              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginRight: 5 }}>총액</span>
                              <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{fmtS(acctValue)}</span>
                              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginLeft: 4, fontVariantNumeric: "tabular-nums" }}>{fmtS(acctCost)} 투자</span>
                            </div>
                            <div>
                              <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: acctPos ? "#34d399" : "#f87171" }}>
                                {acctPos ? "+" : ""}{fmtS(acctGain)}
                              </span>
                              <span style={{ fontSize: 10, marginLeft: 4, fontVariantNumeric: "tabular-nums", color: acctPos ? "#34d399" : "#f87171", opacity: 0.85 }}>
                                {acctGainPct != null ? `(${acctPos ? "+" : ""}${acctGainPct}%)` : ""}
                              </span>
                            </div>
                          </div>
                        </button>

                        {/* Expanded: individual stocks */}
                        {isAcctOpen && (
                          <div style={{ background: C.white, borderRadius: "0 0 16px 16px", border: `1px solid ${C.border}`, borderTop: "none" }}>
                            {acctStocks.map((s, si) => {
                              const p = prices[s.id] ?? s.currentPrice;
                              const hasPrice = p != null;
                              const valueKrw = hasPrice ? (s.market === "US" ? Math.round(p * s.shares * rate) : p * s.shares) : null;
                              const costKrw  = s.market === "US" ? Math.round(s.avgPrice * s.shares * (s.purchaseRate ?? rate)) : s.avgPrice * s.shares;
                              const gainKrw  = valueKrw != null ? valueKrw - costKrw : null;
                              const gainPct  = gainKrw != null && costKrw > 0 ? ((gainKrw / costKrw) * 100).toFixed(2) : null;
                              const isPos    = gainKrw != null && gainKrw >= 0;
                              const isOpen   = expanded === s.id;
                              const isLast   = si === acctStocks.length - 1;

                              return (
                                <div key={s.id} style={{ borderBottom: isLast && !isOpen ? "none" : `1px solid ${C.border}` }}>
                                  <button onClick={() => setExpanded(isOpen ? null : s.id)} style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ width: 30, height: 30, borderRadius: 7, background: C.cream, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                      <span style={{ fontSize: 14 }}>{s.market === "KR" ? "🇰🇷" : "🇺🇸"}</span>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 1 }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{(s.name && !s.name.includes(',') && !/^\d{5,6}\.(KS|KQ)/i.test(s.name)) ? s.name : s.ticker}</span>
                                        <span style={{ fontSize: 10, fontWeight: 600, color: C.inkLight, background: C.cream, borderRadius: 4, padding: "1px 5px" }}>{s.ticker}</span>
                                      </div>
                                      <div style={{ fontSize: 11, color: C.inkLight }}>
                                        {s.shares}주 · {fmtPrice(s.avgPrice, s.market === "US" ? "USD" : "KRW")}
                                      </div>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                                        {valueKrw != null ? fmtS(valueKrw) : "—"}
                                      </div>
                                      {gainPct != null && (
                                        <div style={{ fontSize: 11, fontWeight: 600, color: isPos ? "#2d6a4f" : "#b5451b", display: "flex", alignItems: "center", gap: 2, justifyContent: "flex-end" }}>
                                          {isPos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                          {isPos ? "+" : ""}{gainPct}%
                                        </div>
                                      )}
                                    </div>
                                    {isOpen ? <ChevronUp size={12} color={C.inkLight} /> : <ChevronDown size={12} color={C.inkLight} />}
                                  </button>

                                  {isOpen && (() => {
                                    const costUsd  = s.market === "US" ? s.avgPrice * s.shares : costKrw / (s.purchaseRate ?? rate);
                                    const valueUsd = hasPrice ? (s.market === "US" ? p * s.shares : valueKrw / rate) : null;
                                    const gainUsd  = valueUsd != null ? valueUsd - costUsd : null;
                                    const fu = n => "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
                                    const dRows = [
                                      { label: "원금", krw: costKrw,  usd: costUsd  },
                                      { label: "수익", krw: gainKrw,  usd: gainUsd,  isGain: true },
                                      { label: "전체", krw: valueKrw, usd: valueUsd },
                                    ];
                                    return (
                                      <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px", background: C.paper }}>
                                        <div style={{ background: C.white, borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
                                          <div style={{ display: "grid", gridTemplateColumns: "2.6rem 1fr 1fr", padding: "5px 12px", borderBottom: `1px solid ${C.border}` }}>
                                            <span /><span style={{ fontSize: 9, fontWeight: 700, color: C.inkLight, textAlign: "right", letterSpacing: "0.06em" }}>원화</span>
                                            <span style={{ fontSize: 9, fontWeight: 700, color: C.inkLight, textAlign: "right", letterSpacing: "0.06em" }}>달러</span>
                                          </div>
                                          {dRows.map(({ label, krw, usd, isGain }, i) => {
                                            const color = isGain ? (krw == null ? C.inkLight : krw >= 0 ? "#2d6a4f" : "#b5451b") : C.ink;
                                            const pfx = isGain && krw != null ? (krw >= 0 ? "+" : "−") : "";
                                            return (
                                              <div key={label} style={{ display: "grid", gridTemplateColumns: "2.6rem 1fr 1fr", padding: "9px 12px", borderBottom: i < 2 ? `1px solid ${C.border}` : "none", alignItems: "center" }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: C.inkLight }}>{label}</span>
                                                <span style={{ fontSize: 13, fontWeight: 700, color, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{krw != null ? pfx + fmtS(Math.abs(krw)) : "—"}</span>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: isGain ? color : C.inkMid, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{usd != null ? pfx + fu(usd) : "—"}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                          <div style={{ fontSize: 10, color: C.inkLight }}>
                                            현재가 {hasPrice ? fmtPrice(p, s.market === "US" ? "USD" : "KRW") : "미조회"}
                                            {s.market === "US" && s.purchaseRate && <span style={{ marginLeft: 6 }}>· 매입 {s.purchaseRate.toLocaleString("ko-KR")}원</span>}
                                          </div>
                                          <button onClick={() => { setEditItem(s); setModal("editStock"); }} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 14px", cursor: "pointer", color: C.inkMid, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600 }}>
                                            <Pencil size={12} /> 수정
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </>
          );
        })()}

        {/* ── Asset Tab ── */}
        {!dbLoading && tab === "asset" && (() => {
          const tabAssets = assets.filter(a => a.cat !== "예수금" && a.cat !== "퇴직연금");
          const toggleCat = key => setExpandedCats(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
          const catGroups = Object.entries(
            tabAssets.reduce((acc, a) => { (acc[a.cat] = acc[a.cat] || []).push(a); return acc; }, {})
          ).sort(([ka], [kb]) => {
            const ia = cats.findIndex(c => c.key === ka);
            const ib = cats.findIndex(c => c.key === kb);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
          });

          return (
            <>
              {tabAssets.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 20px", background: C.white, borderRadius: 16, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.inkMid, marginBottom: 6 }}>자산을 추가해보세요</div>
                  <div style={{ fontSize: 12, color: C.inkLight }}>부동산, 예금, 달러 등</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {catGroups.map(([catName, catAssets]) => {
                    const color    = catColor(catName);
                    const catTotal = catAssets.reduce((s, a) => s + a.amount, 0);
                    const pct      = Math.round((catTotal / (total || 1)) * 100);
                    const isCatOpen = expandedCats.has(catName);

                    return (
                      <div key={catName} style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${C.border}` }}>
                        {/* Category header */}
                        <button onClick={() => toggleCat(catName)} style={{ width: "100%", background: C.white, border: "none", cursor: "pointer", padding: "13px 16px 10px", textAlign: "left", fontFamily: F }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.ink }}>{catName}</div>
                            <div style={{ fontSize: 11, color, fontWeight: 700, marginRight: 2 }}>{pct}%</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums", marginRight: 6 }}>{fmtS(catTotal)}</div>
                            {isCatOpen ? <ChevronUp size={13} color={C.inkLight} /> : <ChevronDown size={13} color={C.inkLight} />}
                          </div>
                          <div style={{ background: C.cream, borderRadius: 99, height: 4 }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99 }} />
                          </div>
                        </button>

                        {/* Expanded: individual assets */}
                        {isCatOpen && (
                          <div style={{ borderTop: `1px solid ${C.border}` }}>
                            {catAssets.map((a, ai) => {
                              const isOpen = expanded === a.id;
                              const isLast = ai === catAssets.length - 1;
                              return (
                                <div key={a.id} style={{ borderBottom: isLast && !isOpen ? "none" : `1px solid ${C.border}` }}>
                                  <button onClick={() => setExpanded(isOpen ? null : a.id)} style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10, fontFamily: F }}>
                                    <div style={{ width: 4, height: 32, borderRadius: 2, background: color, flexShrink: 0 }} />
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{a.name}</span>
                                        {a.institution && (
                                          <span style={{ fontSize: 10, fontWeight: 600, color, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 5, padding: "1px 6px" }}>
                                            {a.institution}
                                          </span>
                                        )}
                                      </div>
                                      <div style={{ fontSize: 11, color: C.inkLight }}>{a.date}</div>
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtS(a.amount)}</div>
                                    {isOpen ? <ChevronUp size={12} color={C.inkLight} /> : <ChevronDown size={12} color={C.inkLight} />}
                                  </button>
                                  {isOpen && (
                                    <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 16px", background: C.paper, display: "flex", alignItems: "center", gap: 10 }}>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>{fmt(a.amount)}</div>
                                        {a.date && <div style={{ fontSize: 11, color: C.inkLight, marginTop: 3 }}>기준일 {a.date}</div>}
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
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}

        {/* ── 연금·공제 탭 ── */}
        {!dbLoading && tab === "pension" && (() => {
          const pensions = assets.filter(a => a.cat === "퇴직연금");
          const typeGroups = PENSION_TYPES.map(t => [t, pensions.filter(a => a.accountSuffix === t)]).filter(([, list]) => list.length > 0);
          const ungrouped = pensions.filter(a => !PENSION_TYPES.includes(a.accountSuffix));
          if (ungrouped.length > 0) typeGroups.push(["기타", ungrouped]);

          return (
            <>
              {/* 요약 */}
              {pensions.length > 0 && (
                <div style={{ background: "#265a8c", borderRadius: 16, padding: "18px 20px", marginBottom: 14, color: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}>연금·공제</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 3, letterSpacing: "0.05em" }}>총 적립액</div>
                      <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtS(pensionTotal)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 3, letterSpacing: "0.05em" }}>월 납입 합계</div>
                      <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                        {(() => { const m = pensions.filter(a => PENSION_MONTHLY.has(a.accountSuffix)).reduce((s, a) => s + (parseInt(a.memo) || 0), 0); return m > 0 ? fmtS(m) : "—"; })()}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                    {PENSION_TYPES.map(t => {
                      const s = pensions.filter(a => a.accountSuffix === t).reduce((acc, a) => acc + a.amount, 0);
                      return s > 0 ? <div key={t} style={{ fontSize: 11, opacity: 0.65 }}>{t} {fmtS(s)}</div> : null;
                    })}
                  </div>
                </div>
              )}

              {pensions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 20px", background: C.white, borderRadius: 16, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.inkMid, marginBottom: 6 }}>연금·공제 계좌를 추가해보세요</div>
                  <div style={{ fontSize: 12, color: C.inkLight }}>IRP · 노란우산 · DC</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {typeGroups.map(([typeName, list]) => {
                    const color   = PENSION_TYPE_COLORS[typeName] || C.inkMid;
                    const typeSum = list.reduce((s, a) => s + a.amount, 0);
                    return (
                      <div key={typeName} style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${C.border}` }}>
                        {/* 유형 헤더 */}
                        <div style={{ background: C.white, padding: "12px 16px 10px", display: "flex", alignItems: "center", gap: 9 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.ink }}>{typeName}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtS(typeSum)}</div>
                        </div>
                        {/* 계좌 목록 */}
                        <div style={{ borderTop: `1px solid ${C.border}` }}>
                          {list.map((a, ai) => {
                            const isM      = PENSION_MONTHLY.has(a.accountSuffix);
                            const isDC     = a.accountSuffix === "DC";
                            const monthly  = isM ? (parseInt(a.memo) || 0) : 0;
                            const months   = isM ? pensionMonths(a.date) : 0;
                            const accum    = monthly * months;
                            const etfs     = isDC ? dcEtfStocks.filter(s => etfToAcctId[s.id] === String(a.id)) : [];
                            const etfVal   = isDC && dcEtfValueByAcctId[String(a.id)] != null ? dcEtfValueByAcctId[String(a.id)] : null;
                            const dispAmt  = etfVal ?? a.amount;
                            const gain     = isM && accum > 0 ? dispAmt - accum : null;
                            const gainPct  = gain != null && accum > 0 ? ((gain / accum) * 100).toFixed(1) : null;
                            const isPos    = gain != null && gain >= 0;
                            const isDCOpen = openDCAccts.has(a.id);
                            const toggleDC = () => setOpenDCAccts(prev => { const n = new Set(prev); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; });
                            return (
                              <div key={a.id} style={{ borderBottom: ai < list.length - 1 ? `1px solid ${C.border}` : "none" }}>
                                <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", gap: 10 }}>
                                  <div style={{ width: 4, height: isM ? 52 : 36, borderRadius: 2, background: color, flexShrink: 0 }} />
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{a.name || a.institution}</div>
                                    <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>
                                      {a.institution}
                                      {isM && monthly > 0 ? ` · 월 ${fmtS(monthly)}` : ""}
                                      {isM && months > 0 ? ` · ${months}개월` : (!isM && a.date ? ` · ${a.date}` : "")}
                                    </div>
                                    {isM && accum > 0 && (
                                      <div style={{ fontSize: 11, color: C.inkLight, marginTop: 1 }}>
                                        납입 {fmtS(accum)}
                                        {gain !== null && <span style={{ marginLeft: 6, fontWeight: 700, color: isPos ? "#2d9e6b" : "#d95f4b" }}>{isPos ? "+" : ""}{fmtS(gain)} ({gainPct}%)</span>}
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtS(dispAmt)}</div>
                                    {isDC && etfs.length > 0 && <div style={{ fontSize: 10, color: C.inkLight, marginTop: 1 }}>{etfs.length}개 종목</div>}
                                  </div>
                                  {isM && monthly > 0 && (
                                    <button onClick={() => { setEditItem(a); setModal("payPension"); }}
                                      style={{ background: "#2d5cb8", border: "none", borderRadius: 7, padding: "5px 9px", cursor: "pointer", color: "#fff", fontSize: 10, fontWeight: 700 }}>
                                      납입
                                    </button>
                                  )}
                                  {isDC && (
                                    <button onClick={toggleDC} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 8px", cursor: "pointer", color: C.inkMid, display: "flex", alignItems: "center" }}>
                                      {isDCOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                    </button>
                                  )}
                                  <button onClick={() => { setEditItem(a); setModal("editPension"); }}
                                    style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 8px", cursor: "pointer", color: C.inkMid, display: "flex", alignItems: "center" }}>
                                    <Pencil size={12} />
                                  </button>
                                </div>
                                {/* DC ETF 목록 */}
                                {isDC && isDCOpen && (
                                  <div style={{ borderTop: `1px solid ${C.border}`, background: C.paper }}>
                                    {etfs.length === 0 ? (
                                      <div style={{ padding: "12px 20px", fontSize: 12, color: C.inkLight }}>ETF를 추가해보세요</div>
                                    ) : (
                                      etfs.map((s, si) => {
                                        const p      = prices[s.id] ?? s.currentPrice;
                                        const valKrw = p != null ? (s.market === "US" ? Math.round(p * s.shares * rate) : Math.round(p * s.shares)) : null;
                                        const costKrw = s.market === "US" ? Math.round(s.avgPrice * s.shares * (s.purchaseRate ?? rate)) : Math.round(s.avgPrice * s.shares);
                                        const g      = valKrw != null ? valKrw - costKrw : null;
                                        const gPct   = g != null && costKrw > 0 ? ((g / costKrw) * 100).toFixed(1) : null;
                                        return (
                                          <div key={s.id} style={{ display: "flex", alignItems: "center", padding: "9px 16px 9px 24px", borderBottom: si < etfs.length - 1 ? `1px solid ${C.border}` : "none", gap: 8 }}>
                                            <div style={{ flex: 1 }}>
                                              <div style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{s.name || s.ticker}</div>
                                              <div style={{ fontSize: 11, color: C.inkLight }}>{s.ticker} · {s.shares}주 · 단가 {s.market === "US" ? `$${s.avgPrice}` : fmtS(s.avgPrice)}</div>
                                            </div>
                                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                                              <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{valKrw != null ? fmtS(valKrw) : "—"}</div>
                                              {g != null && <div style={{ fontSize: 10, color: g >= 0 ? "#2d9e6b" : "#d95f4b", fontVariantNumeric: "tabular-nums" }}>{g >= 0 ? "+" : ""}{fmtS(g)} ({gPct}%)</div>}
                                            </div>
                                            <button onClick={() => { setEditItem(s); setModal("editDCEtf"); }}
                                              style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px", cursor: "pointer", color: C.inkMid, display: "flex" }}>
                                              <Pencil size={10} />
                                            </button>
                                          </div>
                                        );
                                      })
                                    )}
                                    <button onClick={() => { setDcEtfInst(String(a.id)); setModal("addDCEtf"); }}
                                      style={{ width: "100%", padding: "10px 16px", background: "none", border: "none", borderTop: etfs.length > 0 ? `1px solid ${C.border}` : "none", cursor: "pointer", color: "#2d6a4f", fontSize: 12, fontWeight: 700, textAlign: "left", display: "flex", alignItems: "center", gap: 5, fontFamily: F }}>
                                      <Plus size={13} /> ETF 추가
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}

        {/* ── Loan Tab ── */}
        {!dbLoading && tab === "loan" && (() => {
          const loans = assets.filter(a => a.cat === "대출");
          const parseMemo = raw => { try { return JSON.parse(raw || "{}"); } catch { return {}; } };
          const today = new Date();

          return (
            <>
              {/* 요약 카드 */}
              {loans.length > 0 && (
                <div style={{ background: "#7b2d00", borderRadius: 16, padding: "18px 20px", marginBottom: 14, color: "#fff" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.5, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>총 대출 잔액</div>
                  <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "-1px" }}>
                    {fmtS(loanTotal)}<span style={{ fontSize: 13, fontWeight: 400, opacity: 0.5, marginLeft: 4 }}>원</span>
                  </div>
                  {(() => {
                    let sumPrin = 0, sumInt = 0, sumTotal = 0;
                    loans.forEach(a => {
                      const m = parseMemo(a.memo);
                      const mi = m.rate ? Math.round(a.amount * m.rate / 12 / 100) : 0;
                      const mt = (m.repayType && m.repayType !== "직접입력")
                        ? (calcLoanMonthly(m.repayType, m.principal || 0, a.amount, m.rate || 0, m.termMonths || 0, a.date) || m.monthly || 0)
                        : (m.monthly || 0);
                      const mp = m.repayType === "이자만" ? 0 : Math.max(0, mt - mi);
                      sumInt   += mi;
                      sumPrin  += mp;
                      sumTotal += mt;
                    });
                    return (
                      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                        {sumTotal > 0 && <div style={{ fontSize: 11, opacity: 0.55 }}>월상환 {fmtS(sumTotal)}</div>}
                        {sumPrin  > 0 && <div style={{ fontSize: 11, opacity: 0.55 }}>원금 {fmtS(sumPrin)}</div>}
                        {sumInt   > 0 && <div style={{ fontSize: 11, opacity: 0.55 }}>이자 {fmtS(sumInt)}</div>}
                        <div style={{ fontSize: 11, opacity: 0.55 }}>{loans.length}건</div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {loans.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 20px", background: C.white, borderRadius: 16, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.inkMid, marginBottom: 6 }}>대출 내역이 없습니다</div>
                  <div style={{ fontSize: 12, color: C.inkLight }}>신용, 마이너스통장, 주택담보 등을 추가하세요</div>
                </div>
              ) : (() => {
                const sortedLoans = [...loans].sort((a, b) => {
                  const oa = parseMemo(a.memo).order ?? 9999;
                  const ob = parseMemo(b.memo).order ?? 9999;
                  return oa - ob;
                });
                const moveLoan = (idx, dir) => {
                  const ni = idx + dir;
                  if (ni < 0 || ni >= sortedLoans.length) return;
                  const a1 = sortedLoans[idx], a2 = sortedLoans[ni];
                  const m1 = parseMemo(a1.memo), m2 = parseMemo(a2.memo);
                  updateAsset({ ...a1, memo: JSON.stringify({ ...m1, order: ni }) });
                  updateAsset({ ...a2, memo: JSON.stringify({ ...m2, order: idx }) });
                };
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {sortedLoans.map((a, idx) => {
                      const m       = parseMemo(a.memo);
                      const color   = LOAN_TYPE_COLORS[a.accountSuffix] || C.inkMid;
                      const matDate = a.date ? new Date(a.date) : null;
                      const dl      = matDate ? Math.ceil((matDate - today) / 86400000) : null;
                      const dlColor = dl == null ? C.inkLight : dl < 0 ? C.inkLight : dl < 90 ? "#b5451b" : dl < 365 ? "#e07a5f" : C.inkMid;
                      const annInt      = m.rate ? Math.round(a.amount * m.rate / 100) : null;
                      const monthlyInt  = annInt != null ? Math.round(annInt / 12) : null;
                      const monthlyPrin = m.monthly && monthlyInt != null ? Math.max(0, m.monthly - monthlyInt) : null;
                      const repaid      = m.principal && a.amount ? Math.max(0, Math.round((1 - a.amount / m.principal) * 100)) : null;

                      return (
                        <div key={a.id} style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                          <div style={{ display: "flex", alignItems: "stretch" }}>
                            <div style={{ width: 4, background: color, flexShrink: 0 }} />
                            <div style={{ flex: 1, padding: "14px 16px" }}>
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: color, borderRadius: 5, padding: "2px 7px" }}>{a.accountSuffix}</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{a.name || a.institution}</span>
                                  </div>
                                  <div style={{ fontSize: 11, color: C.inkLight }}>{a.institution}</div>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                  <div style={{ fontSize: 18, fontWeight: 800, color: "#7b2d00", fontVariantNumeric: "tabular-nums" }}>{fmtS(a.amount)}</div>
                                  <div style={{ fontSize: 10, color: C.inkLight, marginTop: 1 }}>잔액</div>
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                                {m.rate != null && <div style={{ fontSize: 11, color: C.inkMid }}><span style={{ color: C.inkLight }}>금리 </span><strong>{m.rate}%</strong></div>}
                                {m.monthly > 0 && monthlyInt != null ? (
                                  <div style={{ fontSize: 11, color: C.inkMid }}>
                                    <span style={{ color: C.inkLight }}>월상환 </span>
                                    <strong>{fmtS(m.monthly)}</strong>
                                    <span style={{ color: C.inkLight }}> (원금 {fmtS(monthlyPrin)} · 이자 {fmtS(monthlyInt)})</span>
                                  </div>
                                ) : monthlyInt != null ? (
                                  <div style={{ fontSize: 11, color: C.inkMid }}><span style={{ color: C.inkLight }}>월이자 </span><strong>~{fmtS(monthlyInt)}</strong></div>
                                ) : annInt != null ? (
                                  <div style={{ fontSize: 11, color: C.inkMid }}><span style={{ color: C.inkLight }}>연이자 </span><strong>~{fmtS(annInt)}</strong></div>
                                ) : null}
                              </div>
                              {m.monthly > 0 && monthlyInt != null && (
                                <div style={{ display: "flex", gap: 0, marginTop: 7, borderRadius: 8, overflow: "hidden", height: 20 }}>
                                  {monthlyPrin > 0 && (
                                    <div style={{ flex: monthlyPrin, background: "#7b2d00", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 28 }}>
                                      <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>원금 {fmtS(monthlyPrin)}</span>
                                    </div>
                                  )}
                                  {monthlyInt > 0 && (
                                    <div style={{ flex: monthlyInt, background: "#c0654a", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 28 }}>
                                      <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>이자 {fmtS(monthlyInt)}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {(dl != null || repaid != null) && (
                                <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                                  {dl != null && <div style={{ fontSize: 11, color: dlColor, fontWeight: 700 }}>만기 {a.date}{dl < 0 ? " (만기됨)" : ` (D-${dl})`}</div>}
                                  {repaid != null && (
                                    <div style={{ fontSize: 11, color: C.inkMid }}>
                                      <span style={{ color: C.inkLight }}>상환 </span><strong>{repaid}%</strong>
                                      <span style={{ color: C.inkLight }}> ({fmtS(m.principal - a.amount)}원)</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {m.memo && <div style={{ fontSize: 11, color: C.inkLight, marginTop: 5 }}>{m.memo}</div>}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", borderLeft: `1px solid ${C.border}` }}>
                              <button onClick={() => moveLoan(idx, -1)} disabled={idx === 0}
                                style={{ flex: 1, background: "none", border: "none", borderBottom: `1px solid ${C.border}`, cursor: idx === 0 ? "default" : "pointer", padding: "0 10px", color: idx === 0 ? C.border : C.inkLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <ChevronUp size={12} />
                              </button>
                              <button onClick={() => { setEditItem(a); setModal("payLoan"); }}
                                style={{ flex: 1, background: "none", border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer", padding: "0 10px", color: "#7b2d00", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, minWidth: 40 }}>
                                납입
                              </button>
                              <button onClick={() => { setEditItem(a); setModal("editLoan"); }}
                                style={{ flex: 1, background: "none", border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer", padding: "0 10px", color: C.inkLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => moveLoan(idx, 1)} disabled={idx === sortedLoans.length - 1}
                                style={{ flex: 1, background: "none", border: "none", cursor: idx === sortedLoans.length - 1 ? "default" : "pointer", padding: "0 10px", color: idx === sortedLoans.length - 1 ? C.border : C.inkLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <ChevronDown size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          );
        })()}

        {/* ── AMAT 탭 ── */}
        {!dbLoading && tab === "vest" && (() => {
          const amatStocks   = stocks.filter(s => s.ticker.toUpperCase() === "AMAT");
          const amatUnvested = vestings.filter(v => !v.vested && v.ticker.toUpperCase() === "AMAT")
                                       .sort((a, b) => a.vestDate.localeCompare(b.vestDate));

          const amatPrice    = amatStocks.length > 0 ? (prices[amatStocks[0].id] ?? amatStocks[0].currentPrice) : null;
          const allRsuVestedDates = new Set(vestings.filter(v => v.vested && v.ticker.toUpperCase() === "AMAT").map(v => v.vestDate));
          const amatRsuShares  = vestings.filter(v => v.vested && v.ticker.toUpperCase() === "AMAT").reduce((s, v) => s + v.shares, 0);
          const amatEsppStocks = amatStocks.filter(s => /espp/i.test(s.name) || !allRsuVestedDates.has(s.purchaseDate));
          const amatEsppShares = amatEsppStocks.reduce((s, x) => s + x.shares, 0);
          const amatShares   = amatRsuShares + amatEsppShares;
          const amatValueUsd = amatPrice ? amatPrice * amatShares : null;
          const amatValue    = amatValueUsd != null ? Math.round(amatValueUsd * rate) : null;
          const amatCostUsd  = amatStocks.reduce((s, x) => s + x.avgPrice * x.shares, 0);
          const amatCost     = amatStocks.reduce((s, x) => s + Math.round(x.avgPrice * x.shares * (x.purchaseRate ?? rate)), 0);
          const amatGainUsd  = amatValueUsd != null ? amatValueUsd - amatCostUsd : null;
          const amatGain     = amatValue != null ? amatValue - amatCost : null;
          const amatGainPct  = amatCostUsd > 0 && amatGainUsd != null ? ((amatGainUsd / amatCostUsd) * 100).toFixed(1) : null;
          const unvestedVal    = amatUnvested.reduce((s, v) => { const p = vestingPrices["AMAT"]; return p ? s + Math.round(p * v.shares * rate) : s; }, 0);
          const vestDateGrantInfo = {};
          vestings.filter(v => v.vested && v.ticker.toUpperCase() === "AMAT").forEach(v => { if (!vestDateGrantInfo[v.vestDate]) vestDateGrantInfo[v.vestDate] = { name: v.name, grantDate: v.grantDate, id: v.id }; });

          // 그랜트 그루핑 (상위 스코프 — 그랜트 테이블 + 보유·예정 공유)
          const amatAllVestings = vestings.filter(v => v.ticker.toUpperCase() === "AMAT").sort((a, b) => a.vestDate.localeCompare(b.vestDate));
          const grantMapShared  = {};
          amatAllVestings.forEach(v => { if (!grantMapShared[v.name]) grantMapShared[v.name] = []; grantMapShared[v.name].push(v); });
          const grantEntriesShared = Object.entries(grantMapShared).sort(([, a], [, b]) => {
            const da = a[0].grantDate || a[0].vestDate;
            const db = b[0].grantDate || b[0].vestDate;
            return db.localeCompare(da);
          });
          const toggleHolding = name => setOpenHoldings(p => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n; });

          return (
            <>
              {/* ─ 요약 헤더 ─ */}
              {amatStocks.length > 0 && (
                <div style={{ background: "#2d6a4f", borderRadius: 16, padding: "18px 20px", marginBottom: 14, color: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingRight: 72 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}>AMAT</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>Applied Materials</div>
                    {amatPrice && <div style={{ marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,0.7)", fontVariantNumeric: "tabular-nums" }}>${amatPrice.toFixed(2)}</div>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 3, letterSpacing: "0.05em" }}>보유 총액</div>
                      <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{amatValue ? fmtS(amatValue) : "—"}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                        {amatValueUsd != null ? `$${amatValueUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : ""} · {amatShares}주
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 3, letterSpacing: "0.05em" }}>평가손익</div>
                      <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: amatGain >= 0 ? "#34d399" : "#f87171" }}>
                        {amatGain != null ? (amatGain >= 0 ? "+" : "") + fmtS(amatGain) : "—"}
                      </div>
                      <div style={{ fontSize: 10, color: amatGainUsd >= 0 ? "#34d399" : "#f87171", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                        {amatGainUsd != null ? `${amatGainUsd >= 0 ? "+" : ""}$${Math.round(amatGainUsd).toLocaleString("en-US")}` : ""}
                        {amatGainPct != null ? ` (${amatGainUsd >= 0 ? "+" : ""}${amatGainPct}%)` : ""}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 3, letterSpacing: "0.05em" }}>미베스팅 예상가</div>
                      <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{unvestedVal > 0 ? fmtS(unvestedVal) : "—"}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{amatUnvested.reduce((s, v) => s + v.shares, 0)}주 예정</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─ 보유 · 예정 (그랜트별 폴딩) ─ */}
              <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, letterSpacing: "-0.01em", marginBottom: 10 }}>보유 · 예정</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {grantEntriesShared.map(([grantName, gvs]) => {
                  const vestedVestings = gvs.filter(v => v.vested);
                  const futures   = amatUnvested.filter(v => v.name === grantName);
                  if (vestedVestings.length === 0 && futures.length === 0) return null;
                  const isOpen    = openHoldings.has(grantName);
                  const heldSh    = vestedVestings.reduce((s, v) => s + v.shares, 0);
                  const futureSh  = futures.reduce((s, v) => s + v.shares, 0);
                  const nextVest  = futures[0];
                  const dl        = nextVest ? Math.ceil((new Date(nextVest.vestDate) - new Date()) / 86400000) : null;
                  const dc        = dl == null ? C.inkLight : dl < 0 ? C.inkLight : dl < 30 ? "#b5451b" : dl < 90 ? "#e07a5f" : "#2d6a4f";
                  const grantDate = gvs[0].grantDate;
                  return (
                    <div key={grantName} style={{ background: C.white, borderRadius: 13, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                      {/* 헤더 */}
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <button onClick={() => toggleHolding(grantName)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "11px 14px", fontFamily: F, textAlign: "left" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {isOpen ? <ChevronUp size={12} color={C.inkLight} /> : <ChevronDown size={12} color={C.inkLight} />}
                            {/* 왼쪽: 이름 + 부여일 + D-XX */}
                            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#2469b3" }}>{grantName}</span>
                              {grantDate && <span style={{ fontSize: 10, color: C.inkLight }}>{grantDate}</span>}
                              {dl != null && (
                                <span style={{ fontSize: 11, fontWeight: 800, color: dc }}>
                                  {dl < 0 ? "지남" : `D-${dl}`}
                                </span>
                              )}
                            </div>
                            {/* 오른쪽: 보유/예정 */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                              <div style={{ textAlign: "right", minWidth: 80 }}>
                                {heldSh > 0 && (
                                  <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>
                                    보유 {heldSh}주{amatPrice ? <span style={{ color: "#2469b3", marginLeft: 4 }}>${Math.round(amatPrice * heldSh).toLocaleString()}</span> : null}
                                  </div>
                                )}
                                {futureSh > 0 && (
                                  <div style={{ fontSize: 11, color: C.inkLight, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>예정 {futureSh}주</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                        <button onClick={e => { e.stopPropagation(); setEditItem({ grantName, grantDate }); setModal("editGrant"); }}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: "11px 8px", color: C.inkLight, display: "flex", alignItems: "center" }}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); if (window.confirm(`'${grantName}' 그랜트 전체(${gvs.length}건)를 삭제할까요?`)) deleteGrant(grantName); }}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: "11px 12px 11px 4px", color: "#b5451b", display: "flex", alignItems: "center" }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {/* 펼침 내용 */}
                      {isOpen && (
                        <div style={{ borderTop: `1px solid ${C.border}` }}>
                          {/* 베스팅 기반 보유 행 */}
                          {vestedVestings.map((v, vi) => {
                            const linkedStock = amatStocks.find(s => s.purchaseDate === v.vestDate && Math.abs(s.shares - v.shares) < 0.5);
                            const p        = linkedStock ? (prices[linkedStock.id] ?? linkedStock.currentPrice) : null;
                            const costUsd  = v.vestPrice ?? v.grantPrice;
                            const purchRate = linkedStock?.purchaseRate ?? rate;
                            const valKrw   = p ? Math.round(p * v.shares * rate) : null;
                            const costKrw  = costUsd ? Math.round(costUsd * v.shares * purchRate) : null;
                            const gain     = valKrw != null && costKrw != null ? valKrw - costKrw : null;
                            const gainPct  = costKrw && costKrw > 0 && gain != null ? ((gain / costKrw) * 100).toFixed(1) : null;
                            const gainColor = gain != null && gain >= 0 ? "#2d6a4f" : "#b5451b";
                            return (
                              <div key={v.id} style={{ display: "flex", alignItems: "center", padding: "9px 14px 9px 28px", borderBottom: vi < vestedVestings.length - 1 || futures.length > 0 ? `1px solid ${C.border}` : "none", gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{v.vestDate}</div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMid }}>{v.shares}주{costUsd ? ` · 취득가 $${costUsd.toFixed(2)}` : ""}</div>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{valKrw ? fmtS(valKrw) : "—"}{p ? <span style={{ fontSize: 10, color: C.inkLight, marginLeft: 4 }}>${(p * v.shares).toFixed(0)}</span> : null}</div>
                                  {gain != null && <div style={{ fontSize: 10, color: gainColor, fontVariantNumeric: "tabular-nums" }}>{gain >= 0 ? "+" : ""}{fmtS(gain)} ({gainPct}%)</div>}
                                </div>
                                <button onClick={() => { setEditItem(v); setModal("editVesting"); }}
                                  style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 7px", cursor: "pointer", color: C.inkMid, display: "flex", alignItems: "center", flexShrink: 0 }}>
                                  <Pencil size={10} />
                                </button>
                              </div>
                            );
                          })}
                          {/* 미래 예정 구분 */}
                          {futures.length > 0 && (
                            <div style={{ padding: "5px 14px 5px 28px", background: C.paper, borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.inkLight, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                              예정
                            </div>
                          )}
                          {/* 미래 예정 행 */}
                          {futures.map((v, vi) => {
                            const vdl = Math.ceil((new Date(v.vestDate) - new Date()) / 86400000);
                            const vdc = vdl < 0 ? C.inkLight : vdl < 30 ? "#b5451b" : vdl < 90 ? "#e07a5f" : "#2d6a4f";
                            const vp  = vestingPrices["AMAT"];
                            const estKrw = vp ? Math.round(vp * v.shares * rate) : null;
                            return (
                              <div key={v.id} style={{ display: "flex", alignItems: "center", padding: "9px 14px 9px 28px", borderBottom: vi < futures.length - 1 ? `1px solid ${C.border}` : "none", gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{v.vestDate}</div>
                                  <div style={{ fontSize: 11, color: C.inkLight }}>{v.shares}주{v.grantPrice ? ` · 부여가 $${v.grantPrice}` : ""}</div>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: vdc }}>{vdl < 0 ? "지남" : `D-${vdl}`}</div>
                                  {estKrw && <div style={{ fontSize: 10, color: C.inkLight, fontVariantNumeric: "tabular-nums" }}>≈{fmtS(estKrw)}</div>}
                                </div>
                                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                  <button onClick={() => { setEditItem(v); setModal("vestComplete"); }}
                                    style={{ background: "#2d6a4f", border: "none", borderRadius: 5, padding: "4px 8px", cursor: "pointer", color: "#fff", fontSize: 10, fontWeight: 700, fontFamily: F }}>✓</button>
                                  <button onClick={() => { setEditItem(v); setModal("editVesting"); }}
                                    style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 7px", cursor: "pointer", color: C.inkMid, display: "flex", alignItems: "center" }}>
                                    <Pencil size={10} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* ESPP */}
                {(() => {
                  const esppStocks  = amatStocks.filter(s => /espp/i.test(s.name) || !allRsuVestedDates.has(s.purchaseDate)).sort((a, b) => (b.purchaseDate || "").localeCompare(a.purchaseDate || ""));
                  if (esppStocks.length === 0) return null;
                  const isOpen      = openHoldings.has("__ESPP__");
                  const totalSh     = esppStocks.reduce((s, x) => s + x.shares, 0);
                  const esppPrice   = amatPrice;
                  const totalUsd    = esppPrice ? esppPrice * totalSh : null;
                  const latestDate  = esppStocks[0]?.purchaseDate;
                  return (
                    <div style={{ background: C.white, borderRadius: 13, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                      <button onClick={() => toggleHolding("__ESPP__")} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "11px 14px", fontFamily: F, textAlign: "left" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {isOpen ? <ChevronUp size={12} color={C.inkLight} /> : <ChevronDown size={12} color={C.inkLight} />}
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#2469b3" }}>ESPP</span>
                              {latestDate && <span style={{ fontSize: 10, color: C.inkLight }}>{latestDate}</span>}
                            </div>
                            <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>
                              <span style={{ fontWeight: 700, color: C.inkMid }}>{totalSh}주</span>
                              {totalUsd && <span style={{ marginLeft: 6 }}>${totalUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                      {isOpen && (
                        <div style={{ borderTop: `1px solid ${C.border}` }}>
                          {esppStocks.map((s, si) => {
                            const p        = prices[s.id] ?? s.currentPrice;
                            const valUsd   = p ? p * s.shares : null;
                            const costKrw  = Math.round(s.avgPrice * s.shares * (s.purchaseRate ?? rate));
                            const valKrw   = p ? Math.round(p * s.shares * rate) : null;
                            const gain     = valKrw != null ? valKrw - costKrw : null;
                            const gainPct  = costKrw > 0 && gain != null ? ((gain / costKrw) * 100).toFixed(1) : null;
                            const gainColor = gain != null && gain >= 0 ? "#2d6a4f" : "#b5451b";
                            return (
                              <div key={s.id} style={{ display: "flex", alignItems: "center", padding: "9px 14px 9px 28px", borderBottom: si < esppStocks.length - 1 ? `1px solid ${C.border}` : "none", gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{s.purchaseDate || "—"}</span>
                                    {(s.accountSuffix || (!/^\s*AMAT\s*\(ESPP\)\s*$/i.test(s.name) && s.name)) && <span style={{ fontSize: 11, fontWeight: 600, color: "#2469b3" }}>{s.accountSuffix || s.name}</span>}
                                  </div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: C.inkMid, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>
                                    {s.shares}주 <span style={{ fontWeight: 400, fontSize: 11, color: C.inkLight }}>· 취득가 ${s.avgPrice.toFixed(2)}</span>
                                  </div>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                  {valUsd && <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>${valUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>}
                                  {gain != null && <div style={{ fontSize: 10, color: gainColor, fontVariantNumeric: "tabular-nums" }}>{gain >= 0 ? "+" : ""}{fmtS(gain)} ({gainPct}%)</div>}
                                </div>
                                <button onClick={() => { setEditItem(s); setModal("editOffering"); }}
                                  style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 7px", cursor: "pointer", color: C.inkMid, display: "flex", alignItems: "center", flexShrink: 0 }}>
                                  <Pencil size={10} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

            </>
          );
        })()}
      </div>

      {/* FAB */}
      {!dbLoading && tab === "asset" && (
        <button onClick={() => setModal("addAsset")} style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 200,
          width: 56, height: 56, borderRadius: "50%", border: "none",
          background: "#2d5cb8", color: "#fff", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px #2d5cb888", transition: "transform 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
          <Plus size={26} />
        </button>
      )}
      {!dbLoading && tab === "loan" && (
        <button onClick={() => setModal("addLoan")} style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 200,
          width: 56, height: 56, borderRadius: "50%", border: "none",
          background: "#7b2d00", color: "#fff", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px #7b2d0088", transition: "transform 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
          <Plus size={26} />
        </button>
      )}
      {!dbLoading && tab === "pension" && (
        <button onClick={() => setModal("addPension")} style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 200,
          width: 56, height: 56, borderRadius: "50%", border: "none",
          background: "#2d5cb8", color: "#fff", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px #2d5cb888", transition: "transform 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
          <Plus size={26} />
        </button>
      )}
      {!dbLoading && tab === "stock" && (
        <div style={{ position: "fixed", bottom: 24, right: 16, zIndex: 200, display: "flex", gap: 8 }}>
          <button onClick={() => setModal("addDeposit")} style={{ display: "flex", alignItems: "center", gap: 6, background: "#0d7377", color: "#fff", border: "none", borderRadius: 14, padding: "13px 18px", fontFamily: F, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px #0d737766" }}>
            <Plus size={15} /> 예수금
          </button>
          <button onClick={() => setModal("addStock")} style={{ display: "flex", alignItems: "center", gap: 6, background: "#2d6a4f", color: "#fff", border: "none", borderRadius: 14, padding: "13px 18px", fontFamily: F, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px #2d6a4f66" }}>
            <Plus size={15} /> 종목
          </button>
        </div>
      )}
      {!dbLoading && tab === "vest" && (
        <div style={{ position: "fixed", bottom: 24, right: 16, zIndex: 200, display: "flex", gap: 8 }}>
          <button onClick={() => setModal("addOffering")} style={{ display: "flex", alignItems: "center", gap: 6, background: "#2469b3", color: "#fff", border: "none", borderRadius: 14, padding: "13px 18px", fontFamily: F, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px #2469b366" }}>
            <Plus size={15} /> ESPP
          </button>
          <button onClick={() => setModal("addVesting")} style={{ display: "flex", alignItems: "center", gap: 6, background: "#2d6a4f", color: "#fff", border: "none", borderRadius: 14, padding: "13px 18px", fontFamily: F, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px #2d6a4f66" }}>
            <Plus size={15} /> RSU
          </button>
          <button onClick={() => setModal("batchVesting")} style={{ display: "flex", alignItems: "center", gap: 6, background: "#4a3728", color: "#fff", border: "none", borderRadius: 14, padding: "13px 18px", fontFamily: F, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px #4a372855" }}>
            <Plus size={15} /> RSU 일괄
          </button>
        </div>
      )}

      {/* Modals */}
      <Modal open={modal === "addStock"} onClose={() => { setModal(null); setAddInitial(null); }}>
        <StockForm initial={addInitial} onSave={addStock} saving={false} suggestions={institutionSuggestions} />
      </Modal>
      <Modal open={modal === "editStock" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <StockForm initial={editItem} onSave={updateStock} onDelete={() => deleteStock(editItem.id)} onCopy={s => { setAddInitial(s); setModal("addStock"); setEditItem(null); }} saving={false} suggestions={institutionSuggestions} />}
      </Modal>
      <Modal open={modal === "addAsset"}  onClose={() => setModal(null)}>
        <AssetForm cats={cats} onSave={addAsset} saving={false} suggestions={institutionSuggestions} />
      </Modal>
      <Modal open={modal === "editAsset" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <AssetForm initial={editItem} cats={cats} onSave={updateAsset} onDelete={() => deleteAsset(editItem.id)} saving={false} suggestions={institutionSuggestions} />}
      </Modal>
      <Modal open={modal === "addDeposit"} onClose={() => setModal(null)}>
        <DepositForm onSave={addAsset} saving={false} suggestions={institutionSuggestions} />
      </Modal>
      <Modal open={modal === "editDeposit" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <DepositForm initial={editItem} onSave={updateAsset} onDelete={() => deleteAsset(editItem.id)} saving={false} suggestions={institutionSuggestions} />}
      </Modal>
      <Modal open={modal === "addDCEtf"} onClose={() => { setModal(null); setDcEtfInst(""); }}>
        <DCEtfForm institution={dcEtfInst} onSave={s => { addStock(s); setModal(null); }} />
      </Modal>
      <Modal open={modal === "editDCEtf" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <DCEtfForm initial={editItem} institution={editItem.institution} onSave={s => { updateStock(s); setModal(null); setEditItem(null); }} onDelete={() => { deleteStock(editItem.id); setModal(null); setEditItem(null); }} />}
      </Modal>
      <Modal open={modal === "addPension"} onClose={() => setModal(null)}>
        <PensionForm onSave={a => { addAsset(a); }} />
      </Modal>
      <Modal open={modal === "editPension" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <PensionForm initial={editItem} onSave={a => { updateAsset(a); }} onDelete={() => deleteAsset(editItem.id)} />}
      </Modal>
      <Modal open={modal === "addLoan"} onClose={() => setModal(null)}>
        <LoanForm onSave={a => { addAsset(a); setModal(null); }} />
      </Modal>
      <Modal open={modal === "editLoan" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <LoanForm initial={editItem} onSave={a => { updateAsset(a); setModal(null); setEditItem(null); }} onDelete={() => deleteAsset(editItem.id)} />}
      </Modal>
      <Modal open={modal === "payLoan" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <LoanPayForm loan={editItem} onSave={a => { updateAsset(a); setModal(null); setEditItem(null); }} />}
      </Modal>
      <Modal open={modal === "payPension" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <PensionPayForm pension={editItem} onSave={a => { updateAsset(a); setModal(null); setEditItem(null); }} />}
      </Modal>
      <Modal open={modal === "cats"} onClose={() => setModal(null)}>
        <CatSettings cats={cats} onChange={c => {
          setCats(c);
          if (isConfigured()) sb("settings", { method: "POST", body: JSON.stringify({ key: "cats", value: c }), prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
        }} />
      </Modal>
      <Modal open={modal === "editGrant" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <GrantEditForm grantName={editItem.grantName} grantDate={editItem.grantDate} onSave={updateGrant} />}
      </Modal>
      <Modal open={modal === "addVesting"} onClose={() => setModal(null)}>
        <VestingForm onSave={addVesting} />
      </Modal>
      <Modal open={modal === "batchVesting"} onClose={() => setModal(null)}>
        <VestingBatchForm onSave={addBatchVestings} />
      </Modal>
      <Modal open={modal === "editVesting" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <VestingForm initial={editItem} onSave={updateVesting} onDelete={() => deleteVesting(editItem.id)} />}
      </Modal>
      <Modal open={modal === "vestComplete" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <VestCompleteForm item={editItem} currentPrice={vestingPrices[editItem.ticker?.toUpperCase()]} onComplete={(vp, add) => { vestComplete(editItem, vp, add); setModal(null); setEditItem(null); }} onClose={() => { setModal(null); setEditItem(null); }} />}
      </Modal>
      <Modal open={modal === "addOffering"} onClose={() => setModal(null)}>
        <EsppForm onSave={s => { addStock(s); }} />
      </Modal>
      <Modal open={modal === "editOffering" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <EsppForm initial={editItem} onSave={s => { updateStock(s); }} onDelete={() => { deleteStock(editItem.id); }} />}
      </Modal>

      {/* Build time footer */}
      <div style={{ textAlign: "center", padding: "16px 0 8px", fontSize: 10, color: C.inkLight, fontFamily: F, opacity: 0.5 }}>
        built {__BUILD_TIME__}
      </div>
    </div>
  );
}
