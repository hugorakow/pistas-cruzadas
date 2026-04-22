import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import {
  ref, set, update, onValue, off, push, get
} from "firebase/database";

// ── Constants ─────────────────────────────────────────────────────────────────
const COLS = [1, 2, 3, 4, 5];
const ROWS = ["A", "B", "C", "D", "E"];
const ALL_COORDS = ROWS.flatMap(r => COLS.map(c => `${r}${c}`));

const WORD_LIST = [
  "AGUA","FUEGO","AIRE","TIERRA","HIELO","ARENA","TORMENTA","BOSQUE","DESIERTO","ISLA",
  "CASA","CALLE","CIUDAD","PARQUE","ESCUELA","HOSPITAL","TEATRO","AEROPUERTO","RESTAURANTE","HOTEL",
  "MESA","SILLA","PUERTA","VENTANA","LLAVE","RELOJ","TELÉFONO","LIBRO","LÁMPARA","MOCHILA",
  "PAN","QUESO","LECHE","CARNE","FRUTA","VERDURA","SOPA","CAFÉ","AZÚCAR","CHOCOLATE",
  "HOMBRE","MUJER","NIÑO","JOVEN","AMIGO","MÉDICO","MAESTRO","POLICÍA","CLIENTE","VECINO",
  "PERRO","CABALLO","LEÓN","OSO","PEZ","PÁJARO","MONO","SERPIENTE","ELEFANTE","TIBURÓN",
  "CORRER","SALTAR","COMER","DORMIR","LEER","ESCRIBIR","MIRAR","ESCUCHAR","PENSAR","VIAJAR",
  "TIEMPO","DINERO","AMOR","MIEDO","SUEÑO","VIDA","SUERTE","IDEA","CAMBIO","PODER",
  "INTERNET","COMPUTADORA","PANTALLA","FOTO","VIDEO","JUEGO","CONTROL","ENERGÍA","MOTOR","MÁQUINA",
  "LUZ","SOMBRA","COLOR","VERDE","ROJO","AZUL","FRÍO","CALOR","RÁPIDO","LENTO",
];

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg:      "#07090f",
  surface: "#0c1018",
  card:    "#111720",
  border:  "#1a2535",
  teal:    "#00c9a7",
  tealDim: "#007a67",
  gold:    "#f5a623",
  red:     "#e8365d",
  blue:    "#4a9eff",
  gray:    "#3a5068",
  grayLt:  "#6a8aaa",
  text:    "#d8eaf8",
  textDim: "#3a5268",
};

const PLAYER_COLORS = ["#00c9a7","#f5a623","#e8365d","#4a9eff","#a78bfa","#fb923c","#34d399","#f472b6"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateClues() {
  const words = shuffle(WORD_LIST).slice(0, 10);
  const cols = {}; const rows = {};
  COLS.forEach((c, i) => (cols[c] = words[i]));
  ROWS.forEach((r, i) => (rows[r] = words[5 + i]));
  return { cols, rows };
}

function pickCoord(usedCoords = []) {
  const avail = ALL_COORDS.filter(k => !usedCoords.includes(k));
  if (!avail.length) return null;
  return avail[Math.floor(Math.random() * avail.length)];
}

function uid6() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:ital,wght@0,400;0,500;1,400&family=Figtree:wght@400;500;600;700&display=swap');

  @keyframes fadeUp    { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
  @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:.45} }
  @keyframes popIn     { 0%{transform:scale(.88);opacity:0} 60%{transform:scale(1.06)} 100%{transform:scale(1);opacity:1} }
  @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes glow      { 0%,100%{box-shadow:0 0 0 0 rgba(0,201,167,.4)} 50%{box-shadow:0 0 0 8px rgba(0,201,167,0)} }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body { background: #07090f; }

  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1a2535; border-radius: 2px; }

  .btn {
    font-family: 'Figtree', sans-serif; font-weight: 600; font-size: 13px;
    border: none; border-radius: 8px; cursor: pointer; letter-spacing: .2px;
    padding: 9px 18px; transition: filter .15s, transform .15s;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .btn:disabled { opacity: .3; cursor: not-allowed; pointer-events: none; }
  .btn:not(:disabled):hover  { filter: brightness(1.18); transform: translateY(-1px); }
  .btn:not(:disabled):active { transform: translateY(0px); }

  .inp {
    font-family: 'Figtree', sans-serif; font-size: 14px; width: 100%;
    background: #0c1018; border: 1.5px solid #1a2535; border-radius: 8px;
    color: #d8eaf8; padding: 10px 14px; outline: none; transition: border-color .2s;
  }
  .inp:focus { border-color: #00c9a7; }
  .inp::placeholder { color: #1e3048; }

  .card { background: #111720; border: 1px solid #1a2535; border-radius: 14px; }

  .mono { font-family: 'DM Mono', monospace; }

  .label {
    font-family: 'DM Mono', monospace; font-size: 10px;
    letter-spacing: 2px; color: #6a8aaa; text-transform: uppercase;
  }

  .player-row {
    display: flex; align-items: flex-start; gap: 11px;
    padding: 12px 16px; border-radius: 10px; transition: background .18s;
    border: 1.5px solid transparent; cursor: default;
  }
  .player-row.clickable { cursor: pointer; }
  .player-row.clickable:hover { background: rgba(255,255,255,.025); }
  .player-row.voting { border-color: #f5a623 !important; background: rgba(245,166,35,.05) !important; }

  .vote-pill {
    font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500;
    padding: 3px 9px; border-radius: 20px; display: inline-flex; align-items: center;
    gap: 5px; border: 1px solid transparent; transition: all .18s;
  }

  .board-cell {
    border-radius: 7px; transition: background .3s, border-color .3s;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 48px; position: relative; overflow: hidden;
  }

  .progress-bar { height: 3px; background: #1a2535; border-radius: 2px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 2px; transition: width .5s cubic-bezier(.4,0,.2,1); }

  .toast {
    animation: slideDown .3s ease;
    border-radius: 10px; padding: 12px 16px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
  }

  .dot-live {
    width: 7px; height: 7px; border-radius: 50%; background: #00c9a7;
    animation: pulse 1.8s infinite;
    display: inline-block; margin-right: 5px;
  }

  .room-code {
    font-family: 'Syne', sans-serif; font-size: 28px; font-weight: 800;
    letter-spacing: 6px; color: #f5a623;
  }
`;

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export default function PistasCruzadas() {
  // ── My identity (persisted in sessionStorage) ────────────────────────────
  const [myId] = useState(() => {
    const stored = sessionStorage.getItem("pc_myId");
    if (stored) return stored;
    const id = uid6();
    sessionStorage.setItem("pc_myId", id);
    return id;
  });
  const [myName, setMyName] = useState(() => sessionStorage.getItem("pc_myName") || "");

  // ── Screen ───────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState("menu"); // menu | join | game

  // ── Live game state (from Firebase) ─────────────────────────────────────
  const [game, setGame]       = useState(null);
  const [roomId, setRoomId]   = useState(() => sessionStorage.getItem("pc_roomId") || "");
  const listenerRef           = useRef(null);

  // ── Local UI state ───────────────────────────────────────────────────────
  const [joinInput, setJoinInput]     = useState("");
  const [joinError, setJoinError]     = useState("");
  const [myWordInput, setMyWordInput] = useState("");
  const [guessTarget, setGuessTarget] = useState(null);
  const [guessRow, setGuessRow]       = useState("");
  const [guessCol, setGuessCol]       = useState("");
  const [toast, setToast]             = useState(null);
  const [connecting, setConnecting]   = useState(false);

  // ── Subscribe to room ────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    if (listenerRef.current) off(listenerRef.current);
    const r = ref(db, `rooms/${roomId}`);
    listenerRef.current = r;
    setConnecting(true);

    onValue(r, snap => {
      setConnecting(false);
      const data = snap.val();
      if (!data) { setGame(null); return; }
      setGame(data);

      // Check consensus whenever votes change
      checkConsensusServer(data, roomId);
    });

    return () => off(r);
  }, [roomId]);

  // ── Persist roomId ───────────────────────────────────────────────────────
  useEffect(() => {
    if (roomId) sessionStorage.setItem("pc_roomId", roomId);
  }, [roomId]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const me = game?.players?.[myId];
  const players = game?.players || {};
  const playerList = Object.entries(players);
  const resolved = game?.resolved || {};
  const votes = game?.votes || {};
  const resolvedCount = Object.values(resolved).filter(v => v !== "discarded").length;
  const discardedCount = Object.values(resolved).filter(v => v === "discarded").length;
  const allDone = Object.keys(resolved).length === 25;

  // ── Show toast ────────────────────────────────────────────────────────────
  function showToast(msg, type = "info") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Check consensus (runs on every game update) ──────────────────────────
  async function checkConsensusServer(data, rid) {
    const { players = {}, votes = {}, resolved = {} } = data;
    const playerIds = Object.keys(players);

    for (const [targetId, voterMap] of Object.entries(votes)) {
      const target = players[targetId];
      if (!target?.wordPublished || !target?.coord) continue;
      if (resolved[target.coord]) continue; // already processed

      const voters = playerIds.filter(id => id !== targetId);
      if (voters.length === 0) continue;
      if (!voters.every(id => voterMap[id])) continue; // not everyone voted

      const coords = voters.map(id => voterMap[id]);
      const unanimous = coords.every(c => c === coords[0]);
      if (!unanimous) continue;

      // ── Consensus reached — only the first voter processes it (race prevention) ──
      const guessedCoord = coords[0];
      const correct = guessedCoord === target.coord;

      const usedCoords = [
        ...Object.values(players).map(p => p.coord).filter(Boolean),
        ...Object.keys(resolved),
        guessedCoord,
      ];
      const newCoord = pickCoord(usedCoords);

      const updates = {};

      // Resolve the coord
      if (correct) {
        updates[`rooms/${rid}/resolved/${guessedCoord}`] = { word: target.word, playerName: target.name };
      } else {
        updates[`rooms/${rid}/resolved/${guessedCoord}`] = "discarded";
      }

      // Give target a new coord and reset their word
      updates[`rooms/${rid}/players/${targetId}/coord`]          = newCoord;
      updates[`rooms/${rid}/players/${targetId}/word`]           = "";
      updates[`rooms/${rid}/players/${targetId}/wordPublished`]  = false;

      // Clear votes for this target
      updates[`rooms/${rid}/votes/${targetId}`] = null;

      try {
        await update(ref(db), updates);
        showToast(
          correct
            ? `✓ ¡Correcto! ${target.name} estaba en ${guessedCoord}`
            : `✗ Incorrecto. ${guessedCoord} descartada (era ${target.name})`,
          correct ? "success" : "error"
        );
      } catch (e) {
        // Another client already processed it — that's fine
      }
    }
  }

  // ── Create room ───────────────────────────────────────────────────────────
  async function createRoom() {
    const name = myName.trim();
    if (!name) return;
    sessionStorage.setItem("pc_myName", name);

    const rid = uid6();
    const clues = generateClues();
    const coord = pickCoord([]);

    const roomData = {
      roomId: rid,
      clues,
      createdAt: Date.now(),
      players: {
        [myId]: {
          name,
          color: PLAYER_COLORS[0],
          coord,
          word: "",
          wordPublished: false,
        }
      },
      resolved: {},
      votes: {},
    };

    await set(ref(db, `rooms/${rid}`), roomData);
    setRoomId(rid);
    setScreen("game");
  }

  // ── Join room ─────────────────────────────────────────────────────────────
  async function joinRoom() {
    const name = myName.trim();
    const rid  = joinInput.trim().toUpperCase();
    if (!name || !rid) return;
    sessionStorage.setItem("pc_myName", name);

    const snap = await get(ref(db, `rooms/${rid}`));
    if (!snap.exists()) {
      setJoinError("No existe una sala con ese código.");
      return;
    }

    const data = snap.val();
    const usedCoords = Object.values(data.players || {}).map(p => p.coord).filter(Boolean);
    const coord = pickCoord(usedCoords);
    const colorIdx = Object.keys(data.players || {}).length;

    await update(ref(db, `rooms/${rid}/players/${myId}`), {
      name,
      color: PLAYER_COLORS[colorIdx % PLAYER_COLORS.length],
      coord,
      word: "",
      wordPublished: false,
    });

    setRoomId(rid);
    setJoinInput("");
    setJoinError("");
    setScreen("game");
  }

  // ── Leave room ────────────────────────────────────────────────────────────
  function leaveRoom() {
    if (roomId && myId) {
      // Remove player from room
      set(ref(db, `rooms/${roomId}/players/${myId}`), null);
      set(ref(db, `rooms/${roomId}/votes/${myId}`), null);
    }
    setRoomId("");
    setGame(null);
    setScreen("menu");
    sessionStorage.removeItem("pc_roomId");
  }

  // ── Publish word ──────────────────────────────────────────────────────────
  async function publishWord() {
    const word = myWordInput.trim().toUpperCase();
    if (!word || !roomId) return;
    await update(ref(db, `rooms/${roomId}/players/${myId}`), {
      word,
      wordPublished: true,
    });
    setMyWordInput("");
  }

  // ── Cast vote ─────────────────────────────────────────────────────────────
  async function castVote() {
    if (!guessRow || !guessCol || !guessTarget || !roomId) return;
    const coord = `${guessRow}${guessCol}`;
    await set(ref(db, `rooms/${roomId}/votes/${guessTarget}/${myId}`), coord);
    setGuessRow(""); setGuessCol(""); setGuessTarget(null);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREENS
  // ══════════════════════════════════════════════════════════════════════════

  // ── MENU ──────────────────────────────────────────────────────────────────
  if (screen === "menu") return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <style>{CSS}</style>
      <div style={{ maxWidth:360, width:"100%", animation:"fadeUp .5s ease" }}>

        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:44 }}>
          <div className="label" style={{ marginBottom:14 }}>COOPERATIVO · MULTIJUGADOR · TIEMPO REAL</div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:56, fontWeight:800, lineHeight:.95, color:C.text }}>
            PISTAS
          </div>
          <div style={{
            fontFamily:"'Syne',sans-serif", fontSize:56, fontWeight:800, lineHeight:.95,
            background:`linear-gradient(100deg,${C.teal},${C.gold})`,
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
          }}>
            CRUZADAS
          </div>
          <div style={{ marginTop:12, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.tealDim }}>
            <span className="dot-live" />en vivo vía Firebase
          </div>
        </div>

        {/* Name */}
        <div style={{ marginBottom:14 }}>
          <div className="label" style={{ marginBottom:6 }}>Tu nombre</div>
          <input className="inp" value={myName} onChange={e => setMyName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createRoom()}
            placeholder="¿Cómo te llamás?" />
        </div>

        {/* Actions */}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <button className="btn" onClick={createRoom} disabled={!myName.trim()}
            style={{ background:`linear-gradient(135deg,${C.teal},${C.tealDim})`, color:"#07090f", fontSize:15, padding:"13px", borderRadius:10, justifyContent:"center" }}>
            ✦ Crear partida
          </button>
          <button className="btn" onClick={() => setScreen("join")}
            style={{ background:C.card, color:C.text, border:`1px solid ${C.border}`, fontSize:14, padding:"12px", justifyContent:"center" }}>
            → Unirse con código
          </button>
        </div>

        <p style={{ fontFamily:"'Figtree',sans-serif", color:C.textDim, fontSize:12, marginTop:30, lineHeight:2, textAlign:"center" }}>
          Coordinada secreta por jugador · Palabra pista visible para todos<br/>
          Todos votan · Consenso = resultado instantáneo
        </p>
      </div>
    </div>
  );

  // ── JOIN ──────────────────────────────────────────────────────────────────
  if (screen === "join") return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <style>{CSS}</style>
      <div className="card" style={{ maxWidth:400, width:"100%", padding:28, animation:"fadeUp .4s" }}>
        <div style={{ fontFamily:"'Syne',sans-serif", color:C.text, fontSize:22, fontWeight:800, marginBottom:20 }}>
          Unirse a sala
        </div>

        <div style={{ marginBottom:14 }}>
          <div className="label" style={{ marginBottom:6 }}>Tu nombre</div>
          <input className="inp" value={myName} onChange={e => setMyName(e.target.value)} placeholder="Tu nombre" />
        </div>

        <div style={{ marginBottom:6 }}>
          <div className="label" style={{ marginBottom:6 }}>Código de sala</div>
          <input className="inp mono" value={joinInput}
            onChange={e => setJoinInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && joinRoom()}
            placeholder="ej: AB12CD" maxLength={6}
            style={{ fontSize:22, letterSpacing:6, textAlign:"center" }} />
        </div>

        {joinError && (
          <p style={{ color:C.red, fontSize:12, marginTop:6, fontFamily:"'Figtree',sans-serif" }}>{joinError}</p>
        )}

        <div style={{ display:"flex", gap:10, marginTop:18 }}>
          <button className="btn" onClick={joinRoom} disabled={!myName.trim() || !joinInput.trim()}
            style={{ background:C.teal, color:"#07090f", flex:1, justifyContent:"center" }}>
            Unirse
          </button>
          <button className="btn" onClick={() => setScreen("menu")}
            style={{ background:C.card, color:C.grayLt, border:`1px solid ${C.border}` }}>
            Volver
          </button>
        </div>
      </div>
    </div>
  );

  // ── CONNECTING ────────────────────────────────────────────────────────────
  if (screen === "game" && connecting) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <style>{CSS}</style>
      <div style={{ textAlign:"center", color:C.grayLt, fontFamily:"'DM Mono',monospace", fontSize:13 }}>
        <div style={{ fontSize:32, marginBottom:12, animation:"pulse 1.5s infinite" }}>⬡</div>
        Conectando…
      </div>
    </div>
  );

  // ── GAME ──────────────────────────────────────────────────────────────────
  if (screen === "game" && game) {
    const { clues } = game;
    const myRow = me?.coord?.[0];
    const myCol = me?.coord?.[1];

    return (
      <div style={{ minHeight:"100vh", background:C.bg, padding:"10px 8px 56px", fontFamily:"'Figtree',sans-serif" }}>
        <style>{CSS}</style>

        {/* ── Toast ──────────────────────────────────────────────────── */}
        {toast && (
          <div style={{ position:"fixed", top:14, left:"50%", transform:"translateX(-50%)", zIndex:999, maxWidth:420, width:"calc(100% - 28px)" }}>
            <div className="toast" style={{
              background: toast.type === "success" ? "rgba(0,201,167,.12)" : toast.type === "error" ? "rgba(232,54,93,.12)" : "rgba(255,255,255,.07)",
              border: `1px solid ${toast.type === "success" ? C.teal : toast.type === "error" ? C.red : C.border}`,
            }}>
              <span style={{ fontSize:13, color: toast.type === "success" ? C.teal : toast.type === "error" ? C.red : C.text }}>
                {toast.msg}
              </span>
              <button onClick={() => setToast(null)} style={{ background:"none", border:"none", color:C.grayLt, cursor:"pointer", fontSize:16, lineHeight:1 }}>×</button>
            </div>
          </div>
        )}

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ maxWidth:600, margin:"0 auto 10px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:17, fontWeight:800, color:C.text, lineHeight:1 }}>
              PISTAS <span style={{ color:C.teal }}>CRUZADAS</span>
            </div>
            <div className="mono" style={{ fontSize:10, color:C.grayLt, marginTop:3 }}>
              <span className="dot-live" />
              sala <span style={{ color:C.gold }}>{roomId}</span>
              {" · "}✓{resolvedCount} · ✗{discardedCount} · {25 - resolvedCount - discardedCount} rest.
            </div>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(roomId)}
              style={{ background:C.card, color:C.gold, border:`1px solid ${C.border}`, fontSize:11 }}>
              📋 {roomId}
            </button>
            <button className="btn" onClick={leaveRoom}
              style={{ background:C.card, color:C.grayLt, border:`1px solid ${C.border}`, fontSize:11 }}>
              Salir
            </button>
          </div>
        </div>

        {/* Progress */}
        <div style={{ maxWidth:600, margin:"0 auto 12px" }}>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width:`${(resolvedCount/25)*100}%`, background:C.teal }} />
          </div>
        </div>

        {/* Victory */}
        {allDone && (
          <div style={{ maxWidth:600, margin:"0 auto 12px", background:"rgba(0,201,167,.1)",
            border:`1px solid ${C.teal}`, borderRadius:12, padding:"18px 22px", textAlign:"center", animation:"popIn .5s" }}>
            <div style={{ fontSize:36 }}>🎉</div>
            <p style={{ fontFamily:"'Syne',sans-serif", color:C.teal, fontSize:20, margin:"8px 0 0", fontWeight:800 }}>
              ¡TABLERO COMPLETO!
            </p>
          </div>
        )}

        {/* ── Board ──────────────────────────────────────────────────── */}
        <div style={{ maxWidth:600, margin:"0 auto", overflowX:"auto" }}>
          <table style={{ borderCollapse:"separate", borderSpacing:3, width:"100%", tableLayout:"fixed" }}>
            <colgroup>
              <col style={{ width:"18%" }} />
              {COLS.map(c => <col key={c} style={{ width:"16.4%" }} />)}
            </colgroup>
            <thead>
              <tr>
                <td />
                {COLS.map(c => {
                  const isHit = myCol && String(myCol) === String(c);
                  return (
                    <th key={c} style={{ padding:0, fontWeight:"normal" }}>
                      <div style={{
                        background: isHit ? C.gold : C.card,
                        border:`1px solid ${isHit ? C.gold : C.border}`,
                        borderRadius:7, padding:"5px 2px", textAlign:"center", transition:"all .3s",
                      }}>
                        <div style={{ fontFamily:"'Syne',sans-serif", color: isHit ? C.bg : C.teal, fontSize:14, fontWeight:800 }}>{c}</div>
                        <div style={{ color: isHit ? "rgba(0,0,0,.5)" : C.textDim, fontSize:7, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", padding:"0 2px" }}>
                          {clues.cols[c]}
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(r => {
                const isHit = myRow === r;
                return (
                  <tr key={r}>
                    <td style={{ padding:0 }}>
                      <div style={{
                        background: isHit ? C.red : C.card,
                        border:`1px solid ${isHit ? C.red : C.border}`,
                        borderRadius:7, padding:"5px 4px", textAlign:"center", transition:"all .3s",
                      }}>
                        <div style={{ fontFamily:"'Syne',sans-serif", color:"white", fontSize:14, fontWeight:800 }}>{r}</div>
                        <div style={{ color:"rgba(255,255,255,.4)", fontSize:7, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {clues.rows[r]}
                        </div>
                      </div>
                    </td>
                    {COLS.map(c => {
                      const key = `${r}${c}`;
                      const val = resolved[key];
                      const isMyCoord  = me?.coord === key;
                      const isComplete = val && val !== "discarded";
                      const isDiscard  = val === "discarded";

                      // Dots for votes on this cell
                      const voteDots = [];
                      Object.entries(votes).forEach(([targetId, voterMap]) => {
                        Object.entries(voterMap || {}).forEach(([vid, coord]) => {
                          if (coord === key) {
                            const voter = players[vid];
                            if (voter) voteDots.push({ color: voter.color, name: voter.name });
                          }
                        });
                      });

                      return (
                        <td key={c} style={{ padding:0 }}>
                          <div className="board-cell" style={{
                            background: isComplete ? "rgba(0,201,167,.12)" : isDiscard ? "rgba(255,255,255,.02)" : isMyCoord ? "rgba(245,166,35,.08)" : C.surface,
                            border:`1.5px solid ${isMyCoord && !isComplete ? C.gold : isComplete ? C.teal : isDiscard ? C.border : C.border}`,
                            animation: isMyCoord && !isComplete ? "glow 2.5s infinite" : "none",
                          }}>
                            <div className="mono" style={{ fontSize:7, color: isComplete ? C.teal : isDiscard ? C.textDim : isMyCoord ? C.gold : C.textDim }}>
                              {key}
                            </div>
                            {isComplete ? (
                              <>
                                <div style={{ fontSize:8, color:C.teal, fontWeight:700, textAlign:"center", wordBreak:"break-all", padding:"0 2px", lineHeight:1.2 }}>{val.word}</div>
                                <div style={{ fontSize:7, color:C.textDim }}>{val.playerName}</div>
                              </>
                            ) : isDiscard ? (
                              <div style={{ fontSize:12, color:C.textDim }}>✗</div>
                            ) : isMyCoord ? (
                              <div style={{ fontSize:17, color:C.gold }}>★</div>
                            ) : voteDots.length > 0 ? (
                              <div style={{ display:"flex", flexWrap:"wrap", gap:2, justifyContent:"center", padding:2 }}>
                                {voteDots.map((d, i) => (
                                  <div key={i} title={d.name} style={{ width:6, height:6, borderRadius:"50%", background:d.color }} />
                                ))}
                              </div>
                            ) : (
                              <div style={{ fontSize:13, color:C.border }}>·</div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Players panel ──────────────────────────────────────────── */}
        <div className="card" style={{ maxWidth:600, margin:"14px auto 0" }}>
          <div style={{ padding:"14px 16px 4px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div className="label">Jugadores · {playerList.length}</div>
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:C.teal, fontFamily:"'DM Mono',monospace" }}>
              <span className="dot-live" />en vivo
            </div>
          </div>

          {playerList.map(([pid, player], idx) => {
            const isMe       = pid === myId;
            const voterMap   = votes[pid] || {};
            const otherPids  = playerList.filter(([id]) => id !== pid);
            const allVoted   = otherPids.length > 0 && otherPids.every(([id]) => voterMap[id]);
            const coords     = Object.values(voterMap);
            const unanimous  = allVoted && coords.length > 0 && coords.every(c => c === coords[0]);
            const votedCount = Object.keys(voterMap).length;
            const pct        = otherPids.length > 0 ? (votedCount / otherPids.length) * 100 : 0;
            const canVote    = !isMe && player.wordPublished && !resolved[player.coord] && player.coord;
            const isGuessing = guessTarget === pid;
            const myVote     = voterMap[myId];

            return (
              <div key={pid}>
                <div style={{ padding:"0 16px" }}>

                  {/* Player row */}
                  <div
                    className={`player-row${canVote ? " clickable" : ""}${isGuessing ? " voting" : ""}`}
                    onClick={() => {
                      if (!canVote) return;
                      setGuessTarget(isGuessing ? null : pid);
                      setGuessRow(""); setGuessCol("");
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width:34, height:34, borderRadius:"50%", flexShrink:0,
                      background:`${player.color}1a`, border:`2px solid ${player.color}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:800, color:player.color,
                    }}>
                      {player.name[0]?.toUpperCase()}
                    </div>

                    {/* Info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:2 }}>
                        <span style={{ fontWeight:700, fontSize:13, color: isMe ? player.color : C.text }}>
                          {player.name}
                        </span>
                        {isMe && (
                          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, background:`${C.teal}1a`,
                            color:C.teal, padding:"2px 7px", borderRadius:4 }}>YO</span>
                        )}
                        {player.wordPublished
                          ? <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15,
                              color:player.color, background:`${player.color}15`, padding:"2px 10px", borderRadius:6 }}>
                              {player.word}
                            </span>
                          : player.coord
                            ? <span style={{ fontSize:11, color:C.textDim, fontStyle:"italic" }}>pensando…</span>
                            : <span style={{ fontSize:11, color:C.textDim }}>sin coord.</span>
                        }
                      </div>

                      {/* Votes from others */}
                      {player.wordPublished && otherPids.length > 0 && (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:4 }}>
                          {otherPids.map(([vid, voter]) => {
                            const v = voterMap[vid];
                            return (
                              <span key={vid} className="vote-pill" style={{
                                color: v ? voter.color : C.textDim,
                                background: v ? `${voter.color}12` : C.surface,
                                borderColor: v ? `${voter.color}44` : C.border,
                              }}>
                                <span style={{ fontSize:9 }}>{voter.name.split(" ")[0]}</span>
                                <span>{v || "…"}</span>
                              </span>
                            );
                          })}
                          {allVoted && !unanimous && (
                            <span style={{ fontSize:11, color:C.gold, fontStyle:"italic", alignSelf:"center" }}>
                              No hay acuerdo
                            </span>
                          )}
                          {unanimous && (
                            <span style={{ fontSize:11, color:C.teal, fontWeight:700, alignSelf:"center", animation:"popIn .3s" }}>
                              ✓ Consenso: {coords[0]}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Vote button hint */}
                    {canVote && !isGuessing && (
                      <div style={{ flexShrink:0 }}>
                        {myVote ? (
                          <span className="vote-pill" style={{ color:player.color, background:`${player.color}15`, borderColor:`${player.color}44` }}>
                            {myVote} <span style={{ fontSize:9, opacity:.6 }}>✎</span>
                          </span>
                        ) : (
                          <span className="vote-pill" style={{ color:C.grayLt, background:C.surface, borderColor:C.border }}>
                            Votar →
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Progress bar for votes */}
                  {player.wordPublished && otherPids.length > 1 && (
                    <div style={{ paddingLeft:45, paddingBottom:8 }}>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width:`${pct}%`, background:player.color }} />
                      </div>
                    </div>
                  )}

                  {/* Voting UI */}
                  {isGuessing && (
                    <div style={{ paddingLeft:45, paddingBottom:14, animation:"slideDown .2s" }}>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                        <select value={guessRow} onChange={e => setGuessRow(e.target.value)}
                          className="inp" style={{ flex:1, minWidth:110, padding:"8px 10px", fontSize:12 }}>
                          <option value="">Fila…</option>
                          {ROWS.map(r => (
                            <option key={r} value={r}>{r} — {clues.rows[r]}</option>
                          ))}
                        </select>
                        <select value={guessCol} onChange={e => setGuessCol(e.target.value)}
                          className="inp" style={{ flex:1, minWidth:110, padding:"8px 10px", fontSize:12 }}>
                          <option value="">Col…</option>
                          {COLS.map(c => (
                            <option key={c} value={c}>{c} — {clues.cols[c]}</option>
                          ))}
                        </select>
                        <button className="btn" onClick={castVote} disabled={!guessRow || !guessCol}
                          style={{ background:player.color, color:"#07090f", whiteSpace:"nowrap" }}>
                          Votar {guessRow}{guessCol}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {idx < playerList.length - 1 && (
                  <div style={{ height:1, background:C.border, margin:"0 16px" }} />
                )}
              </div>
            );
          })}

          {/* My word input */}
          {me?.coord && !me?.wordPublished && !allDone && (
            <div style={{ padding:"14px 16px", borderTop:`1px solid ${C.border}`, background:"rgba(0,201,167,.03)", borderRadius:"0 0 14px 14px" }}>
              <div className="label" style={{ color:C.teal, marginBottom:6 }}>
                MI TURNO — COORDENADA {me.coord}
              </div>
              <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
                <span style={{ fontSize:11, fontWeight:600, background:`${C.red}22`, color:C.red, padding:"3px 10px", borderRadius:20 }}>
                  {myRow}: {clues.rows[myRow]}
                </span>
                <span style={{ fontSize:11, fontWeight:600, background:`${C.teal}22`, color:C.teal, padding:"3px 10px", borderRadius:20 }}>
                  {myCol}: {clues.cols[myCol]}
                </span>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <input className="inp" value={myWordInput}
                  onChange={e => setMyWordInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && publishWord()}
                  placeholder="Tu palabra pista…" style={{ flex:1, fontSize:15 }} />
                <button className="btn" onClick={publishWord} disabled={!myWordInput.trim()}
                  style={{ background:C.teal, color:"#07090f" }}>
                  Publicar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ maxWidth:600, margin:"12px auto 0", display:"flex", gap:16, flexWrap:"wrap" }}>
          {[
            { color:C.gold, label:"★ Mi coordenada" },
            { color:C.teal, label:"✓ Completada" },
            { color:C.border, label:"✗ Descartada" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:C.grayLt }}>
              <div style={{ width:8, height:8, borderRadius:2, background:color }} />{label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
