
// ─── Config ───────────────────────────────────────────────────────────────────
const WS_BASE  = (location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host;
const API_BASE = location.protocol + "//" + location.host + "/api/v1";

// React hooks — must be available before any component is defined
const { useState, useEffect, useRef, useCallback, useReducer } = React;


// Safe Notification API wrapper — mobile Safari on HTTP throws SecurityError on access
function getNotifPermission() {
  try { return (typeof Notification !== "undefined") ? Notification.permission : "unsupported"; }
  catch(e) { return "unsupported"; }
}
function requestNotifPermission() {
  try {
    if (typeof Notification === "undefined") return Promise.resolve("unsupported");
    return Notification.requestPermission();
  } catch(e) { return Promise.resolve("unsupported"); }
}


// ─── Theme system ─────────────────────────────────────────────────────────────
// To add a new theme: add an entry to THEMES with the same keys.
const THEMES = {
  dark: {
    name:        "dark",
    label:       "KoreChat Dark",
    bg:          "#080f1e",
    bgSide:      "#090e1c",
    bgPanel:     "#0d1f38",
    bgInput:     "#0d1f38",
    bgInputWrap: "#090e1c",
    border:      "#ffffff07",
    borderMid:   "#ffffff0a",
    borderFaint: "#ffffff08",
    text:        "#c8d8f0",
    textBright:  "#e8f4ff",
    textDim:     "#8baac8",
    textFaint:   "#ffffff35",
    textGhost:   "#ffffff20",
    textMono:    "#ffffff45",
    accent:      "#7eb8f7",
    accentDim:   "#7eb8f720",
    accentBg:    "#7eb8f710",
    accentBg2:   "#7eb8f716",
    accentBg3:   "#7eb8f715",
    green:       "#4af7a0",
    greenBg:     "#4af7a010",
    greenBorder: "#4af7a025",
    amber:       "#f7d07e",
    amberBg:     "#f7d07e10",
    amberBorder: "#f7d07e20",
    red:         "#f7a07e",
    redBg:       "#f7a07e14",
    redBorder:   "#f7a07e40",
    msgHover:    "#ffffff05",
    mentionBg:   "#f7a07e07",
    mentionBg2:  "#f7a07e0d",
    mentionBdr:  "#f7a07e44",
    scrollThumb: "#ffffff18",
    fontSize:    14,
  },
  light: {
    name:        "light",
    label:       "KoreChat Light",
    bg:          "#f0f4fa",
    bgSide:      "#e4ecf7",
    bgPanel:     "#ffffff",
    bgInput:     "#ffffff",
    bgInputWrap: "#e8eef8",
    border:      "#d0daea",
    borderMid:   "#ccd6e8",
    borderFaint: "#d8e2f0",
    text:        "#2a3a54",
    textBright:  "#0d1e36",
    textDim:     "#4a6080",
    textFaint:   "#8098b8",
    textGhost:   "#a0b0c8",
    textMono:    "#7090b0",
    accent:      "#2a7fce",
    accentDim:   "#2a7fce25",
    accentBg:    "#2a7fce10",
    accentBg2:   "#2a7fce16",
    accentBg3:   "#2a7fce12",
    green:       "#1a9e5c",
    greenBg:     "#1a9e5c10",
    greenBorder: "#1a9e5c30",
    amber:       "#b07000",
    amberBg:     "#b0700010",
    amberBorder: "#b0700025",
    red:         "#c04020",
    redBg:       "#c0402010",
    redBorder:   "#c0402040",
    msgHover:    "#00000005",
    mentionBg:   "#c0402007",
    mentionBg2:  "#c040200e",
    mentionBdr:  "#c0402045",
    scrollThumb: "#00000015",
    fontSize:    14,
  },
  newmorning: {
    name:        "newmorning",
    label:       "New Morning",
    bg:          "#303e4a",
    bgSide:      "#28333d",
    bgPanel:     "#242a33",
    bgInput:     "#242a33",
    bgInputWrap: "#28333d",
    border:      "#28333d",
    borderMid:   "#28333d",
    borderFaint: "#2e3a44",
    text:        "#f3f3f3",
    textBright:  "#ffffff",
    textDim:     "#b7c5d1",
    textFaint:   "#adbbc7",
    textGhost:   "#7a8fa0",
    textMono:    "#99a2b4",
    accent:      "#77abd9",
    accentDim:   "#77abd930",
    accentBg:    "#77abd915",
    accentBg2:   "#77abd922",
    accentBg3:   "#77abd918",
    green:       "#97ea70",
    greenBg:     "#97ea7012",
    greenBorder: "#97ea7030",
    amber:       "#f39c12",
    amberBg:     "#f39c1215",
    amberBorder: "#f39c1235",
    red:         "#f92772",
    redBg:       "#f9277215",
    redBorder:   "#f9277240",
    msgHover:    "#ffffff06",
    mentionBg:   "#4d433280",
    mentionBg2:  "#4d4332aa",
    mentionBdr:  "#f39c12cc",
    scrollThumb: "#b7c5d140",
    fontSize:    14,
  },
  solarized: {
    name:        "solarized",
    label:       "Solarized Dark",
    bg:          "#002b36",
    bgSide:      "#073642",
    bgPanel:     "#073642",
    bgInput:     "#073642",
    bgInputWrap: "#002b36",
    border:      "#586e7520",
    borderMid:   "#586e7530",
    borderFaint: "#586e7518",
    text:        "#839496",
    textBright:  "#eee8d5",
    textDim:     "#657b83",
    textFaint:   "#586e75",
    textGhost:   "#586e7580",
    textMono:    "#93a1a1",
    accent:      "#268bd2",
    accentDim:   "#268bd230",
    accentBg:    "#268bd215",
    accentBg2:   "#268bd225",
    accentBg3:   "#268bd218",
    green:       "#859900",
    greenBg:     "#85990015",
    greenBorder: "#85990030",
    amber:       "#b58900",
    amberBg:     "#b5890015",
    amberBorder: "#b5890030",
    red:         "#dc322f",
    redBg:       "#dc322f15",
    redBorder:   "#dc322f40",
    msgHover:    "#ffffff04",
    mentionBg:   "#dc322f0a",
    mentionBg2:  "#dc322f14",
    mentionBdr:  "#dc322f50",
    scrollThumb: "#586e7540",
    fontSize:    14,
  },
  dracula: {
    name:        "dracula",
    label:       "Dracula",
    bg:          "#282a36",
    bgSide:      "#21222c",
    bgPanel:     "#1e1f29",
    bgInput:     "#1e1f29",
    bgInputWrap: "#21222c",
    border:      "#44475a40",
    borderMid:   "#44475a60",
    borderFaint: "#44475a30",
    text:        "#f8f8f2",
    textBright:  "#ffffff",
    textDim:     "#bd93f9",
    textFaint:   "#6272a4",
    textGhost:   "#44475a",
    textMono:    "#8be9fd",
    accent:      "#bd93f9",
    accentDim:   "#bd93f930",
    accentBg:    "#bd93f915",
    accentBg2:   "#bd93f922",
    accentBg3:   "#bd93f918",
    green:       "#50fa7b",
    greenBg:     "#50fa7b12",
    greenBorder: "#50fa7b30",
    amber:       "#ffb86c",
    amberBg:     "#ffb86c12",
    amberBorder: "#ffb86c30",
    red:         "#ff5555",
    redBg:       "#ff555515",
    redBorder:   "#ff555540",
    msgHover:    "#ffffff04",
    mentionBg:   "#ff555510",
    mentionBg2:  "#ff55551a",
    mentionBdr:  "#ff5555aa",
    scrollThumb: "#6272a440",
    fontSize:    14,
  },
};
const _savedTheme = sessionStorage.getItem("kc_theme") || "dark";
const ThemeCtx = React.createContext(THEMES[_savedTheme] || THEMES.dark);
function useTheme() { return React.useContext(ThemeCtx); }

// ─── IRCv3 Parser ─────────────────────────────────────────────────────────────
function parseIRC(raw) {
  let pos = 0;
  const msg = { tags: {}, prefix: "", command: "", params: [] };
  if (raw[pos] === "@") {
    pos++;
    const end = raw.indexOf(" ", pos);
    if (end === -1) return msg;
    raw.slice(pos, end).split(";").forEach(t => {
      const eq = t.indexOf("=");
      const k = eq === -1 ? t : t.slice(0, eq);
      const v = eq === -1 ? "" : t.slice(eq + 1)
        .replace(/\\:/g,";").replace(/\\s/g," ")
        .replace(/\\r/g,"\r").replace(/\\n/g,"\n").replace(/\\\\/g,"\\");
      if (k) msg.tags[k] = v;
    });
    pos = end + 1;
  }
  if (raw[pos] === ":") {
    pos++;
    const end = raw.indexOf(" ", pos);
    if (end === -1) { msg.prefix = raw.slice(pos); return msg; }
    msg.prefix = raw.slice(pos, end);
    pos = end + 1;
  }
  const ce = raw.indexOf(" ", pos);
  if (ce === -1) { msg.command = raw.slice(pos).toUpperCase(); return msg; }
  msg.command = raw.slice(pos, ce).toUpperCase();
  pos = ce + 1;
  while (pos < raw.length) {
    if (raw[pos] === ":") { msg.params.push(raw.slice(pos + 1)); break; }
    const end = raw.indexOf(" ", pos);
    if (end === -1) { msg.params.push(raw.slice(pos)); break; }
    msg.params.push(raw.slice(pos, end));
    pos = end + 1;
  }
  return msg;
}

function nickOf(prefix) {
  if (!prefix) return "";
  const i = prefix.indexOf("!");
  return i === -1 ? prefix : prefix.slice(0, i);
}

// ─── Networks REST API ────────────────────────────────────────────────────────
const API = {
  listNetworks:      ()     => fetch(`${API_BASE}/networks`,{credentials:"include"}).then(r => r.json()),
  createNetwork:     (b)    => fetch(`${API_BASE}/networks`, {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(b), credentials:"include"
  }).then(r => r.json()),
  deleteNetwork:     (id)   => fetch(`${API_BASE}/networks/${id}`, { method:"DELETE", credentials:"include" }),
  updateNetwork:     (id,b) => fetch(`${API_BASE}/networks/${id}`, {
    method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(b), credentials:"include"
  }).then(r => r.json()),
  disconnectNetwork: (id)   => fetch(`${API_BASE}/networks/${id}/disconnect`, { method:"POST", credentials:"include" }),
  connectNetwork:    (id)   => fetch(`${API_BASE}/networks/${id}/connect`,    { method:"POST", credentials:"include" }),
  updateProfile:     (b)    => fetch(`${API_BASE.replace("/networks","")}/profile`, {
    method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(b), credentials:"include"
  }).then(r => r.json()),
  uploadAvatar:      (file) => {
    const fd = new FormData(); fd.append("avatar", file);
    return fetch(`${API_BASE.replace("/networks","")}/profile/avatar`, {
      method:"POST", body:fd, credentials:"include"
    }).then(r => r.json());
  },
  getAvatarByUsername: (username) => fetch(`${API_BASE.replace("/networks","")}/users/avatar/${encodeURIComponent(username)}`, {
    credentials:"include"
  }).then(r => r.ok ? r.json() : null),
};

// ─── WebSocket factory ────────────────────────────────────────────────────────
function openWS({ networkId, onLine, onClose }) {
  const url = `${WS_BASE}/ws?network=${networkId}`;
  const ws  = new WebSocket(url);
  let dead  = false;

  // Send an application-level data frame every 4 minutes so nginx's
  // proxy_read_timeout is reset by real traffic, not just WS control frames.
  // The BNC forwards this as a PING to the IRC server, which is harmless.
  const heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(`PING :kc-heartbeat\r\n`);
    }
  }, 4 * 60 * 1000);

  ws.onmessage = e => e.data.split("\n").forEach(l => { l = l.trimEnd(); if (l) onLine(l); });
  ws.onclose   = () => { clearInterval(heartbeatInterval); if (!dead) onClose?.(); };
  ws.onerror   = () => {};
  return {
    send:        (raw) => { if (ws.readyState === WebSocket.OPEN) ws.send(raw + "\r\n"); },
    close:       ()    => { dead = true; clearInterval(heartbeatInterval); ws.close(); },
    get ready()        { return ws.readyState === WebSocket.OPEN; },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }); }
  catch { return ""; }
}
function nickColor(nick) {
  const p = ["#7eb8f7","#f7a07e","#a0f77e","#f7d07e","#d07ef7","#7ef7d0","#f77ea0","#7ea0f7","#f7f77e","#f77ef7"];
  let h = 0;
  for (let i = 0; i < nick.length; i++) h = (h * 31 + nick.charCodeAt(i)) & 0x7fffffff;
  return p[h % p.length];
}
function renderText(text, myNick, T) {
  if (!text) return "";
  const accent  = T?.accent || "#7eb8f7";
  const red     = T?.red    || "#f7a07e";
  // Strip IRC formatting control characters before rendering:
  // \x03 = color (optional fg,bg digits follow), \x02 bold, \x1D italic,
  // \x1F underline, \x16 reverse, \x11 monospace, \x0F reset
  text = text
    .replace(/\x03(\d{1,2}(,\d{1,2})?)?/g, "")
    .replace(/[\x02\x1D\x1F\x16\x11\x0F]/g, "");
  const URL_RE = /(https?:\/\/[^\s<>"]+)/g;
  const parts = []; let key = 0, last = 0, m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    parts.push(<a key={key++} href={m[1]} target="_blank" rel="noreferrer"
      style={{color:accent,textDecoration:"underline dotted"}}>{m[1]}</a>);
    last = m.index + m[1].length;
  }
  const rest = text.slice(last);
  if (rest) {
    const mp = []; let ml = 0, mm; const MR = /@(\w+)/g;
    while ((mm = MR.exec(rest)) !== null) {
      if (mm.index > ml) mp.push(<span key={key++}>{rest.slice(ml, mm.index)}</span>);
      const isMe = mm[1] === myNick;
      mp.push(<mark key={key++} style={{background:isMe?red+"22":accent+"22",
        color:isMe?red:accent,borderRadius:3,padding:"0 3px"}}>{mm[0]}</mark>);
      ml = mm.index + mm[0].length;
    }
    if (ml < rest.length) mp.push(<span key={key++}>{rest.slice(ml)}</span>);
    parts.push(...mp);
  }
  return parts.length ? parts : text;
}

const CHAN_KEY    = (netId, chan) => `${netId}::${chan}`;
const STATUS_CHAN = "__status__";

// ─── Reducer ──────────────────────────────────────────────────────────────────
const INIT = {
  networks:{}, networkOrder:[],
  channels:{}, messages:{}, unread:{},
  activeNet:null, activeChan:{}, myNick:{},
  seenMsgIds:{}, // msgid→true for dedup of server history replay
};

function reducer(s, a) {
  switch (a.type) {
    case "NET_ADD":
      return { ...s,
        networks: { ...s.networks, [a.net.id]: { ...a.net, status: a.net.status||"disconnected" } },
        networkOrder: s.networkOrder.includes(a.net.id) ? s.networkOrder : [...s.networkOrder, a.net.id],
      };
    case "NET_UPDATE":
      if (!s.networks[a.net.id]) return s;
      return { ...s, networks: { ...s.networks, [a.net.id]: { ...s.networks[a.net.id], ...a.net } } };
    case "NET_REMOVE": {
      const nets2={...s.networks}; delete nets2[a.id];
      const order2=s.networkOrder.filter(x=>x!==a.id);
      const chans2=Object.fromEntries(Object.entries(s.channels).filter(([k])=>!k.startsWith(a.id+"::")));
      const msgs2=Object.fromEntries(Object.entries(s.messages).filter(([k])=>!k.startsWith(a.id+"::")));
      const unr2=Object.fromEntries(Object.entries(s.unread).filter(([k])=>!k.startsWith(a.id+"::")));
      const ac2={...s.activeChan}; delete ac2[a.id];
      return { ...s, networks:nets2, networkOrder:order2, channels:chans2, messages:msgs2, unread:unr2, activeChan:ac2,
        activeNet: s.activeNet===a.id?(order2[0]||null):s.activeNet };
    }
    case "NET_STATUS": {
      if (!s.networks[a.id]) return s;
      return { ...s, networks: { ...s.networks, [a.id]: { ...s.networks[a.id], status:a.status, status_msg:a.msg||"" } } };
    }
    case "NET_DEL": {
      const nets={...s.networks}; delete nets[a.id];
      const order=s.networkOrder.filter(x=>x!==a.id);
      const channels=Object.fromEntries(Object.entries(s.channels).filter(([k])=>!k.startsWith(a.id+"::")));
      const messages=Object.fromEntries(Object.entries(s.messages).filter(([k])=>!k.startsWith(a.id+"::")));
      const unread  =Object.fromEntries(Object.entries(s.unread  ).filter(([k])=>!k.startsWith(a.id+"::")));
      const activeChan={...s.activeChan}; delete activeChan[a.id];
      return { ...s, networks:nets, networkOrder:order, channels, messages, unread, activeChan,
        activeNet: s.activeNet===a.id?(order[0]||null):s.activeNet };
    }
    case "SET_NICK":        return { ...s, myNick:{...s.myNick,[a.netId]:a.nick} };
    case "SET_ACTIVE_NET":  return { ...s, activeNet:a.id };
    case "SET_ACTIVE_CHAN": return { ...s, activeChan:{...s.activeChan,[a.netId]:a.chan} };
    case "CHAN_JOIN": {
      const k=CHAN_KEY(a.netId,a.chan);
      const existing = s.channels[k] || {topic:"",members:{}};
      return { ...s,
        channels:   {...s.channels,  [k]: {...existing, left:false}},
        messages:   {...s.messages,  [k]: s.messages[k]  || []},
        unread:     {...s.unread,    [k]: s.unread[k]    || 0},
        activeChan: s.activeChan[a.netId] ? s.activeChan : {...s.activeChan,[a.netId]:a.chan},
        activeNet:  s.activeNet || a.netId,
      };
    }
    case "CHAN_PART": {
      const k=CHAN_KEY(a.netId,a.chan);
      // Keep the channel in state (preserving history) but mark it as left.
      // CHAN_PART_REMOVE (used when user explicitly closes it) actually removes it.
      const channels={...s.channels, [k]:{...s.channels[k], left:true, members:{}}};
      const unread  ={...s.unread, [k]:0};
      const rem=Object.keys(s.channels).filter(x=>x.startsWith(a.netId+"::") && x!==k);
      const newChan=rem.length ? rem[rem.length-1].split("::")[1] : STATUS_CHAN;
      return { ...s, channels, unread, activeChan:{...s.activeChan,[a.netId]:newChan} };
    }
    case "CHAN_REJOIN": {
      const k=CHAN_KEY(a.netId,a.chan);
      if (!s.channels[k]) return s;
      return { ...s, channels:{...s.channels,[k]:{...s.channels[k],left:false,members:{}}} };
    }
    case "CHAN_PART_REMOVE": {
      const k=CHAN_KEY(a.netId,a.chan);
      const channels={...s.channels}; delete channels[k];
      const messages={...s.messages}; delete messages[k];
      const unread  ={...s.unread};   delete unread[k];
      const rem=Object.keys(channels).filter(x=>x.startsWith(a.netId+"::"));
      const newChan=rem.length ? rem[rem.length-1].split("::")[1] : null;
      return { ...s, channels, messages, unread, activeChan:{...s.activeChan,[a.netId]:newChan} };
    }
    case "SET_TOPIC": {
      const k=CHAN_KEY(a.netId,a.chan);
      if (!s.channels[k]) return s;
      return { ...s, channels:{...s.channels,[k]:{...s.channels[k],topic:a.topic}} };
    }
    case "SET_MEMBERS": {
      const k=CHAN_KEY(a.netId,a.chan);
      return { ...s, channels:{...s.channels,[k]:{...(s.channels[k]||{topic:""}),
        members:{...(s.channels[k]?.members||{}),...a.members}}} };
    }
    case "REPLACE_MEMBERS": {
      // Atomically replace the full member list (called on 366 end-of-names)
      const k=CHAN_KEY(a.netId,a.chan);
      return { ...s, channels:{...s.channels,[k]:{...(s.channels[k]||{topic:""}),
        members:a.members}} };
    }
    case "SET_MEMBER_PREFIX": {
      // Update a single member's prefix (e.g. MODE +o/-o)
      const k=CHAN_KEY(a.netId,a.chan);
      if (!s.channels[k]?.members) return s;
      const members={...s.channels[k].members};
      if (!(a.nick in members)) return s; // nick not in list, ignore
      members[a.nick]=a.prefix;
      return { ...s, channels:{...s.channels,[k]:{...s.channels[k],members}} };
    }
    case "DEL_MEMBER": {
      const k=CHAN_KEY(a.netId,a.chan);
      if (!s.channels[k]) return s;
      const members={...s.channels[k].members}; delete members[a.nick];
      return { ...s, channels:{...s.channels,[k]:{...s.channels[k],members}} };
    }
    case "ADD_MSG": {
      const k=CHAN_KEY(a.netId,a.chan);
      // Deduplicate by msgid — prevents server history replay from re-adding
      // messages already in our ring buffer or already shown this session
      if (a.msg.id && s.seenMsgIds[a.msg.id]) return s;
      const msgs=[...(s.messages[k]||[]),a.msg].slice(-1000);
      const isActive=s.activeNet===a.netId&&s.activeChan[a.netId]===a.chan;
      return { ...s,
        messages:   {...s.messages,  [k]:msgs},
        seenMsgIds: a.msg.id ? {...s.seenMsgIds, [a.msg.id]:true} : s.seenMsgIds,
        unread:     {...s.unread,    [k]:isActive?0:(s.unread[k]||0)+1},
      };
    }
    case "PREPEND_MSGS": {
      // Insert historical messages before existing ones, deduplicating by id
      // and by content fingerprint (catches BNC replay msgs with random IDs
      // that duplicate log entries).
      const k=CHAN_KEY(a.netId,a.chan);
      const existing=s.messages[k]||[];
      let newSeen={...s.seenMsgIds};
      // Build a fingerprint set from existing messages for content-based dedup
      const existingFps=new Set(existing.map(m=>{
        const t=m.time?new Date(m.time).toISOString().slice(0,16):""; // minute precision
        return `${m.nick}|${t}|${(m.text||"").slice(0,40)}`;
      }));
      const fresh=a.msgs.filter(m=>{
        if (m.id && newSeen[m.id]) return false;
        if (m.id) newSeen[m.id]=true;
        // Content fingerprint dedup
        const t=m.time?new Date(m.time).toISOString().slice(0,16):"";
        const fp=`${m.nick}|${t}|${(m.text||"").slice(0,40)}`;
        if (existingFps.has(fp)) return false;
        existingFps.add(fp);
        return true;
      });
      if (!fresh.length) return s;
      // Sort combined chronologically; use original index as tiebreaker for same-timestamp msgs
      const combined=[...fresh,...existing]
        .sort((a,b)=>{
          const td=new Date(a.time)-new Date(b.time);
          return td !== 0 ? td : 0;
        })
        .slice(-1000);
      return { ...s,
        messages:   {...s.messages,  [k]:combined},
        seenMsgIds: newSeen,
      };
    }
    case "SORT_MSGS": {
      // Sort all message arrays for a network chronologically after BNC replay.
      const prefix = a.netId + "::";
      const updated = {...s.messages};
      Object.keys(updated).forEach(k => {
        if (k.startsWith(prefix)) {
          updated[k] = [...updated[k]].sort((a,b) => new Date(a.time) - new Date(b.time));
        }
      });
      return { ...s, messages: updated };
    }
    case "CLEAR_UNREAD": {
      const k=CHAN_KEY(a.netId,a.chan);
      return { ...s, unread:{...s.unread,[k]:0} };
    }
    default: return s;
  }
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
// Avatar cache: nick → {url, ts}
// url=null means "no avatar found" but will retry after TTL
const _avatarCache = {};
const AVATAR_HIT_TTL  = 300_000; // 5 min for successful hits
const AVATAR_MISS_TTL =  30_000; // 30 sec retry for misses

function useAvatar(nick) {
  const [url, setUrl] = React.useState(() => _avatarCache[nick]?.url ?? undefined);
  React.useEffect(() => {
    if (!nick) return;
    const cached = _avatarCache[nick];
    const ttl = cached?.url ? AVATAR_HIT_TTL : AVATAR_MISS_TTL;
    // Fetch if: never fetched, or cache was deleted (undefined), or TTL expired
    if (cached === undefined || (Date.now() - (cached.ts || 0) > ttl)) {
      API.getAvatarByUsername(nick).then(data => {
        const avatarUrl = data?.avatar_url || null;
        _avatarCache[nick] = { url: avatarUrl, ts: Date.now() };
        setUrl(avatarUrl);
      }).catch(() => {
        _avatarCache[nick] = { url: null, ts: Date.now() };
        setUrl(null);
      });
    } else if (cached.url !== url) {
      // Cache has a value but state is stale (e.g. after bust+re-fetch in another component)
      setUrl(cached.url);
    }
  }, [nick]);
  return url;
}

function Avatar({ nick, size=28 }) {
  const c = nickColor(nick);
  const avatarUrl = useAvatar(nick);
  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={nick}
        style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0,
          border:`1.5px solid ${c}44`}}
        onError={e => { _avatarCache[nick] = { url: null, ts: Date.now() }; e.target.style.display="none"; }}
      />
    );
  }
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:c+"18",border:`1.5px solid ${c}33`,
      display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.44,
      fontWeight:700,color:c,flexShrink:0,fontFamily:"'JetBrains Mono',monospace"}}>
      {(nick[0]||"?").toUpperCase()}
    </div>
  );
}

// ─── StatusDot ────────────────────────────────────────────────────────────────
function StatusDot({ status }) {
  const T=useTheme();
  const C={connected:T.green,connecting:T.amber,disconnected:T.textGhost,error:T.red};
  const G={connected:`0 0 6px ${T.green}88`,connecting:`0 0 6px ${T.amber}66`};
  const c=C[status]||C.disconnected;
  return <div style={{width:7,height:7,borderRadius:"50%",background:c,boxShadow:G[status]||"none",flexShrink:0}} />;
}

// ─── Message row ──────────────────────────────────────────────────────────────
// DaySeparator: horizontal rule with date label between messages from different days
function DaySeparator({ label }) {
  const T=useTheme();
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px 6px",userSelect:"none"}}>
      <div style={{flex:1,height:1,background:T.border}}/>
      <span style={{fontSize:11,color:T.textFaint,fontFamily:"'JetBrains Mono',monospace",
        fontWeight:500,letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{label}</span>
      <div style={{flex:1,height:1,background:T.border}}/>
    </div>
  );
}

// MembershipGroup: collapsible block for consecutive join/part/quit/kick events.
// Always collapsed by default — click the summary line to expand.
function MembershipGroup({ msgs }) {
  const T=useTheme();
  const [open, setOpen] = useState(false);
  if (msgs.length === 0) return null;

  // Build a compact summary: "→ alice, ← bob, ✕ carol"
  const summary = msgs.map(m => m.text).join("  ·  ");
  const label = msgs.length === 1
    ? msgs[0].text
    : `${msgs.length} membership events`;

  return (
    <div style={{padding:"0 16px 0 58px",userSelect:"none"}}>
      {open ? (
        <div style={{borderLeft:`2px solid ${T.borderFaint}`,paddingLeft:8,margin:"2px 0"}}>
          {msgs.map((m,i) => (
            <div key={i} style={{display:"flex",alignItems:"baseline",gap:8,padding:"1px 0"}}>
              <span style={{fontSize:12,color:T.textFaint,fontStyle:"italic",
                fontFamily:"'JetBrains Mono',monospace",flex:1,userSelect:"text"}}>{m.text}</span>
              {m.time&&<span style={{fontSize:10,color:T.textFaint,
                fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{fmtTime(m.time)}</span>}
            </div>
          ))}
          <span onClick={()=>setOpen(false)}
            style={{fontSize:10,color:T.textFaint,cursor:"pointer",
              fontFamily:"'JetBrains Mono',monospace",fontStyle:"italic",userSelect:"none",
              display:"inline-block",marginTop:1}}
            onMouseEnter={e=>e.currentTarget.style.color=T.textDim}
            onMouseLeave={e=>e.currentTarget.style.color=T.textFaint}>
            ▲ hide
          </span>
        </div>
      ) : (
        <span onClick={()=>setOpen(true)}
          title={summary}
          style={{fontSize:11,color:T.textFaint,cursor:"pointer",
            fontFamily:"'JetBrains Mono',monospace",fontStyle:"italic",userSelect:"none",
            display:"inline-block",padding:"1px 0"}}
          onMouseEnter={e=>e.currentTarget.style.color=T.textDim}
          onMouseLeave={e=>e.currentTarget.style.color=T.textFaint}>
          ▶ {label}
        </span>
      )}
    </div>
  );
}

function MsgRow({ msg, prev, myNick, onNickClick }) {
  const T=useTheme();
  if (msg.type==="system") return (
    <div style={{padding:"2px 16px 2px 58px",userSelect:"text"}}>
      <span style={{fontSize:13,color:T.textDim,fontStyle:"italic",fontFamily:"'JetBrains Mono',monospace"}}>{msg.text}</span>
      {msg.time&&<span style={{fontSize:11,color:T.textDim,marginLeft:6,fontFamily:"'JetBrains Mono',monospace"}}>{fmtTime(msg.time)}</span>}
    </div>
  );
  const cont=prev?.type==="message"&&prev.nick===msg.nick&&(new Date(msg.time)-new Date(prev.time))<300000;
  const mentioned=msg.nick!==myNick&&msg.text?.includes("@"+myNick);
  return (
    <div style={{display:"flex",gap:12,padding:cont?"2px 16px":"8px 16px 3px",
      background:mentioned?T.mentionBg:"transparent",
      borderLeft:mentioned?`2px solid ${T.mentionBdr}`:"2px solid transparent"}}
      onMouseEnter={e=>e.currentTarget.style.background=mentioned?T.mentionBg2:T.msgHover}
      onMouseLeave={e=>e.currentTarget.style.background=mentioned?T.mentionBg:"transparent"}>
      <div style={{width:32,flexShrink:0,paddingTop:cont?0:2,cursor:msg.nick?"pointer":"default"}}
        onClick={e=>{if(msg.nick&&onNickClick){e.stopPropagation();onNickClick(msg.nick,e);}}}>
        {!cont&&<Avatar nick={msg.nick} size={32}/>}
      </div>
      <div style={{flex:1,minWidth:0,userSelect:"text"}}>
        {!cont&&(
          <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:2}}>
            <span style={{fontWeight:700,fontSize:14,color:nickColor(msg.nick),fontFamily:"'JetBrains Mono',monospace",
              cursor:"pointer"}}
              onClick={e=>{if(onNickClick){e.stopPropagation();onNickClick(msg.nick,e);}}}
              onContextMenu={e=>{if(onNickClick){e.preventDefault();onNickClick(msg.nick,e);}}}
            >{msg.nick}</span>
            <span style={{fontSize:11,color:T.textDim,fontFamily:"'JetBrains Mono',monospace"}}>{fmtTime(msg.time)}</span>
          </div>
        )}
        <div style={{fontSize:15,color:T.text,lineHeight:1.6,wordBreak:"break-word"}}>
          {renderText(msg.text,myNick,T)}
        </div>
      </div>
    </div>
  );
}

// ─── Network Settings Modal ───────────────────────────────────────────────────
function NetworkSettingsModal({ net, onClose, onSaved, onDelete }) {
  const T = useTheme();
  const MONO = { fontFamily:"'JetBrains Mono',monospace" };
  const [form, setForm] = useState({
    name:           net.name       || "",
    host:           net.host       || "",
    port:           String(net.port || 6667),
    tls:            net.tls        || false,
    nick:           net.nick       || "",
    alt_nick:       net.alt_nick   || "",
    username:       net.username   || "",
    realname:       net.realname   || "",
    password:       net.password   || "",
    auto_join:      (net.auto_join||[]).join(", "),
    sasl_mechanism: net.sasl_mechanism || "",
    sasl_username:  net.sasl_username  || "",
    sasl_password:  net.sasl_password  || "",
    on_connect:     net.on_connect  || [],  // array of raw IRC commands
  });
  const [newCmd, setNewCmd] = useState("");
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr]         = useState("");

  const set = k => e => setForm(f => ({...f, [k]: e.target.value}));

  const IS = { width:"100%", padding:"8px 10px", borderRadius:5, fontSize:13,
    background:T.bgPanel, border:`1px solid ${T.border}`, color:T.text,
    fontFamily:"'Inter var','Inter',sans-serif", outline:"none", boxSizing:"border-box" };
  const LS = { display:"block", fontSize:11, color:T.textDim, marginBottom:4,
    fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.05em" };

  const save = async () => {
    setErr(""); setSaving(true);
    try {
      const body = {
        name:           form.name.trim(),
        host:           form.host.trim(),
        port:           parseInt(form.port)||6667,
        tls:            form.tls,
        nick:           form.nick.trim(),
        alt_nick:       form.alt_nick.trim() || form.nick.trim()+"_",
        username:       form.username.trim() || form.nick.trim(),
        realname:       form.realname.trim() || form.nick.trim(),
        password:       form.password,
        auto_join:      form.auto_join ? form.auto_join.split(",").map(s=>s.trim()).filter(Boolean) : [],
        on_connect:     form.on_connect,
        sasl_mechanism: form.sasl_mechanism,
        sasl_username:  form.sasl_username.trim(),
        sasl_password:  form.sasl_password,
      };
      const updated = await API.updateNetwork(net.id, body);
      if (updated.error) { setErr(updated.error); return; }
      onSaved(updated);
    } catch(e) { setErr(String(e)); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!confirm(`Delete "${net.name}"? This will disconnect and remove it permanently.`)) return;
    setDeleting(true);
    try { await API.deleteNetwork(net.id); onDelete(net.id); }
    catch(e) { setErr(String(e)); setDeleting(false); }
  };

  const overlay = { position:"fixed",inset:0,background:"#00000088",zIndex:200,
    display:"flex",alignItems:"center",justifyContent:"center" };
  const box = { background:T.bgPanel,border:`1px solid ${T.border}`,borderRadius:10,
    width:520,maxHeight:"88vh",overflowY:"auto",padding:24,boxShadow:"0 8px 40px #0008" };

  return (
    <div style={overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={box}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <span style={{...MONO,fontWeight:700,fontSize:15,color:T.textBright}}>
            ⚙ {net.name} — Settings
          </span>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.textDim,
            fontSize:18,cursor:"pointer",padding:"0 4px",lineHeight:1}}>✕</button>
        </div>

        {err&&<div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:5,
          padding:"8px 12px",color:T.red,fontSize:12,marginBottom:14,...MONO}}>{err}</div>}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {/* Name */}
          <div style={{gridColumn:"1/-1"}}>
            <label style={LS}>Network Name</label>
            <input value={form.name} onChange={set("name")} style={IS} />
          </div>

          {/* Host + Port/TLS */}
          <div>
            <label style={LS}>Server Host</label>
            <input value={form.host} onChange={set("host")} style={IS} />
          </div>
          <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
            <div style={{flex:1}}>
              <label style={LS}>Port</label>
              <input value={form.port} onChange={set("port")} type="number" style={IS} />
            </div>
            <div>
              <label style={LS}>TLS</label>
              <button onClick={()=>setForm(f=>({...f,tls:!f.tls,port:!f.tls?"6697":f.port==="6697"?"6667":f.port}))}
                style={{...IS,width:"auto",padding:"8px 14px",cursor:"pointer",
                  background:form.tls?T.greenBg:T.bg,
                  border:`1px solid ${form.tls?T.green:T.border}`,
                  color:form.tls?T.green:T.textDim,fontWeight:form.tls?700:400}}>
                {form.tls?"🔒 ON":"🔓 OFF"}
              </button>
            </div>
          </div>

          {/* Identity */}
          <div>
            <label style={LS}>Nickname</label>
            <input value={form.nick} onChange={set("nick")} style={IS} />
          </div>
          <div>
            <label style={LS}>Alt Nickname</label>
            <input value={form.alt_nick} onChange={set("alt_nick")} style={IS} />
          </div>
          <div>
            <label style={LS}>Username</label>
            <input value={form.username} onChange={set("username")} style={IS} />
          </div>
          <div>
            <label style={LS}>Real Name</label>
            <input value={form.realname} onChange={set("realname")} style={IS} />
          </div>

          {/* Server password */}
          <div style={{gridColumn:"1/-1"}}>
            <label style={LS}>Server Password <span style={{opacity:0.6}}>(optional)</span></label>
            <input value={form.password} onChange={set("password")} type="password"
              placeholder="Leave blank if not required" style={IS} />
          </div>

          {/* Auto-join */}
          <div style={{gridColumn:"1/-1"}}>
            <label style={LS}>Auto-join Channels <span style={{opacity:0.6}}>(comma separated)</span></label>
            <input value={form.auto_join} onChange={set("auto_join")}
              placeholder="#linux, #python, #chat" style={IS} />
          </div>

          {/* SASL */}
          <div style={{gridColumn:"1/-1",borderTop:`1px solid ${T.borderFaint}`,paddingTop:12,marginTop:2}}>
            <div style={{...LS,marginBottom:8}}>SASL Authentication <span style={{opacity:0.6}}>(optional)</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div style={{gridColumn:"1/-1"}}>
                <label style={LS}>Mechanism</label>
                <select value={form.sasl_mechanism} onChange={set("sasl_mechanism")}
                  style={{...IS,cursor:"pointer"}}>
                  <option value="">Disabled</option>
                  <option value="PLAIN">PLAIN</option>
                </select>
              </div>
              {form.sasl_mechanism&&(<>
                <div>
                  <label style={LS}>SASL Username</label>
                  <input value={form.sasl_username} onChange={set("sasl_username")}
                    placeholder="account name" style={IS} />
                </div>
                <div>
                  <label style={LS}>SASL Password</label>
                  <input value={form.sasl_password} onChange={set("sasl_password")}
                    type="password" style={IS} />
                </div>
              </>)}
            </div>
          </div>

          {/* Perform / on-connect commands */}
          <div style={{gridColumn:"1/-1",borderTop:`1px solid ${T.borderFaint}`,paddingTop:12,marginTop:2}}>
            <div style={{...LS,marginBottom:4}}>
              On-Connect Commands
              <span style={{opacity:0.6,textTransform:"none",letterSpacing:0,marginLeft:6,fontSize:11}}>
                (executed after connecting, before auto-join)
              </span>
            </div>
            <div style={{fontSize:11,color:T.textFaint,marginBottom:8,...MONO}}>
              Examples:&nbsp;
              <span style={{color:T.textDim}}>/msg NickServ IDENTIFY mypass</span>
              &nbsp;·&nbsp;<span style={{color:T.textDim}}>/oper admin secret</span>
              &nbsp;·&nbsp;<span style={{color:T.textDim}}>/mode +x</span>
              &nbsp;·&nbsp;<span style={{color:T.textDim}}>/umode +i</span>
            </div>
            {/* Existing commands list */}
            {form.on_connect.length > 0 && (
              <div style={{marginBottom:8,display:"flex",flexDirection:"column",gap:4}}>
                {form.on_connect.map((cmd,i) => (
                  <div key={i} style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{...MONO,fontSize:11,color:T.textFaint,minWidth:18,textAlign:"right",userSelect:"none"}}>
                      {i+1}.
                    </span>
                    <div style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:4,
                      padding:"5px 8px",...MONO,fontSize:12,color:T.text,overflow:"hidden",
                      textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                      title={cmd}>
                      {cmd}
                    </div>
                    <button
                      onClick={()=>setForm(f=>({...f,on_connect:f.on_connect.filter((_,j)=>j!==i)}))}
                      style={{background:"none",border:`1px solid ${T.border}`,borderRadius:4,
                        color:T.textDim,cursor:"pointer",padding:"4px 7px",fontSize:12,
                        lineHeight:1,flexShrink:0}}
                      title="Remove">✕</button>
                    <button
                      onClick={()=>{if(i>0){const a=[...form.on_connect];[a[i-1],a[i]]=[a[i],a[i-1]];setForm(f=>({...f,on_connect:a}));}}}
                      disabled={i===0}
                      style={{background:"none",border:`1px solid ${T.border}`,borderRadius:4,
                        color:i===0?T.textGhost:T.textDim,cursor:i===0?"default":"pointer",
                        padding:"4px 7px",fontSize:11,lineHeight:1,flexShrink:0}}
                      title="Move up">↑</button>
                    <button
                      onClick={()=>{if(i<form.on_connect.length-1){const a=[...form.on_connect];[a[i],a[i+1]]=[a[i+1],a[i]];setForm(f=>({...f,on_connect:a}));}}}
                      disabled={i===form.on_connect.length-1}
                      style={{background:"none",border:`1px solid ${T.border}`,borderRadius:4,
                        color:i===form.on_connect.length-1?T.textGhost:T.textDim,
                        cursor:i===form.on_connect.length-1?"default":"pointer",
                        padding:"4px 7px",fontSize:11,lineHeight:1,flexShrink:0}}
                      title="Move down">↓</button>
                  </div>
                ))}
              </div>
            )}
            {/* Add new command */}
            <div style={{display:"flex",gap:6}}>
              <input
                value={newCmd}
                onChange={e=>setNewCmd(e.target.value)}
                onKeyDown={e=>{
                  if(e.key==="Enter"&&newCmd.trim()){
                    setForm(f=>({...f,on_connect:[...f.on_connect,newCmd.trim()]}));
                    setNewCmd("");
                  }
                }}
                placeholder="/msg NickServ IDENTIFY password"
                style={{...IS,flex:1,...MONO,fontSize:12}}
              />
              <button
                onClick={()=>{
                  if(newCmd.trim()){
                    setForm(f=>({...f,on_connect:[...f.on_connect,newCmd.trim()]}));
                    setNewCmd("");
                  }
                }}
                style={{...MONO,padding:"8px 14px",borderRadius:5,fontSize:12,cursor:"pointer",
                  background:T.accentBg2,border:`1px solid ${T.accent}`,color:T.accent,
                  flexShrink:0,whiteSpace:"nowrap"}}>
                + Add
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:20,gap:10}}>
          <button onClick={del} disabled={deleting}
            style={{...MONO,padding:"8px 14px",borderRadius:5,fontSize:12,cursor:"pointer",
              background:T.redBg,border:`1px solid ${T.redBorder}`,color:T.red,opacity:deleting?0.5:1}}>
            {deleting?"Deleting…":"Delete Network"}
          </button>
          <div style={{display:"flex",gap:8}}>
            <button onClick={onClose}
              style={{...MONO,padding:"8px 16px",borderRadius:5,fontSize:12,cursor:"pointer",
                background:"transparent",border:`1px solid ${T.border}`,color:T.textDim}}>
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              style={{...MONO,padding:"8px 20px",borderRadius:5,fontSize:12,cursor:"pointer",
                background:T.accentBg2,border:`1px solid ${T.accent}`,color:T.accent,
                fontWeight:700,opacity:saving?0.6:1}}>
              {saving?"Saving…":"Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Add Network Modal ────────────────────────────────────────────────────────
const PRESETS = [
  { label:"Ameth",       host:"irc.ameth.org",      port:6697, tls:true  },
  { label:"Libera.Chat", host:"irc.libera.chat",    port:6697, tls:true  },
  { label:"OFTC",        host:"irc.oftc.net",       port:6697, tls:true  },
  { label:"EFnet",       host:"irc.efnet.org",      port:6667, tls:false },
  { label:"Undernet",    host:"irc.undernet.org",   port:6667, tls:false },
  { label:"DALnet",      host:"irc.dal.net",        port:6697, tls:true  },
  { label:"QuakeNet",    host:"irc.quakenet.org",   port:6667, tls:false },
  { label:"Custom",      host:"",                   port:6667, tls:false },
];
const BLANK = { name:"", host:"", port:"6667", tls:false, nick:"", alt_nick:"", username:"", realname:"", password:"", auto_join:"", sasl_mechanism:"", sasl_username:"", sasl_password:"" };

function AddNetworkModal({ onClose, onAdded }) {
  const [form, setForm] = useState(BLANK);
  const [err, setErr]   = useState("");
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm(f => ({...f, [k]:e.target.value}));

  const applyPreset = p => setForm(f => ({
    ...f,
    name: f.name || (p.label!=="Custom" ? p.label : ""),
    host: p.host,
    port: String(p.port),
    tls:  p.tls ?? false,
  }));

  const submit = async () => {
    setErr("");
    if (!form.name.trim()) { setErr("Network name is required."); return; }
    if (!form.host.trim()) { setErr("Server host is required."); return; }
    if (!form.nick.trim()) { setErr("Nickname is required."); return; }
    setBusy(true);
    try {
      const body = {
        name:           form.name.trim(),
        host:           form.host.trim(),
        port:           parseInt(form.port)||6667,
        tls:            form.tls,
        nick:           form.nick.trim(),
        alt_nick:       form.alt_nick.trim() || form.nick.trim()+"_",
        username:       form.username.trim() || form.nick.trim(),
        realname:       form.realname.trim() || form.nick.trim(),
        password:       form.password,
        auto_join:      form.auto_join ? form.auto_join.split(",").map(s=>s.trim()).filter(Boolean) : [],
        sasl_mechanism: form.sasl_mechanism,
        sasl_username:  form.sasl_username.trim(),
        sasl_password:  form.sasl_password,
      };
      const result = await API.createNetwork(body);
      if (result?.error) { setErr(result.error); return; }
      if (!result?.id)   { setErr("Unexpected response from server. Check backend logs."); return; }
      onAdded(result);
    } catch(e) {
      setErr("Could not reach server: "+e.message);
    } finally {
      setBusy(false);
    }
  };

  const T=useTheme();
  const IS = {background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,
    color:T.text,padding:"9px 12px",fontSize:14,outline:"none",
    width:"100%",boxSizing:"border-box",fontFamily:"inherit"};
  const LS = {fontSize:11,color:T.textMono,display:"block",marginBottom:5,
    fontFamily:"'JetBrains Mono',monospace",textTransform:"uppercase",letterSpacing:"0.07em"};

  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:300,
      display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:T.bgPanel,border:`1px solid ${T.accentDim}`,borderRadius:12,width:500,
        maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 32px 96px #000e"}}>

        <div style={{padding:"18px 20px 14px",borderBottom:`1px solid ${T.borderFaint}`,
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:15,fontWeight:800,color:T.textBright,fontFamily:"'JetBrains Mono',monospace"}}>Add IRC Network</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.textFaint,fontSize:22,cursor:"pointer"}}>×</button>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
          <div style={{marginBottom:14}}>
            <div style={LS}>Quick Select</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {PRESETS.map(p=>(
                <button key={p.label} onClick={()=>applyPreset(p)}
                  style={{background:form.host===p.host&&p.host?T.accentBg:T.border,
                    border:`1px solid ${form.host===p.host&&p.host?T.accentDim:T.borderFaint}`,
                    borderRadius:5,color:form.host===p.host&&p.host?T.accent:T.textDim,
                    padding:"5px 11px",fontSize:13,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"}}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {err&&<div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:6,
            padding:"8px 12px",fontSize:13,color:T.red,marginBottom:14}}>{err}</div>}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{gridColumn:"1/-1"}}>
              <label style={LS}>Network Name *</label>
              <input value={form.name} onChange={set("name")} placeholder="e.g. Libera.Chat" style={IS} autoFocus />
            </div>
            <div>
              <label style={LS}>Server Host *</label>
              <input value={form.host} onChange={set("host")} placeholder="irc.libera.chat" style={IS} />
            </div>
            <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
              <div style={{flex:1}}>
                <label style={LS}>Port</label>
                <input value={form.port} onChange={set("port")} type="number" style={IS} />
              </div>
              <div style={{paddingBottom:1}}>
                <label style={LS}>TLS / SSL</label>
                <button onClick={()=>setForm(f=>({...f,tls:!f.tls,port:!f.tls?"6697":f.port==="6697"?"6667":f.port}))}
                  style={{...IS,width:"auto",padding:"9px 14px",cursor:"pointer",
                    background:form.tls?T.greenBg:T.bg,
                    border:`1px solid ${form.tls?T.green:T.border}`,
                    color:form.tls?T.green:T.textDim,fontWeight:form.tls?700:400}}>
                  {form.tls?"🔒 ON":"🔓 OFF"}
                </button>
              </div>
            </div>
            <div>
              <label style={LS}>Nickname *</label>
              <input value={form.nick} onChange={set("nick")} placeholder="YourNick" style={IS} />
            </div>
            <div>
              <label style={LS}>Alt Nickname</label>
              <input value={form.alt_nick} onChange={set("alt_nick")} placeholder="YourNick_" style={IS} />
            </div>
            <div>
              <label style={LS}>Username</label>
              <input value={form.username} onChange={set("username")} placeholder="yournick" style={IS} />
            </div>
            <div>
              <label style={LS}>Real Name</label>
              <input value={form.realname} onChange={set("realname")} placeholder="Your Name" style={IS} />
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label style={LS}>Server Password <span style={{opacity:0.6}}>(optional)</span></label>
              <input value={form.password} onChange={set("password")} type="password"
                placeholder="Leave blank if not required" style={IS} />
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label style={LS}>Auto-join Channels <span style={{opacity:0.6}}>(comma separated)</span></label>
              <input value={form.auto_join} onChange={set("auto_join")} placeholder="#linux, #python, #chat" style={IS} />
            </div>

            {/* SASL section */}
            <div style={{gridColumn:"1/-1",borderTop:`1px solid ${T.borderFaint}`,paddingTop:12,marginTop:2}}>
              <div style={{...LS,marginBottom:8}}>SASL Authentication <span style={{opacity:0.6}}>(optional)</span></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div style={{gridColumn:"1/-1"}}>
                  <label style={LS}>Mechanism</label>
                  <select value={form.sasl_mechanism} onChange={set("sasl_mechanism")}
                    style={{...IS,cursor:"pointer"}}>
                    <option value="">Disabled</option>
                    <option value="PLAIN">PLAIN</option>
                  </select>
                </div>
                {form.sasl_mechanism&&(<>
                  <div>
                    <label style={LS}>SASL Username</label>
                    <input value={form.sasl_username} onChange={set("sasl_username")}
                      placeholder="your account name" style={IS} />
                  </div>
                  <div>
                    <label style={LS}>SASL Password</label>
                    <input value={form.sasl_password} onChange={set("sasl_password")}
                      type="password" placeholder="your account password" style={IS}
                      onKeyDown={e=>e.key==="Enter"&&submit()} />
                  </div>
                </>)}
              </div>
            </div>
          </div>
        </div>

        <div style={{padding:"14px 20px",borderTop:`1px solid ${T.borderFaint}`,display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onClose}
            style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,
              color:T.textDim,padding:"9px 18px",fontSize:14,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"}}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy}
            style={{background:T.accent,border:"none",borderRadius:6,color:T.bg,
              fontWeight:700,padding:"9px 20px",fontSize:14,cursor:busy?"wait":"pointer",
              fontFamily:"'JetBrains Mono',monospace",opacity:busy?0.6:1}}>
            {busy?"Saving…":"Add & Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Command definitions ──────────────────────────────────────────────────────
const CMDS = {
  "/join":        "Join a channel:  /join #channel",
  "/part":        "Leave current channel:  /part [reason]",
  "/close":       "Close current channel/query tab",
  "/msg":         "Private message:  /msg <nick> <text>",
  "/query":       "Open DM with nick:  /query <nick>",
  "/me":          "Action message:  /me <text>",
  "/nick":        "Change nickname:  /nick <newnick>",
  "/topic":       "Get/set topic:  /topic [new topic]",
  "/kick":        "Kick user:  /kick <nick> [reason]",
  "/kickban":     "Kick and ban:  /kickban <nick> [reason]",
  "/ban":         "Ban mask:  /ban <nick!user@host>",
  "/unban":       "Unban mask:  /unban <mask>",
  "/op":          "Give op (+o):  /op <nick> [nick2 ...]",
  "/deop":        "Remove op (-o):  /deop <nick> [nick2 ...]",
  "/voice":       "Give voice (+v):  /voice <nick> [nick2 ...]",
  "/devoice":     "Remove voice (-v):  /devoice <nick> [nick2 ...]",
  "/halfop":      "Give half-op (+h):  /halfop <nick> [nick2 ...]",
  "/dehalfop":    "Remove half-op (-h):  /dehalfop <nick> [nick2 ...]",
  "/mode":        "Get/set modes:  /mode [target] [flags]",
  "/invite":      "Invite user:  /invite <nick> [#channel]",
  "/whois":       "User info:  /whois <nick>",
  "/whowas":      "Info on departed nick:  /whowas <nick>",
  "/who":         "Channel member details:  /who [#channel]",
  "/names":       "Refresh member list",
  "/list":        "List channels:  /list [pattern]",
  "/stats":       "Server stats:  /stats [query] [server]",
  "/links":       "List servers in network:  /links [server]",
  "/time":        "Server time:  /time [server]",
  "/version":     "Server version:  /version [server]",
  "/info":        "Server info:  /info [server]",
  "/motd":        "Show MOTD:  /motd [server]",
  "/lusers":      "Server user counts:  /lusers",
  "/map":         "Network map:  /map",
  "/ping":        "Ping nick or server:  /ping <nick|server>",
  "/oper":        "IRC operator login:  /oper <n> <password>",
  "/away":        "Set away:  /away [message]",
  "/back":        "Clear away status",
  "/notice":      "Send NOTICE:  /notice <nick|#chan> <text>",
  "/ctcp":        "Send CTCP:  /ctcp <nick> <command> [args]",
  "/ignore":      "Ignore nick (client-side):  /ignore <nick>",
  "/unignore":    "Remove ignore:  /unignore <nick>",
  "/raw":         "Send raw IRC:  /raw <command>",
  "/quote":       "Send raw IRC:  /quote <command>",
  "/connect":     "Connect to active network",
  "/disconnect":  "Disconnect from active network",
  "/reconnect":   "Reconnect to active network",
  "/clear":       "Clear message view",
  "/help":        "Show commands:  /help [command]",
};

// ─── User context menu popup ──────────────────────────────────────────────────
// myPrefix: my own prefix in this channel ("~","&","@","%","+" or "")
function UserMenuPopup({ menu, onClose, onSend, myPrefix, currentNick }) {
  const T = useTheme();
  const MONO = { fontFamily:"'JetBrains Mono',monospace" };
  const { nick, pfx, x, y, chan, netId } = menu;

  // Prefix rank: higher = more privileged
  const RANK = { "~":5, "&":4, "@":3, "%":2, "+":1, "":0 };
  const myRank   = RANK[myPrefix] ?? 0;
  const theirRank = RANK[pfx]    ?? 0;

  // What I can do:
  const canSeeOps   = myRank >= 2; // half-op or above sees the section
  const canKick     = myRank >= 2;
  const canVoice    = myRank >= 2; // half-ops can typically give/take voice
  const canHop      = myRank >= 3; // ops can give/take half-op
  const canOp       = myRank >= 3; // ops can give/take op
  const canAdmin    = myRank >= 4; // admins (&) can give/take admin (+a)
  const canOwner    = myRank >= 5; // owners (~) can give/take owner (+q)
  // Granting a mode requires strictly outranking the target
  // Removing a mode only requires being at equal or higher rank
  const canGrant    = myRank > theirRank;
  const canRevoke   = myRank >= theirRank;

  // Target's current modes
  const hasOwner = pfx==="~";
  const hasAdmin = pfx==="&";
  const hasOp    = pfx==="@";
  const hasHop   = pfx==="%";
  const hasVoice = pfx==="+";

  // Keep popup on screen — taller now to accommodate more rows
  const menuW = 220, menuH = 420;
  const left = Math.min(x, window.innerWidth  - menuW - 8);
  const top  = Math.min(y, window.innerHeight - menuH - 8);

  const send = (cmd) => { onSend(netId, cmd); onClose(); };

  const Row = ({ icon, label, sub, onClick, danger, dim }) => (
    <div onClick={dim ? undefined : onClick}
      style={{display:"flex",alignItems:"center",gap:9,padding:"7px 12px",
        cursor:dim?"default":"pointer",borderRadius:4,margin:"1px 4px",
        userSelect:"none",opacity:dim?0.3:1,color:danger?T.red:T.text}}
      onMouseEnter={e=>{ if(!dim) e.currentTarget.style.background=danger?T.redBg:T.border; }}
      onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; }}>
      <span style={{width:16,textAlign:"center",fontSize:13,flexShrink:0}}>{icon}</span>
      <span style={{flex:1,fontSize:13}}>{label}</span>
      {sub&&<span style={{...MONO,fontSize:10,color:T.textFaint}}>{sub}</span>}
    </div>
  );

  const ModeRow = ({ has, label, sub, canDo }) => {
    const active = has;
    // To grant: need canDo privilege AND must outrank target
    // To remove: need canDo privilege AND must be equal or higher rank
    const dim = !canDo || (active ? !canRevoke : !canGrant);
    return (
      <div onClick={dim ? undefined : ()=>send(`/mode ${chan} ${active?"-":"+"}${sub.replace(/[+-]/g,"")} ${nick}`)}
        style={{display:"flex",alignItems:"center",gap:9,padding:"6px 12px",
          cursor:dim?"default":"pointer",borderRadius:4,margin:"1px 4px",
          userSelect:"none",opacity:dim?0.3:1,color:T.text}}
        onMouseEnter={e=>{ if(!dim) e.currentTarget.style.background=T.border; }}
        onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; }}>
        {/* mode badge */}
        <span style={{...MONO,fontSize:11,fontWeight:700,width:26,textAlign:"center",
          borderRadius:3,padding:"1px 3px",flexShrink:0,
          background: active ? T.accentBg3 : T.bgInput,
          color:      active ? T.accent    : T.textFaint,
          border:`1px solid ${active?T.accent:T.borderFaint}`}}>
          {active ? sub.replace("+","") : sub}
        </span>
        <span style={{flex:1,fontSize:13}}>{label}</span>
        <span style={{...MONO,fontSize:10,color:active?T.accent:T.textFaint}}>
          {active?"active":"—"}
        </span>
      </div>
    );
  };

  const Divider = () => <div style={{height:1,background:T.borderFaint,margin:"4px 0"}}/>;

  const PREFIX_LABEL = {"~":"Owner","&":"Admin","@":"Op","%":"Half-op","+":"Voiced"};

  return (
    <div style={{position:"fixed",inset:0,zIndex:300}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()}
        style={{position:"fixed",left,top,width:menuW,background:T.bgPanel,
          border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 0",
          boxShadow:"0 8px 32px #0006",zIndex:301,minWidth:menuW}}>

        {/* Header */}
        <div style={{padding:"8px 12px 6px",borderBottom:`1px solid ${T.borderFaint}`}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Avatar nick={nick} size={26}/>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:T.textBright}}>{nick}</div>
              {pfx
                ? <div style={{...MONO,fontSize:10,color:T.accent}}>{PREFIX_LABEL[pfx]||pfx}</div>
                : <div style={{...MONO,fontSize:10,color:T.textFaint}}>Member</div>
              }
            </div>
          </div>
        </div>

        <div style={{padding:"4px 0"}}>
          {/* Always-available actions */}
          <Row icon="ℹ" label="User Info (WHOIS)"  onClick={()=>send(`/whois ${nick}`)} />
          <Row icon="✉" label="Send Message"        onClick={()=>send(`/msg ${nick}`)} />

          {/* Mode section — visible to half-op and above, hidden for self */}
          {canSeeOps && nick !== currentNick && (<>
            <Divider/>
            <div style={{...MONO,padding:"4px 12px 2px",fontSize:10,color:T.textFaint,
              textTransform:"uppercase",letterSpacing:"0.08em"}}>Channel Modes</div>

            {canOwner  && <ModeRow has={hasOwner} label="Owner"    sub="+q" canDo={canOwner} />}
            {canAdmin  && <ModeRow has={hasAdmin} label="Admin"    sub="+a" canDo={canAdmin} />}
                          <ModeRow has={hasOp}    label="Op"       sub="+o" canDo={canOp}    />
                          <ModeRow has={hasHop}   label="Half-op"  sub="+h" canDo={canHop}   />
                          <ModeRow has={hasVoice} label="Voice"    sub="+v" canDo={canVoice} />

            <Divider/>

            <Row icon="🔇" label="Kick" danger dim={!canKick||!canRevoke}
              onClick={()=>{
                onClose();
                const reason = window.prompt(`Kick reason for ${nick}:`,"");
                if (reason !== null) onSend(netId, `/kick ${chan} ${nick} ${reason||"Kicked"}`);
              }} />
            <Row icon="🔨" label="Ban (host mask)" danger dim={!canKick||!canRevoke}
              onClick={()=>send(`/mode ${chan} +b ${nick}!*@*`)} />
            <Row icon="🚫" label="Kick & Ban" danger dim={!canKick||!canRevoke}
              onClick={()=>{
                onClose();
                const reason = window.prompt(`Kick+ban reason for ${nick}:`,"");
                if (reason !== null) {
                  onSend(netId, `/mode ${chan} +b ${nick}!*@*`);
                  onSend(netId, `/kick ${chan} ${nick} ${reason||"Banned"}`);
                }
              }} />
          </>)}
        </div>
      </div>
    </div>
  );
}

// ─── Profile modal ────────────────────────────────────────────────────────────
function ProfileModal({ currentUser, onClose, onUpdated }) {
  const T = useTheme();
  const MONO = { fontFamily:"'JetBrains Mono',monospace" };
  const IS = { width:"100%", padding:"8px 10px", borderRadius:5, fontSize:13,
    background:T.bgPanel, border:`1px solid ${T.border}`, color:T.text,
    fontFamily:"'Inter var','Inter',sans-serif", outline:"none", boxSizing:"border-box" };
  const LS = { display:"block", fontSize:11, color:T.textDim, marginBottom:4,
    ...MONO, textTransform:"uppercase", letterSpacing:"0.05em" };

  const [tab, setTab]               = React.useState("avatar"); // "avatar" | "password"
  const [preview, setPreview]       = React.useState(currentUser.avatar_url || null);
  const [file, setFile]             = React.useState(null);
  const [uploading, setUploading]   = React.useState(false);
  const [uploadErr, setUploadErr]   = React.useState("");
  const [curPw, setCurPw]           = React.useState("");
  const [newPw, setNewPw]           = React.useState("");
  const [newPw2, setNewPw2]         = React.useState("");
  const [pwSaving, setPwSaving]     = React.useState(false);
  const [pwErr, setPwErr]           = React.useState("");
  const [pwOk, setPwOk]             = React.useState(false);
  const fileRef = React.useRef();

  const handleFileChange = e => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setUploadErr("");
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true); setUploadErr("");
    try {
      const updated = await API.uploadAvatar(file);
      if (updated.error) { setUploadErr(updated.error); return; }
      // Bust the avatar cache for this user's nick
      delete _avatarCache[currentUser.username];
      onUpdated(updated);
      setFile(null);
    } catch(e) { setUploadErr(String(e)); }
    finally { setUploading(false); }
  };

  const handlePassword = async () => {
    setPwErr(""); setPwOk(false);
    if (newPw !== newPw2) { setPwErr("Passwords do not match"); return; }
    if (newPw.length < 8) { setPwErr("Password must be at least 8 characters"); return; }
    setPwSaving(true);
    try {
      const updated = await API.updateProfile({ current_password: curPw, new_password: newPw });
      if (updated.error) { setPwErr(updated.error); return; }
      setCurPw(""); setNewPw(""); setNewPw2("");
      setPwOk(true);
      onUpdated(updated);
    } catch(e) { setPwErr(String(e)); }
    finally { setPwSaving(false); }
  };

  const tabStyle = active => ({
    ...MONO, padding:"7px 16px", fontSize:12, cursor:"pointer", borderRadius:5,
    background: active ? T.accentBg2 : "transparent",
    border: `1px solid ${active ? T.accent : T.borderFaint}`,
    color: active ? T.accent : T.textDim,
  });

  return (
    <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:400,
      display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:T.bgPanel,border:`1px solid ${T.border}`,borderRadius:10,
        width:420,padding:24,boxShadow:"0 8px 40px #0008"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <span style={{...MONO,fontWeight:700,fontSize:15,color:T.textBright}}>👤 My Profile</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.textDim,
            fontSize:18,cursor:"pointer",padding:"0 4px"}}>✕</button>
        </div>

        {/* Current user info */}
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,
          padding:14,borderRadius:8,background:T.bg,border:`1px solid ${T.borderFaint}`}}>
          <div style={{position:"relative"}}>
            {preview
              ? <img src={preview} alt="avatar"
                  style={{width:52,height:52,borderRadius:"50%",objectFit:"cover",
                    border:`2px solid ${T.accent}44`}}/>
              : <Avatar nick={currentUser.username} size={52}/>
            }
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:T.textBright}}>{currentUser.display_name||currentUser.username}</div>
            <div style={{...MONO,fontSize:11,color:T.textFaint}}>@{currentUser.username}</div>
            <div style={{...MONO,fontSize:10,color:T.textFaint,marginTop:2,
              background:currentUser.role==="admin"?T.amberBg:"transparent",
              border:`1px solid ${currentUser.role==="admin"?T.amber:T.borderFaint}`,
              borderRadius:3,padding:"1px 5px",display:"inline-block",
              color:currentUser.role==="admin"?T.amber:T.textFaint}}>
              {currentUser.role}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:8,marginBottom:18}}>
          <button style={tabStyle(tab==="avatar")} onClick={()=>setTab("avatar")}>Avatar</button>
          <button style={tabStyle(tab==="password")} onClick={()=>{setTab("password");setPwOk(false);}}>Password</button>
        </div>

        {/* Avatar tab */}
        {tab==="avatar" && (
          <div>
            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp"
              ref={fileRef} style={{display:"none"}} onChange={handleFileChange}/>
            <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:14}}>
              <div style={{width:72,height:72,borderRadius:8,overflow:"hidden",flexShrink:0,
                background:T.bg,border:`1px solid ${T.border}`,display:"flex",
                alignItems:"center",justifyContent:"center"}}>
                {preview
                  ? <img src={preview} alt="preview"
                      style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  : <span style={{fontSize:11,color:T.textFaint,...MONO}}>No avatar</span>
                }
              </div>
              <div style={{flex:1}}>
                <button onClick={()=>fileRef.current.click()}
                  style={{...IS,cursor:"pointer",textAlign:"left",marginBottom:6,
                    color:file?T.text:T.textDim}}>
                  {file ? file.name : "Choose image…"}
                </button>
                <div style={{fontSize:11,color:T.textFaint,...MONO}}>
                  JPEG, PNG, GIF, or WebP · max 4 MB
                </div>
              </div>
            </div>
            {uploadErr&&<div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,
              borderRadius:5,padding:"7px 10px",color:T.red,fontSize:12,marginBottom:10,...MONO}}>
              {uploadErr}</div>}
            <button onClick={handleUpload} disabled={!file||uploading}
              style={{...MONO,width:"100%",padding:"9px 0",borderRadius:5,fontSize:13,
                cursor:(!file||uploading)?"default":"pointer",fontWeight:700,
                background:(!file||uploading)?T.bg:T.accentBg2,
                border:`1px solid ${(!file||uploading)?T.border:T.accent}`,
                color:(!file||uploading)?T.textFaint:T.accent,
                opacity:uploading?0.6:1}}>
              {uploading ? "Uploading…" : "Save Avatar"}
            </button>
          </div>
        )}

        {/* Password tab */}
        {tab==="password" && (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <label style={LS}>Current Password</label>
              <input type="password" value={curPw} onChange={e=>setCurPw(e.target.value)}
                style={IS} autoComplete="current-password"/>
            </div>
            <div>
              <label style={LS}>New Password</label>
              <input type="password" value={newPw} onChange={e=>{setNewPw(e.target.value);setPwOk(false);}}
                style={IS} autoComplete="new-password"/>
            </div>
            <div>
              <label style={LS}>Confirm New Password</label>
              <input type="password" value={newPw2} onChange={e=>{setNewPw2(e.target.value);setPwOk(false);}}
                style={IS} autoComplete="new-password"
                onKeyDown={e=>e.key==="Enter"&&handlePassword()}/>
            </div>
            {pwErr&&<div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,
              borderRadius:5,padding:"7px 10px",color:T.red,fontSize:12,...MONO}}>{pwErr}</div>}
            {pwOk&&<div style={{background:T.greenBg,border:`1px solid ${T.green}`,
              borderRadius:5,padding:"7px 10px",color:T.green,fontSize:12,...MONO}}>
              ✓ Password updated successfully</div>}
            <button onClick={handlePassword} disabled={!curPw||!newPw||!newPw2||pwSaving}
              style={{...MONO,width:"100%",padding:"9px 0",borderRadius:5,fontSize:13,
                cursor:(!curPw||!newPw||!newPw2||pwSaving)?"default":"pointer",fontWeight:700,
                background:(!curPw||!newPw||!newPw2||pwSaving)?T.bg:T.accentBg2,
                border:`1px solid ${(!curPw||!newPw||!newPw2||pwSaving)?T.border:T.accent}`,
                color:(!curPw||!newPw||!newPw2||pwSaving)?T.textFaint:T.accent,
                opacity:pwSaving?0.6:1}}>
              {pwSaving ? "Saving…" : "Change Password"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Input bar ────────────────────────────────────────────────────────────────
function InputBar({ onSend, label, nick, disabled }) {
  const [val,      setVal]      = useState("");
  const [hist,     setHist]     = useState([]);
  const [histIdx,  setHistIdx]  = useState(-1);
  const [suggest,  setSuggest]  = useState([]);
  const [sugIdx,   setSugIdx]   = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, [label]);

  const updateSuggest = v => {
    if (v.startsWith("/")) {
      const q = v.toLowerCase();
      setSuggest(Object.keys(CMDS).filter(c => c.startsWith(q) && c !== q));
    } else {
      setSuggest([]);
    }
    setSugIdx(0);
  };

  const submit = () => {
    const v = val.trim();
    if (!v || disabled) return;
    onSend(v);
    setHist(h => [v,...h.slice(0,99)]);
    setHistIdx(-1); setVal(""); setSuggest([]);
  };

  const T=useTheme();
  return (
    <div style={{padding:"10px 14px 12px",borderTop:`1px solid ${T.borderMid}`,background:T.bgInputWrap,flexShrink:0}}>
      {suggest.length>0&&(
        <div style={{background:T.bgPanel,border:`1px solid ${T.accentDim}`,borderRadius:6,
          padding:"4px 0",marginBottom:8,maxHeight:200,overflowY:"auto"}}>
          {suggest.map((cmd,i)=>(
            <div key={cmd} onClick={()=>{setVal(cmd+" ");setSuggest([]);inputRef.current?.focus();}}
              style={{padding:"5px 14px",fontSize:13,cursor:"pointer",display:"flex",gap:12,
                background:i===sugIdx?T.accentBg:"transparent",
                color:i===sugIdx?T.accent:T.textDim}}
              onMouseEnter={()=>setSugIdx(i)}>
              <span style={{fontFamily:"'JetBrains Mono',monospace",minWidth:130,flexShrink:0}}>{cmd}</span>
              <span style={{fontSize:12,color:T.textFaint,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{CMDS[cmd]}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{display:"flex",alignItems:"center",gap:10,background:T.bgInput,
        borderRadius:9,border:`1px solid ${T.borderFaint}`,padding:"9px 14px",opacity:disabled?0.45:1}}>
        <span style={{fontSize:13,color:T.textMono,fontFamily:"'JetBrains Mono',monospace",
          flexShrink:0,userSelect:"none"}}>{label}</span>
        <span style={{color:T.textFaint,flexShrink:0,fontSize:15}}>›</span>
        <input ref={inputRef} value={val} disabled={disabled}
          onChange={e=>{setVal(e.target.value);updateSuggest(e.target.value);}}
          onKeyDown={e=>{
            if (e.key==="Enter") {
              if (suggest.length>0&&val.trim()!==suggest[sugIdx]) { setVal(suggest[sugIdx]+" "); setSuggest([]); return; }
              submit();
            } else if (e.key==="ArrowUp") {
              e.preventDefault();
              if (suggest.length>0) { setSugIdx(i=>Math.max(0,i-1)); return; }
              const ni=Math.min(histIdx+1,hist.length-1); setHistIdx(ni); setVal(hist[ni]||"");
            } else if (e.key==="ArrowDown") {
              e.preventDefault();
              if (suggest.length>0) { setSugIdx(i=>Math.min(suggest.length-1,i+1)); return; }
              const ni=Math.max(histIdx-1,-1); setHistIdx(ni); setVal(ni===-1?"":hist[ni]||"");
            } else if (e.key==="Tab") {
              e.preventDefault();
              if (suggest.length>0) { setVal(suggest[sugIdx]+" "); setSuggest([]); }
            } else if (e.key==="Escape") { setSuggest([]); }
          }}
          placeholder={disabled?"Not connected — type /connect to reconnect":`Message ${label} as ${nick}…`}
          style={{flex:1,background:"transparent",border:"none",outline:"none",
            color:T.text,fontSize:15,caretColor:T.accent,fontFamily:"inherit"}}
        />
      </div>
    </div>
  );
}

// ─── CtxItem: reusable context menu row ─────────────────────────────────────
function CtxItem({ icon, label, onClick, color, danger }) {
  const T = useTheme();
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",
        fontSize:13,cursor:"pointer",borderRadius:4,margin:"1px 4px",
        background:hov?T.border:"transparent",
        color:color||(danger?T.red:T.text),
        fontFamily:"'Inter var','Inter',sans-serif"}}>
      <span style={{width:16,textAlign:"center",fontSize:13,flexShrink:0}}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

// ─── Sidebar item (channel, DM, or server tab) ───────────────────────────────
// kind: "channel" | "dm" | "server"
function SidebarItem({ chanName, kind, active, unread, onClick, onContextMenu, left }) {
  const T=useTheme();
  const [hov, setHov] = useState(false);

  let icon, label;
  if (kind==="server") {
    icon = <span style={{fontSize:11,opacity:0.6,flexShrink:0}}>⚡</span>;
    label = "server";
  } else if (kind==="dm") {
    icon = <Avatar nick={chanName} size={16}/>;
    label = chanName;
  } else {
    // channel — show dimmed lock icon if left
    icon = left
      ? <span style={{fontSize:11,opacity:0.35,flexShrink:0,fontFamily:"'JetBrains Mono',monospace"}}>#</span>
      : <span style={{fontSize:12,opacity:0.7,flexShrink:0,fontFamily:"'JetBrains Mono',monospace"}}>#</span>;
    label = chanName.replace(/^#/,"");
  }

  const textColor = left
    ? T.textFaint
    : active ? T.text : unread>0 ? T.accent : T.textDim;

  return (
    <div onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"4px 10px 4px 24px",margin:"1px 6px",borderRadius:4,cursor:"pointer",
        background:active?T.accentBg2:hov?T.border:"transparent",
        color:textColor,
        fontWeight:active||unread>0?600:400,fontSize:14,gap:6,
        opacity:left?0.55:1}}>
      <span style={{display:"flex",alignItems:"center",gap:5,overflow:"hidden",minWidth:0}}>
        {icon}
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
          fontStyle:left?"italic":"normal"}}>{label}</span>
      </span>
      {unread>0&&!active&&(
        <span style={{background:T.accent,color:T.bg,fontSize:10,fontWeight:800,
          borderRadius:10,padding:"1px 5px",minWidth:16,textAlign:"center",
          fontFamily:"'JetBrains Mono',monospace",flexShrink:0,lineHeight:"14px"}}>{unread>99?"99+":unread}</span>
      )}
    </div>
  );
}

// ─── Collapsible section header ───────────────────────────────────────────────
function SectionHeader({ label, count, open, onToggle }) {
  const T=useTheme();
  return (
    <div onClick={onToggle}
      style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px 2px 12px",
        cursor:"pointer",userSelect:"none"}}
      onMouseEnter={e=>e.currentTarget.style.background=T.border}
      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <span style={{fontSize:9,color:T.textFaint,transition:"transform 0.15s",
        display:"inline-block",transform:open?"rotate(90deg)":"rotate(0deg)"}}>▶</span>
      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,
        color:T.textDim,textTransform:"uppercase",letterSpacing:"0.08em",flex:1}}>
        {label}
      </span>
      {count>0&&<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,
        color:T.textFaint}}>{count}</span>}
    </div>
  );
}

// ─── Logs Modal ───────────────────────────────────────────────────────────────
function UserSettingsModal({ onClose, notifPerms, setNotifPerms, notifPrefs, saveNotifPrefs }) {
  const T = useTheme();
  const MONO = { fontFamily:"'JetBrains Mono',monospace" };
  const IS = {
    width:"100%", padding:"7px 10px", borderRadius:5, fontSize:13,
    border:`1px solid ${T.border}`, background:T.bgInput||T.bg, color:T.text,
    outline:"none", boxSizing:"border-box",
  };

  // ── tab state ────────────────────────────────────────────────────────────
  const [tab, setTab] = React.useState("browse"); // "browse" | "settings"

  // ── settings state ───────────────────────────────────────────────────────
  const [settings, setSettings]     = React.useState(null);
  const [settingsSaving, setSS]     = React.useState(false);
  const [settingsMsg, setSettingsMsg]= React.useState("");

  // ── browse state ─────────────────────────────────────────────────────────
  const [logNets,   setLogNets]   = React.useState([]);
  const [logChans,  setLogChans]  = React.useState([]);
  const [filters, setFilters] = React.useState({
    network_id:"", channel:"", nick:"", search:"", type:"", date_from:"", date_to:"",
  });
  const [results,  setResults]  = React.useState(null); // QueryResult
  const [loading,  setLoading]  = React.useState(false);
  const [page,     setPage]     = React.useState(0);
  const [exporting, setExporting] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState(false);
  const LIMIT = 50;

  // ── load settings + networks on mount ───────────────────────────────────
  React.useEffect(() => {
    fetch("/api/v1/logs/settings", { credentials:"include" })
      .then(r=>r.json()).then(s=>setSettings(s)).catch(()=>{});
    fetch("/api/v1/logs/networks", { credentials:"include" })
      .then(r=>r.json()).then(n=>setLogNets(Array.isArray(n)?n:[])).catch(()=>{});
  }, []);

  // ── load channels when network filter changes ────────────────────────────
  React.useEffect(() => {
    if (!filters.network_id) { setLogChans([]); return; }
    fetch(`/api/v1/logs/channels?network_id=${encodeURIComponent(filters.network_id)}`,
      { credentials:"include" })
      .then(r=>r.json()).then(c=>setLogChans(Array.isArray(c)?c:[]))
      .catch(()=>setLogChans([]));
  }, [filters.network_id]);

  // ── search ───────────────────────────────────────────────────────────────
  const search = React.useCallback((pg=0) => {
    setLoading(true);
    const p = new URLSearchParams();
    p.set("limit", LIMIT);
    p.set("offset", pg * LIMIT);
    Object.entries(filters).forEach(([k,v])=>{ if(v) p.set(k,v); });
    fetch(`/api/v1/logs?${p}`, { credentials:"include" })
      .then(r=>r.json())
      .then(res=>{ setResults(res); setPage(pg); })
      .catch(()=>setResults(null))
      .finally(()=>setLoading(false));
  }, [filters]);

  // initial load
  React.useEffect(()=>{ search(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilter = (key, val) => {
    setFilters(f=>({...f, [key]:val}));
    if (key==="network_id") setFilters(f=>({...f, network_id:val, channel:""}));
  };

  const runSearch = (e) => { e.preventDefault(); search(0); };

  // ── export ───────────────────────────────────────────────────────────────
  const doExport = () => {
    setExporting(true);
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k,v])=>{ if(v) p.set(k,v); });
    fetch(`/api/v1/logs/export?${p}`, { credentials:"include" })
      .then(async r=>{
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url;
        a.download = `korechat-logs-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }).catch(()=>{}).finally(()=>setExporting(false));
  };

  // ── delete all ───────────────────────────────────────────────────────────
  const doDelete = () => {
    fetch("/api/v1/logs", { method:"DELETE", credentials:"include" })
      .then(()=>{ setDeleteConfirm(false); search(0); }).catch(()=>{});
  };

  // ── save settings ────────────────────────────────────────────────────────
  const saveSettings = () => {
    setSS(true);
    fetch("/api/v1/logs/settings", {
      method:"PATCH", credentials:"include",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(settings),
    }).then(r=>r.json()).then(s=>{ setSettings(s); setSettingsMsg("Saved!"); setTimeout(()=>setSettingsMsg(""),2000); })
      .catch(()=>setSettingsMsg("Error saving."))
      .finally(()=>setSS(false));
  };

  // ── helpers ───────────────────────────────────────────────────────────────
  const typeColor = (type) => {
    switch(type) {
      case "PRIVMSG": return T.text;
      case "NOTICE":  return T.amber||"#d4a72c";
      case "JOIN":    return T.green;
      case "PART":    return T.textFaint;
      case "QUIT":    return T.red||"#e55";
      case "KICK":    return T.red||"#e55";
      case "TOPIC":   return T.accent||T.blue||"#58a6ff";
      case "MODE":    return T.textDim;
      default:        return T.text;
    }
  };

  const fmtTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})
      + " " + d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  };

  const totalPages = results ? Math.ceil(results.total / LIMIT) : 0;

  // ── overlay ───────────────────────────────────────────────────────────────
  return (
    <div style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,0.55)",
      display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:T.bgSide,borderRadius:10,border:`1px solid ${T.border}`,
        width:"min(900px,95vw)",height:"min(720px,90vh)",display:"flex",flexDirection:"column",
        boxShadow:"0 20px 60px rgba(0,0,0,0.4)",overflow:"hidden"}}>

        {/* Header */}
        <div style={{padding:"16px 20px 0",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",marginBottom:14}}>
            <span style={{...MONO,fontSize:15,fontWeight:700,color:T.textBright}}>⚙ User Settings</span>
            <button onClick={onClose} style={{marginLeft:"auto",background:"transparent",
              border:"none",color:T.textFaint,fontSize:18,cursor:"pointer",padding:"0 4px",lineHeight:1}}>×</button>
          </div>
          <div style={{display:"flex",gap:0}}>
            {[["browse","Browse"],["logs","Logs"],["notifications","Notifications"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)}
                style={{...MONO,fontSize:12,padding:"7px 16px",border:"none",cursor:"pointer",
                  borderBottom: tab===id ? `2px solid ${T.accent||T.blue||"#58a6ff"}` : "2px solid transparent",
                  background:"transparent",
                  color: tab===id ? T.textBright : T.textFaint,
                  fontWeight: tab===id ? 700 : 400}}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>

          {/* ── Browse tab ── */}
          {tab==="browse"&&(
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

              {/* Filter bar */}
              <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.borderFaint}`,
                flexShrink:0,display:"flex",flexWrap:"wrap",gap:8,alignItems:"flex-end"}}>

                {/* Network */}
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <label style={{...MONO,fontSize:10,color:T.textFaint}}>NETWORK</label>
                  <select value={filters.network_id}
                    onChange={e=>{ handleFilter("network_id",e.target.value); }}
                    style={{...IS,width:130,padding:"5px 8px"}}>
                    <option value="">All networks</option>
                    {logNets.map(n=>(
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>

                {/* Channel */}
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <label style={{...MONO,fontSize:10,color:T.textFaint}}>CHANNEL</label>
                  {logChans.length > 0 ? (
                    <select value={filters.channel}
                      onChange={e=>handleFilter("channel",e.target.value)}
                      style={{...IS,width:140,padding:"5px 8px"}}>
                      <option value="">All channels</option>
                      {logChans.map(c=>(
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  ) : (
                    <input placeholder="e.g. #general" value={filters.channel}
                      onChange={e=>handleFilter("channel",e.target.value)}
                      style={{...IS,width:130}} />
                  )}
                </div>

                {/* Nick */}
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <label style={{...MONO,fontSize:10,color:T.textFaint}}>NICK</label>
                  <input placeholder="nick…" value={filters.nick}
                    onChange={e=>handleFilter("nick",e.target.value)}
                    style={{...IS,width:110}} />
                </div>

                {/* Type */}
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <label style={{...MONO,fontSize:10,color:T.textFaint}}>TYPE</label>
                  <select value={filters.type} onChange={e=>handleFilter("type",e.target.value)}
                    style={{...IS,width:115,padding:"5px 8px"}}>
                    <option value="">All types</option>
                    {["PRIVMSG","NOTICE","JOIN","PART","QUIT","KICK","TOPIC","MODE"].map(t=>(
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Date from */}
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <label style={{...MONO,fontSize:10,color:T.textFaint}}>FROM</label>
                  <input type="date" value={filters.date_from}
                    onChange={e=>handleFilter("date_from",e.target.value)}
                    style={{...IS,width:130}} />
                </div>

                {/* Date to */}
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <label style={{...MONO,fontSize:10,color:T.textFaint}}>TO</label>
                  <input type="date" value={filters.date_to}
                    onChange={e=>handleFilter("date_to",e.target.value)}
                    style={{...IS,width:130}} />
                </div>

                {/* Search text */}
                <div style={{display:"flex",flexDirection:"column",gap:3,flex:1,minWidth:160}}>
                  <label style={{...MONO,fontSize:10,color:T.textFaint}}>SEARCH TEXT</label>
                  <input placeholder="search messages…" value={filters.search}
                    onChange={e=>handleFilter("search",e.target.value)}
                    onKeyDown={e=>{ if(e.key==="Enter") search(0); }}
                    style={{...IS}} />
                </div>

                <button onClick={runSearch}
                  style={{...MONO,padding:"6px 14px",borderRadius:5,border:"none",
                    background:T.accent||T.blue||"#238636",color:"#fff",fontSize:12,
                    cursor:"pointer",alignSelf:"flex-end",whiteSpace:"nowrap"}}>
                  🔍 Search
                </button>
              </div>

              {/* Results table */}
              <div style={{flex:1,overflowY:"auto",padding:"0"}}>
                {loading&&(
                  <div style={{textAlign:"center",padding:32,color:T.textFaint,
                    ...MONO,fontSize:13}}>Loading…</div>
                )}
                {!loading&&results&&results.entries.length===0&&(
                  <div style={{textAlign:"center",padding:32,color:T.textFaint,
                    ...MONO,fontSize:13}}>No log entries found.</div>
                )}
                {!loading&&results&&results.entries.length>0&&(
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead>
                      <tr style={{borderBottom:`1px solid ${T.border}`,background:T.bgSide,
                        position:"sticky",top:0,zIndex:1}}>
                        {["Timestamp","Network","Channel","Nick","Type","Message"].map(h=>(
                          <th key={h} style={{...MONO,padding:"7px 12px",textAlign:"left",
                            fontSize:10,fontWeight:700,color:T.textFaint,
                            textTransform:"uppercase",letterSpacing:"0.06em",
                            whiteSpace:"nowrap",borderBottom:`1px solid ${T.border}`}}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.entries.map(e=>(
                        <tr key={e.id} style={{borderBottom:`1px solid ${T.borderFaint}`}}
                          onMouseEnter={ev=>ev.currentTarget.style.background=T.bgHover||T.border+"44"}
                          onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
                          <td style={{...MONO,padding:"6px 12px",color:T.textFaint,
                            fontSize:11,whiteSpace:"nowrap"}}>{fmtTime(e.timestamp)}</td>
                          <td style={{...MONO,padding:"6px 12px",color:T.textDim,
                            fontSize:11,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",
                            whiteSpace:"nowrap"}}>{e.network_name}</td>
                          <td style={{...MONO,padding:"6px 12px",color:T.accent||T.blue||"#58a6ff",
                            fontSize:11,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",
                            whiteSpace:"nowrap"}}>{e.channel||<span style={{color:T.textFaint}}>—</span>}</td>
                          <td style={{...MONO,padding:"6px 12px",color:T.textBright,
                            fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{e.nick}</td>
                          <td style={{padding:"6px 12px",whiteSpace:"nowrap"}}>
                            <span style={{...MONO,fontSize:10,fontWeight:700,
                              color:typeColor(e.type),background:typeColor(e.type)+"18",
                              borderRadius:3,padding:"1px 6px"}}>{e.type}</span>
                          </td>
                          <td style={{padding:"6px 12px",color:T.text,
                            maxWidth:320,overflow:"hidden",textOverflow:"ellipsis",
                            whiteSpace:"nowrap"}}
                            title={e.text}>{e.text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer: pagination + export */}
              <div style={{borderTop:`1px solid ${T.border}`,padding:"10px 16px",
                flexShrink:0,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                {results&&(
                  <span style={{...MONO,fontSize:11,color:T.textFaint}}>
                    {results.total.toLocaleString()} result{results.total!==1?"s":""} · page {page+1}/{Math.max(1,totalPages)}
                  </span>
                )}
                <div style={{display:"flex",gap:6}}>
                  <button disabled={page===0} onClick={()=>search(page-1)}
                    style={{...MONO,fontSize:11,padding:"4px 10px",borderRadius:4,
                      border:`1px solid ${T.border}`,background:"transparent",
                      color:page===0?T.textFaint:T.text,cursor:page===0?"default":"pointer"}}>
                    ← Prev
                  </button>
                  <button disabled={page+1>=totalPages} onClick={()=>search(page+1)}
                    style={{...MONO,fontSize:11,padding:"4px 10px",borderRadius:4,
                      border:`1px solid ${T.border}`,background:"transparent",
                      color:page+1>=totalPages?T.textFaint:T.text,cursor:page+1>=totalPages?"default":"pointer"}}>
                    Next →
                  </button>
                </div>
                <div style={{marginLeft:"auto",display:"flex",gap:8}}>
                  <button onClick={doExport} disabled={exporting}
                    style={{...MONO,fontSize:11,padding:"5px 12px",borderRadius:5,
                      border:`1px solid ${T.greenBorder||T.border}`,
                      background:T.greenBg||"transparent",
                      color:T.green||"#3fb950",cursor:"pointer"}}>
                    {exporting ? "Exporting…" : "⬇ Export CSV"}
                  </button>
                  {!deleteConfirm ? (
                    <button onClick={()=>setDeleteConfirm(true)}
                      style={{...MONO,fontSize:11,padding:"5px 12px",borderRadius:5,
                        border:`1px solid ${T.border}`,background:"transparent",
                        color:T.red||"#f85149",cursor:"pointer"}}>
                      🗑 Clear All Logs
                    </button>
                  ) : (
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{...MONO,fontSize:11,color:T.red||"#f85149"}}>
                        Delete all logs?
                      </span>
                      <button onClick={doDelete}
                        style={{...MONO,fontSize:11,padding:"4px 10px",borderRadius:4,
                          border:`1px solid ${T.red||"#f85149"}`,
                          background:T.red+"22"||"transparent",
                          color:T.red||"#f85149",cursor:"pointer"}}>
                        Yes, delete
                      </button>
                      <button onClick={()=>setDeleteConfirm(false)}
                        style={{...MONO,fontSize:11,padding:"4px 10px",borderRadius:4,
                          border:`1px solid ${T.border}`,background:"transparent",
                          color:T.textFaint,cursor:"pointer"}}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Logs tab ── */}
          {tab==="logs"&&(
            <div style={{flex:1,overflowY:"auto",padding:"24px 28px"}}>
              {!settings ? (
                <div style={{color:T.textFaint,...MONO,fontSize:13}}>Loading…</div>
              ) : (
                <div style={{maxWidth:440,display:"flex",flexDirection:"column",gap:20}}>

                  {/* Enable/disable toggle */}
                  <div style={{background:T.bg,borderRadius:8,border:`1px solid ${T.border}`,
                    padding:"16px 18px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div>
                        <div style={{...MONO,fontSize:13,fontWeight:700,color:T.textBright,
                          marginBottom:4}}>Enable Logging</div>
                        <div style={{fontSize:12,color:T.textFaint,lineHeight:1.5}}>
                          When enabled, IRC messages are saved to your personal log history.
                        </div>
                      </div>
                      <button
                        onClick={()=>setSettings(s=>({...s,enabled:!s.enabled}))}
                        style={{...MONO,flexShrink:0,marginLeft:16,padding:"5px 16px",
                          borderRadius:20,border:"none",cursor:"pointer",fontSize:12,
                          fontWeight:700,
                          background: settings.enabled ? (T.green||"#3fb950") : T.border,
                          color: settings.enabled ? "#fff" : T.textFaint}}>
                        {settings.enabled ? "ON" : "OFF"}
                      </button>
                    </div>
                  </div>

                  {/* Retention */}
                  <div style={{background:T.bg,borderRadius:8,border:`1px solid ${T.border}`,
                    padding:"16px 18px",opacity:settings.enabled?1:0.5}}>
                    <div style={{...MONO,fontSize:13,fontWeight:700,color:T.textBright,marginBottom:4}}>
                      Log Retention
                    </div>
                    <div style={{fontSize:12,color:T.textFaint,lineHeight:1.5,marginBottom:14}}>
                      Logs older than this many days are automatically deleted.
                      Set to <strong style={{color:T.text}}>0</strong> to keep logs forever.
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <input
                        type="number" min="0" max="3650"
                        disabled={!settings.enabled}
                        value={settings.retention_days}
                        onChange={e=>setSettings(s=>({...s,retention_days:parseInt(e.target.value)||0}))}
                        style={{...IS,width:100,textAlign:"right"}}
                      />
                      <span style={{fontSize:13,color:T.textFaint}}>days</span>
                      {settings.retention_days===0&&(
                        <span style={{...MONO,fontSize:11,color:T.amber||"#d4a72c",
                          background:(T.amber||"#d4a72c")+"18",borderRadius:4,padding:"2px 8px"}}>
                          keep forever
                        </span>
                      )}
                    </div>
                    {settings.retention_days > 0 && (
                      <div style={{marginTop:10,fontSize:12,color:T.textFaint}}>
                        Logs older than <strong style={{color:T.text}}>{settings.retention_days} days</strong> will be
                        automatically purged daily.
                      </div>
                    )}
                  </div>

                  {/* What gets logged */}
                  <div style={{background:T.bg,borderRadius:8,border:`1px solid ${T.border}`,
                    padding:"16px 18px"}}>
                    <div style={{...MONO,fontSize:13,fontWeight:700,color:T.textBright,marginBottom:10}}>
                      What Gets Logged
                    </div>
                    {[
                      ["PRIVMSG","Channel and direct messages"],
                      ["NOTICE","Server and user notices"],
                      ["JOIN / PART / QUIT","Join, leave, and quit events"],
                      ["KICK","Kick events"],
                      ["TOPIC","Topic changes"],
                      ["MODE","Mode changes"],
                    ].map(([type,desc])=>(
                      <div key={type} style={{display:"flex",alignItems:"center",
                        gap:10,marginBottom:7}}>
                        <span style={{...MONO,fontSize:10,fontWeight:700,
                          color:typeColor(type.split(" ")[0]),
                          background:typeColor(type.split(" ")[0])+"18",
                          borderRadius:3,padding:"1px 6px",minWidth:60,textAlign:"center"}}>
                          {type}
                        </span>
                        <span style={{fontSize:12,color:T.textFaint}}>{desc}</span>
                      </div>
                    ))}
                  </div>

                  {/* Save button */}
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <button onClick={saveSettings} disabled={settingsSaving}
                      style={{...MONO,padding:"8px 20px",borderRadius:6,border:"none",
                        background:T.accent||T.blue||"#238636",color:"#fff",
                        fontSize:13,fontWeight:700,cursor:"pointer"}}>
                      {settingsSaving ? "Saving…" : "Save Settings"}
                    </button>
                    {settingsMsg&&(
                      <span style={{fontSize:12,color:T.green||"#3fb950"}}>{settingsMsg}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Notifications tab ── */}
          {tab==="notifications"&&(
            <div style={{flex:1,overflowY:"auto",padding:"24px 28px"}}>
              <div style={{maxWidth:440,display:"flex",flexDirection:"column",gap:20}}>
                {/* ── Notifications ── */}
                <div style={{background:T.bg,borderRadius:8,border:`1px solid ${T.border}`,padding:"16px 18px"}}>
                  <div style={{...MONO,fontSize:13,fontWeight:700,color:T.textBright,marginBottom:4}}>
                    Browser Notifications
                  </div>
                  <div style={{fontSize:12,color:T.textFaint,lineHeight:1.5,marginBottom:14}}>
                    Get notified even when the tab is in the background.
                  </div>

                  {/* Permission status + request button */}
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,
                    padding:"10px 12px",borderRadius:6,
                    background: notifPerms==="granted"?T.greenBg:notifPerms==="denied"?T.redBg:T.accentBg,
                    border:`1px solid ${notifPerms==="granted"?T.greenBorder:notifPerms==="denied"?T.redBorder:T.accentDim}`}}>
                    <span style={{fontSize:14}}>
                      {notifPerms==="granted"?"🔔":notifPerms==="denied"?"🔕":"🔔"}
                    </span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:600,
                        color:notifPerms==="granted"?T.green:notifPerms==="denied"?T.red:T.accent}}>
                        {notifPerms==="granted"?"Notifications enabled"
                          :notifPerms==="denied"?"Notifications blocked by browser"
                          :"Notifications not yet enabled"}

                      </div>
                      {notifPerms==="denied"&&(
                        <div style={{fontSize:11,color:T.textFaint,marginTop:2,lineHeight:1.6}}>
                          {(()=>{
                            if (location.protocol !== "https:") return "Notifications require HTTPS. This page is loaded over HTTP — switch to a secure connection and try again.";
                            const ua = navigator.userAgent;
                            const isIOS = /iPad|iPhone|iPod/.test(ua);
                            const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
                            if (isIOS) return "iOS requires KoreChat to be installed to your home screen (Share → Add to Home Screen) before notifications can be enabled.";
                            if (isSafari) return "In Safari: go to Settings → Privacy → Manage Website Data, search for this site and Remove it, then reload KoreChat and click Enable.";
                            if (/Firefox/.test(ua)) return "In Firefox: click the lock icon or ⚠ in the address bar → Permissions → Notifications → Allow.";
                            if (/Edg/.test(ua)) return "In Edge: click the lock icon in the address bar → Permissions for this site → Notifications → Allow.";
                            return "Click the lock icon in your browser's address bar → Site settings → Notifications → Allow.";
                          })()}
                        </div>
                      )}
                    </div>
                    {notifPerms!=="granted"&&(
                      <button onClick={()=>{
                        if (notifPerms === "denied") {
                          // Safari caches denied in-session even if system settings changed.
                          // A full reload forces it to re-read the real permission.
                          window.location.reload();
                          return;
                        }
                        requestNotifPermission().then(p=>setNotifPerms(p));
                      }} style={{...MONO,padding:"5px 12px",borderRadius:6,border:"none",
                        background:notifPerms==="denied"?T.border:T.accent,
                        color:notifPerms==="denied"?T.textDim:"#fff",
                        fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                        {notifPerms==="denied"?"Reload page":"Enable"}
                      </button>
                    )}
                  </div>

                  {/* Notification toggles */}
                  {[
                    ["mentions","Mentions","Notify when someone says your nick in a channel"],
                    ["dms","Direct Messages","Notify when you receive a private message"],
                    ["onlyWhenHidden","Only when tab is hidden","Skip notifications when KoreChat is the active tab"],
                  ].map(([key, label, desc])=>(
                    <div key={key} style={{display:"flex",alignItems:"center",
                      justifyContent:"space-between",padding:"8px 0",
                      borderTop:`1px solid ${T.borderFaint}`}}>
                      <div>
                        <div style={{fontSize:13,color:T.text,fontWeight:500}}>{label}</div>
                        <div style={{fontSize:11,color:T.textFaint,marginTop:2}}>{desc}</div>
                      </div>
                      <button
                        disabled={notifPerms!=="granted"}
                        onClick={()=>saveNotifPrefs({...notifPrefs,[key]:notifPrefs[key]===false?true:!(notifPrefs[key]??true)})}
                        style={{...MONO,flexShrink:0,marginLeft:16,padding:"4px 14px",
                          borderRadius:20,border:"none",cursor:notifPerms==="granted"?"pointer":"not-allowed",
                          fontSize:11,fontWeight:700,opacity:notifPerms==="granted"?1:0.4,
                          background:(notifPrefs[key]??true)?T.green:T.border,
                          color:(notifPrefs[key]??true)?"#fff":T.textFaint}}>
                        {(notifPrefs[key]??true)?"ON":"OFF"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
// ─── Theme Picker Modal ────────────────────────────────────────────────────────
function ThemePicker({ T, theme, onSelect }) {
  const [open, setOpen] = React.useState(false);

  const PREVIEW = {
    dark:       { bg:"#080f1e", bgSide:"#090e1c", bgPanel:"#0d1629", border:"#1e2d4a", text:"#c8d8f0", textDim:"#7a9cc0", accent:"#7eb8f7", green:"#7ef7d0", amber:"#f7d07e", red:"#f7a07e", nick1:"#7eb8f7", nick2:"#7ef7d0", nick3:"#f7a07e" },
    light:      { bg:"#f0f4fa", bgSide:"#e4ecf7", bgPanel:"#ffffff", border:"#d0daea", text:"#1a2740", textDim:"#4a6080", accent:"#2563eb", green:"#059669", amber:"#d97706", red:"#dc2626", nick1:"#2563eb", nick2:"#059669", nick3:"#dc2626" },
    newmorning: { bg:"#303e4a", bgSide:"#28333d", bgPanel:"#242a33", border:"#28333d", text:"#f3f3f3", textDim:"#b7c5d1", accent:"#77abd9", green:"#97ea70", amber:"#f39c12", red:"#f92772", nick1:"#77abd9", nick2:"#97ea70", nick3:"#f39c12" },
    solarized:  { bg:"#002b36", bgSide:"#073642", bgPanel:"#073642", border:"#586e7520", text:"#839496", textDim:"#657b83", accent:"#268bd2", green:"#859900", amber:"#b58900", red:"#dc322f", nick1:"#268bd2", nick2:"#859900", nick3:"#b58900" },
    dracula:    { bg:"#282a36", bgSide:"#21222c", bgPanel:"#1e1f29", border:"#44475a40", text:"#f8f8f2", textDim:"#6272a4", accent:"#bd93f9", green:"#50fa7b", amber:"#ffb86c", red:"#ff5555", nick1:"#bd93f9", nick2:"#50fa7b", nick3:"#ff5555" },
  };

  return (
    <>
      <button
        onClick={()=>setOpen(true)}
        title="Switch theme"
        style={{background:T.accentBg,border:`1px solid ${T.accentDim}`,borderRadius:6,
          color:T.accent,fontSize:13,cursor:"pointer",padding:"4px 7px",lineHeight:1,
          fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}
        onMouseEnter={e=>e.currentTarget.style.background=T.accentBg2}
        onMouseLeave={e=>e.currentTarget.style.background=T.accentBg}>
        🎨
      </button>

      {open && (
        <div onClick={e=>{ if(e.target===e.currentTarget) setOpen(false); }}
          style={{position:"fixed",inset:0,background:"#00000070",zIndex:1000,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:T.bgPanel,border:`1px solid ${T.borderMid}`,borderRadius:12,
            padding:24,width:680,maxWidth:"95vw",maxHeight:"85vh",overflowY:"auto",
            boxShadow:"0 20px 60px #00000060"}}>

            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:T.textBright}}>Choose Theme</div>
                <div style={{fontSize:11,color:T.textFaint,marginTop:2}}>Select a color scheme for KoreChat</div>
              </div>
              <button onClick={()=>setOpen(false)}
                style={{background:"transparent",border:"none",color:T.textDim,fontSize:18,
                  cursor:"pointer",padding:"2px 6px",borderRadius:4,lineHeight:1}}
                onMouseEnter={e=>e.currentTarget.style.color=T.text}
                onMouseLeave={e=>e.currentTarget.style.color=T.textDim}>✕</button>
            </div>

            {/* Theme grid */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
              {Object.values(THEMES).map(t => {
                const P = PREVIEW[t.name] || PREVIEW.dark;
                const active = theme === t.name;
                return (
                  <div key={t.name} onClick={()=>{ onSelect(t.name); setOpen(false); }}
                    style={{borderRadius:8,overflow:"hidden",cursor:"pointer",
                      border:`2px solid ${active ? T.accent : T.borderFaint}`,
                      boxShadow: active ? `0 0 0 1px ${T.accent}40` : "none",
                      transition:"border-color 0.15s,box-shadow 0.15s"}}
                    onMouseEnter={e=>{ if(!active) e.currentTarget.style.borderColor=T.borderMid; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor=active?T.accent:T.borderFaint; }}>

                    {/* Mini IRC preview */}
                    <div style={{display:"flex",height:110,background:P.bg,fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>
                      {/* Sidebar */}
                      <div style={{width:88,background:P.bgSide,borderRight:`1px solid ${P.border}`,padding:"6px 0",flexShrink:0}}>
                        <div style={{padding:"2px 8px",fontSize:9,color:P.textDim,marginBottom:3,letterSpacing:"0.08em"}}>NETWORKS</div>
                        <div style={{padding:"3px 8px",background:P.accent+"22",borderLeft:`2px solid ${P.accent}`,color:P.accent,fontSize:9}}>● Ameth</div>
                        <div style={{padding:"3px 8px",color:P.textDim,fontSize:9,marginTop:1}}>○ Libera</div>
                        <div style={{padding:"2px 8px",fontSize:9,color:P.textDim,marginTop:4,letterSpacing:"0.08em"}}>CHANNELS</div>
                        <div style={{padding:"3px 8px",background:P.accent+"15",color:P.text,fontSize:9}}># general</div>
                        <div style={{padding:"3px 8px",color:P.textDim,fontSize:9}}># random</div>
                      </div>
                      {/* Messages */}
                      <div style={{flex:1,padding:"6px 8px",display:"flex",flexDirection:"column",gap:4,overflow:"hidden"}}>
                        <div style={{display:"flex",gap:4,alignItems:"baseline"}}>
                          <span style={{color:P.textDim,fontSize:8}}>12:34</span>
                          <span style={{color:P.nick1,fontWeight:600,fontSize:9}}>eerok</span>
                          <span style={{color:P.text,fontSize:9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>hey, this theme looks great</span>
                        </div>
                        <div style={{display:"flex",gap:4,alignItems:"baseline"}}>
                          <span style={{color:P.textDim,fontSize:8}}>12:35</span>
                          <span style={{color:P.nick2,fontWeight:600,fontSize:9}}>alice</span>
                          <span style={{color:P.text,fontSize:9}}>agreed! very clean 👍</span>
                        </div>
                        <div style={{display:"flex",gap:4,alignItems:"baseline"}}>
                          <span style={{color:P.textDim,fontSize:8}}>12:35</span>
                          <span style={{color:P.nick3,fontWeight:600,fontSize:9}}>bob</span>
                          <span style={{color:P.text,fontSize:9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>the colors work perfectly</span>
                        </div>
                        {/* Input bar */}
                        <div style={{marginTop:"auto",background:P.bgPanel,borderRadius:4,
                          border:`1px solid ${P.border}`,padding:"2px 6px",
                          color:P.textDim,fontSize:9}}>
                          Message #general...
                        </div>
                      </div>
                    </div>

                    {/* Label row */}
                    <div style={{background:T.bgPanel,padding:"8px 10px",
                      display:"flex",alignItems:"center",justifyContent:"space-between",
                      borderTop:`1px solid ${T.borderFaint}`}}>
                      <span style={{fontSize:12,fontWeight:active?700:500,
                        color:active?T.accent:T.text,fontFamily:"'Inter',sans-serif"}}>
                        {t.label}
                      </span>
                      {active
                        ? <span style={{fontSize:10,color:T.accent,fontWeight:600}}>✓ Active</span>
                        : <span style={{fontSize:10,color:T.textFaint}}>Click to apply</span>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function KoreChat({ currentUser: _currentUser, onLogout, onAdmin, appTheme, appToggleTheme, appSetTheme }) {
  const [isMobile, setIsMobile] = useState(()=>window.innerWidth<=768);
  useEffect(()=>{
    const handler = ()=>setIsMobile(window.innerWidth<=768);
    window.addEventListener("resize",handler);
    return ()=>window.removeEventListener("resize",handler);
  },[]);
    const [state, dispatch] = useReducer(reducer, INIT);
  const [me, setMe]        = useState(_currentUser); // local copy updated on profile save
  const [showAddNet,   setShowAddNet]   = useState(false);
  const [netSettings,  setNetSettings]  = useState(null); // network object being edited
  const [showUsers,    setShowUsers]    = useState(true);
  const [showUsersMobile, setShowUsersMobile] = useState(false);
  const [collapsed,    setCollapsed]    = useState({}); // key: netId+"::channels" | netId+"::dms"
  const [userMenu,     setUserMenu]     = useState(null); // {nick, pfx, x, y, chan, netId}
  const [ignoredNicks, setIgnoredNicks] = useState(new Set()); // client-side ignore list
  const [showProfile,  setShowProfile]  = useState(false);
  const [showLogs,     setShowLogs]     = useState(false);

  const [ctxMenu, setCtxMenu] = useState(null);     // {x,y,net} network right-click
const [chanCtxMenu, setChanCtxMenu] = useState(null); // {x,y,netId,chan,left} channel right-click
const [dmCtxMenu, setDmCtxMenu] = useState(null);     // {x,y,netId,nick} DM right-click
const [msgNickMenu, setMsgNickMenu] = useState(null); // {x,y,netId,nick} nick click in messages
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer


  // Notification preferences (persisted to sessionStorage, loaded once)
  const [notifPerms, setNotifPerms] = useState(() => getNotifPermission() || "default");
  // Re-sync permission state whenever it may have changed (e.g. user updated browser settings)
  React.useEffect(() => {
    const sync = () => setNotifPerms(getNotifPermission() || "default");
    sync();
    // Poll every 2s while Settings modal is open — catches Safari's delayed grant
    const id = setInterval(sync, 2000);
    return () => clearInterval(id);
  }, []);
  const [notifPrefs, setNotifPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("kc_notif_prefs") || "{}"); } catch { return {}; }
  });
  // notifPrefs: { mentions: bool, dms: bool, onlyWhenHidden: bool }
  const notifPrefsRef = React.useRef(notifPrefs);
  React.useEffect(() => { notifPrefsRef.current = notifPrefs; }, [notifPrefs]);
  const saveNotifPrefs = (p) => {
    setNotifPrefs(p);
    notifPrefsRef.current = p;
    localStorage.setItem("kc_notif_prefs", JSON.stringify(p));
  };

  // Listen for /ignore and /unignore events dispatched by the command handler
  useEffect(() => {
    const handler = (e) => {
      const { nick, add } = e.detail;
      setIgnoredNicks(prev => {
        const next = new Set(prev);
        add ? next.add(nick) : next.delete(nick);
        return next;
      });
    };
    window.addEventListener("irc-ignore", handler);
    return () => window.removeEventListener("irc-ignore", handler);
  }, []);
  const connections  = useRef({});  // networkId → WS handle
  const networksRef  = useRef({});  // always-current mirror of state.networks
  const myNickRef    = useRef({});  // always-current mirror of state.myNick
  const channelsRef  = useRef({});  // always-current mirror of state.channels
  const messagesRef  = useRef({});  // always-current mirror of state.messages
  const batchBufRef  = useRef({});  // netId+batchId → {type, chan, msgs[]}
  const namesBufRef  = useRef({});  // netId+chan → {nick: prefix} accumulator for 353/366
  const bottomRef    = useRef(null);
  const msgsRef      = useRef(null);

  const { networks, networkOrder, channels, messages, unread,
          activeNet, activeChan, myNick } = state;

  // Keep refs in sync with state so callbacks never close over stale values
  useEffect(() => { networksRef.current = networks; },  [networks]);
  useEffect(() => { myNickRef.current   = myNick; },    [myNick]);
  useEffect(() => { channelsRef.current = channels; },  [channels]);
  useEffect(() => { messagesRef.current  = messages; },  [messages]);

  const MONO = { fontFamily:"'JetBrains Mono',monospace" };

  // ── helpers ────────────────────────────────────────────────────────────────
  const addSys = useCallback((netId, chan, text, subtype) => {
    dispatch({ type:"ADD_MSG", netId, chan,
      msg:{ type:"system", subtype, text, time:new Date().toISOString() } });
  }, []);

  const ensureChan = useCallback((netId, chan) => {
    dispatch({ type:"CHAN_JOIN", netId, chan });
  }, []);

  // ── History loading ─────────────────────────────────────────────────────────
  // loadHistory: silently load logs for a channel/DM/server window.
  // 1. Fetches up to `limit` recent messages from our own Postgres logs (fast, always available).
  // 2. If the BNC is connected and the server supports CHATHISTORY, sends a CHATHISTORY LATEST
  //    request for any gap between the last log entry and now (catches messages we missed
  //    while logged out). Silent — no announcements either way.
  const loadedHistoryRef = useRef(new Set()); // keys we've already loaded this session

  const loadHistory = useCallback((netId, chan, { limit=150, force=false }={}) => {
    const key = `${netId}::${chan}`;
    if (!force && loadedHistoryRef.current.has(key)) return;
    if (force) loadedHistoryRef.current.delete(key);
    loadedHistoryRef.current.add(key);

    const isChannel = chan.startsWith("#") || chan.startsWith("&");
    const isDM = !isChannel && chan !== "__status__";

    // Find the oldest message already in state for this channel.
    // We only want log entries OLDER than what we already have — this prevents
    // re-fetching messages that the BNC ring buffer already replayed.
    const existingMsgs = messagesRef.current[`${netId}::${chan}`] || [];
    const existingTimes = existingMsgs
      .map(m => m.time ? new Date(m.time).getTime() : 0)
      .filter(t => t > 0);
    const oldestExisting = existingTimes.length ? Math.min(...existingTimes) : null;

    const params = new URLSearchParams({
      network_id: netId,
      limit: String(limit),
      order: "asc",
    });
    if (isChannel) params.set("channel", chan);
    else if (isDM)  params.set("nick", chan);
    // If we already have messages, only fetch history before the oldest one.
    // Add a 5-second buffer to catch any borderline messages.
    if (oldestExisting) {
      const beforeTs = new Date(oldestExisting + 5000).toISOString();
      params.set("date_to_iso", beforeTs);
    }

    fetch(`/api/v1/logs?${params}`, { credentials:"include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.entries?.length) return;
        const MEMBERSHIP_TYPES = new Set(["JOIN","PART","QUIT","KICK","MODE"]);
        const msgs = data.entries.map(e => ({
          type:    MEMBERSHIP_TYPES.has(e.type) ? "system" : "message",
          subtype: MEMBERSHIP_TYPES.has(e.type) ? "membership" : undefined,
          nick:    e.nick,
          text:    e.text,
          time:    e.timestamp,
          id:      `log-${e.id}`,
        }));
        ensureChan(netId, chan);
        dispatch({ type:"PREPEND_MSGS", netId, chan, msgs });

        // Ask the IRC server for anything newer than our last log entry (gap-fill).
        if (!isChannel) return;
        const lastTs = data.entries[data.entries.length - 1]?.timestamp;
        if (!lastTs) return;
        const conn = connections.current?.[netId];
        if (!conn) return;
        setTimeout(() => {
          conn.send(`CHATHISTORY LATEST ${chan} timestamp=${lastTs} 100`);
        }, 200);
      })
      .catch(() => {});
  }, [ensureChan]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── IRC line handler ────────────────────────────────────────────────────────
  // Uses refs so it never needs to be recreated when state changes
  const handleLine = useCallback((netId, raw) => {
    const { tags, prefix, command, params } = parseIRC(raw);
    const time = tags.time || new Date().toISOString();
    const from = nickOf(prefix);
    const me   = myNickRef.current[netId] || "";
    const nets = networksRef.current;
    const chans = channelsRef.current;

    switch (command) {
      case "001": {
        dispatch({ type:"SET_NICK",   netId, nick:params[0] });
        dispatch({ type:"NET_STATUS", id:netId, status:"connected" });
        ensureChan(netId, STATUS_CHAN);
        // History loaded by replay-done after ring buffer replay completes
        break;
      }

      case "372": case "375": case "376":
        ensureChan(netId, STATUS_CHAN);
        addSys(netId, STATUS_CHAN, params[params.length-1]||"");
        break;

      case "432": case "433":
        ensureChan(netId, STATUS_CHAN);
        addSys(netId, STATUS_CHAN, `⚠ ${params[params.length-1]}: ${params[1]||""}`);
        break;

      case "NICK": {
        const newNick = params[0];
        if (from===me) dispatch({ type:"SET_NICK", netId, nick:newNick });
        Object.keys(chans).filter(k=>k.startsWith(netId+"::")).forEach(k=>{
          const chan=k.split("::")[1], ch=chans[k];
          if (ch?.members && from in ch.members) {
            const pfx=ch.members[from];
            dispatch({ type:"DEL_MEMBER", netId, chan, nick:from });
            dispatch({ type:"SET_MEMBERS", netId, chan, members:{[newNick]:pfx} });
            addSys(netId, chan, `${from} is now known as ${newNick}`);
          }
        });
        break;
      }

      case "JOIN": {
        const chan=(params[0]||"").replace(/^:/,"");
        if (!chan) break;
        dispatch({ type:"CHAN_JOIN", netId, chan });
        if (from===me) {
          dispatch({ type:"SET_ACTIVE_CHAN", netId, chan });
          // History is loaded by replay-done after the full BNC replay completes.
          // Loading here would race with the replay sequence.
        } else {
          dispatch({ type:"SET_MEMBERS", netId, chan, members:{[from]:""} });
          addSys(netId, chan, `→ ${from} joined`, "membership");
        }
        break;
      }

      case "PART": {
        const chan=params[0]; if (!chan) break;
        if (from===me) dispatch({ type:"CHAN_PART", netId, chan });
        else { dispatch({ type:"DEL_MEMBER", netId, chan, nick:from }); addSys(netId, chan, `← ${from} left${params[1]?": "+params[1]:""}`, "membership"); }
        break;
      }

      case "KICK": {
        const [chan,target,,reason=""] = params;
        dispatch({ type:"DEL_MEMBER", netId, chan, nick:target });
        addSys(netId, chan, `✕ ${target} was kicked by ${from}${reason?": "+reason:""}`, "membership");
        if (target===me) dispatch({ type:"CHAN_PART", netId, chan });
        break;
      }

      case "QUIT": {
        const reason=params[0]||"";
        Object.keys(chans).filter(k=>k.startsWith(netId+"::")).forEach(k=>{
          const chan=k.split("::")[1];
          if (chans[k]?.members && from in chans[k].members) {
            dispatch({ type:"DEL_MEMBER", netId, chan, nick:from });
            addSys(netId, chan, `✕ ${from} quit${reason?": "+reason:""}`, "membership");
          }
        });
        break;
      }

      case "353": {
        // Accumulate NAMES reply batches — 366 (end of names) fires the replace
        const chan=params[2]; if (!chan) break;
        const key=netId+"::"+chan;
        if (!namesBufRef.current[key]) namesBufRef.current[key]={};
        (params[3]||"").trim().split(" ").forEach(e=>{
          if (!e) return;
          // multi-prefix: server may send multiple prefix chars e.g. "~@nick"
          // take the first (highest-ranked) prefix
          let pfxChars="", rest=e;
          while (rest.length && "~&@%+".includes(rest[0])) { pfxChars+=rest[0]; rest=rest.slice(1); }
          const pfx=pfxChars[0]||""; // highest prefix only
          const nick=rest;
          if (nick) namesBufRef.current[key][nick]=pfx;
        });
        break;
      }
      case "366": {
        // End of NAMES — atomically replace member list, clearing any stale entries
        const chan=params[1]; if (!chan) break;
        const key=netId+"::"+chan;
        const members=namesBufRef.current[key]||{};
        delete namesBufRef.current[key];
        dispatch({ type:"REPLACE_MEMBERS", netId, chan, members });
        break;
      }

      case "332": { const chan=params[1]; if (chan) dispatch({ type:"SET_TOPIC", netId, chan, topic:params[2]||"" }); break; }
      case "331": { const chan=params[1]; if (chan) dispatch({ type:"SET_TOPIC", netId, chan, topic:"" }); break; }
      case "TOPIC":
        dispatch({ type:"SET_TOPIC", netId, chan:params[0], topic:params[1]||"" });
        addSys(netId, params[0], `${from} set topic: ${params[1]||""}`);
        break;

      case "PRIVMSG":
      case "NOTICE": {
        const target=params[0], text=params[1]||"";
        // BNC control messages from the backend
        if (prefix==="*bnc*"||from==="*bnc*"||prefix==="*korechat*"||from==="*korechat*") {
          // status:<value> — update network connection status in the UI
          if (text.startsWith("status:")) {
            const status=text.slice(7);
            dispatch({ type:"NET_STATUS", id:netId, status });
            break;
          }
          // replay-done nick:<nick> — BNC ring buffer replay complete, update our nick.
          // Now silently load full history for all open windows from our own logs.
          if (text.startsWith("replay-done")) {
            const nickMatch=text.match(/nick:(\S+)/);
            if (nickMatch) dispatch({ type:"SET_NICK", netId, nick:nickMatch[1] });
            ensureChan(netId, STATUS_CHAN);

            // Sort all channel message arrays — the BNC ring buffer replays messages
            // in storage order which can be out of chronological sequence when
            // messages from multiple sessions are interleaved in the buffer.
            dispatch({ type:"SORT_MSGS", netId });

            // Then load DB history for anything older than the ring buffer.
            const prefix = netId + "::";
            const openKeys = Object.keys(channelsRef.current).filter(k => k.startsWith(prefix));
            setTimeout(() => {
              openKeys.forEach(k => {
                const chan = k.slice(prefix.length);
                loadHistory(netId, chan);
              });
            }, 100);
            break;
          }
          // Reconnect notices: suppress "Reconnecting in 5s… (attempt 1)" to avoid
          // alarming the user on brief hiccups. Show from attempt 2 onwards.
          if (text.startsWith("Reconnecting in ")) {
            const attemptMatch = text.match(/attempt (\d+)/);
            const attempt = attemptMatch ? parseInt(attemptMatch[1]) : 1;
            if (attempt > 1) {
              ensureChan(netId, STATUS_CHAN);
              addSys(netId, STATUS_CHAN, `⚠ ${text}`);
            }
            break;
          }
          // All other BNC/korechat notices → show in status channel
          ensureChan(netId, STATUS_CHAN); addSys(netId, STATUS_CHAN, text); break;
        }
        const isAction=text.startsWith("\x01ACTION ")&&text.endsWith("\x01");
        const displayText=isAction?`* ${from} ${text.slice(8,-1)}`:text;
        const isDM=target&&!target.startsWith("#");
        // If the sender has no ! it's a server hostname, not a user — fold into status channel
        const isServer=!prefix.includes("!");
        const chan=isServer?STATUS_CHAN:isDM?from:target;

        if (!chan) break;
        const msgObj={ type:"message", nick:from, text:displayText, time, id:tags.msgid||Math.random().toString(36) };
        // If this message carries a batch tag, route it into the batch accumulator
        if (tags.batch) {
          const bkey=netId+"::"+tags.batch;
          if (batchBufRef.current[bkey]) {
            batchBufRef.current[bkey].msgs.push({chan, msg:msgObj});
            break; // held until BATCH end
          }
        }
        ensureChan(netId, chan);
        dispatch({ type:"ADD_MSG", netId, chan, msg:msgObj });
        // History for DMs is loaded when the user navigates to the window (goTo)
        // or opens it via /msg. Loading here would race with incoming messages.

        // ── Browser notifications ──────────────────────────────────────────────
        if (getNotifPermission() === "granted") {
          const prefs = notifPrefsRef.current;
          const onlyHidden = prefs.onlyWhenHidden !== false; // default true
          const tabVisible = !document.hidden;
          if (!onlyHidden || !tabVisible) {
            const myNick = myNickRef.current[netId] || "";
            const isDM = !chan.startsWith("#");
            const isMention = !isDM && myNick && msgObj.text &&
              msgObj.text.toLowerCase().includes(myNick.toLowerCase()) &&
              msgObj.nick !== myNick;
            const shouldNotify =
              (isDM   && prefs.dms      !== false) ||
              (isMention && prefs.mentions !== false);
            if (shouldNotify && msgObj.nick) {
              const title = isDM
                ? `DM from ${msgObj.nick}`
                : `${msgObj.nick} mentioned you in ${chan}`;
              const body = msgObj.text?.slice(0, 120) || "";
              try {
                if (typeof Notification !== "undefined") {
                  const n = new Notification(title, {
                    body,
                    icon: "/icons/icon-192.png",
                    tag: `kc-${netId}-${chan}`,
                  });
                  n.onclick = () => { window.focus(); n.close(); };
                }
              } catch(e) {}
            }
          }
        }
        break;
      }

      case "BATCH": {
        const ref=params[0]||"";
        if (ref.startsWith("+")) {
          // BATCH start: +<id> <type> [<chan>]
          const id=ref.slice(1);
          const btype=params[1]||"";
          const bchan=params[2]||"";
          batchBufRef.current[netId+"::"+id]={ type:btype, chan:bchan, msgs:[] };
        } else if (ref.startsWith("-")) {
          // BATCH end: flush accumulated messages
          const id=ref.slice(1);
          const bkey=netId+"::"+id;
          const batch=batchBufRef.current[bkey];
          delete batchBufRef.current[bkey];
          if (!batch) break;
          const isChatHistory=batch.type==="chathistory"||batch.type==="draft/chathistory";
          if (isChatHistory && batch.msgs.length > 0) {
            // Group by channel and prepend as history
            const byChan={};
            batch.msgs.forEach(({chan,msg})=>{
              if (!byChan[chan]) byChan[chan]=[];
              byChan[chan].push(msg);
            });
            Object.entries(byChan).forEach(([chan,msgs])=>{
              ensureChan(netId, chan);
              dispatch({ type:"PREPEND_MSGS", netId, chan, msgs });
              // Silent — no announcement for server history
            });
          } else {
            // Non-history batch — dispatch messages normally
            batch.msgs.forEach(({chan,msg})=>{
              ensureChan(netId, chan);
              dispatch({ type:"ADD_MSG", netId, chan, msg });
            });
          }
        }
        break;
      }

      // Numeric replies — WHOIS results route to the target nick's DM window
      // so they're always easy to find and don't pollute channel chat
      case "311": { const dest=params[1]||activeChan[netId]||STATUS_CHAN; ensureChan(netId,dest); addSys(netId,dest,`⦿ ${params[1]}  (${params[2]}@${params[3]})  — ${params[5]||""}`); break; }
      case "312": { const dest=params[1]||activeChan[netId]||STATUS_CHAN; ensureChan(netId,dest); addSys(netId,dest,`  Server: ${params[2]}  (${params[3]||""})`); break; }
      case "317": { const dest=params[1]||activeChan[netId]||STATUS_CHAN; ensureChan(netId,dest); const idle=parseInt(params[2]||0); const h=Math.floor(idle/3600),m=Math.floor((idle%3600)/60),s=idle%60; addSys(netId,dest,`  Idle: ${h?h+"h ":""}${m?m+"m ":""}${s}s`); break; }
      case "318": { const dest=params[1]||activeChan[netId]||STATUS_CHAN; ensureChan(netId,dest); addSys(netId,dest,`  ─── end of whois ───`); break; }
      case "319": { const dest=params[1]||activeChan[netId]||STATUS_CHAN; ensureChan(netId,dest); addSys(netId,dest,`  Channels: ${params[2]||""}`); break; }
      case "330": { const dest=params[1]||activeChan[netId]||STATUS_CHAN; ensureChan(netId,dest); addSys(netId,dest,`  Account: ${params[2]}`); break; }
      case "321": break;
      case "322": ensureChan(netId,STATUS_CHAN); addSys(netId,STATUS_CHAN,`  ${params[1]}  (${params[2]} users)  ${params[3]||""}`); break;
      case "323": addSys(netId,STATUS_CHAN,"End of /LIST"); break;
      case "MODE": {
        const target=params[0], modeStr=params.slice(1).join(" ");
        if (target?.startsWith("#")) {
          addSys(netId,target,`${from} sets mode ${modeStr}`,"membership");
          // Update member prefixes for mode changes that affect them
          const modeChars=params[1]||"";
          const modeToPrefix={"o":"@","h":"%","v":"+","a":"&","q":"~"};
          let argIdx=2; let dir="+"; let memberModeChanged=false;
          for (const ch of modeChars) {
            if (ch==="+"||ch==="-") { dir=ch; continue; }
            if (modeToPrefix[ch]) {
              const nick=params[argIdx++];
              if (nick) {
                dispatch({ type:"SET_MEMBER_PREFIX", netId, chan:target, nick, prefix:dir==="+"?modeToPrefix[ch]:"" });
                memberModeChanged=true;
              }
            } else if ("beIklLjf".includes(ch)) {
              argIdx++; // these modes consume an argument but aren't member modes
            }
          }
          // After any member mode change, request fresh NAMES to get authoritative
          // prefix state (handles multi-prefix and mode removal correctly)
          if (memberModeChanged) {
            const conn=connections.current[netId];
            if (conn?.ready) conn.send(`NAMES ${target}`);
          }
        }
        break;
      }
      case "324": addSys(netId,params[1]||STATUS_CHAN,`Mode for ${params[1]}: ${params[2]||""}`); break;
      case "INVITE": ensureChan(netId,STATUS_CHAN); addSys(netId,STATUS_CHAN,`${from} invited you to ${params[1]}`); break;
      case "305": case "306": ensureChan(netId,STATUS_CHAN); addSys(netId,STATUS_CHAN,params[params.length-1]); break;
      case "381": ensureChan(netId,STATUS_CHAN); addSys(netId,STATUS_CHAN,`★ ${params[params.length-1]}`); break;
      case "491": case "464": ensureChan(netId,STATUS_CHAN); addSys(netId,STATUS_CHAN,`⚠ OPER failed: ${params[params.length-1]}`); break;
      case "ERROR":
        dispatch({ type:"NET_STATUS", id:netId, status:"error", msg:params[0]||"" });
        ensureChan(netId,STATUS_CHAN); addSys(netId,STATUS_CHAN,`ERROR: ${params[0]||""}`);
        break;

      default:
        if (/^\d+$/.test(command)) {
          const text=params[params.length-1]||"";
          if (!["333","005","004","002","003","001"].includes(command)&&text&&text!==me) {
            ensureChan(netId,STATUS_CHAN); addSys(netId,STATUS_CHAN,`[${command}] ${text}`);
          }
        }
        break;
    }
  }, [addSys, ensureChan]); // stable — reads live data via refs

  // ── connect / disconnect ───────────────────────────────────────────────────
  const connectNetwork = useCallback((net) => {
    if (!net?.id) return;
    if (connections.current[net.id]?.ready) {
      addSys(net.id, STATUS_CHAN, `Already connected to ${net.name}.`);
      return;
    }
    // Close any dead socket for this network first
    connections.current[net.id]?.close();
    delete connections.current[net.id];

    ensureChan(net.id, STATUS_CHAN);

    const conn = openWS({
      networkId: net.id,
      onLine:  line => handleLine(net.id, line),
      onClose: () => {
        const n = networksRef.current[net.id];
        dispatch({ type:"NET_STATUS", id:net.id, status:"disconnected" });
        addSys(net.id, STATUS_CHAN, `Disconnected from ${n?.name||net.name}`);
        delete connections.current[net.id];
      },
    });
    connections.current[net.id] = conn;
  }, [handleLine, addSys, ensureChan]);

  // reconnectNetwork explicitly tears down the upstream BNC connection and
  // starts a fresh one. Only call this when the user explicitly requests it
  // (manual connect button, /connect command, /reconnect command).
  const reconnectNetwork = useCallback((net) => {
    if (!net?.id) return;
    addSys(net.id, STATUS_CHAN, `Connecting to ${net.name} (${net.host}:${net.port})…`);
    API.connectNetwork(net.id).catch(()=>{});
    connectNetwork(net);
  }, [connectNetwork, addSys]);

  const disconnectNetwork = useCallback((netId) => {
    // Tell the BNC backend to drop the upstream IRC connection (no reconnect)
    API.disconnectNetwork(netId).catch(()=>{});
    // Close our local WS
    connections.current[netId]?.close();
    delete connections.current[netId];
    dispatch({ type:"NET_STATUS", id:netId, status:"disconnected" });
  }, []);

  // ── load networks on mount ─────────────────────────────────────────────────
  useEffect(() => {
    API.listNetworks()
      .then(nets => {
        if (!Array.isArray(nets)) return;
        nets.forEach(net => {
          dispatch({ type:"NET_ADD", net });
          // connectNetwork reads net directly (not from state), so safe to call immediately
          connectNetwork(net);
        });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount only

  // ── scroll to bottom ───────────────────────────────────────────────────────
  const activeChanName = activeNet ? activeChan[activeNet] : null;
  const activeMsgKey   = activeNet&&activeChanName ? CHAN_KEY(activeNet,activeChanName) : null;
  const activeMsgs     = (activeMsgKey ? (messages[activeMsgKey]||[]) : []).filter(m=>{
    if (m.nick && ignoredNicks.has(m.nick)) return false;
    // Status channel: suppress regular user PRIVMSG that got misrouted via stale ring buffer.
    // Legitimate server messages come from hostnames (contain ".") or have no nick.
    // System messages (joins, parts, notices) are always shown.
    if (activeChanName===STATUS_CHAN && m.type==="message" && m.nick && !m.nick.includes(".")) return false;
    return true;
  });

  // ── Scroll management ──────────────────────────────────────────────────────
  const [newMsgCount, setNewMsgCount] = useState(0);
  const isAtBottomRef = useRef(true);

  const scrollToBottom = useCallback((smooth=false) => {
    const el = msgsRef.current;
    if (!el) return;
    if (smooth) el.scrollTop = el.scrollHeight; // instant on mobile too
    else el.scrollTop = el.scrollHeight;
    setNewMsgCount(0);
    isAtBottomRef.current = true;
  }, []);

  // Scroll to bottom whenever the active channel changes, reset badge
  useEffect(() => {
    setNewMsgCount(0);
    prevMsgLenRef.current = 0;
    scrollToBottom();
  }, [activeNet, activeChanName]); // eslint-disable-line react-hooks/exhaustive-deps

  // When new messages arrive: scroll if at bottom, else increment badge
  const prevMsgLenRef = useRef(0);
  useEffect(() => {
    const len = activeMsgs.length;
    if (len === 0) { prevMsgLenRef.current = 0; return; }
    const added = len - prevMsgLenRef.current;
    prevMsgLenRef.current = len;
    if (added <= 0) return; // history prepend — don't badge, scroll handled by channel switch
    if (isAtBottomRef.current) {
      scrollToBottom();
    } else {
      setNewMsgCount(n => n + added);
    }
  }, [activeMsgs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track whether user is scrolled to the bottom
  useEffect(() => {
    const el = msgsRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      isAtBottomRef.current = atBottom;
      if (atBottom) setNewMsgCount(0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [activeNet, activeChanName]); // re-attach when channel changes
  useEffect(() => {
    if (activeNet&&activeChanName)
      dispatch({ type:"CLEAR_UNREAD", netId:activeNet, chan:activeChanName });
  }, [activeNet, activeChanName]);

  // ── command handler ────────────────────────────────────────────────────────
  const handleSend = useCallback((text) => {
    const netId = activeNet;
    // Read live values from refs, not stale closure state
    const nets  = networksRef.current;
    const nicks = myNickRef.current;
    const net   = netId ? nets[netId] : null;
    const conn  = netId ? connections.current[netId] : null;
    const me    = netId ? (nicks[netId]||"") : "";
    const chan  = activeChanName;

    const sys = t => {
      const destChan = chan || STATUS_CHAN;
      if (netId) { ensureChan(netId, destChan); addSys(netId, destChan, t); }
    };

    if (!text.startsWith("/")) {
      if (!conn?.ready) { sys("Not connected. Type /connect to connect."); return; }
      if (!chan||chan===STATUS_CHAN) { sys("Join a channel first (/join #channel)."); return; }
      conn.send(`PRIVMSG ${chan} :${text}`);
      dispatch({ type:"ADD_MSG", netId, chan, msg:{
        type:"message", nick:me, text, time:new Date().toISOString(), id:Math.random().toString(36)
      }});
      return;
    }

    const space=text.indexOf(" ");
    const cmd  =(space===-1?text:text.slice(0,space)).toLowerCase();
    const rest = space===-1?"":text.slice(space+1).trim();
    const args = rest?rest.split(/\s+/):[];

    switch (cmd) {
      case "/connect":
        if (!netId) { sys("No network selected."); break; }
        reconnectNetwork(net);
        break;

      case "/disconnect":
        if (!netId) { sys("No network selected."); break; }
        disconnectNetwork(netId);
        break;

      case "/reconnect":
        if (!netId) break;
        disconnectNetwork(netId);
        setTimeout(() => reconnectNetwork(networksRef.current[netId]), 800);
        break;

      case "/join": {
        if (!conn?.ready) { sys("Not connected. Type /connect first."); break; }
        const target=args[0]?(args[0].startsWith("#")?args[0]:"#"+args[0]):null;
        if (!target) { sys("Usage: /join #channel"); break; }
        conn.send(`JOIN ${target}`);
        break;
      }

      case "/part": case "/leave": {
        if (!conn?.ready) { sys("Not connected."); break; }
        const target=chan&&chan!==STATUS_CHAN?chan:args[0];
        if (!target) { sys("Usage: /part [reason]"); break; }
        conn.send(`PART ${target} :${rest||"Leaving"}`);
        break;
      }

      case "/close":
        if (chan&&netId) dispatch({ type:"CHAN_PART", netId, chan });
        break;

      case "/msg": case "/query": {
        if (!conn?.ready) { sys("Not connected."); break; }
        if (args.length<1) { sys("Usage: /msg <nick> [message]"); break; }
        const [tgt,...mp]=args;
        ensureChan(netId,tgt);
        dispatch({ type:"SET_ACTIVE_CHAN", netId, chan:tgt });
        loadHistory(netId, tgt); // load DM history
        if (mp.length>0) {
          const msgText=mp.join(" ");
          conn.send(`PRIVMSG ${tgt} :${msgText}`);
          dispatch({ type:"ADD_MSG", netId, chan:tgt, msg:{
            type:"message", nick:me, text:msgText, time:new Date().toISOString(), id:Math.random().toString(36)
          }});
        }
        break;
      }

      case "/me": {
        if (!conn?.ready) { sys("Not connected."); break; }
        if (!chan||chan===STATUS_CHAN) { sys("Join a channel first."); break; }
        if (!rest) { sys("Usage: /me <action>"); break; }
        conn.send(`PRIVMSG ${chan} :\x01ACTION ${rest}\x01`);
        dispatch({ type:"ADD_MSG", netId, chan, msg:{
          type:"message", nick:me, text:`* ${me} ${rest}`, time:new Date().toISOString(), id:Math.random().toString(36)
        }});
        break;
      }

      case "/notice":
        if (!conn?.ready||args.length<2) { sys("Usage: /notice <nick|#chan> <text>"); break; }
        conn.send(`NOTICE ${args[0]} :${args.slice(1).join(" ")}`);
        break;

      case "/nick":
        if (!conn?.ready) { sys("Not connected."); break; }
        if (!args[0]) { sys("Usage: /nick <newnick>"); break; }
        conn.send(`NICK ${args[0]}`);
        break;

      case "/oper": {
        if (!conn?.ready) { sys("Not connected."); break; }
        if (args.length < 2) { sys("Usage: /oper <name> <password>"); break; }
        conn.send(`OPER ${args[0]} ${args.slice(1).join(" ")}`);
        sys(`→ OPER sent for ${args[0]}`);
        break;
      }

      case "/away":
        if (!conn?.ready) { sys("Not connected."); break; }
        conn.send(rest?`AWAY :${rest}`:"AWAY");
        break;

      case "/back":
        if (conn?.ready) conn.send("AWAY");
        break;

      case "/topic": {
        if (!conn?.ready) { sys("Not connected."); break; }
        const target=chan&&chan!==STATUS_CHAN?chan:args[0];
        if (!target) { sys("Usage: /topic [text]"); break; }
        conn.send(rest&&chan!==STATUS_CHAN?`TOPIC ${target} :${rest}`:`TOPIC ${target}`);
        break;
      }

      case "/kick": {
        if (!conn?.ready) { sys("Not connected."); break; }
        if (!args[0]) { sys("Usage: /kick <nick> [reason]"); break; }
        const target=chan&&chan!==STATUS_CHAN?chan:null;
        if (!target) { sys("/kick must be used in a channel."); break; }
        conn.send(`KICK ${target} ${args[0]} :${args.slice(1).join(" ")||"Kicked"}`);
        break;
      }

      case "/ban": {
        if (!conn?.ready||!args[0]) { sys("Usage: /ban <mask>"); break; }
        const target=chan&&chan!==STATUS_CHAN?chan:null;
        if (!target) { sys("/ban must be used in a channel."); break; }
        conn.send(`MODE ${target} +b ${args[0]}`);
        break;
      }

      case "/unban": {
        if (!conn?.ready||!args[0]) { sys("Usage: /unban <mask>"); break; }
        const target=chan&&chan!==STATUS_CHAN?chan:null;
        if (!target) break;
        conn.send(`MODE ${target} -b ${args[0]}`);
        break;
      }

      case "/kickban": {
        if (!conn?.ready) { sys("Not connected."); break; }
        if (!args[0]) { sys("Usage: /kickban <nick> [reason]"); break; }
        const target=chan&&chan!==STATUS_CHAN?chan:null;
        if (!target) { sys("/kickban must be used in a channel."); break; }
        conn.send(`MODE ${target} +b ${args[0]}!*@*`);
        conn.send(`KICK ${target} ${args[0]} :${args.slice(1).join(" ")||"Kicked"}`);
        break;
      }

      case "/op": {
        if (!conn?.ready) { sys("Not connected."); break; }
        if (!args[0]) { sys("Usage: /op <nick> [nick2 ...]"); break; }
        const target=chan&&chan!==STATUS_CHAN?chan:null;
        if (!target) { sys("/op must be used in a channel."); break; }
        const nicks=args; const flags="+"+("o".repeat(nicks.length));
        conn.send(`MODE ${target} ${flags} ${nicks.join(" ")}`);
        break;
      }

      case "/deop": {
        if (!conn?.ready) { sys("Not connected."); break; }
        if (!args[0]) { sys("Usage: /deop <nick> [nick2 ...]"); break; }
        const target=chan&&chan!==STATUS_CHAN?chan:null;
        if (!target) { sys("/deop must be used in a channel."); break; }
        const nicks=args; const flags="-"+("o".repeat(nicks.length));
        conn.send(`MODE ${target} ${flags} ${nicks.join(" ")}`);
        break;
      }

      case "/voice": {
        if (!conn?.ready) { sys("Not connected."); break; }
        if (!args[0]) { sys("Usage: /voice <nick> [nick2 ...]"); break; }
        const target=chan&&chan!==STATUS_CHAN?chan:null;
        if (!target) { sys("/voice must be used in a channel."); break; }
        const nicks=args; const flags="+"+("v".repeat(nicks.length));
        conn.send(`MODE ${target} ${flags} ${nicks.join(" ")}`);
        break;
      }

      case "/devoice": {
        if (!conn?.ready) { sys("Not connected."); break; }
        if (!args[0]) { sys("Usage: /devoice <nick> [nick2 ...]"); break; }
        const target=chan&&chan!==STATUS_CHAN?chan:null;
        if (!target) { sys("/devoice must be used in a channel."); break; }
        const nicks=args; const flags="-"+("v".repeat(nicks.length));
        conn.send(`MODE ${target} ${flags} ${nicks.join(" ")}`);
        break;
      }

      case "/halfop": {
        if (!conn?.ready) { sys("Not connected."); break; }
        if (!args[0]) { sys("Usage: /halfop <nick> [nick2 ...]"); break; }
        const target=chan&&chan!==STATUS_CHAN?chan:null;
        if (!target) { sys("/halfop must be used in a channel."); break; }
        const nicks=args; const flags="+"+("h".repeat(nicks.length));
        conn.send(`MODE ${target} ${flags} ${nicks.join(" ")}`);
        break;
      }

      case "/dehalfop": {
        if (!conn?.ready) { sys("Not connected."); break; }
        if (!args[0]) { sys("Usage: /dehalfop <nick> [nick2 ...]"); break; }
        const target=chan&&chan!==STATUS_CHAN?chan:null;
        if (!target) { sys("/dehalfop must be used in a channel."); break; }
        const nicks=args; const flags="-"+("h".repeat(nicks.length));
        conn.send(`MODE ${target} ${flags} ${nicks.join(" ")}`);
        break;
      }

      case "/mode":
        if (!conn?.ready) { sys("Not connected."); break; }
        conn.send(rest?`MODE ${rest}`:`MODE ${chan&&chan!==STATUS_CHAN?chan:me}`);
        break;

      case "/invite": {
        if (!conn?.ready||!args[0]) { sys("Usage: /invite <nick> [#channel]"); break; }
        const target=args[1]||(chan!==STATUS_CHAN?chan:"");
        if (!target) { sys("Usage: /invite <nick> <#channel>"); break; }
        conn.send(`INVITE ${args[0]} ${target}`);
        break;
      }

      case "/whois":
        if (!conn?.ready) { sys("Not connected."); break; }
        if (!args[0]) { sys("Usage: /whois <nick>"); break; }
        conn.send(`WHOIS ${args[0]}`);
        ensureChan(netId,STATUS_CHAN);
        dispatch({ type:"SET_ACTIVE_CHAN", netId, chan:STATUS_CHAN });
        break;

      case "/who": {
        if (!conn?.ready) { sys("Not connected."); break; }
        const target=args[0]||(chan&&chan!==STATUS_CHAN?chan:"");
        if (!target) { sys("Usage: /who <#channel|nick>"); break; }
        conn.send(`WHO ${target}`);
        break;
      }

      case "/names": {
        if (!conn?.ready) break;
        const target=args[0]||(chan&&chan!==STATUS_CHAN?chan:"");
        if (target) conn.send(`NAMES ${target}`);
        break;
      }

      case "/list":
        if (!conn?.ready) { sys("Not connected."); break; }
        conn.send(args[0]?`LIST ${args[0]}`:"LIST");
        ensureChan(netId,STATUS_CHAN);
        dispatch({ type:"SET_ACTIVE_CHAN", netId, chan:STATUS_CHAN });
        break;

      case "/whowas":
        if (!conn?.ready) { sys("Not connected."); break; }
        if (!args[0]) { sys("Usage: /whowas <nick>"); break; }
        conn.send(`WHOWAS ${args[0]}`);
        ensureChan(netId,STATUS_CHAN);
        dispatch({ type:"SET_ACTIVE_CHAN", netId, chan:STATUS_CHAN });
        break;

      case "/stats":
        if (!conn?.ready) { sys("Not connected."); break; }
        conn.send(rest?`STATS ${rest}`:"STATS");
        ensureChan(netId,STATUS_CHAN);
        dispatch({ type:"SET_ACTIVE_CHAN", netId, chan:STATUS_CHAN });
        break;

      case "/links":
        if (!conn?.ready) { sys("Not connected."); break; }
        conn.send(args[0]?`LINKS ${args[0]}`:"LINKS");
        ensureChan(netId,STATUS_CHAN);
        dispatch({ type:"SET_ACTIVE_CHAN", netId, chan:STATUS_CHAN });
        break;

      case "/time":
        if (!conn?.ready) { sys("Not connected."); break; }
        conn.send(args[0]?`TIME ${args[0]}`:"TIME");
        break;

      case "/version":
        if (!conn?.ready) { sys("Not connected."); break; }
        conn.send(args[0]?`VERSION ${args[0]}`:"VERSION");
        break;

      case "/info":
        if (!conn?.ready) { sys("Not connected."); break; }
        conn.send(args[0]?`INFO ${args[0]}`:"INFO");
        ensureChan(netId,STATUS_CHAN);
        dispatch({ type:"SET_ACTIVE_CHAN", netId, chan:STATUS_CHAN });
        break;

      case "/motd":
        if (!conn?.ready) { sys("Not connected."); break; }
        conn.send(args[0]?`MOTD ${args[0]}`:"MOTD");
        ensureChan(netId,STATUS_CHAN);
        dispatch({ type:"SET_ACTIVE_CHAN", netId, chan:STATUS_CHAN });
        break;

      case "/lusers":
        if (!conn?.ready) { sys("Not connected."); break; }
        conn.send("LUSERS");
        break;

      case "/map":
        if (!conn?.ready) { sys("Not connected."); break; }
        conn.send("MAP");
        ensureChan(netId,STATUS_CHAN);
        dispatch({ type:"SET_ACTIVE_CHAN", netId, chan:STATUS_CHAN });
        break;

      case "/ping":
        if (!conn?.ready) { sys("Not connected."); break; }
        if (!args[0]) { sys("Usage: /ping <nick|server>"); break; }
        conn.send(`PING ${args[0]}`);
        sys(`→ PING ${args[0]}`);
        break;

      case "/ctcp": {
        if (!conn?.ready) { sys("Not connected."); break; }
        if (args.length < 2) { sys("Usage: /ctcp <nick> <command> [args]"); break; }
        const ctcpCmd=args[1].toUpperCase();
        const ctcpArgs=args.slice(2).join(" ");
        conn.send(`PRIVMSG ${args[0]} :\x01${ctcpCmd}${ctcpArgs?" "+ctcpArgs:""}\x01`);
        sys(`→ CTCP ${ctcpCmd} to ${args[0]}`);
        break;
      }

      case "/ignore": {
        if (!args[0]) { sys("Usage: /ignore <nick>"); break; }
        // Store ignores in component state via a custom event — client-side only
        window.dispatchEvent(new CustomEvent("irc-ignore", { detail:{ nick:args[0], add:true } }));
        sys(`Ignoring ${args[0]}`);
        break;
      }

      case "/unignore": {
        if (!args[0]) { sys("Usage: /unignore <nick>"); break; }
        window.dispatchEvent(new CustomEvent("irc-ignore", { detail:{ nick:args[0], add:false } }));
        sys(`No longer ignoring ${args[0]}`);
        break;
      }

      case "/quote": case "/raw":
        if (!conn?.ready) { sys("Not connected."); break; }
        if (!rest) { sys("Usage: /raw <IRC command>"); break; }
        conn.send(rest);
        sys(`→ ${rest}`);
        break;

      case "/clear":
        // Clear by flooding with an empty visual marker — simplest approach
        if (netId&&chan) addSys(netId,chan,"── cleared ──");
        break;

      case "/help":
        if (netId&&chan) {
          const specific=args[0]?CMDS["/"+args[0].replace(/^\//,"")]:null;
          if (specific) { addSys(netId,chan,`${cmd}: ${specific}`); }
          else Object.entries(CMDS).forEach(([c,d])=>addSys(netId,chan,`${c} — ${d}`));
        }
        break;

      default:
        sys(`Unknown command: ${cmd}  (type /help)`);
    }
  }, [activeNet, activeChanName, addSys, ensureChan, connectNetwork, reconnectNetwork, disconnectNetwork]);
  // Note: reads networks/myNick/channels via refs — not in dep array on purpose

  // ── derived ────────────────────────────────────────────────────────────────
  const activeNetObj  = activeNet ? networks[activeNet] : null;
  const activeChanObj = activeMsgKey ? (channels[activeMsgKey]||{}) : {};
  const activeMembers = activeChanObj.members || {};
  const activeTopic   = activeChanObj.topic   || "";
  const currentNick   = activeNet ? (myNick[activeNet]||"") : "";
  const isConnected   = activeNetObj?.status==="connected";
  const isStatusChan  = activeChanName===STATUS_CHAN;

  const owners  = Object.entries(activeMembers).filter(([,p])=>p==="~");
  const admins  = Object.entries(activeMembers).filter(([,p])=>p==="&");
  const ops     = Object.entries(activeMembers).filter(([,p])=>p==="@");
  const halfop  = Object.entries(activeMembers).filter(([,p])=>p==="%");
  const voiced  = Object.entries(activeMembers).filter(([,p])=>p==="+");
  const normal  = Object.entries(activeMembers).filter(([,p])=>!p);

  // Am I an op (or higher) in the active channel?
  const myPrefix = currentNick ? (activeMembers[currentNick]||"") : "";
  const amIop = myPrefix==="~"||myPrefix==="&"||myPrefix==="@";

  const theme = appTheme || "dark";
  const T = THEMES[theme] || THEMES.dark;
  const toggleTheme = appToggleTheme || (() => {});

  return (
    <ThemeCtx.Provider value={T}>
    <div style={{display:"flex",height:"100%",width:"100%",background:T.bg,
      overflow:"hidden",color:T.text,fontFamily:"'Inter var','Inter',sans-serif"}}>


      {showProfile&&(
        <ProfileModal
          currentUser={me}
          onClose={()=>setShowProfile(false)}
          onUpdated={updated=>{
            setMe(updated);
            // Bust avatar cache so sidebar and chat update immediately
            delete _avatarCache[updated.username];
            setShowProfile(false);
          }}
        />
      )}

      {showLogs&&(
        <UserSettingsModal onClose={()=>setShowLogs(false)}
          notifPerms={notifPerms} setNotifPerms={setNotifPerms}
          notifPrefs={notifPrefs} saveNotifPrefs={saveNotifPrefs} />
      )}

      {showAddNet&&(
        <AddNetworkModal
          onClose={()=>setShowAddNet(false)}
          onAdded={net=>{
            dispatch({ type:"NET_ADD", net });
            dispatch({ type:"SET_ACTIVE_NET", id:net.id });
            setShowAddNet(false);
            // Backend already started the BNC connection via AddNetwork —
            // just open the WS, don't call /connect again (would double-connect)
            setTimeout(() => connectNetwork(net), 50);
          }}
        />
      )}

      {netSettings&&(
        <NetworkSettingsModal
          net={netSettings}
          onClose={()=>setNetSettings(null)}
          onSaved={updated=>{
            dispatch({ type:"NET_UPDATE", net:updated });
            setNetSettings(null);
            // If the network was connected, offer to reconnect — but never force it.
            const wasConnected = networks[updated.id]?.status==="connected";
            if (wasConnected) {
              if (window.confirm(`Settings saved. Reconnect to ${updated.name} now to apply changes?`)) {
                disconnectNetwork(updated.id);
                setTimeout(() => reconnectNetwork(updated), 800);
              }
            }
          }}
          onDelete={id=>{
            disconnectNetwork(id);
            dispatch({ type:"NET_REMOVE", id });
            setNetSettings(null);
          }}
        />
      )}

      {/* User context menu popup — click on a member in the user list */}
      {userMenu&&(
        <UserMenuPopup
          menu={userMenu}
          onClose={()=>setUserMenu(null)}
          myPrefix={myPrefix}
          currentNick={currentNick}
          onSend={(netId, cmd) => {
            // Route commands directly through the connection for the given network
            const conn = connections.current[netId];
            if (!conn?.ready) return;
            // Re-use handleSend but we need to temporarily ensure context —
            // since the popup always acts on the active channel, handleSend works directly
            handleSend(cmd);
          }}
        />
      )}

      {/* Context menu for network (left-click or right-click) */}
      {ctxMenu&&(
        <div style={{position:"fixed",inset:0,zIndex:150}} onClick={()=>setCtxMenu(null)}>
          <div style={{position:"fixed",left:ctxMenu.x,top:ctxMenu.y,zIndex:151,
            background:T.bgPanel,border:`1px solid ${T.border}`,
            borderRadius:6,boxShadow:"0 4px 20px #0006",minWidth:175,padding:4}}
            onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{padding:"6px 12px 4px",borderBottom:`1px solid ${T.borderFaint}`,marginBottom:2}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <StatusDot status={ctxMenu.net.status||"disconnected"}/>
                <span style={{fontSize:13,fontWeight:700,color:T.textBright}}>{ctxMenu.net.name}</span>
              </div>
              <span style={{fontSize:11,color:T.textFaint,fontFamily:"'JetBrains Mono',monospace"}}>
                {ctxMenu.net.host}:{ctxMenu.net.port}
              </span>
            </div>
            <CtxItem icon="⚙" label="Edit Settings" onClick={()=>{setNetSettings(ctxMenu.net);setCtxMenu(null);}}/>
            {(ctxMenu.net.status==="disconnected"||ctxMenu.net.status==="error")&&(
              <CtxItem icon="⚡" label="Connect to IRC" color={T.green} onClick={()=>{reconnectNetwork(ctxMenu.net);setCtxMenu(null);}}/>
            )}
            {ctxMenu.net.status==="connected"&&(
              <CtxItem icon="✕" label="Disconnect from IRC" color={T.red} onClick={()=>{disconnectNetwork(ctxMenu.net.id);setCtxMenu(null);}}/>
            )}
          </div>
        </div>
      )}

      {/* ── Channel context menu ── */}
      {chanCtxMenu&&(
        <div style={{position:"fixed",inset:0,zIndex:150}} onClick={()=>setChanCtxMenu(null)}>
          <div style={{position:"fixed",left:chanCtxMenu.x,top:chanCtxMenu.y,zIndex:151,
            background:T.bgPanel,border:`1px solid ${T.border}`,
            borderRadius:6,boxShadow:"0 4px 20px #0006",minWidth:160,padding:4}}
            onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{padding:"6px 12px 4px",borderBottom:`1px solid ${T.borderFaint}`,
              marginBottom:2}}>
              <span style={{...MONO,fontSize:11,color:T.textDim}}>{chanCtxMenu.chan}</span>
            </div>
            {chanCtxMenu.left ? (
              <CtxItem color={T.green} icon="↩" label="Rejoin Channel" onClick={()=>{
                const c=connections.current[chanCtxMenu.netId];
                if (c) c.send(`JOIN ${chanCtxMenu.chan}`);
                setChanCtxMenu(null);
              }}/>
            ) : (
              <CtxItem color={T.red} icon="✕" label="Leave Channel" onClick={()=>{
                const c=connections.current[chanCtxMenu.netId];
                if (c) c.send(`PART ${chanCtxMenu.chan} :Leaving`);
                setChanCtxMenu(null);
              }}/>
            )}
            <CtxItem icon="🗑" label="Close & Remove" color={T.textDim} onClick={()=>{
              dispatch({type:"CHAN_PART_REMOVE",netId:chanCtxMenu.netId,chan:chanCtxMenu.chan});
              setChanCtxMenu(null);
            }}/>
          </div>
        </div>
      )}

      {/* ── DM context menu ── */}
      {dmCtxMenu&&(
        <div style={{position:"fixed",inset:0,zIndex:150}} onClick={()=>setDmCtxMenu(null)}>
          <div style={{position:"fixed",left:dmCtxMenu.x,top:dmCtxMenu.y,zIndex:151,
            background:T.bgPanel,border:`1px solid ${T.border}`,
            borderRadius:6,boxShadow:"0 4px 20px #0006",minWidth:160,padding:4}}
            onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{padding:"6px 12px 4px",borderBottom:`1px solid ${T.borderFaint}`,
              marginBottom:2,display:"flex",alignItems:"center",gap:8}}>
              <Avatar nick={dmCtxMenu.nick} size={20}/>
              <span style={{fontSize:13,fontWeight:600,color:T.textBright}}>{dmCtxMenu.nick}</span>
            </div>
            <CtxItem icon="✉" label="Send Message" onClick={()=>{
              dispatch({type:"SET_ACTIVE_NET",id:dmCtxMenu.netId});
              dispatch({type:"SET_ACTIVE_CHAN",netId:dmCtxMenu.netId,chan:dmCtxMenu.nick});
              setDmCtxMenu(null);
            }}/>
            <CtxItem icon="ℹ" label="WHOIS" onClick={()=>{
              const c=connections.current[dmCtxMenu.netId];
              if (c) c.send(`WHOIS ${dmCtxMenu.nick}`);
              setDmCtxMenu(null);
            }}/>
            <CtxItem icon="🔇" label="Ignore" color={T.textDim} onClick={()=>{
              setIgnoredNicks(prev=>{const n=new Set(prev);n.add(dmCtxMenu.nick);return n;});
              setDmCtxMenu(null);
            }}/>
            <CtxItem icon="🗑" label="Close" color={T.textDim} onClick={()=>{
              dispatch({type:"CHAN_PART_REMOVE",netId:dmCtxMenu.netId,chan:dmCtxMenu.nick});
              setDmCtxMenu(null);
            }}/>
          </div>
        </div>
      )}

      {/* ── Message nick context menu ── */}
      {msgNickMenu&&(
        <div style={{position:"fixed",inset:0,zIndex:150}} onClick={()=>setMsgNickMenu(null)}>
          <div style={{position:"fixed",left:msgNickMenu.x,top:msgNickMenu.y,zIndex:151,
            background:T.bgPanel,border:`1px solid ${T.border}`,
            borderRadius:6,boxShadow:"0 4px 20px #0006",minWidth:160,padding:4}}
            onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{padding:"6px 12px 5px",borderBottom:`1px solid ${T.borderFaint}`,
              marginBottom:2,display:"flex",alignItems:"center",gap:8}}>
              <Avatar nick={msgNickMenu.nick} size={22}/>
              <span style={{fontSize:14,fontWeight:700,color:T.textBright}}>{msgNickMenu.nick}</span>
            </div>
            <CtxItem icon="✉" label="Message" onClick={()=>{
              // Open or navigate to DM
              const netId=msgNickMenu.netId, nick=msgNickMenu.nick;
              const k=`${netId}::${nick}`;
              if (!channels[k]) dispatch({type:"CHAN_JOIN",netId,chan:nick});
              dispatch({type:"SET_ACTIVE_NET",id:netId});
              dispatch({type:"SET_ACTIVE_CHAN",netId,chan:nick});
              setMsgNickMenu(null);
            }}/>
            <CtxItem icon="ℹ" label="WHOIS" onClick={()=>{
              const c=connections.current[msgNickMenu.netId];
              if (c) c.send(`WHOIS ${msgNickMenu.nick}`);
              setMsgNickMenu(null);
            }}/>
            <CtxItem icon="🔇" label="Ignore" color={T.textDim} onClick={()=>{
              setIgnoredNicks(prev=>{const n=new Set(prev);n.add(msgNickMenu.nick);return n;});
              setMsgNickMenu(null);
            }}/>
          </div>
        </div>
      )}

      {/* ── Mobile overlay ── */}
      {sidebarOpen&&isMobile&&(
        <div onClick={()=>setSidebarOpen(false)}
          style={{position:"fixed",inset:0,background:"#00000060",zIndex:200}} />
      )}

      {/* ── Sidebar ── */}
      {(!isMobile||sidebarOpen)&&<div style={{
          width:224,flexShrink:0,background:T.bgSide,borderRight:`1px solid ${T.border}`,
          display:"flex",flexDirection:"column",overflow:"hidden",
          ...(isMobile?{position:"fixed",top:0,left:0,height:"100vh",zIndex:210,
            boxShadow:"4px 0 24px #00000060"}:{}),
        }}>

        {/* Logo + theme toggle + mobile close */}
        <div style={{padding:"13px 14px 10px",borderBottom:`1px solid ${T.border}`,flexShrink:0,
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontWeight:800,fontSize:15,letterSpacing:"-0.3px",color:T.textBright,
              fontFamily:"'JetBrains Mono',monospace",display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:22,height:22,borderRadius:6,background:"linear-gradient(135deg,#7eb8f7,#7ef7d0)",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,color:"#0a1628"}}>K</div>
              KoreChat
            </div>
            <div style={{fontSize:9,color:T.textGhost,marginTop:2,paddingLeft:30,
              fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.06em"}}>IRCv3</div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <ThemePicker T={T} theme={theme} onSelect={appSetTheme} />
            {/* Mobile close button */}
            {isMobile&&(
              <button onClick={()=>setSidebarOpen(false)}
                style={{background:"transparent",border:"none",color:T.textDim,
                  fontSize:20,cursor:"pointer",padding:"2px 4px",lineHeight:1}}>
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Add network button */}
        <button onClick={()=>setShowAddNet(true)}
          style={{margin:"8px 10px 4px",padding:"8px 12px",background:T.accentBg,
            border:`1px solid ${T.accentDim}`,borderRadius:6,color:T.accent,fontSize:13,
            cursor:"pointer",textAlign:"left",fontFamily:"'JetBrains Mono',monospace",
            display:"flex",alignItems:"center",gap:6,flexShrink:0}}
          onMouseEnter={e=>{e.currentTarget.style.background=T.accentBg2;}}
          onMouseLeave={e=>{e.currentTarget.style.background=T.accentBg;}}>
          ⊕ Add Network
        </button>

        {/* Network / channel list */}
        <div style={{flex:1,overflowY:"auto",paddingTop:4}}>
          {networkOrder.length===0&&(
            <div style={{...MONO,padding:"20px 14px",fontSize:12,color:T.textFaint,
              textAlign:"center",lineHeight:1.8}}>
              No networks yet.<br/>Click ⊕ Add Network<br/>to connect to IRC.
            </div>
          )}
          {networkOrder.map(netId => {
            const net=networks[netId];
            if (!net) return null;
            const isActiveNet=netId===activeNet;
            const activeChanName2=activeChan[netId];

            // Partition into server tab, channels, DMs
            const allKeys=Object.keys(channels).filter(k=>k.startsWith(netId+"::"));
            const allNames=allKeys.map(k=>k.split("::")[1]);

            const serverTab = allNames.includes(STATUS_CHAN) ? STATUS_CHAN : null;
            const chans = allNames
              .filter(n=>n!==STATUS_CHAN && n.startsWith("#"))
              .sort((a,b)=>a.localeCompare(b));
            const dms = allNames
              .filter(n=>n!==STATUS_CHAN && !n.startsWith("#"))
              .sort((a,b)=>a.localeCompare(b));

            const chansKey = netId+"::channels";
            const dmsKey   = netId+"::dms";
            const chansOpen = collapsed[chansKey] !== false; // default open
            const dmsOpen   = collapsed[dmsKey]   !== false;
            const toggle = key => setCollapsed(c=>({...c,[key]:c[key]===false?true:false}));

            const goTo = (chan) => {
              dispatch({type:"SET_ACTIVE_NET",id:netId});
              dispatch({type:"SET_ACTIVE_CHAN",netId,chan});
              dispatch({type:"CLEAR_UNREAD",netId,chan});
              setSidebarOpen(false); // close mobile drawer on channel select
              setTimeout(() => loadHistory(netId, chan), 100); // let messagesRef sync first
            };

            return (
              <div key={netId} style={{marginBottom:6}}>
                {/* Network header */}
                <div style={{padding:"5px 10px 3px",display:"flex",alignItems:"center",gap:6,
                  cursor:"pointer",borderRadius:4,margin:"0 4px"}}
                  onClick={e=>{setCtxMenu({x:e.clientX,y:e.clientY,net});dispatch({type:"SET_ACTIVE_NET",id:netId});}}
                  onContextMenu={e=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,net});}}
                  onMouseEnter={e=>e.currentTarget.style.background=T.border}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <StatusDot status={net.status||"disconnected"}/>
                  <span style={{...MONO,fontSize:11,fontWeight:700,color:isActiveNet?T.textBright:T.textDim,
                    flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                    textTransform:"uppercase",letterSpacing:"0.04em"}}>
                    {net.name}
                  </span>
                  {net.tls&&(
                    <span title="TLS encrypted" style={{fontSize:10,opacity:0.7,flexShrink:0}}>🔒</span>
                  )}
                  {!net.tls&&net.status==="connected"&&(
                    <span title="Unencrypted connection" style={{fontSize:10,opacity:0.5,flexShrink:0}}>🔓</span>
                  )}
                  {net.status==="connected"&&(
                    <span title="Connected" style={{fontSize:9,color:T.green,flexShrink:0}}>●</span>
                  )}
                  {net.status==="connecting"&&(
                    <span title="Connecting…" style={{fontSize:9,color:T.amber,flexShrink:0}}>●</span>
                  )}
                  {(net.status==="disconnected"||net.status==="error")&&(
                    <span title={net.status==="error"?"Connection error — will retry":"Disconnected"} style={{fontSize:9,color:T.red+"99",flexShrink:0}}>●</span>
                  )}
                  <span title="Settings" onClick={e=>{e.stopPropagation();setNetSettings(net);}}
                    style={{fontSize:11,opacity:0.4,cursor:"pointer",flexShrink:0,lineHeight:1,
                      padding:"1px 2px",borderRadius:3}}
                    onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                    onMouseLeave={e=>e.currentTarget.style.opacity="0.4"}>⚙</span>
                </div>

                {/* Indented content under this network */}
                <div style={{borderLeft:`1px solid ${T.borderFaint}`,marginLeft:14,paddingLeft:2}}>

                {/* Server tab */}
                {serverTab&&(
                  <SidebarItem chanName={STATUS_CHAN} kind="server"
                    active={isActiveNet&&activeChanName2===STATUS_CHAN}
                    unread={unread[CHAN_KEY(netId,STATUS_CHAN)]||0}
                    onClick={()=>goTo(STATUS_CHAN)}/>
                )}

                {/* Channels section */}
                {chans.length>0&&(
                  <>
                    <SectionHeader label="Channels" count={chans.length}
                      open={chansOpen} onToggle={()=>toggle(chansKey)}/>
                    {chansOpen&&chans.map(chanName=>{
                        const chanLeft = channels[CHAN_KEY(netId,chanName)]?.left;
                        return (
                          <SidebarItem key={chanName} chanName={chanName} kind="channel"
                            active={isActiveNet&&chanName===activeChanName2}
                            unread={unread[CHAN_KEY(netId,chanName)]||0}
                            left={!!chanLeft}
                            onClick={()=>goTo(chanName)}
                            onContextMenu={e=>{e.preventDefault();setChanCtxMenu({x:e.clientX,y:e.clientY,netId,chan:chanName,left:!!chanLeft});}}/>
                        );
                      })}
                  </>
                )}

                {/* DMs section */}
                {dms.length>0&&(
                  <>
                    <SectionHeader label="Messages" count={dms.length}
                      open={dmsOpen} onToggle={()=>toggle(dmsKey)}/>
                    {dmsOpen&&dms.map(chanName=>(
                      <SidebarItem key={chanName} chanName={chanName} kind="dm"
                        active={isActiveNet&&chanName===activeChanName2}
                        unread={unread[CHAN_KEY(netId,chanName)]||0}
                        onClick={()=>goTo(chanName)}
                        onContextMenu={e=>{e.preventDefault();setDmCtxMenu({x:e.clientX,y:e.clientY,netId,nick:chanName});}}/>
                    ))}
                  </>
                )}

                {/* Join channel */}
                {net.status==="connected"&&(
                  <div style={{...MONO,padding:"3px 10px 3px 24px",fontSize:12,
                    color:T.textDim,cursor:"pointer",marginTop:2}}
                    onClick={()=>{
                      const ch=prompt("Channel to join:");
                      if (!ch) return;
                      connections.current[netId]?.send(`JOIN ${ch.startsWith("#")?ch:"#"+ch}`);
                    }}
                    onMouseEnter={e=>e.currentTarget.style.color=T.accent}
                    onMouseLeave={e=>e.currentTarget.style.color=T.textDim}>
                    + join channel
                  </div>
                )}

                </div>{/* end indent wrapper */}
              </div>
            );
          })}
        </div>

        {/* User footer */}
        <div style={{padding:"9px 12px",borderTop:`1px solid ${T.borderFaint}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:me?.role==="admin"?7:0}}>
            <div style={{cursor:"pointer",flexShrink:0}} onClick={()=>setShowProfile(true)}
              title="Edit profile">
              <Avatar nick={me?.username||"?"} size={28}/>
            </div>
            <div style={{flex:1,overflow:"hidden",cursor:"pointer"}} onClick={()=>setShowProfile(true)}>
              <div style={{...MONO,fontSize:13,fontWeight:600,color:T.text,
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {me?.display_name||me?.username||""}
              </div>
              {currentNick&&currentNick!==me?.username&&(
                <div style={{fontSize:11,color:T.textFaint,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  IRC: {currentNick}
                </div>
              )}
            </div>
            <button onClick={onLogout} title="Sign out"
              style={{background:"transparent",border:"none",color:T.textFaint,fontSize:14,
                cursor:"pointer",padding:"2px 4px",flexShrink:0}}
              onMouseEnter={e=>e.currentTarget.style.color=T.red}
              onMouseLeave={e=>e.currentTarget.style.color=T.textFaint}>⏏</button>
          </div>
          {me?.role==="admin"&&(
            <button onClick={onAdmin}
              style={{...MONO,width:"100%",background:T.amberBg,border:`1px solid ${T.amberBorder}`,
                borderRadius:5,color:T.amber+"88",fontSize:11,padding:"5px 8px",cursor:"pointer",
                textAlign:"left"}}
              onMouseEnter={e=>{e.currentTarget.style.background=T.amberBg;e.currentTarget.style.color=T.amber;}}
              onMouseLeave={e=>{e.currentTarget.style.background=T.amberBg;e.currentTarget.style.color=T.amber+"88";}}>
              ⚙ Admin Panel
            </button>
          )}
          <button onClick={()=>setShowLogs(true)}
            style={{...MONO,width:"100%",background:"transparent",
              border:`1px solid ${T.borderFaint}`,marginTop:me?.role==="admin"?5:0,
              borderRadius:5,color:T.textFaint,fontSize:11,padding:"5px 8px",cursor:"pointer",
              textAlign:"left"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.text;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=T.borderFaint;e.currentTarget.style.color=T.textFaint;}}>
            ⚙ Settings
          </button>
        </div>
      </div>}

      {/* ── Main area ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>


        {/* Header */}
        <div style={{padding:"10px 18px",borderBottom:`1px solid ${T.borderFaint}`,background:T.bgSide,
          display:"flex",alignItems:"center",gap:12,flexShrink:0,minHeight:46}}>

          {isMobile&&(
            <button onClick={()=>setSidebarOpen(true)}
              style={{background:"transparent",border:"none",color:T.textDim,
                fontSize:20,cursor:"pointer",padding:"2px 6px",lineHeight:1,flexShrink:0}}>
              ☰
            </button>
          )}

          {activeChanName?(
            <>
              <span style={{...MONO,fontSize:15,fontWeight:700,color:T.textBright,flexShrink:0}}>
                {isStatusChan?`⚡ ${activeNetObj?.name||"server"}`:`#${activeChanName.replace(/^#/,"")}`}
              </span>
              {activeTopic&&!isStatusChan&&(
                <span style={{fontSize:13,color:T.textFaint,flex:1,overflow:"hidden",
                  textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeTopic}</span>
              )}
              <div style={{display:"flex",gap:6,marginLeft:"auto",flexShrink:0,alignItems:"center"}}>
                {isConnected&&(
                  <span style={{...MONO,fontSize:11,color:T.green,background:T.greenBg,
                    border:`1px solid ${T.greenBorder}`,borderRadius:4,padding:"2px 7px"}}>
                    ● {activeNetObj?.name}
                  </span>
                )}
                {!isStatusChan&&(
                  <button onClick={()=>isMobile?setShowUsersMobile(s=>!s):setShowUsers(s=>!s)}
                    style={{...MONO,background:(isMobile?showUsersMobile:showUsers)?T.accentBg3:"transparent",
                      border:`1px solid ${T.borderFaint}`,borderRadius:4,padding:"3px 9px",
                      fontSize:12,color:T.accent,cursor:"pointer"}}>
                    {Object.keys(activeMembers).length} users
                  </button>
                )}
              </div>
            </>
          ):(
            <span style={{...MONO,fontSize:13,color:T.textFaint}}>
              {networkOrder.length===0?"Add a network to get started":"Select a channel or /join #channel"}
            </span>
          )}
        </div>

        {/* Messages + member list */}
        <div style={{flex:1,display:"flex",overflow:"hidden",position:"relative"}}>
          <div ref={msgsRef} style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
            {activeMsgs.length===0&&activeChanName&&(
              <div style={{...MONO,padding:"32px 58px",color:T.textFaint,fontSize:13}}>
                {isStatusChan?"Waiting for server messages…":`No messages yet in ${activeChanName}`}
              </div>
            )}
            {(()=>{
              // Inject day separator markers between messages that span midnight.
              const msgsWithDays=[];
              let lastDay="";
              for (const m of activeMsgs) {
                if (m.time) {
                  const d=new Date(m.time);
                  const day=d.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});
                  if (day!==lastDay) {
                    msgsWithDays.push({type:"__daysep__",text:day,time:m.time});
                    lastDay=day;
                  }
                }
                msgsWithDays.push(m);
              }

              // Group consecutive membership events (join/part/quit/kick) into collapsible blocks.
              // All other messages render normally via MsgRow.
              const rows=[];
              let i=0;
              const msgs=msgsWithDays;
              while(i<msgs.length){
                const msg=msgs[i];
                if(msg.type==="__daysep__"){
                  rows.push(
                    <DaySeparator key={`day-${msg.time}`} label={msg.text}/>
                  );
                  i++;
                } else if(msg.type==="system"&&msg.subtype==="membership"){
                  // Collect run of consecutive membership events (skip day seps)
                  const group=[msg];
                  let j=i+1;
                  while(j<msgs.length&&
                    msgs[j].type==="system"&&
                    msgs[j].subtype==="membership"){
                    group.push(msgs[j]);
                    j++;
                  }
                  rows.push(<MembershipGroup key={`mg-${i}`} msgs={group}/>);
                  i=j;
                } else {
                  const prev=i>0?msgs[i-1]:null;
                  rows.push(
                    <MsgRow key={msg.id||i} msg={msg} prev={prev} myNick={currentNick}
                      onNickClick={(nick,e)=>{if(nick!==currentNick)setMsgNickMenu({x:e.clientX,y:e.clientY,netId:activeNet,nick});}}/>
                  );
                  i++;
                }
              }
              return rows;
            })()}
            <div ref={bottomRef}/>
          </div>

          {/* New messages badge — floats over message panel when scrolled up */}
          {newMsgCount > 0 && (
            <div onClick={()=>scrollToBottom(true)}
              style={{position:"absolute",bottom:12,left:"50%",transform:"translateX(-50%)",
                zIndex:20,cursor:"pointer",
                background:T.accent,color:"#fff",
                borderRadius:20,padding:"5px 16px",
                fontSize:13,fontFamily:"'JetBrains Mono',monospace",fontWeight:600,
                boxShadow:"0 2px 8px rgba(0,0,0,0.3)",
                display:"flex",alignItems:"center",gap:6,userSelect:"none",
                whiteSpace:"nowrap"}}>
              ↓ {newMsgCount} new message{newMsgCount===1?"":"s"}
            </div>
          )}

          {!isStatusChan&&activeChanName&&(isMobile?showUsersMobile:showUsers)&&(
            <div style={isMobile?{
                position:"absolute",top:0,right:0,bottom:0,width:200,zIndex:50,
                background:T.bgSide,borderLeft:`1px solid ${T.borderFaint}`,
                overflowY:"auto",boxShadow:"-4px 0 12px #00000040"
              }:{
                width:190,flexShrink:0,borderLeft:`1px solid ${T.borderFaint}`,
                background:T.bgSide,overflowY:"auto"
              }}>
              {[
                ["Owners",   owners,  "#f7d07e"],
                ["Admins",   admins,  "#f7a07e"],
                ["Operators",ops,     T.amber||"#f7c07e"],
                ["Half-ops", halfop,  "#a0f77e"],
                ["Voiced",   voiced,  "#7eb8f7"],
                ["Members",  normal,  T.textFaint],
              ].map(([lbl, list, color]) =>
                list.length===0 ? null : (
                  <div key={lbl}>
                    <div style={{...MONO,padding:"9px 10px 4px",fontSize:10,
                      color:T.textDim,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                      {lbl} — {list.length}
                    </div>
                    {list.map(([nick,pfx])=>(
                      <div key={nick} style={{display:"flex",alignItems:"center",gap:7,
                        padding:"4px 10px",borderRadius:3,margin:"1px 4px",cursor:"pointer"}}
                        onClick={e=>setUserMenu({nick,pfx,x:e.clientX,y:e.clientY,chan:activeChanName,netId:activeNet})}
                        onMouseEnter={e=>e.currentTarget.style.background=T.border}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <Avatar nick={nick} size={22}/>
                        <span style={{fontSize:13,color:T.textDim,flex:1,overflow:"hidden",
                          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nick}</span>
                        {pfx&&<span style={{...MONO,fontSize:11,fontWeight:700,
                          color,opacity:0.85}}>{pfx}</span>}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {activeChanName&&(
          <InputBar
            onSend={handleSend}
            label={isStatusChan?activeNetObj?.name||"server":activeChanName}
            nick={currentNick||"…"}
            disabled={!isConnected&&!isStatusChan}
          />
        )}
        {!activeChanName&&networkOrder.length>0&&(
          <div style={{...MONO,padding:"13px 18px",borderTop:`1px solid ${T.borderFaint}`,
            fontSize:13,color:T.textFaint}}>
            Type /join #channel to get started
          </div>
        )}
      </div>
    </div>
    </ThemeCtx.Provider>
  );
}

// ─── Auth API helpers ─────────────────────────────────────────────────────────
const AuthAPI = {
  setup:        ()    => fetch(`${API_BASE}/setup`).then(r=>r.json()),
  setupCreate:  (b)   => fetch(`${API_BASE}/setup`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b),credentials:"include"}).then(r=>r.json()),
  login:        (b)   => fetch(`${API_BASE}/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b),credentials:"include"}).then(r=>r.json()),
  logout:       ()    => fetch(`${API_BASE}/auth/logout`,{method:"POST",credentials:"include"}).then(r=>r.json()),
  me:           ()    => fetch(`${API_BASE}/auth/me`,{credentials:"include"}).then(r=>{if(!r.ok)throw new Error("unauth");return r.json();}),
  listUsers:    ()    => fetch(`${API_BASE}/admin/users`,{credentials:"include"}).then(r=>r.json()),
  createUser:   (b)   => fetch(`${API_BASE}/admin/users`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b),credentials:"include"}).then(r=>r.json()),
  updateUser:   (id,b)=> fetch(`${API_BASE}/admin/users/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(b),credentials:"include"}).then(r=>r.json()),
  deleteUser:   (id)  => fetch(`${API_BASE}/admin/users/${id}`,{method:"DELETE",credentials:"include"}),
};

// ─── Setup Wizard ─────────────────────────────────────────────────────────────
function SetupPage({ onDone }) {
  const T=useTheme();
  const [form, setForm] = useState({ username:"", password:"", password2:"", display_name:"" });
  const [err,  setErr]  = useState("");
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));

  const IS = {background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,
    color:T.text,padding:"10px 12px",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box"};
  const LS = {display:"block",fontSize:11,color:T.textMono,marginBottom:6,
    fontFamily:"'JetBrains Mono',monospace",textTransform:"uppercase",letterSpacing:"0.07em"};

  const submit = async () => {
    setErr("");
    if (!form.username.trim()) { setErr("Username is required."); return; }
    if (form.password.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (form.password !== form.password2) { setErr("Passwords do not match."); return; }
    setBusy(true);
    try {
      const res = await AuthAPI.setupCreate({
        username: form.username.trim(),
        password: form.password,
        display_name: form.display_name.trim() || form.username.trim(),
      });
      if (res.error) { setErr(res.error); return; }
      onDone(res);
    } catch(e) { setErr("Setup failed: "+e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:440}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:56,height:56,borderRadius:16,background:"linear-gradient(135deg,#7eb8f7,#7ef7d0)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:900,
            color:"#0a1628",margin:"0 auto 16px",fontFamily:"'JetBrains Mono',monospace"}}>K</div>
          <div style={{fontSize:22,fontWeight:800,color:T.textBright,fontFamily:"'JetBrains Mono',monospace"}}>Welcome to KoreChat</div>
          <div style={{fontSize:13,color:T.textFaint,marginTop:6}}>Create the first admin account to get started</div>
        </div>

        <div style={{background:T.bgPanel,border:`1px solid ${T.accentDim}`,borderRadius:12,padding:"28px 28px 24px",
          boxShadow:"0 24px 64px #00000060"}}>
          {err && <div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:6,
            padding:"9px 12px",fontSize:14,color:T.red,marginBottom:16}}>{err}</div>}

          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div>
              <label style={LS}>Username</label>
              <input value={form.username} onChange={set("username")} style={IS} placeholder="admin"
                onKeyDown={e=>e.key==="Enter"&&submit()} autoFocus />
            </div>
            <div>
              <label style={LS}>Display Name <span style={{opacity:0.4}}>(optional)</span></label>
              <input value={form.display_name} onChange={set("display_name")} style={IS} placeholder="Admin" />
            </div>
            <div>
              <label style={LS}>Password</label>
              <input type="password" value={form.password} onChange={set("password")} style={IS} placeholder="Min 8 characters" />
            </div>
            <div>
              <label style={LS}>Confirm Password</label>
              <input type="password" value={form.password2} onChange={set("password2")} style={IS}
                onKeyDown={e=>e.key==="Enter"&&submit()} />
            </div>
          </div>

          <button onClick={submit} disabled={busy}
            style={{width:"100%",marginTop:24,padding:"12px 0",background:"linear-gradient(135deg,#7eb8f7,#7ef7d0)",
              border:"none",borderRadius:8,color:"#0a1628",fontWeight:800,fontSize:15,cursor:busy?"wait":"pointer",
              fontFamily:"'JetBrains Mono',monospace",opacity:busy?0.7:1}}>
            {busy?"Creating…":"Create Admin Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const T=useTheme();
  const [form, setForm] = useState({ username:"", password:"" });
  const [err,  setErr]  = useState("");
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));

  const IS = {background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,
    color:T.text,padding:"10px 12px",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box"};
  const LS = {display:"block",fontSize:11,color:T.textMono,marginBottom:6,
    fontFamily:"'JetBrains Mono',monospace",textTransform:"uppercase",letterSpacing:"0.07em"};

  const submit = async () => {
    setErr("");
    if (!form.username || !form.password) { setErr("Username and password are required."); return; }
    setBusy(true);
    try {
      const res = await AuthAPI.login({ username:form.username, password:form.password });
      if (res.error) { setErr(res.error); return; }
      onLogin(res);
    } catch(e) { setErr("Login failed: "+e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:56,height:56,borderRadius:16,background:"linear-gradient(135deg,#7eb8f7,#7ef7d0)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:900,
            color:"#0a1628",margin:"0 auto 16px",fontFamily:"'JetBrains Mono',monospace"}}>K</div>
          <div style={{fontSize:22,fontWeight:800,color:T.textBright,fontFamily:"'JetBrains Mono',monospace"}}>KoreChat</div>
          <div style={{fontSize:13,color:T.textFaint,marginTop:6}}>Sign in to your account</div>
        </div>

        <div style={{background:T.bgPanel,border:`1px solid ${T.accentDim}`,borderRadius:12,padding:"28px 28px 24px",
          boxShadow:"0 24px 64px #00000060"}}>
          {err && <div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:6,
            padding:"9px 12px",fontSize:14,color:T.red,marginBottom:16}}>{err}</div>}

          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div>
              <label style={LS}>Username</label>
              <input value={form.username} onChange={set("username")} style={IS} placeholder="your username"
                onKeyDown={e=>e.key==="Enter"&&submit()} autoFocus />
            </div>
            <div>
              <label style={LS}>Password</label>
              <input type="password" value={form.password} onChange={set("password")} style={IS}
                onKeyDown={e=>e.key==="Enter"&&submit()} />
            </div>
          </div>

          <button onClick={submit} disabled={busy}
            style={{width:"100%",marginTop:24,padding:"12px 0",background:"linear-gradient(135deg,#7eb8f7,#7ef7d0)",
              border:"none",borderRadius:8,color:"#0a1628",fontWeight:800,fontSize:15,cursor:busy?"wait":"pointer",
              fontFamily:"'JetBrains Mono',monospace",opacity:busy?0.7:1}}>
            {busy?"Signing in…":"Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPanel({ currentUser, onBack, theme, toggleTheme }) {
  const T=useTheme();
  const [users,     setUsers]     = useState([]);
  const [err,       setErr]       = useState("");
  const [showAdd,   setShowAdd]   = useState(false);
  const [editUser,  setEditUser]  = useState(null);
  const [busy,      setBusy]      = useState(false);

  const MONO = {fontFamily:"'JetBrains Mono',monospace"};

  useEffect(() => {
    AuthAPI.listUsers().then(setUsers).catch(e=>setErr(e.message));
  }, []);

  const reload = () => AuthAPI.listUsers().then(setUsers).catch(e=>setErr(e.message));

  const deleteUser = async (id) => {
    if (!confirm("Delete this user? Their networks will also be deleted.")) return;
    await AuthAPI.deleteUser(id);
    reload();
  };

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'Inter var','Inter',sans-serif"}}>
      {/* Header */}
      <div style={{background:T.bgSide,borderBottom:`1px solid ${T.borderFaint}`,padding:"12px 24px",
        display:"flex",alignItems:"center",gap:16}}>
        <div style={{width:32,height:32,borderRadius:9,background:"linear-gradient(135deg,#7eb8f7,#7ef7d0)",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,
          color:"#0a1628",fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>K</div>
        <span style={{...MONO,fontWeight:800,fontSize:15,color:T.textBright}}>KoreChat Admin</span>
        <div style={{flex:1}}/>
        {toggleTheme&&<button onClick={toggleTheme} title="Toggle theme"
          style={{...MONO,background:T.accentBg,border:`1px solid ${T.accentDim}`,borderRadius:6,
            color:T.accent,padding:"4px 9px",fontSize:14,cursor:"pointer",marginRight:4}}>
          {T.label}
        </button>}
        <button onClick={onBack}
          style={{...MONO,background:T.accentBg,border:`1px solid ${T.accentDim}`,borderRadius:6,
            color:T.accent,padding:"5px 14px",fontSize:13,cursor:"pointer"}}>
          ← Back to Chat
        </button>
      </div>

      <div style={{maxWidth:840,margin:"0 auto",padding:"32px 24px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
          <div>
            <div style={{fontSize:20,fontWeight:800,color:"#e8f4ff"}}>User Management</div>
            <div style={{fontSize:12,color:"#ffffff35",marginTop:3}}>{users.length} user{users.length!==1?"s":""}</div>
          </div>
          <button onClick={()=>setShowAdd(true)}
            style={{...MONO,background:"#7eb8f7",border:"none",borderRadius:7,color:"#0a1628",
              fontWeight:700,padding:"8px 18px",fontSize:13,cursor:"pointer"}}>
            + Add User
          </button>
        </div>

        {err && <div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:6,
          padding:"9px 12px",fontSize:14,color:T.red,marginBottom:16}}>{err}</div>}

        <div style={{background:T.bgPanel,border:`1px solid ${T.borderFaint}`,borderRadius:10,overflow:"hidden"}}>
          {users.map((u,i)=>(
            <div key={u.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",
              borderBottom:i<users.length-1?`1px solid ${T.border}`:"none",
              background:u.id===currentUser.id?T.accentBg:"transparent"}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:nickColor(u.username)+"18",
                border:`1.5px solid ${nickColor(u.username)}33`,display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:15,fontWeight:700,color:nickColor(u.username),
                fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>
                {(u.username[0]||"?").toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontWeight:600,fontSize:14,color:T.textBright}}>{u.display_name||u.username}</span>
                  {u.id===currentUser.id&&<span style={{...MONO,fontSize:9,color:T.accent,
                    background:T.accentBg,border:`1px solid ${T.accentDim}`,borderRadius:3,padding:"1px 5px"}}>you</span>}
                </div>
                <div style={{fontSize:12,color:T.textFaint,marginTop:1}}>@{u.username}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                <span style={{...MONO,fontSize:10,padding:"2px 8px",borderRadius:4,
                  background:u.role==="admin"?T.amberBg:T.border,
                  border:`1px solid ${u.role==="admin"?T.amberBorder:T.borderFaint}`,
                  color:u.role==="admin"?T.amber:T.textFaint}}>
                  {u.role}
                </span>
                <button onClick={()=>setEditUser(u)}
                  style={{...MONO,background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,
                    color:T.textDim,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>
                  Edit
                </button>
                {u.id!==currentUser.id && (
                  <button onClick={()=>deleteUser(u.id)}
                    style={{...MONO,background:"transparent",border:`1px solid ${T.redBorder}`,borderRadius:5,
                      color:T.red+"60",padding:"4px 10px",fontSize:11,cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.color=T.red}
                    onMouseLeave={e=>e.currentTarget.style.color=T.red+"60"}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
          {users.length===0&&(
            <div style={{...MONO,padding:"32px",textAlign:"center",fontSize:12,color:T.textFaint}}>
              No users yet
            </div>
          )}
        </div>
      </div>

      {(showAdd||editUser) && (
        <UserFormModal
          user={editUser}
          onClose={()=>{setShowAdd(false);setEditUser(null);}}
          onSave={async(body)=>{
            setBusy(true);
            try {
              if (editUser) await AuthAPI.updateUser(editUser.id, body);
              else await AuthAPI.createUser(body);
              await reload();
              setShowAdd(false); setEditUser(null);
            } catch(e) { setErr(e.message); }
            finally { setBusy(false); }
          }}
          busy={busy}
        />
      )}
    </div>
  );
}

function UserFormModal({ user, onClose, onSave, busy }) {
  const T=useTheme();
  const isEdit = !!user;
  const [form, setForm] = useState({
    username:     user?.username     || "",
    display_name: user?.display_name || "",
    role:         user?.role         || "user",
    password:     "",
    password2:    "",
  });
  const [err, setErr] = useState("");
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));

  const IS = {background:T.bg,border:`1px solid ${T.border}`,borderRadius:6,
    color:T.text,padding:"9px 11px",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box"};
  const LS = {display:"block",fontSize:10,color:T.textMono,marginBottom:5,
    fontFamily:"'JetBrains Mono',monospace",textTransform:"uppercase",letterSpacing:"0.07em"};

  const submit = async () => {
    setErr("");
    if (!isEdit && !form.username) { setErr("Username is required."); return; }
    if (!isEdit && form.password.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (form.password && form.password !== form.password2) { setErr("Passwords do not match."); return; }
    const body = { display_name: form.display_name, role: form.role };
    if (!isEdit) body.username = form.username;
    if (form.password) body.password = form.password;
    await onSave(body);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"#000000bb",zIndex:400,display:"flex",
      alignItems:"center",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:T.bgPanel,border:`1px solid ${T.accentDim}`,borderRadius:12,width:420,
        boxShadow:"0 32px 96px #000e",overflow:"hidden"}}>
        <div style={{padding:"16px 20px 12px",borderBottom:`1px solid ${T.borderFaint}`,display:"flex",
          alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:14,fontWeight:800,color:T.textBright,fontFamily:"'JetBrains Mono',monospace"}}>
            {isEdit?"Edit User":"Add User"}
          </span>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.textFaint,fontSize:20,cursor:"pointer"}}>×</button>
        </div>
        <div style={{padding:"16px 20px"}}>
          {err&&<div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:6,
            padding:"8px 12px",fontSize:13,color:T.red,marginBottom:12}}>{err}</div>}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {!isEdit && <div><label style={LS}>Username *</label><input value={form.username} onChange={set("username")} style={IS} autoFocus /></div>}
            <div><label style={LS}>Display Name</label><input value={form.display_name} onChange={set("display_name")} style={IS} /></div>
            <div>
              <label style={LS}>Role</label>
              <select value={form.role} onChange={set("role")} style={{...IS,cursor:"pointer"}}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div><label style={LS}>{isEdit?"New Password (leave blank to keep)":"Password *"}</label><input type="password" value={form.password} onChange={set("password")} style={IS} /></div>
            <div><label style={LS}>Confirm Password</label><input type="password" value={form.password2} onChange={set("password2")} style={IS} onKeyDown={e=>e.key==="Enter"&&submit()} /></div>
          </div>
        </div>
        <div style={{padding:"12px 20px 16px",borderTop:`1px solid ${T.borderFaint}`,display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,
            color:T.textDim,padding:"8px 16px",fontSize:14,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"}}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy} style={{background:T.accent,border:"none",borderRadius:6,
            color:T.bg,fontWeight:700,padding:"8px 18px",fontSize:14,cursor:busy?"wait":"pointer",
            fontFamily:"'JetBrains Mono',monospace",opacity:busy?0.6:1}}>
            {busy?"Saving…":isEdit?"Save Changes":"Add User"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
// Handles the top-level routing: setup → login → chat (+ admin panel)
function App() {
  // "loading" | "setup" | "login" | "chat" | "admin"
  const [view,    setView]    = useState("loading");
  const [me,      setMe]      = useState(null);
  // Theme lives here at the root so Login/Setup/Admin all share it
  const [theme, setTheme] = useState(() => sessionStorage.getItem("kc_theme") || "dark");
  const T = THEMES[theme] || THEMES.dark;

  // Cycle through all available themes
  const toggleTheme = () => {
    const keys = Object.keys(THEMES);
    const next = keys[(keys.indexOf(theme) + 1) % keys.length];
    setTheme(next);
    sessionStorage.setItem("kc_theme", next);
  };

  // Keep body background in sync with theme (affects the area behind the app)
  useEffect(() => {
    document.body.style.background = T.bg;
  }, [T.bg]);

  useEffect(() => {
    (async () => {
      try {
        const { needed } = await AuthAPI.setup();
        if (needed) { setView("setup"); return; }
        const user = await AuthAPI.me();
        setMe(user);
        setView("chat");
      } catch {
        setView("login");
      }
    })();
  }, []);

  const handleLogout = async () => {
    await AuthAPI.logout();
    setMe(null);
    setView("login");
  };

  if (view==="loading") return null;

  // Auth pages get a simple themed wrapper with a toggle button in the corner
  const AuthWrapper = ({children}) => (
    <ThemeCtx.Provider value={T}>
      <div style={{position:"relative",minHeight:"100vh",background:T.bg}}>
        <button onClick={toggleTheme} title={`Switch to ${theme==="dark"?"light":"dark"} theme`}
          style={{position:"fixed",top:14,right:14,background:T.accentBg,border:`1px solid ${T.accentDim}`,
            borderRadius:6,color:T.accent,fontSize:15,cursor:"pointer",padding:"5px 9px",
            fontFamily:"'JetBrains Mono',monospace",zIndex:10}}>
          {T.label}
        </button>
        {children}
      </div>
    </ThemeCtx.Provider>
  );

  if (view==="setup") return <AuthWrapper><SetupPage onDone={u=>{setMe(u);setView("chat");}}/></AuthWrapper>;
  if (view==="login") return <AuthWrapper><LoginPage onLogin={u=>{setMe(u);setView("chat");}}/></AuthWrapper>;

  // KoreChat is always mounted once authenticated so IRC connections persist.
  // AdminPanel overlays on top rather than replacing KoreChat, preventing remount/reconnect.
  return (
    <ThemeCtx.Provider value={T}>
      <div style={{position:"relative",width:"100%",height:"100%",overflow:"hidden"}}>
        <KoreChat currentUser={me} onLogout={handleLogout} onAdmin={()=>setView("admin")}
          appTheme={theme} appToggleTheme={toggleTheme} appSetTheme={t=>{setTheme(t);sessionStorage.setItem("kc_theme",t);}}/>
        {view==="admin" && (
          <div style={{position:"fixed",inset:0,zIndex:500,background:T.bg}}>
            <AdminPanel currentUser={me} onBack={()=>setView("chat")} theme={theme} toggleTheme={toggleTheme}/>
          </div>
        )}
      </div>
    </ThemeCtx.Provider>
  );
}

// ─── Mount ────────────────────────────────────────────────────────────────────
const _kcRoot = ReactDOM.createRoot(document.getElementById("root"));
_kcRoot.render(React.createElement(App));
if (window.__korechatReady) window.__korechatReady();
