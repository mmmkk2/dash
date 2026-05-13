import { useState, useMemo, useEffect } from "react";
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const STORAGE_KEY   = "my_assets_v2";

/* ── Google Fonts ── */
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

const DEFAULT_CATS = [
  { key: "주식",     color: "#2d6a4f" },
  { key: "달러/외화", color: "#1d4e89" },
  { key: "부동산",   color: "#b5451b" },
  { key: "예금/적금", color: "#0077b6" },
  { key: "가상화폐", color: "#7b2d00" },
  { key: "기타",     color: "#6b5c4e" },
];
const CAT_COLORS = ["#2d6a4f","#1d4e89","#b5451b","#0077b6","#7b2d00","#4a1942","#831843","#6b5c4e","#374151"];

/* ── Supabase ── */
async function sb(path, opts = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "",
    },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json().catch(() => null);
}

function isConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON && !SUPABASE_ANON.includes("여기에"));
}

/* ── Local storage ── */
function load(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

const C = {
  bg:       "#f5f0e8",
  paper:    "#faf8f4",
  white:    "#ffffff",
  ink:      "#1a1410",
  inkMid:   "#4a3f35",
  inkLight: "#9c8e82",
  border:   "#e8e0d4",
  cream:    "#f5f0e8",
  header:   "linear-gradient(160deg,#1a3258 0%,#234080 50%,#2a4e96 100%)",
};

const F = "'Inter',sans-serif";

function SLabel({ children }) {
  return <div style={{ fontSize: "10px", fontWeight: 700, color: C.inkLight, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px", fontFamily: F }}>{children}</div>;
}

/* ── Modal ── */
function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: "24px 24px 0 0", padding: "8px 24px 40px", width: "100%", maxWidth: "660px", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: "10px auto 20px" }} />
        {children}
      </div>
    </div>
  );
}

/* ── AssetForm ── */
function AssetForm({ initial, cats, onSave, onDelete, saving }) {
  const init = initial || {};
  const [name,    setName]    = useState(init.name    || "");
  const [cat,     setCat]     = useState(init.cat     || cats[0]?.key || "기타");
  const [amount,  setAmount]  = useState(init.amount  ? Number(init.amount).toLocaleString("ko-KR") : "");
  const [memo,    setMemo]    = useState(init.memo    || "");
  const [date,    setDate]    = useState(init.date    || new Date().toISOString().slice(0, 10));
  const [err,     setErr]     = useState(false);
  const isEdit = !!initial;

  function submit() {
    const num = parseInt(String(amount).replace(/,/g, ""));
    if (!name.trim() || !num || num <= 0) { setErr(true); setTimeout(() => setErr(false), 400); return; }
    onSave({ id: init.id || Date.now(), name: name.trim(), cat, amount: num, memo: memo.trim(), date });
  }

  const catObj = cats.find(c => c.key === cat) || { color: C.inkMid };

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <span style={{ fontSize: "20px", fontWeight: 700, color: C.ink }}>{isEdit ? "자산 수정" : "자산 추가"}</span>
        {isEdit && (
          <button onClick={onDelete} style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff1ee", border: "1px solid #f4c5b2", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#b5451b", fontSize: 12, fontWeight: 600 }}>
            <Trash2 size={13} /> 삭제
          </button>
        )}
      </div>

      {/* Name */}
      <div style={{ marginBottom: 14 }}>
        <SLabel>자산명</SLabel>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 삼성전자, KB적금, 강남 오피스텔"
          style={{ width: "100%", border: `1.5px solid ${err && !name.trim() ? "#e07a5f" : C.border}`, borderRadius: 12, padding: "11px 14px", fontSize: 15, fontWeight: 500, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
      </div>

      {/* Category */}
      <div style={{ marginBottom: 14 }}>
        <SLabel>분류</SLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {cats.map(c => {
            const sel = cat === c.key;
            return (
              <button key={c.key} onClick={() => setCat(c.key)} style={{
                padding: "6px 14px", borderRadius: 99, cursor: "pointer", fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${sel ? c.color : C.border}`,
                background: sel ? c.color : C.white, color: sel ? "#fff" : C.inkMid,
                fontFamily: F, boxShadow: sel ? `0 2px 8px ${c.color}44` : "none",
              }}>{c.key}</button>
            );
          })}
        </div>
      </div>

      {/* Amount */}
      <div style={{ marginBottom: 14 }}>
        <SLabel>현재 평가액</SLabel>
        <div style={{ display: "flex", alignItems: "center", background: err && !parseInt(String(amount).replace(/,/g,"")) ? "#fff5f0" : C.white, border: `1.5px solid ${err && !parseInt(String(amount).replace(/,/g,"")) ? "#e07a5f" : C.border}`, borderRadius: 12, padding: "0 16px" }}>
          <span style={{ color: C.inkLight, fontSize: 17, marginRight: 8 }}>₩</span>
          <input type="text" inputMode="numeric" value={amount}
            onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ""); setAmount(raw ? Number(raw).toLocaleString("ko-KR") : raw); }}
            placeholder="0"
            style={{ flex: 1, border: "none", background: "transparent", fontSize: 24, fontWeight: 700, color: C.ink, padding: "12px 0", outline: "none", fontFamily: F, letterSpacing: "-0.3px", fontVariantNumeric: "tabular-nums" }} />
          <span style={{ color: C.inkLight, fontSize: 13 }}>원</span>
        </div>
      </div>

      {/* Memo + Date */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <div>
          <SLabel>메모</SLabel>
          <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="수량, 단가 등"
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "11px 14px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
        <div>
          <SLabel>기준일</SLabel>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "11px 14px", fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: F, boxSizing: "border-box" }} />
        </div>
      </div>

      <button onClick={submit} disabled={saving} style={{
        width: "100%", padding: "15px", borderRadius: 13, border: "none",
        background: catObj.color, color: "#fff", fontSize: 15, fontWeight: 700,
        cursor: saving ? "not-allowed" : "pointer", fontFamily: F,
        boxShadow: `0 4px 18px ${catObj.color}55`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        {saving ? "저장 중…" : isEdit ? <><Check size={16} /> 저장하기</> : <><Plus size={16} /> 추가하기</>}
      </button>
    </div>
  );
}

/* ── CatSettings ── */
function CatSettings({ cats, onChange }) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(CAT_COLORS[0]);

  function addCat() {
    const name = newName.trim();
    if (!name || cats.find(c => c.key === name)) return;
    onChange([...cats, { key: name, color: newColor }]);
    setNewName("");
  }

  function removeCat(key) {
    onChange(cats.filter(c => c.key !== key));
  }

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.ink, marginBottom: 20 }}>분류 관리</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {cats.map(c => (
          <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10, background: C.paper, borderRadius: 12, padding: "10px 14px", border: `1px solid ${C.border}` }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: C.ink }}>{c.key}</div>
            {!DEFAULT_CATS.find(d => d.key === c.key) && (
              <button onClick={() => removeCat(c.key)} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkLight, display: "flex" }}>
                <X size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      <SLabel>새 분류 추가</SLabel>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="분류명"
          style={{ flex: 1, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, outline: "none", fontFamily: F, color: C.ink }} />
        <button onClick={addCat} style={{ background: C.ink, border: "none", borderRadius: 10, padding: "9px 16px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
          <Plus size={14} />
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {CAT_COLORS.map(col => (
          <button key={col} onClick={() => setNewColor(col)} style={{
            width: 28, height: 28, borderRadius: "50%", background: col, border: newColor === col ? "3px solid #1a1410" : "2px solid transparent", cursor: "pointer",
          }} />
        ))}
      </div>
    </div>
  );
}

/* ── Main ── */
export default function AssetsApp() {
  const [assets, setAssets] = useState(() => load(STORAGE_KEY, []));
  const [cats,   setCats]   = useState(() => load("my_asset_cats_v1", DEFAULT_CATS));
  const [modal,  setModal]  = useState(null); // "add" | "edit" | "cats"
  const [editItem, setEditItem] = useState(null);
  const [filterCat, setFilterCat] = useState("전체");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null);

  /* sync */
  useEffect(() => { save(STORAGE_KEY, assets); }, [assets]);
  useEffect(() => { save("my_asset_cats_v1", cats); }, [cats]);

  /* Supabase load */
  useEffect(() => {
    if (!isConfigured()) return;
    sb("assets?select=*&order=created_at.desc")
      .then(rows => { if (rows?.length) setAssets(rows.map(r => ({ id: r.id, name: r.name, cat: r.cat, amount: r.amount, memo: r.memo || "", date: r.date }))); })
      .catch(() => {});
  }, []);

  async function addAsset(item) {
    setSaving(true);
    setAssets(prev => { const n = [...prev, item]; save(STORAGE_KEY, n); return n; });
    if (isConfigured()) {
      sb("assets", { method: "POST", prefer: "return=minimal", body: JSON.stringify({ id: item.id, name: item.name, cat: item.cat, amount: item.amount, memo: item.memo, date: item.date }) }).catch(console.error);
    }
    setSaving(false);
    setModal(null);
  }

  async function updateAsset(item) {
    setSaving(true);
    setAssets(prev => { const n = prev.map(a => a.id === item.id ? item : a); save(STORAGE_KEY, n); return n; });
    if (isConfigured()) {
      sb(`assets?id=eq.${item.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ name: item.name, cat: item.cat, amount: item.amount, memo: item.memo, date: item.date }) }).catch(console.error);
    }
    setSaving(false);
    setModal(null);
    setEditItem(null);
  }

  async function deleteAsset(id) {
    setAssets(prev => { const n = prev.filter(a => a.id !== id); save(STORAGE_KEY, n); return n; });
    if (isConfigured()) {
      sb(`assets?id=eq.${id}`, { method: "DELETE" }).catch(console.error);
    }
    setModal(null);
    setEditItem(null);
  }

  const total = useMemo(() => assets.reduce((s, a) => s + a.amount, 0), [assets]);

  const byCat = useMemo(() => {
    const m = {};
    assets.forEach(a => { m[a.cat] = (m[a.cat] || 0) + a.amount; });
    return cats.filter(c => m[c.key] > 0).map(c => ({ name: c.key, value: m[c.key], color: c.color })).sort((a, b) => b.value - a.value);
  }, [assets, cats]);

  const filtered = useMemo(() =>
    filterCat === "전체" ? assets : assets.filter(a => a.cat === filterCat),
    [assets, filterCat]
  );

  const tt = { background: C.paper, border: `1px solid ${C.border}`, borderRadius: "10px", fontFamily: F, fontSize: "12px" };
  const catColor = key => cats.find(c => c.key === key)?.color || C.inkMid;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, paddingBottom: 80, fontFamily: F }}>

      {/* Header */}
      <div style={{ background: C.header, color: "#fff", paddingBottom: 32 }}>
        <div style={{ maxWidth: 660, margin: "0 auto", padding: "28px 20px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.35, letterSpacing: "0.2em", marginBottom: 4 }}>NET WORTH</div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1 }}>내 자산</div>
            </div>
            <button onClick={() => setModal("cats")} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "8px 14px", color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              분류 관리
            </button>
          </div>

          {/* Total */}
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 18, padding: "20px 22px", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.45, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>총 자산</div>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-1px", fontVariantNumeric: "tabular-nums" }}>{fmtS(total)}<span style={{ fontSize: 16, fontWeight: 500, opacity: 0.6, marginLeft: 4 }}>원</span></div>
            <div style={{ fontSize: 12, opacity: 0.45, marginTop: 4 }}>{fmt(total)}</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 660, margin: "0 auto", padding: "0 14px" }}>

        {/* Donut chart */}
        {byCat.length > 0 && (
          <div style={{ background: C.white, borderRadius: "0 0 20px 20px", padding: "18px 18px 12px", border: `1px solid ${C.border}`, borderTop: "none", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.inkLight, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>자산 구성</div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={byCat} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={3}>
                  {byCat.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={v => [fmt(v)]} contentStyle={tt} />
                <Legend iconType="circle" iconSize={7} formatter={v => <span style={{ fontSize: 10, color: C.inkMid, fontFamily: F }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Category summary bars */}
        {byCat.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {byCat.map(c => {
              const pct = Math.round((c.value / (total || 1)) * 100);
              return (
                <button key={c.name} onClick={() => setFilterCat(filterCat === c.name ? "전체" : c.name)}
                  style={{ background: filterCat === c.name ? c.color + "18" : C.white, border: `1.5px solid ${filterCat === c.name ? c.color : C.border}`, borderRadius: 14, padding: "11px 14px 9px", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                    <div style={{ width: 9, height: 9, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.ink }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: c.color, fontWeight: 700, marginRight: 4 }}>{pct}%</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtS(c.value)}</div>
                  </div>
                  <div style={{ background: C.cream, borderRadius: 99, height: 4, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: c.color, borderRadius: 99 }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Filter tab */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}>
          {["전체", ...cats.filter(c => assets.some(a => a.cat === c.key)).map(c => c.key)].map(k => (
            <button key={k} onClick={() => setFilterCat(k)} style={{
              padding: "6px 14px", borderRadius: 99, border: `1.5px solid ${filterCat === k ? catColor(k) || C.ink : C.border}`,
              background: filterCat === k ? (catColor(k) || C.ink) : C.white,
              color: filterCat === k ? "#fff" : C.inkMid,
              fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, fontFamily: F,
            }}>{k}</button>
          ))}
        </div>

        {/* Asset list */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 20px", background: C.white, borderRadius: 20, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.inkMid, marginBottom: 6 }}>자산을 추가해보세요</div>
            <div style={{ fontSize: 12, color: C.inkLight }}>오른쪽 하단 + 버튼으로 추가</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(a => {
              const color = catColor(a.cat);
              const isOpen = expanded === a.id;
              return (
                <div key={a.id} style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                  <button onClick={() => setExpanded(isOpen ? null : a.id)}
                    style={{ width: "100%", background: "none", border: "none", padding: "14px 16px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 8, height: 36, borderRadius: 4, background: color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 3 }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: C.inkLight }}>{a.cat} · {a.date}</div>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px" }}>{fmtS(a.amount)}</div>
                    {isOpen ? <ChevronUp size={14} color={C.inkLight} /> : <ChevronDown size={14} color={C.inkLight} />}
                  </button>
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px", background: C.paper, display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>{fmt(a.amount)}</div>
                        {a.memo && <div style={{ fontSize: 12, color: C.inkLight, marginTop: 3 }}>{a.memo}</div>}
                      </div>
                      <button onClick={() => { setEditItem(a); setModal("edit"); }}
                        style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: C.inkMid, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600 }}>
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

      {/* FAB */}
      <button onClick={() => setModal("add")} style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 200,
        width: 56, height: 56, borderRadius: "50%", border: "none",
        background: "#234080", color: "#fff", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 20px #23408088", transition: "transform 0.15s",
      }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
        <Plus size={26} />
      </button>

      {/* Modals */}
      <Modal open={modal === "add"} onClose={() => setModal(null)}>
        <AssetForm cats={cats} onSave={addAsset} saving={saving} />
      </Modal>
      <Modal open={modal === "edit" && !!editItem} onClose={() => { setModal(null); setEditItem(null); }}>
        {editItem && <AssetForm initial={editItem} cats={cats} onSave={updateAsset} onDelete={() => deleteAsset(editItem.id)} saving={saving} />}
      </Modal>
      <Modal open={modal === "cats"} onClose={() => setModal(null)}>
        <CatSettings cats={cats} onChange={c => { setCats(c); save("my_asset_cats_v1", c); }} />
      </Modal>
    </div>
  );
}
