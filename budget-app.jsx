import { useState, useMemo, useEffect, useCallback } from "react";
import { PlusCircle, ChevronLeft, ChevronRight, Trash2, CreditCard, Pencil, Check, Plus, RefreshCw, Wifi, WifiOff, Package, ShoppingCart, AlertTriangle, Clock, Mail, AlertCircle, X } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

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
FONT_LINK.href = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap";
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
    급여:[],부업:[],임대료:[],카드캐시백:[],보험금:[],연말정산:[],환급:[],
    외화매도:[],"중고거래/당근":[],"호텔 배당금":[],컨커:[],"대출이자-무이자":[],기타:[],
  }},
  "저축/투자고정":{ color:"#1d4e89",accent:"#4a90d9",icon:"💙",children:{개인형irp:[],연금저축펀드:[],적금:[],주택청약:[]}},
  "저축/투자유동":{ color:"#0077b6",accent:"#48cae4",icon:"🩵",children:{ESPP:[],주식투자:[],"청약수수료(카드)":[]}},
  "지출-고정비":{ color:"#b5451b",accent:"#e07a5f",icon:"🔶",children:{
    생활:["관리비","월세/전세이자","인터넷사용료","통신비","휴대폰장기할부","자동차보험","자동차할부","보험-나","보험-엄마","기타"],
    원금상환:["대출원금-보험대출","대출원금-신용","대출원금-전세","대출원금-주택","대출원금-호텔"],
    이자:["대출이자-신용","대출이자-주택","대출이자-호텔","대출이자-회사대출","보험약관대출","부대비용-호텔","기타"],
    기타:[],
  }},
  "지출-세금":{ color:"#7b2d00",accent:"#c1440e",icon:"🔴",children:{국세:[],등록세:[],부가가치세:[],주민세:[],기타:[]}},
  "지출-용돈":{ color:"#4a1942",accent:"#9b5de5",icon:"💜",children:{
    쇼핑:["의류","운동복/장비","운동화","속옷","가전/전자기기","생활용품","식재료","영양제","액세서리","기타"],
    식비:["외식","배달/포장","카페/커피","간식","빵/샐러드","술","과일","원두","편의점","기타"],
    교통비:["대중교통","택시","주유비","주차비","하이패스","세차","세차용품","차량용품","공항버스","시외","과태료","범칙금","기타"],
    건강:["병원비","약","마사지","운동","영양제","마스크","기타"],
    "취미/교육":["강의","수강료","책","영화","공연","전시","영상","영어","뜨개질","체험","기타"],
    미용:[],
    가족:["엄마","엄마쇼핑","엄마용돈","엄마장보기","조카","기타"],
    선물:[],
    정기결제:["ChatGPT","애플","넷플릭스","유튜브","네이버","쿠팡","토스프라임","요기요","컬리멤버스","SSG","롯데","소수의견","모부","복닥방이선생","기타"],
    경조사:[],"중고거래/당근":[],기타:[],
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
  수입:{ color:"#2d6a4f",accent:"#52b788",icon:"💰",children:{매도가:[],임대수입:[],기타:[]}},
  취득비용:{ color:"#b5451b",accent:"#e07a5f",icon:"🏠",children:{취득가:[],취득세:[],등기비:[],중개수수료:[],기타:[]}},
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
        background:C.paper,borderRadius:"24px 24px 0 0",padding:"8px 20px 36px",
        width:"100%",maxWidth:"clamp(320px,100%,660px)",maxHeight:"78vh",overflowY:"auto",
        boxShadow:"0 -16px 60px rgba(0,0,0,0.2)",border:`1px solid ${C.border}`,borderBottom:"none"}}>
        <div style={{width:"36px",height:"3px",background:C.borderDark,borderRadius:"99px",
          margin:"10px auto 18px",cursor:"pointer"}} onClick={onClose}/>
        {children}
      </div>
    </div>
  );
}

const SLabel = ({children}) => (
  <div style={{fontSize:"9px",fontWeight:700,letterSpacing:"0.14em",color:C.inkLight,
    textTransform:"uppercase",marginBottom:"10px",fontFamily:"'Inter',sans-serif"}}>{children}</div>
);
const Inp = ({style,...p}) => (
  <input style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:"10px",
    padding:"10px 13px",fontSize:"14px",color:C.ink,outline:"none",
    background:C.white,boxSizing:"border-box",fontFamily:"'Inter',sans-serif",...style}} {...p}/>
);

/* ── Setup Guide ── */
function SetupGuide(){
  return(
    <div style={{background:C.white,borderRadius:"20px",padding:"24px",border:`1px solid ${C.border}`,margin:"16px 0"}}>
      <div style={{fontFamily:"'Inter',sans-serif",fontSize:"18px",color:C.ink,marginBottom:"6px"}}>Supabase 연동 필요</div>
      <div style={{fontSize:"12px",color:C.inkLight,marginBottom:"20px",fontFamily:"'Inter',sans-serif"}}>아래 순서대로 설정하면 폰+PC 어디서나 데이터가 동기화돼요</div>
      {[
        ["1","supabase.com 접속 후 무료 계정 생성 및 새 프로젝트 생성"],
        ["2","SQL Editor에서 supabase_setup.sql 파일 내용 전체 실행"],
        ["3","Settings → API에서 Project URL과 anon public key 복사"],
        ["4","이 파일 상단 SUPABASE_URL, SUPABASE_ANON 값 교체 후 저장"],
      ].map(([n,t])=>(
        <div key={n} style={{display:"flex",gap:"12px",marginBottom:"14px",alignItems:"flex-start"}}>
          <div style={{width:"24px",height:"24px",borderRadius:"50%",background:C.ink,
            color:"#fff",fontSize:"11px",fontWeight:700,display:"flex",alignItems:"center",
            justifyContent:"center",flexShrink:0,fontFamily:"'Inter',sans-serif"}}>{n}</div>
          <div style={{fontSize:"13px",color:C.inkMid,fontFamily:"'Inter',sans-serif",lineHeight:1.5}}>{t}</div>
        </div>
      ))}
    </div>
  );
}

/* ── TxForm ── */
function TxForm({initial,onSave,onDelete,cards,defaultEntity="personal",saving,supplies=[]}){
  const today=new Date().toISOString().slice(0,10);
  const init=initial||{};
  const [entity,setEntity]=useState(init.entity||defaultEntity);
  const tree=TREES[entity];
  function deriveGroup(c1){
    if(!c1)return "지출";
    if(c1.startsWith("지출"))return "지출";
    if(c1.startsWith("저축"))return "저축";
    return "수입";
  }
  const initCat1=init.cat1||(entity==="personal"?"지출-용돈":Object.keys(TREES[entity])[0]);
  const [cat1,setCat1]=useState(initCat1);
  const [group,setGroup]=useState(deriveGroup(initCat1));
  const [cat2,setCat2]=useState(init.cat2||Object.keys(tree[initCat1]?.children||{})[0]||"");
  const [cat3,setCat3]=useState(init.cat3||"");
  const [amount,setAmount]=useState(init.amount?Number(init.amount).toLocaleString("ko-KR"):"");
  const [memo,setMemo]=useState(init.memo||"");
  const [date,setDate]=useState(init.date||today);
  const [cardId,setCardId]=useState(init.cardId||"");
  const [isFixed,setIsFixed]=useState(init.isFixed||false);
  const [fixedDay,setFixedDay]=useState(init.fixedDay||"");
  const [isSupply,setIsSupply]=useState(false);
  const [supplyName,setSupplyName]=useState("");
  const [supplyCat,setSupplyCat]=useState("소모품");
  const [supplyCycle,setSupplyCycle]=useState("");
  const [err,setErr]=useState(false);
  const isEdit=!!initial;
  const showSupplyToggle = entity==="cafe" && cat1==="매입/원가";

  function pickEntity(e){
    setEntity(e);
    const t=TREES[e];
    const k1=e==="personal"?"지출-용돈":Object.keys(t)[0];
    setCat1(k1);setGroup(deriveGroup(k1));setCat2(Object.keys(t[k1]?.children||{})[0]||"");setCat3("");
  }
  function pickGroup(g){
    setGroup(g);
    const k=g==="수입"?"수입":g==="저축"?"저축/투자고정":"지출-용돈";
    setCat1(k);setCat2(Object.keys(tree[k]?.children||{})[0]||"");setCat3("");
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
    const supplyData=isSupply&&showSupplyToggle
      ?{name:(supplyName.trim()||memo.trim()||cat2),category:supplyCat,cycle_days:parseInt(supplyCycle)||30,last_bought:date}
      :null;
    onSave({id:init.id||Date.now(),entity,cat1,cat2,cat3:cat3||"",
      amount:num,memo:memo.trim()||cat3||cat2,date,cardId,
      isFixed,fixedDay:isFixed&&fixedDay?parseInt(fixedDay):null,
      type:isIncome?"income":"expense",supplyData});
  }

  return(
    <div style={{fontFamily:"'Inter',sans-serif"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:"8px"}}>
          <span style={{fontFamily:"'Inter',sans-serif",fontSize:"18px",fontWeight:700,color:C.ink}}>{isEdit?"거래 수정":"거래 추가"}</span>
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
      <div style={{marginBottom:"10px"}}>
        <SLabel>주체</SLabel>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"6px"}}>
          {ENTITY_KEYS.map(ek=>{
            const e=ENTITIES[ek];const sel=entity===ek;
            return(
              <button key={ek} className="cat-btn" onClick={()=>pickEntity(ek)} style={{
                padding:"7px 6px",borderRadius:"10px",cursor:"pointer",
                border:`1.5px solid ${sel?e.color:C.border}`,
                background:sel?e.color:C.white,color:sel?"#fff":C.inkMid,
                fontFamily:"'Inter',sans-serif",transition:"all 0.18s",
                boxShadow:sel?`0 2px 8px ${e.color}44`:"none"}}>
                <div style={{fontSize:"11px",fontWeight:700,lineHeight:1.3}}>{e.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* CAT1 */}
      {entity==="personal"?(
        <>
          <div style={{marginBottom:"8px"}}>
            <SLabel>대분류</SLabel>
            <div style={{display:"flex",gap:"6px"}}>
              {[["수입","#2d6a4f"],["저축","#1d4e89"],["지출","#b5451b"]].map(([g,gc])=>{
                const sel=group===g;
                return(
                  <button key={g} className="cat-btn" onClick={()=>pickGroup(g)} style={{
                    flex:1,padding:"7px 6px",borderRadius:"10px",cursor:"pointer",
                    border:`1.5px solid ${sel?gc:C.border}`,
                    background:sel?gc:"#fff",color:sel?"#fff":C.inkMid,
                    fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"13px",
                    boxShadow:sel?`0 2px 8px ${gc}44`:"none"}}>
                    {g}
                  </button>
                );
              })}
            </div>
          </div>
          {group!=="수입"&&(
            <div style={{marginBottom:"8px"}}>
              <SLabel>세분류</SLabel>
              <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
                {(group==="지출"
                  ?[["고정비","지출-고정비"],["세금","지출-세금"],["용돈","지출-용돈"],["이벤트","지출-이벤트"]]
                  :[["고정","저축/투자고정"],["유동","저축/투자유동"]]
                ).map(([label,k])=>{
                  const v=tree[k]||{color:C.inkMid};const sel=cat1===k;
                  return(
                    <button key={k} className="cat-btn" onClick={()=>pickCat1(k)} style={{
                      padding:"5px 14px",borderRadius:"99px",cursor:"pointer",fontSize:"12px",fontWeight:600,
                      fontFamily:"'Inter',sans-serif",
                      border:`1.5px solid ${sel?v.color:C.border}`,
                      background:sel?v.color:"#fff",color:sel?"#fff":C.inkMid,
                      boxShadow:sel?`0 2px 8px ${v.color}44`:"none"}}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ):(
        <div style={{marginBottom:"14px"}}>
          <SLabel>대분류</SLabel>
          <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
            {Object.entries(tree).map(([k,v])=>(
              <button key={k} className="cat-btn" onClick={()=>pickCat1(k)} style={{
                padding:"5px 12px",borderRadius:"99px",cursor:"pointer",fontSize:"12px",fontWeight:600,
                fontFamily:"'Inter',sans-serif",
                border:`1.5px solid ${cat1===k?v.color:C.border}`,
                background:cat1===k?v.color:"#fff",color:cat1===k?"#fff":C.inkMid,
                boxShadow:cat1===k?`0 2px 8px ${v.color}44`:"none"}}>
                {k}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CAT2 */}
      {cat2keys.length>0&&(
        <div style={{marginBottom:"8px"}}>
          <SLabel>항목1</SLabel>
          <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
            {cat2keys.map(k=>(
              <button key={k} className="cat-btn" onClick={()=>{setCat2(k);setCat3("");}} style={{
                padding:"5px 12px",borderRadius:"99px",cursor:"pointer",fontSize:"12px",fontWeight:500,
                fontFamily:"'Inter',sans-serif",
                border:`1.5px solid ${cat2===k?m1.color:C.border}`,
                background:cat2===k?m1.color+"14":"#fff",color:cat2===k?m1.color:C.inkMid}}>
                {k}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CAT3 */}
      {entity==="realty"?(
        <div style={{marginBottom:"8px"}}>
          <SLabel>물건 태그</SLabel>
          <Inp value={cat3} onChange={e=>setCat3(e.target.value)} placeholder="예: 노원 아파트, 성북 빌라"/>
        </div>
      ):cat3list.length>0&&(
        <div style={{marginBottom:"8px"}}>
          <SLabel>항목2</SLabel>
          <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
            {cat3list.map(k=>(
              <button key={k} className="cat-btn" onClick={()=>setCat3(cat3===k?"":k)} style={{
                padding:"4px 10px",borderRadius:"99px",cursor:"pointer",fontSize:"11px",fontWeight:500,
                fontFamily:"'Inter',sans-serif",
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
          <span style={{color:C.inkLight,fontFamily:"'Inter',sans-serif",fontSize:"17px",marginRight:"8px"}}>₩</span>
          <input type="text" inputMode="numeric" value={amount}
            onChange={e=>{const raw=e.target.value.replace(/[^0-9]/g,"");setAmount(raw?Number(raw).toLocaleString("ko-KR"):raw);}}
            placeholder="0" style={{flex:1,border:"none",background:"transparent",
              fontSize:"20px",fontWeight:700,color:C.ink,padding:"10px 0",outline:"none",
              fontFamily:"'Inter',sans-serif",letterSpacing:"-0.3px",fontVariantNumeric:"tabular-nums"}}/>
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
              fontFamily:"'Inter',sans-serif"}}>미지정</button>
            {cards.map(c=>(
              <button key={c.id} onClick={()=>setCardId(c.id)} style={{
                padding:"5px 12px",borderRadius:"99px",cursor:"pointer",fontSize:"11px",fontWeight:500,
                border:`1.5px solid ${cardId===c.id?c.color:C.border}`,
                background:cardId===c.id?c.color:"#fff",
                color:cardId===c.id?"#fff":C.inkMid,
                fontFamily:"'Inter',sans-serif"}}>{c.name}</button>
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
            <div style={{fontSize:"13px",fontWeight:600,color:isFixed?"#b5451b":C.inkMid,fontFamily:"'Inter',sans-serif"}}>고정지출</div>
            <div style={{fontSize:"10px",color:C.inkLight,marginTop:"1px",fontFamily:"'Inter',sans-serif"}}>
              {isFixed?"매달 반복되는 고정 지출":"일반 지출"}
            </div>
          </div>
        </button>
        {isFixed&&(
          <div style={{background:"#fff8f0",border:"1.5px solid #b5451b",borderTop:"1px solid #f4c5b2",
            borderRadius:"0 0 12px 12px",padding:"12px 14px",
            display:"flex",alignItems:"center",gap:"10px"}}>
            <div style={{fontSize:"11px",fontWeight:600,color:"#b5451b",fontFamily:"'Inter',sans-serif",flexShrink:0}}>
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
                    fontFamily:"'Inter',sans-serif"}}>
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
                background:"#fff",fontFamily:"'Inter',sans-serif",textAlign:"center"}}/>
          </div>
        )}
      </div>

      {/* Supply toggle — cafe + 매입/원가 only */}
      {showSupplyToggle&&(
        <div style={{marginBottom:"12px"}}>
          <button onClick={()=>setIsSupply(f=>!f)} style={{
            display:"flex",alignItems:"center",gap:"10px",width:"100%",
            background:isSupply?"#f0fdf4":"#fff",
            border:`1.5px solid ${isSupply?"#2d6a4f":C.border}`,
            borderRadius:isSupply?"12px 12px 0 0":"12px",padding:"11px 14px",cursor:"pointer",transition:"all 0.2s"}}>
            <div style={{width:"38px",height:"22px",borderRadius:"99px",flexShrink:0,
              background:isSupply?"#2d6a4f":C.border,position:"relative",transition:"background 0.2s"}}>
              <div style={{width:"16px",height:"16px",borderRadius:"50%",background:"#fff",
                position:"absolute",top:"3px",left:isSupply?"19px":"3px",transition:"left 0.2s",
                boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
            </div>
            <div style={{flex:1,textAlign:"left"}}>
              <div style={{fontSize:"13px",fontWeight:600,color:isSupply?"#2d6a4f":C.inkMid,fontFamily:"'Inter',sans-serif"}}>소모품 등록</div>
              <div style={{fontSize:"10px",color:C.inkLight,marginTop:"1px",fontFamily:"'Inter',sans-serif"}}>
                {isSupply?"소모품 탭에 자동 반영됩니다":"소모품 관리에 추가하려면 켜세요"}
              </div>
            </div>
          </button>
          {isSupply&&(
            <div style={{background:"#f0fdf4",border:"1.5px solid #2d6a4f",borderTop:"1px solid #b7e4c7",
              borderRadius:"0 0 12px 12px",padding:"12px 14px",display:"flex",flexDirection:"column",gap:"10px"}}>
              <div>
                <div style={{fontSize:"10px",fontWeight:700,color:"#2d6a4f",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"6px",fontFamily:"'Inter',sans-serif"}}>소모품명</div>
                <input value={supplyName} onChange={e=>setSupplyName(e.target.value)}
                  placeholder={memo||cat2||"예: 원두, 화장지"}
                  style={{width:"100%",border:"1.5px solid #b7e4c7",borderRadius:"8px",padding:"8px 10px",
                    fontSize:"13px",color:"#1a3020",outline:"none",background:"#fff",fontFamily:"'Inter',sans-serif",boxSizing:"border-box"}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                <div>
                  <div style={{fontSize:"10px",fontWeight:700,color:"#2d6a4f",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"6px",fontFamily:"'Inter',sans-serif"}}>분류</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
                    {SUPPLY_CATS.map(c=>(
                      <button key={c} onClick={()=>setSupplyCat(c)} style={{
                        padding:"3px 9px",borderRadius:"99px",cursor:"pointer",fontSize:"11px",fontWeight:600,
                        border:`1.5px solid ${supplyCat===c?"#2d6a4f":"#b7e4c7"}`,
                        background:supplyCat===c?"#2d6a4f":"#fff",
                        color:supplyCat===c?"#fff":"#2d6a4f",fontFamily:"'Inter',sans-serif"}}>{c}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:"10px",fontWeight:700,color:"#2d6a4f",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"6px",fontFamily:"'Inter',sans-serif"}}>소진 주기 (일)</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
                    {[7,14,30,60].map(d=>(
                      <button key={d} onClick={()=>setSupplyCycle(String(d))} style={{
                        padding:"3px 9px",borderRadius:"99px",cursor:"pointer",fontSize:"11px",fontWeight:600,
                        border:`1.5px solid ${supplyCycle===String(d)?"#2d6a4f":"#b7e4c7"}`,
                        background:supplyCycle===String(d)?"#2d6a4f":"#fff",
                        color:supplyCycle===String(d)?"#fff":"#2d6a4f",fontFamily:"'Inter',sans-serif"}}>{d}일</button>
                    ))}
                    <input type="number" value={supplyCycle} onChange={e=>setSupplyCycle(e.target.value)}
                      placeholder="직접" min="1"
                      style={{width:"52px",border:"1.5px solid #b7e4c7",borderRadius:"8px",padding:"3px 7px",
                        fontSize:"11px",color:"#1a3020",outline:"none",background:"#fff",fontFamily:"'Inter',sans-serif",textAlign:"center"}}/>
                  </div>
                </div>
              </div>
              {/* 기존 소모품 매칭 표시 */}
              {(()=>{const match=supplies.find(s=>s.name===(supplyName.trim()||memo.trim()||cat2));
                return match?<div style={{fontSize:"11px",color:"#2d6a4f",fontFamily:"'Inter',sans-serif"}}>
                  ✓ 기존 소모품 &quot;{match.name}&quot;의 구매일이 업데이트됩니다
                </div>:<div style={{fontSize:"11px",color:"#6a9070",fontFamily:"'Inter',sans-serif"}}>
                  + 새 소모품으로 등록됩니다
                </div>;
              })()}
            </div>
          )}
        </div>
      )}

      {/* Memo + Date */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"14px"}}>
        <div><SLabel>메모</SLabel><Inp value={memo} onChange={e=>setMemo(e.target.value)} placeholder="선택사항"/></div>
        <div><SLabel>날짜</SLabel><Inp type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
      </div>

      <button className="add-btn" onClick={submit} disabled={saving} style={{
        width:"100%",padding:"13px",background:saving?"#9c8e82":ent.color,color:"#fff",border:"none",
        borderRadius:"13px",fontSize:"15px",fontWeight:600,cursor:saving?"not-allowed":"pointer",
        display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",
        fontFamily:"'Inter',sans-serif",boxShadow:`0 4px 18px ${ent.color}55`,transition:"all 0.2s"}}>
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
    <div style={{fontFamily:"'Inter',sans-serif"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:"8px",marginBottom:"22px"}}>
        <span style={{fontFamily:"'Inter',sans-serif",fontSize:"21px",color:C.ink}}>결제수단 관리</span>
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
                  padding:"6px 10px",fontSize:"13px",outline:"none",fontFamily:"'Inter',sans-serif"}}/>
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
            padding:"0 16px",color:"#fff",cursor:"pointer",fontFamily:"'Inter',sans-serif",
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


/* ── Flat List View ── */
function FlatListView({txs, onEdit, cards}){
  const cardMap=useMemo(()=>Object.fromEntries(cards.map(c=>[c.id,c])),[cards]);

  const byDate=useMemo(()=>{
    const m={};
    [...txs].sort((a,b)=>b.date.localeCompare(a.date)).forEach(tx=>{
      if(!m[tx.date])m[tx.date]=[];
      m[tx.date].push(tx);
    });
    return m;
  },[txs]);

  if(!txs.length)return(
    <div style={{textAlign:"center",padding:"56px 20px",background:C.white,borderRadius:"20px",border:`1px solid ${C.border}`}}>
      <div style={{fontSize:"34px",marginBottom:"12px",opacity:0.3}}>📭</div>
      <div style={{fontFamily:"'Inter',sans-serif",fontSize:"17px",color:C.inkMid,marginBottom:"4px"}}>비어있어요</div>
      <div style={{fontSize:"12px",color:C.inkLight}}>거래를 추가해보세요</div>
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
      {Object.entries(byDate).map(([date,items])=>{
        const dayIncome=items.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
        const dayExpense=items.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
        return(
          <div key={date} style={{background:C.white,borderRadius:"16px",overflow:"hidden",border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"9px 16px 8px",background:C.paper,borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:"12px",fontWeight:700,color:C.ink}}>{date}</div>
              <div style={{display:"flex",gap:"10px"}}>
                {dayIncome>0&&<span style={{fontSize:"11px",color:"#2d6a4f",fontWeight:600,fontFamily:"'Inter',sans-serif"}}>+{fmtS(dayIncome)}</span>}
                {dayExpense>0&&<span style={{fontSize:"11px",color:"#b5451b",fontWeight:600,fontFamily:"'Inter',sans-serif"}}>-{fmtS(dayExpense)}</span>}
              </div>
            </div>
            {items.map((tx,idx)=>{
              const card=tx.cardId?cardMap[tx.cardId]:null;
              const tree=TREES[tx.entity]||TREE_PERSONAL;
              const m1=tree[tx.cat1]||{color:C.inkMid,accent:C.inkLight};
              return(
                <div key={tx.id} className="tx-row" onClick={()=>onEdit(tx)}
                  style={{display:"flex",alignItems:"center",gap:"10px",padding:"11px 16px",
                    borderTop:idx>0?`1px solid ${C.border}`:"none",
                    cursor:"pointer",transition:"background 0.15s"}}>
                  <div style={{width:"3px",height:"36px",borderRadius:"99px",flexShrink:0,
                    background:`linear-gradient(180deg,${m1.color},${m1.accent})`}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:"5px",marginBottom:"3px",flexWrap:"wrap"}}>
                      <span style={{fontSize:"10px",background:m1.color+"18",color:m1.color,
                        borderRadius:"4px",padding:"1px 6px",fontWeight:700,flexShrink:0,
                        fontFamily:"'Inter',sans-serif"}}>{catDisplayName(tx.cat1)}</span>
                      <span style={{fontSize:"10px",color:C.inkLight,fontFamily:"'Inter',sans-serif"}}>{tx.cat2}</span>
                      {tx.cat3&&<span style={{fontSize:"10px",background:m1.accent+"18",color:m1.color,
                        borderRadius:"4px",padding:"1px 5px",fontWeight:600,flexShrink:0,
                        fontFamily:"'Inter',sans-serif"}}>{tx.cat3}</span>}
                    </div>
                    <div style={{fontSize:"13px",fontWeight:500,color:C.ink,fontFamily:"'Inter',sans-serif",
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.memo}</div>
                    <div style={{display:"flex",alignItems:"center",gap:"6px",marginTop:"2px",flexWrap:"wrap"}}>
                      {tx.isFixed&&<span style={{fontSize:"9px",background:"#fff8f0",color:"#b5451b",
                        borderRadius:"4px",padding:"1px 6px",fontWeight:700,fontFamily:"'Inter',sans-serif",
                        border:"1px solid #f4c5b2"}}>고정</span>}
                      {card&&<span style={{fontSize:"9px",background:card.color+"14",color:card.color,
                        borderRadius:"4px",padding:"1px 6px",fontWeight:600,fontFamily:"'Inter',sans-serif"}}>{card.name}</span>}
                    </div>
                  </div>
                  <div style={{fontSize:"14px",fontWeight:700,flexShrink:0,
                    color:tx.type==="income"?"#2d6a4f":"#b5451b",
                    fontFamily:"'Inter',sans-serif",letterSpacing:"-0.2px"}}>
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
}

/* ── Fixed View ── */
function FixedView({txs, onDelete, onEdit, onRegister, entity, year, month}){
  const today = new Date();
  const todayDay = today.getDate();
  const todayStr = today.toISOString().slice(0,10);
  const isCurrentMonth = today.getFullYear()===year && today.getMonth()===month;

  // 현재 엔티티의 고정지출 템플릿 (가장 최근 등록된 것 기준으로 memo별 dedupe)
  const fixedTemplates = useMemo(()=>{
    const map={};
    [...txs].filter(t=>t.isFixed&&t.entity===entity).sort((a,b)=>b.date.localeCompare(a.date)).forEach(t=>{
      if(!map[t.memo]) map[t.memo]=t;
    });
    return Object.values(map);
  },[txs,entity]);

  // 이번 달 실제 발생한 고정지출 (현재 엔티티)
  const monthKey=`${year}-${String(month+1).padStart(2,"0")}`;
  const thisMonthFixed = useMemo(()=>
    txs.filter(t=>t.isFixed&&t.entity===entity&&t.date.startsWith(monthKey)),
  [txs,entity,monthKey]);

  // 이번 달 아직 미발생인 예정 항목
  const scheduled = useMemo(()=>
    fixedTemplates.filter(t=>{
      const alreadyDone = thisMonthFixed.some(m=>m.memo===t.memo);
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
              fontFamily:"'Inter',sans-serif",overflow:"hidden",
              textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.memo}</span>
            {isToday&&<span style={{fontSize:"9px",background:"#b5451b",color:"#fff",
              borderRadius:"4px",padding:"1px 6px",fontWeight:700,flexShrink:0,
              fontFamily:"'Inter',sans-serif"}}>오늘</span>}
            {isPast&&!isToday&&<span style={{fontSize:"9px",background:"#fff0ee",color:"#e07a5f",
              borderRadius:"4px",padding:"1px 6px",fontWeight:700,flexShrink:0,
              border:"1px solid #f4c5b2",fontFamily:"'Inter',sans-serif"}}>미발생</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
            {isScheduled&&tx.fixedDay&&(
              <span style={{fontSize:"10px",color:isToday?"#b5451b":isPast?"#e07a5f":C.inkLight,
                fontWeight:isToday||isPast?700:400,fontFamily:"'Inter',sans-serif"}}>
                매월 {tx.fixedDay===31?"말일":`${tx.fixedDay}일`}
              </span>
            )}
            {!isScheduled&&(
              <span style={{fontSize:"10px",color:C.inkLight,fontFamily:"'Inter',sans-serif"}}>{tx.date}</span>
            )}
          </div>
        </div>
        <div style={{fontFamily:"'Inter',sans-serif",fontSize:"15px",
          color:tx.type==="income"?"#2d6a4f":"#b5451b",fontWeight:700,flexShrink:0,
          opacity:isScheduled?0.6:1}}>
          {tx.type==="income"?"+":"-"}{fmtS(tx.amount)}
        </div>
        {isScheduled?(
          <button onClick={()=>onRegister({...tx,id:Date.now(),date:todayStr,isFixed:true})}
            style={{background:"#fff8f0",border:"1px solid #f4c5b2",borderRadius:"8px",
              padding:"5px 10px",cursor:"pointer",color:"#b5451b",fontSize:"11px",fontWeight:600,
              flexShrink:0,fontFamily:"'Inter',sans-serif",display:"flex",alignItems:"center",gap:"4px"}}>
            <Plus size={11}/> 등록
          </button>
        ):(
          <div style={{display:"flex",gap:"2px",flexShrink:0}}>
            <button onClick={()=>onEdit(tx)} style={{background:"none",border:"none",cursor:"pointer",
              color:C.inkLight,padding:"4px",borderRadius:"6px",display:"flex",transition:"color 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.color=C.ink}
              onMouseLeave={e=>e.currentTarget.style.color=C.inkLight}><Pencil size={13}/></button>
            <button onClick={()=>onDelete(tx.id)} style={{background:"none",border:"none",cursor:"pointer",
              color:C.border,padding:"4px",flexShrink:0,borderRadius:"6px",display:"flex",transition:"color 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.color="#e07a5f"}
              onMouseLeave={e=>e.currentTarget.style.color=C.border}><Trash2 size={13}/></button>
          </div>
        )}
      </div>
    );
  };

  if(!fixedTemplates.length) return(
    <div style={{textAlign:"center",padding:"56px 20px",background:C.white,borderRadius:"20px",border:`1px solid ${C.border}`}}>
      <div style={{fontSize:"34px",marginBottom:"12px",opacity:0.3}}>📋</div>
      <div style={{fontFamily:"'Inter',sans-serif",fontSize:"17px",color:C.inkMid,marginBottom:"4px"}}>고정지출이 없어요</div>
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
              textTransform:"uppercase",fontFamily:"'Inter',sans-serif"}}>
              이번 달 예정 ({scheduled.length}건)
            </div>
            <div style={{fontFamily:"'Inter',sans-serif",fontSize:"14px",color:"#b5451b",opacity:0.7}}>
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
              textTransform:"uppercase",fontFamily:"'Inter',sans-serif"}}>
              이번 달 발생 ({occurred.length}건)
            </div>
            <div style={{fontFamily:"'Inter',sans-serif",fontSize:"14px",color:"#b5451b"}}>
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
            textTransform:"uppercase",marginBottom:"4px",fontFamily:"'Inter',sans-serif"}}>
            이번 달 고정지출 예상 합계
          </div>
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:"22px",color:"#b5451b",letterSpacing:"-0.3px",fontVariantNumeric:"tabular-nums"}}>
            -{fmtS(totalOccurred+totalScheduled)}
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:"10px",color:"#b5451b",opacity:0.6,fontFamily:"'Inter',sans-serif"}}>발생 -{fmtS(totalOccurred)}</div>
          <div style={{fontSize:"10px",color:"#b5451b",opacity:0.4,fontFamily:"'Inter',sans-serif"}}>예정 -{fmtS(totalScheduled)}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Stats ── */
function catDisplayName(name){
  return name.replace(/^지출-/,"").replace(/^저축\/투자/,"저축 ");
}

function BreakdownList({data,total,sign,expanded,setExpanded}){
  if(!data.length)return(
    <div style={{textAlign:"center",padding:"32px 20px",color:C.inkLight,fontFamily:"'Inter',sans-serif",fontSize:"13px"}}>내역이 없어요</div>
  );
  return(
    <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
      {data.map((item)=>{
        const pct=Math.round((item.value/total)*100);
        const isOpen=expanded===item.name;
        return(
          <div key={item.name} style={{background:C.white,borderRadius:"14px",border:`1px solid ${isOpen?item.color:C.border}`,overflow:"hidden",transition:"border-color 0.2s"}}>
            <button onClick={()=>setExpanded(isOpen?null:item.name)}
              style={{width:"100%",background:"none",border:"none",padding:"13px 14px 10px",cursor:"pointer",textAlign:"left"}}>
              <div style={{display:"flex",alignItems:"center",gap:"9px",marginBottom:"8px"}}>
                <div style={{width:"9px",height:"9px",borderRadius:"50%",background:item.color,flexShrink:0}}/>
                <div style={{flex:1,fontSize:"13px",fontWeight:600,color:C.ink,fontFamily:"'Inter',sans-serif"}}>{item.name}</div>
                <div style={{fontSize:"11px",color:item.color,fontWeight:700,fontFamily:"'Inter',sans-serif",marginRight:"4px"}}>{pct}%</div>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:"14px",color:item.color}}>{sign}{fmtS(item.value)}</div>
                <div style={{fontSize:"10px",color:C.inkLight,marginLeft:"2px"}}>{isOpen?"▲":"▼"}</div>
              </div>
              <div style={{background:C.cream,borderRadius:"99px",height:"5px",overflow:"hidden"}}>
                <div style={{width:`${pct}%`,height:"100%",background:item.color,borderRadius:"99px"}}/>
              </div>
            </button>
            {isOpen&&item.sub.length>0&&(
              <div style={{borderTop:`1px solid ${C.border}`,padding:"10px 14px 13px",background:C.paper}}>
                {item.sub.map((s)=>{
                  const sp=Math.round((s.value/item.value)*100);
                  return(
                    <div key={s.name} style={{marginBottom:"8px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}>
                        <span style={{fontSize:"11px",color:C.inkMid,fontFamily:"'Inter',sans-serif",fontWeight:500}}>{s.name||"기타"}</span>
                        <span style={{fontSize:"11px",color:C.inkMid,fontFamily:"'Inter',sans-serif"}}>{fmtS(s.value)}&nbsp;·&nbsp;{sp}%</span>
                      </div>
                      <div style={{background:C.border,borderRadius:"99px",height:"3px",overflow:"hidden"}}>
                        <div style={{width:`${sp}%`,height:"100%",background:item.color+"bb",borderRadius:"99px"}}/>
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
}

function StatsView({txs,entity,cards}){
  const tree=TREES[entity]||TREE_PERSONAL;
  const isRealty=entity==="realty";
  const [statsTab,setStatsTab]=useState("expense");
  const [expanded,setExpanded]=useState(null);

  const incomeAmt=useMemo(()=>txs.filter(t=>t.type==="income"&&!t.cat1.startsWith("저축")).reduce((s,t)=>s+t.amount,0),[txs]);
  const saved=useMemo(()=>txs.filter(t=>t.cat1.startsWith("저축")).reduce((s,t)=>s+t.amount,0),[txs]);
  const expense=useMemo(()=>txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[txs]);
  const totalIn=incomeAmt+saved;
  const savingsRate=totalIn>0?Math.round((saved/totalIn)*100):0;

  function buildBreakdown(filterFn){
    const m={};
    txs.filter(filterFn).forEach(t=>{
      if(!m[t.cat1])m[t.cat1]={value:0,sub:{}};
      m[t.cat1].value+=t.amount;
      m[t.cat1].sub[t.cat2]=(m[t.cat1].sub[t.cat2]||0)+t.amount;
    });
    return Object.entries(m).map(([name,d])=>({
      name:catDisplayName(name),rawName:name,value:d.value,color:tree[name]?.color||C.inkMid,
      sub:Object.entries(d.sub).map(([n,v])=>({name:n,value:v})).sort((a,b)=>b.value-a.value),
    })).sort((a,b)=>b.value-a.value);
  }

  const byIncome=useMemo(()=>buildBreakdown(t=>t.type==="income"),[txs,tree]);
  const byExpense=useMemo(()=>buildBreakdown(t=>t.type==="expense"),[txs,tree]);
  const byCard=useMemo(()=>{
    const m={};
    txs.filter(t=>t.type==="expense").forEach(t=>{const k=t.cardId||"__none__";m[k]=(m[k]||0)+t.amount;});
    return Object.entries(m).map(([id,value])=>{
      const card=cards.find(c=>c.id===id);
      return{name:card?card.name:"미지정",value,color:card?card.color:C.inkLight,sub:[]};
    }).sort((a,b)=>b.value-a.value);
  },[txs,cards]);

  const PROP_COLORS=["#1d4e89","#4a90d9","#831843","#9b5de5","#2d6a4f","#b5451b","#b8860b","#0077b6"];
  const byProperty=useMemo(()=>{
    if(!isRealty)return[];
    const m={};
    txs.forEach(t=>{
      const key=t.cat3||"미지정";
      if(!m[key])m[key]={income:0,expense:0,sub:{}};
      if(t.type==="income") m[key].income+=t.amount;
      else m[key].expense+=t.amount;
      const sub=catDisplayName(t.cat1);
      if(!m[key].sub[sub])m[key].sub[sub]={value:0,type:t.type};
      m[key].sub[sub].value+=t.amount;
      m[key].sub[sub].type=t.type;
    });
    return Object.entries(m).map(([name,d],i)=>({
      name,income:d.income,expense:d.expense,net:d.income-d.expense,
      color:PROP_COLORS[i%PROP_COLORS.length],
      sub:Object.entries(d.sub).map(([n,s])=>({name:n,value:s.value,type:s.type}))
        .sort((a,b)=>a.type===b.type?b.value-a.value:a.type==="income"?-1:1),
    })).sort((a,b)=>(b.income-b.expense)-(a.income-a.expense));
  },[txs,isRealty]);

  const tt={background:C.paper,border:`1px solid ${C.border}`,borderRadius:"10px",fontFamily:"'Inter',sans-serif",fontSize:"12px"};

  if(!txs.length)return(
    <div style={{textAlign:"center",padding:"56px 20px",background:C.white,borderRadius:"20px",border:`1px solid ${C.border}`}}>
      <div style={{fontFamily:"'Inter',sans-serif",fontSize:"17px",color:C.inkMid}}>데이터가 없어요</div>
    </div>
  );

  const activeData = statsTab==="income"?byIncome:statsTab==="expense"?byExpense:statsTab==="property"?[]:byCard;
  const activeTotal = statsTab==="income"?(totalIn||1):(expense||1);
  const activeSign = statsTab==="income"?"+":" ";
  const activeLabel = statsTab==="income"?"수입 구성":statsTab==="expense"?"지출 구성":"카드별 지출";

  const statsTabs=[["income","수입"],["expense","지출"],["card","카드"],...(isRealty?[["property","물건별"]]:[])]

  return(
    <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>

      {/* Summary */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
        {[
          {label:"수입",val:"+"+fmtS(incomeAmt),color:"#2d6a4f",bg:"#f0fdf4",tab:"income"},
          {label:"지출",val:fmtS(expense),color:"#b5451b",bg:"#fff5f0",tab:"expense"},
          {label:"저축률",val:saved>0?`${savingsRate}%`:"—",color:saved>0?"#1d4e89":C.inkLight,bg:"#f0f4ff",tab:null},
        ].map(({label,val,color,bg,tab})=>(
          <div key={label} onClick={tab?()=>{setStatsTab(tab);setExpanded(null);}:undefined}
            style={{background:bg,borderRadius:"14px",padding:"14px 8px",textAlign:"center",
              cursor:tab?"pointer":"default",
              outline:statsTab===tab?`2px solid ${color}`:"none",outlineOffset:"2px",transition:"outline 0.15s"}}>
            <div style={{fontSize:"9px",fontWeight:700,color,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"6px",fontFamily:"'Inter',sans-serif"}}>{label}</div>
            <div style={{fontFamily:"'Inter',sans-serif",fontSize:"15px",color,letterSpacing:"-0.3px",wordBreak:"keep-all"}}>{val}</div>
          </div>
        ))}
      </div>

      {/* Tab */}
      <div style={{display:"flex",background:C.white,borderRadius:"10px",padding:"3px",border:`1px solid ${C.border}`,gap:"3px"}}>
        {statsTabs.map(([k,l])=>(
          <button key={k} onClick={()=>{setStatsTab(k);setExpanded(null);}} style={{
            flex:1,padding:"8px",border:"none",borderRadius:"8px",cursor:"pointer",
            fontWeight:statsTab===k?700:400,fontSize:"12px",transition:"all 0.15s",
            background:statsTab===k?C.ink:"transparent",color:statsTab===k?"#fff":C.inkLight,
            fontFamily:"'Inter',sans-serif"}}>{l}</button>
        ))}
      </div>

      {/* Donut (property 탭 제외) */}
      {statsTab!=="property"&&activeData.length>0&&(
        <div style={{background:C.white,borderRadius:"18px",padding:"18px 18px 10px",border:`1px solid ${C.border}`}}>
          <div style={{fontSize:"10px",fontWeight:700,color:C.inkLight,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:"8px",fontFamily:"'Inter',sans-serif"}}>{activeLabel}</div>
          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie data={activeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={46} outerRadius={68} paddingAngle={3}>
                {activeData.map((e,i)=><Cell key={i} fill={e.color}/>)}
              </Pie>
              <Tooltip formatter={v=>[fmt(v)]} contentStyle={tt}/>
              <Legend iconType="circle" iconSize={7} formatter={v=><span style={{fontSize:"10px",color:C.inkMid,fontFamily:"'Inter',sans-serif"}}>{v}</span>}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 물건별 브레이크다운 */}
      {statsTab==="property"?(
        <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
          {byProperty.length===0&&(
            <div style={{textAlign:"center",padding:"32px",color:C.inkLight,fontFamily:"'Inter',sans-serif",fontSize:"13px"}}>물건 태그가 없어요</div>
          )}
          {byProperty.map(item=>{
            const isOpen=expanded===item.name;
            const maxAbs=Math.max(...byProperty.map(p=>Math.max(p.income,p.expense)),1);
            return(
              <div key={item.name} style={{background:C.white,borderRadius:"14px",border:`1px solid ${isOpen?item.color:C.border}`,overflow:"hidden",transition:"border-color 0.2s"}}>
                <button onClick={()=>setExpanded(isOpen?null:item.name)}
                  style={{width:"100%",background:"none",border:"none",padding:"13px 14px 10px",cursor:"pointer",textAlign:"left"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"9px",marginBottom:"10px"}}>
                    <div style={{width:"9px",height:"9px",borderRadius:"50%",background:item.color,flexShrink:0}}/>
                    <div style={{flex:1,fontSize:"13px",fontWeight:700,color:C.ink,fontFamily:"'Inter',sans-serif"}}>{item.name}</div>
                    <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                      {item.income>0&&<span style={{fontSize:"11px",color:"#2d6a4f",fontWeight:600,fontFamily:"'Inter',sans-serif"}}>+{fmtS(item.income)}</span>}
                      {item.expense>0&&<span style={{fontSize:"11px",color:"#b5451b",fontWeight:600,fontFamily:"'Inter',sans-serif"}}>-{fmtS(item.expense)}</span>}
                      <span style={{fontSize:"13px",fontWeight:700,fontFamily:"'Inter',sans-serif",
                        color:item.net>=0?"#1d4e89":"#831843",
                        borderLeft:`1px solid ${C.border}`,paddingLeft:"8px"}}>
                        {item.net>=0?"+":""}{fmtS(item.net)}
                      </span>
                    </div>
                    <div style={{fontSize:"10px",color:C.inkLight,marginLeft:"2px"}}>{isOpen?"▲":"▼"}</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px"}}>
                    {item.income>0&&(
                      <div>
                        <div style={{background:"#f0fdf4",borderRadius:"99px",height:"5px",overflow:"hidden"}}>
                          <div style={{width:`${Math.round((item.income/maxAbs)*100)}%`,height:"100%",background:"#2d6a4f",borderRadius:"99px"}}/>
                        </div>
                      </div>
                    )}
                    {item.expense>0&&(
                      <div>
                        <div style={{background:"#fff5f0",borderRadius:"99px",height:"5px",overflow:"hidden"}}>
                          <div style={{width:`${Math.round((item.expense/maxAbs)*100)}%`,height:"100%",background:"#b5451b",borderRadius:"99px"}}/>
                        </div>
                      </div>
                    )}
                  </div>
                </button>
                {isOpen&&item.sub.length>0&&(
                  <div style={{borderTop:`1px solid ${C.border}`,padding:"10px 14px 13px",background:C.paper}}>
                    {item.sub.map(s=>(
                      <div key={s.name} style={{marginBottom:"8px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}>
                          <span style={{fontSize:"11px",color:C.inkMid,fontFamily:"'Inter',sans-serif",fontWeight:500}}>{s.name}</span>
                          <span style={{fontSize:"11px",fontFamily:"'Inter',sans-serif",fontWeight:600,
                            color:s.type==="income"?"#2d6a4f":"#b5451b"}}>
                            {s.type==="income"?"+":"-"}{fmtS(s.value)}
                          </span>
                        </div>
                        <div style={{background:C.border,borderRadius:"99px",height:"3px",overflow:"hidden"}}>
                          <div style={{width:`${Math.round((s.value/Math.max(item.income,item.expense,1))*100)}%`,
                            height:"100%",background:s.type==="income"?"#52b788bb":"#e07a5fbb",borderRadius:"99px"}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ):(
        /* Breakdown bars */
        <BreakdownList data={activeData} total={activeTotal} sign={activeSign} expanded={expanded} setExpanded={setExpanded}/>
      )}
    </div>
  );
}

/* ── Coupang Import Modal ── */
async function fetchGmailCoupang(token, since, until) {
  const sinceTs = Math.floor(new Date(since).getTime() / 1000);
  const untilTs = Math.floor(new Date(until).getTime() / 1000) + 86400;
  const q = encodeURIComponent(`from:noreply@e.coupang.com after:${sinceTs} before:${untilTs}`);
  const searchRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (searchRes.status === 401) throw new Error("401");
  if (!searchRes.ok) throw new Error("Gmail API 오류");
  const { messages } = await searchRes.json();
  if (!messages?.length) return [];
  const details = await Promise.all(
    messages.slice(0, 30).map(m =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then(r => r.json())
    )
  );
  return details.map(m => ({
    date: new Date(parseInt(m.internalDate)).toISOString().slice(0,10),
    snippet: m.snippet || "",
  }));
}

function parseMailSnippets(snippets) {
  return snippets.map(({ date, snippet }) => {
    const amtAll = [...snippet.matchAll(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*원/g)]
      .map(m => parseInt(m[1].replace(/,/g, '')))
      .filter(n => n >= 100 && n < 50000000);
    const amount = amtAll.length ? Math.max(...amtAll) : null;
    const skipPat = /주문|결제|배송|발송|확인|완료|총|합계|금액|쿠팡|이츠/;
    const parts = snippet.split(/[,|]/).map(s => s.trim()).filter(s => s.length >= 5 && !skipPat.test(s) && !/^\d/.test(s));
    const name = (parts[0] || snippet.slice(0, 50)).slice(0, 60).trim();
    return { date, name: name || "상품명 확인 필요", amount };
  });
}

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
  const today    = new Date().toISOString().slice(0,10);
  const monthAgo = new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const [gmailToken, setGmailToken] = useState(null);
  const [since,      setSince]      = useState(monthAgo);
  const [until,      setUntil]      = useState(today);
  const [pasteText,  setPasteText]  = useState("");
  const [showPaste,  setShowPaste]  = useState(false);
  const [status,     setStatus]     = useState("idle");
  const [rows,       setRows]       = useState([]);
  const [errMsg,     setErrMsg]     = useState("");
  const [submitted,  setSubmitted]  = useState(false);

  function connectGmail(onToken) {
    const client = window.google?.accounts?.oauth2?.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      callback: (res) => {
        if (res.error) { setErrMsg("Google 로그인 실패: " + res.error); setStatus("error"); return; }
        setGmailToken(res.access_token);
        setErrMsg("");
        if (onToken) onToken(res.access_token);
      },
    });
    if (!client) { setErrMsg("Google 스크립트 로딩 중이에요. 잠시 후 다시 시도해 주세요."); setStatus("error"); return; }
    client.requestAccessToken();
  }

  async function fetchMails(token, append = false) {
    setStatus("loading"); setErrMsg("");
    try {
      const snippets = await fetchGmailCoupang(token ?? gmailToken, since, until);
      if (!snippets.length) { setStatus("error"); setErrMsg("해당 기간 쿠팡 메일이 없어요."); return; }
      const parsed = parseMailSnippets(snippets);
      applyParsed(parsed, append);
    } catch(e) {
      if (e.message === "401") { setGmailToken(null); setStatus("error"); setErrMsg("인증이 만료됐어요. Google 계정을 다시 연결해 주세요."); }
      else { setStatus("error"); setErrMsg(e.message || "오류가 발생했어요."); }
    }
  }

  function parsePaste() {
    setErrMsg("");
    if (!pasteText.trim()) { setErrMsg("이메일 내용을 붙여넣어 주세요."); setStatus("error"); return; }
    const parsed = parsePastedMails(pasteText);
    if (!parsed.length) { setErrMsg("파싱할 수 있는 내용이 없어요. 빈 줄로 메일을 구분해 주세요."); setStatus("error"); return; }
    applyParsed(parsed, false);
  }

  function applyParsed(parsed, append) {
    const newRows = parsed.map((p,i) => ({
      id:`r${i}_${Date.now()}`, date:p.date, name:p.name,
      amountEdit:p.amount?String(p.amount):"", entity:"personal", done:false,
    }));
    setRows(prev => {
      const base = append ? prev : [];
      const existingKeys = new Set(base.map(r => `${r.date}__${r.name}__${r.amountEdit}`));
      const fresh = newRows.filter(r => !existingKeys.has(`${r.date}__${r.name}__${r.amountEdit}`));
      return [...base, ...fresh];
    });
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
    <div style={{fontFamily:"'Inter',sans-serif"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:"8px",marginBottom:"20px"}}>
        <span style={{fontFamily:"'Inter',sans-serif",fontSize:"21px",color:C.ink}}>쿠팡 메일 가져오기</span>
        <span style={{fontSize:"11px",color:C.inkLight}}>Gmail → 파싱 → 등록</span>
      </div>

      {/* Gmail 연결 or 날짜 선택 */}
      <div style={{background:C.cream,borderRadius:"14px",padding:"14px",
        border:`1px solid ${C.border}`,marginBottom:"16px"}}>
        {!gmailToken ? (
          <>
            <div style={{fontSize:"12px",color:C.inkMid,marginBottom:"12px",lineHeight:1.6}}>
              Google 계정을 연결하면 쿠팡 주문 메일을 자동으로 가져와요.
            </div>
            <button onClick={connectGmail} style={{
              width:"100%",padding:"12px",background:C.ink,color:"#fff",
              border:"none",borderRadius:"11px",fontSize:"14px",fontWeight:700,
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              gap:"8px",fontFamily:"'Inter',sans-serif",
              boxShadow:"0 4px 14px rgba(0,0,0,0.2)"}}>
              <Mail size={14}/> Google 계정 연결
            </button>
            <button onClick={()=>setShowPaste(p=>!p)} style={{
              width:"100%",marginTop:"8px",padding:"9px",background:"none",
              border:`1px dashed ${C.border}`,borderRadius:"10px",fontSize:"12px",
              color:C.inkLight,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
              직접 붙여넣기
            </button>
          </>
        ) : (
          <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
              <div style={{fontSize:"12px",color:C.inkMid}}>Gmail 연결됨 ✓</div>
              <button onClick={()=>setGmailToken(null)} style={{fontSize:"11px",color:C.inkLight,
                background:"none",border:"none",cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
                연결 해제
              </button>
            </div>
            <SLabel>기간 설정</SLabel>
            <div style={{display:"flex",gap:"8px",alignItems:"center",marginBottom:"10px"}}>
              <input type="date" value={since} onChange={e=>setSince(e.target.value)} max={until}
                style={{flex:1,border:`1.5px solid ${C.border}`,borderRadius:"10px",padding:"9px 10px",
                  fontSize:"13px",fontWeight:600,color:C.ink,background:C.white,outline:"none",
                  fontFamily:"'Inter',sans-serif"}}/>
              <span style={{fontSize:"12px",color:C.inkLight,flexShrink:0}}>~</span>
              <input type="date" value={until} onChange={e=>setUntil(e.target.value)} min={since} max={today}
                style={{flex:1,border:`1.5px solid ${C.border}`,borderRadius:"10px",padding:"9px 10px",
                  fontSize:"13px",fontWeight:600,color:C.ink,background:C.white,outline:"none",
                  fontFamily:"'Inter',sans-serif"}}/>
            </div>
            <button onClick={()=>fetchMails(null, false)} disabled={status==="loading"} style={{
              width:"100%",padding:"12px",
              background:status==="loading"?"#9c8e82":C.ink,
              color:"#fff",border:"none",borderRadius:"11px",
              fontSize:"14px",fontWeight:700,cursor:status==="loading"?"not-allowed":"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",
              fontFamily:"'Inter',sans-serif",boxShadow:status!=="loading"?"0 4px 14px rgba(0,0,0,0.2)":"none"}}>
              {status==="loading"
                ?<><RefreshCw size={14} className="spin"/> 메일 읽는 중...</>
                :<><Mail size={14}/> 쿠팡 메일 가져오기</>}
            </button>
            {status==="parsed" && rows.length>0 && (
              <button
                onClick={()=>connectGmail(token=>fetchMails(token, true))}
                style={{width:"100%",marginTop:"8px",padding:"9px",background:"none",
                  border:`1px dashed ${C.border}`,borderRadius:"10px",fontSize:"12px",
                  color:C.inkMid,cursor:"pointer",fontFamily:"'Inter',sans-serif",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
                <Plus size={12}/> 다른 계정 추가
              </button>
            )}
          </>
        )}
      </div>

      {/* 직접 붙여넣기 (폴백) */}
      {showPaste && (
        <div style={{background:C.cream,borderRadius:"14px",padding:"14px",
          border:`1px solid ${C.border}`,marginBottom:"16px"}}>
          <SLabel>이메일 내용 붙여넣기</SLabel>
          <div style={{fontSize:"11px",color:C.inkLight,marginBottom:"8px",lineHeight:1.5}}>
            여러 메일은 <b>빈 줄</b>로 구분하면 한번에 파싱해요.
          </div>
          <textarea
            value={pasteText}
            onChange={e=>setPasteText(e.target.value)}
            placeholder={"[쿠팡] 주문이 확정되었습니다\n2026.05.13\n다하다 둥굴레차 100개입\n13,000원\n\n(다음 메일은 빈 줄로 구분)"}
            rows={5}
            style={{width:"100%",border:`1.5px solid ${C.border}`,borderRadius:"10px",
              padding:"10px 12px",fontSize:"12px",color:C.ink,background:C.white,
              fontFamily:"'Inter',sans-serif",resize:"vertical",outline:"none",
              lineHeight:1.6,boxSizing:"border-box"}}
          />
          <button onClick={parsePaste} style={{
            width:"100%",marginTop:"10px",padding:"12px",background:C.ink,color:"#fff",
            border:"none",borderRadius:"11px",fontSize:"14px",fontWeight:700,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",
            fontFamily:"'Inter',sans-serif",boxShadow:"0 4px 14px rgba(0,0,0,0.2)"}}>
            <Mail size={14}/> 파싱하기
          </button>
        </div>
      )}

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
              fontFamily:"'Inter',sans-serif",transition:"all 0.3s",
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
                                outline:"none",fontFamily:"'Inter',sans-serif"}}/>
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
                              transition:"all 0.15s",fontFamily:"'Inter',sans-serif"}}>
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
                          fontFamily:"'Inter',sans-serif"}}>
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
                      fontFamily:"'Inter',sans-serif",flexShrink:0}}>되돌리기</button>
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
                      <div style={{fontFamily:"'Inter',sans-serif",fontSize:"13px",color:C.mid,flexShrink:0}}>
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
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:"18px",color:"#2d6a4f",marginBottom:"4px"}}>
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
    <div style={{fontFamily:"'Inter',sans-serif"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"20px"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:"8px"}}>
          <span style={{fontFamily:"'Inter',sans-serif",fontSize:"20px",color:C.ink}}>
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
                color:form.category===c?"#2d6a4f":C.inkMid,fontFamily:"'Inter',sans-serif"}}>{c}</button>
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
                  color:C.ink,padding:"10px 0",outline:"none",fontFamily:"'Inter',sans-serif"}}/>
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
        fontFamily:"'Inter',sans-serif",boxShadow:"0 4px 18px #2d6a4f55"}}>
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
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:"18px",color:C.ink}}>소모품 관리</div>
          <div style={{fontSize:"11px",color:C.inkLight,marginTop:"2px",fontFamily:"'Inter',sans-serif"}}>
            앤딩스터디카페 재고 주기 트래커
          </div>
        </div>
        <button onClick={()=>{
          setForm({name:"",category:"소모품",cycle_days:"",last_bought:todayStr,memo:""});
          setModal("add");
        }} style={{
          background:"#2d6a4f",border:"none",borderRadius:"10px",padding:"9px 14px",
          color:"#fff",fontSize:"12px",fontWeight:600,cursor:"pointer",
          display:"flex",alignItems:"center",gap:"5px",fontFamily:"'Inter',sans-serif",
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
            <div style={{fontSize:"12px",fontWeight:700,color:"#b5451b",fontFamily:"'Inter',sans-serif"}}>
              {needAction.filter(s=>daysUntil(s)<0).length>0
                ? `${needAction.filter(s=>daysUntil(s)<0).length}개 구매 필요 · ${needAction.filter(s=>daysUntil(s)>=0).length>0?`${needAction.filter(s=>daysUntil(s)>=0).length}개 임박`:""}`
                : `${needAction.length}개 구매 임박`}
            </div>
            <div style={{fontSize:"11px",color:"#b5451b",opacity:0.7,marginTop:"2px",fontFamily:"'Inter',sans-serif"}}>
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
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:"17px",color:C.inkMid,marginBottom:"4px"}}>소모품이 없어요</div>
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
                    <span style={{fontSize:"14px",fontWeight:700,color:C.ink,fontFamily:"'Inter',sans-serif"}}>{s.name}</span>
                    <span style={{fontSize:"9px",background:st.bg,color:st.color,border:`1px solid ${st.border}`,
                      borderRadius:"4px",padding:"1px 6px",fontWeight:700,fontFamily:"'Inter',sans-serif",
                      display:"flex",alignItems:"center",gap:"3px"}}>
                      {st.icon}{st.label}
                    </span>
                  </div>
                  <div style={{fontSize:"11px",color:C.inkLight,fontFamily:"'Inter',sans-serif"}}>
                    {s.category} · 주기 {s.cycle_days}일 · 다음 구매 {next}
                  </div>
                  {s.memo&&<div style={{fontSize:"11px",color:C.inkLight,marginTop:"2px",fontFamily:"'Inter',sans-serif",fontStyle:"italic"}}>{s.memo}</div>}
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
                  <span style={{fontSize:"9px",color:C.inkLight,fontFamily:"'Inter',sans-serif"}}>
                    구매 후 {daysDiff(s.last_bought)}일 경과
                  </span>
                  <span style={{fontSize:"9px",color:C.inkLight,fontFamily:"'Inter',sans-serif"}}>
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
                fontFamily:"'Inter',sans-serif",transition:"all 0.2s"}}
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
    <div style={{fontFamily:"'Inter',sans-serif"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:"8px",marginBottom:"22px"}}>
        <span style={{fontFamily:"'Inter',sans-serif",fontSize:"21px",color:C.ink}}>테마</span>
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
              fontFamily:"'Inter',sans-serif",
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
  const ENTITY_THEME = {personal:"cream", cafe:"forest", realty:"navy"};
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
    const {supplyData,...txData}=tx;
    setSaving(true);
    try{
      const [row]=await sb("transactions",{method:"POST",body:JSON.stringify(txToRow(txData))});
      setTxs(p=>[rowToTx(row),...p]);
      if(supplyData){
        const existing=supplies.find(s=>s.name===supplyData.name);
        if(existing){
          await handleSupplies({...existing,last_bought:supplyData.last_bought},"update");
        }else{
          await handleSupplies({id:"s"+Date.now(),...supplyData},"add");
        }
      }
    }catch(e){console.error(e);}
    finally{setSaving(false);setModal(null);}
  }
  async function updateTx(tx){
    const {supplyData,...txData}=tx;
    setSaving(true);
    try{
      await sb(`transactions?id=eq.${txData.id}`,{method:"PATCH",body:JSON.stringify(txToRow(txData)),prefer:"return=minimal"});
      setTxs(p=>p.map(t=>t.id===txData.id?txData:t));
      if(supplyData){
        const existing=supplies.find(s=>s.name===supplyData.name);
        if(existing){
          await handleSupplies({...existing,last_bought:supplyData.last_bought},"update");
        }else{
          await handleSupplies({id:"s"+Date.now(),...supplyData},"add");
        }
      }
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
        <div style={{maxWidth:"660px",margin:"0 auto",position:"relative"}}>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"20px"}}>
            <div>
              <div style={{fontSize:"9px",fontWeight:700,opacity:0.35,letterSpacing:"0.2em",marginBottom:"4px",fontFamily:"'Inter',sans-serif"}}>HOUSEHOLD BUDGET</div>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:"22px",fontWeight:700,letterSpacing:"-0.5px",lineHeight:1}}>가계부</div>
              <div style={{display:"flex",alignItems:"center",gap:"5px",marginTop:"4px"}}>
                {online
                  ?<><Wifi size={10} color="rgba(255,255,255,0.4)"/><span style={{fontSize:"10px",opacity:0.4,fontFamily:"'Inter',sans-serif"}}>Supabase 연결됨</span></>
                  :!isConfigured()
                    ?<><WifiOff size={10} color="rgba(255,255,255,0.3)"/><span style={{fontSize:"10px",opacity:0.3,fontFamily:"'Inter',sans-serif"}}>로컬 모드</span></>
                    :<><WifiOff size={10} color="#e07a5f"/><span style={{fontSize:"10px",color:"#e07a5f",fontFamily:"'Inter',sans-serif"}}>연결 오류</span></>
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
            </div>
          </div>

          {/* Entity tabs */}
          <div style={{display:"flex",gap:"5px",marginBottom:"18px"}}>
            {ENTITY_KEYS.map(ek=>{
              const e=ENTITIES[ek];const sel=entity===ek;
              return(
                <button key={ek} onClick={()=>{setEntity(ek);setTab("list");changeTheme(ENTITY_THEME[ek]||"cream");}} style={{
                  flex:1,padding:"9px 4px",borderRadius:"10px",cursor:"pointer",border:"none",
                  background:sel?e.color:"rgba(255,255,255,0.07)",
                  color:sel?"#fff":"rgba(255,255,255,0.45)",
                  fontFamily:"'Inter',sans-serif",fontSize:"11px",fontWeight:sel?700:400,
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
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:"20px",letterSpacing:"-0.3px"}}>{MONTHS[month]} {year}</div>
              <div style={{fontSize:"10px",opacity:0.35,fontFamily:"'Inter',sans-serif",marginTop:"1px"}}>{year}년 {MONTHS_KO[month]}</div>
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
                <div style={{fontSize:"9px",fontWeight:700,color:C.inkLight,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:"5px",fontFamily:"'Inter',sans-serif"}}>{item.label}</div>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:"16px",color:item.color,letterSpacing:"-0.3px"}}>{item.sign}{fmtS(item.val)}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{maxWidth:"660px",margin:"0 auto",padding:"0 14px 16px",
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
              marginBottom:"-1px",fontFamily:"'Inter',sans-serif",transition:"all 0.2s"}}>{l}</button>
          ))}
        </div>

        {loading
          ?<div style={{textAlign:"center",padding:"48px",color:C.inkLight,fontFamily:"'Inter',sans-serif",fontSize:"13px"}}>
            <RefreshCw size={20} className="spin" style={{marginBottom:"8px",display:"block",margin:"0 auto 10px"}}/> 불러오는 중...
          </div>
          :<div className="fade-in" key={entity+tab}>
            {tab==="list"?<FlatListView txs={viewTxs} onEdit={tx=>{setEditTx(tx);setModal("edit");}} cards={cards}/>
             :tab==="stats"?<StatsView txs={viewTxs} entity={entity} cards={cards}/>
             :tab==="supplies"?<SuppliesView supplies={supplies} onChange={handleSupplies}/>
             :<FixedView txs={txs} onDelete={deleteTx} onEdit={tx=>{setEditTx(tx);setModal("edit");}} onRegister={addTx} entity={entity} year={year} month={month}/>}
          </div>
        }
      </div>

      <Modal open={modal==="add"} onClose={()=>setModal(null)}>
        <TxForm onSave={addTx} cards={cards} defaultEntity={entity} saving={saving} supplies={supplies}/>
      </Modal>
      <Modal open={modal==="edit"&&!!editTx} onClose={()=>{setModal(null);setEditTx(null);}}>
        {editTx&&<TxForm initial={editTx} onSave={updateTx} onDelete={()=>deleteTx(editTx.id)} cards={cards} defaultEntity={entity} saving={saving} supplies={supplies}/>}
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

      {/* FAB */}
      <button onClick={()=>setModal("add")} style={{
        position:"fixed",bottom:"24px",right:"24px",zIndex:200,
        width:"56px",height:"56px",borderRadius:"50%",border:"none",
        background:ent.color,color:"#fff",cursor:"pointer",
        display:"flex",alignItems:"center",justifyContent:"center",
        boxShadow:`0 4px 20px ${ent.color}88`,transition:"transform 0.15s,box-shadow 0.15s"}}
        onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.08)";}}
        onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";}}>
        <Plus size={26}/>
      </button>
    </div>
  );
}
