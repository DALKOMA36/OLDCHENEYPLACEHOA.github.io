import { useState, useRef } from "react";
import * as XLSX from "xlsx";

const BIRDS_PER_ROUND = 25;

// ── Theme system ──
const DARK = {
  bg: "#0f0c08",
  bgGrad: "radial-gradient(ellipse at 50% 0%, #2a1a08 0%, #0f0c08 70%)",
  card: "rgba(20,14,4,0.8)",
  cardActive: "rgba(30,20,5,0.95)",
  cardInactive: "rgba(15,10,3,0.7)",
  border: "#2a1a08",
  borderActive: "#d4830a",
  text: "#e8d5a0",
  textMuted: "#6a5020",
  textDim: "#4a3010",
  textDimmer: "#3a2a10",
  accent: "#f5c060",
  accentBold: "#f5a020",
  hit: "#f5a020",
  hitBorder: "#f5c060",
  miss: "#e05040",
  missBorder: "#c03030",
  missCircle: "#902020",
  good: "#4adf80",
  warn: "#f5c060",
  bad: "#e05040",
  inputBg: "rgba(255,255,255,0.04)",
  scoreBg: "rgba(10,7,2,0.5)",
  stationBg: "rgba(255,255,255,0.02)",
  stationActive: "rgba(200,100,0,0.12)",
  hitBtn: "linear-gradient(160deg,#b86000,#7a3800)",
  hitBtnBorder: "#e08820",
  missBtn: "linear-gradient(160deg,#901818,#5a0808)",
  missBtnBorder: "#c02020",
  disabledBg: "#0a0702",
  disabledBorder: "#1a1005",
  disabledText: "#2a1a08",
  smallBtnBg: "rgba(255,255,255,0.04)",
  smallBtnBorder: "#2a1a08",
  smallBtnText: "#8a7040",
  highlightBg: "rgba(60,120,40,0.25)",
  highlightBorder: "#4a9030",
  highlightText: "#80d060",
  dotEmpty: "#1e1408",
  dotEmptyBorder: "#2a1a08",
  flashHit: "#f5a020",
  flashMiss: "#e05040",
  flashHitShadow: "0 0 30px rgba(245,160,32,0.6)",
  flashMissShadow: "0 0 30px rgba(224,80,64,0.6)",
  leaderFirst: "rgba(200,100,0,0.1)",
  leaderRest: "rgba(20,14,4,0.6)",
  toggleOn: "rgba(200,100,0,0.4)",
  toggleOff: "rgba(255,255,255,0.05)",
  toggleDot: "#f5a020",
  toggleDotOff: "#3a2a10",
  streak: "#ff9020",
  streakHot: "#ff6020",
  tabActive: "rgba(200,100,0,0.2)",
  tabInactive: "rgba(255,255,255,0.03)",
  tabText: "#4a3010",
  saveBg: "rgba(60,120,40,0.2)",
  saveBorder: "#4a9030",
  saveText: "#80d060",
};

const SUN = {
  bg: "#ffffff",
  bgGrad: "none",
  card: "#f0f0f0",
  cardActive: "#ffffff",
  cardInactive: "#f5f5f5",
  border: "#bbb",
  borderActive: "#cc6600",
  text: "#000000",
  textMuted: "#555",
  textDim: "#777",
  textDimmer: "#999",
  accent: "#cc6600",
  accentBold: "#cc4400",
  hit: "#006600",
  hitBorder: "#008800",
  miss: "#cc0000",
  missBorder: "#aa0000",
  missCircle: "#cc0000",
  good: "#006600",
  warn: "#cc6600",
  bad: "#cc0000",
  inputBg: "#ffffff",
  scoreBg: "#e8e8e8",
  stationBg: "#f0f0f0",
  stationActive: "#fff3e0",
  hitBtn: "linear-gradient(160deg,#008800,#006600)",
  hitBtnBorder: "#00aa00",
  missBtn: "linear-gradient(160deg,#cc0000,#990000)",
  missBtnBorder: "#ee0000",
  disabledBg: "#e0e0e0",
  disabledBorder: "#ccc",
  disabledText: "#aaa",
  smallBtnBg: "#e8e8e8",
  smallBtnBorder: "#bbb",
  smallBtnText: "#333",
  highlightBg: "#d4edda",
  highlightBorder: "#28a745",
  highlightText: "#155724",
  dotEmpty: "#ddd",
  dotEmptyBorder: "#bbb",
  flashHit: "#006600",
  flashMiss: "#cc0000",
  flashHitShadow: "0 0 40px rgba(0,102,0,0.5)",
  flashMissShadow: "0 0 40px rgba(204,0,0,0.5)",
  leaderFirst: "#fff3e0",
  leaderRest: "#f5f5f5",
  toggleOn: "#cc6600",
  toggleOff: "#ddd",
  toggleDot: "#ffffff",
  toggleDotOff: "#999",
  streak: "#cc4400",
  streakHot: "#ff0000",
  tabActive: "#cc6600",
  tabInactive: "#e8e8e8",
  tabText: "#555",
  saveBg: "#d4edda",
  saveBorder: "#28a745",
  saveText: "#155724",
};

const trophyLabel = (pct) => {
  if (pct === 100) return "\u{1F3C6} PERFECT";
  if (pct >= 92) return "\u{1F947} Expert";
  if (pct >= 80) return "\u{1F948} Sharp";
  if (pct >= 64) return "\u{1F949} Marksman";
  return "\u{1F3AF} Training";
};

const getStreak = (history) => {
  let s = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] === "hit") s++; else break;
  }
  return s;
};

const defaultShooter = (i, setup = {}) => ({
  name: setup.name || `SHOOTER ${i + 1}`,
  gun: setup.gun || "",
  choke: setup.choke || "",
  hits: 0, misses: 0,
  history: [],
  rounds: [],
  roundNum: 1,
});

// ── Feedback hook ──
function useFeedback(vibOn, sndOn) {
  const audioCtx = useRef(null);
  const getCtx = () => {
    if (!audioCtx.current) {
      try { audioCtx.current = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
    }
    return audioCtx.current;
  };
  const playTone = (freq, type, duration, gain) => {
    if (!sndOn) return;
    try {
      const ctx = getCtx(); if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.start(); osc.stop(ctx.currentTime + duration);
    } catch(e){}
  };
  const feedbackHit = () => {
    if (vibOn && navigator.vibrate) navigator.vibrate(40);
    playTone(880, "sine", 0.12, 0.18);
  };
  const feedbackMiss = () => {
    if (vibOn && navigator.vibrate) navigator.vibrate([30, 20, 30]);
    playTone(220, "triangle", 0.18, 0.14);
  };
  return { feedbackHit, feedbackMiss };
}

// ── Excel Export ──
function exportExcel(squadNum, trapNum, notes, weather, shooters, eventName) {
  const rows = [];
  shooters.forEach(s => {
    const allRounds = [...s.rounds];
    if (s.hits + s.misses > 0) {
      allRounds.push({ round: s.roundNum, hits: s.hits, misses: s.misses, pct: s.hits+s.misses>0?Math.round((s.hits/(s.hits+s.misses))*100):0 });
    }
    if (allRounds.length === 0) {
      rows.push({
        Event: eventName || "", Squad: squadNum, Trap: trapNum,
        Weather: weather, Notes: notes,
        Shooter: s.name, Gun: s.gun, Choke: s.choke,
        Round: "", Hits: "", Misses: "", Pct: "",
        "S1":"","S2":"","S3":"","S4":"","S5":"",
      });
    }
    allRounds.forEach((r, ri) => {
      const hist = ri < s.rounds.length ? [] : s.history;
      const stationHits = [1,2,3,4,5].map(st => {
        const shots = hist.slice((st-1)*5, st*5);
        if (shots.length === 0) return "";
        return shots.filter(x => x === "hit").length;
      });
      rows.push({
        Event: eventName || "", Squad: squadNum, Trap: trapNum,
        Weather: weather, Notes: notes,
        Shooter: s.name, Gun: s.gun, Choke: s.choke,
        Round: r.round, Hits: r.hits, Misses: r.misses, Pct: r.pct,
        "S1": stationHits[0], "S2": stationHits[1], "S3": stationHits[2],
        "S4": stationHits[3], "S5": stationHits[4],
      });
    });
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const colWidths = [
    {wch:16},{wch:6},{wch:5},{wch:12},{wch:16},
    {wch:18},{wch:16},{wch:12},
    {wch:6},{wch:5},{wch:6},{wch:5},
    {wch:4},{wch:4},{wch:4},{wch:4},{wch:4},
  ];
  ws["!cols"] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Scores");
  const date = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `trap-scores-sq${squadNum}-${date}.xlsx`);
}

// ── Excel Import ──
function importExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);
        if (!rows.length) { reject("Empty spreadsheet"); return; }
        const first = rows[0];
        const squadNum = first.Squad || 1;
        const trapNum = first.Trap || 1;
        const weather = first.Weather || "";
        const notes = first.Notes || "";
        const eventName = first.Event || "";
        const shooterMap = {};
        rows.forEach(r => {
          const name = (r.Shooter || "").toString().toUpperCase().trim();
          if (!name) return;
          if (!shooterMap[name]) {
            shooterMap[name] = {
              name,
              gun: (r.Gun || "").toString().toUpperCase(),
              choke: (r.Choke || "").toString().toUpperCase(),
              rounds: [],
            };
          }
          if (r.Round !== undefined && r.Round !== "") {
            shooterMap[name].rounds.push({
              round: parseInt(r.Round) || 1,
              hits: parseInt(r.Hits) || 0,
              misses: parseInt(r.Misses) || 0,
              pct: parseInt(r.Pct) || 0,
            });
          }
        });
        const shooterList = Object.values(shooterMap);
        resolve({ squadNum, trapNum, weather, notes, eventName, shooters: shooterList });
      } catch (err) {
        reject("Could not read spreadsheet: " + err.message);
      }
    };
    reader.onerror = () => reject("File read error");
    reader.readAsArrayBuffer(file);
  });
}

// ── Export Template ──
function exportTemplate() {
  const rows = [
    { Event:"SPRING SHOOT 2026", Squad:1, Trap:1, Weather:"SUNNY 75F", Notes:"PRACTICE",
      Shooter:"JOHN DOE", Gun:"BERETTA 686", Choke:"MOD", Round:1, Hits:22, Misses:3, Pct:88,
      S1:5, S2:4, S3:5, S4:4, S5:4 },
    { Event:"SPRING SHOOT 2026", Squad:1, Trap:1, Weather:"SUNNY 75F", Notes:"PRACTICE",
      Shooter:"JOHN DOE", Gun:"BERETTA 686", Choke:"MOD", Round:2, Hits:20, Misses:5, Pct:80,
      S1:4, S2:4, S3:4, S4:4, S5:4 },
    { Event:"SPRING SHOOT 2026", Squad:1, Trap:1, Weather:"SUNNY 75F", Notes:"PRACTICE",
      Shooter:"JANE SMITH", Gun:"BROWNING CITORI", Choke:"IC", Round:1, Hits:24, Misses:1, Pct:96,
      S1:5, S2:5, S3:5, S4:5, S5:4 },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    {wch:20},{wch:6},{wch:5},{wch:14},{wch:16},
    {wch:18},{wch:16},{wch:12},
    {wch:6},{wch:5},{wch:6},{wch:5},
    {wch:4},{wch:4},{wch:4},{wch:4},{wch:4},
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Scores");
  XLSX.writeFile(wb, "trap-scores-template.xlsx");
}

// ── Flash overlay ──
function FlashLabel({ label, t }) {
  if (!label) return null;
  const isHit = label === "HIT";
  return (
    <div style={{
      position: "fixed", top: "50%", left: "50%",
      transform: "translate(-50%, -50%)",
      fontSize: 64, fontWeight: "900", letterSpacing: 10,
      color: isHit ? t.flashHit : t.flashMiss,
      textShadow: isHit ? t.flashHitShadow : t.flashMissShadow,
      fontFamily: "'Courier New', Courier, monospace",
      pointerEvents: "none", zIndex: 999,
      opacity: 1, animation: "fadeFlash 0.65s ease-out forwards",
    }}>{label}</div>
  );
}

function StationBar({ history, t }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, letterSpacing: 3, color: t.textMuted, marginBottom: 6, textAlign: "center", fontWeight:"bold" }}>STATIONS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
        {[1,2,3,4,5].map(st => {
          const shots = history.slice((st-1)*5, st*5);
          const stHits = shots.filter(s => s === "hit").length;
          const isActive = Math.floor(history.length / 5) + 1 === st && history.length < 25;
          const isDone = shots.length === 5;
          return (
            <div key={st} style={{
              background: isActive ? t.stationActive : t.stationBg,
              border: `2px solid ${isActive ? t.borderActive : t.border}`,
              borderRadius: 6, padding: "6px 4px", textAlign: "center",
            }}>
              <div style={{ fontSize: 10, color: isActive ? t.borderActive : t.textDimmer, letterSpacing: 1, marginBottom: 4, fontWeight:"bold" }}>
                {isActive ? "\u25B6S" : "S"}{st}
              </div>
              <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                {[0,1,2,3,4].map(j => {
                  const shot = shots[j];
                  return <div key={j} style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: shot === "hit" ? t.hit : shot === "miss" ? t.missCircle : t.dotEmpty,
                    border: `2px solid ${shot === "hit" ? t.hitBorder : shot === "miss" ? t.missBorder : t.dotEmptyBorder}`,
                  }} />;
                })}
              </div>
              {isDone && <div style={{ fontSize: 11, fontWeight:"bold", color: stHits >= 4 ? t.good : stHits >= 3 ? t.warn : t.bad, marginTop: 3 }}>{stHits}/5</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShooterCard({ shooter, onChange, onSave, active, onSelect, feedbackHit, feedbackMiss, setFlashLabel, t, sun }) {
  const { name, hits, misses, history, rounds, roundNum } = shooter;
  const total = hits + misses;
  const remaining = BIRDS_PER_ROUND - total;
  const pct = total > 0 ? Math.round((hits / total) * 100) : 0;
  const done = total >= BIRDS_PER_ROUND;
  const streak = getStreak(history);
  const allHits = rounds.reduce((a,r)=>a+r.hits,0)+hits;
  const allShots = rounds.reduce((a,r)=>a+r.hits+r.misses,0)+total;
  const allPct = allShots > 0 ? Math.round((allHits/allShots)*100) : 0;
  const [editName, setEditName] = useState(false);

  const record = (type) => {
    if (done) return;
    if (type === "hit") { feedbackHit(); setFlashLabel("HIT"); }
    else { feedbackMiss(); setFlashLabel("MISS"); }
    onChange({ hits: type==="hit"?hits+1:hits, misses: type==="miss"?misses+1:misses, history:[...history,type] });
  };

  const undo = () => {
    if (!history.length) return;
    const h=[...history]; const last=h.pop();
    onChange({ hits:last==="hit"?hits-1:hits, misses:last==="miss"?misses-1:misses, history:h });
  };

  const hitBtnStyle = (enabled) => ({
    padding:"20px 0",
    background: !enabled ? t.disabledBg : t.hitBtn,
    border: `3px solid ${!enabled ? t.disabledBorder : t.hitBtnBorder}`,
    borderRadius:10, color: !enabled ? t.disabledText : "#fff",
    fontSize:18, fontWeight:"900", letterSpacing:4,
    cursor: !enabled ? "not-allowed" : "pointer",
    fontFamily:"'Courier New',Courier,monospace",
    boxShadow: enabled ? "0 4px 16px rgba(0,100,0,0.3)" : "none",
    transition:"all 0.15s",
  });

  const missBtnStyle = (enabled) => ({
    padding:"20px 0",
    background: !enabled ? t.disabledBg : t.missBtn,
    border: `3px solid ${!enabled ? t.disabledBorder : t.missBtnBorder}`,
    borderRadius:10, color: !enabled ? t.disabledText : "#fff",
    fontSize:18, fontWeight:"900", letterSpacing:4,
    cursor: !enabled ? "not-allowed" : "pointer",
    fontFamily:"'Courier New',Courier,monospace",
    boxShadow: enabled ? "0 4px 16px rgba(200,0,0,0.3)" : "none",
    transition:"all 0.15s",
  });

  const smBtn = (disabled, highlight=false) => ({
    padding:"12px 0",
    background: disabled ? t.disabledBg : highlight ? t.highlightBg : t.smallBtnBg,
    border: `2px solid ${disabled ? t.disabledBorder : highlight ? t.highlightBorder : t.smallBtnBorder}`,
    borderRadius:6, color: disabled ? t.disabledText : highlight ? t.highlightText : t.smallBtnText,
    fontSize:11, fontWeight:"bold", letterSpacing:2,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily:"'Courier New',Courier,monospace", transition:"all 0.15s",
  });

  return (
    <div onClick={()=>!active&&onSelect()} style={{
      background: active ? t.cardActive : t.cardInactive,
      border: `3px solid ${active ? t.borderActive : t.border}`,
      borderRadius:10, padding: active ? "16px" : "12px 16px",
      marginBottom:12, cursor: active ? "default" : "pointer",
      transition:"all 0.2s",
      boxShadow: active ? (sun ? "0 2px 8px rgba(0,0,0,0.15)" : "0 0 20px rgba(200,100,0,0.15)") : "none",
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:active?12:0}}>
        {editName && active
          ? <input autoFocus value={name}
              onChange={e=>onChange({name:e.target.value.toUpperCase()})}
              onBlur={()=>setEditName(false)}
              onKeyDown={e=>e.key==="Enter"&&setEditName(false)}
              style={{background:"transparent",border:"none",borderBottom:`3px solid ${t.borderActive}`,color:t.accent,fontSize:16,fontWeight:"900",letterSpacing:3,outline:"none",width:"55%",fontFamily:"inherit"}}/>
          : <div onClick={e=>{if(active){e.stopPropagation();setEditName(true);}}}
              style={{fontSize:15,fontWeight:"900",letterSpacing:3,color:active?t.accent:t.textMuted,cursor:active?"pointer":"default"}}>
              {name} {active&&"\u270E"}
            </div>
        }
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {streak>=3&&active&&<span style={{fontSize:13,fontWeight:"bold",color:t.streak}}>{"\u{1F525}"}{streak}</span>}
          <span style={{fontSize:13,fontWeight:"bold",color:t.textMuted,letterSpacing:2}}>R{roundNum}</span>
          {!active&&<span style={{fontSize:14,fontWeight:"bold",color:total>0?(pct>=80?t.good:t.warn):t.textDimmer}}>{total>0?`${hits}/${total} (${pct}%)`:"\u2013"}</span>}
          {active&&done&&<span style={{fontSize:11,fontWeight:"bold",color:t.good,letterSpacing:2}}>\u25CF DONE</span>}
        </div>
      </div>

      {active&&<>
        {(shooter.gun||shooter.choke)&&
          <div style={{fontSize:12,fontWeight:"bold",color:t.textDim,letterSpacing:2,marginBottom:10,textAlign:"center"}}>
            {shooter.gun&&`${shooter.gun}`}{shooter.gun&&shooter.choke?"  \u00B7  ":""}{shooter.choke&&`${shooter.choke}`}
          </div>}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:t.scoreBg,borderRadius:10,padding:"14px 20px",marginBottom:12,border:`2px solid ${t.border}`}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:48,fontWeight:"900",color:t.hit,lineHeight:1}}>{hits}</div>
            <div style={{fontSize:11,fontWeight:"bold",letterSpacing:3,color:t.textMuted}}>HITS</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:32,fontWeight:"900",color:pct>=80?t.good:pct>=60?t.warn:t.bad,lineHeight:1}}>{pct}%</div>
            <div style={{fontSize:11,fontWeight:"bold",color:t.textMuted,marginTop:2}}>{trophyLabel(pct)}</div>
            {streak>0&&<div style={{fontSize:12,fontWeight:"bold",color:streak>=5?t.streakHot:t.streak,marginTop:2}}>{"\u{1F525}"} {streak} streak</div>}
            <div style={{fontSize:11,fontWeight:"bold",color:t.textDim,marginTop:2}}>{remaining>0?`${remaining} left`:"DONE"}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:48,fontWeight:"900",color:t.miss,lineHeight:1}}>{misses}</div>
            <div style={{fontSize:11,fontWeight:"bold",letterSpacing:3,color:t.textMuted}}>MISS</div>
          </div>
        </div>

        <StationBar history={history} t={t}/>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <button onClick={()=>record("hit")} disabled={done} style={hitBtnStyle(!done)}>{"\u2713"} HIT</button>
          <button onClick={()=>record("miss")} disabled={done} style={missBtnStyle(!done)}>{"\u2715"} MISS</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <button onClick={undo} disabled={!history.length} style={smBtn(!history.length)}>{"\u21A9"} UNDO</button>
          <button onClick={onSave} disabled={!done} style={smBtn(!done,true)}>{"\u2714"} SAVE RND</button>
          <button onClick={()=>onChange({hits:0,misses:0,history:[]})} style={smBtn(false)}>{"\u27F3"} RESET</button>
        </div>

        {rounds.length>0&&<div style={{marginTop:12,borderTop:`2px solid ${t.border}`,paddingTop:10}}>
          <div style={{fontSize:11,fontWeight:"bold",letterSpacing:3,color:t.textDim,marginBottom:6}}>SESSION LOG</div>
          {rounds.map(r=>(
            <div key={r.round} style={{display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:"bold",padding:"4px 0",borderBottom:`1px solid ${t.border}`}}>
              <span style={{color:t.textMuted}}>RND {r.round}</span>
              <span style={{color:t.accentBold}}>{r.hits}/25</span>
              <span style={{color:r.pct>=80?t.good:t.warn}}>{r.pct}%</span>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:"900",paddingTop:6}}>
            <span style={{color:t.textMuted,letterSpacing:2}}>TOTAL</span>
            <span style={{color:t.accent}}>{allHits}/{allShots}</span>
            <span style={{color:allPct>=80?t.good:t.warn}}>{allPct}%</span>
          </div>
        </div>}
      </>}
    </div>
  );
}

function Leaderboard({ shooters, t }) {
  const ranked = [...shooters].map((s,i)=>{
    const h=s.rounds.reduce((a,r)=>a+r.hits,0)+s.hits;
    const sh=s.rounds.reduce((a,r)=>a+r.hits+r.misses,0)+s.hits+s.misses;
    return {...s,allHits:h,allShots:sh,pct:sh>0?Math.round((h/sh)*100):0,idx:i};
  }).sort((a,b)=>b.allHits-a.allHits||b.pct-a.pct);
  const medals=["\u{1F947}","\u{1F948}","\u{1F949}","4th","5th"];
  return (
    <div>
      <div style={{fontSize:12,fontWeight:"bold",letterSpacing:4,color:t.textMuted,textAlign:"center",marginBottom:16}}>SQUAD LEADERBOARD</div>
      {ranked.map((s,i)=>(
        <div key={s.idx} style={{display:"flex",alignItems:"center",gap:12,background:i===0?t.leaderFirst:t.leaderRest,border:`2px solid ${i===0?t.borderActive:t.border}`,borderRadius:8,padding:"14px 16px",marginBottom:8}}>
          <div style={{fontSize:i<3?24:14,minWidth:36,textAlign:"center",color:t.textMuted,fontWeight:"bold"}}>{medals[i]}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:"900",color:i===0?t.accent:t.textMuted,letterSpacing:2}}>{s.name}</div>
            {(s.gun||s.choke)&&<div style={{fontSize:11,fontWeight:"bold",color:t.textDim,marginTop:2}}>{s.gun}{s.gun&&s.choke?" \u00B7 ":""}{s.choke}</div>}
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:26,fontWeight:"900",color:t.accentBold}}>{s.allHits}</div>
            <div style={{fontSize:11,fontWeight:"bold",color:t.textMuted}}>{s.allShots>0?`${s.pct}%`:"\u2013"}</div>
          </div>
          <div style={{fontSize:11,fontWeight:"bold",color:t.textDim}}>{trophyLabel(s.pct)}</div>
        </div>
      ))}
    </div>
  );
}

function Toggle({ label, value, onChange, icon, t }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight:"bold", letterSpacing: 2, color: t.textMuted, flex: 1 }}>{label}</span>
      <div onClick={() => onChange(!value)} style={{
        width: 46, height: 26, borderRadius: 13,
        background: value ? t.toggleOn : t.toggleOff,
        border: `2px solid ${value ? t.borderActive : t.border}`,
        cursor: "pointer", position: "relative", transition: "all 0.2s",
      }}>
        <div style={{
          position: "absolute", top: 3, left: value ? 22 : 3,
          width: 18, height: 18, borderRadius: "50%",
          background: value ? t.toggleDot : t.toggleDotOff,
          transition: "all 0.2s",
        }} />
      </div>
      <span style={{ fontSize: 11, fontWeight:"bold", color: value ? t.accent : t.textDimmer, letterSpacing: 1, minWidth: 24 }}>
        {value ? "ON" : "OFF"}
      </span>
    </div>
  );
}

function NumInput({label,value,onChange,min=1,max=99,t}){
  return(
    <div style={{textAlign:"center"}}>
      <div style={{fontSize:11,fontWeight:"bold",letterSpacing:3,color:t.textMuted,marginBottom:6}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>
        <button onClick={()=>onChange(Math.max(min,value-1))} style={{width:36,height:36,background:t.smallBtnBg,border:`2px solid ${t.border}`,borderRadius:6,color:t.smallBtnText,fontSize:20,fontWeight:"bold",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
        <div style={{fontSize:32,fontWeight:"900",color:t.accent,width:52,textAlign:"center"}}>{value}</div>
        <button onClick={()=>onChange(Math.min(max,value+1))} style={{width:36,height:36,background:t.smallBtnBg,border:`2px solid ${t.border}`,borderRadius:6,color:t.smallBtnText,fontSize:20,fontWeight:"bold",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
      </div>
    </div>
  );
}

export default function TrapCounter(){
  const [screen, setScreen] = useState("setup");
  const [numShooters, setNumShooters] = useState(1);
  const [squadNum, setSquadNum] = useState(1);
  const [trapNum, setTrapNum] = useState(1);
  const [notes, setNotes] = useState("");
  const [weather, setWeather] = useState("");
  const [eventName, setEventName] = useState("");
  const [setup, setSetup] = useState(Array.from({length:5},(_,i)=>({name:`SHOOTER ${i+1}`,gun:"",choke:""})));
  const [shooters, setShooters] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [saveFlash, setSaveFlash] = useState(false);
  const [vibOn, setVibOn] = useState(true);
  const [sndOn, setSndOn] = useState(true);
  const [sunMode, setSunMode] = useState(false);
  const [flashLabel, setFlashLabelRaw] = useState(null);
  const [importMsg, setImportMsg] = useState(null);
  const flashTimer = useRef(null);
  const fileInput = useRef(null);

  const t = sunMode ? SUN : DARK;

  const setFlashLabel = (label) => {
    setFlashLabelRaw(label);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashLabelRaw(null), 650);
  };

  const { feedbackHit, feedbackMiss } = useFeedback(vibOn, sndOn);

  const updateSetup=(i,field,val)=>setSetup(p=>p.map((s,idx)=>idx===i?{...s,[field]:val.toUpperCase()}:s));

  const startSession=()=>{
    setShooters(Array.from({length:numShooters},(_,i)=>defaultShooter(i,setup[i])));
    setActiveIdx(0); setScreen("range");
  };

  const startFromImport = (data) => {
    setSquadNum(data.squadNum);
    setTrapNum(data.trapNum);
    setWeather(data.weather);
    setNotes(data.notes);
    if (data.eventName) setEventName(data.eventName);
    const imported = data.shooters.map((s,i) => ({
      name: s.name,
      gun: s.gun || "",
      choke: s.choke || "",
      hits: 0, misses: 0, history: [],
      rounds: s.rounds || [],
      roundNum: (s.rounds?.length || 0) + 1,
    }));
    setNumShooters(imported.length);
    const newSetup = Array.from({length:5},(_,i) => {
      if (i < imported.length) return { name: imported[i].name, gun: imported[i].gun, choke: imported[i].choke };
      return { name: `SHOOTER ${i+1}`, gun: "", choke: "" };
    });
    setSetup(newSetup);
    setShooters(imported);
    setActiveIdx(0);
    setScreen("range");
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importExcel(file);
      setImportMsg(`Loaded ${data.shooters.length} shooter(s) from spreadsheet`);
      setTimeout(() => setImportMsg(null), 3000);
      startFromImport(data);
    } catch (err) {
      setImportMsg("Error: " + err);
      setTimeout(() => setImportMsg(null), 4000);
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const updateShooter=(i,changes)=>setShooters(p=>p.map((s,idx)=>idx===i?{...s,...changes}:s));
  const saveRound=(i)=>setShooters(p=>p.map((s,idx)=>{
    if(idx!==i)return s;
    const pct=s.hits+s.misses>0?Math.round((s.hits/(s.hits+s.misses))*100):0;
    return{...s,rounds:[...s.rounds,{round:s.roundNum,hits:s.hits,misses:s.misses,pct}],roundNum:s.roundNum+1,hits:0,misses:0,history:[]};
  }));

  const handleExcel = () => exportExcel(squadNum, trapNum, notes, weather, shooters, eventName);

  const inputStyle = {
    background:t.inputBg, border:`2px solid ${t.border}`, borderRadius:6,
    color:t.text, fontSize:13, fontWeight:"bold", padding:"9px 10px",
    fontFamily:"inherit", outline:"none", letterSpacing:1,
  };

  const pageStyle = {
    minHeight:"100vh",
    background:t.bg,
    backgroundImage:t.bgGrad,
    fontFamily:"'Courier New',Courier,monospace",
    color:t.text,
    padding:"20px 16px",
  };

  const sectionStyle = {
    background:t.card, border:`2px solid ${t.border}`, borderRadius:10, padding:16, marginBottom:14,
  };

  // ── SETUP SCREEN ──
  if(screen==="setup") return (
    <div style={pageStyle}>
      <style>{`@keyframes fadeFlash{0%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}100%{opacity:0;transform:translate(-50%,-60%) scale(0.9)}}`}</style>
      <input type="file" ref={fileInput} accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={handleImport}/>
      <div style={{maxWidth:440,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:10,fontWeight:"bold",letterSpacing:8,color:t.textMuted}}>{"\u2B21"} RANGE SCORE TRACKER {"\u2B21"}</div>
          <div style={{fontSize:26,fontWeight:"900",letterSpacing:4,color:t.accent,marginTop:6}}>TRAP COUNTER</div>
        </div>

        {/* Sun mode toggle - prominent at top */}
        <div style={{...sectionStyle,display:"flex",alignItems:"center",justifyContent:"center",gap:16,padding:"12px 16px"}}>
          <span style={{fontSize:11,fontWeight:"900",letterSpacing:3,color:sunMode?t.accent:t.textMuted}}>
            {sunMode ? "\u2600\uFE0F SUN MODE" : "\u{1F319} NIGHT MODE"}
          </span>
          <div onClick={()=>setSunMode(!sunMode)} style={{
            width:52,height:28,borderRadius:14,
            background:sunMode?"#ff8800":"#222",
            border:`2px solid ${sunMode?"#cc6600":"#555"}`,
            cursor:"pointer",position:"relative",transition:"all 0.2s",
          }}>
            <div style={{
              position:"absolute",top:3,left:sunMode?27:3,
              width:20,height:20,borderRadius:"50%",
              background:sunMode?"#fff":"#666",
              transition:"all 0.2s",
            }}/>
          </div>
        </div>

        <div style={{...sectionStyle,padding:20}}>
          <input placeholder="EVENT NAME (OPTIONAL)" value={eventName}
            onChange={e=>setEventName(e.target.value.toUpperCase())}
            style={{...inputStyle,width:"100%",marginBottom:16,textAlign:"center",fontSize:14}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
            <NumInput label="SQUAD #" value={squadNum} onChange={setSquadNum} t={t}/>
            <NumInput label="TRAP #" value={trapNum} onChange={setTrapNum} t={t}/>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:11,fontWeight:"bold",letterSpacing:3,color:t.textMuted,marginBottom:8}}>NUMBER OF SHOOTERS</div>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              {[1,2,3,4,5].map(n=>(
                <button key={n} onClick={()=>setNumShooters(n)} style={{width:48,height:48,background:numShooters===n?t.tabActive:t.smallBtnBg,border:`3px solid ${numShooters===n?t.borderActive:t.border}`,borderRadius:8,color:numShooters===n?t.accent:t.textMuted,fontSize:20,fontWeight:"900",cursor:"pointer",fontFamily:"inherit"}}>{n}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{fontSize:11,fontWeight:"bold",letterSpacing:3,color:t.textMuted,marginBottom:12}}>SHOOTER DETAILS</div>
          {Array.from({length:numShooters},(_,i)=>(
            <div key={i} style={{marginBottom:i<numShooters-1?14:0}}>
              <div style={{fontSize:11,fontWeight:"bold",color:t.textDim,letterSpacing:2,marginBottom:5}}>SHOOTER {i+1}</div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1.2fr 1.2fr",gap:6}}>
                {["name","gun","choke"].map(field=>(
                  <input key={field} placeholder={field.toUpperCase()} value={setup[i][field]}
                    onChange={e=>updateSetup(i,field,e.target.value)}
                    style={inputStyle}/>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={sectionStyle}>
          <div style={{fontSize:11,fontWeight:"bold",letterSpacing:3,color:t.textMuted,marginBottom:10}}>SESSION INFO</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <input placeholder="WEATHER" value={weather} onChange={e=>setWeather(e.target.value.toUpperCase())} style={inputStyle}/>
            <input placeholder="NOTES" value={notes} onChange={e=>setNotes(e.target.value.toUpperCase())} style={inputStyle}/>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{fontSize:11,fontWeight:"bold",letterSpacing:3,color:t.textMuted,marginBottom:12}}>FEEDBACK SETTINGS</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Toggle label="VIBRATE ON HIT / MISS" value={vibOn} onChange={setVibOn} icon={"\u{1F4F3}"} t={t}/>
            <Toggle label="SOFT TONE ON HIT / MISS" value={sndOn} onChange={setSndOn} icon={"\u{1F514}"} t={t}/>
          </div>
        </div>

        {/* Excel import/export section */}
        <div style={sectionStyle}>
          <div style={{fontSize:11,fontWeight:"bold",letterSpacing:3,color:t.textMuted,marginBottom:12}}>SPREADSHEET</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button onClick={()=>fileInput.current?.click()} style={{
              padding:"12px 0",background:t.smallBtnBg,border:`2px solid ${t.border}`,
              borderRadius:6,color:t.smallBtnText,fontSize:11,fontWeight:"bold",letterSpacing:2,
              cursor:"pointer",fontFamily:"inherit",
            }}>{"\u{1F4E5}"} IMPORT .XLSX</button>
            <button onClick={exportTemplate} style={{
              padding:"12px 0",background:t.smallBtnBg,border:`2px solid ${t.border}`,
              borderRadius:6,color:t.smallBtnText,fontSize:11,fontWeight:"bold",letterSpacing:2,
              cursor:"pointer",fontFamily:"inherit",
            }}>{"\u{1F4CB}"} TEMPLATE</button>
          </div>
          <div style={{fontSize:10,color:t.textDim,marginTop:8,textAlign:"center",lineHeight:1.5}}>
            Import a spreadsheet to load shooters, scores & event info.
            <br/>Download the template to see the format.
          </div>
        </div>

        {importMsg && <div style={{
          textAlign:"center",padding:"10px",marginBottom:12,borderRadius:6,
          background:importMsg.startsWith("Error")?t.bad:t.good,
          color:"#fff",fontSize:12,fontWeight:"bold",
        }}>{importMsg}</div>}

        <button onClick={startSession} style={{
          width:"100%",padding:"18px",
          background:sunMode?"linear-gradient(160deg,#cc6600,#994400)":"linear-gradient(160deg,#b86000,#7a3800)",
          border:`3px solid ${sunMode?"#ee7700":"#e08820"}`,borderRadius:10,
          color:"#fff",fontSize:18,fontWeight:"900",letterSpacing:4,
          cursor:"pointer",fontFamily:"inherit",
          boxShadow:"0 4px 20px rgba(200,100,0,0.3)",
        }}>{"\u25B6"} START SESSION</button>
        <div style={{textAlign:"center",marginTop:20,fontSize:10,fontWeight:"bold",letterSpacing:4,color:t.textDimmer}}>PULL!</div>
      </div>
    </div>
  );

  // ── RANGE / LEADERBOARD SCREEN ──
  return (
    <div style={pageStyle}>
      <style>{`@keyframes fadeFlash{0%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}100%{opacity:0;transform:translate(-50%,-60%) scale(0.85)}}`}</style>
      <FlashLabel label={flashLabel} t={t}/>
      <div style={{maxWidth:480,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,borderBottom:`2px solid ${t.border}`,paddingBottom:10}}>
          <button onClick={()=>setScreen("setup")} style={{background:"none",border:"none",color:t.textDim,fontSize:12,fontWeight:"bold",letterSpacing:2,cursor:"pointer",fontFamily:"inherit"}}>{"\u2190"} SETUP</button>
          <div style={{textAlign:"center"}}>
            {eventName&&<div style={{fontSize:11,fontWeight:"900",color:t.accent,letterSpacing:2}}>{eventName}</div>}
            <div style={{fontSize:12,fontWeight:"bold",color:t.textMuted,letterSpacing:3}}>SQUAD #{squadNum} {"\u00B7"} TRAP #{trapNum}</div>
            {weather&&<div style={{fontSize:11,fontWeight:"bold",color:t.textDim,marginTop:2}}>{weather}</div>}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {/* Sun mode quick toggle */}
            <button onClick={()=>setSunMode(s=>!s)} title="Toggle sun mode" style={{background:"none",border:"none",cursor:"pointer",fontSize:17,opacity:1}}>{sunMode?"\u2600\uFE0F":"\u{1F319}"}</button>
            <button onClick={()=>setVibOn(v=>!v)} title="Toggle vibrate" style={{background:"none",border:"none",cursor:"pointer",fontSize:17,opacity:vibOn?1:0.3}}>{"\u{1F4F3}"}</button>
            <button onClick={()=>setSndOn(s=>!s)} title="Toggle sound" style={{background:"none",border:"none",cursor:"pointer",fontSize:17,opacity:sndOn?1:0.3}}>{"\u{1F514}"}</button>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:14}}>
          {["range","leaderboard","export"].map(tab=>(
            <button key={tab} onClick={()=>{
              if (tab === "export") { handleExcel(); return; }
              setScreen(tab);
            }} style={{
              padding:"10px 0",
              background: screen===tab ? t.tabActive : t.tabInactive,
              border: `2px solid ${screen===tab ? t.borderActive : t.border}`,
              borderRadius:6,
              color: screen===tab ? (sunMode?"#fff":t.accent) : t.tabText,
              fontSize:11, fontWeight:"900", letterSpacing:2,
              cursor:"pointer", fontFamily:"inherit",
            }}>
              {tab==="range"?"\u{1F3AF} RANGE":tab==="leaderboard"?"\u{1F3C6} BOARD":"\u{1F4CA} EXCEL"}
            </button>
          ))}
        </div>

        {screen==="leaderboard"
          ? <Leaderboard shooters={shooters} t={t}/>
          : shooters.map((s,i)=>(
              <ShooterCard key={i} shooter={s} active={activeIdx===i}
                onSelect={()=>setActiveIdx(i)}
                onChange={changes=>updateShooter(i,changes)}
                onSave={()=>saveRound(i)}
                feedbackHit={feedbackHit}
                feedbackMiss={feedbackMiss}
                setFlashLabel={setFlashLabel}
                t={t} sun={sunMode}/>
            ))
        }
        <div style={{textAlign:"center",marginTop:8,fontSize:10,fontWeight:"bold",letterSpacing:4,color:t.textDimmer}}>PULL!</div>
      </div>
    </div>
  );
}
