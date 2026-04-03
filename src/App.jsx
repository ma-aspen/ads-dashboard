import { useState, useEffect, useRef } from "react";

// ── Sheet GIDs — replace with your real values after creating tabs ────────────
const SHEET_BASE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRaS-nVmN2ZhJ8VLjXyJECisyE6-fWeCFfrbG_Zfs8vpbu2LYYO1wWApbG_I7rCgmaaGymNfnH0pr3H/pub";
const GIDS = {
  gThisMonth:   "1530323410",
  gLastMonth:   "2041136555",
  gLast30:      "1217713570",
  mThisMonth:   "META_THIS_MONTH_GID",
  mLastMonth:   "META_LAST_MONTH_GID",
  mLast30:      "1004024538",
};
const csvUrl = gid => SHEET_BASE + "?gid=" + gid + "&single=true&output=csv";

// ── Column Maps ───────────────────────────────────────────────────────────────
const G = { name:"Campaign", spend:"Cost", budget:"Budget", impressions:"Impr.", clicks:"Clicks", conversions:"Conversions", revenue:"Revenue", status:"Campaign status" };
const M = { name:"Campaign name", spend:"Amount spent (USD)", budget:"Ad set budget", impressions:"Impressions", conversions:"Purchases", revenue:"Purchases conversion value" };

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  google:"#4285F4", meta:"#0866FF", green:"#22c55e", red:"#ef4444", yellow:"#f59e0b",
  bg:"#0f172a", card:"#1e293b", cardAlt:"#162032", border:"#334155",
  text:"#f1f5f9", muted:"#94a3b8",
};

// ── Demo Data ─────────────────────────────────────────────────────────────────
function makePlatform(s, b, imp, clk, conv, rev, campaigns) {
  return { spend:s, budget:b, impressions:imp, clicks:clk, conversions:conv, revenue:rev, campaigns };
}
const DEMO = {
  thisMonth: {
    google: makePlatform(12480,15000,842300,14200,312,52416,[
      { name:"Brand Search",        spend:3200, budget:5000, impressions:210000, clicks:5800, conversions:140, revenue:23520, status:"enabled" },
      { name:"Competitor Conquest", spend:2900, budget:4000, impressions:180000, clicks:3100, conversions:68,  revenue:11424, status:"enabled" },
      { name:"Display Retargeting", spend:1800, budget:3000, impressions:320000, clicks:2400, conversions:52,  revenue:8736,  status:"enabled" },
      { name:"PMax - Summer Sale",  spend:4580, budget:5000, impressions:132300, clicks:2900, conversions:52,  revenue:8736,  status:"enabled" },
    ]),
    meta: makePlatform(9320,12000,1240000,18600,248,35432,[
      { name:"Prospecting - LAL",  spend:2800, budget:4000, impressions:420000, clicks:5200, conversions:68, revenue:9724,  status:"active" },
      { name:"Retargeting - Cart", spend:1920, budget:3000, impressions:280000, clicks:4800, conversions:92, revenue:13156, status:"active" },
      { name:"Retargeting - View", spend:1400, budget:2500, impressions:200000, clicks:3100, conversions:44, revenue:6292,  status:"active" },
      { name:"Broad - Summer",     spend:3200, budget:4000, impressions:340000, clicks:5500, conversions:44, revenue:6292,  status:"paused"  },
    ]),
  },
  lastMonth: {
    google: makePlatform(11200,15000,780000,12800,278,46704,[]),
    meta:   makePlatform(8800, 12000,1100000,16200,218,31172,[]),
  },
  last30: {
    google: makePlatform(13100,15000,890000,15000,328,55104,[]),
    meta:   makePlatform(9800, 12000,1300000,19500,261,37293,[]),
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseCSV(text, headerRow) {
  const lines = text.trim().split("\n");
  if (lines.length <= headerRow) return [];
  const headers = lines[headerRow].split(",").map(h => h.replace(/^"|"$/g,"").trim());
  return lines.slice(headerRow + 1).map(line => {
    const cols = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => {
      const raw = (cols[i]||"").replace(/^"|"$/g,"").replace(/[$%,]/g,"").trim();
      obj[h] = (raw !== "" && !isNaN(raw)) ? parseFloat(raw) : raw;
    });
    return obj;
  }).filter(r => headers.some(h => r[h] !== "" && r[h] !== undefined));
}

function buildPlatform(rows) {
  const tot = f => rows.reduce((s,r) => s+(parseFloat(r[f])||0), 0);
  const spend=tot("spend"), impressions=tot("impressions"), clicks=tot("clicks");
  const conversions=tot("conversions"), revenue=tot("revenue"), budget=tot("budget");
  return { spend, budget, impressions, clicks, conversions, revenue, campaigns: rows,
    cpa:  conversions>0 ? spend/conversions : 0,
    roas: spend>0&&revenue>0 ? revenue/spend : 0,
  };
}

function pct(cur, pri) {
  if (!pri || pri === 0) return null;
  return ((cur - pri) / pri * 100);
}

function fmt(val, type) {
  if (val === null || val === undefined) return "—";
  if (type === "dollar")  return "$" + Math.round(val).toLocaleString();
  if (type === "decimal") return "$" + val.toFixed(2);
  if (type === "roas")    return val.toFixed(1) + "x";
  if (type === "pct")     return val.toFixed(1) + "%";
  if (type === "int")     return Math.round(val).toLocaleString();
  return val;
}

function campaignScore(c, avgCpa, avgRoas) {
  if (c.status === "paused" || c.status === "removed") return "paused";
  if (c.conversions === 0 && c.spend > 0) return "red";
  const cpa  = c.conversions > 0 ? c.spend / c.conversions : null;
  const roas = c.spend > 0 && c.revenue > 0 ? c.revenue / c.spend : null;
  let score = 0;
  if (cpa  !== null && avgCpa  > 0) score += cpa  <= avgCpa  * 1.1 ? 1 : cpa  <= avgCpa  * 1.3 ? 0 : -1;
  if (roas !== null && avgRoas > 0) score += roas >= avgRoas * 0.9 ? 1 : roas >= avgRoas * 0.7 ? 0 : -1;
  if (score >= 1)  return "green";
  if (score === 0) return "yellow";
  return "red";
}

// ── Sub-components ────────────────────────────────────────────────────────────
function DeltaBadge({ change, inverse }) {
  if (change === null) return <span style={{color:C.muted,fontSize:12}}>vs last month: —</span>;
  const up = change >= 0;
  const good = inverse ? !up : up;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:12,fontWeight:700,
      color:good?C.green:C.red,background:good?"rgba(34,197,94,0.12)":"rgba(239,68,68,0.12)",
      borderRadius:6,padding:"2px 8px"}}>
      {up?"▲":"▼"} {Math.abs(change).toFixed(1)}% vs last month
    </span>
  );
}

function OutcomeCard({ label, sublabel, value, change, inverse, note }) {
  return (
    <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"18px 20px",display:"flex",flexDirection:"column",gap:6}}>
      <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:C.muted}}>{label}</div>
      <div style={{fontSize:11,color:C.muted,marginTop:-4}}>{sublabel}</div>
      <div style={{fontSize:28,fontWeight:900,color:C.text,lineHeight:1.1}}>{value}</div>
      <DeltaBadge change={change} inverse={inverse} />
      {note && <div style={{fontSize:11,color:C.muted,marginTop:2}}>{note}</div>}
    </div>
  );
}

function BudgetBar({ label, spend, budget, color }) {
  const pct2 = budget>0 ? Math.min((spend/budget)*100,100) : 0;
  const over = pct2 > 90;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{background:color,borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:700,color:"#fff"}}>{label}</span>
        <span style={{fontSize:12,color:over?C.yellow:C.muted}}>
          {"$"+Math.round(spend).toLocaleString()+" / $"+Math.round(budget).toLocaleString()+" ("+pct2.toFixed(0)+"%)"}
        </span>
      </div>
      <div style={{height:7,background:"#0f172a",borderRadius:4,overflow:"hidden"}}>
        <div style={{width:pct2+"%",height:"100%",background:over?C.yellow:color,borderRadius:4,transition:"width 0.6s"}}/>
      </div>
    </div>
  );
}

function ScoreIcon({ score }) {
  if (score==="green")  return <span style={{fontSize:18}}>✅</span>;
  if (score==="yellow") return <span style={{fontSize:18}}>⚠️</span>;
  if (score==="red")    return <span style={{fontSize:18}}>🔴</span>;
  return <span style={{fontSize:18}}>⏸️</span>;
}

function NarrativeBar({ text, loading }) {
  return (
    <div style={{background:"linear-gradient(135deg,#1e293b,#162032)",border:"1px solid #334155",borderRadius:14,padding:"18px 22px",marginBottom:20}}>
      <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"#60a5fa",marginBottom:8}}>📊 Performance Snapshot</div>
      {loading
        ? <div style={{color:C.muted,fontSize:14}}>Generating narrative…</div>
        : <div style={{color:C.text,fontSize:14,lineHeight:1.7}}>{text}</div>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [periods, setPeriods]       = useState(DEMO);
  const [source, setSource]         = useState("demo");
  const [updated, setUpdated]       = useState(new Date());
  const [errMsg, setErrMsg]         = useState("");
  const [narrative, setNarrative]   = useState("");
  const [narLoading, setNarLoading] = useState(false);
  const [platform, setPlatform]     = useState("both");
  const [tab, setTab]               = useState("overview");
  const [modal, setModal]           = useState(false);
  const [recipient, setRecipient]   = useState("");
  const [subject, setSubject]       = useState("Paid Ads Monthly Performance Report");
  const [generating, setGenerating] = useState(false);
  const [emailBody, setEmailBody]   = useState("");
  const [sent, setSent]             = useState(false);
  const timer = useRef(null);
  const narTimer = useRef(null);

  async function fetchData() {
    setSource("loading"); setErrMsg("");
    const hasThisMonth = GIDS.gThisMonth !== "THIS_MONTH_GID";
    const hasLastMonth = GIDS.gLastMonth !== "LAST_MONTH_GID";
    try {
      const urls = [csvUrl(GIDS.gLast30), csvUrl(GIDS.mLast30)];
      if (hasThisMonth) { urls.push(csvUrl(GIDS.gThisMonth)); urls.push(csvUrl(GIDS.mThisMonth !== "META_THIS_MONTH_GID" ? GIDS.mThisMonth : GIDS.mLast30)); }
      if (hasLastMonth) { urls.push(csvUrl(GIDS.gLastMonth)); urls.push(csvUrl(GIDS.mLastMonth !== "META_LAST_MONTH_GID" ? GIDS.mLastMonth : GIDS.mLast30)); }
      const results = await Promise.all(urls.map(u => fetch(u).then(r => r.ok ? r.text() : Promise.reject(r.status))));

      const mapG = r => ({ name:String(r[G.name]||""), spend:parseFloat(r[G.spend])||0, budget:parseFloat(r[G.budget])||0, impressions:parseFloat(r[G.impressions])||0, clicks:parseFloat(r[G.clicks])||0, conversions:parseFloat(r[G.conversions])||0, revenue:parseFloat(r[G.revenue])||0, status:String(r[G.status]||"unknown").toLowerCase() });
      const mapM = r => ({ name:String(r[M.name]||""), spend:parseFloat(r[M.spend])||0, budget:parseFloat(r[M.budget])||0, impressions:parseFloat(r[M.impressions])||0, clicks:0, conversions:parseFloat(r[M.conversions])||0, revenue:parseFloat(r[M.revenue])||0, status:"active" });

      const isLive = r => (r.status === "enabled" || r.status === "active") && (r.spend || 0) > 0; const gL30 = parseCSV(results[0],12).map(mapG).filter(r=>r.name&&r.name!==G.name&&isLive(r));
      const mL30 = parseCSV(results[1],0).map(mapM).filter(r=>r.name);

      const last30    = { google:buildPlatform(gL30), meta:buildPlatform(mL30) };
      const thisMonth = hasThisMonth
        ? { google:buildPlatform(parseCSV(results[2],12).map(mapG).filter(r=>r.name&&r.name!==G.name&&isLive(r))), meta:buildPlatform(parseCSV(results[3],0).map(mapM).filter(r=>r.name)) }
        : last30;
      const lastMonth = hasLastMonth
        ? { google:buildPlatform(parseCSV(results[4],12).map(mapG).filter(r=>r.name&&r.name!==G.name)), meta:buildPlatform(parseCSV(results[5],0).map(mapM).filter(r=>r.name)) }
        : DEMO.lastMonth;

      if (gL30.length===0 && mL30.length===0) { setSource("demo"); return; }
      setPeriods({ thisMonth, lastMonth, last30 });
      setUpdated(new Date());
      setSource("live");
    } catch(e) {
      setErrMsg("Fetch error: "+e);
      setSource("error");
    }
  }

  async function generateNarrative(p) {
    setNarLoading(true);
    const tm = p.thisMonth, lm = p.lastMonth;
    const totalConv  = tm.google.conversions + tm.meta.conversions;
    const totalSpend = tm.google.spend + tm.meta.spend;
    const blendedCpa = totalConv > 0 ? totalSpend / totalConv : 0;
    const prevConv   = lm.google.conversions + lm.meta.conversions;
    const convChg    = pct(totalConv, prevConv);
    const gSpendChg  = pct(tm.google.spend, lm.google.spend);
    const mSpendChg  = pct(tm.meta.spend,   lm.meta.spend);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:200,
          messages:[{role:"user",content:
            "Write exactly 3 short sentences summarizing paid ads performance for a non-marketing business executive. No jargon. Focus on business outcomes.\n\n" +
            "Data: Total conversions this month: "+Math.round(totalConv)+", vs "+Math.round(prevConv)+" last month ("+(convChg!==null?(convChg>0?"+":"")+convChg.toFixed(1)+"%":"n/a")+"). " +
            "Blended CPA: $"+blendedCpa.toFixed(0)+". " +
            "Google spend change MoM: "+(gSpendChg!==null?(gSpendChg>0?"+":"")+gSpendChg.toFixed(1)+"%":"n/a")+". " +
            "Meta spend change MoM: "+(mSpendChg!==null?(mSpendChg>0?"+":"")+mSpendChg.toFixed(1)+"%":"n/a")+". " +
            "Google ROAS: "+tm.google.roas.toFixed(1)+"x. Meta ROAS: "+tm.meta.roas.toFixed(1)+"x.\n\n" +
            "Sentence 1: overall conversion performance vs last month. Sentence 2: which platform is working best and why. Sentence 3: one specific thing to watch or act on. Plain text only."
          }]
        })
      });
      const json = await res.json();
      const txt = (json.content||[]).find(b=>b.type==="text");
      setNarrative(txt ? txt.text : "");
    } catch(e) { setNarrative(""); }
    setNarLoading(false);
  }

  useEffect(() => {
    fetchData();
    timer.current = setInterval(fetchData, 60000);
    return () => clearInterval(timer.current);
  }, []);

  useEffect(() => {
    if (source === "live" || source === "demo") {
      clearTimeout(narTimer.current);
      narTimer.current = setTimeout(() => generateNarrative(periods), 800);
    }
  }, [periods, source]);

  const tm = periods.thisMonth, lm = periods.lastMonth;

  function combined(period) {
    const g = period.google, m = period.meta;
    const spend=g.spend+m.spend, conversions=g.conversions+m.conversions, revenue=g.revenue+m.revenue, budget=g.budget+m.budget;
    return { spend, conversions, revenue, budget,
      cpa:  conversions>0 ? spend/conversions : 0,
      roas: spend>0&&revenue>0 ? revenue/spend : 0,
    };
  }

  const selPlatform = p => platform==="google" ? p.google : platform==="meta" ? p.meta : combined(p);
  const curData = selPlatform(tm);
  const priData = selPlatform(lm);

  const allCampaigns = platform==="both"
    ? (tm.google.campaigns||[]).concat(tm.meta.campaigns||[])
    : platform==="google" ? (tm.google.campaigns||[]) : (tm.meta.campaigns||[]);

  const avgCpa  = curData.cpa  || 0;
  const avgRoas = curData.roas || 0;

  const statusColor = {live:C.green,loading:C.yellow,error:C.red,demo:C.muted}[source]||C.muted;
  const statusLabel = {live:"LIVE",loading:"SYNCING",error:"ERROR",demo:"DEMO DATA"}[source]||"DEMO";

  async function generateEmail() {
    if (!recipient) return;
    setGenerating(true); setEmailBody("");
    const c = combined(tm), p = combined(lm);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:600,
          messages:[{role:"user",content:
            "Write a paid ads performance email for non-marketing business stakeholders. Avoid all marketing jargon. Focus on revenue, cost, and business outcomes.\n\n" +
            "This month: Spend $"+Math.round(c.spend).toLocaleString()+", Conversions "+Math.round(c.conversions)+", CPA $"+c.cpa.toFixed(0)+", ROAS "+c.roas.toFixed(1)+"x\n" +
            "Last month: Spend $"+Math.round(p.spend).toLocaleString()+", Conversions "+Math.round(p.conversions)+", CPA $"+p.cpa.toFixed(0)+", ROAS "+p.roas.toFixed(1)+"x\n" +
            "Top campaigns: "+allCampaigns.slice(0,3).map(c=>c.name).join(", ")+"\n\n" +
            "Write 4 short paragraphs: (1) one-line summary of month, (2) what drove results, (3) what needs attention, (4) recommended actions with expected impact. Plain text, no markdown, no acronyms."
          }]
        })
      });
      const json = await res.json();
      const txt = (json.content||[]).find(b=>b.type==="text");
      setEmailBody(txt ? txt.text : "Could not generate email.");
    } catch(e) { setEmailBody("Error generating email."); }
    setGenerating(false);
    setTimeout(()=>{ setSent(true); setModal(false); setTimeout(()=>setSent(false),3000); },400);
  }

  const btnS = a => ({padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:a?"#3b82f6":C.card,color:a?"#fff":C.muted});
  const tabS = a => ({padding:"8px 18px",border:"none",cursor:"pointer",fontWeight:600,fontSize:13,background:a?"rgba(59,130,246,0.15)":"transparent",color:a?"#60a5fa":C.muted,borderBottom:a?"2px solid #3b82f6":"2px solid transparent",borderRadius:"8px 8px 0 0"});

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"Inter,sans-serif",padding:24}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:9,height:9,borderRadius:"50%",background:statusColor,boxShadow:source==="live"?"0 0 8px "+C.green:"none"}}/>
            <span style={{fontSize:11,fontWeight:700,letterSpacing:1,color:statusColor}}>{statusLabel}</span>
            <span style={{fontSize:11,color:C.muted}}>{"· "+updated.toLocaleTimeString()}</span>
            {(source==="error"||source==="demo") && <button onClick={fetchData} style={{fontSize:11,color:"#60a5fa",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Retry</button>}
          </div>
          {errMsg && <div style={{fontSize:11,color:C.red,marginTop:2}}>{errMsg}</div>}
          <h1 style={{margin:"4px 0 0",fontSize:22,fontWeight:800}}>Paid Ads Performance</h1>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>This month vs last month · All figures in USD</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:4,background:C.card,padding:4,borderRadius:10}}>
            {["both","google","meta"].map(p=>(
              <button key={p} style={btnS(platform===p)} onClick={()=>setPlatform(p)}>
                {p==="both"?"All Channels":p==="google"?"Google":"Meta"}
              </button>
            ))}
          </div>
          <button onClick={()=>setModal(true)} style={{padding:"8px 18px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:"#3b82f6",color:"#fff"}}>
            ✉️ Send Report
          </button>
        </div>
      </div>

      {/* Budget Pacing */}
      <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"16px 20px",marginBottom:16,display:"flex",flexDirection:"column",gap:10}}>
        <div style={{fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1}}>Budget Pacing — This Month</div>
        {(platform==="both"||platform==="google") && <BudgetBar label="GOOGLE" spend={tm.google.spend||0} budget={tm.google.budget||0} color={C.google}/>}
        {(platform==="both"||platform==="meta")   && <BudgetBar label="META"   spend={tm.meta.spend||0}   budget={tm.meta.budget||0}   color={C.meta}/>}
      </div>

      {/* AI Narrative */}
      <NarrativeBar text={narrative || "Analyzing performance data…"} loading={narLoading} />

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"1px solid "+C.border}}>
        {["overview","campaigns","trends"].map(t=>(
          <button key={t} style={tabS(tab===t)} onClick={()=>setTab(t)}>
            {t==="trends"?"MoM Trends":t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab==="overview" && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:14}}>
          <OutcomeCard label="Total Ad Spend"        sublabel="How much we invested"          value={fmt(curData.spend,"dollar")}       change={pct(curData.spend,priData.spend)}             inverse={true}  note={"Last month: "+fmt(priData.spend,"dollar")} />
          <OutcomeCard label="Conversions"           sublabel="Purchases driven by ads"        value={fmt(curData.conversions,"int")}    change={pct(curData.conversions,priData.conversions)} inverse={false} note={"Last month: "+fmt(priData.conversions,"int")} />
          <OutcomeCard label="Cost per Acquisition"  sublabel="What each conversion costs"     value={fmt(curData.cpa,"dollar")}         change={pct(curData.cpa,priData.cpa)}                 inverse={true}  note={"Last month: "+fmt(priData.cpa,"dollar")} />
          <OutcomeCard label="Return on Ad Spend"    sublabel="Revenue per $1 spent"           value={fmt(curData.roas,"roas")}          change={pct(curData.roas,priData.roas)}               inverse={false} note={"Last month: "+fmt(priData.roas,"roas")} />
        </div>
      )}

      {/* Campaigns */}
      {tab==="campaigns" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 80px 1fr 1fr 1fr",gap:12,padding:"8px 16px",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1}}>
            <span>Campaign</span><span>Health</span><span>Spend</span><span>Conversions</span><span>Cost / Conv.</span>
          </div>
          {allCampaigns.length===0 && <div style={{color:C.muted,padding:20}}>No campaign data available.</div>}
          {allCampaigns.map((c,i)=>{
            const score   = campaignScore(c, avgCpa, avgRoas);
            const cpa2    = c.conversions>0 ? c.spend/c.conversions : null;
            const statusNote = score==="green"?"On track":score==="yellow"?"Needs review":score==="paused"?"Paused":"Underperforming";
            return (
              <div key={i} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"14px 16px",display:"grid",gridTemplateColumns:"2fr 80px 1fr 1fr 1fr",alignItems:"center",gap:12}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14}}>{c.name}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>{statusNote}</div>
                </div>
                <ScoreIcon score={score}/>
                <div><div style={{fontSize:11,color:C.muted}}>Spend</div><div style={{fontWeight:700}}>{"$"+(c.spend||0).toLocaleString()}</div></div>
                <div><div style={{fontSize:11,color:C.muted}}>Conversions</div><div style={{fontWeight:700}}>{c.conversions||0}</div></div>
                <div><div style={{fontSize:11,color:C.muted}}>Cost / Conv.</div><div style={{fontWeight:700}}>{cpa2!==null?"$"+cpa2.toFixed(0):"—"}</div></div>
              </div>
            );
          })}
          <div style={{fontSize:11,color:C.muted,padding:"8px 4px"}}>
            ✅ On track · ⚠️ Needs review · 🔴 Underperforming · ⏸️ Paused
          </div>
        </div>
      )}

      {/* MoM Trends */}
      {tab==="trends" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontSize:13,color:C.muted,marginBottom:4}}>Comparing this month to last month across all key business metrics.</div>
          {[
            { label:"Ad Spend",           cur:curData.spend,       pri:priData.spend,       fmtType:"dollar", inverse:true,  icon:"💰", desc:"Total invested in paid ads" },
            { label:"Conversions",         cur:curData.conversions, pri:priData.conversions, fmtType:"int",    inverse:false, icon:"🛒", desc:"Total purchases driven by ads" },
            { label:"Cost per Conversion", cur:curData.cpa,         pri:priData.cpa,         fmtType:"dollar", inverse:true,  icon:"🎯", desc:"Lower is better" },
            { label:"Return on Ad Spend",  cur:curData.roas,        pri:priData.roas,        fmtType:"roas",   inverse:false, icon:"📈", desc:"Revenue earned per $1 spent" },
          ].map((m,i) => {
            const chg  = pct(m.cur, m.pri);
            const up   = chg !== null && chg >= 0;
            const good = m.inverse ? !up : up;
            const barW = m.pri > 0 ? Math.min((m.cur/m.pri)*100,150) : 50;
            return (
              <div key={i} style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:"18px 20px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:C.text}}>{m.icon+" "+m.label}</div>
                    <div style={{fontSize:11,color:C.muted}}>{m.desc}</div>
                  </div>
                  {chg!==null
                    ? <span style={{fontSize:13,fontWeight:800,color:good?C.green:C.red,background:good?"rgba(34,197,94,0.12)":"rgba(239,68,68,0.12)",borderRadius:8,padding:"4px 12px"}}>
                        {up?"▲":"▼"} {Math.abs(chg).toFixed(1)}%
                      </span>
                    : <span style={{fontSize:12,color:C.muted}}>No prior data</span>}
                </div>
                <div style={{display:"flex",gap:16,alignItems:"center"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,color:C.muted,marginBottom:4}}>This Month</div>
                    <div style={{height:28,background:"#0f172a",borderRadius:6,overflow:"hidden",position:"relative"}}>
                      <div style={{width:barW+"%",height:"100%",background:good?C.green:"#3b82f6",borderRadius:6,transition:"width 0.8s",opacity:0.85}}/>
                      <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13,fontWeight:800,color:"#fff"}}>{fmt(m.cur,m.fmtType)}</div>
                    </div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Last Month</div>
                    <div style={{height:28,background:"#0f172a",borderRadius:6,overflow:"hidden",position:"relative"}}>
                      <div style={{width:"100%",height:"100%",background:"#334155",borderRadius:6}}/>
                      <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13,fontWeight:800,color:"#94a3b8"}}>{fmt(m.pri,m.fmtType)}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Email Modal */}
      {modal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
          <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:16,padding:28,width:480,maxWidth:"90vw"}}>
            <h2 style={{margin:"0 0 4px",fontSize:18,fontWeight:800}}>Send Monthly Report</h2>
            <div style={{fontSize:12,color:C.muted,marginBottom:18}}>AI-written for non-marketing stakeholders</div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:12,color:C.muted,display:"block",marginBottom:4}}>To</label>
              <input value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="stakeholder@company.com"
                style={{width:"100%",background:"#0f172a",border:"1px solid "+C.border,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:14,boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:12,color:C.muted,display:"block",marginBottom:4}}>Subject</label>
              <input value={subject} onChange={e=>setSubject(e.target.value)}
                style={{width:"100%",background:"#0f172a",border:"1px solid "+C.border,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:14,boxSizing:"border-box"}}/>
            </div>
            <div style={{background:"#0f172a",borderRadius:10,padding:14,marginBottom:16,fontSize:13,color:C.muted,maxHeight:180,overflowY:"auto",lineHeight:1.7}}>
              {generating?"Generating stakeholder report…":emailBody
                ?<span style={{color:C.text,whiteSpace:"pre-wrap"}}>{emailBody}</span>
                :"Click Generate & Send to create a plain-English performance summary for your BU."}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModal(false)} style={{flex:1,padding:10,borderRadius:10,border:"1px solid "+C.border,background:"transparent",color:C.muted,cursor:"pointer",fontWeight:600}}>Cancel</button>
              <button onClick={generateEmail} disabled={generating||!recipient}
                style={{flex:2,padding:10,borderRadius:10,border:"none",background:generating||!recipient?"#1e3a5f":"#3b82f6",color:"#fff",cursor:generating||!recipient?"not-allowed":"pointer",fontWeight:700,fontSize:14}}>
                {generating?"Generating…":"Generate & Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sent && (
        <div style={{position:"fixed",bottom:28,right:28,background:C.green,color:"#fff",padding:"12px 20px",borderRadius:12,fontWeight:700,fontSize:14,boxShadow:"0 4px 20px rgba(0,0,0,0.4)"}}>
          ✅ Report sent!
        </div>
      )}
    </div>
  );
}
