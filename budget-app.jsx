import { useState, useMemo, useEffect, useCallback } from "react";
import { PlusCircle, ChevronLeft, ChevronRight, Trash2, ChevronRight as ChevronR, CreditCard, Pencil, Check, Plus, RefreshCw, Wifi, WifiOff, Package, ShoppingCart, AlertTriangle, Clock, Mail, AlertCircle, X } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

/* ── Supabase 설정 ─────────────────────────────────────────────────────────────
   Supabase 프로젝트 생성 후 아래 두 값을 교체하세요.
   Settings → API → Project URL / anon public key
────────────────────────────────────────────────────────────────────────────── */
const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON   = import.meta.env.VITE_SUPABASE_ANON_KEY;

const sb = async (path, opts={}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_ANON,
      "Authorization": `Bearer ${SUPABASE_ANON}`,
      "Content-Type": "application/json",
      "Prefer": opts.prefer || "return=representation",
    },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

// DB row ↔ JS object 변환
const rowToTx = r => ({
  id: r.id, entity: r.entity, cat1: r.cat1, cat2: r.cat2, cat3: r.cat3||"",
  amount: r.amount, memo: r.memo, date: r.date, cardId: r.card_id||"",
  isFixed: r.is_fixed||false, fixedDay: r.fixed_day||null, type: r.type,
});
const txToRow = t => ({
  id: t.id, entity: t.entity, cat1: t.cat1, cat2: t.cat2, cat3: t.cat3||"",
  amount: t.amount, memo: t.memo, date: t.date, card_id: t.cardId||"",
  is_fixed: t.isFixed||false, fixed_day: t.fixedDay||null, type: t.type,
});
const rowToCard = r => ({ id: r.id, name: r.name, color: r.color });
const cardToRow = c => ({ id: c.id, name: c.name, color: c.color, sort_order: c.sortOrder||0 });

/* ── Fonts & Styles ── */
const FONT_LINK = document.createElement("link");
FONT_LINK.rel = "stylesheet";
FONT_LINK.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap";
document.head.appendChild(FONT_LINK);

const STYLE = document.createElement("style");
STYLE.textContent = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #f5f0e8; }
  input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
  input[type=date]::-webkit-calendar-picker-indicator { opacity: 0.4; cursor: pointer; }
  .tx-row:hover { background: #faf7f2 !important; }
  .cat-btn { transition: all 0.18s ease; }
  .cat-btn:hover { transform: translateY(-1px); }
  .tree-l1:hover { background: rgba(0,0,0,0.02) !important; }
  .tree-l2:hover { background: #faf7f2 !important; }
  .add-btn:hover { filter: brightness(1.08); transform: translateY(-1px); }
  @keyframes slideUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  .animate-up { animation: slideUp 0.28s ease forwards; }
  @keyframes fadeIn { from{opacity:0}to{opacity:1} }
  .fade-in { animation: fadeIn 0.2s ease forwards; }
  @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
  .spin { animation: spin 1s linear infinite; }
`;
document.head.appendChild(STYLE);

const THEMES = {
  cream: {
    label:"크림", emoji:"🤍",
    cream:"#f5f0e8", paper:"#faf8f4", white:"#ffffff",
    ink:"#1a1410", inkMid:"#4a3f35", inkLight:"#9c8e82",
    border:"#e8e0d4", borderDark:"#d4c8b8",
    header:"linear-gradient(160deg,#3d2b20 0%,#5a3d2e 50%,#6e4e3a 100%)",
    headerSolid:"#3d2b20",
  },
  dark: {
    label:"다크", emoji:"🖤",
    cream:"#1a1a1a", paper:"#242424", white:"#2e2e2e",
    ink:"#f0ede8", inkMid:"#c8c0b8", inkLight:"#7a7068",
    border:"#3a3530", borderDark:"#4a4540",
    header:"linear-gradient(160deg,#2a2a2a 0%,#333333 50%,#3a3a3a 100%)",
    headerSolid:"#2a2a2a",
  },
  navy: {
    label:"네이비", emoji:"💙",
    cream:"#eef1f8", paper:"#f4f6fc", white:"#ffffff",
    ink:"#0f1f3d", inkMid:"#2d4070", inkLight:"#7a90b8",
    border:"#d0d8ec", borderDark:"#b8c4e0",
    header:"linear-gradient(160deg,#1a3258 0%,#234080 50%,#2a4e96 100%)",
    headerSolid:"#1a3258",
  },
  forest: {
    label:"포레스트", emoji:"🌲",
    cream:"#edf2ec", paper:"#f4f8f3", white:"#ffffff",
    ink:"#1a3020", inkMid:"#2d5038", inkLight:"#6a9070",
    border:"#ccdec8", borderDark:"#b0ccaa",
    header:"linear-gradient(160deg,#1e4428 0%,#285c34 50%,#306840 100%)",
    headerSolid:"#1e4428",
  },
  rose: {
    label:"로즈", emoji:"🌸",
    cream:"#fdf0f0", paper:"#fef6f6", white:"#ffffff",
    ink:"#3d1020", inkMid:"#6b2840", inkLight:"#b08090",
    border:"#f0d0d8", borderDark:"#e0b8c4",
    header:"linear-gradient(160deg,#7a1830 0%,#962040 50%,#a82848 100%)",
    headerSolid:"#7a1830",
  },
};

const THEME_KEY = "gagibu_theme";
let _theme = THEMES[localStorage.getItem(THEME_KEY)||"cream"] || THEMES.cream;
// C는 전역으로 노출 — 컴포넌트 렌더 시점에 최신값 참조
let C = _theme;

const ENTITIES = {
  personal:{ label:"개인",       sub:"Personal",        color:"#6b5c4e", accent:"#9c8272" },
  cafe:    { label:"앤딩스터디카페", sub:"Ending Study Café", color:"#2d6a4f", accent:"#52b788" },
  realty:  { label:"부동산매매",   sub:"Real Estate",      color:"#1d4e89", accent:"#4a90d9" },
};
const ENTITY_KEYS = Object.keys(ENTITIES);

const TREE_PERSONAL = {
  수입:{ color:"#2d6a4f",accent:"#52b788",icon:"💚",children:{
    급여:[],기타:[],"대출이자-무이자":[],보험금:[],부업:[],연말정산:[],외화매도:[],임대료:[],"중고거래/당근":[],카드캐시백:[],컨커:[],"호텔 배당금":[],환급:[],
  }},
  "저축/투자고정":{ color:"#1d4e89",accent:"#4a90d9",icon:"💙",children:{개인형irp:[],연금저축펀드:[],적금:[],주택청약:[]}},
  "저축/투자유동":{ color:"#0077b6",accent:"#48cae4",icon:"🩵",children:{ESPP:[],주식투자:[],"청약수수료(카드)":[]}},
  "지출-고정비":{ color:"#b5451b",accent:"#e07a5f",icon:"🔶",children:{
    기타:[],
    생활:["관리비","보험-나","보험-엄마","월세/전세이자","인터넷사용료","자동차보험","자동차할부","통신비"],
    원금상환:["대출원금-보험대출","대출원금-신용","대출원금-전세","대출원금-주택","대출원금-호텔"],
    이자:["기타","대출이자-신용","대출이자-주택","대출이자-호텔","대출이자-회사대출","보험약관대출","부대비용-호텔"],
  }},
  "지출-세금":{ color:"#7b2d00",accent:"#c1440e",icon:"🔴",children:{국세:[],등록세:[],부가가치세:[],주민세:[]}},
  "지출-용돈":{ color:"#4a1942",accent:"#9b5de5",icon:"💜",children:{
    쇼핑:["가전/전자기기","기타","생필품","생활용품","속옷","식재료","악세사리","액세서리","영양제","운동복/장비","운동화","의류","전자기기"],
    식비:["간식","과일","기타","다이어트식품","배달","배달/포장","빵/샐러드","술","식비","식재료","외식","원두","차","카페/커피","편의점"],
    "취미여가/교육":["강의","공연","교육","기타","뜨개질","마사지","수강료","영상","영어","영화","운동","운동복/장비","전시","전시회","책","체험"],
    미용:[],건강:["기타","마스크","마사지","병원비","보험금","약"],
    교통비:["공항버스","과태료","기타","대중교통","범칙금","세차","세차용품","소모품","시외","주유비","주유비할인","주차비","차량용품","택시","하이패스"],
    가족:["기타","배달/포장","엄마","엄마쇼핑","엄마용돈","엄마장보기","조카"],
    선물:[],정기결제:["chat gpt","ssg","기타","네이버","넷플릭스","롯데","모부","복닥방이선생","소수의견","애플","요기요","유튜브","컬리멤버스","쿠팡","토스프라임"],
    기타:[],경조사:[],통운:[],휴대폰장기할부:[],토스체크:[],세금:["주민세"],"중고거래/당근":[],외식:["밥보야"],
  }},
  "지출-이벤트":{ color:"#831843",accent:"#ec4899",icon:"💗",children:{이사:[],여행:[],미용:[],가족:["새벗돈","엄마","용돈","조카"]}},
};
const TREE_CAFE = {
  매출:{ color:"#2d6a4f",accent:"#52b788",icon:"💰",children:{이용권수입:[],기타수입:[],무인키오스크:[],네이버예약:[]}},
  "매입/원가":{ color:"#b5451b",accent:"#e07a5f",icon:"📦",children:{
    소모품:["음료재료","청소용품","사무용품","기타"],비품:["가구","전자기기","기타"],수수료:["결제수수료","플랫폼수수료","기타"],
  }},
  운영비:{ color:"#4a1942",accent:"#9b5de5",icon:"🏪",children:{임차료:[],관리비:[],인터넷:[],전기세:[],수도세:[],보험:[],마케팅:["SNS광고","전단지","기타"],기타:[]}},
  세금:{ color:"#7b2d00",accent:"#c1440e",icon:"🔴",children:{부가가치세:[],소득세:[],기타:[]}},
};
const TREE_REALTY = {
  수입:{ color:"#2d6a4f",accent:"#52b788",icon:"💰",children:{매매수익:[],임대수입:[],기타:[]}},
  취득비용:{ color:"#b5451b",accent:"#e07a5f",icon:"🏠",children:{취득세:[],등기비:[],중개수수료:[],기타:[]}},
  보유비용:{ color:"#0077b6",accent:"#48cae4",icon:"📋",children:{대출이자:["주택담보대출","신용대출","기타"],관리비:[],수리비:[],재산세:[],종합부동산세:[],기타:[]}},
  처분비용:{ color:"#4a1942",accent:"#9b5de5",icon:"📝",children:{양도세:[],중개수수료:[],명도비:[],기타:[]}},
  세금:{ color:"#7b2d00",accent:"#c1440e",icon:"🔴",children:{부가가치세:[],종합소득세:[],기타:[]}},
};
const TREES = { personal:TREE_PERSONAL, cafe:TREE_CAFE, realty:TREE_REALTY };

const DEFAULT_CARDS = [
  {id:"c1",name:"삼성 iD 달달하린",color:"#1a1410"},
  {id:"c2",name:"신한 Marriott Bonvoy",color:"#1d4e89"},
  {id:"c3",name:"현대 아메리칸익스프레스 Gold",color:"#b5451b"},
  {id:"c4",name:"카카오뱅크 BUSINESS 현대",color:"#b8860b"},
  {id:"c5",name:"KT NU Plus 우리",color:"#2d6a4f"},
  {id:"c6",name:"네이버 현대",color:"#4a1942"},
  {id:"c7",name:"쿠팡 Wow",color:"#7b2d00"},
  {id:"c8",name:"현금",color:"#4a3f35"},
];

const CARD_COLORS = ["#1a1410","#1d4e89","#2d6a4f","#b5451b","#7b2d00","#4a1942","#0077b6","#831843","#b8860b","#4a3f35"];

const fmt  = n => n.toLocaleString("ko-KR")+"원";
const fmtS = n => {
  const abs=Math.abs(n);
  if(abs>=100000000)return(n/100000000).toFixed(1)+"억";
  if(abs>=10000)return(n/10000).toFixed(1)+"만";
  return n.toLocaleString("ko-KR");
};
const MONTHS    = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_KO = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

/* ── Supabase 연결 상태 확인 ── */
const isConfigured = () => !SUPABASE_URL.includes("your-project");

/* ── Modal ── */
function Modal({open,onClose,children}){
  if(!open)return null;
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(26,20,16,0.6)",
      zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(2px)"}}>
      <div onClick={e=>e.stopPropagation()} className="animate-up" style={{
        background:C.paper,borderRadius:"28px 28px 0 0",padding:"8px 24px 40px",
        width:"100%",maxWidth:"540px",maxHeight:"92vh",overflowY:"auto",
        boxShadow:"0 -16px 60px rgba(0,0,0,0.2)",border:`1px solid ${C.border}`,borderBottom:"none"}}>
        <div style={{width:"36px",height:"3px",background:C.borderDark,borderRadius:"99px",
          margin:"12px auto 24px",cursor:"pointer"}} onClick={onClose}/>
        {children}
      </div>
    </div>
  );
}

const SLabel = ({children}) => (
  <div style={{fontSize:"9px",fontWeight:700,letterSpacing:"0.14em",color:C.inkLight,
    textTransform:"uppercase",marginBottom:"10px",fontFamily:"'DM Sans',sans-serif"}}>{children}</div>
);
const Inp = ({style,...p}) => (
  <input style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:"10px",
    padding:"10px 13px",fontSize:"14px",color:C.ink,outline:"none",
    background:C.white,boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif",...style}} {...p}/>
);

/* ── Setup Guide ── */
function SetupGuide(){
  return(
    <div style={{background:C.white,borderRadius:"20px",padding:"24px",border:`1px solid ${C.border}`,margin:"16px 0"}}>
      <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"18px",color:C.ink,marginBottom:"6px"}}>Supabase 연동 필요</div>
      <div style={{fontSize:"12px",color:C.inkLight,marginBottom:"20px",fontFamily:"'DM Sans',sans-serif"}}>아래 순서대로 설정하면 폰+PC 어디서나 데이터가 동기화돼요</div>
      {[
        ["1","supabase.com 접속 후 무료 계정 생성 및 새 프로젝트 생성"],
        ["2","SQL Editor에서 supabase_setup.sql 파일 내용 전체 실행"],
        ["3","Settings → API에서 Project URL과 anon public key 복사"],
        ["4","이 파일 상단 SUPABASE_URL, SUPABASE_ANON 값 교체 후 저장"],
      ].map(([n,t])=>(
        <div key={n} style={{display:"flex",gap:"12px",marginBottom:"14px",alignItems:"flex-start"}}>
          <div style={{width:"24px",height:"24px",borderRadius:"50%",background:C.ink,
            color:"#fff",fontSize:"11px",fontWeight:700,display:"flex",alignItems:"center",
            justifyContent:"center",flexShrink:0,fontFamily:"'DM Sans',sans-serif"}}>{n}</div>
          <div style={{fontSize:"13px",color:C.inkMid,fontFamily:"'DM Sans',sans-serif",lineHeight:1.5}}>{t}</div>
        </div>
      ))}
    </div>
  );
}

/* ── TxForm ── */
function TxForm({initial,onSave,onDelete,cards,defaultEntity="personal",saving}){
  const today=new Date().toISOString().slice(0,10);
  const init=initial||{};
  const [entity,setEntity]=useState(init.entity||defaultEntity);
  const tree=TREES[entity];
  const [cat1,setCat1]=useState(init.cat1||Object.keys(tree)[0]);
  const [cat2,setCat2]=useState(init.cat2||Object.keys(tree[Object.keys(tree)[0]].children)[0]||"");
  const [cat3,setCat3]=useState(init.cat3||"");
  const [amount,setAmount]=useState(init.amount?String(init.amount):"");
  const [memo,setMemo]=useState(init.memo||"");
  const [date,setDate]=useState(init.date||today);
  const [cardId,setCardId]=useState(init.cardId||"");
  const [isFixed,setIsFixed]=useState(init.isFixed||false);
  const [fixedDay,setFixedDay]=useState(init.fixedDay||"");
  const [err,setErr]=useState(false);
  const isEdit=!!initial;

  function pickEntity(e){
    setEntity(e);
    const t=TREES[e];const k1=Object.keys(t)[0];
    setCat1(k1);setCat2(Object.keys(t[k1].children)[0]||"");setCat3("");
  }
  function pickCat1(k){setCat1(k);setCat2(Object.keys(tree[k]?.children||{})[0]||"");setCat3("");}

  const cat2keys=Object.keys(tree[cat1]?.children||{});
  const cat3list=Array.isArray(tree[cat1]?.children[cat2])?tree[cat1].children[cat2]:[];
  const m1=tree[cat1]||{color:C.inkMid,accent:C.inkLight};
  const ent=ENTITIES[entity];

  function submit(){
    const num=parseInt(String(amount).replace(/,/g,""));
    if(!num||num<=0){setErr(true);setTimeout(()=>setErr(false),400);return;}
    const isIncome=cat1.includes("수입")||cat1.includes("매출")||cat1.startsWith("저축");
    onSave({id:init.id||Date.now(),entity,cat1,cat2,cat3:cat3||"",
      amount:num,memo:memo.trim()||cat3||cat2,date,cardId,
      isFixed,fixedDay:isFixed&&fixedDay?parseInt(fixedDay):null,
      type:isIncome?"income":"expense"});
  }

  return(
    <div style={{fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"20px"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:"8px"}}>
          <span style={{fontFamily:"'DM Serif Display',serif",fontSize:"21px",color:C.ink}}>{isEdit?"거래 수정":"거래 추가"}</span>
          <span style={{fontSize:"11px",color:C.inkLight}}>{isEdit?"Edit":"Add"}</span>
        </div>
        {isEdit&&(
          <button onClick={onDelete} disabled={saving} style={{display:"flex",alignItems:"center",gap:"5px",
            background:"#fff1ee",border:"1px solid #f4c5b2",borderRadius:"8px",
            padding:"6px 12px",cursor:"pointer",color:"#b5451b",fontSize:"12px",fontWeight:600}}>
            <Trash2 size={13}/> 삭제
          </button>
        )}
      </div>

      {/* Entity */}
      <div style={{marginBottom:"18px"}}>
        <SLabel>주체</SLabel>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"7px"}}>
          {ENTITY_KEYS.map(ek=>{
            const e=ENTITIES[ek];const sel=entity===ek;
            return(
              <button key={ek} className="cat-btn" onClick={()=>pickEntity(ek)} style={{
                padding:"9px 6px",borderRadius:"11px",cursor:"pointer",
                border:`1.5px solid ${sel?e.color:C.border}`,
                background:sel?e.color:C.white,color:sel?"#fff":C.inkMid,
                fontFamily:"'DM Sans',sans-serif",transition:"all 0.18s",
                boxShadow:sel?`0 3px 12px ${e.color}44`:"none"}}>
                <div style={{fontSize:"12px",fontWeight:700,lineHeight:1.3,padding:"2px 0"}}>{e.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* CAT1 */}
      <div style={{marginBottom:"14px"}}>
        <SLabel>대분류</SLabel>
        <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
          {Object.entries(tree).map(([k,v])=>(
            <button key={k} className="cat-btn" onClick={()=>pickCat1(k)} style={{
              padding:"5px 12px",borderRadius:"99px",cursor:"pointer",fontSize:"12px",fontWeight:600,
              fontFamily:"'DM Sans',sans-serif",
              border:`1.5px solid ${cat1===k?v.color:C.border}`,
              background:cat1===k?v.color:"#fff",color:cat1===k?"#fff":C.inkMid,
              boxShadow:cat1===k?`0 2px 8px ${v.color}44`:"none"}}>
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* CAT2 */}
      {cat2keys.length>0&&(
        <div style={{marginBottom:"14px"}}>
          <SLabel>항목1</SLabel>
          <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
            {cat2keys.map(k=>(
              <button key={k} className="cat-btn" onClick={()=>{setCat2(k);setCat3("");}} style={{
                padding:"5px 12px",borderRadius:"99px",cursor:"pointer",fontSize:"12px",fontWeight:500,
                fontFamily:"'DM Sans',sans-serif",
                border:`1.5px solid ${cat2===k?m1.color:C.border}`,
                background:cat2===k?m1.color+"14":"#fff",color:cat2===k?m1.color:C.inkMid}}>
                {k}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CAT3 */}
      {cat3list.length>0&&(
        <div style={{marginBottom:"14px"}}>
          <SLabel>항목2</SLabel>
          <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
            {cat3list.map(k=>(
              <button key={k} className="cat-btn" onClick={()=>setCat3(cat3===k?"":k)} style={{
                padding:"4px 10px",borderRadius:"99px",cursor:"pointer",fontSize:"11px",fontWeight:500,
                fontFamily:"'DM Sans',sans-serif",
                border:`1.5px solid ${cat3===k?m1.accent:C.border}`,
                background:cat3===k?m1.accent+"18":C.cream,color:cat3===k?m1.color:C.inkLight}}>
                {k}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Amount */}
      <div style={{marginBottom:"12px"}}>
        <SLabel>금액</SLabel>
        <div style={{display:"flex",alignItems:"center",
          background:err?"#fff5f0":C.white,
          border:`1.5px solid ${err?"#e07a5f":C.border}`,borderRadius:"12px",padding:"0 16px"}}>
          <span style={{color:C.inkLight,fontFamily:"'DM Serif Display',serif",fontSize:"17px",marginRight:"8px"}}>₩</span>
          <input type="number" value={amount} onChange={e=>setAmount(e.target.value)}
            placeholder="0" style={{flex:1,border:"none",background:"transparent",
              fontSize:"24px",fontWeight:700,color:C.ink,padding:"12px 0",outline:"none",
              fontFamily:"'DM Serif Display',serif",letterSpacing:"-0.5px"}}/>
          <span style={{color:C.inkLight,fontSize:"13px"}}>원</span>
        </div>
      </div>

      {/* Card */}
      {cards.length>0&&(
        <div style={{marginBottom:"12px"}}>
          <SLabel>결제수단</SLabel>
          <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
            <button onClick={()=>setCardId("")} style={{
              padding:"5px 12px",borderRadius:"99px",cursor:"pointer",fontSize:"11px",fontWeight:500,
              border:`1.5px solid ${cardId===""?C.ink:C.border}`,
              background:cardId===""?C.ink:"#fff",color:cardId===""?"#fff":C.inkMid,
              fontFamily:"'DM Sans',sans-serif"}}>미지정</button>
            {cards.map(c=>(
              <button key={c.id} onClick={()=>setCardId(c.id)} style={{
                padding:"5px 12px",borderRadius:"99px",cursor:"pointer",fontSize:"11px",fontWeight:500,
                border:`1.5px solid ${cardId===c.id?c.color:C.border}`,
                background:cardId===c.id?c.color:"#fff",
                color:cardId===c.id?"#fff":C.inkMid,
                fontFamily:"'DM Sans',sans-serif"}}>{c.name}</button>
            ))}
          </div>
        </div>
      )}

      {/* Fixed toggle */}
      <div style={{marginBottom:"12px"}}>
        <button onClick={()=>setIsFixed(f=>!f)} style={{
          display:"flex",alignItems:"center",gap:"10px",width:"100%",
          background:isFixed?"#fff8f0":"#fff",
          border:`1.5px solid ${isFixed?"#b5451b":C.border}`,
          borderRadius:isFixed?"12px 12px 0 0":"12px",padding:"11px 14px",cursor:"pointer",transition:"all 0.2s"}}>
          <div style={{width:"38px",height:"22px",borderRadius:"99px",flexShrink:0,
            background:isFixed?"#b5451b":C.border,position:"relative",transition:"background 0.2s"}}>
            <div style={{width:"16px",height:"16px",borderRadius:"50%",background:"#fff",
              position:"absolute",top:"3px",transition:"left 0.2s",
              left:isFixed?"19px":"3px",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
          </div>
          <div style={{flex:1,textAlign:"left"}}>
            <div style={{fontSize:"13px",fontWeight:600,color:isFixed?"#b5451b":C.inkMid,fontFamily:"'DM Sans',sans-serif"}}>고정지출</div>
            <div style={{fontSize:"10px",color:C.inkLight,marginTop:"1px",fontFamily:"'DM Sans',sans-serif"}}>
              {isFixed?"매달 반복되는 고정 지출":"일반 지출"}
            </div>
          </div>
        </button>
        {isFixed&&(
          <div style={{background:"#fff8f0",border:"1.5px solid #b5451b",borderTop:"1px solid #f4c5b2",
            borderRadius:"0 0 12px 12px",padding:"12px 14px",
            display:"flex",alignItems:"center",gap:"10px"}}>
            <div style={{fontSize:"11px",fontWeight:600,color:"#b5451b",fontFamily:"'DM Sans',sans-serif",flexShrink:0}}>
              매월 발생일
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"5px",flex:1}}>
              {[1,5,10,15,20,25,"말일"].map(d=>{
                const label=d==="말일"?"말일":`${d}일`;
                const val=d==="말일"?31:d;
                const sel=parseInt(fixedDay)===val;
                return(
                  <button key={d} onClick={()=>setFixedDay(sel?"":String(val))} style={{
                    padding:"4px 10px",borderRadius:"99px",cursor:"pointer",fontSize:"11px",fontWeight:600,
                    border:`1.5px solid ${sel?"#b5451b":"#f4c5b2"}`,
                    background:sel?"#b5451b":"#fff",color:sel?"#fff":"#b5451b",
                    fontFamily:"'DM Sans',sans-serif"}}>
                    {label}
                  </button>
                );
              })}
            </div>
            <input type="number" value={fixedDay==="31"?"":fixedDay}
              onChange={e=>setFixedDay(e.target.value)} placeholder="직접입력"
              min="1" max="31"
              style={{width:"70px",border:"1.5px solid #f4c5b2",borderRadius:"8px",
                padding:"5px 8px",fontSize:"12px",color:"#b5451b",outline:"none",
                background:"#fff",fontFamily:"'DM Sans',sans-serif",textAlign:"center"}}/>
          </div>
        )}
      </div>

      {/* Memo + Date */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"20px"}}>
        <div><SLabel>메모</SLabel><Inp value={memo} onChange={e=>setMemo(e.target.value)} placeholder="선택사항"/></div>
        <div><SLabel>날짜</SLabel><Inp type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
      </div>

      <button className="add-btn" onClick={submit} disabled={saving} style={{
        width:"100%",padding:"14px",background:saving?"#9c8e82":ent.color,color:"#fff",border:"none",
        borderRadius:"13px",fontSize:"15px",fontWeight:600,cursor:saving?"not-allowed":"pointer",
        display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",
        fontFamily:"'DM Sans',sans-serif",boxShadow:`0 4px 18px ${ent.color}55`,transition:"all 0.2s"}}>
        {saving
          ? <><RefreshCw size={16} className="spin"/> 저장 중...</>
          : isEdit?<><Check size={16}/> 저장하기</>:<><PlusCircle size={16}/> 추가하기</>}
      </button>
    </div>
  );
}

/* ── Card Settings ── */
function CardSettings({cards,onChange,saving}){
  const [newName,setNewName]=useState("");
  const [newColor,setNewColor]=useState(CARD_COLORS[0]);
  const [editId,setEditId]=useState(null);
  const [editName,setEditName]=useState("");

  async function addCard(){
    if(!newName.trim())return;
    const c={id:"c"+Date.now(),name:newName.trim(),color:newColor};
    await onChange([...cards,c],"add",c);
    setNewName("");setNewColor(CARD_COLORS[0]);
  }
  async function delCard(id){ await onChange(cards.filter(c=>c.id!==id),"del",{id}); }
  function startEdit(c){setEditId(c.id);setEditName(c.name);}
  async function saveEdit(id){
    const updated=cards.map(c=>c.id===id?{...c,name:editName}:c);
    await onChange(updated,"update",{id,name:editName});
    setEditId(null);
  }

  return(
    <div style={{fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:"8px",marginBottom:"22px"}}>
        <span style={{fontFamily:"'DM Serif Display',serif",fontSize:"21px",color:C.ink}}>결제수단 관리</span>
        <span style={{fontSize:"11px",color:C.inkLight}}>Cards</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:"8px",marginBottom:"20px"}}>
        {cards.map(c=>(
          <div key={c.id} style={{display:"flex",alignItems:"center",gap:"10px",
            background:C.white,borderRadius:"12px",padding:"11px 14px",border:`1px solid ${C.border}`}}>
            <div style={{width:"10px",height:"10px",borderRadius:"50%",flexShrink:0,background:c.color,marginRight:"2px"}}/>
            {editId===c.id
              ?<input value={editName} onChange={e=>setEditName(e.target.value)} autoFocus
                style={{flex:1,border:`1.5px solid ${C.border}`,borderRadius:"8px",
                  padding:"6px 10px",fontSize:"13px",outline:"none",fontFamily:"'DM Sans',sans-serif"}}/>
              :<span style={{flex:1,fontSize:"13px",fontWeight:500,color:C.ink}}>{c.name}</span>
            }
            <div style={{display:"flex",gap:"4px"}}>
              {editId===c.id
                ?<>
                  <button onClick={()=>saveEdit(c.id)} style={{background:"#f0fdf4",border:"1px solid #b7e4c7",
                    borderRadius:"7px",padding:"5px 10px",cursor:"pointer",color:"#2d6a4f",fontSize:"12px",fontWeight:600}}>저장</button>
                  <button onClick={()=>setEditId(null)} style={{background:C.cream,border:`1px solid ${C.border}`,
                    borderRadius:"7px",padding:"5px 10px",cursor:"pointer",color:C.inkLight,fontSize:"12px"}}>취소</button>
                </>
                :<>
                  <button onClick={()=>startEdit(c)} style={{background:"none",border:"none",cursor:"pointer",
                    color:C.inkLight,padding:"4px",borderRadius:"6px",display:"flex"}}><Pencil size={13}/></button>
                  <button onClick={()=>delCard(c.id)} style={{background:"none",border:"none",cursor:"pointer",
                    color:C.border,padding:"4px",borderRadius:"6px",display:"flex",transition:"color 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.color="#e07a5f"}
                    onMouseLeave={e=>e.currentTarget.style.color=C.border}><Trash2 size={13}/></button>
                </>
              }
            </div>
          </div>
        ))}
      </div>
      <div style={{background:C.cream,borderRadius:"14px",padding:"16px",border:`1px solid ${C.border}`}}>
        <SLabel>카드 추가</SLabel>
        <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
          <Inp value={newName} onChange={e=>setNewName(e.target.value)} placeholder="카드 이름" style={{flex:1}}/>
          <button onClick={addCard} style={{background:C.ink,border:"none",borderRadius:"10px",
            padding:"0 16px",color:"#fff",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
            fontSize:"13px",fontWeight:600,display:"flex",alignItems:"center",gap:"4px",flexShrink:0}}>
            <Plus size={14}/> 추가
          </button>
        </div>
        <div style={{fontSize:"10px",color:C.inkLight,marginBottom:"6px",fontWeight:600,letterSpacing:"0.08em"}}>색상</div>
        <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
          {CARD_COLORS.map(col=>(
            <button key={col} onClick={()=>setNewColor(col)} style={{
              width:"26px",height:"26px",borderRadius:"50%",background:col,border:"none",cursor:"pointer",
              outline:newColor===col?`3px solid ${col}`:"3px solid transparent",outlineOffset:"2px"}}/>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Tree View ── */
function TreeView({txs,onEdit,entity,cards}){
  const [open,setOpen]=useState({});
  const toggle=k=>setOpen(p=>({...p,[k]:!p[k]}));
  const tree=TREES[entity]||TREE_PERSONAL;
  const cardMap=useMemo(()=>Object.fromEntries(cards.map(c=>[c.id,c])),[cards]);

  const grouped=useMemo(()=>{
    const t={};
    [...txs].sort((a,b)=>b.date.localeCompare(a.date)).forEach(tx=>{
      if(!t[tx.cat1])t[tx.cat1]={total:0,sub:{}};
      t[tx.cat1].total+=tx.type==="income"?tx.amount:-tx.amount;
      const c2=tx.cat2||"기타";
      if(!t[tx.cat1].sub[c2])t[tx.cat1].sub[c2]={total:0,items:[]};
      t[tx.cat1].sub[c2].total+=tx.type==="income"?tx.amount:-tx.amount;
      t[tx.cat1].sub[c2].items.push(tx);
    });
    return t;
  },[txs]);

  if(!txs.length)return(
    <div style={{textAlign:"center",padding:"56px 20px",background:C.white,borderRadius:"20px",border:`1px solid ${C.border}`}}>
      <div style={{fontSize:"34px",marginBottom:"12px",opacity:0.3}}>📭</div>
      <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"17px",color:C.inkMid,marginBottom:"4px"}}>비어있어요</div>
      <div style={{fontSize:"12px",color:C.inkLight}}>거래를 추가해보세요</div>
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
      {Object.entries(grouped).map(([c1,{total,sub}])=>{
        const m1=tree[c1]||{color:C.inkMid,accent:C.inkLight,icon:"•"};
        const o1=open[c1];
        const cnt=Object.values(sub).reduce((s,c)=>s+c.items.length,0);
        return(
          <div key={c1} style={{background:C.white,borderRadius:"18px",overflow:"hidden",
            border:`1px solid ${o1?m1.color+"33":C.border}`,
            boxShadow:o1?`0 4px 20px ${m1.color}18`:"0 1px 4px rgba(0,0,0,0.04)",transition:"all 0.2s"}}>
            <div className="tree-l1" onClick={()=>toggle(c1)} style={{display:"flex",alignItems:"center",gap:"12px",padding:"13px 16px",cursor:"pointer"}}>
              <div style={{width:"4px",height:"36px",borderRadius:"99px",flexShrink:0,
                background:`linear-gradient(180deg,${m1.color},${m1.accent})`}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:"14px",fontWeight:600,color:C.ink,fontFamily:"'DM Sans',sans-serif"}}>{c1}</div>
                <div style={{fontSize:"11px",color:C.inkLight,marginTop:"1px",fontFamily:"'DM Sans',sans-serif"}}>{cnt}건</div>
              </div>
              <div style={{fontSize:"15px",fontWeight:700,marginRight:"6px",
                color:total>=0?"#2d6a4f":"#b5451b",fontFamily:"'DM Serif Display',serif",letterSpacing:"-0.3px"}}>
                {total>=0?"+":""}{fmtS(total)}
              </div>
              <div style={{width:"21px",height:"21px",borderRadius:"50%",flexShrink:0,
                background:o1?m1.color:C.cream,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}>
                <ChevronR size={12} color={o1?"#fff":C.inkLight}
                  style={{transform:o1?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.2s"}}/>
              </div>
            </div>
            {o1&&Object.entries(sub).map(([c2,{total:t2,items}])=>{
              const k2=`${c1}__${c2}`;const o2=open[k2];
              return(
                <div key={c2} style={{borderTop:`1px solid ${C.border}`}}>
                  <div className="tree-l2" onClick={()=>toggle(k2)} style={{
                    display:"flex",alignItems:"center",gap:"10px",
                    padding:"9px 16px 9px 50px",cursor:"pointer",background:o2?"#faf8f4":C.white}}>
                    <div style={{width:"5px",height:"5px",borderRadius:"50%",background:m1.color,opacity:0.5,flexShrink:0}}/>
                    <div style={{flex:1,fontSize:"13px",fontWeight:500,color:C.inkMid,fontFamily:"'DM Sans',sans-serif"}}>{c2}</div>
                    <div style={{fontSize:"13px",fontWeight:600,marginRight:"6px",
                      color:t2>=0?"#2d6a4f":"#b5451b",fontFamily:"'DM Sans',sans-serif"}}>
                      {t2>=0?"+":""}{fmtS(t2)}
                    </div>
                    <ChevronR size={11} color={C.inkLight}
                      style={{transform:o2?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.2s",flexShrink:0}}/>
                  </div>
                  {o2&&items.map(tx=>{
                    const card=tx.cardId?cardMap[tx.cardId]:null;
                    return(
                      <div key={tx.id} className="tx-row" onClick={()=>onEdit(tx)}
                        style={{display:"flex",alignItems:"center",gap:"10px",
                          padding:"9px 16px 9px 65px",borderTop:`1px solid ${C.border}`,
                          background:C.white,cursor:"pointer",transition:"background 0.15s"}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:"13px",fontWeight:500,color:C.ink,
                            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                            display:"flex",alignItems:"center",gap:"5px",fontFamily:"'DM Sans',sans-serif"}}>
                            {tx.cat3&&<span style={{fontSize:"9px",background:m1.color+"14",color:m1.color,
                              borderRadius:"4px",padding:"1px 6px",fontWeight:700,flexShrink:0}}>{tx.cat3}</span>}
                            <span>{tx.memo}</span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:"6px",marginTop:"2px"}}>
                            <span style={{fontSize:"10px",color:C.inkLight,fontFamily:"'DM Sans',sans-serif"}}>{tx.date}</span>
                            {tx.isFixed&&<span style={{fontSize:"9px",background:"#fff8f0",color:"#b5451b",
                              borderRadius:"4px",padding:"1px 6px",fontWeight:700,fontFamily:"'DM Sans',sans-serif",
                              border:"1px solid #f4c5b2"}}>고정</span>}
                            {card&&<span style={{fontSize:"9px",background:card.color+"14",color:card.color,
                              borderRadius:"4px",padding:"1px 6px",fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>
                              {card.name}</span>}
                          </div>
                        </div>
                        <div style={{fontSize:"14px",fontWeight:600,flexShrink:0,
                          color:tx.type==="income"?"#2d6a4f":"#b5451b",
                          fontFamily:"'DM Serif Display',serif",letterSpacing:"-0.2px"}}>
                          {tx.type==="income"?"+":"-"}{fmtS(tx.amount)}
                        </div>
                        <div style={{color:C.border,flexShrink:0,display:"flex"}}><Pencil size={12}/></div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ── Fixed View ── */
function FixedView({txs, onDelete, year, month}){
  const today = new Date();
  const todayDay = today.getDate();
  const isCurrentMonth = today.getFullYear()===year && today.getMonth()===month;

  // 모든 고정지출 템플릿: 가장 최근 등록된 것 기준으로 memo별 dedupe
  const fixedTemplates = useMemo(()=>{
    const map={};
    [...txs].filter(t=>t.isFixed).sort((a,b)=>b.date.localeCompare(a.date)).forEach(t=>{
      if(!map[t.memo+t.entity]) map[t.memo+t.entity]=t;
    });
    return Object.values(map);
  },[txs]);

  // 이번 달 실제 발생한 고정지출
  const monthKey=`${year}-${String(month+1).padStart(2,"0")}`;
  const thisMonthFixed = useMemo(()=>
    txs.filter(t=>t.isFixed&&t.date.startsWith(monthKey)),
  [txs,monthKey]);

  // 이번 달 아직 미발생인 예정 항목
  const scheduled = useMemo(()=>
    fixedTemplates.filter(t=>{
      const alreadyDone = thisMonthFixed.some(m=>m.memo===t.memo&&m.entity===t.entity);
      return !alreadyDone && t.fixedDay;
    }).sort((a,b)=>a.fixedDay-b.fixedDay),
  [fixedTemplates,thisMonthFixed]);

  // 이번 달 실제 발생 목록
  const occurred = useMemo(()=>
    [...thisMonthFixed].sort((a,b)=>a.date.localeCompare(b.date)),
  [thisMonthFixed]);

  const totalScheduled = scheduled.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const totalOccurred  = occurred.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);

  const FixedCard = ({tx, isScheduled}) => {
    const ent = ENTITIES[tx.entity]||{label:tx.entity,color:C.inkMid};
    const isPast = isScheduled && isCurrentMonth && tx.fixedDay < todayDay;
    const isToday = isScheduled && isCurrentMonth && tx.fixedDay === todayDay;
    const borderColor = isToday?"#b5451b":isPast?"#e07a5f":C.border;
    const bgColor = isToday?"#fff8f0":isPast?"#fffaf8":C.white;
    return(
      <div style={{display:"flex",alignItems:"center",gap:"12px",
        background:bgColor,borderRadius:"13px",padding:"12px 14px",
        border:`1px solid ${borderColor}`,
        position:"relative",overflow:"hidden"}}>
        {isScheduled&&(
          <div style={{position:"absolute",top:0,left:0,bottom:0,width:"3px",
            background:isToday?"#b5451b":isPast?"#e07a5f":"#d4c8b8"}}/>
        )}
        <div style={{flex:1,minWidth:0,paddingLeft:isScheduled?"4px":"0"}}>
          <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"3px"}}>
            <span style={{fontSize:"13px",fontWeight:600,color:C.ink,
              fontFamily:"'DM Sans',sans-serif",overflow:"hidden",
              textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.memo}</span>
            {isToday&&<span style={{fontSize:"9px",background:"#b5451b",color:"#fff",
              borderRadius:"4px",padding:"1px 6px",fontWeight:700,flexShrink:0,
              fontFamily:"'DM Sans',sans-serif"}}>오늘</span>}
            {isPast&&!isToday&&<span style={{fontSize:"9px",background:"#fff0ee",color:"#e07a5f",
              borderRadius:"4px",padding:"1px 6px",fontWeight:700,flexShrink:0,
              border:"1px solid #f4c5b2",fontFamily:"'DM Sans',sans-serif"}}>미발생</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
            <span style={{fontSize:"10px",color:C.inkLight,fontFamily:"'DM Sans',sans-serif"}}>
              {ent.label}
            </span>
            {isScheduled&&tx.fixedDay&&(
              <span style={{fontSize:"10px",color:isToday?"#b5451b":isPast?"#e07a5f":C.inkLight,
                fontWeight:isToday||isPast?700:400,fontFamily:"'DM Sans',sans-serif"}}>
                매월 {tx.fixedDay===31?"말일":`${tx.fixedDay}일`}
              </span>
            )}
            {!isScheduled&&(
              <span style={{fontSize:"10px",color:C.inkLight,fontFamily:"'DM Sans',sans-serif"}}>{tx.date}</span>
            )}
          </div>
        </div>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"15px",
          color:tx.type==="income"?"#2d6a4f":"#b5451b",fontWeight:700,flexShrink:0,
          opacity:isScheduled?0.6:1}}>
          {tx.type==="income"?"+":"-"}{fmtS(tx.amount)}
        </div>
        {!isScheduled&&(
          <button onClick={()=>onDelete(tx.id)} style={{background:"none",border:"none",cursor:"pointer",
            color:C.border,padding:"4px",flexShrink:0,borderRadius:"6px",display:"flex",transition:"color 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.color="#e07a5f"}
            onMouseLeave={e=>e.currentTarget.style.color=C.border}><Trash2 size={14}/></button>
        )}
      </div>
    );
  };

  if(!fixedTemplates.length) return(
    <div style={{textAlign:"center",padding:"56px 20px",background:C.white,borderRadius:"20px",border:`1px solid ${C.border}`}}>
      <div style={{fontSize:"34px",marginBottom:"12px",opacity:0.3}}>📋</div>
      <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"17px",color:C.inkMid,marginBottom:"4px"}}>고정지출이 없어요</div>
      <div style={{fontSize:"12px",color:C.inkLight}}>거래 추가 시 고정지출 토글을 켜보세요</div>
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:"20px"}}>

      {/* 예정 섹션 */}
      {scheduled.length>0&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
            <div style={{fontSize:"10px",fontWeight:700,color:"#b5451b",letterSpacing:"0.12em",
              textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif"}}>
              이번 달 예정 ({scheduled.length}건)
            </div>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"14px",color:"#b5451b",opacity:0.7}}>
              -{fmtS(totalScheduled)}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
            {scheduled.map(tx=><FixedCard key={tx.id+"_s"} tx={tx} isScheduled={true}/>)}
          </div>
        </div>
      )}

      {/* 발생 섹션 */}
      {occurred.length>0&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
            <div style={{fontSize:"10px",fontWeight:700,color:C.inkLight,letterSpacing:"0.12em",
              textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif"}}>
              이번 달 발생 ({occurred.length}건)
            </div>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"14px",color:"#b5451b"}}>
              -{fmtS(totalOccurred)}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
            {occurred.map(tx=><FixedCard key={tx.id} tx={tx} isScheduled={false}/>)}
          </div>
        </div>
      )}

      {/* 전체 합계 */}
      <div style={{background:"#fff8f0",borderRadius:"16px",padding:"16px 18px",
        border:"1px solid #f4c5b2",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:"9px",fontWeight:700,color:"#b5451b",letterSpacing:"0.12em",
            textTransform:"uppercase",marginBottom:"4px",fontFamily:"'DM Sans',sans-serif"}}>
            이번 달 고정지출 예상 합계
          </div>
          <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"22px",color:"#b5451b",letterSpacing:"-0.5px"}}>
            -{fmtS(totalOccurred+totalScheduled)}
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:"10px",color:"#b5451b",opacity:0.6,fontFamily:"'DM Sans',sans-serif"}}>발생 -{fmtS(totalOccurred)}</div>
          <div style={{fontSize:"10px",color:"#b5451b",opacity:0.4,fontFamily:"'DM Sans',sans-serif"}}>예정 -{fmtS(totalScheduled)}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Stats ── */
function StatsView({txs,entity,cards}){
  const tree=TREES[entity]||TREE_PERSONAL;
  const [statsTab,setStatsTab]=useState("cat");
  const byCat1=useMemo(()=>{
    const m={};txs.filter(t=>t.type==="expense").forEach(t=>{m[t.cat1]=(m[t.cat1]||0)+t.amount;});
    return Object.entries(m).map(([name,value])=>({name,value,color:tree[name]?.color||C.inkMid})).sort((a,b)=>b.value-a.value);
  },[txs,tree]);
  const byCard=useMemo(()=>{
    const m={};txs.filter(t=>t.type==="expense").forEach(t=>{const k=t.cardId||"__none__";m[k]=(m[k]||0)+t.amount;});
    return Object.entries(m).map(([id,value])=>{
      const card=cards.find(c=>c.id===id);
      return{name:card?card.name:"미지정",value,color:card?card.color:C.inkLight};
    }).sort((a,b)=>b.value-a.value);
  },[txs,cards]);
  const income=txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const expense=txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const tt={background:C.paper,border:`1px solid ${C.border}`,borderRadius:"10px",fontFamily:"'DM Sans',sans-serif",fontSize:"12px"};

  if(!txs.length)return(
    <div style={{textAlign:"center",padding:"56px 20px",background:C.white,borderRadius:"20px",border:`1px solid ${C.border}`}}>
      <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"17px",color:C.inkMid}}>데이터가 없어요</div>
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
        {[["수입",income,"#2d6a4f","#f0fdf4","#b7e4c7"],[" 지출",-expense,"#b5451b","#fff5f0","#f4c5b2"]].map(([l,v,c,bg,b])=>(
          <div key={l} style={{background:bg,borderRadius:"16px",padding:"16px",border:`1px solid ${b}`}}>
            <div style={{fontSize:"9px",fontWeight:700,color:c,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:"7px",fontFamily:"'DM Sans',sans-serif"}}>{l}</div>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"21px",color:c,letterSpacing:"-0.5px"}}>{v>=0?"+":""}{fmtS(v)}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",background:C.white,borderRadius:"10px",padding:"3px",border:`1px solid ${C.border}`,gap:"3px"}}>
        {[["cat","카테고리별"],["card","카드별"]].map(([k,l])=>(
          <button key={k} onClick={()=>setStatsTab(k)} style={{
            flex:1,padding:"8px",border:"none",borderRadius:"8px",cursor:"pointer",
            fontWeight:statsTab===k?700:400,fontSize:"12px",transition:"all 0.15s",
            background:statsTab===k?C.ink:"transparent",color:statsTab===k?"#fff":C.inkLight,fontFamily:"'DM Sans',sans-serif"}}>{l}</button>
        ))}
      </div>
      {statsTab==="cat"&&byCat1.length>0&&(
        <>
          <div style={{background:C.white,borderRadius:"18px",padding:"18px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:"10px",fontWeight:700,color:C.inkLight,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:"12px",fontFamily:"'DM Sans',sans-serif"}}>대분류별 지출</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={byCat1} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={76} paddingAngle={3}>
                {byCat1.map((e,i)=><Cell key={i} fill={e.color}/>)}
              </Pie><Tooltip formatter={v=>fmt(v)} contentStyle={tt}/><Legend iconType="circle" iconSize={7} formatter={v=><span style={{fontSize:"11px",color:C.inkMid,fontFamily:"'DM Sans',sans-serif"}}>{v}</span>}/></PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:C.white,borderRadius:"18px",padding:"18px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:"10px",fontWeight:700,color:C.inkLight,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:"12px",fontFamily:"'DM Sans',sans-serif"}}>항목별 TOP</div>
            <ResponsiveContainer width="100%" height={Math.max(180,byCat1.length*34)}>
              <BarChart data={byCat1} layout="vertical" margin={{left:4,right:20}}>
                <XAxis type="number" tick={{fontSize:10,fontFamily:"'DM Sans',sans-serif",fill:C.inkLight}} tickFormatter={fmtS} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="name" tick={{fontSize:10,fontFamily:"'DM Sans',sans-serif",fill:C.inkMid}} width={110} axisLine={false} tickLine={false}/>
                <CartesianGrid strokeDasharray="2 4" horizontal={false} stroke={C.border}/>
                <Tooltip formatter={v=>fmt(v)} contentStyle={tt}/>
                <Bar dataKey="value" radius={[0,6,6,0]}>{byCat1.map((e,i)=><Cell key={i} fill={e.color}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      {statsTab==="card"&&byCard.length>0&&(
        <>
          <div style={{background:C.white,borderRadius:"18px",padding:"18px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:"10px",fontWeight:700,color:C.inkLight,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:"12px",fontFamily:"'DM Sans',sans-serif"}}>카드별 지출</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={byCard} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={76} paddingAngle={3}>
                {byCard.map((e,i)=><Cell key={i} fill={e.color}/>)}
              </Pie><Tooltip formatter={v=>fmt(v)} contentStyle={tt}/><Legend iconType="circle" iconSize={7} formatter={v=><span style={{fontSize:"11px",color:C.inkMid,fontFamily:"'DM Sans',sans-serif"}}>{v}</span>}/></PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
            {byCard.map((c,i)=>(
              <div key={i} style={{background:C.white,borderRadius:"12px",padding:"12px 14px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:"10px"}}>
                <div style={{width:"10px",height:"10px",borderRadius:"50%",background:c.color,flexShrink:0}}/>
                <div style={{flex:1,fontSize:"13px",fontWeight:500,color:C.ink,fontFamily:"'DM Sans',sans-serif"}}>{c.name}</div>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"15px",color:"#b5451b",fontWeight:700}}>-{fmtS(c.value)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Coupang Import Modal ── */
function parsePastedMails(text) {
  const results = [];
  // 빈 줄 2개 이상 or "---" 구분자로 메일 분리
  const chunks = text.split(/\n{2,}|---+/).map(c=>c.trim()).filter(c=>c.length>4);
  const today = new Date().toISOString().slice(0,10);

  for (const chunk of chunks) {
    // 날짜 추출 (YYYY.MM.DD / YYYY-MM-DD / YYYY년MM월DD일 / MM월DD일)
    const dateM = chunk.match(/(\d{4})[년.\-\/\s]+(\d{1,2})[월.\-\/\s]+(\d{1,2})[일]?/)
      || chunk.match(/(\d{1,2})[월\.\-\/](\d{1,2})[일]?/);
    let date = today;
    if (dateM) {
      if (dateM[3]) {
        date = `${dateM[1]}-${String(dateM[2]).padStart(2,'0')}-${String(dateM[3]).padStart(2,'0')}`;
      } else {
        const yr = new Date().getFullYear();
        date = `${yr}-${String(dateM[1]).padStart(2,'0')}-${String(dateM[2]).padStart(2,'0')}`;
      }
    }

    // 금액 추출 — 가장 큰 값 (배송비 제외)
    const amtAll = [...chunk.matchAll(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*원/g)]
      .map(m=>parseInt(m[1].replace(/,/g,'')))
      .filter(n=>n>=100 && n<50000000);
    const amount = amtAll.length ? Math.max(...amtAll) : null;

    // 상품명 추출 — 숫자/날짜/키워드 없는 첫 번째 의미 있는 줄
    const lines = chunk.split('\n').map(l=>l.trim()).filter(l=>l);
    const skipPattern = /^[\d\s년월일.\-\/]+$|주문|결제|배송|배달|발송|확인|완료|총|합계|금액|원$/;
    const nameLine = lines.find(l=>l.length>=5 && !skipPattern.test(l));
    const name = (nameLine||lines[0]||"상품명 확인 필요").slice(0,60);

    results.push({ date, name, amount });
  }
  return results;
}

const IMPORT_ENTS = {
  personal:{ label:"개인",          color:"#6b5c4e" },
  cafe:    { label:"앤딩스터디카페", color:"#2d6a4f" },
  realty:  { label:"부동산매매",     color:"#1d4e89" },
  skip:    { label:"건너뜀",         color:"#c8bfb4" },
};
const IMPORT_KEYS = ["personal","cafe","realty","skip"];

function CoupangImport({ onRegister }) {
  const [pasteText, setPasteText] = useState("");
  const [status,    setStatus]    = useState("idle");
  const [rows,      setRows]      = useState([]);
  const [errMsg,    setErrMsg]    = useState("");
  const [submitted, setSubmitted] = useState(false);

  function parseMails() {
    setErrMsg("");
    if (!pasteText.trim()) { setErrMsg("이메일 내용을 붙여넣어 주세요."); setStatus("error"); return; }
    const parsed = parsePastedMails(pasteText);
    if (!parsed.length) { setErrMsg("파싱할 수 있는 내용이 없어요. 빈 줄로 메일을 구분해 주세요."); setStatus("error"); return; }
    const seen = new Set();
    const deduped = parsed.filter(p => {
      const k = `${p.date}__${p.name}__${p.amount}`;
      if (seen.has(k)) return false; seen.add(k); return true;
    });
    setRows(deduped.map((p,i) => ({
      id:`r${i}_${Date.now()}`, date:p.date, name:p.name,
      amountEdit:p.amount?String(p.amount):"", entity:"personal", done:false,
    })));
    setStatus("parsed");
  }

  const pending = rows.filter(r=>!r.done);
  const done    = rows.filter(r=>r.done);
  const toReg   = pending.filter(r=>r.entity!=="skip"&&parseInt(r.amountEdit)>0);

  function setEnt(id,e){ setRows(p=>p.map(r=>r.id===id?{...r,entity:e}:r)); }
  function setAmt(id,v){ setRows(p=>p.map(r=>r.id===id?{...r,amountEdit:v}:r)); }
  function markDone(id){ setRows(p=>p.map(r=>r.id===id?{...r,done:true}:r)); }
  function undoDone(id){ setRows(p=>p.map(r=>r.id===id?{...r,done:false}:r)); }

  function registerAll(){
    toReg.forEach(r=>{
      onRegister({
        id:Date.now()+Math.random(), entity:r.entity,
        cat1: r.entity==="cafe"?"매입/원가":"지출-용돈",
        cat2: r.entity==="cafe"?"소모품":"쇼핑",
        cat3:"", amount:parseInt(r.amountEdit),
        memo:`[쿠팡] ${r.name}`, date:r.date,
        cardId:"c7", isFixed:false, fixedDay:null, type:"expense",
      });
      markDone(r.id);
    });
    setSubmitted(true);
    setTimeout(()=>setSubmitted(false),2500);
  }

  const btnStyle = {
    background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)",
    borderRadius:"10px", padding:"9px", color:"rgba(255,255,255,0.6)",
    cursor:"pointer", display:"flex",
  };

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:"8px",marginBottom:"20px"}}>
        <span style={{fontFamily:"'DM Serif Display',serif",fontSize:"21px",color:C.ink}}>쿠팡 메일 가져오기</span>
        <span style={{fontSize:"11px",color:C.inkLight}}>Gmail → 파싱 → 등록</span>
      </div>

      {/* 붙여넣기 + 파싱 */}
      <div style={{background:C.cream,borderRadius:"14px",padding:"14px",
        border:`1px solid ${C.border}`,marginBottom:"16px"}}>
        <SLabel>이메일 내용 붙여넣기</SLabel>
        <div style={{fontSize:"11px",color:C.inkLight,marginBottom:"8px",lineHeight:1.5}}>
          Gmail에서 쿠팡 주문 확인 메일을 열고 내용을 복사해 붙여넣으세요.<br/>
          여러 메일은 <b>빈 줄</b>로 구분하면 한번에 파싱해요.
        </div>
        <textarea
          value={pasteText}
          onChange={e=>setPasteText(e.target.value)}
          placeholder={"[쿠팡] 주문이 확정되었습니다\n2026.05.13\n다하다 둥굴레차 100개입\n13,000원\n\n(다음 메일은 빈 줄로 구분)"}
          rows={6}
          style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:"10px",
            padding:"10px 12px",fontSize:"12px",color:C.ink,background:C.white,
            fontFamily:"'DM Sans',sans-serif",resize:"vertical",outline:"none",
            lineHeight:1.6,boxSizing:"border-box"}}
        />
        <button onClick={parseMails} style={{
          width:"100%",marginTop:"10px",padding:"12px",
          background:C.ink,color:"#fff",border:"none",borderRadius:"11px",
          fontSize:"14px",fontWeight:700,cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",
          fontFamily:"'DM Sans',sans-serif",
          boxShadow:"0 4px 14px rgba(0,0,0,0.2)"}}>
          <Mail size={14}/> 파싱하기
        </button>
      </div>

      {/* 에러 */}
      {status==="error"&&(
        <div style={{background:"#fff8f0",borderRadius:"12px",padding:"14px",
          border:"1px solid #f4c5b2",display:"flex",gap:"10px",marginBottom:"14px"}}>
          <AlertCircle size={15} color="#b5451b" style={{flexShrink:0,marginTop:"1px"}}/>
          <div>
            <div style={{fontSize:"12px",fontWeight:700,color:"#b5451b",marginBottom:"2px"}}>가져오기 실패</div>
            <div style={{fontSize:"11px",color:"#b5451b",opacity:0.8}}>{errMsg}</div>
          </div>
        </div>
      )}

      {/* 로딩 스켈레톤 */}
      {status==="loading"&&(
        <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
          {[1,2,3].map(i=>(
            <div key={i} style={{borderRadius:"14px",height:"90px",
              background:"linear-gradient(90deg,#f0ece4 25%,#e8e0d4 50%,#f0ece4 75%)",
              backgroundSize:"400px 100%",animation:"shimmer 1.4s infinite"}}/>
          ))}
        </div>
      )}

      {/* 분류 대기 */}
      {status==="parsed"&&(
        <>
          {toReg.length>0&&(
            <button onClick={registerAll} style={{
              width:"100%",padding:"12px",marginBottom:"14px",
              background:submitted?"#2d6a4f":C.ink,color:"#fff",border:"none",
              borderRadius:"12px",fontSize:"14px",fontWeight:700,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",
              fontFamily:"'DM Sans',sans-serif",transition:"all 0.3s",
              boxShadow:"0 4px 14px rgba(0,0,0,0.18)"}}>
              {submitted?<><Check size={14}/> 등록 완료!</>:<><ShoppingCart size={14}/> {toReg.length}건 한번에 등록</>}
            </button>
          )}

          {pending.filter(r=>r.entity!=="skip").length>0&&(
            <div style={{marginBottom:"16px"}}>
              <SLabel>분류 대기 ({pending.filter(r=>r.entity!=="skip").length}건)</SLabel>
              <div style={{display:"flex",flexDirection:"column",gap:"7px"}}>
                {pending.filter(r=>r.entity!=="skip").map(r=>{
                  const ent=IMPORT_ENTS[r.entity];
                  return(
                    <div key={r.id} style={{background:C.white,borderRadius:"14px",
                      border:`1px solid ${ent.color}33`,overflow:"hidden",
                      boxShadow:`0 2px 8px ${ent.color}10`}}>
                      <div style={{padding:"11px 13px 9px"}}>
                        <div style={{fontSize:"13px",fontWeight:600,color:C.ink,
                          lineHeight:1.4,marginBottom:"5px"}}>{r.name}</div>
                        <div style={{display:"flex",alignItems:"center",gap:"7px",flexWrap:"wrap"}}>
                          <span style={{fontSize:"10px",color:C.inkLight}}>{r.date}</span>
                          <div style={{display:"flex",alignItems:"center",
                            background:parseInt(r.amountEdit)>0?C.cream:"#fff8f0",
                            border:`1.5px solid ${parseInt(r.amountEdit)>0?C.borderDark:"#f4c5b2"}`,
                            borderRadius:"7px",padding:"2px 9px"}}>
                            <span style={{fontSize:"10px",color:C.inkLight,marginRight:"2px"}}>₩</span>
                            <input type="number" value={r.amountEdit}
                              onChange={e=>setAmt(r.id,e.target.value)}
                              placeholder="금액 입력"
                              style={{width:"76px",border:"none",background:"transparent",
                                fontSize:"12px",fontWeight:700,
                                color:parseInt(r.amountEdit)>0?C.ink:"#b5451b",
                                outline:"none",fontFamily:"'DM Serif Display',serif"}}/>
                          </div>
                          <span style={{fontSize:"9px",fontWeight:700,
                            background:ent.color+"18",color:ent.color,
                            borderRadius:"4px",padding:"2px 6px",
                            border:`1px solid ${ent.color}30`}}>{ent.label}</span>
                        </div>
                      </div>
                      {/* 주체 탭 */}
                      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",
                        borderTop:`1px solid ${C.border}`}}>
                        {IMPORT_KEYS.map((ek,i)=>{
                          const e=IMPORT_ENTS[ek]; const sel=r.entity===ek;
                          return(
                            <button key={ek} onClick={()=>setEnt(r.id,ek)} style={{
                              padding:"7px 2px",border:"none",cursor:"pointer",
                              borderRight:i<3?`1px solid ${C.border}`:"none",
                              background:sel?e.color:"transparent",
                              color:sel?"#fff":C.inkLight,
                              fontSize:"10px",fontWeight:sel?700:400,
                              transition:"all 0.15s",fontFamily:"'DM Sans',sans-serif"}}>
                              {e.label}
                            </button>
                          );
                        })}
                      </div>
                      {parseInt(r.amountEdit)>0&&(
                        <button onClick={()=>markDone(r.id)} style={{
                          width:"100%",padding:"8px",border:"none",
                          borderTop:`1px solid ${C.border}`,
                          background:ent.color+"0e",cursor:"pointer",
                          color:ent.color,fontSize:"11px",fontWeight:600,
                          display:"flex",alignItems:"center",justifyContent:"center",gap:"4px",
                          fontFamily:"'DM Sans',sans-serif"}}>
                          <Check size={11}/> {ent.label} 지출로 등록
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 건너뜀 */}
          {pending.filter(r=>r.entity==="skip").length>0&&(
            <div style={{marginBottom:"16px"}}>
              <SLabel>건너뜀 ({pending.filter(r=>r.entity==="skip").length}건)</SLabel>
              <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                {pending.filter(r=>r.entity==="skip").map(r=>(
                  <div key={r.id} style={{background:C.white,borderRadius:"10px",
                    padding:"9px 12px",border:`1px solid ${C.border}`,
                    opacity:0.55,display:"flex",alignItems:"center",gap:"9px"}}>
                    <div style={{flex:1,fontSize:"12px",color:C.mid,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                    <button onClick={()=>setEnt(r.id,"personal")} style={{
                      background:"none",border:`1px solid ${C.border}`,borderRadius:"6px",
                      padding:"3px 8px",cursor:"pointer",fontSize:"10px",color:C.inkLight,
                      fontFamily:"'DM Sans',sans-serif",flexShrink:0}}>되돌리기</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 등록 완료 */}
          {done.length>0&&(
            <div style={{marginBottom:"16px"}}>
              <SLabel>등록 완료 ({done.length}건)</SLabel>
              <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                {done.map(r=>{
                  const ent=IMPORT_ENTS[r.entity];
                  return(
                    <div key={r.id} style={{background:C.white,borderRadius:"10px",
                      padding:"9px 12px",border:`1px solid ${C.border}`,
                      opacity:0.6,display:"flex",alignItems:"center",gap:"9px"}}>
                      <div style={{width:"17px",height:"17px",borderRadius:"50%",flexShrink:0,
                        background:"#2d6a4f",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <Check size={10} color="#fff"/>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:"12px",fontWeight:500,color:C.mid,
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                        <div style={{fontSize:"10px",color:C.inkLight,marginTop:"1px"}}>
                          {r.date} · <span style={{color:ent.color,fontWeight:600}}>{ent.label}</span>
                        </div>
                      </div>
                      <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"13px",color:C.mid,flexShrink:0}}>
                        -{(parseInt(r.amountEdit)||0).toLocaleString("ko-KR")}원
                      </div>
                      <button onClick={()=>undoDone(r.id)} style={{background:"none",border:"none",
                        cursor:"pointer",color:C.border,padding:"3px",display:"flex",transition:"color 0.15s"}}
                        onMouseEnter={e=>e.currentTarget.style.color="#b5451b"}
                        onMouseLeave={e=>e.currentTarget.style.color=C.border}>
                        <X size={12}/>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {pending.filter(r=>r.entity!=="skip").length===0&&done.length>0&&(
            <div style={{textAlign:"center",padding:"24px",background:"#f0fdf4",
              borderRadius:"16px",border:"1px solid #b7e4c7"}}>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"18px",color:"#2d6a4f",marginBottom:"4px"}}>
                모두 처리했어요
              </div>
              <div style={{fontSize:"11px",color:"#2d6a4f",opacity:0.7}}>
                {done.length}건 · -{done.reduce((s,r)=>s+(parseInt(r.amountEdit)||0),0).toLocaleString("ko-KR")}원
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Supplies View (앤딩 전용) ── */
const SUPPLY_CATS = ["음료재료","소모품","청소","사무용품","비품","기타"];

function SuppliesView({ supplies, onChange }){
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  const [modal, setModal] = useState(null);  // null | "add" | {supply}
  const [form, setForm] = useState({ name:"", category:"소모품", cycle_days:"", last_bought:todayStr, memo:"" });
  const [saving, setSaving] = useState(false);

  // 날짜 계산 헬퍼
  const daysDiff = (dateStr) => {
    const d = new Date(dateStr);
    return Math.round((today - d) / 86400000);
  };
  const nextBuy = (s) => {
    const d = new Date(s.last_bought);
    d.setDate(d.getDate() + s.cycle_days);
    return d.toISOString().slice(0,10);
  };
  const daysUntil = (s) => {
    const next = new Date(nextBuy(s));
    return Math.round((next - today) / 86400000);
  };

  // 상태별 정렬: 초과 → 임박(3일) → 여유
  const sorted = useMemo(() => [...supplies].sort((a,b) => daysUntil(a) - daysUntil(b)), [supplies]);

  const getStatus = (s) => {
    const d = daysUntil(s);
    if (d < 0)  return { label:"구매 필요", color:"#b5451b", bg:"#fff8f0", border:"#f4c5b2", icon:<AlertTriangle size={11}/> };
    if (d <= 3) return { label:`${d}일 후`, color:"#b8860b", bg:"#fffbf0", border:"#f0d080", icon:<Clock size={11}/> };
    return        { label:`${d}일 후`, color:"#2d6a4f", bg:"#f0fdf4", border:"#b7e4c7", icon:<Package size={11}/> };
  };

  async function handleBought(s){
    setSaving(true);
    const updated = { ...s, last_bought: todayStr };
    await onChange(updated, "update");
    setSaving(false);
  }

  async function handleAdd(){
    if(!form.name.trim()||!form.cycle_days) return;
    const s = { id:"s"+Date.now(), name:form.name.trim(), category:form.category,
      cycle_days:parseInt(form.cycle_days), last_bought:form.last_bought, memo:form.memo.trim() };
    setSaving(true);
    await onChange(s, "add");
    setSaving(false);
    setModal(null);
    setForm({ name:"", category:"소모품", cycle_days:"", last_bought:todayStr, memo:"" });
  }

  async function handleEdit(){
    const s = { ...modal, name:form.name.trim(), category:form.category,
      cycle_days:parseInt(form.cycle_days), last_bought:form.last_bought, memo:form.memo.trim() };
    setSaving(true);
    await onChange(s, "update");
    setSaving(false);
    setModal(null);
  }

  async function handleDelete(id){
    setSaving(true);
    await onChange({ id }, "delete");
    setSaving(false);
    setModal(null);
  }

  function openEdit(s){
    setForm({ name:s.name, category:s.category, cycle_days:String(s.cycle_days), last_bought:s.last_bought, memo:s.memo||"" });
    setModal(s);
  }

  const needAction = sorted.filter(s => daysUntil(s) <= 3);

  const FormContent = ({ isEdit }) => (
    <div style={{fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"20px"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:"8px"}}>
          <span style={{fontFamily:"'DM Serif Display',serif",fontSize:"20px",color:C.ink}}>
            {isEdit?"소모품 수정":"소모품 추가"}
          </span>
        </div>
        {isEdit&&(
          <button onClick={()=>handleDelete(modal.id)} style={{display:"flex",alignItems:"center",gap:"5px",
            background:"#fff1ee",border:"1px solid #f4c5b2",borderRadius:"8px",
            padding:"6px 12px",cursor:"pointer",color:"#b5451b",fontSize:"12px",fontWeight:600}}>
            <Trash2 size={13}/> 삭제
          </button>
        )}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:"14px",marginBottom:"20px"}}>
        <div>
          <SLabel>이름</SLabel>
          <Inp value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="예: 원두, 컵, 청소용품"/>
        </div>
        <div>
          <SLabel>카테고리</SLabel>
          <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
            {SUPPLY_CATS.map(c=>(
              <button key={c} onClick={()=>setForm(p=>({...p,category:c}))} style={{
                padding:"5px 12px",borderRadius:"99px",cursor:"pointer",fontSize:"12px",fontWeight:500,
                border:`1.5px solid ${form.category===c?"#2d6a4f":C.border}`,
                background:form.category===c?"#2d6a4f14":"#fff",
                color:form.category===c?"#2d6a4f":C.inkMid,fontFamily:"'DM Sans',sans-serif"}}>{c}</button>
            ))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
          <div>
            <SLabel>평균 소진 주기 (일)</SLabel>
            <div style={{display:"flex",alignItems:"center",border:`1.5px solid ${C.border}`,borderRadius:"10px",background:C.white,padding:"0 12px"}}>
              <input type="number" value={form.cycle_days} onChange={e=>setForm(p=>({...p,cycle_days:e.target.value}))}
                placeholder="14" min="1"
                style={{flex:1,border:"none",background:"transparent",fontSize:"16px",fontWeight:700,
                  color:C.ink,padding:"10px 0",outline:"none",fontFamily:"'DM Serif Display',serif"}}/>
              <span style={{fontSize:"12px",color:C.inkLight}}>일</span>
            </div>
          </div>
          <div>
            <SLabel>마지막 구매일</SLabel>
            <Inp type="date" value={form.last_bought} onChange={e=>setForm(p=>({...p,last_bought:e.target.value}))}/>
          </div>
        </div>
        <div>
          <SLabel>메모 (선택)</SLabel>
          <Inp value={form.memo} onChange={e=>setForm(p=>({...p,memo:e.target.value}))} placeholder="구매처, 수량 등"/>
        </div>
      </div>

      <button onClick={isEdit?handleEdit:handleAdd} disabled={saving} style={{
        width:"100%",padding:"14px",background:saving?"#9c8e82":"#2d6a4f",color:"#fff",border:"none",
        borderRadius:"13px",fontSize:"15px",fontWeight:600,cursor:saving?"not-allowed":"pointer",
        display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",
        fontFamily:"'DM Sans',sans-serif",boxShadow:"0 4px 18px #2d6a4f55"}}>
        {saving?<><RefreshCw size={15} className="spin"/> 저장 중...</>
          :isEdit?<><Check size={15}/> 저장하기</>:<><Plus size={15}/> 추가하기</>}
      </button>
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>

      {/* 액션 헤더 */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"18px",color:C.ink}}>소모품 관리</div>
          <div style={{fontSize:"11px",color:C.inkLight,marginTop:"2px",fontFamily:"'DM Sans',sans-serif"}}>
            앤딩스터디카페 재고 주기 트래커
          </div>
        </div>
        <button onClick={()=>{
          setForm({name:"",category:"소모품",cycle_days:"",last_bought:todayStr,memo:""});
          setModal("add");
        }} style={{
          background:"#2d6a4f",border:"none",borderRadius:"10px",padding:"9px 14px",
          color:"#fff",fontSize:"12px",fontWeight:600,cursor:"pointer",
          display:"flex",alignItems:"center",gap:"5px",fontFamily:"'DM Sans',sans-serif",
          boxShadow:"0 3px 10px #2d6a4f44"}}>
          <Plus size={13}/> 추가
        </button>
      </div>

      {/* 알림 배너 */}
      {needAction.length>0&&(
        <div style={{background:"#fff8f0",borderRadius:"14px",padding:"14px 16px",
          border:"1px solid #f4c5b2",display:"flex",alignItems:"center",gap:"10px"}}>
          <AlertTriangle size={16} color="#b5451b"/>
          <div style={{flex:1}}>
            <div style={{fontSize:"12px",fontWeight:700,color:"#b5451b",fontFamily:"'DM Sans',sans-serif"}}>
              {needAction.filter(s=>daysUntil(s)<0).length>0
                ? `${needAction.filter(s=>daysUntil(s)<0).length}개 구매 필요 · ${needAction.filter(s=>daysUntil(s)>=0).length>0?`${needAction.filter(s=>daysUntil(s)>=0).length}개 임박`:""}`
                : `${needAction.length}개 구매 임박`}
            </div>
            <div style={{fontSize:"11px",color:"#b5451b",opacity:0.7,marginTop:"2px",fontFamily:"'DM Sans',sans-serif"}}>
              {needAction.map(s=>s.name).join(", ")}
            </div>
          </div>
        </div>
      )}

      {/* 소모품 카드 목록 */}
      {sorted.length===0
        ?<div style={{textAlign:"center",padding:"48px 20px",background:C.white,
            borderRadius:"20px",border:`1px solid ${C.border}`}}>
          <div style={{fontSize:"34px",marginBottom:"12px",opacity:0.3}}>📦</div>
          <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"17px",color:C.inkMid,marginBottom:"4px"}}>소모품이 없어요</div>
          <div style={{fontSize:"12px",color:C.inkLight}}>추가 버튼으로 소모품을 등록해보세요</div>
        </div>
        :sorted.map(s=>{
          const st = getStatus(s);
          const progress = Math.min(100, Math.max(0, (daysDiff(s.last_bought) / s.cycle_days) * 100));
          const next = nextBuy(s);
          return(
            <div key={s.id} style={{background:C.white,borderRadius:"16px",padding:"14px 16px",
              border:`1px solid ${st.border}`,boxShadow:"0 1px 6px rgba(0,0,0,0.04)"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:"12px",marginBottom:"12px"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"3px"}}>
                    <span style={{fontSize:"14px",fontWeight:700,color:C.ink,fontFamily:"'DM Sans',sans-serif"}}>{s.name}</span>
                    <span style={{fontSize:"9px",background:st.bg,color:st.color,border:`1px solid ${st.border}`,
                      borderRadius:"4px",padding:"1px 6px",fontWeight:700,fontFamily:"'DM Sans',sans-serif",
                      display:"flex",alignItems:"center",gap:"3px"}}>
                      {st.icon}{st.label}
                    </span>
                  </div>
                  <div style={{fontSize:"11px",color:C.inkLight,fontFamily:"'DM Sans',sans-serif"}}>
                    {s.category} · 주기 {s.cycle_days}일 · 다음 구매 {next}
                  </div>
                  {s.memo&&<div style={{fontSize:"11px",color:C.inkLight,marginTop:"2px",fontFamily:"'DM Sans',sans-serif",fontStyle:"italic"}}>{s.memo}</div>}
                </div>
                <div style={{display:"flex",gap:"4px",flexShrink:0}}>
                  <button onClick={()=>openEdit(s)} style={{background:"none",border:"none",cursor:"pointer",
                    color:C.inkLight,padding:"4px",borderRadius:"6px",display:"flex"}}>
                    <Pencil size={13}/>
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{marginBottom:"10px"}}>
                <div style={{height:"6px",background:C.cream,borderRadius:"99px",overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:"99px",transition:"width 0.5s",
                    width:`${progress}%`,
                    background:progress>=100?"#b5451b":progress>=80?"#b8860b":"#2d6a4f"}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:"4px"}}>
                  <span style={{fontSize:"9px",color:C.inkLight,fontFamily:"'DM Sans',sans-serif"}}>
                    구매 후 {daysDiff(s.last_bought)}일 경과
                  </span>
                  <span style={{fontSize:"9px",color:C.inkLight,fontFamily:"'DM Sans',sans-serif"}}>
                    주기 {s.cycle_days}일
                  </span>
                </div>
              </div>

              {/* 구매 완료 버튼 */}
              <button onClick={()=>handleBought(s)} disabled={saving} style={{
                width:"100%",padding:"9px",background:st.bg,
                border:`1.5px solid ${st.border}`,borderRadius:"10px",
                color:st.color,fontSize:"12px",fontWeight:700,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",gap:"6px",
                fontFamily:"'DM Sans',sans-serif",transition:"all 0.2s"}}
                onMouseEnter={e=>e.currentTarget.style.background=st.color+"18"}
                onMouseLeave={e=>e.currentTarget.style.background=st.bg}>
                <ShoppingCart size={13}/> 오늘 구매 완료
              </button>
            </div>
          );
        })
      }

      {/* 모달 */}
      <Modal open={!!modal} onClose={()=>setModal(null)}>
        {modal==="add"?<FormContent isEdit={false}/>
          :modal?<FormContent isEdit={true}/>:null}
      </Modal>
    </div>
  );
}

/* ── Theme Picker ── */
function ThemePicker({ current, onChange }) {
  return (
    <div style={{fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:"8px",marginBottom:"22px"}}>
        <span style={{fontFamily:"'DM Serif Display',serif",fontSize:"21px",color:C.ink}}>테마</span>
        <span style={{fontSize:"11px",color:C.inkLight}}>Theme</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"10px"}}>
        {Object.entries(THEMES).map(([key,t])=>{
          const sel = current===key;
          return (
            <button key={key} onClick={()=>onChange(key)} style={{
              padding:"16px 14px",borderRadius:"16px",cursor:"pointer",
              border:`2px solid ${sel?t.headerSolid:C.border}`,
              background:sel?t.headerSolid+"14":C.white,
              display:"flex",alignItems:"center",gap:"12px",
              transition:"all 0.18s",
              boxShadow:sel?`0 4px 16px ${t.headerSolid}33`:"none",
              fontFamily:"'DM Sans',sans-serif",
            }}>
              {/* 미니 프리뷰 */}
              <div style={{width:"36px",height:"36px",borderRadius:"10px",flexShrink:0,
                background:t.header,position:"relative",overflow:"hidden",
                boxShadow:`0 2px 8px ${t.headerSolid}44`}}>
                <div style={{position:"absolute",bottom:0,left:0,right:0,height:"14px",
                  background:t.paper,borderRadius:"4px 4px 0 0"}}/>
                <div style={{position:"absolute",bottom:"3px",left:"4px",right:"4px",height:"4px",
                  background:t.border,borderRadius:"2px"}}/>
              </div>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:"13px",fontWeight:700,
                  color:sel?t.headerSolid:C.ink,marginBottom:"2px"}}>{t.emoji} {t.label}</div>
                <div style={{display:"flex",gap:"4px"}}>
                  {[t.headerSolid,t.ink,t.cream,t.border].map((col,i)=>(
                    <div key={i} style={{width:"10px",height:"10px",borderRadius:"50%",
                      background:col,border:`1px solid ${C.border}`}}/>
                  ))}
                </div>
              </div>
              {sel&&(
                <div style={{marginLeft:"auto",flexShrink:0,width:"18px",height:"18px",
                  borderRadius:"50%",background:t.headerSolid,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <Check size={11} color="#fff"/>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main ── */
export default function App(){
  const now=new Date();
  const [year,  setYear]  =useState(now.getFullYear());
  const [month, setMonth] =useState(now.getMonth());
  const [entity,setEntity]=useState("personal");
  const [tab,   setTab]   =useState("list");
  const [modal, setModal] =useState(null);
  const [editTx,setEditTx]=useState(null);
  const [txs,   setTxs]   =useState([]);
  const [cards, setCards] =useState(DEFAULT_CARDS);
  const [supplies, setSupplies] = useState([]);
  const [loading,setLoading]=useState(false);
  const [saving, setSaving] =useState(false);
  const [online, setOnline] =useState(isConfigured());
  const [themeKey, setThemeKey] = useState(()=>localStorage.getItem(THEME_KEY)||"cream");

  // C를 현재 테마로 동기화
  C = THEMES[themeKey] || THEMES.cream;

  function changeTheme(key){
    setThemeKey(key);
    C = THEMES[key] || THEMES.cream;
    localStorage.setItem(THEME_KEY, key);
  }

  /* ── DB 로드 ── */
  const fetchAll = useCallback(async()=>{
    if(!isConfigured())return;
    setLoading(true);
    try{
      const [rows, cardRows, supplyRows] = await Promise.all([
        sb("transactions?select=*&order=date.desc"),
        sb("cards?select=*&order=sort_order.asc"),
        sb("supplies?select=*&order=created_at.asc"),
      ]);
      setTxs(rows.map(rowToTx));
      if(cardRows.length) setCards(cardRows.map(rowToCard));
      setSupplies(supplyRows);
      setOnline(true);
    }catch(e){
      console.error(e);
      setOnline(false);
    }finally{setLoading(false);}
  },[]);

  useEffect(()=>{fetchAll();},[fetchAll]);

  /* ── TX CRUD ── */
  async function addTx(tx){
    setSaving(true);
    try{
      const [row]=await sb("transactions",{method:"POST",body:JSON.stringify(txToRow(tx))});
      setTxs(p=>[rowToTx(row),...p]);
    }catch(e){console.error(e);}
    finally{setSaving(false);setModal(null);}
  }
  async function updateTx(tx){
    setSaving(true);
    try{
      await sb(`transactions?id=eq.${tx.id}`,{method:"PATCH",body:JSON.stringify(txToRow(tx)),prefer:"return=minimal"});
      setTxs(p=>p.map(t=>t.id===tx.id?tx:t));
    }catch(e){console.error(e);}
    finally{setSaving(false);setModal(null);setEditTx(null);}
  }
  async function deleteTx(id){
    setSaving(true);
    try{
      await sb(`transactions?id=eq.${id}`,{method:"DELETE",prefer:"return=minimal"});
      setTxs(p=>p.filter(t=>t.id!==id));
    }catch(e){console.error(e);}
    finally{setSaving(false);setModal(null);setEditTx(null);}
  }

  /* ── Supply CRUD ── */
  async function handleSupplies(payload, op){
    try{
      if(op==="add"){
        const [row]=await sb("supplies",{method:"POST",body:JSON.stringify(payload)});
        setSupplies(p=>[...p,row]);
      }
      if(op==="update"){
        await sb(`supplies?id=eq.${payload.id}`,{method:"PATCH",body:JSON.stringify(payload),prefer:"return=minimal"});
        setSupplies(p=>p.map(s=>s.id===payload.id?{...s,...payload}:s));
      }
      if(op==="delete"){
        await sb(`supplies?id=eq.${payload.id}`,{method:"DELETE",prefer:"return=minimal"});
        setSupplies(p=>p.filter(s=>s.id!==payload.id));
      }
    }catch(e){console.error(e);}
  }

  /* ── Card CRUD ── */
  async function handleCards(updated, op, payload){
    setCards(updated);
    try{
      if(op==="add")    await sb("cards",{method:"POST",body:JSON.stringify(cardToRow(payload))});
      if(op==="del")    await sb(`cards?id=eq.${payload.id}`,{method:"DELETE",prefer:"return=minimal"});
      if(op==="update") await sb(`cards?id=eq.${payload.id}`,{method:"PATCH",body:JSON.stringify({name:payload.name}),prefer:"return=minimal"});
    }catch(e){console.error(e);}
  }

  const monthKey=`${year}-${String(month+1).padStart(2,"0")}`;
  const viewTxs=useMemo(()=>txs.filter(t=>t.date.startsWith(monthKey)&&t.entity===entity),[txs,monthKey,entity]);
  const income =useMemo(()=>viewTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),[viewTxs]);
  const expense=useMemo(()=>viewTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[viewTxs]);
  const bal=income-expense;
  const ent=ENTITIES[entity];

  function prevMonth(){if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);}
  function nextMonth(){if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);}

  return(
    <div style={{minHeight:"100vh",background:C.cream,paddingBottom:"48px"}}>

      {/* Header */}
      <div style={{background:C.header,padding:"26px 20px 0",color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:"-40px",right:"-40px",width:"160px",height:"160px",borderRadius:"50%",background:"rgba(255,255,255,0.03)"}}/>
        <div style={{maxWidth:"540px",margin:"0 auto",position:"relative"}}>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"20px"}}>
            <div>
              <div style={{fontSize:"9px",fontWeight:700,opacity:0.35,letterSpacing:"0.2em",marginBottom:"4px",fontFamily:"'DM Sans',sans-serif"}}>HOUSEHOLD BUDGET</div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"25px",letterSpacing:"-0.5px",lineHeight:1}}>가계부</div>
              <div style={{display:"flex",alignItems:"center",gap:"5px",marginTop:"4px"}}>
                {online
                  ?<><Wifi size={10} color="rgba(255,255,255,0.4)"/><span style={{fontSize:"10px",opacity:0.4,fontFamily:"'DM Sans',sans-serif"}}>Supabase 연결됨</span></>
                  :!isConfigured()
                    ?<><WifiOff size={10} color="rgba(255,255,255,0.3)"/><span style={{fontSize:"10px",opacity:0.3,fontFamily:"'DM Sans',sans-serif"}}>로컬 모드</span></>
                    :<><WifiOff size={10} color="#e07a5f"/><span style={{fontSize:"10px",color:"#e07a5f",fontFamily:"'DM Sans',sans-serif"}}>연결 오류</span></>
                }
              </div>
            </div>
            <div style={{display:"flex",gap:"6px"}}>
              <button onClick={fetchAll} disabled={loading} style={{
                background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",
                borderRadius:"10px",padding:"9px",color:"rgba(255,255,255,0.6)",cursor:"pointer",display:"flex"}}>
                <RefreshCw size={14} className={loading?"spin":""}/>
              </button>
              <button onClick={()=>setModal("import")} style={{
                background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",
                borderRadius:"10px",padding:"9px",color:"rgba(255,255,255,0.6)",cursor:"pointer",display:"flex"}}
                title="쿠팡 메일 가져오기">
                <Mail size={14}/>
              </button>
              <button onClick={()=>setModal("theme")} title="테마 변경" style={{
                background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",
                borderRadius:"10px",padding:"7px 10px",color:"rgba(255,255,255,0.6)",
                cursor:"pointer",display:"flex",alignItems:"center",
                fontSize:"13px",lineHeight:1}}>
                {THEMES[themeKey].emoji}
              </button>
              <button onClick={()=>setModal("cards")} style={{
                background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",
                borderRadius:"10px",padding:"9px",color:"rgba(255,255,255,0.6)",cursor:"pointer",display:"flex"}}>
                <CreditCard size={14}/>
              </button>
              <button onClick={()=>setModal("add")} style={{
                background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",
                borderRadius:"10px",padding:"9px 16px",color:"#fff",fontSize:"13px",fontWeight:600,
                cursor:"pointer",display:"flex",alignItems:"center",gap:"6px",fontFamily:"'DM Sans',sans-serif"}}>
                <PlusCircle size={14}/> 추가
              </button>
            </div>
          </div>

          {/* Entity tabs */}
          <div style={{display:"flex",gap:"5px",marginBottom:"18px"}}>
            {ENTITY_KEYS.map(ek=>{
              const e=ENTITIES[ek];const sel=entity===ek;
              return(
                <button key={ek} onClick={()=>{setEntity(ek);setTab("list");}} style={{
                  flex:1,padding:"9px 4px",borderRadius:"10px",cursor:"pointer",border:"none",
                  background:sel?e.color:"rgba(255,255,255,0.07)",
                  color:sel?"#fff":"rgba(255,255,255,0.45)",
                  fontFamily:"'DM Sans',sans-serif",fontSize:"11px",fontWeight:sel?700:400,
                  transition:"all 0.2s",boxShadow:sel?`0 3px 12px ${e.color}66`:"none"}}>
                  <div style={{lineHeight:1.3,padding:"1px 0"}}>{e.label}</div>
                </button>
              );
            })}
          </div>

          {/* Month nav */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"16px",marginBottom:"20px"}}>
            <button onClick={prevMonth} style={{background:"rgba(255,255,255,0.07)",border:"none",borderRadius:"8px",padding:"7px",color:"rgba(255,255,255,0.45)",cursor:"pointer",display:"flex"}}>
              <ChevronLeft size={17}/>
            </button>
            <div style={{textAlign:"center",minWidth:"120px"}}>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"20px",letterSpacing:"-0.3px"}}>{MONTHS[month]} {year}</div>
              <div style={{fontSize:"10px",opacity:0.35,fontFamily:"'DM Sans',sans-serif",marginTop:"1px"}}>{year}년 {MONTHS_KO[month]}</div>
            </div>
            <button onClick={nextMonth} style={{background:"rgba(255,255,255,0.07)",border:"none",borderRadius:"8px",padding:"7px",color:"rgba(255,255,255,0.45)",cursor:"pointer",display:"flex"}}>
              <ChevronRight size={17}/>
            </button>
          </div>

          {/* Balance */}
          <div style={{background:C.paper,borderRadius:"20px 20px 0 0",padding:"18px 22px",
            border:`1px solid ${C.border}`,borderBottom:"none",
            display:"grid",gridTemplateColumns:"1fr 1px 1fr 1px 1fr",alignItems:"center"}}>
            {[
              {label:"수입",val:income,color:"#2d6a4f",sign:"+"},
              null,
              {label:"지출",val:expense,color:"#b5451b",sign:"-"},
              null,
              {label:"잔액",val:bal,color:bal>=0?"#1d4e89":"#831843",sign:bal>=0?"+":""},
            ].map((item,i)=>item===null
              ?<div key={i} style={{background:C.border,height:"32px",width:"1px"}}/>
              :<div key={i} style={{textAlign:"center"}}>
                <div style={{fontSize:"9px",fontWeight:700,color:C.inkLight,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:"5px",fontFamily:"'DM Sans',sans-serif"}}>{item.label}</div>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"16px",color:item.color,letterSpacing:"-0.3px"}}>{item.sign}{fmtS(item.val)}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{maxWidth:"540px",margin:"0 auto",padding:"0 14px 16px",
        background:C.paper,borderLeft:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`}}>

        {!isConfigured()&&<SetupGuide/>}

        <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,marginBottom:"16px"}}>
          {[["list","내역"],["stats","통계"],["fixed","고정지출"],
            ...(entity==="cafe"?[["supplies","소모품"]]:[])
          ].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{
              flex:1,padding:"12px 10px",border:"none",background:"transparent",cursor:"pointer",
              fontWeight:tab===k?700:400,fontSize:"13px",
              color:tab===k?C.ink:C.inkLight,
              borderBottom:`2px solid ${tab===k?ent.color:"transparent"}`,
              marginBottom:"-1px",fontFamily:"'DM Sans',sans-serif",transition:"all 0.2s"}}>{l}</button>
          ))}
        </div>

        {loading
          ?<div style={{textAlign:"center",padding:"48px",color:C.inkLight,fontFamily:"'DM Sans',sans-serif",fontSize:"13px"}}>
            <RefreshCw size={20} className="spin" style={{marginBottom:"8px",display:"block",margin:"0 auto 10px"}}/> 불러오는 중...
          </div>
          :<div className="fade-in" key={entity+tab}>
            {tab==="list"?<TreeView txs={viewTxs} onEdit={tx=>{setEditTx(tx);setModal("edit");}} entity={entity} cards={cards}/>
             :tab==="stats"?<StatsView txs={viewTxs} entity={entity} cards={cards}/>
             :tab==="supplies"?<SuppliesView supplies={supplies} onChange={handleSupplies}/>
             :<FixedView txs={txs} onDelete={deleteTx} year={year} month={month}/>}
          </div>
        }
      </div>

      <Modal open={modal==="add"} onClose={()=>setModal(null)}>
        <TxForm onSave={addTx} cards={cards} defaultEntity={entity} saving={saving}/>
      </Modal>
      <Modal open={modal==="edit"&&!!editTx} onClose={()=>{setModal(null);setEditTx(null);}}>
        {editTx&&<TxForm initial={editTx} onSave={updateTx} onDelete={()=>deleteTx(editTx.id)} cards={cards} defaultEntity={entity} saving={saving}/>}
      </Modal>
      <Modal open={modal==="cards"} onClose={()=>setModal(null)}>
        <CardSettings cards={cards} onChange={handleCards}/>
      </Modal>
      <Modal open={modal==="import"} onClose={()=>setModal(null)}>
        <CoupangImport onRegister={tx=>{ const n=[...txs,tx]; setTxs(n); save(TX_KEY,n); if(isConfigured()) sb("transactions",{method:"POST",body:JSON.stringify(txToRow(tx))}).catch(console.error); }}/>
      </Modal>
      <Modal open={modal==="theme"} onClose={()=>setModal(null)}>
        <ThemePicker current={themeKey} onChange={k=>{changeTheme(k);setModal(null);}}/>
      </Modal>
    </div>
  );
}
