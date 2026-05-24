import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { PlusCircle, ChevronLeft, ChevronRight, Trash2, CreditCard, Pencil, Check, Plus, RefreshCw, Wifi, WifiOff, Package, ShoppingCart, AlertTriangle, Clock, Mail, AlertCircle, X, GripVertical, Copy } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";

/* ── Supabase 설정 ─────────────────────────────────────────────────────────────
   Supabase 프로젝트 생성 후 아래 두 값을 교체하세요.
   Settings → API → Project URL / anon public key
────────────────────────────────────────────────────────────────────────────── */
const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON   = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON);
let _authToken = SUPABASE_ANON;

const sb = async (path, opts={}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_ANON,
      "Authorization": `Bearer ${_authToken}`,
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
  images: r.images||[],
});
const txToRow = t => ({
  id: t.id, entity: t.entity, cat1: t.cat1, cat2: t.cat2, cat3: t.cat3||"",
  amount: t.amount, memo: t.memo, date: t.date, card_id: t.cardId||"",
  is_fixed: t.isFixed||false, fixed_day: t.fixedDay||null, type: t.type,
  images: t.images||[],
});
function getTxImageUrl(path){ return `${SUPABASE_URL}/storage/v1/object/public/tx-images/${path}`; }
async function uploadTxImage(txId, file){
  const ext=file.name.split(".").pop()||"jpg";
  const path=`${txId}/${Date.now()}.${ext}`;
  const {error}=await supabaseClient.storage.from("tx-images").upload(path,file,{upsert:false});
  if(error)throw error;
  return path;
}
async function deleteTxImages(paths){
  if(!paths||!paths.length)return;
  await supabaseClient.storage.from("tx-images").remove(paths);
}
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
const ENTITY_ALL = { label:"전체", sub:"All", color:"#4a4a4a", accent:"#888888" };

const TREE_PERSONAL = {
  수입:{ color:"#2d6a4f",accent:"#52b788",icon:"💚",children:{
    급여:[],부업:[],임대료:[],카드캐시백:[],보험금:[],연말정산:[],환급:[],
    외화매도:[],"중고거래/당근":[],"호텔 배당금":[],컨커:[],"대출이자-무이자":[],서울런:[],서대문농아:[],기타:[],
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
  매출:{ color:"#2d6a4f",accent:"#52b788",icon:"💰",children:{이용권수입:[],기타수입:[],무인키오스크:[],네이버예약:[],환불:["현금환불","카드환불","기타"]}},
  "매입/원가":{ color:"#b5451b",accent:"#e07a5f",icon:"📦",children:{
    식음료간식:["커피-원두","커피-믹스커피","차-아이스티","차-녹차","차-둥굴레차","차-보리차","물품-종이컵(소)","물품-종이컵(중)","물품-스틱","간식-오트밀","간식-쌀과자","간식-카페비스킷","간식-약과","간식-폴로","간식-맨톨캔디","간식-후르츠캔디","간식-커피캔디","간식-비타민캔디","기타"],
    "위생/청소용품":["핸드타올/티슈","롤화장지","비닐 봉투","손세정제액체","종량제봉투","물티슈","페브리즈","세제","소독제","방향제","기타"],
    "문구/사무":["복사용지A4","복사용지A3","보드마카","수정테이프","영수증용지","기타"],
    비품:["가구","전자기기","기타"],수수료:["결제수수료","플랫폼수수료","기타"],
  }},
  운영비:{ color:"#4a1942",accent:"#9b5de5",icon:"🏪",children:{임차료:[],관리비:[],인터넷:[],전기세:[],수도세:[],보험:[],기장료:[],청소인건비:[],정수기:[],프린트사용료:[],코보시스수수료:[],마케팅:["SNS광고","전단지","기타"],기타:[]}},
  세금:{ color:"#7b2d00",accent:"#c1440e",icon:"🔴",children:{부가가치세:[],소득세:[],기타:[]}},
};
const TREE_REALTY = {
  수입:{ color:"#2d6a4f",accent:"#52b788",icon:"💰",children:{매도가:[],임대수입:[],기타:[]}},
  취득비용:{ color:"#b5451b",accent:"#e07a5f",icon:"🏠",children:{취득가:[],취득세:[],등기비:[],중개수수료:[],기타:[]}},
  보유비용:{ color:"#0077b6",accent:"#48cae4",icon:"📋",children:{대출이자:["주택담보대출","신용대출","기타"],관리비:[],수리비:[],재산세:[],종합부동산세:[],기장료:[],기타:[]}},
  처분비용:{ color:"#4a1942",accent:"#9b5de5",icon:"📝",children:{양도세:[],중개수수료:[],명도비:[],종합소득세:[],지방세:[],기타:[]}},
  세금:{ color:"#7b2d00",accent:"#c1440e",icon:"🔴",children:{부가가치세:[],종합소득세:[],기타:[]}},
};
const TREES_DEFAULT = { personal:TREE_PERSONAL, cafe:TREE_CAFE, realty:TREE_REALTY };
const CAT_KEY = "gagibu_cats";
const VENDOR_KEY = "gagibu_vendors";
function loadVendors(){ try{return JSON.parse(localStorage.getItem(VENDOR_KEY)||"[]");}catch{return[];} }
function saveVendor(v){ if(!v)return; const list=[...new Set([v,...loadVendors()])].slice(0,30); localStorage.setItem(VENDOR_KEY,JSON.stringify(list)); }
function loadTrees(){
  try{
    const saved=JSON.parse(localStorage.getItem(CAT_KEY));
    if(saved){
      // 처분비용에 종합소득세/지방세 없으면 추가
      const rc = saved.realty?.처분비용?.children;
      if(rc && !("종합소득세" in rc)) rc["종합소득세"] = [];
      if(rc && !("지방세" in rc)) rc["지방세"] = [];
      return saved;
    }
  }catch{}
  return JSON.parse(JSON.stringify(TREES_DEFAULT));
}
// global mutable reference — updated by App and read by TxForm/etc via prop
let TREES = loadTrees();

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
const fmtS = n => n.toLocaleString("ko-KR")+"원";
const MONTHS    = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_KO = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

/* ── Supabase 연결 상태 확인 ── */
const isConfigured = () => !SUPABASE_URL.includes("your-project");

/* ── LoginScreen ── */
function LoginScreen({onLogin}){
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);

  async function handleSubmit(e){
    e.preventDefault();
    setErr("");
    setLoading(true);
    const {data,error}=await supabaseClient.auth.signInWithPassword({email,password:pw});
    setLoading(false);
    if(error){setErr("이메일 또는 비밀번호가 올바르지 않습니다.");return;}
    onLogin(data.session);
  }

  return(
    <div style={{minHeight:"100vh",background:"#f5f0e8",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div style={{background:"#fff",borderRadius:"24px",padding:"40px 32px",width:"100%",maxWidth:"360px",
        boxShadow:"0 8px 40px rgba(0,0,0,0.10)"}}>
        <div style={{textAlign:"center",marginBottom:"32px"}}>
          <div style={{fontSize:"28px",fontWeight:800,color:"#3d2b20",fontFamily:"'Inter',sans-serif",letterSpacing:"-0.5px"}}>가계부</div>
          <div style={{fontSize:"12px",color:"#9c8e82",marginTop:"4px",fontFamily:"'Inter',sans-serif"}}>로그인 후 이용하세요</div>
        </div>
        <form onSubmit={handleSubmit} style={{display:"flex",flexDirection:"column",gap:"12px"}}>
          <input type="email" placeholder="이메일" value={email} onChange={e=>setEmail(e.target.value)} required
            style={{padding:"13px 16px",borderRadius:"12px",border:"1px solid #e8e0d4",fontSize:"14px",
              outline:"none",fontFamily:"'Inter',sans-serif",background:"#faf8f4"}}/>
          <input type="password" placeholder="비밀번호" value={pw} onChange={e=>setPw(e.target.value)} required
            style={{padding:"13px 16px",borderRadius:"12px",border:"1px solid #e8e0d4",fontSize:"14px",
              outline:"none",fontFamily:"'Inter',sans-serif",background:"#faf8f4"}}/>
          {err&&<div style={{fontSize:"12px",color:"#b5451b",fontFamily:"'Inter',sans-serif",textAlign:"center"}}>{err}</div>}
          <button type="submit" disabled={loading}
            style={{padding:"14px",borderRadius:"12px",border:"none",background:"#3d2b20",color:"#fff",
              fontSize:"14px",fontWeight:700,cursor:"pointer",fontFamily:"'Inter',sans-serif",marginTop:"4px",
              opacity:loading?0.6:1}}>
            {loading?"로그인 중…":"로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Modal ── */
function Modal({open,onClose,children}){
  if(!open)return null;
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(26,20,16,0.6)",
      zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center",backdropFilter:"blur(2px)"}}>
      <div onClick={e=>e.stopPropagation()} className="animate-up" style={{
        background:C.paper,borderRadius:"24px 24px 0 0",padding:"8px 20px calc(36px + env(safe-area-inset-bottom))",
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
function TxForm({initial,onSave,onDelete,onDuplicate,cards,defaultEntity="personal",saving,supplies=[],propertyTags=[]}){
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
  const initCat1=init.cat1||(entity==="personal"?"지출-용돈":entity==="cafe"?"매입/원가":entity==="realty"?"취득비용":Object.keys(TREES[entity])[0]);
  const [cat1,setCat1]=useState(initCat1);
  const [group,setGroup]=useState(deriveGroup(initCat1));
  const [cat2,setCat2]=useState(init.cat2||Object.keys(tree[initCat1]?.children||{})[0]||"");
  const [cat3,setCat3]=useState(init.cat3||"");
  const [pendingImages,setPendingImages]=useState([]); // {file, preview}
  const [existingImages,setExistingImages]=useState(init.images||[]);
  const [uploadingImages,setUploadingImages]=useState(false);
  const imgInputRef=useRef(null);
  const [amount,setAmount]=useState(init.amount?Number(init.amount).toLocaleString("ko-KR"):"");
  // memo에 "구매처 · 메모" 형식으로 저장된 경우 분리
  const _memoRaw=init.memo||"";
  const _dotIdx=_memoRaw.indexOf(" · ");
  const _initVendor=_dotIdx>0?_memoRaw.slice(0,_dotIdx):"";
  const _initMemo=_dotIdx>0?_memoRaw.slice(_dotIdx+3):_memoRaw;
  const [memo,setMemo]=useState(_initMemo);
  const [date,setDate]=useState(init.date||today);
  const [cardId,setCardId]=useState(init.cardId||"");
  const [isFixed,setIsFixed]=useState(init.isFixed||false);
  const [fixedDay,setFixedDay]=useState(init.fixedDay||"");
  const [isBiMonthly,setIsBiMonthly]=useState(()=>{
    try{const s=new Set(JSON.parse(localStorage.getItem("gagibu_bimonthly")||"[]"));return s.has(`${init.entity||defaultEntity}:${init.memo||""}`);}catch{return false;}
  });
  const [vendor,setVendor]=useState(_initVendor);
  const [vendorOpen,setVendorOpen]=useState(false);
  const [knownVendors]=useState(()=>loadVendors());
  const [isSupply,setIsSupply]=useState(false);
  const [supplyName,setSupplyName]=useState("");
  const [supplyCat,setSupplyCat]=useState("소모품");
  const [err,setErr]=useState(false);
  const isEdit=!!(initial?.id);
  const showSupplyToggle = entity==="cafe" && cat1==="매입/원가";

  // 항목이 바뀔 때 소모품 매칭되면 토글 자동 ON
  useEffect(()=>{
    if(!showSupplyToggle||!supplies.length) return;
    const name=(cat3||cat2||"").toLowerCase();
    const match=supplies.find(s=>(s.name||"").toLowerCase()===name);
    if(match){
      setIsSupply(true);
      setSupplyName(match.name);
      setSupplyCat(cat2||"소모품");
    }
  },[cat2,cat3]);

  function pickEntity(e){
    setEntity(e);
    const t=TREES[e];
    const k1=e==="personal"?"지출-용돈":e==="cafe"?"매입/원가":e==="realty"?"취득비용":Object.keys(t)[0];
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

  async function submit(){
    const num=parseInt(String(amount).replace(/,/g,""));
    if(!num||num<=0){setErr(true);setTimeout(()=>setErr(false),400);return;}
    const isIncome=(cat1.includes("수입")||cat1.includes("매출")||cat1.startsWith("저축"));
    const supplyData=isSupply&&showSupplyToggle
      ?{name:(supplyName.trim()||memo.trim()||cat2),category:supplyCat,
        cycle_days:null,last_bought:date,
        last_amount:num,base_amount:num}
      :null;
    if(vendor.trim()) saveVendor(vendor.trim());
    const finalMemo=[vendor.trim(),memo.trim()||cat3||cat2].filter(Boolean).join(" · ");
    try{
      const bmKey="gagibu_bimonthly";
      const key=`${entity}:${finalMemo}`;
      const s=new Set(JSON.parse(localStorage.getItem(bmKey)||"[]"));
      if(isFixed&&isBiMonthly)s.add(key); else s.delete(key);
      localStorage.setItem(bmKey,JSON.stringify([...s]));
    }catch{}
    const txId=init.id||Date.now();
    let uploadedPaths=[];
    if(pendingImages.length>0){
      setUploadingImages(true);
      try{
        uploadedPaths=await Promise.all(pendingImages.map(img=>uploadTxImage(txId,img.file)));
      }catch(e){console.error("image upload failed",e);}
      finally{setUploadingImages(false);}
    }
    onSave({id:txId,entity,cat1,cat2,cat3:cat3||"",
      amount:num,memo:finalMemo,date,cardId,
      isFixed,fixedDay:isFixed&&fixedDay?parseInt(fixedDay):null,
      type:isIncome?"income":"expense",supplyData,
      images:[...existingImages,...uploadedPaths]});
  }

  return(
    <div style={{fontFamily:"'Inter',sans-serif"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:"8px"}}>
          <span style={{fontFamily:"'Inter',sans-serif",fontSize:"18px",fontWeight:700,color:C.ink}}>{isEdit?"거래 수정":"거래 추가"}</span>
        </div>
        {isEdit&&(
          <div style={{display:"flex",gap:"6px"}}>
            {onDuplicate&&(
              <button onClick={onDuplicate} disabled={saving} style={{display:"flex",alignItems:"center",gap:"5px",
                background:"#f0f4ff",border:"1px solid #b0c4de",borderRadius:"8px",
                padding:"6px 12px",cursor:"pointer",color:"#1d4e89",fontSize:"12px",fontWeight:600}}>
                <Copy size={13}/> 복사
              </button>
            )}
            <button onClick={onDelete} disabled={saving} style={{display:"flex",alignItems:"center",gap:"5px",
              background:"#fff1ee",border:"1px solid #f4c5b2",borderRadius:"8px",
              padding:"6px 12px",cursor:"pointer",color:"#b5451b",fontSize:"12px",fontWeight:600}}>
              <Trash2 size={13}/> 삭제
            </button>
          </div>
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
      {cat3list.length>0&&(
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
      {entity==="realty"&&(()=>{
        // 트리 전체의 cat3list 값을 수집해 물건 태그에서 제외
        const allSubcats=new Set(Object.values(tree).flatMap(n=>Object.values(n.children||{}).flatMap(v=>Array.isArray(v)?v:[])));
        const realPropTags=propertyTags.filter(k=>!allSubcats.has(k));
        return (
          <div style={{marginBottom:"8px"}}>
            <SLabel>물건 태그</SLabel>
            {realPropTags.length>0&&(
              <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"7px"}}>
                {realPropTags.map(k=>(
                  <button key={k} className="cat-btn" onClick={()=>setCat3(cat3===k?"":k)} style={{
                    padding:"5px 12px",borderRadius:"99px",cursor:"pointer",fontSize:"12px",fontWeight:500,
                    fontFamily:"'Inter',sans-serif",
                    border:`1.5px solid ${cat3===k?m1.color:C.border}`,
                    background:cat3===k?m1.color+"14":"#fff",color:cat3===k?m1.color:C.inkMid}}>
                    {k}
                  </button>
                ))}
              </div>
            )}
            <Inp value={cat3list.includes(cat3)?"":cat3} onChange={e=>setCat3(e.target.value)} placeholder="새 물건 태그 입력"/>
          </div>
        );
      })()}

      {/* 이미지 첨부 (부동산만) */}
      {entity==="realty"&&(
        <div style={{marginBottom:"12px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"7px"}}>
            <SLabel style={{marginBottom:0}}>영수증/사진</SLabel>
            <button type="button" onClick={()=>imgInputRef.current?.click()}
              style={{display:"flex",alignItems:"center",gap:"4px",fontSize:"11px",fontWeight:600,
                color:"#1d4e89",background:"#e8f0fb",border:"none",borderRadius:"8px",
                padding:"4px 10px",cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
              📎 첨부
            </button>
          </div>
          <input ref={imgInputRef} type="file" accept="image/*" multiple style={{display:"none"}}
            onChange={e=>{
              const files=Array.from(e.target.files||[]);
              const newImgs=files.map(f=>({file:f,preview:URL.createObjectURL(f)}));
              setPendingImages(p=>[...p,...newImgs]);
              e.target.value="";
            }}/>
          {(existingImages.length>0||pendingImages.length>0)&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
              {existingImages.map((path,i)=>(
                <div key={path} style={{position:"relative",width:64,height:64}}>
                  <img src={getTxImageUrl(path)} alt=""
                    style={{width:64,height:64,objectFit:"cover",borderRadius:"8px",border:`1px solid ${C.border}`}}/>
                  <button type="button" onClick={()=>setExistingImages(p=>p.filter((_,j)=>j!==i))}
                    style={{position:"absolute",top:-5,right:-5,width:18,height:18,borderRadius:"50%",
                      background:"#b5451b",color:"#fff",border:"none",cursor:"pointer",
                      fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>×</button>
                </div>
              ))}
              {pendingImages.map((img,i)=>(
                <div key={i} style={{position:"relative",width:64,height:64}}>
                  <img src={img.preview} alt=""
                    style={{width:64,height:64,objectFit:"cover",borderRadius:"8px",border:`1.5px dashed ${C.border}`}}/>
                  <button type="button" onClick={()=>setPendingImages(p=>p.filter((_,j)=>j!==i))}
                    style={{position:"absolute",top:-5,right:-5,width:18,height:18,borderRadius:"50%",
                      background:"#b5451b",color:"#fff",border:"none",cursor:"pointer",
                      fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>×</button>
                </div>
              ))}
            </div>
          )}
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
            borderRadius:"0 0 12px 12px",padding:"12px 14px"}}>
            {/* 매월 발생일 */}
            <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"10px"}}>
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
            {/* 격월 토글 */}
            <button onClick={()=>setIsBiMonthly(b=>!b)} style={{
              display:"flex",alignItems:"center",gap:"8px",background:"none",border:"none",cursor:"pointer",padding:"2px 0"}}>
              <div style={{width:"32px",height:"18px",borderRadius:"99px",flexShrink:0,position:"relative",
                background:isBiMonthly?"#b5451b":"#f4c5b2",transition:"background 0.2s"}}>
                <div style={{width:"14px",height:"14px",borderRadius:"50%",background:"#fff",
                  position:"absolute",top:"2px",transition:"left 0.2s",
                  left:isBiMonthly?"16px":"2px",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
              </div>
              <span style={{fontSize:"11px",fontWeight:600,color:"#b5451b",fontFamily:"'Inter',sans-serif"}}>
                격월 (두 달에 한 번)
              </span>
            </button>
          </div>
        )}
      </div>

      {/* 소모품 매칭 안내 (토글 off 상태에서도 표시) */}
      {showSupplyToggle&&!isSupply&&(()=>{
        const name=(cat3||cat2||memo.trim()||"").toLowerCase();
        const match=supplies.find(s=>(s.name||"").toLowerCase()===name);
        return match?<div style={{marginBottom:"8px",padding:"7px 12px",borderRadius:"8px",
          background:"#f0fdf4",border:"1px solid #b7e4c7",
          fontSize:"11px",color:"#2d6a4f",fontFamily:"'Inter',sans-serif"}}>
          소모품 <b>{match.name}</b> 과 연결됩니다 — 토글을 켜면 구매일이 업데이트돼요
        </div>:null;
      })()}

      {/* Supply toggle — cafe + 매입/원가 only */}
      {showSupplyToggle&&(
        <div style={{marginBottom:"12px"}}>
          <button onClick={()=>{const next=!isSupply;setIsSupply(next);if(next&&!supplyName)setSupplyName(cat3||cat2||memo.trim()||"");if(next)setSupplyCat(cat2||"소모품");}} style={{
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

      {/* 구매처 + 날짜 */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"10px"}}>
        <div style={{position:"relative"}}>
          <SLabel>구매처</SLabel>
          <Inp value={vendor} onChange={e=>setVendor(e.target.value)}
            placeholder="예: 쿠팡, 마트"
            onFocus={()=>setVendorOpen(true)}
            onBlur={()=>setTimeout(()=>setVendorOpen(false),150)}/>
          {vendorOpen&&knownVendors.length>0&&(
            <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,
              background:C.white,border:`1px solid ${C.border}`,borderRadius:"10px",
              boxShadow:"0 4px 16px rgba(0,0,0,0.10)",marginTop:"3px",
              maxHeight:"160px",overflowY:"auto"}}>
              {knownVendors.filter(v=>!vendor||v.toLowerCase().includes(vendor.toLowerCase())).map(v=>(
                <div key={v} onMouseDown={()=>setVendor(v)}
                  style={{padding:"9px 14px",fontSize:"13px",color:C.ink,cursor:"pointer",
                    fontFamily:"'Inter',sans-serif",borderBottom:`1px solid ${C.border}`}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.cream}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  {v}
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <SLabel>날짜</SLabel>
          <div style={{display:"flex",gap:"5px",alignItems:"center"}}>
            <Inp type="date" value={date} onChange={e=>setDate(e.target.value)} style={{flex:1}}/>
            {date!==today&&<button onClick={()=>setDate(today)} style={{
              flexShrink:0,padding:"6px 9px",border:`1.5px solid ${C.border}`,borderRadius:"8px",
              background:C.white,color:C.inkLight,cursor:"pointer",fontSize:"10px",fontWeight:600,
              fontFamily:"'Inter',sans-serif",whiteSpace:"nowrap"}}>오늘</button>}
          </div>
        </div>
      </div>
      {/* 메모 */}
      <div style={{marginBottom:"14px"}}>
        <SLabel>메모</SLabel><Inp value={memo} onChange={e=>setMemo(e.target.value)} placeholder="선택사항"/>
      </div>

      <button className="add-btn" onClick={submit} disabled={saving||uploadingImages} style={{
        width:"100%",padding:"13px",background:(saving||uploadingImages)?"#9c8e82":ent.color,color:"#fff",border:"none",
        borderRadius:"13px",fontSize:"15px",fontWeight:600,cursor:(saving||uploadingImages)?"not-allowed":"pointer",
        display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",
        fontFamily:"'Inter',sans-serif",boxShadow:`0 4px 18px ${ent.color}55`,transition:"all 0.2s"}}>
        {uploadingImages
          ? <><RefreshCw size={16} className="spin"/> 이미지 업로드 중...</>
          : saving
            ? <><RefreshCw size={16} className="spin"/> 저장 중...</>
            : isEdit?<><Check size={16}/> 저장하기</>:<><PlusCircle size={16}/> 추가하기</>}
      </button>
    </div>
  );
}

/* ── Card Settings ── */
/* ── CategorySettings ── */
function CategorySettings({trees, onChange}){
  const ENTITY_LABELS={personal:"개인",cafe:"카페",realty:"부동산"};
  const [ent,setEnt]=useState("personal");
  const [openCat1,setOpenCat1]=useState(null);
  const [adding,setAdding]=useState(null);
  const [addVal,setAddVal]=useState("");
  const [draft,setDraft]=useState(()=>JSON.parse(JSON.stringify(trees[ent]||{})));
  const [dirty,setDirty]=useState(false);
  const [editCat1,setEditCat1]=useState(null);
  const [editCat2,setEditCat2]=useState(null);
  const [editCat3,setEditCat3]=useState(null); // {cat1,cat2,name,val}
  const [openCat2,setOpenCat2]=useState({});
  const [dragCat1,setDragCat1]=useState(null);
  const [dragOverCat1,setDragOverCat1]=useState(null);
  const [dragCat2,setDragCat2]=useState(null); // {cat1,idx}
  const [dragOverCat2,setDragOverCat2]=useState(null); // {cat1,idx}
  const [dragCat3,setDragCat3]=useState(null); // {cat1,cat2,idx}
  const [dragOverCat3,setDragOverCat3]=useState(null); // {cat1,cat2,idx}
  const tree=draft||{};

  function reorderCat1(fromKey,toKey){
    const entries=Object.entries(tree);
    const fi=entries.findIndex(([k])=>k===fromKey);
    const ti=entries.findIndex(([k])=>k===toKey);
    const r=[...entries];const [m]=r.splice(fi,1);r.splice(ti,0,m);
    update(Object.fromEntries(r));
  }
  function reorderCat2(cat1,fromIdx,toIdx){
    const node=tree[cat1];if(!node)return;
    const entries=Object.entries(node.children);
    const [m]=entries.splice(fromIdx,1);entries.splice(toIdx,0,m);
    update({...tree,[cat1]:{...node,children:Object.fromEntries(entries)}});
  }
  function reorderCat3(cat1,cat2,fromIdx,toIdx){
    const node=tree[cat1];if(!node)return;
    const list=[...(node.children[cat2]||[])];
    const [m]=list.splice(fromIdx,1);list.splice(toIdx,0,m);
    update({...tree,[cat1]:{...node,children:{...node.children,[cat2]:list}}});
  }

  const [renameOps,setRenameOps]=useState([]);

  function switchEnt(k){
    setEnt(k);setOpenCat1(null);setAdding(null);setEditCat1(null);setEditCat2(null);
    setDraft(JSON.parse(JSON.stringify(trees[k]||{})));
    setDirty(false);setRenameOps([]);
  }

  function update(next){ setDraft(next); setDirty(true); }

  function commit(){
    onChange({...trees,[ent]:draft}, renameOps);
    setDirty(false);setRenameOps([]);
  }

  function addCat1(){
    const name=addVal.trim();
    if(!name||tree[name])return;
    update({...tree,[name]:{color:"#888",accent:"#aaa",icon:"",children:{}}});
    setAdding(null);setAddVal("");
  }
  function delCat1(k){
    const next={...tree};delete next[k];
    if(openCat1===k)setOpenCat1(null);
    update(next);
  }
  function renameCat1(oldKey,newKey){
    const name=newKey.trim();
    if(!name||name===oldKey||tree[name])return;
    const next=Object.fromEntries(Object.entries(tree).map(([k,v])=>[k===oldKey?name:k,v]));
    if(openCat1===oldKey)setOpenCat1(name);
    update(next);
    setEditCat1(null);
    setRenameOps(ops=>[...ops,{level:"cat1",entity:ent,old:oldKey,new:name}]);
  }

  function addCat2(cat1){
    const name=addVal.trim();
    if(!name)return;
    const node=tree[cat1];if(!node)return;
    update({...tree,[cat1]:{...node,children:{...node.children,[name]:[]}}});
    setAdding(null);setAddVal("");
  }
  function delCat2(cat1,cat2){
    const node=tree[cat1];if(!node)return;
    const children={...node.children};delete children[cat2];
    update({...tree,[cat1]:{...node,children}});
  }
  function renameCat2(cat1,oldKey,newKey){
    const name=newKey.trim();
    if(!name||name===oldKey)return;
    const node=tree[cat1];if(!node)return;
    const children=Object.fromEntries(Object.entries(node.children).map(([k,v])=>[k===oldKey?name:k,v]));
    update({...tree,[cat1]:{...node,children}});
    setEditCat2(null);
    setRenameOps(ops=>[...ops,{level:"cat2",entity:ent,cat1,old:oldKey,new:name}]);
  }

  function addCat3(cat1,cat2){
    const name=addVal.trim();
    if(!name)return;
    const node=tree[cat1];if(!node)return;
    const list=[...(node.children[cat2]||[])];
    if(list.includes(name))return;
    list.push(name);
    update({...tree,[cat1]:{...node,children:{...node.children,[cat2]:list}}});
    setAdding(null);setAddVal("");
  }
  function delCat3(cat1,cat2,cat3){
    const node=tree[cat1];if(!node)return;
    const list=(node.children[cat2]||[]).filter(x=>x!==cat3);
    update({...tree,[cat1]:{...node,children:{...node.children,[cat2]:list}}});
  }
  function renameCat3(cat1,cat2,oldName,newName){
    const n=newName.trim();if(!n||n===oldName)return setEditCat3(null);
    const node=tree[cat1];if(!node)return;
    const list=(node.children[cat2]||[]).map(x=>x===oldName?n:x);
    update({...tree,[cat1]:{...node,children:{...node.children,[cat2]:list}}});
    setRenameOps(ops=>[...ops,{level:"cat3",entity:ent,cat1,cat2,old:oldName,new:n}]);
    setEditCat3(null);
  }

  const btnAdd={background:"#f5f7ff",border:"1px dashed #b0c4de",borderRadius:"8px",
    padding:"4px 10px",cursor:"pointer",color:"#1d4e89",fontSize:"12px",fontWeight:600,
    display:"flex",alignItems:"center",gap:"4px"};
  const btnDel={background:"none",border:"none",cursor:"pointer",color:"#ccc",
    padding:"2px 4px",borderRadius:"4px",display:"flex",alignItems:"center",
    fontSize:"11px",lineHeight:1};

  return(
    <div style={{fontFamily:"'Inter',sans-serif",width:"100%"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:"8px",marginBottom:"18px"}}>
        <span style={{fontSize:"19px",fontWeight:700,color:C.ink}}>카테고리 관리</span>
      </div>
      {/* entity tabs */}
      <div style={{display:"flex",gap:"6px",marginBottom:"16px"}}>
        {Object.entries(ENTITY_LABELS).map(([k,v])=>(
          <button key={k} onClick={()=>switchEnt(k)}
            style={{padding:"6px 14px",borderRadius:"20px",border:"none",cursor:"pointer",
              fontSize:"12px",fontWeight:600,
              background:ent===k?C.ink:"#f0f0f0",color:ent===k?"#fff":C.inkMid}}>
            {v}
          </button>
        ))}
      </div>

      {/* cat1 list */}
      <div style={{display:"flex",flexDirection:"column",gap:"8px",marginBottom:"12px"}}>
        {Object.keys(tree).map(cat1=>{
          const node=tree[cat1];
          const isOpen=openCat1===cat1;
          const isEditing=editCat1?.key===cat1;
          return(
            <div key={cat1} draggable
              onDragStart={()=>setDragCat1(cat1)}
              onDragOver={e=>{e.preventDefault();setDragOverCat1(cat1);}}
              onDrop={()=>{if(dragCat1&&dragCat1!==cat1)reorderCat1(dragCat1,cat1);setDragCat1(null);setDragOverCat1(null);}}
              onDragEnd={()=>{setDragCat1(null);setDragOverCat1(null);}}
              style={{border:`1px solid ${dragOverCat1===cat1?C.ink:C.border}`,borderRadius:"12px",overflow:"hidden",
                opacity:dragCat1===cat1?0.4:1,transition:"opacity 0.15s,border-color 0.15s"}}>
              {/* cat1 header */}
              <div style={{display:"flex",alignItems:"center",gap:"8px",padding:"8px 12px",
                background:C.cream}} onClick={()=>!isEditing&&setOpenCat1(isOpen?null:cat1)}>
                <GripVertical size={13} style={{color:C.border,flexShrink:0,cursor:"grab"}}/>
                {isEditing?(
                  <input autoFocus value={editCat1.val}
                    onChange={e=>setEditCat1({...editCat1,val:e.target.value})}
                    onKeyDown={e=>{if(e.key==="Enter")renameCat1(cat1,editCat1.val);if(e.key==="Escape")setEditCat1(null);}}
                    onClick={e=>e.stopPropagation()}
                    style={{flex:1,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"4px 8px",
                      fontSize:"13px",fontWeight:700,outline:"none",fontFamily:"'Inter',sans-serif"}}/>
                ):(
                  <span style={{flex:1,fontSize:"13px",fontWeight:700,color:C.ink,cursor:"pointer"}}>{cat1}</span>
                )}
                {isEditing?(
                  <>
                    <button onClick={e=>{e.stopPropagation();renameCat1(cat1,editCat1.val);}}
                      style={{background:"#f0fdf4",border:"1px solid #b7e4c7",borderRadius:"6px",
                        padding:"3px 8px",cursor:"pointer",color:"#2d6a4f",fontSize:"11px",fontWeight:600}}>저장</button>
                    <button onClick={e=>{e.stopPropagation();setEditCat1(null);}}
                      style={{background:"none",border:`1px solid ${C.border}`,borderRadius:"6px",
                        padding:"3px 8px",cursor:"pointer",color:C.inkLight,fontSize:"11px"}}>취소</button>
                  </>
                ):(
                  <>
                    <span style={{fontSize:"11px",color:C.inkLight,marginRight:"2px"}}>{Object.keys(node.children||{}).length}개</span>
                    <button onClick={e=>{e.stopPropagation();setEditCat1({key:cat1,val:cat1});}} style={btnDel}
                      onMouseEnter={e=>e.currentTarget.style.color=C.ink}
                      onMouseLeave={e=>e.currentTarget.style.color="#ccc"}>
                      <Pencil size={11}/>
                    </button>
                    <button onClick={e=>{e.stopPropagation();delCat1(cat1);}} style={btnDel}
                      onMouseEnter={e=>e.currentTarget.style.color="#e07a5f"}
                      onMouseLeave={e=>e.currentTarget.style.color="#ccc"}>
                      <Trash2 size={12}/>
                    </button>
                    <span style={{fontSize:"11px",color:C.inkLight,cursor:"pointer"}}>{isOpen?"▲":"▼"}</span>
                  </>
                )}
              </div>

              {/* cat2 list */}
              {isOpen&&(
                <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:"10px"}}>
                  {Object.entries(node.children||{}).map(([cat2,cat3list],cat2Idx)=>(
                    <div key={cat2} draggable
                      onDragStart={e=>{e.stopPropagation();setDragCat2({cat1,idx:cat2Idx});}}
                      onDragOver={e=>{e.preventDefault();e.stopPropagation();setDragOverCat2({cat1,idx:cat2Idx});}}
                      onDrop={e=>{e.stopPropagation();if(dragCat2&&dragCat2.cat1===cat1&&dragCat2.idx!==cat2Idx)reorderCat2(cat1,dragCat2.idx,cat2Idx);setDragCat2(null);setDragOverCat2(null);}}
                      onDragEnd={e=>{e.stopPropagation();setDragCat2(null);setDragOverCat2(null);}}
                      style={{opacity:dragCat2?.cat1===cat1&&dragCat2?.idx===cat2Idx?0.4:1,
                        border:`1px solid ${dragOverCat2?.cat1===cat1&&dragOverCat2?.idx===cat2Idx?C.ink:"transparent"}`,
                        borderRadius:"8px",transition:"opacity 0.15s,border-color 0.15s"}}>
                      {/* cat2 row */}
                      {editCat2?.cat1===cat1&&editCat2?.key===cat2?(
                        <div style={{display:"flex",gap:"6px",alignItems:"center",marginBottom:"6px"}}>
                          <span style={{fontSize:"11px",color:C.inkLight}}>▸</span>
                          <input autoFocus value={editCat2.val}
                            onChange={e=>setEditCat2({...editCat2,val:e.target.value})}
                            onKeyDown={e=>{if(e.key==="Enter")renameCat2(cat1,cat2,editCat2.val);if(e.key==="Escape")setEditCat2(null);}}
                            style={{flex:1,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"4px 8px",
                              fontSize:"12px",fontWeight:600,outline:"none",fontFamily:"'Inter',sans-serif"}}/>
                          <button onClick={()=>renameCat2(cat1,cat2,editCat2.val)}
                            style={{background:"#f0fdf4",border:"1px solid #b7e4c7",borderRadius:"6px",
                              padding:"3px 8px",cursor:"pointer",color:"#2d6a4f",fontSize:"11px",fontWeight:600}}>저장</button>
                          <button onClick={()=>setEditCat2(null)}
                            style={{background:"none",border:`1px solid ${C.border}`,borderRadius:"6px",
                              padding:"3px 8px",cursor:"pointer",color:C.inkLight,fontSize:"11px"}}>취소</button>
                        </div>
                      ):(
                        <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"6px"}}>
                          <GripVertical size={12} style={{color:C.border,flexShrink:0,cursor:"grab"}}/>
                          <button onClick={()=>setOpenCat2(p=>({...p,[`${cat1}::${cat2}`]:!p[`${cat1}::${cat2}`]}))}
                            style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:"4px",flex:1}}>
                            <span style={{fontSize:"10px",color:C.inkLight}}>{openCat2[`${cat1}::${cat2}`]?"▼":"▶"}</span>
                            <span style={{fontSize:"12px",fontWeight:600,color:C.inkMid}}>{cat2}</span>
                            {cat3list.length>0&&<span style={{fontSize:"10px",color:C.inkLight}}>({cat3list.length})</span>}
                          </button>
                          <button onClick={()=>{setAdding({level:"cat3",cat1,cat2});setAddVal(""); setOpenCat2(p=>({...p,[`${cat1}::${cat2}`]:true}));}}
                            style={btnAdd}><Plus size={11}/>소분류</button>
                          <button onClick={()=>setEditCat2({cat1,key:cat2,val:cat2})} style={btnDel}
                            onMouseEnter={e=>e.currentTarget.style.color=C.ink}
                            onMouseLeave={e=>e.currentTarget.style.color="#ccc"}>
                            <Pencil size={11}/>
                          </button>
                          <button onClick={()=>delCat2(cat1,cat2)} style={btnDel}
                            onMouseEnter={e=>e.currentTarget.style.color="#e07a5f"}
                            onMouseLeave={e=>e.currentTarget.style.color="#ccc"}>
                            <Trash2 size={11}/>
                          </button>
                        </div>
                      )}
                      {/* cat3 chips */}
                      {openCat2[`${cat1}::${cat2}`]&&Array.isArray(cat3list)&&cat3list.length>0&&(
                        <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"4px",paddingLeft:"12px"}}>
                          {cat3list.map((cat3,cat3Idx)=>{
                            const isEditingThis=editCat3?.cat1===cat1&&editCat3?.cat2===cat2&&editCat3?.name===cat3;
                            const isDragging=dragCat3?.cat1===cat1&&dragCat3?.cat2===cat2&&dragCat3?.idx===cat3Idx;
                            const isDragOver=dragOverCat3?.cat1===cat1&&dragOverCat3?.cat2===cat2&&dragOverCat3?.idx===cat3Idx;
                            return isEditingThis?(
                              <span key={cat3} style={{display:"inline-flex",alignItems:"center",gap:"3px"}}>
                                <input autoFocus value={editCat3.val}
                                  onChange={e=>setEditCat3({...editCat3,val:e.target.value})}
                                  onKeyDown={e=>{if(e.key==="Enter")renameCat3(cat1,cat2,cat3,editCat3.val);if(e.key==="Escape")setEditCat3(null);}}
                                  style={{border:`1px solid ${C.border}`,borderRadius:"20px",padding:"3px 8px",
                                    fontSize:"11px",outline:"none",fontFamily:"'Inter',sans-serif",width:"90px"}}/>
                                <button onClick={()=>renameCat3(cat1,cat2,cat3,editCat3.val)}
                                  style={{background:"#f0fdf4",border:"1px solid #b7e4c7",borderRadius:"6px",
                                    padding:"2px 6px",cursor:"pointer",color:"#2d6a4f",fontSize:"10px",fontWeight:600}}>저장</button>
                                <button onClick={()=>setEditCat3(null)}
                                  style={{background:"none",border:`1px solid ${C.border}`,borderRadius:"6px",
                                    padding:"2px 6px",cursor:"pointer",color:C.inkLight,fontSize:"10px"}}>취소</button>
                              </span>
                            ):(
                              <span key={cat3} draggable
                                onDragStart={e=>{e.stopPropagation();setDragCat3({cat1,cat2,idx:cat3Idx});}}
                                onDragOver={e=>{e.preventDefault();e.stopPropagation();setDragOverCat3({cat1,cat2,idx:cat3Idx});}}
                                onDrop={e=>{e.stopPropagation();if(dragCat3&&dragCat3.cat1===cat1&&dragCat3.cat2===cat2&&dragCat3.idx!==cat3Idx)reorderCat3(cat1,cat2,dragCat3.idx,cat3Idx);setDragCat3(null);setDragOverCat3(null);}}
                                onDragEnd={()=>{setDragCat3(null);setDragOverCat3(null);}}
                                style={{display:"inline-flex",alignItems:"center",gap:"3px",
                                  background:"#fff",border:`1px solid ${isDragOver?C.ink:C.border}`,borderRadius:"20px",
                                  padding:"3px 10px 3px 6px",fontSize:"11px",color:C.ink,
                                  opacity:isDragging?0.4:1,cursor:"grab"}}>
                                <GripVertical size={9} style={{color:C.border,flexShrink:0}}/>
                                {cat3}
                                <button onClick={()=>setEditCat3({cat1,cat2,name:cat3,val:cat3})}
                                  style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",
                                    padding:"0 0 0 1px",display:"flex",lineHeight:1}}
                                  onMouseEnter={e=>e.currentTarget.style.color=C.inkMid}
                                  onMouseLeave={e=>e.currentTarget.style.color="#ccc"}>
                                  <Pencil size={9}/>
                                </button>
                                <button onClick={()=>delCat3(cat1,cat2,cat3)} style={{background:"none",border:"none",
                                  cursor:"pointer",color:"#ccc",padding:"0 0 0 1px",display:"flex",lineHeight:1}}
                                  onMouseEnter={e=>e.currentTarget.style.color="#e07a5f"}
                                  onMouseLeave={e=>e.currentTarget.style.color="#ccc"}>
                                  <X size={10}/>
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {/* cat3 add inline */}
                      {adding?.level==="cat3"&&adding.cat1===cat1&&adding.cat2===cat2&&(
                        <div style={{display:"flex",gap:"6px",marginTop:"4px",paddingLeft:"12px"}}>
                          <input autoFocus value={addVal} onChange={e=>setAddVal(e.target.value)}
                            onKeyDown={e=>{if(e.key==="Enter")addCat3(cat1,cat2);if(e.key==="Escape"){setAdding(null);setAddVal("");}}}
                            placeholder="항목 이름" style={{flex:1,border:`1px solid ${C.border}`,borderRadius:"8px",
                              padding:"5px 10px",fontSize:"12px",outline:"none",fontFamily:"'Inter',sans-serif"}}/>
                          <button onClick={()=>addCat3(cat1,cat2)} style={{background:C.ink,border:"none",
                            borderRadius:"8px",padding:"5px 12px",color:"#fff",cursor:"pointer",fontSize:"12px",fontWeight:600}}>추가</button>
                          <button onClick={()=>{setAdding(null);setAddVal("");}} style={{background:C.cream,border:`1px solid ${C.border}`,
                            borderRadius:"8px",padding:"5px 10px",color:C.inkLight,cursor:"pointer",fontSize:"12px"}}>취소</button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* add cat2 */}
                  {adding?.level==="cat2"&&adding.cat1===cat1?(
                    <div style={{display:"flex",gap:"6px",marginTop:"4px"}}>
                      <input autoFocus value={addVal} onChange={e=>setAddVal(e.target.value)}
                        onKeyDown={e=>{if(e.key==="Enter")addCat2(cat1);if(e.key==="Escape"){setAdding(null);setAddVal("");}}}
                        placeholder="중분류 이름" style={{flex:1,border:`1px solid ${C.border}`,borderRadius:"8px",
                          padding:"5px 10px",fontSize:"12px",outline:"none",fontFamily:"'Inter',sans-serif"}}/>
                      <button onClick={()=>addCat2(cat1)} style={{background:C.ink,border:"none",
                        borderRadius:"8px",padding:"5px 12px",color:"#fff",cursor:"pointer",fontSize:"12px",fontWeight:600}}>추가</button>
                      <button onClick={()=>{setAdding(null);setAddVal("");}} style={{background:C.cream,border:`1px solid ${C.border}`,
                        borderRadius:"8px",padding:"5px 10px",color:C.inkLight,cursor:"pointer",fontSize:"12px"}}>취소</button>
                    </div>
                  ):(
                    <button onClick={()=>{setAdding({level:"cat2",cat1});setAddVal("");}} style={{...btnAdd,alignSelf:"flex-start"}}>
                      <Plus size={11}/>중분류 추가
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* add cat1 */}
        {adding?.level==="cat1"?(
          <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
            <input autoFocus value={addVal} onChange={e=>setAddVal(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter")addCat1();if(e.key==="Escape"){setAdding(null);setAddVal("");}}}
              placeholder="대분류 이름" style={{flex:1,border:`1px solid ${C.border}`,borderRadius:"8px",
                padding:"7px 10px",fontSize:"13px",outline:"none",fontFamily:"'Inter',sans-serif"}}/>
            <button onClick={addCat1} style={{background:C.ink,border:"none",
              borderRadius:"8px",padding:"7px 14px",color:"#fff",cursor:"pointer",fontSize:"13px",fontWeight:600}}>추가</button>
            <button onClick={()=>{setAdding(null);setAddVal("");}} style={{background:C.cream,border:`1px solid ${C.border}`,
              borderRadius:"8px",padding:"7px 10px",color:C.inkLight,cursor:"pointer",fontSize:"12px"}}>취소</button>
          </div>
        ):(
          <button onClick={()=>{setAdding({level:"cat1"});setAddVal("");}}
            style={{...btnAdd,padding:"8px 14px",borderRadius:"10px",fontSize:"13px"}}>
            <Plus size={13}/>대분류 추가
          </button>
        )}
      </div>
      <button onClick={commit} disabled={!dirty}
        style={{width:"100%",marginTop:"12px",padding:"12px",border:"none",borderRadius:"12px",
          cursor:dirty?"pointer":"not-allowed",fontSize:"14px",fontWeight:700,
          background:dirty?C.ink:"#e0e0e0",color:dirty?"#fff":"#aaa",
          fontFamily:"'Inter',sans-serif",transition:"all 0.2s"}}>
        {dirty?"저장하기":"변경사항 없음"}
      </button>
    </div>
  );
}

function CardSettings({cards,onChange,saving}){
  const [newName,setNewName]=useState("");
  const [newColor,setNewColor]=useState(CARD_COLORS[0]);
  const [editId,setEditId]=useState(null);
  const [editName,setEditName]=useState("");
  const [dragIdx,setDragIdx]=useState(null);
  const [dragOver,setDragOver]=useState(null);

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
  function handleDragStart(i){setDragIdx(i);}
  function handleDragOver(e,i){e.preventDefault();setDragOver(i);}
  async function handleDrop(i){
    if(dragIdx===null||dragIdx===i){setDragIdx(null);setDragOver(null);return;}
    const reordered=[...cards];
    const [moved]=reordered.splice(dragIdx,1);
    reordered.splice(i,0,moved);
    setDragIdx(null);setDragOver(null);
    await onChange(reordered,"reorder",reordered);
  }

  return(
    <div style={{fontFamily:"'Inter',sans-serif"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:"8px",marginBottom:"22px"}}>
        <span style={{fontFamily:"'Inter',sans-serif",fontSize:"21px",color:C.ink}}>결제수단 관리</span>
        <span style={{fontSize:"11px",color:C.inkLight}}>Cards</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:"8px",marginBottom:"20px"}}>
        {cards.map((c,i)=>(
          <div key={c.id} draggable onDragStart={()=>handleDragStart(i)}
            onDragOver={e=>handleDragOver(e,i)} onDrop={()=>handleDrop(i)} onDragEnd={()=>{setDragIdx(null);setDragOver(null);}}
            style={{display:"flex",alignItems:"center",gap:"10px",
              background:C.white,borderRadius:"12px",padding:"11px 14px",border:`1px solid ${dragOver===i?C.ink:C.border}`,
              opacity:dragIdx===i?0.4:1,transition:"opacity 0.15s,border-color 0.15s",cursor:"default"}}>
            <GripVertical size={14} style={{color:C.border,flexShrink:0,cursor:"grab"}}/>
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
function PropTagDropdown({tags, value, onChange}){
  const [open,setOpen]=useState(false);
  const all=["전체",...tags];
  return(
    <div style={{position:"relative",marginBottom:"4px",display:"inline-block",minWidth:"120px",maxWidth:"220px"}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          width:"100%",padding:"7px 12px",borderRadius:"10px",cursor:"pointer",
          background:C.white,border:`1px solid ${value==="전체"?C.border:C.ink}`,
          fontFamily:"'Inter',sans-serif",fontSize:"13px",fontWeight:value==="전체"?400:600,
          color:value==="전체"?C.inkMid:C.ink,outline:"none"}}>
        <span>{value}</span>
        <ChevronRight size={14} style={{color:C.inkLight,transform:open?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s"}}/>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:50,
          background:C.white,border:`1px solid ${C.border}`,borderRadius:"12px",
          boxShadow:"0 8px 24px rgba(0,0,0,0.10)",overflow:"hidden"}}>
          {all.map(tag=>{
            const sel=tag===value;
            return(
              <div key={tag} onClick={()=>{onChange(tag);setOpen(false);}}
                style={{padding:"10px 14px",cursor:"pointer",fontSize:"13px",
                  fontWeight:sel?600:400,
                  color:sel?C.ink:C.inkMid,
                  background:sel?C.cream:"transparent",
                  fontFamily:"'Inter',sans-serif",
                  borderBottom:`1px solid ${C.border}`,
                  transition:"background 0.1s"}}
                onMouseEnter={e=>!sel&&(e.currentTarget.style.background=C.cream)}
                onMouseLeave={e=>!sel&&(e.currentTarget.style.background="transparent")}>
                {tag}
              </div>
            );
          })}
        </div>
      )}
      {open&&<div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:40}}/>}
    </div>
  );
}

function FlatListView({txs, onEdit, cards, entity, supplies=[]}){
  const cardMap=useMemo(()=>Object.fromEntries(cards.map(c=>[c.id,c])),[cards]);
  const isRealty=entity==="realty";
  const [tagFilter,setTagFilter]=useState("전체");
  const [search,setSearch]=useState("");
  const [searchOpen,setSearchOpen]=useState(false);
  const searchRef=useRef(null);

  const propTags=useMemo(()=>{
    if(!isRealty)return[];
    const totals={};
    txs.forEach(t=>{
      const k=t.cat3||"미지정";
      totals[k]=(totals[k]||0)+t.amount;
    });
    return Object.keys(totals).sort((a,b)=>a==="미지정"?1:b==="미지정"?-1:totals[b]-totals[a]);
  },[txs,isRealty]);

  useEffect(()=>{setTagFilter("전체");setSearch("");setSearchOpen(false);},[entity]);

  const filteredTxs=useMemo(()=>{
    let list=txs;
    if(isRealty&&tagFilter!=="전체") list=list.filter(t=>(t.cat3||"미지정")===tagFilter);
    if(search.trim()){
      const q=search.trim().toLowerCase();
      list=list.filter(t=>
        (t.memo||"").toLowerCase().includes(q)||
        (t.cat1||"").toLowerCase().includes(q)||
        (t.cat2||"").toLowerCase().includes(q)||
        (t.cat3||"").toLowerCase().includes(q)||
        String(t.amount).includes(q)
      );
    }
    return list;
  },[txs,isRealty,tagFilter,search]);

  const byDate=useMemo(()=>{
    const m={};
    [...filteredTxs].sort((a,b)=>b.date.localeCompare(a.date)).forEach(tx=>{
      if(!m[tx.date])m[tx.date]=[];
      m[tx.date].push(tx);
    });
    return m;
  },[filteredTxs]);

  if(!txs.length)return(
    <div style={{textAlign:"center",padding:"56px 20px",background:C.white,borderRadius:"20px",border:`1px solid ${C.border}`}}>
      <div style={{fontSize:"34px",marginBottom:"12px",opacity:0.3}}>📭</div>
      <div style={{fontFamily:"'Inter',sans-serif",fontSize:"17px",color:C.inkMid,marginBottom:"4px"}}>비어있어요</div>
      <div style={{fontSize:"12px",color:C.inkLight}}>거래를 추가해보세요</div>
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
      {/* 검색 토글 버튼 */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end"}}>
        <button onClick={()=>{setSearchOpen(o=>{if(o){setSearch("");return false;}return true;});setTimeout(()=>searchRef.current?.focus(),50);}}
          style={{display:"flex",alignItems:"center",gap:"5px",background:searchOpen||search?C.ink:C.white,
            border:`1.5px solid ${searchOpen||search?C.ink:C.border}`,borderRadius:"99px",
            padding:"5px 12px",cursor:"pointer",color:searchOpen||search?"#fff":C.inkLight,
            fontSize:"12px",fontWeight:600,fontFamily:"'Inter',sans-serif",transition:"all 0.18s"}}>
          <span style={{fontSize:"12px"}}>🔍</span>
          {search?`"${search}"`:searchOpen?"닫기":"검색"}
        </button>
      </div>
      {/* 검색창 */}
      {searchOpen&&(
        <div style={{position:"relative"}}>
          <input ref={searchRef}
            type="text"
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="메모, 카테고리, 금액 검색..."
            style={{width:"100%",border:`1.5px solid ${search?C.borderDark:C.border}`,borderRadius:"12px",
              padding:"10px 36px 10px 14px",fontSize:"13px",color:C.ink,outline:"none",
              background:C.white,boxSizing:"border-box",fontFamily:"'Inter',sans-serif"}}
          />
          {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:"10px",top:"50%",transform:"translateY(-50%)",
              background:"none",border:"none",cursor:"pointer",color:C.inkLight,display:"flex",padding:"2px"}}>
              <X size={15}/>
            </button>}
        </div>
      )}
      {search&&<div style={{fontSize:"11px",color:C.inkLight,fontFamily:"'Inter',sans-serif",paddingLeft:"2px"}}>
        {filteredTxs.length}건 검색됨
      </div>}
      {isRealty&&propTags.length>0&&(
        <PropTagDropdown tags={propTags} value={tagFilter} onChange={setTagFilter}/>
      )}
      {filteredTxs.length===0&&search&&(
        <div style={{textAlign:"center",padding:"40px 20px",background:C.white,borderRadius:"16px",border:`1px solid ${C.border}`}}>
          <div style={{fontSize:"28px",marginBottom:"8px",opacity:0.3}}>🔍</div>
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:"15px",color:C.inkMid}}>&ldquo;{search}&rdquo; 결과 없음</div>
        </div>
      )}
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
              const memoLower=(tx.memo||"").toLowerCase();
              const linkedSupply=supplies.find(s=>(s.name||"").toLowerCase()===memoLower
                ||(s.name||"").toLowerCase()===(tx.cat3||"").toLowerCase()
                ||(s.name||"").toLowerCase()===(tx.cat2||"").toLowerCase());
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
                      {linkedSupply&&<span style={{fontSize:"9px",background:"#f0fdf4",color:"#2d6a4f",
                        borderRadius:"4px",padding:"1px 6px",fontWeight:700,flexShrink:0,
                        border:"1px solid #b7e4c7",fontFamily:"'Inter',sans-serif"}}>소모품</span>}
                      {tx.images&&tx.images.length>0&&<span style={{fontSize:"9px",color:"#1d4e89",
                        fontFamily:"'Inter',sans-serif"}}>📷 {tx.images.length}</span>}
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
  const isCurrentMonth = today.getFullYear()===year && today.getMonth()===month;
  const [registering, setRegistering] = useState(new Set());

  // 현재 엔티티의 고정지출 템플릿 (가장 최근 등록된 것 기준으로 memo별 dedupe)
  const fixedTemplates = useMemo(()=>{
    const map={};
    [...txs].filter(t=>t.isFixed&&t.entity===entity).sort((a,b)=>b.date.localeCompare(a.date)).forEach(t=>{
      if(!map[t.memo]) map[t.memo]=t;
    });
    return Object.values(map);
  },[txs,entity]);

  // 이번 달 실제 발생한 고정지출 (현재 엔티티) — memo 기준 dedup
  const monthKey=`${year}-${String(month+1).padStart(2,"0")}`;
  const thisMonthFixed = useMemo(()=>{
    const seen=new Set();
    return [...txs]
      .filter(t=>t.isFixed&&t.entity===entity&&t.date.startsWith(monthKey))
      .sort((a,b)=>b.date.localeCompare(a.date))
      .filter(t=>{ if(seen.has(t.memo))return false; seen.add(t.memo); return true; });
  },[txs,entity,monthKey]);

  // 격월 토글 — localStorage 저장
  const BM_KEY="gagibu_bimonthly";
  const [biMonthlySet,setBiMonthlySet]=useState(()=>{
    try{return new Set(JSON.parse(localStorage.getItem(BM_KEY)||"[]"));}catch{return new Set();}
  });
  function isBiMonthly(memo){ return biMonthlySet.has(`${entity}:${memo}`); }
  function toggleBiMonthly(memo){
    const key=`${entity}:${memo}`;
    const next=new Set(biMonthlySet);
    if(next.has(key))next.delete(key);else next.add(key);
    setBiMonthlySet(next);
    localStorage.setItem(BM_KEY,JSON.stringify([...next]));
  }

  // 격월 항목이 이번 달 예정인지: 마지막 납부가 이번 달 기준 45일 이내면 skip
  function isDueThisMonth(t){
    if(!isBiMonthly(t.memo)) return true;
    const history=[...txs]
      .filter(tx=>tx.entity===entity&&tx.memo===t.memo)
      .sort((a,b)=>b.date.localeCompare(a.date));
    if(!history.length) return true;
    const lastPaid=new Date(history[0].date);
    const monthDiff=(year-lastPaid.getFullYear())*12+(month-lastPaid.getMonth());
    return monthDiff>=2;
  }

  // 이번 달 아직 미발생인 예정 항목 (fixedDay 유무와 무관하게 표시)
  const scheduled = useMemo(()=>
    fixedTemplates
      .filter(t=>!thisMonthFixed.some(m=>m.memo===t.memo)&&isDueThisMonth(t))
      .sort((a,b)=>(a.fixedDay||99)-(b.fixedDay||99)),
  [fixedTemplates,thisMonthFixed,txs,year,month]);

  // 이번 달 실제 발생 목록
  const occurred = useMemo(()=>
    [...thisMonthFixed].sort((a,b)=>a.date.localeCompare(b.date)),
  [thisMonthFixed]);

  const totalScheduled = scheduled.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const totalOccurred  = occurred.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);

  async function handleRegister(tx, regDate){
    if(registering.has(tx.memo)) return;
    setRegistering(p=>new Set(p).add(tx.memo));
    try{ await onRegister({...tx, id:Date.now(), date:regDate, isFixed:true}); }
    finally{ setRegistering(p=>{ const n=new Set(p); n.delete(tx.memo); return n; }); }
  }

  const FixedCard = ({tx, isScheduled}) => {
    const biMonthly = isBiMonthly(tx.memo);
    const isPast = isScheduled && isCurrentMonth && tx.fixedDay && tx.fixedDay < todayDay;
    const isToday = isScheduled && isCurrentMonth && tx.fixedDay === todayDay;
    const recentAmounts = useMemo(()=>
      [...txs].filter(t=>t.entity===entity&&t.memo===tx.memo&&t.isFixed)
        .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4).map(t=>t.amount)
    ,[txs,entity,tx.memo]);
    const avg = recentAmounts.length>=2
      ? Math.round(recentAmounts.reduce((s,a)=>s+a,0)/recentAmounts.length) : null;
    const regDate = (() => {
      if(!tx.fixedDay) return `${year}-${String(month+1).padStart(2,"0")}-${String(todayDay).padStart(2,"0")}`;
      const day = tx.fixedDay===31 ? new Date(year,month+1,0).getDate() : tx.fixedDay;
      return `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    })();
    const isReg = registering.has(tx.memo);
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
            <button onClick={e=>{e.stopPropagation();toggleBiMonthly(tx.memo);}} style={{
              fontSize:"9px",background:biMonthly?"#f0f4ff":"transparent",
              color:biMonthly?"#1d4e89":C.border,
              borderRadius:"4px",padding:"1px 6px",fontWeight:700,flexShrink:0,
              border:`1px solid ${biMonthly?"#b0c4de":C.border}`,
              fontFamily:"'Inter',sans-serif",cursor:"pointer",transition:"all 0.15s"}}>격월</button>
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
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:"15px",
            color:tx.type==="income"?"#2d6a4f":"#b5451b",fontWeight:700,
            opacity:isScheduled?0.6:1}}>
            {tx.type==="income"?"+":"-"}{fmtS(tx.amount)}
          </div>
          {isScheduled&&avg&&avg!==tx.amount&&(
            <div style={{fontSize:"10px",color:C.inkLight,fontFamily:"'Inter',sans-serif",marginTop:"1px"}}>
              평균 {fmtS(avg)}
            </div>
          )}
        </div>
        {isScheduled?(
          <button onClick={()=>handleRegister(tx,regDate)} disabled={isReg}
            style={{background:isReg?"#f4c5b2":"#fff8f0",border:"1px solid #f4c5b2",borderRadius:"8px",
              padding:"5px 10px",cursor:isReg?"not-allowed":"pointer",color:"#b5451b",fontSize:"11px",fontWeight:600,
              flexShrink:0,fontFamily:"'Inter',sans-serif",display:"flex",alignItems:"center",gap:"4px",
              opacity:isReg?0.6:1,transition:"opacity 0.15s"}}>
            {isReg?<RefreshCw size={11} className="spin"/>:<Plus size={11}/>} {isReg?"저장중":"등록"}
          </button>
        ):(
          <div style={{display:"flex",gap:"4px",flexShrink:0,alignItems:"center"}}>
            <button onClick={()=>onEdit(tx)} style={{background:"none",border:"none",cursor:"pointer",
              color:C.inkLight,padding:"4px",borderRadius:"6px",display:"flex",transition:"color 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.color=C.ink}
              onMouseLeave={e=>e.currentTarget.style.color=C.inkLight}><Pencil size={13}/></button>
            <button onClick={()=>onDelete(tx.id)}
              style={{background:"none",border:`1px solid ${C.border}`,borderRadius:"6px",
                padding:"3px 7px",cursor:"pointer",color:C.inkLight,fontSize:"10px",
                fontFamily:"'Inter',sans-serif",transition:"all 0.15s"}}
              title="발생 취소 → 예정으로 복귀">
              ↩예정
            </button>
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

const SUB_COLORS=["#4a90d9","#52b788","#e07a5f","#9b5de5","#b8860b","#0077b6","#831843","#2d6a4f","#b5451b","#4a3f35","#c1440e","#48cae4"];

function TxMiniList({txs, onEdit}){
  if(!txs.length)return null;
  return(
    <div>
      <div style={{padding:"8px 14px 4px",fontSize:"10px",fontWeight:700,
        letterSpacing:"0.1em",color:C.inkLight,fontFamily:"'Inter',sans-serif",textTransform:"uppercase"}}>
        내역 {txs.length}건
      </div>
      {txs.map((t,i)=>(
        <div key={t.id} onClick={()=>onEdit&&onEdit(t)}
          style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 14px",
            cursor:onEdit?"pointer":"default",borderTop:`1px solid ${C.border}`,transition:"background 0.1s"}}
          onMouseEnter={e=>onEdit&&(e.currentTarget.style.background=C.cream)}
          onMouseLeave={e=>onEdit&&(e.currentTarget.style.background="transparent")}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:"12px",fontWeight:500,color:C.ink,fontFamily:"'Inter',sans-serif",
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.memo||"(메모 없음)"}</div>
            <div style={{fontSize:"10px",color:C.inkLight,fontFamily:"'Inter',sans-serif",marginTop:"2px"}}>
              {t.date}{t.cat2&&` · ${t.cat2}`}
            </div>
          </div>
          <div style={{fontSize:"13px",fontWeight:700,flexShrink:0,fontFamily:"'Inter',sans-serif",
            color:t.type==="income"?"#2d6a4f":"#b5451b"}}>
            {t.type==="income"?"+":"-"}{fmtS(t.amount)}
          </div>
          {onEdit&&<Pencil size={11} style={{color:C.border,flexShrink:0}}/>}
        </div>
      ))}
    </div>
  );
}

function BreakdownList({data,total,sign,expanded,setExpanded,txs=[],onEdit}){
  const [expandedSub,setExpandedSub]=useState(null);
  const tt={background:C.paper,border:`1px solid ${C.border}`,borderRadius:"10px",fontFamily:"'Inter',sans-serif",fontSize:"12px"};
  if(!data.length)return(
    <div style={{textAlign:"center",padding:"32px 20px",color:C.inkLight,fontFamily:"'Inter',sans-serif",fontSize:"13px"}}>내역이 없어요</div>
  );
  return(
    <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
      {data.map((item)=>{
        const pct=Math.round((item.value/total)*100);
        const isOpen=expanded===item.name;
        const subWithColors=item.sub.map((s,i)=>({...s,color:SUB_COLORS[i%SUB_COLORS.length]}));
        return(
          <div key={item.name} style={{background:C.white,borderRadius:"14px",border:`1px solid ${isOpen?item.color:C.border}`,overflow:"hidden",transition:"border-color 0.2s"}}>
            <button onClick={()=>{setExpanded(isOpen?null:item.name);setExpandedSub(null);}}
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
            {isOpen&&(
              <div style={{borderTop:`1px solid ${C.border}`,background:C.paper}}>
                {item.sub.length>0&&(
                  <div style={{padding:"4px 14px 10px"}}>
                    {subWithColors.length>1&&(
                      <ResponsiveContainer width="100%" height={140}>
                        <PieChart>
                          <Pie data={subWithColors} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={32} outerRadius={52} paddingAngle={2}>
                            {subWithColors.map((s,i)=><Cell key={i} fill={s.color}/>)}
                          </Pie>
                          <Tooltip formatter={v=>[fmt(v)]} contentStyle={tt}/>
                          <Legend iconType="circle" iconSize={6} formatter={v=><span style={{fontSize:"10px",color:C.inkMid,fontFamily:"'Inter',sans-serif"}}>{v}</span>}/>
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                    {subWithColors.map((s)=>{
                      const absVal=Math.abs(s.value);
                      const sp=item.value>0?Math.round((absVal/item.value)*100):0;
                      const subKey=`${item.name}::${s.name}`;
                      const isSubOpen=expandedSub===subKey;
                      const subTxs=txs.filter(t=>(t.cat1===item.rawName||catDisplayName(t.cat1)===item.name)&&t.cat2===s.name)
                        .sort((a,b)=>b.date.localeCompare(a.date));
                      const refundColor="#b5451b";
                      return(
                        <div key={s.name} style={{marginBottom:"6px",borderRadius:"8px",
                          border:`1px solid ${isSubOpen?(s.isRefund?refundColor+"88":s.color+"88"):C.border}`,overflow:"hidden",
                          background:isSubOpen?C.white:"transparent"}}>
                          <div onClick={()=>setExpandedSub(isSubOpen?null:subKey)}
                            style={{cursor:"pointer",padding:"7px 10px 5px"}}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                              <div style={{display:"flex",alignItems:"center",gap:"5px"}}>
                                <div style={{width:"6px",height:"6px",borderRadius:"50%",background:s.isRefund?refundColor:s.color,flexShrink:0}}/>
                                <span style={{fontSize:"11px",color:s.isRefund?refundColor:C.inkMid,fontFamily:"'Inter',sans-serif",fontWeight:500}}>{s.name||"기타"}</span>
                              </div>
                              <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                                <span style={{fontSize:"11px",color:s.isRefund?refundColor:C.inkMid,fontFamily:"'Inter',sans-serif"}}>{s.isRefund?"-":""}{fmtS(absVal)}&nbsp;·&nbsp;{sp}%</span>
                                <span style={{fontSize:"9px",color:C.inkLight}}>{isSubOpen?"▲":"▼"}</span>
                              </div>
                            </div>
                            <div style={{background:C.border,borderRadius:"99px",height:"3px",overflow:"hidden"}}>
                              <div style={{width:`${sp}%`,height:"100%",background:(s.isRefund?refundColor:s.color)+"bb",borderRadius:"99px"}}/>
                            </div>
                          </div>
                          {isSubOpen&&<TxMiniList txs={subTxs} onEdit={onEdit}/>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatsView({txs,allEntityTxs,entity,cards,onEdit}){
  const tree=TREES[entity]||TREE_PERSONAL;
  const isRealty=entity==="realty";
  const [statsTab,setStatsTab]=useState("expense");
  const [expanded,setExpanded]=useState(null);
  const [expandedPropSub,setExpandedPropSub]=useState(null);
  const [lightbox,setLightbox]=useState(null);

  const incomeAmt=useMemo(()=>txs.filter(t=>t.type==="income"&&!t.cat1.startsWith("저축")).reduce((s,t)=>t.cat2==="환불"?s-t.amount:s+t.amount,0),[txs]);
  const saved=useMemo(()=>txs.filter(t=>t.cat1.startsWith("저축")).reduce((s,t)=>s+t.amount,0),[txs]);
  const expense=useMemo(()=>txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[txs]);
  const totalIn=incomeAmt+saved;
  const savingsRate=totalIn>0?Math.round((saved/totalIn)*100):0;

  function buildBreakdown(filterFn){
    const m={};
    txs.filter(filterFn).forEach(t=>{
      const isRefund=t.cat2==="환불";
      const sign=isRefund?-1:1;
      if(!m[t.cat1])m[t.cat1]={value:0,sub:{}};
      m[t.cat1].value+=sign*t.amount;
      m[t.cat1].sub[t.cat2]=(m[t.cat1].sub[t.cat2]||0)+sign*t.amount;
    });
    return Object.entries(m).map(([name,d])=>({
      name:catDisplayName(name),rawName:name,value:d.value,color:tree[name]?.color||C.inkMid,
      sub:Object.entries(d.sub).map(([n,v])=>({name:n,value:v,isRefund:n==="환불"})).sort((a,b)=>b.value-a.value),
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
    (allEntityTxs||txs).forEach(t=>{
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
    })).sort((a,b)=>{
      if(a.name==="미지정")return 1;
      if(b.name==="미지정")return -1;
      return (b.income+b.expense)-(a.income+a.expense);
    });
  },[allEntityTxs,txs,isRealty]);

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
                  <div style={{borderTop:`1px solid ${C.border}`,padding:"10px 14px 10px",background:C.paper}}>
                    {item.sub.map(s=>{
                      const propSubKey=`${item.name}::${s.name}`;
                      const isSubOpen=expandedPropSub===propSubKey;
                      const subTxs=(allEntityTxs||txs).filter(t=>
                        (t.cat3||"미지정")===item.name && catDisplayName(t.cat1)===s.name
                      ).sort((a,b)=>b.amount-a.amount);
                      return(
                        <div key={s.name} style={{marginBottom:"6px",borderRadius:"8px",
                          border:`1px solid ${isSubOpen?(s.type==="income"?"#52b78888":"#e07a5f88"):C.border}`,
                          overflow:"hidden",background:isSubOpen?C.white:"transparent"}}>
                          <div onClick={()=>setExpandedPropSub(isSubOpen?null:propSubKey)}
                            style={{cursor:"pointer",padding:"7px 10px 5px"}}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                              <span style={{fontSize:"11px",color:C.inkMid,fontFamily:"'Inter',sans-serif",fontWeight:500}}>{s.name}</span>
                              <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                                <span style={{fontSize:"11px",fontFamily:"'Inter',sans-serif",fontWeight:600,
                                  color:s.type==="income"?"#2d6a4f":"#b5451b"}}>
                                  {s.type==="income"?"+":"-"}{fmtS(s.value)}
                                </span>
                                <span style={{fontSize:"9px",color:C.inkLight}}>{isSubOpen?"▲":"▼"}</span>
                              </div>
                            </div>
                            <div style={{background:C.border,borderRadius:"99px",height:"3px",overflow:"hidden"}}>
                              <div style={{width:`${Math.round((s.value/Math.max(item.income,item.expense,1))*100)}%`,
                                height:"100%",background:s.type==="income"?"#52b788bb":"#e07a5fbb",borderRadius:"99px"}}/>
                            </div>
                          </div>
                          {isSubOpen&&<TxMiniList txs={subTxs} onEdit={onEdit}/>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* 물건별 이미지 갤러리 */}
                {isOpen&&(()=>{
                  const propImgs=(allEntityTxs||txs)
                    .filter(t=>(t.cat3||"미지정")===item.name&&t.images&&t.images.length>0)
                    .flatMap(t=>t.images.map(path=>({path,date:t.date,memo:t.memo})));
                  if(!propImgs.length)return null;
                  return(
                    <div style={{borderTop:`1px solid ${C.border}`,padding:"10px 14px",background:C.paper}}>
                      <div style={{fontSize:"10px",fontWeight:700,color:C.inkLight,
                        fontFamily:"'Inter',sans-serif",marginBottom:"8px",letterSpacing:"0.05em"}}>
                        📷 사진 ({propImgs.length})
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                        {propImgs.map((img,i)=>(
                          <button key={i} type="button" onClick={()=>setLightbox(getTxImageUrl(img.path))}
                            style={{padding:0,border:"none",background:"none",cursor:"pointer",borderRadius:"8px",overflow:"hidden"}}>
                            <img src={getTxImageUrl(img.path)} alt={img.memo}
                              style={{width:72,height:72,objectFit:"cover",borderRadius:"8px",
                                border:`1px solid ${C.border}`,display:"block"}}/>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      ):(
        /* Breakdown bars */
        <BreakdownList data={activeData} total={activeTotal} sign={activeSign} expanded={expanded} setExpanded={setExpanded} txs={txs} onEdit={onEdit}/>
      )}

      {/* 카페 월별 추이 */}
      {entity==="cafe"&&(()=>{
        const src=allEntityTxs||txs;
        const m={};
        src.forEach(t=>{
          const key=t.date.slice(0,7);
          if(!m[key])m[key]={month:key,매출:0,고정비:0,변동비:0};
          if(t.cat1==="매출"&&t.type==="income") m[key].매출+=t.amount;
          if(t.cat1==="운영비") m[key].고정비+=t.amount;
          if(t.cat1==="매입/원가") m[key].변동비+=t.amount;
        });
        const data=Object.values(m).sort((a,b)=>a.month.localeCompare(b.month))
          .map(d=>({...d,순이익:d.매출-d.고정비-d.변동비,
            label:d.month.slice(5)+"월"}));
        if(data.length<2) return null;
        const K=1000;
        return(
          <div style={{background:C.white,borderRadius:"18px",padding:"18px 8px 10px 4px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:"10px",fontWeight:700,color:C.inkLight,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:"4px",fontFamily:"'Inter',sans-serif",paddingLeft:"14px"}}>월별 추이</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data} margin={{top:8,right:16,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:10,fontFamily:"'Inter',sans-serif",fill:C.inkLight}} tickLine={false} axisLine={false}/>
                <YAxis tickFormatter={v=>`${Math.round(v/K)}k`} tick={{fontSize:10,fontFamily:"'Inter',sans-serif",fill:C.inkLight}} tickLine={false} axisLine={false} width={36}/>
                <Tooltip formatter={(v,n)=>[fmt(v),n]} contentStyle={{background:C.paper,border:`1px solid ${C.border}`,borderRadius:"10px",fontFamily:"'Inter',sans-serif",fontSize:"12px"}}/>
                <Legend iconType="circle" iconSize={7} formatter={v=><span style={{fontSize:"10px",color:C.inkMid,fontFamily:"'Inter',sans-serif"}}>{v}</span>}/>
                <Line type="monotone" dataKey="매출" stroke="#1d4e89" strokeWidth={2} dot={false} activeDot={{r:4}}/>
                <Line type="monotone" dataKey="고정비" stroke="#7ab3e0" strokeWidth={1.5} dot={false} activeDot={{r:4}}/>
                <Line type="monotone" dataKey="변동비" stroke="#e07a5f" strokeWidth={1.5} dot={false} activeDot={{r:4}}/>
                <Line type="monotone" dataKey="순이익" stroke="#f4a7b0" strokeWidth={1.5} dot={false} activeDot={{r:4}}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* 이미지 라이트박스 */}
      {lightbox&&(
        <div onClick={()=>setLightbox(null)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:1000,
            display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
          <img src={lightbox} alt="" onClick={e=>e.stopPropagation()}
            style={{maxWidth:"100%",maxHeight:"90vh",objectFit:"contain",borderRadius:"10px",
              boxShadow:"0 8px 40px rgba(0,0,0,0.6)"}}/>
          <button onClick={()=>setLightbox(null)}
            style={{position:"fixed",top:16,right:16,background:"rgba(255,255,255,0.15)",
              border:"none",color:"#fff",borderRadius:"50%",width:36,height:36,
              fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
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

function SuppliesView({ supplies, onChange, txs=[], onEditTx, onDeleteTx, onAddTx, cards=[] }){
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name:"", category:"소모품", cycle_days:"", base_amount:"", last_bought:todayStr, memo:"" });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [editingTx, setEditingTx] = useState(null);
  const [buyingTx, setBuyingTx] = useState(null);

  const daysDiff = (dateStr) => Math.round((today - new Date(dateStr)) / 86400000);

  // 실제 구매 간격을 거래 내역에서 계산
  const cafeTxs = useMemo(()=>txs.filter(t=>t.entity==="cafe"&&t.type==="expense"),[txs]);

  function computeActualCycle(name){
    const norm = name.toLowerCase();
    const matches = cafeTxs
      .filter(t=>(t.memo||"").toLowerCase()===norm||(t.cat2||"").toLowerCase()===norm||(t.cat3||"").toLowerCase()===norm)
      .sort((a,b)=>a.date.localeCompare(b.date));
    if(matches.length<2) return null;
    const intervals=[];
    for(let i=1;i<matches.length;i++){
      const days=Math.round((new Date(matches[i].date)-new Date(matches[i-1].date))/86400000);
      if(days>0) intervals.push(days);
    }
    if(!intervals.length) return null;
    return {
      days: Math.round(intervals.reduce((s,d)=>s+d,0)/intervals.length),
      count: matches.length,
    };
  }

  // 실질 소진 주기: 구매 이력 기반 자동 계산, 금액 비율로 보정
  const effectiveCycle = (s) => {
    const actual = computeActualCycle(s.name);
    if(!actual) return null;
    if(s.base_amount>0 && s.last_amount>0)
      return Math.round(actual.days * s.last_amount / s.base_amount);
    return actual.days;
  };

  const actualCycleInfo = (s) => computeActualCycle(s.name);

  // 거래 이력 최신 구매일 vs DB last_bought 중 더 최근 날짜 사용
  const effectiveLastBought = (s) => {
    const norm = (s.name||"").toLowerCase();
    const latest = cafeTxs
      .filter(t=>(t.memo||"").toLowerCase()===norm||(t.cat2||"").toLowerCase()===norm||(t.cat3||"").toLowerCase()===norm)
      .map(t=>t.date).sort().at(-1);
    if(!latest) return s.last_bought;
    return latest > (s.last_bought||"") ? latest : s.last_bought;
  };

  const nextBuy = (s) => {
    const cyc = effectiveCycle(s);
    if(!cyc) return null;
    const base = effectiveLastBought(s);
    if(!base) return null;
    const d = new Date(base);
    d.setDate(d.getDate() + cyc);
    return d.toISOString().slice(0,10);
  };
  const daysUntil = (s) => {
    const n = nextBuy(s);
    if(!n) return null;
    return Math.round((new Date(n) - today) / 86400000);
  };

  const sorted = useMemo(() => [...supplies].sort((a,b) => {
    const da = daysUntil(a), db = daysUntil(b);
    if(da===null && db===null) return 0;
    if(da===null) return 1;
    if(db===null) return -1;
    return da - db;
  }), [supplies]);

  const getStatus = (s) => {
    const d = daysUntil(s);
    if(d===null) return { label:"이력 수집 중", color:C.inkLight, bg:C.cream, border:C.border, icon:<Package size={11}/> };
    if (d < 0)   return { label:"구매 필요", color:"#b5451b", bg:"#fff8f0", border:"#f4c5b2", icon:<AlertTriangle size={11}/> };
    if (d <= 3)  return { label:`${d}일 후`, color:"#b8860b", bg:"#fffbf0", border:"#f0d080", icon:<Clock size={11}/> };
    return         { label:`${d}일 후`, color:"#2d6a4f", bg:"#f0fdf4", border:"#b7e4c7", icon:<Package size={11}/> };
  };


  async function handleAdd(){
    if(!form.name.trim()) return;
    const s = { id:"s"+Date.now(), name:form.name.trim(), category:form.category,
      cycle_days:form.cycle_days?parseInt(form.cycle_days):null, base_amount:parseInt(form.base_amount)||0,
      last_amount:0, last_bought:form.last_bought, memo:form.memo.trim() };
    setSaving(true);
    await onChange(s, "add");
    setSaving(false);
    setModal(null);
    setForm({ name:"", category:"소모품", cycle_days:"", base_amount:"", last_bought:todayStr, memo:"" });
  }

  async function handleEdit(){
    // id만 modal에서 가져오고, 나머지는 form에서 명시적으로 구성
    // (modal 전체 spread 시 created_at 등 DB 자동 필드가 섞여 PATCH 실패)
    const s = {
      id: modal.id,
      name: form.name.trim(),
      category: form.category,
      cycle_days: form.cycle_days ? parseInt(form.cycle_days) : null,
      base_amount: parseInt(form.base_amount) || 0,
      last_bought: form.last_bought,
      memo: form.memo.trim(),
    };
    setSaving(true);
    try {
      await onChange(s, "update");
    } catch(e) {
      console.error("supply edit failed", e);
    }
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
    setForm({ name:s.name, category:s.category, cycle_days:s.cycle_days?String(s.cycle_days):"",
      base_amount:s.base_amount>0?String(s.base_amount):"", last_bought:s.last_bought, memo:s.memo||"" });
    setModal(s);
  }

  const needAction = sorted.filter(s => { const d=daysUntil(s); return d!==null && d<=3; });

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
          <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"7px"}}>
            {SUPPLY_CATS.map(c=>(
              <button key={c} onClick={()=>setForm(p=>({...p,category:c}))} style={{
                padding:"5px 12px",borderRadius:"99px",cursor:"pointer",fontSize:"12px",fontWeight:500,
                border:`1.5px solid ${form.category===c?"#2d6a4f":C.border}`,
                background:form.category===c?"#2d6a4f14":"#fff",
                color:form.category===c?"#2d6a4f":C.inkMid,fontFamily:"'Inter',sans-serif"}}>{c}</button>
            ))}
          </div>
          <Inp value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}
            placeholder="직접 입력" style={{fontSize:"13px"}}/>
        </div>
        {/* 기준 금액 */}
        <div style={{background:"#f0fdf4",borderRadius:"12px",padding:"12px 14px",border:"1px solid #b7e4c7"}}>
          <div style={{fontSize:"10px",fontWeight:700,color:"#2d6a4f",letterSpacing:"0.08em",marginBottom:"10px",fontFamily:"'Inter',sans-serif"}}>
            소진 주기는 구매 이력으로 자동 계산됩니다
          </div>
          <SLabel>기준 구매금액 (원) — 금액이 다를 때 주기 보정용</SLabel>
          <div style={{display:"flex",alignItems:"center",border:`1.5px solid ${C.border}`,borderRadius:"10px",background:C.white,padding:"0 12px"}}>
            <input type="number" value={form.base_amount} onChange={e=>setForm(p=>({...p,base_amount:e.target.value}))}
              placeholder="50000" min="0"
              style={{flex:1,border:"none",background:"transparent",fontSize:"15px",fontWeight:700,
                color:C.ink,padding:"10px 0",outline:"none",fontFamily:"'Inter',sans-serif"}}/>
            <span style={{fontSize:"12px",color:C.inkLight}}>원</span>
          </div>
        </div>
        <div>
          <SLabel>마지막 구매일</SLabel>
          <Inp type="date" value={form.last_bought} onChange={e=>setForm(p=>({...p,last_bought:e.target.value}))}/>
        </div>
        <div>
          <SLabel>메모 (선택)</SLabel>
          <Inp value={form.memo} onChange={e=>setForm(p=>({...p,memo:e.target.value}))} placeholder="구매처 등"/>
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
          const cyc = effectiveCycle(s);
          const lastB = effectiveLastBought(s);
          const progress = cyc ? Math.min(100, Math.max(0, (daysDiff(lastB) / cyc) * 100)) : null;
          const next = nextBuy(s);
          const isExpanded = expandedId === s.id;
          const norm = (s.name||"").toLowerCase();
          const history = txs.filter(t=>
            (t.memo||"").toLowerCase()===norm||(t.cat3||"").toLowerCase()===norm||(t.cat2||"").toLowerCase()===norm
          ).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
          return(
            <div key={s.id} style={{background:C.white,borderRadius:"16px",
              border:`1px solid ${isExpanded?C.borderDark:st.border}`,boxShadow:"0 1px 6px rgba(0,0,0,0.04)",overflow:"hidden"}}>

              {/* 카드 본문 — 클릭 시 이력 토글 */}
              <div style={{padding:"14px 16px",cursor:"pointer"}} onClick={()=>setExpandedId(isExpanded?null:s.id)}>
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
                      {s.category} · {(()=>{const a=actualCycleInfo(s);return a?<span style={{color:"#1d4e89",fontWeight:600}}>평균 {a.days}일 <span style={{opacity:0.6,fontWeight:400}}>({a.count}건)</span></span>:<span style={{opacity:0.5}}>이력 부족</span>;})()}
                      {next?<>{" · 다음 구매 "}{next}</>:""}
                    </div>
                    {s.memo&&<div style={{fontSize:"11px",color:C.inkLight,marginTop:"2px",fontFamily:"'Inter',sans-serif",fontStyle:"italic"}}>{s.memo}</div>}
                  </div>
                  <div style={{display:"flex",gap:"4px",flexShrink:0,alignItems:"center"}}>
                    <button onClick={e=>{
                      e.stopPropagation();
                      const last = history[0];
                      const pre = last
                        ? {...last, id:null, date:todayStr}
                        : {id:null, date:todayStr, entity:"cafe", cat1:"매입/원가",
                           cat2:s.category||"소모품", cat3:"", memo:s.name,
                           amount:s.base_amount||s.last_amount||"", cardId:"", isFixed:false, type:"expense"};
                      setBuyingTx(pre);
                    }} style={{background:"#f0fdf4",border:"1px solid #b7e4c7",borderRadius:"8px",
                      padding:"4px 10px",cursor:"pointer",color:"#2d6a4f",fontSize:"11px",fontWeight:600,
                      display:"flex",alignItems:"center",gap:"4px",fontFamily:"'Inter',sans-serif"}}>
                      <Plus size={11}/> 오늘 구매
                    </button>
                    <button onClick={e=>{e.stopPropagation();openEdit(s);}} style={{background:"none",border:"none",cursor:"pointer",
                      color:C.inkLight,padding:"4px",borderRadius:"6px",display:"flex"}}>
                      <Pencil size={13}/>
                    </button>
                    <span style={{fontSize:"10px",color:C.inkLight}}>{isExpanded?"▲":"▼"}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div style={{height:"6px",background:C.cream,borderRadius:"99px",overflow:"hidden"}}>
                    {progress!==null&&<div style={{height:"100%",borderRadius:"99px",transition:"width 0.5s",
                      width:`${progress}%`,
                      background:progress>=100?"#b5451b":progress>=80?"#b8860b":"#2d6a4f"}}/>}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:"4px"}}>
                    <span style={{fontSize:"9px",color:C.inkLight,fontFamily:"'Inter',sans-serif"}}>
                      구매 후 {daysDiff(effectiveLastBought(s))}일 경과
                    </span>
                    <span style={{fontSize:"9px",color:C.inkLight,fontFamily:"'Inter',sans-serif"}}>
                      {(()=>{
                        const a=actualCycleInfo(s);
                        const eff=effectiveCycle(s);
                        if(!eff) return <span style={{color:C.inkLight,opacity:0.6}}>이력 수집 중</span>;
                        if(a&&eff!==a.days) return <>실질 {eff}일 <span style={{opacity:0.5}}>(평균 {a.days}일)</span></>;
                        return a?`평균 ${a.days}일`:"";
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* 구매 이력 */}
              {isExpanded&&(
                <div style={{borderTop:`1px solid ${C.border}`,padding:"10px 16px",background:C.cream}}>
                  <div style={{fontSize:"10px",fontWeight:700,color:C.inkLight,letterSpacing:"0.1em",marginBottom:"8px",fontFamily:"'Inter',sans-serif"}}>구매 이력</div>
                  {history.length===0
                    ?<div style={{fontSize:"12px",color:C.inkLight,fontFamily:"'Inter',sans-serif",padding:"8px 0"}}>거래 내역이 없어요</div>
                    :history.map(t=>(
                      <div key={t.id} className="tx-row" onClick={()=>setEditingTx(t)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                        padding:"6px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
                        <div>
                          <span style={{fontSize:"12px",color:C.ink,fontFamily:"'Inter',sans-serif"}}>{t.date}</span>
                          {t.memo&&t.memo!==s.name&&<span style={{fontSize:"11px",color:C.inkLight,fontFamily:"'Inter',sans-serif",marginLeft:"6px"}}>{t.memo}</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                          <span style={{fontSize:"12px",fontWeight:600,color:"#b5451b",fontFamily:"'Inter',sans-serif"}}>
                            {fmtS(t.amount)}
                          </span>
                          <Pencil size={11} style={{color:C.inkLight,flexShrink:0}}/>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          );
        })
      }

      {/* 소모품 추가/수정 모달 */}
      <Modal open={!!modal} onClose={()=>setModal(null)}>
        {modal==="add"?<FormContent isEdit={false}/>
          :modal?<FormContent isEdit={true}/>:null}
      </Modal>

      {/* 이력 거래 수정 모달 */}
      <Modal open={!!editingTx} onClose={()=>setEditingTx(null)}>
        {editingTx&&onEditTx&&(
          <TxForm
            initial={editingTx}
            onSave={tx=>{onEditTx(tx);setEditingTx(null);}}
            onDelete={()=>{onDeleteTx(editingTx.id);setEditingTx(null);}}
            cards={cards}
            defaultEntity={editingTx.entity||"cafe"}
            saving={false}
            supplies={supplies}
          />
        )}
      </Modal>

      {/* 오늘 구매 모달 */}
      <Modal open={!!buyingTx} onClose={()=>setBuyingTx(null)}>
        {buyingTx&&onAddTx&&(
          <TxForm
            initial={buyingTx}
            onSave={tx=>{onAddTx(tx);setBuyingTx(null);}}
            cards={cards}
            defaultEntity="cafe"
            saving={false}
            supplies={supplies}
          />
        )}
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
  const [yearView, setYearView] =useState(false);
  const [entity,setEntity]=useState("personal");
  const [tab,   setTab]   =useState("list");
  const [modal, setModal] =useState(null);
  const [editTx,setEditTx]=useState(null);
  const [txs,   setTxs]   =useState([]);
  const [cards, setCards] =useState(DEFAULT_CARDS);
  const [trees, setTrees] =useState(loadTrees);
  const [supplies, setSupplies] = useState([]);
  const [loading,setLoading]=useState(false);
  const [saving, setSaving] =useState(false);
  const [online, setOnline] =useState(isConfigured());
  const ENTITY_THEME = {personal:"cream", cafe:"forest", realty:"navy"};
  const [themeKey, setThemeKey] = useState(()=>ENTITY_THEME["personal"]);
  const [session,setSession]=useState(undefined); // undefined=로딩중, null=미로그인

  // auth 초기화
  useEffect(()=>{
    supabaseClient.auth.getSession().then(({data:{session}})=>{
      _authToken=session?.access_token||SUPABASE_ANON;
      setSession(session||null);
    });
    const {data:{subscription}}=supabaseClient.auth.onAuthStateChange((_,session)=>{
      _authToken=session?.access_token||SUPABASE_ANON;
      setSession(session||null);
    });
    return ()=>subscription.unsubscribe();
  },[]);

  // trees 변경 시 전역 TREES 동기화
  useEffect(()=>{ TREES=trees; localStorage.setItem(CAT_KEY,JSON.stringify(trees)); }, [trees]);

  async function handleTrees(updated, renameOps=[]){
    setTrees(updated);
    if(isConfigured()) sb("settings",{method:"POST",body:JSON.stringify({key:"trees",value:updated}),prefer:"resolution=merge-duplicates,return=minimal"}).catch(()=>{});
    if(!renameOps.length) return;
    // 로컬 state를 ops 순서대로 일괄 반영
    setTxs(prev=>{
      let result=[...prev];
      for(const op of renameOps){
        result=result.map(t=>{
          if(t.entity!==op.entity) return t;
          if(op.level==="cat1"&&t.cat1===op.old) return {...t,cat1:op.new};
          if(op.level==="cat2"&&t.cat1===op.cat1&&t.cat2===op.old) return {...t,cat2:op.new};
          if(op.level==="cat3"&&t.cat1===op.cat1&&t.cat2===op.cat2&&t.cat3===op.old) return {...t,cat3:op.new};
          return t;
        });
      }
      return result;
    });
    // DB 순차 PATCH
    for(const op of renameOps){
      try{
        const patch={};
        let filter=`entity=eq.${op.entity}`;
        if(op.level==="cat1"){patch.cat1=op.new;filter+=`&cat1=eq.${encodeURIComponent(op.old)}`;}
        else if(op.level==="cat2"){patch.cat2=op.new;filter+=`&cat1=eq.${encodeURIComponent(op.cat1)}&cat2=eq.${encodeURIComponent(op.old)}`;}
        else if(op.level==="cat3"){patch.cat3=op.new;filter+=`&cat1=eq.${encodeURIComponent(op.cat1)}&cat2=eq.${encodeURIComponent(op.cat2)}&cat3=eq.${encodeURIComponent(op.old)}`;}
        await sb(`transactions?${filter}`,{method:"PATCH",body:JSON.stringify(patch),prefer:"return=minimal"});
      }catch(e){console.error("category rename batch failed",op,e);}
    }
  }

  // entity 변경 시 테마 동기화
  useEffect(()=>{ setThemeKey(ENTITY_THEME[entity]||"cream"); }, [entity]);

  // C를 현재 테마로 동기화
  C = THEMES[themeKey] || THEMES.cream;

  function changeTheme(key){
    setThemeKey(key);
    C = THEMES[key] || THEMES.cream;
  }

  /* ── DB 로드 ── */
  const fetchAll = useCallback(async()=>{
    if(!isConfigured())return;
    setLoading(true);
    try{
      const [rows, cardRows, supplyRows, settingsRows] = await Promise.all([
        sb("transactions?select=*&order=date.desc"),
        sb("cards?select=*&order=sort_order.asc"),
        sb("supplies?select=*&order=created_at.asc"),
        sb("settings?select=*&key=eq.trees"),
      ]);
      setTxs(rows.map(rowToTx));
      if(cardRows.length) setCards(cardRows.map(rowToCard));
      setSupplies(supplyRows);
      const dbTrees = settingsRows?.[0]?.value;
      if(dbTrees){
        TREES=dbTrees; setTrees(dbTrees);
      } else {
        // Supabase에 카테고리가 없으면 현재 기기의 localStorage 카테고리를 업로드
        const localTrees = loadTrees();
        sb("settings",{method:"POST",body:JSON.stringify({key:"trees",value:localTrees}),prefer:"resolution=merge-duplicates,return=minimal"}).catch(()=>{});
      }
      setOnline(true);
    }catch(e){
      console.error(e);
      setOnline(false);
    }finally{setLoading(false);}
  },[]);

  // session 확정 후에만 fetch (토큰 미세팅 상태로 호출하는 타이밍 버그 방지)
  useEffect(()=>{if(session)fetchAll();},[session]);

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
          await handleSupplies({id:existing.id,last_bought:supplyData.last_bought,last_amount:supplyData.last_amount||0},"update");
        }else{
          await handleSupplies({id:"s"+Date.now(),name:supplyData.name,category:supplyData.category,
            cycle_days:null,base_amount:supplyData.base_amount||0,
            last_amount:supplyData.last_amount||0,last_bought:supplyData.last_bought,memo:""},"add");
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
          await handleSupplies({id:existing.id,last_bought:supplyData.last_bought,last_amount:supplyData.last_amount||0},"update");
        }else{
          await handleSupplies({id:"s"+Date.now(),name:supplyData.name,category:supplyData.category,
            cycle_days:null,base_amount:supplyData.base_amount||0,
            last_amount:supplyData.last_amount||0,last_bought:supplyData.last_bought,memo:""},"add");
        }
      }
    }catch(e){console.error(e);}
    finally{setSaving(false);setModal(null);setEditTx(null);}
  }
  async function deleteTx(id){
    setSaving(true);
    try{
      const tx=txs.find(t=>t.id===id);
      if(tx?.images?.length) await deleteTxImages(tx.images).catch(()=>{});
      await sb(`transactions?id=eq.${id}`,{method:"DELETE",prefer:"return=minimal"});
      setTxs(p=>p.filter(t=>t.id!==id));
    }catch(e){console.error(e);}
    finally{setSaving(false);setModal(null);setEditTx(null);}
  }

  /* ── Supply CRUD ── */
  // DB 스키마에 확실히 있는 컬럼만 추출 (last_amount는 DB에 없을 수 있어 로컬 상태로만 관리)
  function toDbSupply(p){
    const safe={};
    const cols=["id","name","category","cycle_days","base_amount","last_bought","memo"];
    cols.forEach(k=>{if(k in p)safe[k]=p[k];});
    // cycle_days NOT NULL 제약 대응: null이면 30(기본값)으로 대체
    if(safe.cycle_days==null) safe.cycle_days=30;
    return safe;
  }
  async function handleSupplies(payload, op){
    try{
      if(op==="add"){
        const dbPayload=toDbSupply(payload);
        const [row]=await sb("supplies",{method:"POST",body:JSON.stringify(dbPayload)});
        // DB row에 last_amount가 없으면 payload에서 보충
        setSupplies(p=>[...p,{...payload,...row}]);
      }
      if(op==="update"){
        const dbPayload=toDbSupply(payload);
        await sb(`supplies?id=eq.${payload.id}`,{method:"PATCH",body:JSON.stringify(dbPayload),prefer:"return=minimal"});
        setSupplies(p=>p.map(s=>s.id===payload.id?{...s,...payload}:s));
      }
      if(op==="delete"){
        await sb(`supplies?id=eq.${payload.id}`,{method:"DELETE",prefer:"return=minimal"});
        setSupplies(p=>p.filter(s=>s.id!==payload.id));
      }
    }catch(e){console.error("handleSupplies error:",op,e);}
  }

  /* ── Card CRUD ── */
  async function handleCards(updated, op, payload){
    setCards(updated);
    try{
      if(op==="add")    await sb("cards",{method:"POST",body:JSON.stringify(cardToRow(payload))});
      if(op==="del")    await sb(`cards?id=eq.${payload.id}`,{method:"DELETE",prefer:"return=minimal"});
      if(op==="update") await sb(`cards?id=eq.${payload.id}`,{method:"PATCH",body:JSON.stringify({name:payload.name}),prefer:"return=minimal"});
      if(op==="reorder") await Promise.all(payload.map((c,i)=>sb(`cards?id=eq.${c.id}`,{method:"PATCH",body:JSON.stringify({sort_order:i}),prefer:"return=minimal"})));
    }catch(e){console.error(e);}
  }

  const monthKey=`${year}-${String(month+1).padStart(2,"0")}`;
  const viewTxs=useMemo(()=>txs.filter(t=>(yearView?t.date.startsWith(String(year)):t.date.startsWith(monthKey))&&t.entity===entity),[txs,monthKey,year,yearView,entity]);
  const entityTxs=useMemo(()=>txs.filter(t=>t.entity===entity),[txs,entity]);
  const realtyTags=useMemo(()=>[...new Set(txs.filter(t=>t.entity==="realty"&&t.cat3).map(t=>t.cat3))],[txs]);
  const income =useMemo(()=>viewTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),[viewTxs]);
  const expense=useMemo(()=>viewTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[viewTxs]);
  const bal=income-expense;
  const ent=ENTITIES[entity];

  function prevMonth(){if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);}
  function nextMonth(){if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);}

  async function handleLogout(){
    await supabaseClient.auth.signOut();
  }

  if(session===undefined)return(
    <div style={{minHeight:"100vh",background:"#f5f0e8",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{fontFamily:"'Inter',sans-serif",fontSize:"13px",color:"#9c8e82"}}>로딩 중…</div>
    </div>
  );
  if(!session)return <LoginScreen onLogin={s=>{_authToken=s.access_token;setSession(s);}}/>;

  return(
    <div style={{minHeight:"100vh",background:C.cream,paddingBottom:"calc(80px + env(safe-area-inset-bottom))"}}>

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
<button onClick={()=>setModal("theme")} title="테마 변경" style={{
                background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",
                borderRadius:"10px",padding:"7px 10px",color:"rgba(255,255,255,0.6)",
                cursor:"pointer",display:"flex",alignItems:"center",
                fontSize:"13px",lineHeight:1}}>
                {THEMES[themeKey].emoji}
              </button>
              <button onClick={()=>setModal("cats")} title="카테고리 관리" style={{
                background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",
                borderRadius:"10px",padding:"6px 10px",color:"rgba(255,255,255,0.6)",cursor:"pointer",
                fontSize:"11px",fontWeight:600,display:"flex",alignItems:"center",fontFamily:"'Inter',sans-serif"}}>
                CAT
              </button>
              <button onClick={()=>setModal("cards")} style={{
                background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",
                borderRadius:"10px",padding:"9px",color:"rgba(255,255,255,0.6)",cursor:"pointer",display:"flex"}}>
                <CreditCard size={14}/>
              </button>
              <button onClick={handleLogout} title="로그아웃" style={{
                background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",
                borderRadius:"10px",padding:"6px 10px",color:"rgba(255,255,255,0.5)",cursor:"pointer",
                fontSize:"11px",fontWeight:600,fontFamily:"'Inter',sans-serif"}}>
                OUT
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

          {/* Month/Year nav */}
          <div style={{marginBottom:"20px"}}>
            {/* 월/연간 토글 */}
            <div style={{display:"flex",justifyContent:"center",marginBottom:"12px"}}>
              <div style={{display:"flex",background:"rgba(255,255,255,0.08)",borderRadius:"10px",padding:"3px",gap:"2px"}}>
                {[["월별",false],["연간",true]].map(([label,isYear])=>(
                  <button key={label} onClick={()=>{setYearView(isYear);if(isYear&&tab==="fixed")setTab("stats");}} style={{
                    padding:"5px 18px",border:"none",borderRadius:"8px",cursor:"pointer",
                    fontFamily:"'Inter',sans-serif",fontSize:"12px",fontWeight:yearView===isYear?700:400,
                    background:yearView===isYear?"rgba(255,255,255,0.18)":"transparent",
                    color:yearView===isYear?"#fff":"rgba(255,255,255,0.45)",transition:"all 0.15s"}}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {/* 네비게이터 */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"16px"}}>
              <button onClick={yearView?()=>setYear(y=>y-1):prevMonth} style={{background:"rgba(255,255,255,0.07)",border:"none",borderRadius:"8px",padding:"7px",color:"rgba(255,255,255,0.45)",cursor:"pointer",display:"flex"}}>
                <ChevronLeft size={17}/>
              </button>
              <div style={{textAlign:"center",minWidth:"120px"}}>
                {yearView
                  ?<div style={{fontFamily:"'Inter',sans-serif",fontSize:"22px",letterSpacing:"-0.3px"}}>{year}년</div>
                  :<><div style={{fontFamily:"'Inter',sans-serif",fontSize:"20px",letterSpacing:"-0.3px"}}>{MONTHS[month]} {year}</div>
                    <div style={{fontSize:"10px",opacity:0.35,fontFamily:"'Inter',sans-serif",marginTop:"1px"}}>{year}년 {MONTHS_KO[month]}</div></>
                }
              </div>
              <button onClick={yearView?()=>setYear(y=>y+1):nextMonth} style={{background:"rgba(255,255,255,0.07)",border:"none",borderRadius:"8px",padding:"7px",color:"rgba(255,255,255,0.45)",cursor:"pointer",display:"flex"}}>
                <ChevronRight size={17}/>
              </button>
            </div>
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
          {[["list","내역"],["stats","통계"],
            ...(!yearView?[["fixed","고정지출"]]:[]),
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
            {tab==="list"?<FlatListView txs={viewTxs} onEdit={tx=>{setEditTx(tx);setModal("edit");}} onDuplicate={tx=>{setEditTx({...tx,id:null});setModal("add");}} cards={cards} entity={entity} supplies={supplies}/>
             :tab==="stats"?<StatsView txs={viewTxs} allEntityTxs={entityTxs} entity={entity} cards={cards} onEdit={tx=>{setEditTx(tx);setModal("edit");}}/>
:tab==="supplies"?<SuppliesView supplies={supplies} onChange={handleSupplies} txs={txs} onAddTx={addTx} onEditTx={updateTx} onDeleteTx={deleteTx} cards={cards}/>
             :<FixedView txs={txs} onDelete={deleteTx} onEdit={tx=>{setEditTx(tx);setModal("edit");}} onRegister={addTx} entity={entity} year={year} month={month}/>}
          </div>
        }
      </div>

      <Modal open={modal==="add"} onClose={()=>{setModal(null);setEditTx(null);}}>
        <TxForm initial={editTx||undefined} onSave={addTx} cards={cards} defaultEntity={entity} saving={saving} supplies={supplies} propertyTags={realtyTags}/>
      </Modal>
      <Modal open={modal==="edit"&&!!editTx} onClose={()=>{setModal(null);setEditTx(null);}}>
        {editTx&&<TxForm initial={editTx} onSave={updateTx} onDelete={()=>deleteTx(editTx.id)} onDuplicate={()=>{setEditTx({...editTx,id:null});setModal("add");}} cards={cards} defaultEntity={entity} saving={saving} supplies={supplies} propertyTags={realtyTags}/>}
      </Modal>
      <Modal open={modal==="cats"} onClose={()=>setModal(null)}>
        <CategorySettings trees={trees} onChange={handleTrees}/>
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
      <div style={{textAlign:"center",padding:"8px 0 4px",fontSize:"10px",color:C.inkLight,
        fontFamily:"'Inter',sans-serif",opacity:0.5}}>
        built {__BUILD_TIME__}
      </div>

      {/* FAB */}
      <button onClick={()=>setModal("add")} style={{
        position:"fixed",bottom:"calc(24px + env(safe-area-inset-bottom))",right:"24px",zIndex:200,
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
