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

/* ── Stock price fetch (via server proxy to avoid CORS) ── */
async function fetchStockPrice(ticker, market) {
  const sym = market === "KR" ? `${ticker}.KS` : ticker.toUpperCase();
  const res = await fetch(`/api/stock?symbol=${encodeURIComponent(sym)}`);
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
const toDbVesting   = v => ({ id: v.id, type: v.type, ticker: v.ticker, name: v.name, shares: v.shares, vest_date: v.vestDate, grant_price: v.grantPrice ?? null, vest_price: v.vestPrice ?? null, vested: v.vested ?? false, institution: v.institution || null, account_suffix: v.accountSuffix || null, memo: v.memo || "" });
const fromDbVesting = v => ({ id: v.id, type: v.type, ticker: v.ticker, name: v.name, shares: Number(v.shares), vestDate: v.vest_date, grantPrice: v.grant_price != null ? Number(v.grant_price) : null, vestPrice: v.vest_price != null ? Number(v.vest_price) : null, vested: v.vested ?? false, institution: v.institution || "", accountSuffix: v.account_suffix || "", memo: v.memo || "" });
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

/* ── Stock Form ── */
function StockForm({ initial, onSave, onDelete, onCopy, saving }) {
  const init = initial || {};
  const [ticker,       setTicker]       = useState(init.ticker       || "");
  const [name,         setName]         = useState(init.name         || "");
  const [market,       setMarket]       = useState(init.market       || "KR");
  const [shares,       setShares]       = useState(init.shares       ? String(init.shares) : "");
  const [avgPrice,     setAvgPrice]     = useState(init.avgPrice     ? Number(init.avgPrice).toLocaleString(market === "US" ? "en-US" : "ko-KR") : "");
  const [purchaseDate,  setPurchaseDate]  = useState(init.purchaseDate  || "");
  const [purchaseRate,  setPurchaseRate]  = useState(init.purchaseRate  ? String(init.purchaseRate) : "");
  const [institution,   setInstitution]   = useState(init.institution   || "");
  const [accountSuffix, setAccountSuffix] = useState(init.accountSuffix || "");
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
    onSave({ id: init.id || Date.now(), ticker: ticker.trim().toUpperCase(), name: name.trim() || ticker.trim().toUpperCase(), market, shares: sh, avgPrice: ap, currentPrice: init.currentPrice || null, lastFetched: init.lastFetched || null, purchaseDate: purchaseDate || null, purchaseRate: market === "US" ? pr : null, institution: institution.trim(), accountSuffix: accountSuffix.trim() });
  }

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{isEdit ? "종목 수정" : "종목 추가"}</span>
        {isEdit && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onCopy({ id: Date.now(), ticker: ticker.trim().toUpperCase(), name: name.trim() || ticker.trim().toUpperCase(), market, shares: parseFloat(String(shares).replace(/,/g,"")), avgPrice: parseFloat(String(avgPrice).replace(/,/g,"")), currentPrice: null, lastFetched: null, purchaseDate: purchaseDate || null, purchaseRate: market === "US" && purchaseRate ? parseFloat(purchaseRate) : null, institution: institution.trim(), accountSuffix: accountSuffix.trim() })}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "#f0f4ff", border: "1px solid #c7d4f4", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#1d4e89", fontSize: 12, fontWeight: 600 }}>
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
            return <button key={m} onClick={() => setMarket(m)} style={{ flex: 1, padding: "8px", borderRadius: 10, border: `1.5px solid ${sel ? "#1d4e89" : C.border}`, background: sel ? "#1d4e89" : C.white, color: sel ? "#fff" : C.inkMid, fontFamily: F, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{l}</button>;
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

      {/* Institution + Account (optional) */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 12 }}>
        <div>
          <SLabel>증권사 <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(선택)</span></SLabel>
          <input value={institution} onChange={e => setInstitution(e.target.value)} placeholder="미래에셋, 키움…"
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
        <div>
          <SLabel>계좌 뒷자리 <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(선택)</span></SLabel>
          <input value={accountSuffix} onChange={e => setAccountSuffix(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="1234" inputMode="numeric"
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", fontVariantNumeric: "tabular-nums" }} />
        </div>
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
function AssetForm({ initial, cats, onSave, onDelete, saving }) {
  const init = initial || {};
  const [name,          setName]          = useState(init.name          || "");
  const [cat,           setCat]           = useState(init.cat           || cats.find(c => c.key !== "주식")?.key || "기타");
  const [amount,        setAmount]        = useState(init.amount        ? Number(init.amount).toLocaleString("ko-KR") : "");
  const [memo,          setMemo]          = useState(init.memo          || "");
  const [date,          setDate]          = useState(init.date          || new Date().toISOString().slice(0, 10));
  const [institution,   setInstitution]   = useState(init.institution   || "");
  const [accountSuffix, setAccountSuffix] = useState(init.accountSuffix || "");
  const [err,           setErr]           = useState(false);
  const isEdit = !!initial;

  const nonStockCats = cats.filter(c => c.key !== "주식");

  function submit() {
    const num = parseInt(String(amount).replace(/,/g, ""));
    if (!name.trim() || !num || num <= 0) { setErr(true); setTimeout(() => setErr(false), 400); return; }
    onSave({ id: init.id || Date.now(), name: name.trim(), cat, amount: num, memo: memo.trim(), date, institution: institution.trim(), accountSuffix: accountSuffix.trim() });
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

      {/* Institution + Account */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 12 }}>
        <div>
          <SLabel>기관 <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(선택)</span></SLabel>
          <input value={institution} onChange={e => setInstitution(e.target.value)} placeholder="국민은행, 미래에셋…"
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
        <div>
          <SLabel>계좌 뒷자리 <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(선택)</span></SLabel>
          <input value={accountSuffix} onChange={e => setAccountSuffix(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="1234" inputMode="numeric"
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", fontVariantNumeric: "tabular-nums", letterSpacing: "0.05em" }} />
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

/* ── Vesting Form (RSU) ── */
function VestingForm({ initial, onSave, onDelete }) {
  const init = initial || {};
  const [ticker,       setTicker]       = useState(init.ticker       || "AMAT");
  const [name,         setName]         = useState(init.name         || "");
  const [shares,       setShares]       = useState(init.shares       ? String(init.shares) : "");
  const [vestDate,     setVestDate]     = useState(init.vestDate     || "");
  const [grantPrice,   setGrantPrice]   = useState(init.grantPrice   ? String(init.grantPrice) : "");
  const [err, setErr] = useState(false);
  const isEdit = !!onDelete;

  function submit() {
    const sh = parseFloat(shares);
    if (!ticker.trim() || !name.trim() || !sh || sh <= 0 || !vestDate) {
      setErr(true); setTimeout(() => setErr(false), 400); return;
    }
    onSave({ id: init.id || Date.now(), type: "RSU", ticker: ticker.trim().toUpperCase(), name: name.trim(), shares: sh, vestDate, grantPrice: grantPrice ? parseFloat(grantPrice) : null, vestPrice: init.vestPrice ?? null, vested: false, institution: init.institution || "UBS", accountSuffix: init.accountSuffix || "", memo: "" });
  }

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{isEdit ? "RSU 수정" : "RSU 추가"}</span>
        {isEdit && <button onClick={onDelete} style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff1ee", border: "1px solid #f4c5b2", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#b5451b", fontSize: 12, fontWeight: 600 }}><Trash2 size={13} /> 삭제</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 12 }}>
        <div><SLabel>티커</SLabel>
          <input value={ticker} onChange={e => setTicker(e.target.value)} placeholder="AMAT"
            style={{ width: "100%", border: `1.5px solid ${err && !ticker.trim() ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box", textTransform: "uppercase" }} />
        </div>
        <div><SLabel>그랜트명</SLabel>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="2024 Annual RSU Grant"
            style={{ width: "100%", border: `1.5px solid ${err && !name.trim() ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div><SLabel>베스팅 주수</SLabel>
          <input type="text" inputMode="decimal" value={shares} onChange={e => setShares(e.target.value)} placeholder="50"
            style={{ width: "100%", border: `1.5px solid ${err && !parseFloat(shares) ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 15, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
        <div><SLabel>베스팅일</SLabel>
          <input type="date" value={vestDate} onChange={e => setVestDate(e.target.value)}
            style={{ width: "100%", border: `1.5px solid ${err && !vestDate ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: vestDate ? C.ink : C.inkLight, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <SLabel>부여가 (USD) <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>(선택)</span></SLabel>
        <input type="text" inputMode="decimal" value={grantPrice} onChange={e => setGrantPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="45.00"
          style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>
      <button onClick={submit} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#2d6a4f", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F, boxShadow: "0 4px 18px #2d6a4f55", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
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
  const [name,     setName]     = useState(init.name         || "");
  const [date,     setDate]     = useState(init.purchaseDate  || "");
  const [shares,   setShares]   = useState(init.shares        ? String(init.shares) : "");
  const [avgPrice, setAvgPrice] = useState(init.avgPrice      ? String(init.avgPrice) : "");
  const [err, setErr] = useState(false);
  const isEdit = !!onDelete;

  function submit() {
    const sh = parseInt(shares);
    const ap = parseFloat(avgPrice);
    if (!name.trim() || !date || !sh || sh <= 0 || !ap || ap <= 0) {
      setErr(true); setTimeout(() => setErr(false), 400); return;
    }
    onSave({ id: init.id || Date.now(), ticker: "AMAT", name: name.trim(), market: "US", shares: sh, avgPrice: ap, currentPrice: null, lastFetched: null, purchaseDate: date, purchaseRate: null, institution: "UBS", accountSuffix: "" });
  }

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{isEdit ? "ESPP 수정" : "ESPP 추가"}</span>
        {isEdit && <button onClick={onDelete} style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff1ee", border: "1px solid #f4c5b2", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#b5451b", fontSize: 12, fontWeight: 600 }}><Trash2 size={13} /> 삭제</button>}
      </div>
      <div style={{ marginBottom: 12 }}>
        <SLabel>이름 <span style={{ fontSize: 9, fontWeight: 400, color: C.inkLight, textTransform: "none", letterSpacing: 0 }}>— 오퍼링 구분용 (예: 2026 H1 ESPP)</span></SLabel>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="2026 H1 ESPP"
          style={{ width: "100%", border: `1.5px solid ${err && !name.trim() ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
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
      <button onClick={submit} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#1d4e89", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F, boxShadow: "0 4px 18px #1d4e8955", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
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
        <div style={{ background: "#1d4e8910", border: "1px solid #1d4e8930", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: "#1d4e89", fontWeight: 600 }}>
          예상 매입 주수: {estShares}주 ({fmtS(totalKrw)} ÷ ${pp?.toFixed(2)} × {rate?.toLocaleString("ko-KR")}원)
        </div>
      )}
      <button onClick={() => { const vp = parseFloat(purchasePrice); if (!vp) { setErr(true); setTimeout(() => setErr(false), 400); return; } onComplete(vp, estShares); }}
        style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#1d4e89", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F }}>주식에 등록</button>
    </div>
  );
}

/* ── Vesting Batch Form (RSU 일괄 입력) ── */
function VestingBatchForm({ onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const [ticker,          setTicker]        = useState("AMAT");
  const [grantName,       setGrantName]     = useState("");
  const [awardYear,       setAwardYear]     = useState(String(new Date().getFullYear()));
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
    const year  = parseInt(awardYear);
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

  const startYear = parseInt(awardYear) + 2;

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
        <div><SLabel>어워드 연도</SLabel>
          <input type="text" inputMode="numeric" value={awardYear} onChange={e => { setAwardYear(e.target.value.replace(/\D/g, "")); setGenerated(false); }} placeholder="2025"
            style={{ width: "100%", border: `1.5px solid ${err && !parseInt(awardYear) ? "#e07a5f" : C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
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
      {parseInt(awardYear) > 2000 && (
        <div style={{ fontSize: 11, color: C.inkLight, marginBottom: 10, paddingLeft: 2 }}>
          {awardYear}년 12월 어워드 → {startYear}-01-01 ~ {startYear + 3}-01-01 · 분기별 13회
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
  const [lastSaved, setLastSaved] = useState(null);
  const [dbLoading, setDbLoading] = useState(true);
  const [addInitial, setAddInitial] = useState(null);
  const [snapshots,     setSnapshots]     = useState([]);
  const [vestings,      setVestings]      = useState([]);
  const [offerings,     setOfferings]     = useState([]);
  const [openGrants,    setOpenGrants]    = useState(new Set());
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
        // 종목명이 티커와 같으면 백그라운드에서 실명으로 자동 갱신
        loaded.filter(s => s.name === s.ticker).forEach(async s => {
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
  function updateVesting(v) { setVestings(p => p.map(x => x.id === v.id ? v : x)); setModal(null); setEditItem(null); upsertVesting(v); }
  function deleteVesting(id){ setVestings(p => p.filter(x => x.id !== id)); setModal(null); setEditItem(null); if (isConfigured()) sb(`vesting_schedule?id=eq.${id}`, { method: "DELETE" }).catch(() => {}); }
  function deleteGrant(name) {
    const ids = vestings.filter(v => v.name === name).map(v => v.id);
    setVestings(p => p.filter(v => v.name !== name));
    if (isConfigured() && ids.length > 0) sb(`vesting_schedule?id=in.(${ids.join(",")})`, { method: "DELETE" }).catch(() => {});
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
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 18, padding: "18px 20px", border: "1px solid rgba(255,255,255,0.12)", marginBottom: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.4, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>총 자산</div>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-1px", fontVariantNumeric: "tabular-nums" }}>
              {fmtS(total)}<span style={{ fontSize: 14, fontWeight: 400, opacity: 0.5, marginLeft: 4 }}>원</span>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, opacity: 0.5 }}>주식 {fmtS(stockValue)}</div>
              <div style={{ fontSize: 11, opacity: 0.5 }}>기타자산 {fmtS(assetTotal)}</div>
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
          {[["stock", "📈 주식"], ["asset", "🏦 기타자산"], ["vest", "🏢 AMAT"]].map(([k, l]) => (
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
          const nonAmat = stocks.filter(s => s.ticker.toUpperCase() !== "AMAT");
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
              <div style={{ background: C.white, borderRadius: 14, padding: "14px 16px", border: `1px solid ${C.border}`, marginBottom: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { label: "평가금액", val: fmtS(nonAmatValue), color: "#2d6a4f" },
                    { label: "수익금", val: (nonAmatGain >= 0 ? "+" : "") + fmtS(nonAmatGain), color: nonAmatGain >= 0 ? "#2d6a4f" : "#b5451b" },
                    { label: "수익률", val: (nonAmatGain >= 0 ? "+" : "") + nonAmatGainPct + "%", color: nonAmatGain >= 0 ? "#2d6a4f" : "#b5451b" },
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
            {nonAmat.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", background: C.white, borderRadius: 16, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.inkMid, marginBottom: 6 }}>보유 종목을 추가해보세요</div>
                <div style={{ fontSize: 12, color: C.inkLight }}>한국·미국 주식 모두 지원</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {nonAmat.map(s => {
                  const p = prices[s.id] ?? s.currentPrice;
                  const hasPrice = p != null;
                  const valueKrw = hasPrice ? (s.market === "US" ? Math.round(p * s.shares * rate) : p * s.shares) : null;
                  const costKrw  = s.market === "US" ? Math.round(s.avgPrice * s.shares * (s.purchaseRate ?? rate)) : s.avgPrice * s.shares;
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
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{s.name}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: C.inkLight, background: C.cream, borderRadius: 4, padding: "1px 5px" }}>{s.ticker}</span>
                            {s.institution && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#2d6a4f", background: "#2d6a4f18", border: "1px solid #2d6a4f44", borderRadius: 5, padding: "1px 6px" }}>
                                {s.institution}{s.accountSuffix ? ` ···${s.accountSuffix}` : ""}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: C.inkLight }}>
                            {s.shares}주 · 평균단가 {fmtPrice(s.avgPrice, s.market === "US" ? "USD" : "KRW")}
                            {s.purchaseDate && <span style={{ marginLeft: 6 }}>· {s.purchaseDate}</span>}
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

                      {isOpen && (() => {
                        const costUsd  = s.market === "US" ? s.avgPrice * s.shares : costKrw / (s.purchaseRate ?? rate);
                        const valueUsd = hasPrice ? (s.market === "US" ? p * s.shares : valueKrw / rate) : null;
                        const gainUsd  = valueUsd != null ? valueUsd - costUsd : null;
                        const fu = n => "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
                        const rows = [
                          { label: "원금", krw: costKrw,  usd: costUsd  },
                          { label: "수익", krw: gainKrw,  usd: gainUsd,  isGain: true },
                          { label: "전체", krw: valueKrw, usd: valueUsd },
                        ];
                        return (
                          <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px", background: C.paper }}>
                            <div style={{ background: C.white, borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
                              <div style={{ display: "grid", gridTemplateColumns: "2.6rem 1fr 1fr", padding: "5px 12px", borderBottom: `1px solid ${C.border}` }}>
                                <span />
                                <span style={{ fontSize: 9, fontWeight: 700, color: C.inkLight, textAlign: "right", letterSpacing: "0.06em" }}>원화</span>
                                <span style={{ fontSize: 9, fontWeight: 700, color: C.inkLight, textAlign: "right", letterSpacing: "0.06em" }}>달러</span>
                              </div>
                              {rows.map(({ label, krw, usd, isGain }, i) => {
                                const color = isGain ? (krw == null ? C.inkLight : krw >= 0 ? "#2d6a4f" : "#b5451b") : C.ink;
                                const pfx = isGain && krw != null ? (krw >= 0 ? "+" : "−") : "";
                                return (
                                  <div key={label} style={{ display: "grid", gridTemplateColumns: "2.6rem 1fr 1fr", padding: "9px 12px", borderBottom: i < 2 ? `1px solid ${C.border}` : "none", alignItems: "center" }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: C.inkLight }}>{label}</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                      {krw != null ? pfx + fmtS(Math.abs(krw)) : "—"}
                                    </span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: isGain ? color : C.inkMid, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                      {usd != null ? pfx + fu(usd) : "—"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <div style={{ fontSize: 10, color: C.inkLight }}>
                                현재가 {hasPrice ? fmtPrice(p, s.market === "US" ? "USD" : "KRW") : "미조회"}
                                {s.market === "US" && <span style={{ marginLeft: 6 }}>· 현재 {rate.toLocaleString("ko-KR")}원</span>}
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
          </>
          );
        })()}

        {/* ── Asset Tab ── */}
        {!dbLoading && tab === "asset" && (
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
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{a.name}</span>
                            {a.institution && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: color, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 5, padding: "1px 6px", letterSpacing: "0.02em" }}>
                                {a.institution}{a.accountSuffix ? ` ···${a.accountSuffix}` : ""}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: C.inkLight }}>{a.cat} · {a.date}</div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtS(a.amount)}</div>
                        {isOpen ? <ChevronUp size={13} color={C.inkLight} /> : <ChevronDown size={13} color={C.inkLight} />}
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
          </>
        )}

        {/* ── AMAT 탭 ── */}
        {!dbLoading && tab === "vest" && (() => {
          const amatStocks   = stocks.filter(s => s.ticker.toUpperCase() === "AMAT");
          const amatUnvested = vestings.filter(v => !v.vested && v.ticker.toUpperCase() === "AMAT")
                                       .sort((a, b) => a.vestDate.localeCompare(b.vestDate));

          const amatPrice    = amatStocks.length > 0 ? (prices[amatStocks[0].id] ?? amatStocks[0].currentPrice) : null;
          const amatShares   = amatStocks.reduce((s, x) => s + x.shares, 0);
          const amatValue    = amatPrice ? Math.round(amatPrice * amatShares * rate) : null;
          const amatCost     = amatStocks.reduce((s, x) => s + Math.round(x.avgPrice * x.shares * (x.purchaseRate ?? rate)), 0);
          const amatGain     = amatValue != null ? amatValue - amatCost : null;
          const amatGainPct  = amatCost > 0 && amatGain != null ? ((amatGain / amatCost) * 100).toFixed(1) : null;
          const unvestedVal  = amatUnvested.reduce((s, v) => { const p = vestingPrices["AMAT"]; return p ? s + Math.round(p * v.shares * rate) : s; }, 0);

          return (
            <>
              {/* ─ 요약 헤더 ─ */}
              {amatStocks.length > 0 && (
                <div style={{ background: "linear-gradient(135deg,#1a2e1a,#2d6a4f)", borderRadius: 18, padding: "18px 20px", marginBottom: 14, color: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}>AMAT</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>Applied Materials</div>
                    {amatPrice && <div style={{ marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,0.7)", fontVariantNumeric: "tabular-nums" }}>${amatPrice.toFixed(2)}</div>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 3, letterSpacing: "0.05em" }}>보유 총액</div>
                      <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{amatValue ? fmtS(amatValue) : "—"}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{amatShares}주</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 3, letterSpacing: "0.05em" }}>평가손익</div>
                      <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: amatGain >= 0 ? "#7fffc4" : "#ffb3a7" }}>
                        {amatGain != null ? (amatGain >= 0 ? "+" : "") + fmtS(amatGain) : "—"}
                      </div>
                      <div style={{ fontSize: 10, color: amatGain >= 0 ? "#7fffc4" : "#ffb3a7", marginTop: 2 }}>{amatGainPct != null ? (amatGain >= 0 ? "+" : "") + amatGainPct + "%" : ""}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 3, letterSpacing: "0.05em" }}>미베스팅 예상가</div>
                      <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{unvestedVal > 0 ? fmtS(unvestedVal) : "—"}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{amatUnvested.reduce((s, v) => s + v.shares, 0)}주 예정</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─ 보유 내역 ─ */}
              <div style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>보유</div>
              {amatStocks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 20px", background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 14, fontSize: 13, color: C.inkLight }}>
                  보유 주식이 없습니다
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                  {amatStocks.map(s => {
                    const p       = prices[s.id] ?? s.currentPrice;
                    const valKrw  = p ? Math.round(p * s.shares * rate) : null;
                    const costKrw = Math.round(s.avgPrice * s.shares * (s.purchaseRate ?? rate));
                    const gain    = valKrw != null ? valKrw - costKrw : null;
                    const gainPct = costKrw > 0 && gain != null ? ((gain / costKrw) * 100).toFixed(1) : null;
                    const gainColor = gain >= 0 ? "#2d6a4f" : "#b5451b";
                    const isEspp = /espp/i.test(s.name);
                    const typeLabel = isEspp ? "ESPP" : "RSU";
                    const typeColor = isEspp ? "#1d4e89" : "#2d6a4f";
                    return (
                      <div key={s.id} style={{ background: C.white, borderRadius: 13, border: `1px solid ${C.border}`, padding: "11px 14px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: typeColor, background: `${typeColor}18`, border: `1px solid ${typeColor}44`, borderRadius: 5, padding: "2px 7px", letterSpacing: "0.04em" }}>{typeLabel}</span>
                              <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{s.purchaseDate || "—"}</span>
                            </div>
                            <div style={{ fontSize: 11, color: C.inkLight }}>
                              {s.shares}주 · 취득가 ${s.avgPrice.toFixed(4)}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{valKrw ? fmtS(valKrw) : "—"}</div>
                            {gain != null && <div style={{ fontSize: 11, fontWeight: 600, color: gainColor, fontVariantNumeric: "tabular-nums" }}>{gain >= 0 ? "+" : ""}{fmtS(gain)} ({gainPct}%)</div>}
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                          <button onClick={() => { setEditItem(s); setModal("editStock"); }} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 10px", cursor: "pointer", color: C.inkMid, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><Pencil size={10} /> 수정</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ─ RSU 그랜트 ─ */}
              <div style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>RSU 그랜트</div>
              {(() => {
                const amatVestings = vestings.filter(v => v.ticker.toUpperCase() === "AMAT").sort((a, b) => a.vestDate.localeCompare(b.vestDate));
                if (amatVestings.length === 0) return (
                  <div style={{ textAlign: "center", padding: "24px 20px", background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 14, fontSize: 13, color: C.inkLight }}>
                    RSU 그랜트를 추가해보세요
                  </div>
                );
                const grantMap = {};
                amatVestings.forEach(v => { if (!grantMap[v.name]) grantMap[v.name] = []; grantMap[v.name].push(v); });
                const grantEntries = Object.entries(grantMap).sort(([, a], [, b]) => a[0].vestDate.localeCompare(b[0].vestDate));
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                    {grantEntries.map(([grantName, gvs]) => {
                      const totalShares    = gvs.reduce((s, v) => s + v.shares, 0);
                      const vestedShares   = gvs.filter(v => v.vested).reduce((s, v) => s + v.shares, 0);
                      const unvestedShares = totalShares - vestedShares;
                      const nextVest       = gvs.filter(v => !v.vested)[0];
                      const isOpen         = openGrants.has(grantName);
                      const dl             = nextVest ? Math.ceil((new Date(nextVest.vestDate) - new Date()) / 86400000) : null;
                      const dColor         = dl == null ? C.inkLight : dl < 0 ? C.inkLight : dl < 30 ? "#b5451b" : dl < 90 ? "#e07a5f" : "#2d6a4f";
                      const toggleGrant    = () => setOpenGrants(p => { const n = new Set(p); n.has(grantName) ? n.delete(grantName) : n.add(grantName); return n; });
                      return (
                        <div key={grantName} style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                          <div style={{ display: "flex", alignItems: "center", padding: "12px 14px", gap: 8 }}>
                            <button onClick={toggleGrant} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", fontFamily: F }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{grantName}</div>
                                  <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>총 {totalShares}주 · 완료 {vestedShares}주 · 예정 {unvestedShares}주</div>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                  {dl != null && <div style={{ fontSize: 12, fontWeight: 700, color: dColor }}>{dl < 0 ? "지남" : `D-${dl}`}</div>}
                                  {nextVest && <div style={{ fontSize: 10, color: C.inkLight }}>{nextVest.vestDate}</div>}
                                </div>
                                {isOpen ? <ChevronUp size={14} color={C.inkLight} /> : <ChevronDown size={14} color={C.inkLight} />}
                              </div>
                            </button>
                            <button onClick={() => { if (window.confirm(`'${grantName}' 그랜트 전체(${gvs.length}건)를 삭제할까요?`)) deleteGrant(grantName); }}
                              style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 7px", cursor: "pointer", color: C.inkLight, display: "flex", alignItems: "center", flexShrink: 0 }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                          {isOpen && (
                            <div style={{ borderTop: `1px solid ${C.border}` }}>
                              {gvs.map((v, vi) => {
                                const vdl = Math.ceil((new Date(v.vestDate) - new Date()) / 86400000);
                                const vdc = v.vested ? "#2d6a4f" : vdl < 0 ? C.inkLight : vdl < 30 ? "#b5451b" : vdl < 90 ? "#e07a5f" : "#2d6a4f";
                                return (
                                  <div key={v.id} style={{ display: "flex", alignItems: "center", padding: "7px 14px", borderBottom: vi < gvs.length - 1 ? `1px solid ${C.border}` : "none", gap: 8, opacity: v.vested ? 0.5 : 1 }}>
                                    <span style={{ fontSize: 12, color: v.vested ? "#2d6a4f" : C.border, flexShrink: 0 }}>{v.vested ? "✓" : "○"}</span>
                                    <div style={{ flex: 1 }}>
                                      <span style={{ fontSize: 12, fontWeight: v.vested ? 400 : 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{v.vestDate}</span>
                                      <span style={{ fontSize: 11, color: C.inkLight, marginLeft: 6 }}>{v.shares}주</span>
                                      {v.vested && v.vestPrice && <span style={{ fontSize: 11, color: C.inkLight, marginLeft: 4 }}>@ ${v.vestPrice}</span>}
                                    </div>
                                    {!v.vested && <span style={{ fontSize: 10, fontWeight: 700, color: vdc, flexShrink: 0 }}>{vdl < 0 ? "지남" : `D-${vdl}`}</span>}
                                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                      {!v.vested && (
                                        <button onClick={() => { setEditItem(v); setModal("vestComplete"); }}
                                          style={{ background: "#2d6a4f", border: "none", borderRadius: 5, padding: "4px 8px", cursor: "pointer", color: "#fff", fontSize: 10, fontWeight: 700, fontFamily: F }}>✓</button>
                                      )}
                                      <button onClick={() => { setEditItem(v); setModal("editVesting"); }}
                                        style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 7px", cursor: "pointer", color: C.inkMid, display: "flex", alignItems: "center" }}>
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
                  </div>
                );
              })()}

            </>
          );
        })()}
      </div>

      {/* FAB */}
      {!dbLoading && tab !== "vest" && (
        <button onClick={() => setModal(tab === "stock" ? "addStock" : "addAsset")} style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 200,
          width: 56, height: 56, borderRadius: "50%", border: "none",
          background: tab === "stock" ? "#2d6a4f" : "#234080", color: "#fff", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 4px 20px ${tab === "stock" ? "#2d6a4f88" : "#23408088"}`,
          transition: "transform 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
          <Plus size={26} />
        </button>
      )}
      {!dbLoading && tab === "vest" && (
        <div style={{ position: "fixed", bottom: 24, right: 16, zIndex: 200, display: "flex", gap: 8 }}>
          <button onClick={() => setModal("addOffering")} style={{ display: "flex", alignItems: "center", gap: 6, background: "#1d4e89", color: "#fff", border: "none", borderRadius: 14, padding: "13px 18px", fontFamily: F, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px #1d4e8966" }}>
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
        <StockForm initial={addInitial} onSave={addStock} saving={false} />
      </Modal>
      <Modal open={modal === "editStock" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <StockForm initial={editItem} onSave={updateStock} onDelete={() => deleteStock(editItem.id)} onCopy={s => { setAddInitial(s); setModal("addStock"); setEditItem(null); }} saving={false} />}
      </Modal>
      <Modal open={modal === "addAsset"}  onClose={() => setModal(null)}>
        <AssetForm cats={cats} onSave={addAsset} saving={false} />
      </Modal>
      <Modal open={modal === "editAsset" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <AssetForm initial={editItem} cats={cats} onSave={updateAsset} onDelete={() => deleteAsset(editItem.id)} saving={false} />}
      </Modal>
      <Modal open={modal === "cats"} onClose={() => setModal(null)}>
        <CatSettings cats={cats} onChange={c => {
          setCats(c);
          if (isConfigured()) sb("settings", { method: "POST", body: JSON.stringify({ key: "cats", value: c }), prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
        }} />
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
