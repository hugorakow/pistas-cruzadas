import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import {
  ref, set, update, onValue, off, push, get, runTransaction
} from "firebase/database";

// ── Constants ─────────────────────────────────────────────────────────────────
const ALL_ROWS = ["A", "B", "C", "D", "E", "F", "G"];
const ALL_COLS = [1, 2, 3, 4, 5, 6, 7];

function getBoardDims(size = 5) {
  return {
    ROWS: ALL_ROWS.slice(0, size),
    COLS: ALL_COLS.slice(0, size),
    ALL_COORDS: ALL_ROWS.slice(0, size).flatMap(r => ALL_COLS.slice(0, size).map(c => `${r}${c}`)),
    TOTAL: size * size,
  };
}

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

// ── End game messages ─────────────────────────────────────────────────────────
const END_MESSAGES = {
  perfect: [
    "🏆 ¡Ganaron! ¡Comunicación perfecta!",
    "🏆 ¡Ganaron! ¡Son una máquina!",
    "🏆 ¡Ganaron! ¡Sin errores, increíble!",
    "🏆 ¡Ganaron! ¡Mente colmena activada!",
    "🏆 ¡Ganaron! ¡No fallaron ni una!",
    "🏆 ¡Ganaron! ¡Coordinación de otro nivel!",
    "🏆 ¡Ganaron! ¡Telepáticos!",
  ],
  great: [
    "🎉 ¡Bien jugado! Casi perfectos.",
    "🎉 ¡Muy bien! Pero se puede mejorar.",
    "🎉 ¡Buen equipo! Alguna que otra pifió.",
    "🎉 ¡Sólido! Unos pocos errores nomás.",
    "🎉 ¡Muy cerca! Le faltó poquito.",
    "🎉 ¡Buen resultado! Con práctica se llega.",
    "🎉 ¡Casi! El equipo funcionó bien.",
  ],
  ok: [
    "😅 Falta comunicación.",
    "😅 Se entendieron... más o menos.",
    "😅 Hay que hablar más antes de jugar.",
    "😅 Regular. El chat estaba ahí para algo.",
    "😅 Ni bien ni mal. Más o menos.",
    "😅 Se notó la duda en más de una.",
    "😅 Prometedor pero irregular.",
  ],
  bad: [
    "💀 Horribles. A practicar.",
    "💀 ¿Estaban jugando el mismo juego?",
    "💀 Comunicación = 0.",
    "💀 Esto fue un desastre glorioso.",
    "💀 No se entendieron ni de casualidad.",
    "💀 El tablero los comió vivos.",
    "💀 Hay que volver a la escuela.",
  ],
};

// Umbrales en porcentaje (igual que 5x5: 24/25=96%, 21/25=84%, 16/25=64%)
function getEndMessage(correct, total) {
  const pct = correct / total;
  let bucket;
  if (pct >= 0.96) bucket = "perfect";
  else if (pct >= 0.84) bucket = "great";
  else if (pct >= 0.64) bucket = "ok";
  else bucket = "bad";
  const opts = END_MESSAGES[bucket];
  return opts[Math.floor(Math.random() * opts.length)];
}

// ── Hint validation ───────────────────────────────────────────────────────────
function getStem(word) {
  return word.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/aciones$|acion$|mente$|iendo$|ando$|uras$|ura$|eres$|eria$|cion$|sion$|ista$|ismo$|dor$|dora$|ados$|adas$|ido$|ida$|ado$|ada$|ar$|er$|ir$|es$|os$|as$|en$|an$|s$/, "");
}

function sharesRoot(hint, clueWord) {
  const hStem = getStem(hint);
  const cStem = getStem(clueWord);
  if (hStem.length < 3 || cStem.length < 3) return false;
  const minLen = Math.min(hStem.length, cStem.length, 5);
  return hStem.slice(0, minLen) === cStem.slice(0, minLen);
}

function validateHint(hint, clues, coord, usedWords) {
  const word = hint.trim().toUpperCase();
  if (!word) return "Escribí una palabra.";
  if (word.split(/\s+/).length > 1) return "La pista debe ser una sola palabra.";
  if (usedWords.map(w => w.toUpperCase()).includes(word)) return `"${word}" ya fue usada en esta partida.`;
  const row = coord[0]; const col = coord[1];
  const rowClue = clues.rows[row]; const colClue = clues.cols[col];
  if (sharesRoot(word, rowClue)) return `"${word}" comparte raíz con "${rowClue}".`;
  if (sharesRoot(word, colClue)) return `"${word}" comparte raíz con "${colClue}".`;
  return null;
}

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

function generateClues(size = 5) {
  const { ROWS, COLS } = getBoardDims(size);
  const words = shuffle(WORD_LIST).slice(0, ROWS.length + COLS.length);
  const cols = {}; const rows = {};
  COLS.forEach((c, i) => (cols[c] = words[i]));
  ROWS.forEach((r, i) => (rows[r] = words[COLS.length + i]));
  return { cols, rows };
}

function pickCoord(usedCoords = [], size = 5) {
  const { ALL_COORDS } = getBoardDims(size);
  const avail = ALL_COORDS.filter(k => !usedCoords.includes(k));
  if (!avail.length) return null;
  return avail[Math.floor(Math.random() * avail.length)];
}

function uid6() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:ital,wght@0,400;0,500;1,400&family=Figtree:wght@400;500;600;700&display=swap');

  @keyframes fadeUp    { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:.45} }
  @keyframes popIn     { 0%{transform:scale(.88);opacity:0} 60%{transform:scale(1.06)} 100%{transform:scale(1);opacity:1} }
  @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes glow      { 0%,100%{box-shadow:0 0 0 0 rgba(0,201,167,.4)} 50%{box-shadow:0 0 0 8px rgba(0,201,167,0)} }
  @keyframes msgIn     { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }

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
  .label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 2px; color: #6a8aaa; text-transform: uppercase; }

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

  /* Celda más alta para que entre la palabra */
  .board-cell {
    border-radius: 7px; transition: background .3s, border-color .3s;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 58px; position: relative; overflow: hidden;
  }

  .progress-bar { height: 3px; background: #1a2535; border-radius: 2px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 2px; transition: width .5s cubic-bezier(.4,0,.2,1); }

  .toast {
    animation: slideDown .3s ease; border-radius: 10px; padding: 12px 16px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
  }

  .dot-live {
    width: 7px; height: 7px; border-radius: 50%; background: #00c9a7;
    animation: pulse 1.8s infinite; display: inline-block; margin-right: 5px;
  }

  /* Error badge */
  .error-badge {
    display: inline-flex; align-items: center; gap: 5px;
    background: rgba(232,54,93,.15); border: 1.5px solid rgba(232,54,93,.45);
    color: #e8365d; border-radius: 8px; padding: 4px 12px;
    font-family: 'Syne', sans-serif; font-weight: 800; font-size: 16px;
    flex-shrink: 0;
  }

  /* Chat */
  .chat-messages {
    height: 230px; overflow-y: auto; padding: 12px 16px;
    display: flex; flex-direction: column; gap: 9px;
  }
  .chat-msg { animation: msgIn .2s ease; }
  .chat-input-row { display: flex; gap: 8px; padding: 10px 16px; border-top: 1px solid #1a2535; }
  .chat-inp {
    font-family: 'Figtree', sans-serif; font-size: 13px; flex: 1;
    background: #0c1018; border: 1.5px solid #1a2535; border-radius: 8px;
    color: #d8eaf8; padding: 8px 12px; outline: none; transition: border-color .2s;
  }
  .chat-inp:focus { border-color: #00c9a7; }
  .chat-inp::placeholder { color: #1e3048; }
`;

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export default function PistasCruzadas() {
  const [myId] = useState(() => {
    const s = localStorage.getItem("pc_myId");
    if (s) return s;
    const id = uid6(); localStorage.setItem("pc_myId", id); return id;
  });
  const [myName, setMyName] = useState(() => localStorage.getItem("pc_myName") || "");
  const [screen, setScreen] = useState(() => localStorage.getItem("pc_roomId") ? "game" : "menu");
  const [boardSizeChoice, setBoardSizeChoice] = useState(5);

  const [game, setGame]     = useState(null);
  const [roomId, setRoomId] = useState(() => localStorage.getItem("pc_roomId") || "");
  const listenerRef         = useRef(null);
  const isMounted           = useRef(false);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput]       = useState("");
  const chatEndRef                      = useRef(null);

  const [joinInput, setJoinInput]     = useState("");
  const [joinError, setJoinError]     = useState("");
  const [myWordInput, setMyWordInput] = useState("");
  const [hintError, setHintError]     = useState("");
  const [guessTarget, setGuessTarget] = useState(null);
  const [guessRow, setGuessRow]       = useState("");
  const [guessCol, setGuessCol]       = useState("");
  const [toast, setToast]             = useState(null);
  const [connecting, setConnecting]   = useState(false);

  // ── Subscribe room ────────────────────────────────────────────────────────
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
      checkConsensusServer(data, roomId);
    });
    return () => off(r);
  }, [roomId]);

  // ── Subscribe chat ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    const chatRef = ref(db, `rooms/${roomId}/chat`);
    onValue(chatRef, snap => {
      const data = snap.val();
      if (!data) { setChatMessages([]); return; }
      const msgs = Object.entries(data)
        .map(([id, msg]) => ({ id, ...msg }))
        .sort((a, b) => (a.ts || 0) - (b.ts || 0));
      setChatMessages(msgs);
    });
    return () => off(chatRef);
  }, [roomId]);

  // ── Auto-scroll chat ──────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    if (roomId) {
      localStorage.setItem("pc_roomId", roomId);
      setScreen("game");
    }
  }, [roomId]);

  const me             = game?.players?.[myId];
  const players        = game?.players || {};
  const playerList     = Object.entries(players);
  const resolved       = game?.resolved || {};
  const votes          = game?.votes || {};
  const boardSize      = game?.boardSize || 5;
  const { ROWS, COLS, ALL_COORDS, TOTAL } = getBoardDims(boardSize);
  const resolvedCount  = Object.values(resolved).filter(v => v !== "discarded").length;
  const discardedCount = Object.values(resolved).filter(v => v === "discarded").length;
  const allDone        = Object.keys(resolved).length === TOTAL;

  function showToast(msg, type = "info") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Consensus ─────────────────────────────────────────────────────────────
  async function checkConsensusServer(data, rid) {
    const { players = {}, votes = {}, resolved = {}, boardSize: bs = 5 } = data;
    const { ALL_COORDS: ac, TOTAL } = getBoardDims(bs);
    const playerIds = Object.keys(players);
    for (const [targetId, voterMap] of Object.entries(votes)) {
      const target = players[targetId];
      if (!target?.wordPublished || !target?.coord) continue;
      if (resolved[target.coord] !== undefined) continue;
      const voters = playerIds.filter(id => id !== targetId);
      if (voters.length === 0) continue;
      if (!voters.every(id => voterMap[id])) continue;
      const coords = voters.map(id => voterMap[id]);
      if (!coords.every(c => c === coords[0])) continue;

      const guessedCoord = coords[0];
      const correct = guessedCoord === target.coord;

      // Usar Transaction para que solo UN cliente procese el consenso
      const lockRef = ref(db, `rooms/${rid}/resolved/${target.coord}`);
      try {
        let committed = false;
        await runTransaction(lockRef, current => {
          if (current !== null && current !== undefined) { return; } // ya procesado, abortar
          committed = true;
          return correct
            ? { word: target.word, playerName: target.name }
            : "lost";
        }).then(result => { committed = result.committed; });
        if (!committed) continue;

        const usedCoords = [
          ...Object.values(players).map(p => p.coord).filter(Boolean),
          ...Object.keys(resolved),
          target.coord,
        ];
        const newCoord = pickCoord(usedCoords, bs);
        const updates = {};
        updates[`rooms/${rid}/players/${targetId}/coord`]         = newCoord;
        updates[`rooms/${rid}/players/${targetId}/word`]          = "";
        updates[`rooms/${rid}/players/${targetId}/wordPublished`] = false;
        updates[`rooms/${rid}/votes/${targetId}`]                 = null;

        const resultMsg = correct
          ? `✓ ¡Correcto! ${target.name} estaba en ${guessedCoord}`
          : `✗ Incorrecto. Dijeron ${guessedCoord} pero no era. La coordenada de ${target.name} se perdió.`;

        await update(ref(db), updates);
        await push(ref(db, `rooms/${rid}/chat`), {
          name: "🎮 Juego", color: correct ? "#00c9a7" : "#e8365d",
          text: resultMsg, ts: Date.now(), system: true,
        });

        // Verificar si el juego terminó y guardar frase final en Firebase
        const newResolved = { ...resolved, [target.coord]: correct ? { word: target.word, playerName: target.name } : "lost" };
        if (Object.keys(newResolved).length === TOTAL && !data.endMessage) {
          const correctCount = Object.values(newResolved).filter(v => v !== "lost").length;
          const msg = getEndMessage(correctCount, TOTAL);
          await update(ref(db, `rooms/${rid}`), { endMessage: msg });
        }

        showToast(resultMsg, correct ? "success" : "error");
      } catch (e) { /* otro cliente ya lo procesó */ }
    }
  }

  // ── Create room ───────────────────────────────────────────────────────────
  async function createRoom() {
    const name = myName.trim(); if (!name) return;
    localStorage.setItem("pc_myName", name);
    const rid = uid6(); const clues = generateClues(boardSizeChoice); const coord = pickCoord([], boardSizeChoice);
    await set(ref(db, `rooms/${rid}`), {
      roomId: rid, clues, boardSize: boardSizeChoice, createdAt: Date.now(),
      players: { [myId]: { name, color: PLAYER_COLORS[0], coord, word: "", wordPublished: false } },
      resolved: {}, votes: {}, chat: {},
    });
    setRoomId(rid); setScreen("game");
  }

  // ── Join room ─────────────────────────────────────────────────────────────
  async function joinRoom() {
    const name = myName.trim(); const rid = joinInput.trim().toUpperCase();
    if (!name || !rid) return;
    localStorage.setItem("pc_myName", name);
    const snap = await get(ref(db, `rooms/${rid}`));
    if (!snap.exists()) { setJoinError("No existe una sala con ese código."); return; }
    const data = snap.val();
    const existingPlayers = data.players || {};

    // ── ¿Ya existe un jugador con este nombre en la sala? ──
    // Primero busco por myId (mismo dispositivo), luego por nombre (vuelve desde otro)
    const existingById   = existingPlayers[myId];
    const existingByName = Object.entries(existingPlayers).find(([, p]) => p.name?.toLowerCase() === name.toLowerCase());

    if (existingById) {
      // Mismo dispositivo, mismo ID → entrar directo sin modificar nada
      setRoomId(rid); setJoinInput(""); setJoinError(""); setScreen("game");
      return;
    }

    if (existingByName) {
      // Mismo nombre desde otro dispositivo → adoptar ese ID
      const [existingId] = existingByName;
      localStorage.setItem("pc_myId", existingId);
      // No podemos mutar myId (es const del useState), recargamos con el nuevo ID guardado
      setRoomId(rid); setJoinInput(""); setJoinError("");
      window.location.reload(); // recarga con el localStorage actualizado
      return;
    }

    // Jugador nuevo
    const bs         = data.boardSize || 5;
    const usedCoords = Object.values(existingPlayers).map(p => p.coord).filter(Boolean);
    const coord      = pickCoord(usedCoords, bs);
    const colorIdx   = Object.keys(existingPlayers).length;
    await update(ref(db, `rooms/${rid}/players/${myId}`), {
      name, color: PLAYER_COLORS[colorIdx % PLAYER_COLORS.length], coord, word: "", wordPublished: false,
    });
    await push(ref(db, `rooms/${rid}/chat`), {
      name: "🎮 Juego", color: C.teal, text: `${name} se unió a la partida.`, ts: Date.now(), system: true,
    });
    setRoomId(rid); setJoinInput(""); setJoinError(""); setScreen("game");
  }

  // ── Leave room ────────────────────────────────────────────────────────────
  function leaveRoom() {
    if (roomId && myId) {
      set(ref(db, `rooms/${roomId}/players/${myId}`), null);
      set(ref(db, `rooms/${roomId}/votes/${myId}`), null);
    }
    setRoomId(""); setGame(null); setScreen("menu");
    localStorage.removeItem("pc_roomId");
  }

  // ── Publish word ──────────────────────────────────────────────────────────
  async function publishWord() {
    const word = myWordInput.trim().toUpperCase();
    if (!word || !roomId) return;
    // Collect all used words in this game
    const usedWords = [
      ...Object.values(game?.players || {}).map(p => p.word).filter(Boolean),
      ...Object.values(game?.resolved || {}).filter(v => v !== "discarded").map(v => v.word).filter(Boolean),
    ];
    const error = validateHint(word, game?.clues, me?.coord, usedWords);
    if (error) { setHintError(error); return; }
    setHintError("");
    await update(ref(db, `rooms/${roomId}/players/${myId}`), { word, wordPublished: true });
    await push(ref(db, `rooms/${roomId}/chat`), {
      name: "🎮 Juego", color: C.gold, text: `${me?.name} publicó su pista: ${word}`, ts: Date.now(), system: true,
    });
    setMyWordInput("");
  }

  // ── Cast vote ─────────────────────────────────────────────────────────────
  async function castVote() {
    if (!guessRow || !guessCol || !guessTarget || !roomId) return;
    await set(ref(db, `rooms/${roomId}/votes/${guessTarget}/${myId}`), `${guessRow}${guessCol}`);
    setGuessRow(""); setGuessCol(""); setGuessTarget(null);
  }

  // ── Send chat ─────────────────────────────────────────────────────────────
  async function sendChat() {
    const text = chatInput.trim(); if (!text || !roomId || !me) return;
    await push(ref(db, `rooms/${roomId}/chat`), {
      name: me.name, color: me.color, text, ts: Date.now(), system: false,
    });
    setChatInput("");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREENS
  // ══════════════════════════════════════════════════════════════════════════

  if (screen === "menu") return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <style>{CSS}</style>
      <div style={{ maxWidth:360, width:"100%", animation:"fadeUp .5s ease" }}>
        <div style={{ textAlign:"center", marginBottom:44 }}>
          <div className="label" style={{ marginBottom:14 }}>COOPERATIVO · MULTIJUGADOR · TIEMPO REAL</div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:56, fontWeight:800, lineHeight:.95, color:C.text }}>PISTAS</div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:56, fontWeight:800, lineHeight:.95,
            background:`linear-gradient(100deg,${C.teal},${C.gold})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
            CRUZADAS
          </div>
          <div style={{ marginTop:12, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.tealDim }}>
            <span className="dot-live" />en vivo vía Firebase
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <div className="label" style={{ marginBottom:6 }}>Tu nombre</div>
          <input className="inp" value={myName} onChange={e => setMyName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createRoom()} placeholder="¿Cómo te llamás?" />
        </div>
        <div style={{ marginBottom:18 }}>
          <div className="label" style={{ marginBottom:8 }}>Tamaño del tablero</div>
          <div style={{ display:"flex", gap:8 }}>
            {[5, 6, 7].map(s => (
              <button key={s} className="btn" onClick={() => setBoardSizeChoice(s)}
                style={{
                  flex:1, justifyContent:"center", fontSize:13, padding:"10px 0",
                  background: boardSizeChoice === s ? C.teal : C.card,
                  color: boardSizeChoice === s ? "#07090f" : C.grayLt,
                  border: `1.5px solid ${boardSizeChoice === s ? C.teal : C.border}`,
                }}>
                {s}×{s}
                <span style={{ display:"block", fontSize:9, opacity:.7, marginTop:1 }}>{s*s} casillas</span>
              </button>
            ))}
          </div>
        </div>
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

  if (screen === "join") return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <style>{CSS}</style>
      <div className="card" style={{ maxWidth:400, width:"100%", padding:28, animation:"fadeUp .4s" }}>
        <div style={{ fontFamily:"'Syne',sans-serif", color:C.text, fontSize:22, fontWeight:800, marginBottom:20 }}>Unirse a sala</div>
        <div style={{ marginBottom:14 }}>
          <div className="label" style={{ marginBottom:6 }}>Tu nombre</div>
          <input className="inp" value={myName} onChange={e => setMyName(e.target.value)} placeholder="Tu nombre" />
        </div>
        <div style={{ marginBottom:6 }}>
          <div className="label" style={{ marginBottom:6 }}>Código de sala</div>
          <input className="inp mono" value={joinInput} onChange={e => setJoinInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && joinRoom()}
            placeholder="ej: AB12CD" maxLength={6} style={{ fontSize:22, letterSpacing:6, textAlign:"center" }} />
        </div>
        {joinError && <p style={{ color:C.red, fontSize:12, marginTop:6, fontFamily:"'Figtree',sans-serif" }}>{joinError}</p>}
        <div style={{ display:"flex", gap:10, marginTop:18 }}>
          <button className="btn" onClick={joinRoom} disabled={!myName.trim() || !joinInput.trim()}
            style={{ background:C.teal, color:"#07090f", flex:1, justifyContent:"center" }}>Unirse</button>
          <button className="btn" onClick={() => setScreen("menu")}
            style={{ background:C.card, color:C.grayLt, border:`1px solid ${C.border}` }}>Volver</button>
        </div>
      </div>
    </div>
  );

  if (screen === "game" && connecting) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <style>{CSS}</style>
      <div style={{ textAlign:"center", color:C.grayLt, fontFamily:"'DM Mono',monospace", fontSize:13 }}>
        <div style={{ fontSize:32, marginBottom:12, animation:"pulse 1.5s infinite" }}>⬡</div>
        Conectando…
      </div>
    </div>
  );

  if (screen === "game" && game) {
    const { clues } = game;
    const myRow = me?.coord?.[0];
    const myCol = me?.coord?.[1];

    return (
      <div style={{ minHeight:"100vh", background:C.bg, padding:"10px 8px 56px", fontFamily:"'Figtree',sans-serif" }}>
        <style>{CSS}</style>

        {/* Toast */}
        {toast && (
          <div style={{ position:"fixed", top:14, left:"50%", transform:"translateX(-50%)", zIndex:999, maxWidth:420, width:"calc(100% - 28px)" }}>
            <div className="toast" style={{
              background: toast.type==="success" ? "rgba(0,201,167,.12)" : toast.type==="error" ? "rgba(232,54,93,.12)" : "rgba(255,255,255,.07)",
              border: `1px solid ${toast.type==="success" ? C.teal : toast.type==="error" ? C.red : C.border}`,
            }}>
              <span style={{ fontSize:13, color: toast.type==="success" ? C.teal : toast.type==="error" ? C.red : C.text }}>{toast.msg}</span>
              <button onClick={() => setToast(null)} style={{ background:"none", border:"none", color:C.grayLt, cursor:"pointer", fontSize:16 }}>×</button>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ maxWidth:600, margin:"0 auto 10px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:17, fontWeight:800, color:C.text, lineHeight:1 }}>
              PISTAS <span style={{ color:C.teal }}>CRUZADAS</span>
            </div>
            <div className="mono" style={{ fontSize:10, color:C.grayLt, marginTop:3 }}>
              <span className="dot-live" />sala <span style={{ color:C.gold }}>{roomId}</span>
            </div>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(roomId)}
              style={{ background:C.card, color:C.gold, border:`1px solid ${C.border}`, fontSize:11 }}>📋 {roomId}</button>
            <button className="btn" onClick={leaveRoom}
              style={{ background:C.card, color:C.grayLt, border:`1px solid ${C.border}`, fontSize:11 }}>Salir</button>
          </div>
        </div>

        {/* ── Score bar: progreso + badge de errores ── */}
        <div style={{ maxWidth:600, margin:"0 auto 12px", display:"flex", gap:10, alignItems:"center" }}>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span className="mono" style={{ fontSize:10, color:C.teal }}>✓ {resolvedCount} correctas</span>
              <span className="mono" style={{ fontSize:10, color:C.textDim }}>{TOTAL-resolvedCount-discardedCount} restantes</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width:`${(resolvedCount/TOTAL)*100}%`, background:C.teal }} />
            </div>
          </div>
          {/* Badge errores — siempre visible, se pone rojo cuando hay errores */}
          <div className="error-badge" style={{
            background: discardedCount > 0 ? "rgba(232,54,93,.15)" : "rgba(255,255,255,.04)",
            borderColor: discardedCount > 0 ? "rgba(232,54,93,.45)" : C.border,
            color: discardedCount > 0 ? C.red : C.textDim,
          }}>
            ✗ {discardedCount}
          </div>
        </div>

        {/* Victory */}
        {allDone && (
          <div style={{ maxWidth:600, margin:"0 auto 12px", background:"rgba(0,201,167,.1)",
            border:`1px solid ${C.teal}`, borderRadius:12, padding:"18px 22px", textAlign:"center", animation:"popIn .5s" }}>
            <div style={{ fontSize:36 }}>{ resolvedCount/TOTAL >= 0.96 ? "🏆" : resolvedCount/TOTAL >= 0.84 ? "🎉" : resolvedCount/TOTAL >= 0.64 ? "😅" : "💀" }</div>
            <p style={{ fontFamily:"'Syne',sans-serif", color:C.teal, fontSize:18, margin:"8px 0 4px", fontWeight:800 }}>
              {game.endMessage || "…"}
            </p>
            <p style={{ fontFamily:"'DM Mono',monospace", color:C.grayLt, fontSize:12, margin:0 }}>
              {resolvedCount} correctas · {discardedCount} errores de {TOTAL}
            </p>
          </div>
        )}

        {/* Board */}
        <div style={{ maxWidth:600, margin:"0 auto", overflowX:"auto" }}>
          <table style={{ borderCollapse:"separate", borderSpacing:3, width:"100%", tableLayout:"fixed" }}>
            <colgroup>
              <col style={{ width:`${Math.round(100/(boardSize+1))}%` }} />
              {COLS.map(c => <col key={c} style={{ width:`${Math.round(100*boardSize/(boardSize+1)/boardSize)}%` }} />)}
            </colgroup>
            <thead>
              <tr>
                <td />
                {COLS.map(c => {
                  const isHit = myCol && String(myCol) === String(c);
                  return (
                    <th key={c} style={{ padding:0, fontWeight:"normal" }}>
                      <div style={{ background: isHit ? C.gold : C.card, border:`1px solid ${isHit ? C.gold : C.border}`, borderRadius:7, padding:"5px 2px", textAlign:"center", transition:"all .3s" }}>
                        <div style={{ fontFamily:"'Syne',sans-serif", color: isHit ? C.bg : C.teal, fontSize:14, fontWeight:800 }}>{c}</div>
                        <div style={{ color: isHit ? "rgba(0,0,0,.5)" : C.textDim, fontSize:8, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", padding:"0 2px" }}>{clues.cols[c]}</div>
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
                      <div style={{ background: isHit ? C.red : C.card, border:`1px solid ${isHit ? C.red : C.border}`, borderRadius:7, padding:"5px 4px", textAlign:"center", transition:"all .3s" }}>
                        <div style={{ fontFamily:"'Syne',sans-serif", color:"white", fontSize:14, fontWeight:800 }}>{r}</div>
                        <div style={{ color:"rgba(255,255,255,.4)", fontSize:8, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{clues.rows[r]}</div>
                      </div>
                    </td>
                    {COLS.map(c => {
                      const key = `${r}${c}`;
                      const val = resolved[key];
                      const isMyCoord  = me?.coord === key;
                      const isComplete = val && val !== "lost" && val !== "discarded";
                      const voteDots = [];
                      Object.entries(votes).forEach(([, vm]) => {
                        Object.entries(vm || {}).forEach(([vid, coord]) => {
                          if (coord === key && players[vid]) voteDots.push({ color: players[vid].color, name: players[vid].name });
                        });
                      });
                      return (
                        <td key={c} style={{ padding:0 }}>
                          <div className="board-cell" style={{
                            background: isComplete ? "rgba(0,201,167,.12)" : isMyCoord ? "rgba(245,166,35,.08)" : C.surface,
                            border:`1.5px solid ${isMyCoord && !isComplete ? C.gold : isComplete ? C.teal : C.border}`,
                            animation: isMyCoord && !isComplete ? "glow 2.5s infinite" : "none",
                          }}>
                            <div className="mono" style={{ fontSize:7, color: isComplete ? C.teal : isMyCoord ? C.gold : C.textDim }}>{key}</div>
                            {isComplete ? (
                              <>
                                <div style={{ fontSize:12, color:C.teal, fontWeight:700, textAlign:"center", wordBreak:"break-all", padding:"0 3px", lineHeight:1.2, marginTop:1 }}>{val.word}</div>
                                <div style={{ fontSize:7, color:C.textDim, marginTop:1 }}>{val.playerName}</div>
                              </>
                            ) : isMyCoord ? (
                              <div style={{ fontSize:20, color:C.gold }}>★</div>
                            ) : voteDots.length > 0 ? (
                              <div style={{ display:"flex", flexWrap:"wrap", gap:2, justifyContent:"center", padding:2 }}>
                                {voteDots.map((d, i) => <div key={i} title={d.name} style={{ width:7, height:7, borderRadius:"50%", background:d.color }} />)}
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

        {/* Players panel */}
        <div className="card" style={{ maxWidth:600, margin:"14px auto 0" }}>
          <div style={{ padding:"14px 16px 4px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div className="label">Jugadores · {playerList.length}</div>
            <div style={{ fontSize:11, color:C.teal, fontFamily:"'DM Mono',monospace" }}><span className="dot-live" />en vivo</div>
          </div>

          {playerList.map(([pid, player], idx) => {
            const isMe      = pid === myId;
            const voterMap  = votes[pid] || {};
            const otherPids = playerList.filter(([id]) => id !== pid);
            const allVoted  = otherPids.length > 0 && otherPids.every(([id]) => voterMap[id]);
            const coords    = Object.values(voterMap);
            const unanimous = allVoted && coords.length > 0 && coords.every(c => c === coords[0]);
            const pct       = otherPids.length > 0 ? (Object.keys(voterMap).length / otherPids.length) * 100 : 0;
            const canVote   = !isMe && player.wordPublished && !resolved[player.coord] && player.coord;
            const isGuessing= guessTarget === pid;
            const myVote    = voterMap[myId];

            return (
              <div key={pid}>
                <div style={{ padding:"0 16px" }}>
                  <div className={`player-row${canVote ? " clickable" : ""}${isGuessing ? " voting" : ""}`}
                    onClick={() => { if (!canVote) return; setGuessTarget(isGuessing ? null : pid); setGuessRow(""); setGuessCol(""); }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", flexShrink:0, background:`${player.color}1a`, border:`2px solid ${player.color}`,
                      display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:800, color:player.color }}>
                      {player.name[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:2 }}>
                        <span style={{ fontWeight:700, fontSize:13, color: isMe ? player.color : C.text }}>{player.name}</span>
                        {isMe && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, background:`${C.teal}1a`, color:C.teal, padding:"2px 7px", borderRadius:4 }}>YO</span>}
                        {player.wordPublished
                          ? <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15, color:player.color, background:`${player.color}15`, padding:"2px 10px", borderRadius:6 }}>{player.word}</span>
                          : player.coord
                            ? <span style={{ fontSize:11, color:C.textDim, fontStyle:"italic" }}>pensando…</span>
                            : <span style={{ fontSize:11, color:C.textDim }}>sin coord.</span>
                        }
                      </div>
                      {player.wordPublished && otherPids.length > 0 && (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:4 }}>
                          {otherPids.map(([vid, voter]) => {
                            const v = voterMap[vid];
                            return (
                              <span key={vid} className="vote-pill" style={{ color: v ? voter.color : C.textDim, background: v ? `${voter.color}12` : C.surface, borderColor: v ? `${voter.color}44` : C.border }}>
                                <span style={{ fontSize:9 }}>{voter.name.split(" ")[0]}</span><span>{v || "…"}</span>
                              </span>
                            );
                          })}
                          {allVoted && !unanimous && <span style={{ fontSize:11, color:C.gold, fontStyle:"italic", alignSelf:"center" }}>No hay acuerdo</span>}
                          {unanimous && <span style={{ fontSize:11, color:C.teal, fontWeight:700, alignSelf:"center", animation:"popIn .3s" }}>✓ Consenso: {coords[0]}</span>}
                        </div>
                      )}
                    </div>
                    {canVote && !isGuessing && (
                      <div style={{ flexShrink:0 }}>
                        {myVote
                          ? <span className="vote-pill" style={{ color:player.color, background:`${player.color}15`, borderColor:`${player.color}44` }}>{myVote} <span style={{ fontSize:9, opacity:.6 }}>✎</span></span>
                          : <span className="vote-pill" style={{ color:C.grayLt, background:C.surface, borderColor:C.border }}>Votar →</span>
                        }
                      </div>
                    )}
                  </div>

                  {player.wordPublished && otherPids.length > 1 && (
                    <div style={{ paddingLeft:45, paddingBottom:8 }}>
                      <div className="progress-bar"><div className="progress-fill" style={{ width:`${pct}%`, background:player.color }} /></div>
                    </div>
                  )}

                  {isGuessing && (
                    <div style={{ paddingLeft:45, paddingBottom:14, animation:"slideDown .2s" }}>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                        <select value={guessRow} onChange={e => { setGuessRow(e.target.value); setGuessCol(""); }} className="inp" style={{ flex:1, minWidth:110, padding:"8px 10px", fontSize:12 }}>
                          <option value="">Fila…</option>
                          {ROWS.map(r => <option key={r} value={r}>{r} — {clues.rows[r]}</option>)}
                        </select>
                        <select value={guessCol} onChange={e => setGuessCol(e.target.value)} className="inp" style={{ flex:1, minWidth:110, padding:"8px 10px", fontSize:12 }}>
                          <option value="">Col…</option>
                          {COLS.filter(c => {
                            if (!guessRow) return true;
                            const coord = `${guessRow}${c}`;
                            const v = resolved[coord];
                            return !v || v === "lost" || v === "discarded";
                          }).map(c => <option key={c} value={c}>{c} — {clues.cols[c]}</option>)}
                        </select>
                        <button className="btn" onClick={castVote} disabled={!guessRow || !guessCol}
                          style={{ background:player.color, color:"#07090f", whiteSpace:"nowrap" }}>Votar {guessRow}{guessCol}</button>
                      </div>
                    </div>
                  )}
                </div>
                {idx < playerList.length - 1 && <div style={{ height:1, background:C.border, margin:"0 16px" }} />}
              </div>
            );
          })}

          {me?.coord && !me?.wordPublished && !allDone && (
            <div style={{ padding:"14px 16px", borderTop:`1px solid ${C.border}`, background:"rgba(0,201,167,.03)", borderRadius:"0 0 14px 14px" }}>
              <div className="label" style={{ color:C.teal, marginBottom:6 }}>MI TURNO — COORDENADA {me.coord}</div>
              <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
                <span style={{ fontSize:11, fontWeight:600, background:`${C.red}22`, color:C.red, padding:"3px 10px", borderRadius:20 }}>{myRow}: {clues.rows[myRow]}</span>
                <span style={{ fontSize:11, fontWeight:600, background:`${C.teal}22`, color:C.teal, padding:"3px 10px", borderRadius:20 }}>{myCol}: {clues.cols[myCol]}</span>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <input className="inp" value={myWordInput} onChange={e => { setMyWordInput(e.target.value); setHintError(""); }}
                  onKeyDown={e => e.key === "Enter" && publishWord()}
                  placeholder="Tu palabra pista…" style={{ flex:1, fontSize:15 }} />
                <button className="btn" onClick={publishWord} disabled={!myWordInput.trim()} style={{ background:C.teal, color:"#07090f" }}>Publicar</button>
              </div>
              {hintError && <div style={{ fontSize:12, color:C.red, marginTop:6, fontFamily:"'Figtree',sans-serif" }}>⚠ {hintError}</div>}
            </div>
          )}
        </div>

        {/* ── Chat ── */}
        <div className="card" style={{ maxWidth:600, margin:"12px auto 0" }}>
          <div style={{ padding:"12px 16px 8px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:8 }}>
            <div className="label">💬 Chat</div>
            <span style={{ fontSize:10, color:C.textDim, fontFamily:"'DM Mono',monospace" }}>{chatMessages.filter(m => !m.system).length} mensajes</span>
          </div>

          <div className="chat-messages">
            {chatMessages.length === 0 && (
              <div style={{ color:C.textDim, fontSize:12, fontStyle:"italic", textAlign:"center", marginTop:70 }}>
                El chat está vacío. ¡Empezá la conversación!
              </div>
            )}
            {chatMessages.map(msg => (
              <div key={msg.id} className="chat-msg">
                {msg.system ? (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ height:1, flex:1, background:C.border }} />
                    <span style={{ fontSize:11, color:msg.color, fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap" }}>{msg.text}</span>
                    <div style={{ height:1, flex:1, background:C.border }} />
                  </div>
                ) : (
                  <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                    <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0,
                      background:`${msg.color}1a`, border:`1.5px solid ${msg.color}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontFamily:"'Syne',sans-serif", fontSize:12, fontWeight:800, color:msg.color }}>
                      {msg.name[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:2 }}>
                        <span style={{ fontSize:12, fontWeight:700, color:msg.color }}>{msg.name}</span>
                        <span style={{ fontSize:10, color:C.textDim, fontFamily:"'DM Mono',monospace" }}>{formatTime(msg.ts)}</span>
                      </div>
                      <div style={{ fontSize:13, color:C.text, lineHeight:1.45, wordBreak:"break-word" }}>{msg.text}</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="chat-input-row">
            <input className="chat-inp" value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendChat()}
              placeholder="Escribí un mensaje… (Enter para enviar)" />
            <button className="btn" onClick={sendChat} disabled={!chatInput.trim()}
              style={{ background:C.teal, color:"#07090f", padding:"8px 16px", fontSize:16 }}>→</button>
          </div>
        </div>

        {/* Legend */}
        <div style={{ maxWidth:600, margin:"12px auto 0", display:"flex", gap:16, flexWrap:"wrap" }}>
          {[{ color:C.gold, label:"★ Mi coordenada" }, { color:C.teal, label:"✓ Completada" }]
            .map(({ color, label }) => (
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
