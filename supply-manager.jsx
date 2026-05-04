import { useState, useEffect } from "react";

const CATEGORIES = ["소모품", "문구", "청소용품", "전자기기", "음료/식품", "기타"];

const DEFAULT_ITEMS = [
  { id: 1, name: "A4 용지", category: "소모품", stock: 3, minStock: 2, unit: "묶음", price: 4500, lastUpdated: "2026-04-20" },
  { id: 2, name: "볼펜 (검정)", category: "문구", stock: 12, minStock: 10, unit: "개", price: 500, lastUpdated: "2026-04-18" },
  { id: 3, name: "손 소독제", category: "청소용품", stock: 1, minStock: 3, unit: "개", price: 3000, lastUpdated: "2026-04-15" },
  { id: 4, name: "HDMI 케이블", category: "전자기기", stock: 5, minStock: 2, unit: "개", price: 8000, lastUpdated: "2026-04-10" },
  { id: 5, name: "아이스티 (복숭아)", category: "음료/식품", stock: 24, minStock: 12, unit: "개", price: 200, lastUpdated: "2026-04-22" },
  { id: 6, name: "화장지", category: "청소용품", stock: 8, minStock: 5, unit: "롤", price: 1200, lastUpdated: "2026-04-19" },
  { id: 7, name: "형광펜", category: "문구", stock: 2, minStock: 5, unit: "개", price: 800, lastUpdated: "2026-04-17" },
  { id: 8, name: "충전 케이블 (C타입)", category: "전자기기", stock: 4, minStock: 3, unit: "개", price: 6000, lastUpdated: "2026-04-12" },
];

// G마켓 = 앤딩스터디카페 상도점 명의 → 확실
// 쿠팡 = 수동 확인 필요 (동작구 ✓ / 제외 ✗)
const GMAIL_MAILS = [
  // ── G마켓 상도점 확실 ──────────────────────────────────
  { id: "g_20260426", date: "2026-04-26", store: "G마켓", amount: 23750, product: "", confirmed: "상도점" },
  { id: "kg_20260424", date: "2026-04-24", store: "KG이니시스", amount: 22800, product: "", confirmed: "상도점" },
  { id: "g_20260422a", date: "2026-04-22", store: "G마켓", amount: 60450, product: "", confirmed: "상도점" },
  { id: "g_20260422b", date: "2026-04-22", store: "G마켓", amount: 18450, product: "", confirmed: "상도점" },
  { id: "g_20260422c", date: "2026-04-22", store: "G마켓", amount: 19070, product: "", confirmed: "상도점" },
  { id: "g_20260416", date: "2026-04-16", store: "G마켓", amount: 32510, product: "", confirmed: "상도점" },
  { id: "g_20260407", date: "2026-04-07", store: "G마켓", amount: 35800, product: "", confirmed: "상도점" },
  { id: "g_20260401", date: "2026-04-01", store: "G마켓", amount: 30270, product: "", confirmed: "상도점" },
  { id: "g_20260324", date: "2026-03-24", store: "G마켓", amount: 19070, product: "", confirmed: "상도점" },
  { id: "g_20260321", date: "2026-03-21", store: "G마켓", amount: 17430, product: "", confirmed: "상도점" },
  { id: "g_20260223a", date: "2026-02-23", store: "G마켓", amount: 34800, product: "", confirmed: "상도점" },
  { id: "g_20260223b", date: "2026-02-23", store: "G마켓", amount: 34800, product: "", confirmed: "상도점" },
  // ── 쿠팡 수동 확인 필요 ───────────────────────────────
  { id: "c_20260422", date: "2026-04-22", store: "쿠팡", amount: 13000, product: "다하다 둥굴레차 1.2g 100개입 ×2", confirmed: null },
  { id: "c_20260420", date: "2026-04-20", store: "쿠팡", amount: 3040, product: "스탬프형 도장 인주 70×56mm", confirmed: null },
  { id: "c_20260410", date: "2026-04-10", store: "쿠팡", amount: 19200, product: "다농원 제주향기 현미녹차 티백 100개입 ×4", confirmed: null },
  { id: "c_20260407a", date: "2026-04-07", store: "쿠팡", amount: 14990, product: "일광제과 비타C레몬맛캔디 2kg", confirmed: null },
  { id: "c_20260407b", date: "2026-04-07", store: "쿠팡", amount: 40900, product: "재로우 포뮬러스 펨 도필러스 50억 60정", confirmed: null },
  { id: "c_20260401", date: "2026-04-01", store: "쿠팡", amount: 5500, product: "가드맨 KF-AD 비말차단 마스크 50개 ×2", confirmed: null },
  { id: "c_20260330", date: "2026-03-30", store: "쿠팡", amount: 8690, product: "탐사베이직 퍼퓸포밍 핸드워시 4L", confirmed: null },
  { id: "c_20260318a", date: "2026-03-18", store: "쿠팡", amount: 19320, product: "이레에프에스 복숭아 아이스티 분말 100개입 ×2", confirmed: null },
  { id: "c_20260318b", date: "2026-03-18", store: "쿠팡", amount: 15600, product: "동서 한잔용 보리차 100개입 ×3", confirmed: null },
  { id: "c_20260319a", date: "2026-03-19", store: "쿠팡", amount: 9490, product: "우리차 아이스티 복숭아 70개입", confirmed: null },
  { id: "c_20260319b", date: "2026-03-19", store: "쿠팡", amount: 344000, product: "쿼드쎄라 초음파 피부 마사지기", confirmed: null },
  { id: "c_20260310", date: "2026-03-10", store: "쿠팡", amount: 11180, product: "코멧 배접 쓰레기봉투 50L 100개 ×2", confirmed: null },
  { id: "c_20260309", date: "2026-03-09", store: "쿠팡", amount: 8730, product: "피그인더가든 마녀스프 토마토비프 200g ×2", confirmed: null },
  { id: "c_20260223a", date: "2026-02-23", store: "쿠팡", amount: 20400, product: "폴로 오리지널 캔디 900g ×2", confirmed: null },
  { id: "c_20260223b", date: "2026-02-23", store: "쿠팡", amount: 13360, product: "코멧 아기물티슈 100매 ×20", confirmed: null },
  { id: "c_20260223c", date: "2026-02-23", store: "쿠팡", amount: 21900, product: "한끼통살 백마녀스프(냉동) 300g ×5", confirmed: null },
  { id: "c_20260425", date: "2026-04-25", store: "쿠팡", amount: 137750, product: "닥터라이프 무선 온열 공기압 종아리 발 안마기", confirmed: null },
  { id: "c_20260417", date: "2026-04-17", store: "쿠팡", amount: 6490, product: "와이즐리 저자극 약산성 클렌징폼 180ml", confirmed: null },
  { id: "c_20260412", date: "2026-04-12", store: "쿠팡이츠", amount: 13500, product: "[T]진심초밥 세트 10p", confirmed: null },
];

function useLocalStorage(key, def) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}

const fmt = (n) => n > 0 ? n.toLocaleString("ko-KR") + "원" : "-";
const statusColor = (stock, min) => {
  if (stock === 0) return { bg: "#ff4444", text: "#fff", label: "품절" };
  if (stock <= min) return { bg: "#ff9500", text: "#fff", label: "부족" };
  return { bg: "#34c759", text: "#fff", label: "정상" };
};

export default function App() {
  const [items, setItems] = useLocalStorage("cafe_items_v4", DEFAULT_ITEMS);
  const [history, setHistory] = useLocalStorage("cafe_history_v4", []);
  const [importedIds, setImportedIds] = useLocalStorage("cafe_imported_v4", []);
  // 쿠팡 수동 확인: { mailId: "상도점" | "제외" }
  const [manualConfirm, setManualConfirm] = useLocalStorage("cafe_confirm_v4", {});

  const [tab, setTab] = useState("gmail");
  const [gmailTab, setGmailTab] = useState("상도점"); // 상도점 | 미확인 | 제외
  const [selectedMails, setSelectedMails] = useState([]);
  const [importForm, setImportForm] = useState({});
  const [deletedMailIds, setDeletedMailIds] = useLocalStorage("cafe_deleted_mails_v4", []);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [filterCat, setFilterCat] = useState("전체");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (msg, color = "#34c759") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2500);
  };

  // 각 메일의 최종 confirmed 상태 (G마켓은 하드코딩, 쿠팡은 manual)
  const getConfirmed = (mail) => {
    if (mail.confirmed === "상도점") return "상도점";
    return manualConfirm[mail.id] || null; // null = 미확인
  };

  const setConfirm = (mailId, value) => {
    setManualConfirm(prev => ({ ...prev, [mailId]: value }));
    setSelectedMails(prev => prev.filter(id => id !== mailId));
  };

  // Gmail 탭별 메일 목록
  const mailsByTab = {
    상도점: GMAIL_MAILS.filter(m => getConfirmed(m) === "상도점"),
    미확인: GMAIL_MAILS.filter(m => m.store === "쿠팡" || m.store === "쿠팡이츠").filter(m => !getConfirmed(m)),
    제외: GMAIL_MAILS.filter(m => getConfirmed(m) === "제외"),
  };

  const displayMails = (mailsByTab[gmailTab] || []).filter(m => !deletedMailIds.includes(m.id));
  const pendingCount = mailsByTab["미확인"].length;
  const sandoCount = mailsByTab["상도점"].length;

  // 입고 가져오기
  const importSelected = () => {
    const toImport = displayMails.filter(m => selectedMails.includes(m.id) && !importedIds.includes(m.id));
    if (!toImport.length) { showToast("이미 가져온 메일이에요", "#888"); return; }
    const newRec = toImport.map(m => {
      const ov = importForm[m.id] || {};
      return {
        id: Date.now() + Math.random(),
        itemName: ov.itemName || m.product,
        qty: Number(ov.qty) || 1,
        totalCost: m.amount,
        date: m.date,
        note: m.store,
        source: "gmail",
        category: ov.category || "소모품",
      };
    });
    setHistory(prev => [...newRec, ...prev]);
    setImportedIds(prev => [...prev, ...toImport.map(m => m.id)]);
    setSelectedMails([]);
    showToast(`${newRec.length}건 구매이력 추가 ✅`);
  };

  const toggleSelect = (id) => setSelectedMails(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const alertItems = items.filter(i => i.stock <= i.minStock);
  const filtered = items.filter(i => (filterCat === "전체" || i.category === filterCat) && (i.name.includes(search) || i.category.includes(search)));

  const openModal = (type, item = null) => {
    if (type === "add") setForm({ name: "", category: "소모품", stock: 0, minStock: 0, unit: "개", price: 0 });
    else if (type === "edit") setForm({ ...item });
    else if (type === "purchase") setForm({ itemId: item.id, itemName: item.name, qty: 1, note: "", totalCost: item.price });
    else if (type === "adjust") setForm({ itemId: item.id, itemName: item.name, stock: item.stock, delta: 0 });
    else if (type === "editHistory") setForm({ ...item });
    setModal({ type, item });
  };
  const closeModal = () => setModal(null);

  const saveItem = () => {
    if (!form.name) return;
    if (modal.type === "add") {
      setItems(prev => [...prev, { ...form, id: Date.now(), lastUpdated: new Date().toISOString().slice(0, 10), stock: +form.stock, minStock: +form.minStock, price: +form.price }]);
      showToast("비품 추가");
    } else {
      setItems(prev => prev.map(i => i.id === form.id ? { ...form, stock: +form.stock, minStock: +form.minStock, price: +form.price, lastUpdated: new Date().toISOString().slice(0, 10) } : i));
      showToast("수정 완료");
    }
    closeModal();
  };

  const savePurchase = () => {
    const qty = +form.qty, cost = +form.totalCost;
    setHistory(prev => [{ id: Date.now(), itemName: form.itemName, qty, totalCost: cost, date: new Date().toISOString().slice(0, 10), note: form.note || "", source: "manual" }, ...prev]);
    setItems(prev => prev.map(i => i.id === form.itemId ? { ...i, stock: i.stock + qty, lastUpdated: new Date().toISOString().slice(0, 10) } : i));
    showToast(`+${qty} 입고`); closeModal();
  };

  const saveAdjust = () => {
    const delta = +form.delta;
    setItems(prev => prev.map(i => i.id === form.itemId ? { ...i, stock: Math.max(0, i.stock + delta), lastUpdated: new Date().toISOString().slice(0, 10) } : i));
    showToast(delta >= 0 ? `+${delta} 조정` : `${delta} 조정`); closeModal();
  };

  const totalAsset = items.reduce((s, i) => s + i.stock * i.price, 0);

  return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", background: "#f0f2f5", minHeight: "100vh" }}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        *{box-sizing:border-box;margin:0;padding:0}
        button{cursor:pointer;border:none;background:none;font-family:inherit}
        input,select{font-family:inherit}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#ccc;border-radius:3px}
        .tab-btn{padding:9px 12px;font-size:13px;font-weight:600;border-radius:10px;transition:all .2s;white-space:nowrap;flex:1}
        .tab-btn.on{background:#374151;color:#fff;box-shadow:0 4px 12px #37415130}
        .tab-btn:not(.on){color:#888}.tab-btn:not(.on):hover{background:#f3f4f6;color:#374151}
        .sub-tab{padding:7px 14px;border-radius:20px;font-size:12px;font-weight:700;transition:all .2s}
        .sub-tab.on{background:#374151;color:#fff}
        .sub-tab:not(.on){background:#f3f4f6;color:#666}
        .card{background:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 1px 6px #0000000a;transition:all .2s}
        .card:hover{box-shadow:0 2px 8px #00000012;transform:translateY(-1px)}
        .badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700}
        .btn-p{background:#374151;color:#fff;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:600}
        .btn-p:hover{background:#1f2937}
        .btn-sm{padding:5px 11px;border-radius:8px;font-size:12px;font-weight:600;transition:all .15s}
        .form-g{display:flex;flex-direction:column;gap:6px}
        .form-g label{font-size:12px;font-weight:600;color:#666}
        .form-g input,.form-g select{border:1.5px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-size:14px;outline:none;transition:border .2s}
        .form-g input:focus,.form-g select:focus{border-color:#374151}
        .overlay{position:fixed;inset:0;background:#0006;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px}
        .modal{background:#fff;border-radius:20px;padding:26px;width:100%;max-width:420px;box-shadow:0 20px 60px #0003}
        .mini-inp{border:1.5px solid #e5e7eb;border-radius:8px;padding:6px 9px;font-size:12px;outline:none;width:100%}
        .mini-inp:focus{border-color:#374151}
        .pulse{animation:pulse 2s infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
        .empty{text-align:center;padding:50px 20px;color:#bbb}
        .confirm-btn{padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;transition:all .15s}
      `}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #f0f0f0" }}>
        <div style={{ maxWidth: 940, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58, padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: "#374151", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📦</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>앤딩 비품관리</div>
              <div style={{ fontSize: 10, color: "#aaa" }}>상도점 · 무인</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {pendingCount > 0 && (
              <div className="pulse" style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, color: "#ea580c", cursor: "pointer" }}
                onClick={() => { setTab("gmail"); setGmailTab("미확인"); }}>
                ❓ 미확인 {pendingCount}건
              </div>
            )}
            {alertItems.length > 0 && (
              <div className="pulse" style={{ background: "#fff3e0", border: "1px solid #ff9500", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, color: "#92400e", cursor: "pointer" }}
                onClick={() => setTab("alerts")}>
                ⚠️ {alertItems.length}개
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 940, margin: "0 auto", padding: "16px" }}>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { label: "전체 비품", value: items.length + "종", bg: "#f1f5f9", textColor: "#1e293b", icon: "📋" },
            { label: "재고부족", value: alertItems.length + "개", bg: "#fef9f0", textColor: "#92400e", icon: "⚠️" },
            { label: "재고 자산", value: (totalAsset / 10000).toFixed(0) + "만원", bg: "#f0faf4", textColor: "#14532d", icon: "💰" },
            { label: "상도점 구매", value: sandoCount + "건", bg: "#f0f4ff", textColor: "#1e3a8a", icon: "🏪" },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 14, padding: "14px", color: s.textColor }}>
              <div style={{ fontSize: 18 }}>{s.icon}</div>
              <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{s.value}</div>
              <div style={{ fontSize: 10, opacity: .85 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Main tabs */}
        <div style={{ display: "flex", gap: 4, background: "#fff", borderRadius: 13, padding: 5, boxShadow: "0 2px 8px #0000000a", marginBottom: 16, overflowX: "auto" }}>
          {[["gmail","✉️ Gmail"], ["history","🛒 이력"], ["cycle","🔄 구매주기"]].map(([k, l]) => (
            <button key={k} className={`tab-btn${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {/* ═══════════ GMAIL TAB ═══════════ */}
        {tab === "gmail" && (
          <div>
            {/* Sub tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
              {[
                { key: "상도점", label: `🏪 상도점 (${mailsByTab["상도점"].length})` },
                { key: "미확인", label: `❓ 미확인 (${mailsByTab["미확인"].length})` },
                { key: "제외", label: `✗ 제외 (${mailsByTab["제외"].length})` },
              ].map(t => (
                <button key={t.key} className={`sub-tab${gmailTab === t.key ? " on" : ""}`} onClick={() => { setGmailTab(t.key); setSelectedMails([]); }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* 미확인 안내 */}
            {gmailTab === "미확인" && mailsByTab["미확인"].length > 0 && (
              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: "12px 16px", marginBottom: 12, fontSize: 13, color: "#92400e", lineHeight: 1.6 }}>
                📋 쿠팡 메일은 배송지가 스니펫에 안 나와요.<br />
                메일 앱에서 직접 열어보고 <strong>서울특별시 동작구</strong>면 <strong style={{ color: "#059669" }}>✓ 동작구</strong>, 아니면 <strong style={{ color: "#ef4444" }}>✗ 제외</strong> 눌러주세요.<br />
                <span style={{ fontSize: 11, opacity: .7 }}>한 번만 누르면 저장돼서 다음엔 안 봐도 돼요.</span>
              </div>
            )}

            {displayMails.length === 0
              ? <div className="empty">메일이 없어요</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 80 }}>
                  {displayMails.map(mail => {
                    const isImported = importedIds.includes(mail.id);
                    const isSelected = selectedMails.includes(mail.id);
                    const confirmed = getConfirmed(mail);

                    return (
                      <div key={mail.id} className="card"
                        style={{ border: `2px solid ${isSelected ? "#374151" : "transparent"}`, background: isSelected ? "#f3f4f6" : "#fff", opacity: isImported ? .5 : 1 }}
                        onClick={() => !isImported && toggleSelect(mail.id)}>

                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          {/* 체크 (상도점/제외 탭만) */}
                          {gmailTab !== "미확인" && !isImported && (
                            <div style={{ marginTop: 2, flexShrink: 0 }}>
                              <div style={{ width: 18, height: 18, border: `2px solid ${isSelected ? "#374151" : "#d1d5db"}`, borderRadius: "50%", background: isSelected ? "#374151" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {isSelected && <div style={{ width: 7, height: 7, background: "#fff", borderRadius: "50%" }} />}
                              </div>
                            </div>
                          )}

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 5 }}>
                              <span className="badge" style={{ background: mail.store.includes("G마켓") ? "#fff7ed" : mail.store.includes("KG") ? "#f5f3ff" : "#fff0f0", color: mail.store.includes("G마켓") ? "#ea580c" : mail.store.includes("KG") ? "#7c3aed" : "#ef4444", fontSize: 10 }}>
                                {mail.store}
                              </span>
                              {isImported && <span className="badge" style={{ background: "#f0fdf4", color: "#16a34a", fontSize: 10 }}>✓ 가져옴</span>}
                              <span style={{ fontSize: 11, color: "#bbb", marginLeft: "auto" }}>{mail.date}</span>
                              {mail.amount > 0 && <span style={{ fontWeight: 800, color: "#374151", fontSize: 14 }}>{fmt(mail.amount)}</span>}
                            </div>
                            <div style={{ fontSize: 13, color: "#333", marginBottom: gmailTab === "미확인" ? 10 : 0 }}>{mail.product}</div>

                            {/* 미확인 탭: ✓/✗ 버튼 */}
                            {gmailTab === "미확인" && (
                              <div style={{ display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
                                <button className="confirm-btn"
                                  style={{ background: "#f0fdf4", color: "#059669", border: "1.5px solid #86efac" }}
                                  onClick={() => { setConfirm(mail.id, "상도점"); showToast("동작구 ✓ 확인", "#059669"); }}>
                                  ✓ 동작구 (상도점)
                                </button>
                                <button className="confirm-btn"
                                  style={{ background: "#fff1f2", color: "#ef4444", border: "1.5px solid #fecdd3" }}
                                  onClick={() => { setConfirm(mail.id, "제외"); showToast("제외 처리", "#ef4444"); }}>
                                  ✗ 제외
                                </button>
                              </div>
                            )}

                            {/* 상도점 탭: 항상 품목명 입력칸 표시 */}
                            {gmailTab === "상도점" && !isImported && (
                              <div style={{ marginTop: 10, background: "#f8f9ff", borderRadius: 10, padding: 10, display: "grid", gridTemplateColumns: "1fr 60px 110px", gap: 8 }}
                                onClick={e => e.stopPropagation()}>
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: "#888", marginBottom: 3 }}>
                                    비품명 {!(importForm[mail.id]?.itemName ?? mail.product) && <span style={{ color: "#ef4444" }}>* 입력 필요</span>}
                                  </div>
                                  <input className="mini-inp"
                                    placeholder="G마켓 앱에서 확인 후 입력"
                                    style={{ borderColor: !(importForm[mail.id]?.itemName ?? mail.product) ? "#fca5a5" : "#e5e7eb" }}
                                    value={(importForm[mail.id] || {}).itemName ?? mail.product}
                                    onChange={e => setImportForm(p => ({ ...p, [mail.id]: { ...p[mail.id], itemName: e.target.value } }))} />
                                </div>
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: "#888", marginBottom: 3 }}>수량</div>
                                  <input className="mini-inp" type="number" min="1" value={(importForm[mail.id] || {}).qty ?? 1}
                                    onChange={e => setImportForm(p => ({ ...p, [mail.id]: { ...p[mail.id], qty: e.target.value } }))} />
                                </div>
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: "#888", marginBottom: 3 }}>카테고리</div>
                                  <select className="mini-inp" value={(importForm[mail.id] || {}).category ?? "소모품"}
                                    onChange={e => setImportForm(p => ({ ...p, [mail.id]: { ...p[mail.id], category: e.target.value } }))}>
                                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }

            {/* Floating 가져오기 버튼 */}
            {selectedMails.length > 0 && (
              <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 50 }}>
                <button className="btn-p" style={{ padding: "14px 28px", fontSize: 15, borderRadius: 50, boxShadow: "0 8px 24px #37415150" }} onClick={importSelected}>
                  구매이력에 추가 {selectedMails.length}건 →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ INVENTORY TAB ═══════════ */}
        {tab === "inventory" && (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <input placeholder="🔍 검색" value={search} onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, minWidth: 150, border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "9px 13px", fontSize: 14, outline: "none" }} />
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                style={{ border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "9px 12px", fontSize: 13, outline: "none", background: "#fff" }}>
                <option>전체</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <button className="btn-p" onClick={() => openModal("add")}>+ 추가</button>
            </div>
            {filtered.length === 0
              ? <div className="empty">📦<br />비품이 없어요</div>
              : filtered.map(item => {
                  const st = statusColor(item.stock, item.minStock);
                  return (
                    <div key={item.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</span>
                          <span className="badge" style={{ background: "#f3f4f6", color: "#666" }}>{item.category}</span>
                          <span className="badge" style={{ background: st.bg, color: st.text }}>{st.label}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>단가 {fmt(item.price)} · 최소 {item.minStock}{item.unit} · {item.lastUpdated}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ textAlign: "right", minWidth: 50 }}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: item.stock <= item.minStock ? "#ef4444" : "#1a1a2e" }}>{item.stock}</div>
                          <div style={{ fontSize: 10, color: "#aaa" }}>{item.unit}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <button className="btn-sm" style={{ background: "#f0fdf4", color: "#059669" }} onClick={() => openModal("purchase", item)}>입고</button>
                          <button className="btn-sm" style={{ background: "#fff7ed", color: "#ea580c" }} onClick={() => openModal("adjust", item)}>조정</button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <button className="btn-sm" style={{ background: "#eff6ff", color: "#3b82f6" }} onClick={() => openModal("edit", item)}>수정</button>
                          <button className="btn-sm" style={{ background: "#fff1f2", color: "#e11d48" }} onClick={() => { setItems(p => p.filter(i => i.id !== item.id)); showToast("삭제됨","#ef4444"); }}>삭제</button>
                        </div>
                      </div>
                    </div>
                  );
                })
            }
          </div>
        )}

        {/* ═══════════ HISTORY TAB ═══════════ */}
        {tab === "history" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>구매 이력</div>
              <div style={{ fontSize: 13, color: "#888" }}>총 {history.reduce((s, h) => s + h.totalCost, 0).toLocaleString()}원</div>
            </div>
            {history.length === 0
              ? <div className="empty">🛒<br />Gmail 탭에서 추가해보세요</div>
              : history.map(h => (
                  <div key={h.id} className="card" style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 38, height: 38, background: h.source === "gmail" ? "#eff6ff" : "#f5f3ff", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
                        {h.source === "gmail" ? "✉️" : "🛒"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.itemName}</div>
                        <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{h.date}{h.note ? ` · ${h.note}` : ""}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginRight: 6 }}>
                        <div style={{ fontWeight: 700, color: "#374151" }}>+{h.qty}개</div>
                        <div style={{ fontSize: 12, color: "#888" }}>{fmt(h.totalCost)}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                        <button className="btn-sm" style={{ background: "#eff6ff", color: "#3b82f6" }}
                          onClick={() => openModal("editHistory", h)}>수정</button>
                        <button className="btn-sm" style={{ background: "#fff1f2", color: "#e11d48" }}
                          onClick={() => { setHistory(p => p.filter(x => x.id !== h.id)); showToast("삭제됨", "#ef4444"); }}>삭제</button>
                      </div>
                    </div>
                  </div>
                ))
            }
          </div>
        )}

        {/* ═══════════ CYCLE TAB ═══════════ */}
        {tab === "cycle" && (() => {
          // 구매이력에서 품목별 마지막 구매일 + 평균 간격 계산
          const today = new Date("2026-04-26");
          const grouped = {};
          history.filter(h => h.itemName).forEach(h => {
            const key = h.itemName;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(new Date(h.date));
          });

          const cycleList = Object.entries(grouped).map(([name, dates]) => {
            const sorted = dates.sort((a, b) => b - a); // 최신순
            const last = sorted[0];
            const daysSince = Math.floor((today - last) / 86400000);
            let avgInterval = null;
            if (sorted.length >= 2) {
              const gaps = [];
              for (let i = 0; i < sorted.length - 1; i++) {
                gaps.push(Math.floor((sorted[i] - sorted[i+1]) / 86400000));
              }
              avgInterval = Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length);
            }
            const overdue = avgInterval ? daysSince > avgInterval : daysSince > 30;
            return { name, last, daysSince, avgInterval, count: sorted.length, overdue };
          }).sort((a, b) => b.daysSince - a.daysSince);

          if (cycleList.length === 0) return (
            <div className="empty">🛒<br />구매이력을 먼저 추가해보세요</div>
          );

          return (
            <div>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 14 }}>
                구매이력 기반 · 경과일 긴 순서
              </div>
              {cycleList.map(item => {
                const pct = item.avgInterval ? Math.min(100, Math.round(item.daysSince / item.avgInterval * 100)) : Math.min(100, Math.round(item.daysSince / 30 * 100));
                const barColor = item.overdue ? "#ef4444" : pct > 70 ? "#f59e0b" : "#374151";
                return (
                  <div key={item.name} className="card" style={{ marginBottom: 10, border: item.overdue ? "1.5px solid #fecdd3" : "1.5px solid transparent" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
                          마지막 구매 {item.last.toISOString().slice(0,10)} · 총 {item.count}회
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: barColor }}>{item.daysSince}일</div>
                        <div style={{ fontSize: 10, color: "#aaa" }}>경과</div>
                      </div>
                    </div>
                    {/* 진행 바 */}
                    <div style={{ background: "#f3f4f6", borderRadius: 6, height: 6, overflow: "hidden" }}>
                      <div style={{ width: pct + "%", height: "100%", background: barColor, borderRadius: 6, transition: "width .5s" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: "#aaa" }}>
                      <span>{item.overdue ? "⚠️ 주문할 때 됐어요!" : item.avgInterval ? `평균 ${item.avgInterval}일마다` : "기준일 없음 (30일 기준)"}</span>
                      {item.avgInterval && <span>{item.daysSince}/{item.avgInterval}일</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ═══════════ MODAL ═══════════ */}
      {modal && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            {(modal.type === "add" || modal.type === "edit") && (
              <>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 18 }}>{modal.type === "add" ? "비품 추가" : "비품 수정"}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  <div className="form-g"><label>비품명 *</label><input value={form.name || ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="예: A4 용지" /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="form-g"><label>카테고리</label><select value={form.category || "소모품"} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
                    <div className="form-g"><label>단위</label><input value={form.unit || ""} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} placeholder="개, 묶음…" /></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div className="form-g"><label>현재 재고</label><input type="number" min="0" value={form.stock ?? 0} onChange={e => setForm(p => ({ ...p, stock: e.target.value }))} /></div>
                    <div className="form-g"><label>최소 재고</label><input type="number" min="0" value={form.minStock ?? 0} onChange={e => setForm(p => ({ ...p, minStock: e.target.value }))} /></div>
                    <div className="form-g"><label>단가 (원)</label><input type="number" min="0" value={form.price ?? 0} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} /></div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
                  <button style={{ background: "#f3f4f6", color: "#666", padding: "10px 18px", borderRadius: 10, fontWeight: 600 }} onClick={closeModal}>취소</button>
                  <button className="btn-p" onClick={saveItem}>{modal.type === "add" ? "추가" : "저장"}</button>
                </div>
              </>
            )}
            {modal.type === "purchase" && (
              <>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>입고 처리</div>
                <div style={{ fontSize: 13, color: "#888", marginBottom: 18 }}>{form.itemName}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="form-g"><label>수량</label><input type="number" min="1" value={form.qty ?? 1} onChange={e => setForm(p => ({ ...p, qty: e.target.value }))} /></div>
                    <div className="form-g"><label>총 금액 (원)</label><input type="number" min="0" value={form.totalCost ?? 0} onChange={e => setForm(p => ({ ...p, totalCost: e.target.value }))} /></div>
                  </div>
                  <div className="form-g"><label>메모</label><input value={form.note || ""} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="예: 쿠팡, G마켓…" /></div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
                  <button style={{ background: "#f3f4f6", color: "#666", padding: "10px 18px", borderRadius: 10, fontWeight: 600 }} onClick={closeModal}>취소</button>
                  <button className="btn-p" style={{ background: "#059669" }} onClick={savePurchase}>입고 확인</button>
                </div>
              </>
            )}
            {modal.type === "editHistory" && (
              <>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 18 }}>구매이력 수정</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  <div className="form-g"><label>비품명</label><input value={form.itemName || ""} onChange={e => setForm(p => ({ ...p, itemName: e.target.value }))} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="form-g"><label>수량</label><input type="number" min="1" value={form.qty ?? 1} onChange={e => setForm(p => ({ ...p, qty: e.target.value }))} /></div>
                    <div className="form-g"><label>금액 (원)</label><input type="number" min="0" value={form.totalCost ?? 0} onChange={e => setForm(p => ({ ...p, totalCost: e.target.value }))} /></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="form-g"><label>날짜</label><input type="date" value={form.date || ""} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
                    <div className="form-g"><label>메모</label><input value={form.note || ""} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} /></div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
                  <button style={{ background: "#f3f4f6", color: "#666", padding: "10px 18px", borderRadius: 10, fontWeight: 600 }} onClick={closeModal}>취소</button>
                  <button className="btn-p" onClick={() => {
                    setHistory(p => p.map(x => x.id === form.id ? { ...form, qty: +form.qty, totalCost: +form.totalCost } : x));
                    showToast("수정 완료"); closeModal();
                  }}>저장</button>
                </div>
              </>
            )}
            {modal.type === "adjust" && (
              <>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>재고 조정</div>
                <div style={{ fontSize: 13, color: "#888", marginBottom: 18 }}>{form.itemName} · 현재 {form.stock}개</div>
                <div className="form-g"><label>조정 수량 (+ 입고 / - 사용·폐기)</label><input type="number" value={form.delta ?? 0} onChange={e => setForm(p => ({ ...p, delta: e.target.value }))} /></div>
                {form.delta !== 0 && form.delta !== "" && (
                  <div style={{ marginTop: 10, background: "#f8fafc", borderRadius: 10, padding: "10px 13px", fontSize: 13 }}>
                    조정 후: <strong>{Math.max(0, +form.stock + +form.delta)}개</strong>
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
                  <button style={{ background: "#f3f4f6", color: "#666", padding: "10px 18px", borderRadius: 10, fontWeight: 600 }} onClick={closeModal}>취소</button>
                  <button className="btn-p" style={{ background: "#ea580c" }} onClick={saveAdjust}>조정 완료</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toast.color, color: "#fff", padding: "11px 22px", borderRadius: 50, fontWeight: 700, fontSize: 14, boxShadow: "0 8px 24px #0003", zIndex: 200, whiteSpace: "nowrap" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
