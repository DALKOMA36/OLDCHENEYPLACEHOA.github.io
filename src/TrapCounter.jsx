import { useState, useRef, useEffect } from "react";

const BIRDS_PER_ROUND = 25;

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

// --- Feedback hook ---
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

// --- Flash overlay ---
function FlashLabel({ label }) {
  if (!label) return null;
  const isHit = label === "HIT";
  return (
    <div style={{
      position: "fixed", top: "50%", left: "50%",
      transform: "translate(-50%, -50%)",
      fontSize: 52, fontWeight: "bold", letterSpacing: 8,
      color: isHit ? "#f5a020" : "#e05040",
      textShadow: isHit ? "0 0 30px rgba(245,160,32,0.6)" : "0 0 30px rgba(224,80,64,0.6)",
      fontFamily: "'Courier New', Courier, monospace",
      pointerEvents: "none", zIndex: 999,
      opacity: 1, animation: "fadeFlash 0.65s ease-out forwards",
    }}>{label}</div>
  );
}

function StationBar({ history }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, letterSpacing: 3, color: "#6a5020", marginBottom: 6, textAlign: "center" }}>STATIONS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
        {[1,2,3,4,5].map(st => {
          const shots = history.slice((st-1)*5, st*5);
          const stHits = shots.filter(s => s === "hit").length;
          const isActive = Math.floor(history.length / 5) + 1 === st && history.length < 25;
          const isDone = shots.length === 5;
          return (
            <div key={st} style={{
              background: isActive ? "rgba(200,100,0,0.12)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${isActive ? "#d4830a" : "#2a1a08"}`,
              borderRadius: 6, padding: "6px 4px", textAlign: "center",
            }}>
              <div style={{ fontSize: 9, color: isActive ? "#d4830a" : "#3a2a10", letterSpacing: 1, marginBottom: 4 }}>
                {isActive ? "\u25B6S" : "S"}{st}
              </div>
              <div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                {[0,1,2,3,4].map(j => {
                  const shot = shots[j];
                  return <div key={j} style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: shot === "hit" ? "#f5a020" : shot === "miss" ? "#902020" : "#1e1408",
                    border: `1px solid ${shot === "hit" ? "#f5c060" : shot === "miss" ? "#c03030" : "#2a1a08"}`,
                  }} />;
                })}
              </div>
              {isDone && <div style={{ fontSize: 9, color: stHits >= 4 ? "#4adf80" : stHits >= 3 ? "#f5c060" : "#e05040", marginTop: 3 }}>{stHits}/5</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShooterCard({ shooter, onChange, onSave, active, onSelect, feedbackHit, feedbackMiss, setFlashLabel }) {
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

  return (
    <div onClick={()=>!active&&onSelect()} style={{
      background: active?"rgba(30,20,5,0.95)":"rgba(15,10,3,0.7)",
      border:`2px solid ${active?"#d4830a":"#2a1a08"}`,
      borderRadius:10, padding:active?"16px":"12px 16px",
      marginBottom:12, cursor:active?"default":"pointer",
      transition:"all 0.2s",
      boxShadow:active?"0 0 20px rgba(200,100,0,0.15)":"none",
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:active?12:0}}>
        {editName && active
          ? <input autoFocus value={name}
              onChange={e=>onChange({name:e.target.value.toUpperCase()})}
              onBlur={()=>setEditName(false)}
              onKeyDown={e=>e.key==="Enter"&&setEditName(false)}
              style={{background:"transparent",border:"none",borderBottom:"2px solid #d4830a",color:"#f5c060",fontSize:14,fontWeight:"bold",letterSpacing:3,outline:"none",width:"55%",fontFamily:"inherit"}}/>
          : <div onClick={e=>{if(active){e.stopPropagation();setEditName(true);}}}
              style={{fontSize:13,fontWeight:"bold",letterSpacing:3,color:active?"#f5c060":"#6a5020",cursor:active?"pointer":"default"}}>
              {name} {active&&"\u270E"}
            </div>
        }
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {streak>=3&&active&&<span style={{fontSize:11,color:"#ff9020"}}>{"\u{1F525}"}{streak}</span>}
          <span style={{fontSize:11,color:"#8a6a30",letterSpacing:2}}>R{roundNum}</span>
          {!active&&<span style={{fontSize:12,color:total>0?(pct>=80?"#4adf80":"#f5c060"):"#4a3a20"}}>{total>0?`${hits}/${total} (${pct}%)`:"\u2013"}</span>}
          {active&&done&&<span style={{fontSize:9,color:"#4adf80",letterSpacing:2}}>\u25CF DONE</span>}
        </div>
      </div>

      {active&&<>
        {(shooter.gun||shooter.choke)&&
          <div style={{fontSize:10,color:"#5a4010",letterSpacing:2,marginBottom:10,textAlign:"center"}}>
            {shooter.gun&&`\u{1F52B} ${shooter.gun}`}{shooter.gun&&shooter.choke?"  \u00B7  ":""}{shooter.choke&&`\u2B2D ${shooter.choke}`}
          </div>}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(10,7,2,0.5)",borderRadius:8,padding:"12px 18px",marginBottom:12}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:40,fontWeight:"bold",color:"#f5a020",lineHeight:1}}>{hits}</div>
            <div style={{fontSize:9,letterSpacing:3,color:"#8a6a30"}}>HITS</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:26,fontWeight:"bold",color:pct>=80?"#4adf80":pct>=60?"#f5c060":"#e05040",lineHeight:1}}>{pct}%</div>
            <div style={{fontSize:9,color:"#6a8060",marginTop:2}}>{trophyLabel(pct)}</div>
            {streak>0&&<div style={{fontSize:10,color:streak>=5?"#ff6020":"#f5a020",marginTop:2}}>{"\u{1F525}"} {streak} streak</div>}
            <div style={{fontSize:9,color:"#4a3a20",marginTop:2}}>{remaining>0?`${remaining} left`:"DONE"}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:40,fontWeight:"bold",color:"#e05040",lineHeight:1}}>{misses}</div>
            <div style={{fontSize:9,letterSpacing:3,color:"#8a6a30"}}>MISS</div>
          </div>
        </div>

        <StationBar history={history}/>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <button onClick={()=>record("hit")} disabled={done} style={bigBtn(!done,"hit")}>\u2713 HIT</button>
          <button onClick={()=>record("miss")} disabled={done} style={bigBtn(!done,"miss")}>\u2715 MISS</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <button onClick={undo} disabled={!history.length} style={smallBtn(!history.length)}>\u21A9 UNDO</button>
          <button onClick={onSave} disabled={!done} style={smallBtn(!done,true)}>\u2714 SAVE RND</button>
          <button onClick={()=>onChange({hits:0,misses:0,history:[]})} style={smallBtn(false)}>\u27F3 RESET</button>
        </div>

        {rounds.length>0&&<div style={{marginTop:12,borderTop:"1px solid #2a1a08",paddingTop:10}}>
          <div style={{fontSize:9,letterSpacing:3,color:"#5a4010",marginBottom:6}}>SESSION LOG</div>
          {rounds.map(r=>(
            <div key={r.round} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:"1px solid #1a1005"}}>
              <span style={{color:"#6a5020"}}>RND {r.round}</span>
              <span style={{color:"#f5a020"}}>{r.hits}/25</span>
              <span style={{color:r.pct>=80?"#4adf80":"#f5c060"}}>{r.pct}%</span>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:"bold",paddingTop:6}}>
            <span style={{color:"#8a7040",letterSpacing:2}}>TOTAL</span>
            <span style={{color:"#f5c060"}}>{allHits}/{allShots}</span>
            <span style={{color:allPct>=80?"#4adf80":"#f5c060"}}>{allPct}%</span>
          </div>
        </div>}
      </>}
    </div>
  );
}

function Leaderboard({ shooters }) {
  const ranked = [...shooters].map((s,i)=>{
    const h=s.rounds.reduce((a,r)=>a+r.hits,0)+s.hits;
    const sh=s.rounds.reduce((a,r)=>a+r.hits+r.misses,0)+s.hits+s.misses;
    return {...s,allHits:h,allShots:sh,pct:sh>0?Math.round((h/sh)*100):0,idx:i};
  }).sort((a,b)=>b.allHits-a.allHits||b.pct-a.pct);
  const medals=["\u{1F947}","\u{1F948}","\u{1F949}","4th","5th"];
  return (
    <div>
      <div style={{fontSize:10,letterSpacing:4,color:"#8a6a30",textAlign:"center",marginBottom:16}}>SQUAD LEADERBOARD</div>
      {ranked.map((s,i)=>(
        <div key={s.idx} style={{display:"flex",alignItems:"center",gap:12,background:i===0?"rgba(200,100,0,0.1)":"rgba(20,14,4,0.6)",border:`1px solid ${i===0?"#d4830a":"#2a1a08"}`,borderRadius:8,padding:"12px 16px",marginBottom:8}}>
          <div style={{fontSize:i<3?22:13,minWidth:32,textAlign:"center",color:"#8a6a30"}}>{medals[i]}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:"bold",color:i===0?"#f5c060":"#8a7040",letterSpacing:2}}>{s.name}</div>
            {(s.gun||s.choke)&&<div style={{fontSize:9,color:"#4a3010",marginTop:2}}>{s.gun}{s.gun&&s.choke?" \u00B7 ":""}{s.choke}</div>}
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:22,fontWeight:"bold",color:"#f5a020"}}>{s.allHits}</div>
            <div style={{fontSize:9,color:"#6a5020"}}>{s.allShots>0?`${s.pct}%`:"\u2013"}</div>
          </div>
          <div style={{fontSize:10,color:"#5a4010"}}>{trophyLabel(s.pct)}</div>
        </div>
      ))}
    </div>
  );
}

function exportImage(squadNum,trapNum,notes,weather,shooters){
  const date=new Date().toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"});
  const ranked=[...shooters].map(s=>{
    const h=s.rounds.reduce((a,r)=>a+r.hits,0)+s.hits;
    const sh=s.rounds.reduce((a,r)=>a+r.hits+r.misses,0)+s.hits+s.misses;
    return {...s,allHits:h,allShots:sh,pct:sh>0?Math.round((h/sh)*100):0};
  }).sort((a,b)=>b.allHits-a.allHits);
  const lineH=26;
  const rowsNeeded=ranked.reduce((t,s)=>t+1+(s.rounds.length>0?s.rounds.length+1:0),0);
  const h=200+(notes?20:0)+(weather?20:0)+rowsNeeded*lineH+60;
  const W=460;
  const canvas=document.createElement("canvas");
  canvas.width=W; canvas.height=Math.max(h,280);
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#0f0c08"; ctx.fillRect(0,0,W,canvas.height);
  ctx.fillStyle="#c47010"; ctx.fillRect(0,0,W,4);
  ctx.textAlign="center";
  ctx.fillStyle="#8a6a30"; ctx.font="10px 'Courier New'";
  ctx.fillText("\u2B21  RANGE SCORE TRACKER  \u2B21",W/2,28);
  ctx.fillStyle="#f5c060"; ctx.font="bold 20px 'Courier New'";
  ctx.fillText("TRAP SCORE CARD",W/2,54);
  ctx.fillStyle="#6a5020"; ctx.font="11px 'Courier New'";
  ctx.fillText(`SQUAD #${squadNum}  \u00B7  TRAP #${trapNum}`,W/2,76);
  ctx.fillText(date,W/2,94);
  let iy=112;
  if(weather){ctx.fillStyle="#5a7040";ctx.fillText(`\u{1F324} ${weather}`,W/2,iy);iy+=20;}
  if(notes){ctx.fillStyle="#5a5a30";ctx.fillText(`\u{1F4DD} ${notes}`,W/2,iy);iy+=20;}
  ctx.strokeStyle="#3a2a10";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(30,iy+4);ctx.lineTo(W-30,iy+4);ctx.stroke();
  const medals=["\u{1F947}","\u{1F948}","\u{1F949}","4.","5."];
  let y=iy+22;
  ranked.forEach((s,rank)=>{
    ctx.textAlign="left";ctx.fillStyle=rank===0?"#f5c060":"#8a7040";ctx.font=`bold 13px 'Courier New'`;
    ctx.fillText(`${medals[rank]} ${s.name}`,30,y);
    ctx.textAlign="right";ctx.fillStyle=s.pct>=80?"#4adf80":s.pct>=60?"#f5c060":"#e05040";ctx.font=`bold 13px 'Courier New'`;
    ctx.fillText(`${s.allHits}/25  ${s.pct}%`,W-30,y);
    if(s.gun||s.choke){ctx.textAlign="left";ctx.fillStyle="#4a3010";ctx.font="10px 'Courier New'";ctx.fillText(`   ${[s.gun,s.choke].filter(Boolean).join(" \u00B7 ")}`,30,y+13);y+=13;}
    s.rounds.forEach(r=>{y+=lineH*0.8;ctx.textAlign="left";ctx.fillStyle="#3a2a10";ctx.font="10px 'Courier New'";ctx.fillText(`     Rnd ${r.round}`,30,y);ctx.textAlign="right";ctx.fillStyle="#5a4010";ctx.fillText(`${r.hits}/25  ${r.pct}%`,W-30,y);});
    y+=lineH;ctx.strokeStyle="#2a1a08";ctx.beginPath();ctx.moveTo(30,y-4);ctx.lineTo(W-30,y-4);ctx.stroke();
  });
  ctx.textAlign="center";ctx.fillStyle="#2a1a08";ctx.font="10px 'Courier New'";ctx.fillText("PULL!",W/2,canvas.height-14);
  canvas.toBlob(blob=>{const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`scorecard-sq${squadNum}-trap${trapNum}.png`;a.click();URL.revokeObjectURL(url);});
}

function Toggle({ label, value, onChange, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 10, letterSpacing: 2, color: "#6a5020", flex: 1 }}>{label}</span>
      <div onClick={() => onChange(!value)} style={{
        width: 42, height: 24, borderRadius: 12,
        background: value ? "rgba(200,100,0,0.4)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${value ? "#d4830a" : "#2a1a08"}`,
        cursor: "pointer", position: "relative", transition: "all 0.2s",
      }}>
        <div style={{
          position: "absolute", top: 3, left: value ? 20 : 3,
          width: 16, height: 16, borderRadius: "50%",
          background: value ? "#f5a020" : "#3a2a10",
          transition: "all 0.2s",
        }} />
      </div>
      <span style={{ fontSize: 10, color: value ? "#f5a020" : "#3a2a10", letterSpacing: 1, minWidth: 20 }}>
        {value ? "ON" : "OFF"}
      </span>
    </div>
  );
}

function NumInput({label,value,onChange,min=1,max=99}){
  return(
    <div style={{textAlign:"center"}}>
      <div style={{fontSize:9,letterSpacing:3,color:"#6a5020",marginBottom:6}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>
        <button onClick={()=>onChange(Math.max(min,value-1))} style={{width:32,height:32,background:"rgba(255,255,255,0.04)",border:"1px solid #3a2a10",borderRadius:6,color:"#8a6a30",fontSize:18,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center"}}>\u2212</button>
        <div style={{fontSize:28,fontWeight:"bold",color:"#f5c060",width:48,textAlign:"center"}}>{value}</div>
        <button onClick={()=>onChange(Math.min(max,value+1))} style={{width:32,height:32,background:"rgba(255,255,255,0.04)",border:"1px solid #3a2a10",borderRadius:6,color:"#8a6a30",fontSize:18,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
      </div>
    </div>
  );
}

function bigBtn(active,type){return{padding:"18px 0",background:!active?"#0a0702":type==="hit"?"linear-gradient(160deg,#b86000,#7a3800)":"linear-gradient(160deg,#901818,#5a0808)",border:`2px solid ${!active?"#1a1005":type==="hit"?"#e08820":"#c02020"}`,borderRadius:8,color:!active?"#2a1a08":"#fff",fontSize:16,fontWeight:"bold",letterSpacing:3,cursor:!active?"not-allowed":"pointer",fontFamily:"'Courier New',Courier,monospace",boxShadow:active?(type==="hit"?"0 4px 16px rgba(200,100,0,0.25)":"0 4px 16px rgba(160,30,30,0.25)"):"none",transition:"all 0.15s"};}
function smallBtn(disabled,highlight=false){return{padding:"10px 0",background:disabled?"rgba(255,255,255,0.01)":highlight?"rgba(60,120,40,0.25)":"rgba(255,255,255,0.04)",border:`1px solid ${disabled?"#1a1005":highlight?"#4a9030":"#2a1a08"}`,borderRadius:6,color:disabled?"#2a1a08":highlight?"#80d060":"#8a7040",fontSize:10,letterSpacing:2,cursor:disabled?"not-allowed":"pointer",fontFamily:"'Courier New',Courier,monospace",transition:"all 0.15s"};}

export default function TrapCounter(){
  const [screen, setScreen] = useState("setup");
  const [numShooters, setNumShooters] = useState(1);
  const [squadNum, setSquadNum] = useState(1);
  const [trapNum, setTrapNum] = useState(1);
  const [notes, setNotes] = useState("");
  const [weather, setWeather] = useState("");
  const [setup, setSetup] = useState(Array.from({length:5},(_,i)=>({name:`SHOOTER ${i+1}`,gun:"",choke:""})));
  const [shooters, setShooters] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [saveFlash, setSaveFlash] = useState(false);
  const [vibOn, setVibOn] = useState(true);
  const [sndOn, setSndOn] = useState(true);
  const [flashLabel, setFlashLabelRaw] = useState(null);
  const flashTimer = useRef(null);

  const setFlashLabel = (label) => {
    setFlashLabelRaw(label);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashLabelRaw(null), 650);
  };

  const { feedbackHit, feedbackMiss } = useFeedback(vibOn, sndOn);

  const updateSetup=(i,field,val)=>setSetup(p=>p.map((s,idx)=>idx===i?{...s,[field]:val.toUpperCase()}:s));
  const startSession=()=>{ setShooters(Array.from({length:numShooters},(_,i)=>defaultShooter(i,setup[i]))); setActiveIdx(0); setScreen("range"); };
  const updateShooter=(i,changes)=>setShooters(p=>p.map((s,idx)=>idx===i?{...s,...changes}:s));
  const saveRound=(i)=>setShooters(p=>p.map((s,idx)=>{
    if(idx!==i)return s;
    const pct=s.hits+s.misses>0?Math.round((s.hits/(s.hits+s.misses))*100):0;
    return{...s,rounds:[...s.rounds,{round:s.roundNum,hits:s.hits,misses:s.misses,pct}],roundNum:s.roundNum+1,hits:0,misses:0,history:[]};
  }));
  const handleSave=()=>{ exportImage(squadNum,trapNum,notes,weather,shooters); setSaveFlash(true); setTimeout(()=>setSaveFlash(false),1500); };

  const pageStyle={minHeight:"100vh",background:"#0f0c08",backgroundImage:"radial-gradient(ellipse at 50% 0%, #2a1a08 0%, #0f0c08 70%)",fontFamily:"'Courier New',Courier,monospace",color:"#e8d5a0",padding:"20px 16px"};

  if(screen==="setup") return (
    <div style={pageStyle}>
      <style>{`@keyframes fadeFlash{0%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}100%{opacity:0;transform:translate(-50%,-60%) scale(0.9)}}`}</style>
      <div style={{maxWidth:440,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:9,letterSpacing:8,color:"#6a5020"}}>{"\u2B21"} RANGE SCORE TRACKER {"\u2B21"}</div>
          <div style={{fontSize:24,fontWeight:"bold",letterSpacing:4,color:"#f5c060",marginTop:6}}>TRAP COUNTER</div>
        </div>

        <div style={{background:"rgba(20,14,4,0.8)",border:"1px solid #2a1a08",borderRadius:10,padding:20,marginBottom:14}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
            <NumInput label="SQUAD #" value={squadNum} onChange={setSquadNum}/>
            <NumInput label="TRAP #" value={trapNum} onChange={setTrapNum}/>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:9,letterSpacing:3,color:"#6a5020",marginBottom:8}}>NUMBER OF SHOOTERS</div>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              {[1,2,3,4,5].map(n=>(
                <button key={n} onClick={()=>setNumShooters(n)} style={{width:44,height:44,background:numShooters===n?"rgba(200,100,0,0.3)":"rgba(255,255,255,0.04)",border:`2px solid ${numShooters===n?"#d4830a":"#2a1a08"}`,borderRadius:8,color:numShooters===n?"#f5c060":"#6a5020",fontSize:18,fontWeight:"bold",cursor:"pointer",fontFamily:"inherit"}}>{n}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{background:"rgba(20,14,4,0.8)",border:"1px solid #2a1a08",borderRadius:10,padding:16,marginBottom:14}}>
          <div style={{fontSize:9,letterSpacing:3,color:"#6a5020",marginBottom:12}}>SHOOTER DETAILS</div>
          {Array.from({length:numShooters},(_,i)=>(
            <div key={i} style={{marginBottom:i<numShooters-1?14:0}}>
              <div style={{fontSize:9,color:"#4a3010",letterSpacing:2,marginBottom:5}}>SHOOTER {i+1}</div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1.2fr 1.2fr",gap:6}}>
                {["name","gun","choke"].map(field=>(
                  <input key={field} placeholder={field.toUpperCase()} value={setup[i][field]}
                    onChange={e=>updateSetup(i,field,e.target.value)}
                    style={{background:"rgba(255,255,255,0.04)",border:"1px solid #2a1a08",borderRadius:5,color:"#e8d5a0",fontSize:11,padding:"7px 8px",fontFamily:"inherit",outline:"none",letterSpacing:1}}/>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{background:"rgba(20,14,4,0.8)",border:"1px solid #2a1a08",borderRadius:10,padding:16,marginBottom:14}}>
          <div style={{fontSize:9,letterSpacing:3,color:"#6a5020",marginBottom:10}}>SESSION INFO</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <input placeholder="WEATHER" value={weather} onChange={e=>setWeather(e.target.value.toUpperCase())} style={{background:"rgba(255,255,255,0.04)",border:"1px solid #2a1a08",borderRadius:5,color:"#e8d5a0",fontSize:11,padding:"7px 8px",fontFamily:"inherit",outline:"none"}}/>
            <input placeholder="NOTES" value={notes} onChange={e=>setNotes(e.target.value.toUpperCase())} style={{background:"rgba(255,255,255,0.04)",border:"1px solid #2a1a08",borderRadius:5,color:"#e8d5a0",fontSize:11,padding:"7px 8px",fontFamily:"inherit",outline:"none"}}/>
          </div>
        </div>

        <div style={{background:"rgba(20,14,4,0.8)",border:"1px solid #2a1a08",borderRadius:10,padding:16,marginBottom:20}}>
          <div style={{fontSize:9,letterSpacing:3,color:"#6a5020",marginBottom:12}}>FEEDBACK SETTINGS</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Toggle label="VIBRATE ON HIT / MISS" value={vibOn} onChange={setVibOn} icon={"\u{1F4F3}"}/>
            <Toggle label="SOFT TONE ON HIT / MISS" value={sndOn} onChange={setSndOn} icon={"\u{1F514}"}/>
          </div>
        </div>

        <button onClick={startSession} style={{width:"100%",padding:"16px",background:"linear-gradient(160deg,#b86000,#7a3800)",border:"2px solid #e08820",borderRadius:8,color:"#fff",fontSize:16,fontWeight:"bold",letterSpacing:4,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 20px rgba(200,100,0,0.3)"}}>{"\u25B6"} START SESSION</button>
        <div style={{textAlign:"center",marginTop:20,fontSize:9,letterSpacing:4,color:"#2a1a08"}}>PULL!</div>
      </div>
    </div>
  );

  return (
    <div style={pageStyle}>
      <style>{`@keyframes fadeFlash{0%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}100%{opacity:0;transform:translate(-50%,-60%) scale(0.85)}}`}</style>
      <FlashLabel label={flashLabel}/>
      <div style={{maxWidth:480,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,borderBottom:"1px solid #2a1a08",paddingBottom:10}}>
          <button onClick={()=>setScreen("setup")} style={{background:"none",border:"none",color:"#4a3010",fontSize:10,letterSpacing:2,cursor:"pointer",fontFamily:"inherit"}}>{"\u2190"} SETUP</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:10,color:"#6a5020",letterSpacing:3}}>SQUAD #{squadNum} {"\u00B7"} TRAP #{trapNum}</div>
            {weather&&<div style={{fontSize:9,color:"#4a4020",marginTop:2}}>{"\u{1F324}"} {weather}</div>}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>setVibOn(v=>!v)} title="Toggle vibrate" style={{background:"none",border:"none",cursor:"pointer",fontSize:15,opacity:vibOn?1:0.3}}>{"\u{1F4F3}"}</button>
            <button onClick={()=>setSndOn(s=>!s)} title="Toggle sound" style={{background:"none",border:"none",cursor:"pointer",fontSize:15,opacity:sndOn?1:0.3}}>{"\u{1F514}"}</button>
            <button onClick={handleSave} style={{padding:"7px 12px",background:saveFlash?"rgba(60,180,60,0.3)":"rgba(60,120,40,0.2)",border:`1px solid ${saveFlash?"#60e060":"#4a9030"}`,borderRadius:6,color:saveFlash?"#80ff80":"#80d060",fontSize:10,letterSpacing:2,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>
              {saveFlash?"\u2714 SAVED":"\u{1F4BE} SAVE"}
            </button>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          {["range","leaderboard"].map(tab=>(
            <button key={tab} onClick={()=>setScreen(tab)} style={{padding:"9px 0",background:screen===tab?"rgba(200,100,0,0.2)":"rgba(255,255,255,0.03)",border:`1px solid ${screen===tab?"#d4830a":"#2a1a08"}`,borderRadius:6,color:screen===tab?"#f5c060":"#4a3010",fontSize:10,letterSpacing:3,cursor:"pointer",fontFamily:"inherit"}}>
              {tab==="range"?"\u{1F3AF} RANGE":"\u{1F3C6} LEADERBOARD"}
            </button>
          ))}
        </div>

        {screen==="leaderboard"
          ? <Leaderboard shooters={shooters}/>
          : shooters.map((s,i)=>(
              <ShooterCard key={i} shooter={s} active={activeIdx===i}
                onSelect={()=>setActiveIdx(i)}
                onChange={changes=>updateShooter(i,changes)}
                onSave={()=>saveRound(i)}
                feedbackHit={feedbackHit}
                feedbackMiss={feedbackMiss}
                setFlashLabel={setFlashLabel}/>
            ))
        }
        <div style={{textAlign:"center",marginTop:8,fontSize:9,letterSpacing:4,color:"#2a1a08"}}>PULL!</div>
      </div>
    </div>
  );
}
