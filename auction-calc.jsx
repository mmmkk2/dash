import { useState, useEffect, useRef } from "react";

    // ── 색상 ──
    const C = {
      bg:"#f7f4ef", surface:"#ffffff", surface2:"#f2ede6",
      border:"#e8e1d6", border2:"#ede8e0",
      text:"#1a1714", sub:"#8a7f72", muted:"#b8ad9e",
      accent:"#7c5c3a", accentBg:"#f0e9df",
      green:"#3d7a5a", greenBg:"#eaf4ee",
      red:"#b04040", redBg:"#fdf0f0",
    };
    const LOAN_COLORS = ["#6b5b3e","#4a6b7c","#5a6b4a","#7c4a6b","#4a5a7c","#7c6b4a"];
    const COMPARE_MONTHS = [1,2,3,4,5,6];
    const TAX_BRACKETS = [
      { label:"1,400만원 이하",  rate:0.06 },
      { label:"1,400~5,000만원", rate:0.15 },
      { label:"5,000~8,800만원", rate:0.24 },
      { label:"8,800만원~1.5억", rate:0.35 },
      { label:"1.5억~3억",      rate:0.38 },
      { label:"3억~5억",        rate:0.40 },
      { label:"5억~10억",       rate:0.42 },
      { label:"10억 초과",       rate:0.45 },
    ];

    // ── 천단위 콤마 입력 ──
    function parseNum(s) { return Number(String(s).replace(/[^0-9.-]/g,""))||0; }
    function fmtComma(n) { if(!n&&n!==0) return ""; return Math.round(Number(n)).toLocaleString("ko-KR"); }

    function NumInput({value, onChange, placeholder, style}) {
      const [focused, setFocused] = useState(false);
      const [raw, setRaw] = useState(String(value||""));

      useEffect(() => {
        if (!focused) setRaw(String(value||""));
      }, [value, focused]);

      return (
        <input
          inputMode="numeric"
          value={focused ? raw : (value ? fmtComma(value) : "")}
          placeholder={placeholder||"0"}
          onFocus={()=>{ setFocused(true); setRaw(value?String(value):""); }}
          onBlur={()=>{ setFocused(false); onChange(parseNum(raw)); }}
          onChange={e=>{ const v=e.target.value.replace(/[^0-9]/g,""); setRaw(v); onChange(parseNum(v)); }}
          style={style}
        />
      );
    }

    function RateInput({value, onChange, step, placeholder, style}) {
      return (
        <input
          inputMode="decimal"
          type="number"
          step={step||0.01}
          value={value}
          placeholder={placeholder||"0"}
          onChange={e=>onChange(parseFloat(e.target.value)||0)}
          style={style}
        />
      );
    }

    // ── 스타일 ──
    const inp = { border:"1px solid #e8e1d6", borderRadius:7, padding:"7px 10px", fontSize:14, width:"100%", background:"#ffffff", outline:"none", fontFamily:"inherit" };
    const card = { background:"#ffffff", borderRadius:14, border:"1px solid #e8e1d6", padding:"16px", marginBottom:10 };
    const lbl = { fontSize:9, color:"#b8ad9e", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:600, display:"block" };

    // ── 유틸 ──
    function uid() { return Math.random().toString(36).slice(2,8); }
    function fmt(n) {
      const abs = Math.abs(n), sign = n < 0 ? "-" : "";
      if (abs >= 100000000) {
        const uk = Math.floor(abs/100000000);
        const man = Math.round((abs%100000000)/10000);
        return sign + (man > 0 ? `${uk}억 ${man.toLocaleString()}만` : `${uk}억`);
      }
      return sign + Math.round(abs/10000).toLocaleString() + "만";
    }

    // ── 계산 ──
    function calcPrepay(tiers, amount, months) {
      if (!tiers || !tiers.length) return 0;
      for (const t of tiers) {
        if (t.untilMonth === null || months <= t.untilMonth) return amount * (t.rate/100);
      }
      return 0;
    }
    function calcLoan(loan, months) {
      const r = loan.rate/100/12;
      const interest = loan.amount * r * months;
      const prepay = calcPrepay(loan.prepayTiers, loan.amount, months);
      return { interest, prepay, total: interest+prepay };
    }
    function calcTaxAuto(gain, baseIncome=0) {
      if (gain <= 0) return { tax:0, effectiveRate:0 };
      const widths = [14000000,36000000,62000000,90000000,150000000,300000000,500000000,Infinity];
      const rates  = [0.06,0.15,0.24,0.35,0.38,0.40,0.42,0.45];
      function taxOn(income) {
        let t=0, prev=0;
        for (let i=0; i<widths.length; i++) {
          if (income <= prev) break;
          t += (Math.min(income, prev+widths[i]) - prev) * rates[i];
          prev += widths[i];
        }
        return t;
      }
      const tax = taxOn(baseIncome + gain) - taxOn(baseIncome);
      return { tax: tax*1.1, effectiveRate: (tax/gain)*100 };
    }
    function calcTaxBracket(gain, idx) {
      if (gain <= 0) return { tax:0, effectiveRate:0 };
      return { tax: gain * TAX_BRACKETS[idx].rate * 1.1, effectiveRate: TAX_BRACKETS[idx].rate*100 };
    }

    // ── 취득세 자동계산 ──
    const ACQ_TYPES = [
      { id:"주택1",    label:"주택 1주택" },
      { id:"주택중과", label:"주택 중과" },
      { id:"오피스텔", label:"오피스텔" },
      { id:"상가토지", label:"상가/토지" },
      { id:"직접입력", label:"직접입력" },
    ];
    function calcAcqTaxRate(propType, bidPrice) {
      if (propType === "주택1") {
        const base = bidPrice <= 600000000 ? 1
          : bidPrice <= 900000000 ? Math.round((bidPrice * 2 / 300000000 - 3) * 100) / 100
          : 3;
        return { rate: Math.round(base * 1.1 * 100) / 100, base };
      }
      if (propType === "주택중과") return { rate: 8.4, base: 8 };
      if (propType === "오피스텔") return { rate: 4.4, base: 4 };
      if (propType === "상가토지") return { rate: 4.4, base: 4 };
      return null;
    }
    function acqTaxDetail(propType, bidPrice) {
      if (propType === "주택1") {
        if (bidPrice <= 600000000) return "6억 이하 · 취득세 1% + 교육세 0.1%";
        if (bidPrice <= 900000000) {
          const base = Math.round((bidPrice * 2 / 300000000 - 3) * 100) / 100;
          return `6~9억 구간 · 취득세 ${base}% + 교육세 ${Math.round(base*0.1*100)/100}%`;
        }
        return "9억 초과 · 취득세 3% + 교육세 0.3%";
      }
      if (propType === "주택중과") return "8% 중과 + 지방교육세 0.4% (조정2주택 / 3주택+)";
      if (propType === "오피스텔") return "취득세 4% + 지방교육세 0.4%";
      if (propType === "상가토지") return "취득세 4% + 지방교육세 0.4%";
      return "";
    }

    // ── 기본 데이터 ──
    function newLoan(name) {
      return { id:uid(), name:name||"상품", amount:150000000, rate:4.5, prepayTiers:[{untilMonth:null,rate:0.5}] };
    }
    function newProperty(name) {
      return {
        id:uid(), name:name||"새 물건",
        loans:[newLoan("상품A")],
        profit:{
          bidPrice:200000000, propType:"주택1", acquisitionTax:1.1, legalFee:800000,
          interior:0, agentFeeRate:0.4, loanId:null,
          holdMonths:3, sellScenarios:[230000000,240000000],
          extraCosts:[], evictionCost:0, mgmtCost:0,
        },
      };
    }
    function defaultExamples() {
      const lid1 = uid(); const lid2 = uid(); const lid3 = uid(); const lid4 = uid();
      return [
        {
          id:uid(), name:"경기 부천 아파트 (예시)",
          loans:[
            { id:lid1, name:"상품A", amount:230000000, rate:4.3,
              prepayTiers:[{untilMonth:null,rate:0.46}] },
            { id:lid2, name:"상품B", amount:230000000, rate:3.8,
              prepayTiers:[{untilMonth:3,rate:1.5},{untilMonth:null,rate:0.5}] },
          ],
          profit:{
            bidPrice:318000000, propType:"주택1", acquisitionTax:1.1, legalFee:1150000,
            interior:8000000, agentFeeRate:0.44, loanId:lid1,
            holdMonths:5, sellScenarios:[360000000,370000000,380000000],
            extraCosts:[], evictionCost:0, mgmtCost:1500000,
          },
        },
        {
          id:uid(), name:"인천 상가 (예시)",
          loans:[
            { id:lid3, name:"상품A", amount:80000000, rate:5.2,
              prepayTiers:[{untilMonth:6,rate:2.0},{untilMonth:null,rate:0.5}] },
            { id:lid4, name:"상품B", amount:80000000, rate:4.7,
              prepayTiers:[{untilMonth:null,rate:1.0}] },
          ],
          profit:{
            bidPrice:145000000, propType:"상가토지", acquisitionTax:4.4, legalFee:900000,
            interior:5000000, agentFeeRate:0.9, loanId:lid3,
            holdMonths:6, sellScenarios:[165000000,170000000],
            extraCosts:[], evictionCost:2000000, mgmtCost:1800000,
          },
        },
      ];
    }

    // ── 저장/불러오기 ──
    function loadStorage() {
      try {
        const s = localStorage.getItem("auction-props");
        if (s) { const d = JSON.parse(s); if (d.properties?.length) return d; }
      } catch {}
      return null;
    }
    function saveStorage(properties, activeId) {
      try { localStorage.setItem("auction-props", JSON.stringify({properties, activeId})); } catch {}
    }
    function loadTax() {
      try { const s = localStorage.getItem("auction-tax"); if (s) return { taxMode:"auto", taxBracketIdx:2, open:false, salary:0, businessIncome:0, ...JSON.parse(s) }; } catch {}
      return { taxMode:"auto", taxBracketIdx:2, open:false, salary:0, businessIncome:0 };
    }
    function saveTax(t) {
      try { localStorage.setItem("auction-tax", JSON.stringify(t)); } catch {}
    }
    function loadSnapshots() {
      try { const s = localStorage.getItem("auction-snapshots"); if (s) return JSON.parse(s); } catch {}
      return [];
    }
    function saveSnapshots(snaps) {
      try { localStorage.setItem("auction-snapshots", JSON.stringify(snaps)); } catch {}
    }

    // ── 앱 ──
    export default function App() {
      const saved = loadStorage();
      const [props, setProps] = useState(saved ? saved.properties : defaultExamples());
      const [activeId, setActiveId] = useState(saved ? saved.activeId : null);
      const [tab, setTab] = useState("profit");
      const [editing, setEditing] = useState(null);
      const [editingScenario, setEditingScenario] = useState(null);
      const [editingPropName, setEditingPropName] = useState(null);
      const [saveStatus, setSaveStatus] = useState(null);
      const [tax, setTax] = useState(loadTax());
      const [savedSnaps, setSavedSnaps] = useState(loadSnapshots);
      const [editingSnapName, setEditingSnapName] = useState(null);
      const [snapSaved, setSnapSaved] = useState(false);
      const saveTimer = useRef(null);

      const activeProp = props.find(p => p.id === activeId) || props[0];
      const curId = activeId || props[0].id;
      const { loans, profit } = activeProp;
      const selLoanId = profit.loanId && loans.find(l => l.id === profit.loanId) ? profit.loanId : loans[0]?.id;

      function persist(newProps, newActiveId) {
        setSaveStatus("saving");
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          saveStorage(newProps, newActiveId);
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus(null), 1500);
        }, 500);
      }

      function updateTax(fn) {
        setTax(prev => { const next = fn(prev); saveTax(next); return next; });
      }

      function updateActive(fn) {
        setProps(prev => {
          const next = prev.map(p => p.id === activeProp.id ? fn(p) : p);
          persist(next, activeProp.id);
          return next;
        });
      }
      function updateLoans(fn) { updateActive(p => ({...p, loans:fn(p.loans)})); }
      function updateProfit(fn) { updateActive(p => ({...p, profit:fn(p.profit)})); }

      function addProperty() {
        const np = newProperty("새 물건 "+(props.length+1));
        const next = [...props, np];
        setProps(next); setActiveId(np.id); persist(next, np.id);
      }
      function deleteProperty(id) {
        if (props.length === 1) return;
        const next = props.filter(p => p.id !== id);
        const na = next[0].id; setProps(next); setActiveId(na); persist(next, na);
      }
      function renameProperty(id, name) {
        const next = props.map(p => p.id === id ? {...p, name} : p);
        setProps(next); persist(next, curId);
      }

      function addLoan() { updateLoans(ls => [...ls, newLoan(`상품 ${String.fromCharCode(65+ls.length)}`)]); }
      function deleteLoan(id) {
        updateActive(p => {
          const next = p.loans.filter(l => l.id !== id);
          return {...p, loans:next, profit:{...p.profit, loanId: p.profit.loanId===id ? (next[0]?.id||null) : p.profit.loanId}};
        });
      }
      function updateLoan(id, field, val) { updateLoans(ls => ls.map(l => l.id===id ? {...l,[field]:val} : l)); }
      function updateTier(lid, ti, field, val) { updateLoans(ls => ls.map(l => l.id!==lid ? l : {...l, prepayTiers:l.prepayTiers.map((t,i) => i===ti?{...t,[field]:val}:t)})); }
      function addTier(lid) { updateLoans(ls => ls.map(l => l.id!==lid ? l : {...l, prepayTiers:[...l.prepayTiers,{untilMonth:3,rate:0.5}]})); }
      function removeTier(lid, ti) { updateLoans(ls => ls.map(l => l.id!==lid ? l : {...l, prepayTiers:l.prepayTiers.filter((_,i)=>i!==ti)})); }
      function normalizeTiers(lid) {
        updateLoans(ls => ls.map(l => {
          if (l.id!==lid || !l.prepayTiers.length) return l;
          return {...l, prepayTiers:l.prepayTiers.map((t,i) => i===l.prepayTiers.length-1 ? {...t,untilMonth:null} : t)};
        }));
      }

      function calcTaxForGain(gain) {
        if (tax.taxMode==="bracket") return calcTaxBracket(gain, tax.taxBracketIdx);
        const baseIncome = (tax.salary||0) + (tax.businessIncome||0);
        return calcTaxAuto(gain, baseIncome);
      }

      function calcProfit(sellPrice) {
        const loan = loans.find(l => l.id===selLoanId) || loans[0];
        const lr = loan ? calcLoan(loan, profit.holdMonths) : {interest:0,prepay:0,total:0};
        const acqTaxPct = (profit.propType && profit.propType !== "직접입력")
          ? (calcAcqTaxRate(profit.propType, profit.bidPrice)?.rate ?? profit.acquisitionTax)
          : profit.acquisitionTax;
        const acqTax = profit.bidPrice * (acqTaxPct / 100);
        const agentFee = sellPrice * (profit.agentFeeRate/100);
        const grossGain = sellPrice - profit.bidPrice;
        const extraTotal = (profit.extraCosts||[]).reduce((s,c)=>s+(c.amount||0),0);
        const eviction = profit.evictionCost||0;
        const mgmt = profit.mgmtCost||0;
        const other = profit.otherCost||0;
        const expenses = acqTax + profit.legalFee + profit.interior + agentFee + lr.total + extraTotal + eviction + mgmt + other;
        // 예정신고: 취득세+법무비+중개비 공제, 15% 고정 (지방세 포함 16.5%)
        const prepayTaxBase = Math.max(grossGain - acqTax - profit.legalFee - agentFee, 0);
        const prepayTax = prepayTaxBase * 0.15 * 1.1;
        // 종소세: 전체 비용 공제 후 현재 세율
        const taxableGain = Math.max(grossGain - expenses, 0);
        const {tax:incomeTax, effectiveRate} = calcTaxForGain(taxableGain);
        const totalCost = expenses + incomeTax;
        const netProfit = grossGain - totalCost;
        return {grossGain, acqTax, legalFee:profit.legalFee, interior:profit.interior, agentFee, interest:lr.interest, prepay:lr.prepay, prepayTax, prepayTaxBase, incomeTax, effectiveRate, extraTotal, eviction, mgmt, other, expenses, totalCost, netProfit, taxableGain};
      }

      const baseIncome = (tax.salary||0) + (tax.businessIncome||0);
      const taxLabel = tax.taxMode==="bracket"
        ? `종소세 ${(TAX_BRACKETS[tax.taxBracketIdx].rate*100).toFixed(0)}%구간`
        : baseIncome > 0 ? "종소세 누진 (타소득 합산)" : "종소세 누진";

      // ── 스냅샷 저장/삭제/이름변경 ──
      function saveSnap() {
        const scenarios = [...profit.sellScenarios].sort((a,b)=>a-b).map(sell => ({sell, ...calcProfit(sell)}));
        const now = new Date();
        const name = `${activeProp.name} · ${now.toLocaleDateString("ko-KR",{month:"numeric",day:"numeric"})} ${now.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}`;
        const existing = savedSnaps.find(s => s.propName === activeProp.name);
        const snap = { id:existing?.id||uid(), name, savedAt:now.toISOString(), propName:activeProp.name, bidPrice:profit.bidPrice, holdMonths:profit.holdMonths, taxLabel, scenarios };
        const next = existing
          ? savedSnaps.map(s => s.propName === activeProp.name ? snap : s)
          : [snap, ...savedSnaps];
        setSavedSnaps(next); saveSnapshots(next);
        setSnapSaved(true); setTimeout(()=>setSnapSaved(false), 1500);
      }
      function deleteSnap(id) {
        const next = savedSnaps.filter(s => s.id !== id);
        setSavedSnaps(next); saveSnapshots(next);
      }
      function renameSnap(id, name) {
        const next = savedSnaps.map(s => s.id === id ? {...s, name} : s);
        setSavedSnaps(next); saveSnapshots(next);
      }

      return (
        <div style={{fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif", background:C.bg, minHeight:"100vh", color:C.text}}>
          <div style={{maxWidth:660, margin:"0 auto", padding:"20px 16px 40px"}}>

          {/* 헤더 */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
            <div>
              <div style={{fontSize:10,color:C.muted,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:3}}>매매사업자용</div>
              <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.03em"}}>매매사업자 계산기</div>
              <div style={{fontSize:10,color:C.muted,marginTop:3}}>종합소득세 기준 · 장기보유특별공제 미적용</div>
            </div>
            <div style={{flexShrink:0,marginTop:4}} />
          </div>

          {/* 물건 탭 */}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
              {props.map(p => (
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:2,flexShrink:0}}>
                  {editingPropName===p.id
                    ? <input autoFocus value={p.name}
                        onChange={e=>renameProperty(p.id,e.target.value)}
                        onBlur={()=>setEditingPropName(null)}
                        onKeyDown={e=>e.key==="Enter"&&setEditingPropName(null)}
                        style={{...inp,width:100,fontWeight:700,fontSize:13,padding:"5px 9px",borderRadius:9,background:C.text,color:"#fff",border:"none"}} />
                    : <button onClick={()=>{setActiveId(p.id);persist(props,p.id);}}
                        onDoubleClick={()=>setEditingPropName(p.id)}
                        style={{padding:"7px 13px",borderRadius:9,border:"1px solid",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,whiteSpace:"nowrap",
                          background:curId===p.id?C.text:C.surface,
                          color:curId===p.id?"#fff":C.muted,
                          borderColor:curId===p.id?C.text:C.border}}>
                        {p.name}
                      </button>
                  }
                  {props.length>1 && curId===p.id && (
                    <button onClick={()=>deleteProperty(p.id)} style={{border:"none",background:"none",color:C.muted,cursor:"pointer",fontSize:15,padding:"0 2px"}}>×</button>
                  )}
                </div>
              ))}
              <button onClick={addProperty} style={{padding:"7px 11px",borderRadius:9,border:`1px dashed ${C.border}`,background:"none",fontSize:12,cursor:"pointer",color:C.muted,fontFamily:"inherit",flexShrink:0}}>+ 추가</button>
              <button onClick={()=>{ if(window.confirm("예시 데이터로 초기화할까요?\n현재 데이터는 삭제됩니다.")) { const ex=defaultExamples(); setProps(ex); setActiveId(null); saveStorage(ex, null); }}} style={{padding:"7px 11px",borderRadius:9,border:`1px dashed ${C.border}`,background:"none",fontSize:12,cursor:"pointer",color:C.muted,fontFamily:"inherit",flexShrink:0}}>예시 보기</button>
              <button onClick={()=>{ if(window.confirm("물건을 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.")) { const np=newProperty("새 물건 1"); setProps([np]); setActiveId(np.id); saveStorage([np], np.id); }}} style={{padding:"7px 11px",borderRadius:9,border:`1px dashed ${C.border}`,background:"none",fontSize:12,cursor:"pointer",color:C.red,fontFamily:"inherit",flexShrink:0}}>모두 삭제</button>
              <div style={{display:"flex",alignItems:"center",marginLeft:4}}>
                {saveStatus==="saving" && <span style={{fontSize:10,color:C.muted}}>저장중</span>}
                {saveStatus==="saved"  && <span style={{fontSize:13,color:C.green}}>✓</span>}
              </div>
            </div>
            <div style={{fontSize:9,color:C.muted,marginTop:3}}>이름 변경: 길게 탭</div>
          </div>

          {/* 메인 탭 */}
          <div style={{display:"flex",gap:4,marginBottom:14,background:C.surface2,padding:3,borderRadius:12,border:`1px solid ${C.border}`}}>
            {[{id:"loan",label:"대출 비교"},{id:"profit",label:"순이익 계산"},{id:"saved",label:savedSnaps.length>0?`저장 (${savedSnaps.length})`:"저장 목록"}].map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                flex:1,padding:"9px 0",borderRadius:9,border:"none",cursor:"pointer",
                fontFamily:"inherit",fontSize:13,fontWeight:700,
                background:tab===t.id?C.surface:"transparent",
                color:tab===t.id?C.text:C.muted,
                boxShadow:tab===t.id?"0 1px 4px rgba(0,0,0,0.07)":"none",
              }}>{t.label}</button>
            ))}
          </div>

          {/* ── 대출 비교 ── */}
          {tab==="loan" && (
            <div>
              <div style={{display:"grid",gridTemplateColumns:loans.length===1?"1fr":"1fr 1fr",gap:8,marginBottom:10}}>
                {loans.map((loan,li)=>{
                  const isEdit=editing===loan.id;
                  const lColor=LOAN_COLORS[li%LOAN_COLORS.length];
                  return (
                    <div key={loan.id} style={{...card,marginBottom:0,borderTop:`3px solid ${lColor}`,padding:"14px 13px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                        {isEdit
                          ? <input value={loan.name} onChange={e=>updateLoan(loan.id,"name",e.target.value)} style={{...inp,width:90,fontWeight:700,fontSize:13,padding:"3px 7px"}} />
                          : <span style={{fontSize:14,fontWeight:700,color:lColor}}>{loan.name}</span>
                        }
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>{if(isEdit)normalizeTiers(loan.id);setEditing(isEdit?null:loan.id);}}
                            style={{border:"none",background:"none",color:isEdit?C.green:C.muted,cursor:"pointer",fontSize:14}}>
                            {isEdit?"✓":"✏"}
                          </button>
                          {loans.length>1 && <button onClick={()=>deleteLoan(loan.id)} style={{border:"none",background:"none",color:C.muted,cursor:"pointer",fontSize:16,padding:"0 2px"}}>×</button>}
                        </div>
                      </div>
                      <div style={{marginBottom:8}}>
                        <span style={lbl}>한도</span>
                        {isEdit
                          ? <NumInput value={loan.amount} onChange={v=>updateLoan(loan.id,"amount",v)} style={inp} />
                          : <div style={{fontSize:15,fontWeight:700}}>{fmt(loan.amount)}<span style={{fontSize:11,color:C.muted,marginLeft:2}}>원</span></div>
                        }
                      </div>
                      <div style={{marginBottom:12}}>
                        <span style={lbl}>금리</span>
                        {isEdit
                          ? <RateInput value={loan.rate} step={0.01} onChange={v=>updateLoan(loan.id,"rate",v)} style={inp} />
                          : <div style={{fontSize:17,fontWeight:800,color:lColor}}>{loan.rate.toFixed(2)}<span style={{fontSize:11,fontWeight:400,marginLeft:1}}>%</span></div>
                        }
                      </div>
                      <div style={{borderTop:`1px solid ${C.border2}`,paddingTop:10}}>
                        <span style={lbl}>중도상환수수료</span>
                        {!loan.prepayTiers.length && !isEdit && <div style={{fontSize:12,color:C.muted}}>없음</div>}
                        {loan.prepayTiers.map((tier,ti)=>{
                          const isLast=ti===loan.prepayTiers.length-1;
                          return (
                            <div key={ti} style={{display:"flex",alignItems:"center",gap:4,marginBottom:5}}>
                              {isEdit ? (<>
                                {isLast
                                  ? <span style={{fontSize:10,color:C.muted,width:42}}>이후</span>
                                  : <><input type="number" value={tier.untilMonth??""} onChange={e=>updateTier(loan.id,ti,"untilMonth",Number(e.target.value))} style={{...inp,width:36,padding:"3px 5px",fontSize:12}} />
                                     <span style={{fontSize:10,color:C.muted,flexShrink:0}}>개↓</span></>
                                }
                                <input type="number" step="0.01" value={tier.rate} onChange={e=>updateTier(loan.id,ti,"rate",parseFloat(e.target.value))} style={{...inp,width:44,padding:"3px 5px",fontSize:12}} />
                                <span style={{fontSize:10,color:C.muted}}>%</span>
                                <button onClick={()=>removeTier(loan.id,ti)} style={{border:"none",background:"none",color:C.red,cursor:"pointer",fontSize:13,padding:0}}>×</button>
                              </>) : (
                                <div style={{fontSize:11,color:C.sub}}>
                                  {isLast?<span>이후 <b style={{color:C.text}}>{tier.rate}%</b></span>:<span>{tier.untilMonth}개월↓ <b style={{color:C.text}}>{tier.rate}%</b></span>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {isEdit && <button onClick={()=>addTier(loan.id)} style={{border:`1px dashed ${C.border}`,background:"none",borderRadius:5,padding:"2px 8px",fontSize:10,cursor:"pointer",color:C.muted,fontFamily:"inherit",marginTop:2}}>+ 구간</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={addLoan} style={{width:"100%",padding:"11px 0",borderRadius:10,border:`1.5px dashed ${C.border}`,background:"none",fontSize:13,cursor:"pointer",color:C.sub,fontFamily:"inherit",marginBottom:10,fontWeight:600}}>+ 대출 상품 추가</button>

              {loans.length>=2 && (
                <div style={card}>
                  <div style={{fontSize:9,color:C.muted,marginBottom:12,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600}}>기간별 총비용 비교</div>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead>
                      <tr>
                        <th style={{textAlign:"left",color:C.muted,fontWeight:600,paddingBottom:8,fontSize:10,width:56}}>기간</th>
                        {loans.map((l,i)=><th key={l.id} style={{textAlign:"right",color:LOAN_COLORS[i%LOAN_COLORS.length],fontWeight:700,paddingBottom:8,fontSize:11}}>{l.name}</th>)}
                        {loans.length===2&&<th style={{textAlign:"right",color:C.muted,fontWeight:600,paddingBottom:8,fontSize:10}}>차이</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {COMPARE_MONTHS.map(m=>{
                        const results=loans.map(l=>calcLoan(l,m));
                        const totals=results.map(r=>r.total);
                        const wi=totals.indexOf(Math.min(...totals));
                        const diff=loans.length===2?totals[0]-totals[1]:null;
                        return (
                          <tr key={m} style={{borderTop:`1px solid ${C.border2}`}}>
                            <td style={{padding:"10px 0",fontWeight:700,fontSize:13,color:C.sub}}>{m}개월</td>
                            {results.map((res,ri)=>{
                              const isW=ri===wi;
                              return (
                                <td key={ri} style={{textAlign:"right",padding:"10px 0"}}>
                                  <div style={{fontWeight:isW?800:400,fontSize:isW?13:12,color:isW?C.text:C.muted}}>
                                    {fmt(res.total)}
                                    {isW&&<span style={{fontSize:9,background:C.green,color:"#fff",borderRadius:3,padding:"1px 4px",marginLeft:3}}>↓</span>}
                                  </div>
                                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>이자 {fmt(res.interest)}</div>
                                  {res.prepay>0&&<div style={{fontSize:10,color:C.muted}}>수수료 {fmt(res.prepay)}</div>}
                                </td>
                              );
                            })}
                            {diff!==null&&(
                              <td style={{textAlign:"right",padding:"10px 0"}}>
                                <span style={{fontSize:12,color:diff>0?C.green:diff<0?C.red:C.muted,fontWeight:700}}>{diff===0?"동일":fmt(Math.abs(diff))}</span>
                                {diff!==0&&<div style={{fontSize:10,color:C.muted}}>{diff>0?"B유리":"A유리"}</div>}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {loans.length===1&&(
                <div style={card}>
                  <div style={{fontSize:9,color:C.muted,marginBottom:12,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600}}>기간별 이자</div>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead>
                      <tr>
                        <th style={{textAlign:"left",color:C.muted,fontWeight:600,paddingBottom:8,fontSize:10}}>기간</th>
                        <th style={{textAlign:"right",color:LOAN_COLORS[0],fontWeight:700,paddingBottom:8,fontSize:11}}>이자</th>
                        <th style={{textAlign:"right",color:C.muted,fontWeight:600,paddingBottom:8,fontSize:10}}>수수료</th>
                        <th style={{textAlign:"right",color:C.text,fontWeight:700,paddingBottom:8,fontSize:11}}>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {COMPARE_MONTHS.map(m=>{
                        const res=calcLoan(loans[0],m);
                        return (
                          <tr key={m} style={{borderTop:`1px solid ${C.border2}`}}>
                            <td style={{padding:"10px 0",fontWeight:700,fontSize:13,color:C.sub}}>{m}개월</td>
                            <td style={{textAlign:"right",padding:"10px 0",fontSize:12,color:C.sub}}>{fmt(res.interest)}</td>
                            <td style={{textAlign:"right",padding:"10px 0",fontSize:12,color:C.sub}}>{res.prepay>0?fmt(res.prepay):"-"}</td>
                            <td style={{textAlign:"right",padding:"10px 0",fontSize:13,fontWeight:700}}>{fmt(res.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{textAlign:"center",fontSize:10,color:C.muted,marginBottom:20}}>단리 기준 추정치 · 심사 후 실제 조건 상이할 수 있음</div>
            </div>
          )}

          {/* ── 순이익 계산 ── */}
          {tab==="profit" && (
            <div>
              {/* 세무사 상담 안내 */}
              <div style={{background:"#fff8e8",border:"1.5px solid #e8c84a",borderRadius:10,padding:"11px 14px",marginBottom:12,display:"flex",alignItems:"flex-start",gap:9}}>
                <span style={{fontSize:17,lineHeight:1,flexShrink:0,marginTop:1}}>⚠️</span>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:"#7a5800",marginBottom:2}}>세율은 개인마다 다릅니다 — 반드시 세무사와 상담하세요</div>
                  <div style={{fontSize:11,color:"#9a7200",lineHeight:1.5}}>이 계산기는 간이 추정치입니다. 타소득 합산 여부, 공제 항목에 따라 실제 세금이 크게 달라질 수 있습니다.</div>
                </div>
              </div>
              {/* 기본 정보 */}
              <div style={card}>
                <div style={{fontSize:9,color:C.muted,marginBottom:14,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600}}>기본 정보</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {[
                    {l:"낙찰가",key:"bidPrice"},
                    {l:"법무사/등기",key:"legalFee"},
                    {l:"인테리어/수리",key:"interior"},
                    {l:"중개수수료 (%)",key:"agentFeeRate",step:0.01},
                    {l:"보유기간 (개월)",key:"holdMonths"},
                  ].map(({l,key,step})=>(
                    <div key={key}>
                      <span style={lbl}>{l}</span>
                      {step
                        ? <RateInput value={profit[key]} step={step} onChange={v=>updateProfit(p=>({...p,[key]:v}))} style={inp} />
                        : <NumInput value={profit[key]} onChange={v=>updateProfit(p=>({...p,[key]:v}))} style={inp} />
                      }
                    </div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border2}`}}>
                  <div>
                    <span style={lbl}>명도비(+열쇠)</span>
                    <NumInput value={profit.evictionCost} onChange={v=>updateProfit(p=>({...p,evictionCost:v}))} style={inp} />
                  </div>
                  <div>
                    <span style={lbl}>관리비 미납</span>
                    <NumInput value={profit.mgmtCost} onChange={v=>updateProfit(p=>({...p,mgmtCost:v}))} style={inp} />
                  </div>
                  <div>
                    <span style={lbl}>기타</span>
                    <NumInput value={profit.otherCost||0} onChange={v=>updateProfit(p=>({...p,otherCost:v}))} style={inp} />
                  </div>
                </div>
                {/* 취득세 */}
                <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border2}`}}>
                  <span style={lbl}>취득세</span>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:7}}>
                    {ACQ_TYPES.map(t=>{
                      const cur = profit.propType || "직접입력";
                      const sel = cur === t.id;
                      return (
                        <button key={t.id} onClick={()=>updateProfit(p=>({...p,propType:t.id}))}
                          style={{padding:"5px 10px",borderRadius:7,border:`1px solid ${sel?C.accent:C.border}`,
                            background:sel?C.accent:C.surface, color:sel?"#fff":C.sub,
                            fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                  {(profit.propType && profit.propType !== "직접입력") ? (() => {
                    const info = calcAcqTaxRate(profit.propType, profit.bidPrice);
                    return (
                      <div style={{background:C.surface2,borderRadius:8,padding:"9px 12px",border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:11,color:C.sub}}>{acqTaxDetail(profit.propType, profit.bidPrice)}</span>
                        <span style={{fontSize:15,fontWeight:800,color:C.accent,marginLeft:10,flexShrink:0}}>{info.rate}%</span>
                      </div>
                    );
                  })() : (
                    <RateInput value={profit.acquisitionTax} step={0.01} onChange={v=>updateProfit(p=>({...p,acquisitionTax:v}))} style={inp} />
                  )}
                </div>
                {loans.length>0&&(
                  <div style={{marginTop:10}}>
                    <span style={lbl}>연동 대출 상품</span>
                    <select value={selLoanId} onChange={e=>updateProfit(p=>({...p,loanId:e.target.value}))}
                      style={{...inp,background:C.surface}}>
                      {loans.map(l=><option key={l.id} value={l.id}>{l.name} ({l.rate}%)</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* 추가 비용 */}
              <div style={card}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600}}>추가 비용</div>
                  <button onClick={()=>updateProfit(p=>({...p,extraCosts:[...(p.extraCosts||[]),{id:uid(),label:"",amount:0}]}))}
                    style={{border:`1px dashed ${C.border}`,background:"none",borderRadius:7,padding:"4px 11px",fontSize:11,cursor:"pointer",color:C.muted,fontFamily:"inherit"}}>+ 추가</button>
                </div>
                {!(profit.extraCosts||[]).length&&<div style={{fontSize:12,color:C.muted}}>없음</div>}
                {(profit.extraCosts||[]).map((cost,i)=>(
                  <div key={cost.id||i} style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}>
                    <input placeholder="항목명" value={cost.label}
                      onChange={e=>updateProfit(p=>({...p,extraCosts:p.extraCosts.map((c,j)=>j===i?{...c,label:e.target.value}:c)}))}
                      style={{...inp,flex:1.2}} />
                    <NumInput value={cost.amount} placeholder="금액"
                      onChange={v=>updateProfit(p=>({...p,extraCosts:p.extraCosts.map((c,j)=>j===i?{...c,amount:v}:c)}))}
                      style={{...inp,flex:1}} />
                    <button onClick={()=>updateProfit(p=>({...p,extraCosts:p.extraCosts.filter((_,j)=>j!==i)}))}
                      style={{border:"none",background:"none",color:C.muted,cursor:"pointer",fontSize:15,padding:"0 2px",flexShrink:0}}>×</button>
                  </div>
                ))}
              </div>

              {/* 매도 시나리오 */}
              <div style={card}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600}}>매도가 시나리오</div>
                  <button onClick={()=>updateProfit(p=>({...p,sellScenarios:[...p.sellScenarios,p.bidPrice+10000000]}))}
                    style={{border:`1px dashed ${C.border}`,background:"none",borderRadius:7,padding:"4px 11px",fontSize:11,cursor:"pointer",color:C.muted,fontFamily:"inherit"}}>+ 추가</button>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {profit.sellScenarios.map((price,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:4,background:C.surface2,borderRadius:9,padding:"6px 11px",border:`1px solid ${C.border}`}}>
                      {editingScenario===i
                        ? <NumInput value={price}
                            onChange={v=>updateProfit(p=>({...p,sellScenarios:p.sellScenarios.map((sv,j)=>j===i?v:sv)}))}
                            style={{border:"none",background:"transparent",fontSize:13,width:100,outline:"none",fontFamily:"inherit",color:C.text}} />
                        : <span style={{fontSize:13,cursor:"pointer",fontWeight:700}} onClick={()=>setEditingScenario(i)}>{fmtComma(price)}원</span>
                      }
                      <button onClick={()=>updateProfit(p=>({...p,sellScenarios:p.sellScenarios.filter((_,j)=>j!==i)}))}
                        style={{border:"none",background:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0}}>×</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 종합소득세 설정 */}
              <div style={{...card,border:`1.5px solid ${C.accent}30`,background:C.accentBg}}>
                <button onClick={()=>updateTax(t=>({...t,open:!t.open}))}
                  style={{width:"100%",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left",padding:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:C.accent}}>📌 종합소득세 설정 <span style={{fontSize:10,fontWeight:400,color:C.sub}}>(전체 물건 공통)</span></div>
                      <div style={{fontSize:10,color:C.sub,marginTop:2}}>
                        {tax.open ? "매매사업자 기준 · 필요경비 차감 후 과세"
                          : tax.taxMode==="bracket"
                            ? `구간 선택: ${(TAX_BRACKETS[tax.taxBracketIdx].rate*100).toFixed(0)}% → 지방세 포함 ${(TAX_BRACKETS[tax.taxBracketIdx].rate*110).toFixed(1)}%`
                            : ((tax.salary||0)+(tax.businessIncome||0))>0
                              ? `누진 자동계산 · 타소득 ${fmt((tax.salary||0)+(tax.businessIncome||0))}원 합산`
                              : "누진 자동계산"}
                      </div>
                    </div>
                  </div>
                </button>
                {tax.open&&(
                  <div style={{marginTop:14}}>
                    {/* 타소득 입력 */}
                    <div style={{marginBottom:14,padding:"12px",background:`${C.accent}08`,borderRadius:10,border:`1px solid ${C.accent}20`}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.accent,marginBottom:10}}>타소득 합산 (종소세 누진 계산에 반영)</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div>
                          <span style={lbl}>근로소득 연봉</span>
                          <NumInput value={tax.salary||0} onChange={v=>updateTax(t=>({...t,salary:v}))} style={inp} />
                        </div>
                        <div>
                          <span style={lbl}>사업소득</span>
                          <NumInput value={tax.businessIncome||0} onChange={v=>updateTax(t=>({...t,businessIncome:v}))} style={inp} />
                        </div>
                      </div>
                      {((tax.salary||0)+(tax.businessIncome||0))>0 && (
                        <div style={{fontSize:10,color:C.sub,marginTop:8}}>
                          합산 타소득 {fmt((tax.salary||0)+(tax.businessIncome||0))}원 → 부동산 이익은 이 금액 위 구간부터 과세
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:6,marginBottom:14}}>
                      {[{id:"auto",label:"누진 자동계산",desc:"타소득 합산 누진세"},{id:"bracket",label:"구간 직접 선택",desc:"구간 수동 지정"}].map(m=>(
                        <button key={m.id} onClick={()=>updateTax(t=>({...t,taxMode:m.id}))}
                          style={{flex:1,padding:"9px 8px",borderRadius:10,border:"1.5px solid",cursor:"pointer",fontFamily:"inherit",textAlign:"left",
                            background:tax.taxMode===m.id?C.surface:"transparent",
                            borderColor:tax.taxMode===m.id?C.accent:`${C.accent}30`}}>
                          <div style={{fontSize:12,fontWeight:700,color:tax.taxMode===m.id?C.accent:C.sub,marginBottom:2}}>{m.label}</div>
                          <div style={{fontSize:10,color:C.muted,lineHeight:1.4}}>{m.desc}</div>
                        </button>
                      ))}
                    </div>
                    {tax.taxMode==="bracket"&&(
                      <div style={{display:"flex",flexDirection:"column",gap:5}}>
                        {TAX_BRACKETS.map((b,i)=>(
                          <button key={i} onClick={()=>updateTax(t=>({...t,taxBracketIdx:i}))}
                            style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                              padding:"10px 12px",borderRadius:9,border:"1.5px solid",cursor:"pointer",fontFamily:"inherit",
                              background:tax.taxBracketIdx===i?C.accent:C.surface,
                              borderColor:tax.taxBracketIdx===i?C.accent:C.border}}>
                            <span style={{fontSize:12,fontWeight:tax.taxBracketIdx===i?700:400,color:tax.taxBracketIdx===i?"#fff":C.text}}>{b.label}</span>
                            <span style={{fontSize:13,fontWeight:800,color:tax.taxBracketIdx===i?"#fff":C.accent}}>
                              {(b.rate*100).toFixed(0)}%
                              <span style={{fontSize:10,fontWeight:400,marginLeft:3,opacity:0.8}}>→ {(b.rate*110).toFixed(1)}%</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {tax.taxMode==="auto"&&(
                      <div style={{fontSize:10,color:C.sub,padding:"8px 10px",background:`${C.accent}10`,borderRadius:7}}>
                        💡 타소득을 입력하면 해당 금액 이후 구간부터 누진세 적용. 미입력 시 이 매물 이익만으로 계산.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 결과 */}
              <div style={card}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600}}>시나리오별 순이익</div>
                  <button onClick={saveSnap} style={{border:`1px solid ${snapSaved?C.green:C.border}`,background:snapSaved?C.greenBg:C.surface2,borderRadius:7,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",color:snapSaved?C.green:C.accent,fontFamily:"inherit",transition:"all 0.2s"}}>
                    {snapSaved ? "✓ 저장됨" : "📎 저장"}
                  </button>
                </div>
                {[...profit.sellScenarios].sort((a,b)=>a-b).map((sell,i)=>{
                  const r=calcProfit(sell);
                  const isPos=r.netProfit>=0;
                  const tLabel=tax.taxMode==="bracket"
                    ?`종소세 ${(TAX_BRACKETS[tax.taxBracketIdx].rate*100).toFixed(0)}%구간`
                    :`종소세 (유효 ${r.effectiveRate.toFixed(1)}%)`;
                  return (
                    <div key={i} style={{borderTop:i===0?"none":`1px solid ${C.border2}`,padding:i===0?"0 0 18px":"18px 0"}}>
                      <div style={{background:C.surface2,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.border}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                          <span style={{fontSize:10,color:C.muted,fontWeight:600}}>매도가</span>
                          <span style={{fontSize:15,fontWeight:800}}>{fmt(sell)}원</span>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:7,borderTop:`1px solid ${C.border2}`}}>
                          <span style={{fontSize:10,color:C.muted,fontWeight:600}}>매매차익</span>
                          <span style={{fontSize:17,fontWeight:800,color:r.grossGain>=0?C.text:C.red}}>{r.grossGain>=0?"+":""}{fmt(r.grossGain)}원</span>
                        </div>
                      </div>
                      <div style={{background:C.surface2,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.border}`}}>
                        <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600,marginBottom:10}}>비용 내역</div>
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          {[
                            r.acqTax>0&&{l:"취득세",v:r.acqTax},
                            {l:"법무사/등기",v:r.legalFee},
                            r.interior>0&&{l:"인테리어",v:r.interior},
                            r.eviction>0&&{l:"명도비(+열쇠)",v:r.eviction},
                            r.mgmt>0&&{l:"관리비 미납",v:r.mgmt},
                            r.other>0&&{l:"기타",v:r.other},
                            {l:"중개수수료",v:r.agentFee},
                            {l:`대출이자 ${profit.holdMonths}개월`,v:r.interest},
                            r.prepay>0&&{l:"중도상환수수료",v:r.prepay},
                            ...(profit.extraCosts||[]).filter(c=>c.amount).map(c=>({l:c.label||"기타",v:c.amount})),
                          ].filter(Boolean).map(({l,v})=>(
                            <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <span style={{fontSize:11,color:C.sub}}>{l}</span>
                              <span style={{fontSize:12,fontWeight:500,color:C.text}}>{fmt(v)}</span>
                            </div>
                          ))}
                          <div style={{borderTop:`1px solid ${C.border2}`,paddingTop:7,marginTop:2,display:"flex",justifyContent:"space-between"}}>
                            <span style={{fontSize:11,color:C.sub,fontWeight:700}}>세전 비용 합계</span>
                            <span style={{fontSize:13,fontWeight:700,color:C.text}}>{fmt(r.expenses)}</span>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontSize:11,color:C.sub,fontWeight:700}}>세전 순이익</span>
                            <span style={{fontSize:14,fontWeight:800,color:(r.grossGain-r.expenses)>=0?C.green:C.red}}>
                              {(r.grossGain-r.expenses)>=0?"+":""}{fmt(r.grossGain-r.expenses)}원
                            </span>
                          </div>
                        </div>
                      </div>
                      <div style={{background:C.accentBg,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.accent}20`}}>
                        <div style={{fontSize:9,color:C.accent,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600,marginBottom:10}}>세금</div>
                        {/* 예정신고 */}
                        <div style={{marginBottom:8,paddingBottom:8,borderBottom:`1px dashed ${C.accent}20`}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                            <span style={{fontSize:11,color:C.sub,fontWeight:600}}>예정신고 (15%구간+지방세)</span>
                            <span style={{fontSize:12,fontWeight:700,color:C.text}}>{fmt(r.prepayTax)}</span>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontSize:10,color:C.muted}}>과세표준 (취득세+법무비+중개비 공제)</span>
                            <span style={{fontSize:10,color:C.muted}}>{fmt(r.prepayTaxBase)}원</span>
                          </div>
                        </div>
                        {/* 종소세 */}
                        <div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                            <span style={{fontSize:11,color:C.accent,fontWeight:600}}>{tLabel}+지방세</span>
                            <span style={{fontSize:12,fontWeight:700,color:C.accent}}>{fmt(r.incomeTax)}</span>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontSize:10,color:C.muted}}>과세표준 (전체비용 공제)</span>
                            <span style={{fontSize:10,color:C.muted}}>{fmt(r.taxableGain)}원</span>
                          </div>
                        </div>
                      </div>
                      <div style={{background:isPos?C.greenBg:C.redBg,borderRadius:10,padding:"12px 14px",border:`1px solid ${isPos?"#c2e0ce":"#f0c8c8"}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                          <span style={{fontSize:11,color:isPos?C.green:C.red,fontWeight:600}}>총 비용 (세금 포함)</span>
                          <span style={{fontSize:13,fontWeight:700,color:isPos?C.green:C.red}}>{fmt(r.totalCost)}</span>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:7,borderTop:`1px solid ${isPos?"#c2e0ce":"#f0c8c8"}`}}>
                          <span style={{fontSize:12,color:isPos?C.green:C.red,fontWeight:700}}>세후 순이익</span>
                          <span style={{fontSize:24,fontWeight:900,letterSpacing:"-0.04em",color:isPos?C.green:C.red}}>{isPos?"+":""}{fmt(r.netProfit)}원</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}


          {/* ── 저장 목록 ── */}
          {tab==="saved" && (
            <div>
              {savedSnaps.length===0
                ? <div style={{textAlign:"center",padding:"60px 0",color:C.muted,fontSize:13}}>
                    저장된 결과가 없어요<br/>
                    <span style={{fontSize:11,marginTop:6,display:"block"}}>순이익 계산 탭에서 📎 저장을 눌러보세요</span>
                  </div>
                : savedSnaps.map(snap=>(
                  <div key={snap.id} style={{...card,marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                      <div style={{flex:1,minWidth:0,marginRight:8}}>
                        {editingSnapName===snap.id
                          ? <input autoFocus value={snap.name}
                              onChange={e=>renameSnap(snap.id,e.target.value)}
                              onBlur={()=>setEditingSnapName(null)}
                              onKeyDown={e=>e.key==="Enter"&&setEditingSnapName(null)}
                              style={{...inp,fontSize:13,fontWeight:700,padding:"4px 8px"}} />
                          : <div style={{fontSize:13,fontWeight:700,color:C.text,wordBreak:"break-all",cursor:"pointer"}}
                              onDoubleClick={()=>setEditingSnapName(snap.id)}>
                              {snap.name}
                            </div>
                        }
                        <div style={{fontSize:10,color:C.muted,marginTop:3}}>
                          {snap.propName} · 낙찰가 {fmt(snap.bidPrice)} · {snap.holdMonths}개월 · {snap.taxLabel}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,flexShrink:0}}>
                        <button onClick={()=>setEditingSnapName(snap.id)} style={{border:"none",background:"none",color:C.muted,cursor:"pointer",fontSize:13}}>✏</button>
                        <button onClick={()=>deleteSnap(snap.id)} style={{border:"none",background:"none",color:C.muted,cursor:"pointer",fontSize:15}}>×</button>
                      </div>
                    </div>
                    {snap.scenarios.map((r,i)=>{
                      const isPos=r.netProfit>=0;
                      return (
                        <div key={i} style={{borderTop:`1px solid ${C.border2}`,paddingTop:10,marginTop:i>0?10:0}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                            <span style={{fontSize:11,color:C.sub}}>매도가 {fmt(r.sell)}</span>
                            <span style={{fontSize:11,color:C.muted}}>매매차익 {r.grossGain>=0?"+":""}{fmt(r.grossGain)}</span>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontSize:11,color:C.sub}}>총비용 {fmt(r.totalCost)}</span>
                            <span style={{fontSize:18,fontWeight:900,letterSpacing:"-0.03em",color:isPos?C.green:C.red}}>
                              {isPos?"+":""}{fmt(r.netProfit)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    <div style={{fontSize:9,color:C.muted,marginTop:8,textAlign:"right"}}>
                      {new Date(snap.savedAt).toLocaleString("ko-KR",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})} 저장
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          <div style={{textAlign:"center",padding:"8px 0 4px",fontSize:"10px",color:C.muted,fontFamily:"'Inter',sans-serif",opacity:0.5}}>
            built {__BUILD_TIME__}
          </div>

          </div>

        </div>
      );
    }
