import { useState, useEffect, useRef, useCallback, useReducer } from "react";

// ─── Config ──────────────────────────────────────────────────────────────────
const WS_URL   = (location.protocol === "https:" ? "wss:" : "ws:") + "//" + (location.host || "localhost:8080") + "/ws";
const API_URL  = (location.protocol + "//" + (location.host || "localhost:8080")) + "/api/v1";

const IRC_CAPS = [
  "multi-prefix","away-notify","account-notify","extended-join",
  "server-time","message-tags","batch","labeled-response",
  "echo-message","invite-notify","cap-notify","userhost-in-names",
  "chghost","setname","draft/chathistory",
];

// ─── IRCv3 Parser ────────────────────────────────────────────────────────────
function parseIRCMessage(raw) {
  let pos = 0;
  const msg = { tags: {}, prefix: null, command: "", params: [] };
  if (pos < raw.length && raw[pos] === "@") {
    pos++;
    const end = raw.indexOf(" ", pos);
    if (end === -1) return msg;
    raw.slice(pos, end).split(";").forEach(tag => {
      const [k, v = ""] = tag.split("=");
      if (k) msg.tags[k] = v.replace(/\\:/g,";").replace(/\\s/g," ").replace(/\\\\/g,"\\");
    });
    pos = end + 1;
  }
  if (pos < raw.length && raw[pos] === ":") {
    pos++;
    const end = raw.indexOf(" ", pos);
    if (end === -1) { msg.prefix = raw.slice(pos); return msg; }
    msg.prefix = raw.slice(pos, end);
    pos = end + 1;
  }
  const cmdEnd = raw.indexOf(" ", pos);
  if (cmdEnd === -1) { msg.command = raw.slice(pos).toUpperCase(); return msg; }
  msg.command = raw.slice(pos, cmdEnd).toUpperCase();
  pos = cmdEnd + 1;
  while (pos < raw.length) {
    if (raw[pos] === ":") { msg.params.push(raw.slice(pos + 1)); break; }
    const end = raw.indexOf(" ", pos);
    if (end === -1) { msg.params.push(raw.slice(pos)); break; }
    msg.params.push(raw.slice(pos, end));
    pos = end + 1;
  }
  return msg;
}

function nickFromPrefix(prefix) {
  if (!prefix) return "";
  const i = prefix.indexOf("!");
  return i === -1 ? prefix : prefix.slice(0, i);
}

// ─── WebSocket IRC Connection ─────────────────────────────────────────────────
// Each "connection" is one WS socket to the backend.
// url = WS_URL for hub mode, WS_URL + "?network=<id>" for proxy mode.
function createIRCConnection({ url, nick, onLine, onOpen, onClose }) {
  let ws = null;
  let closed = false;

  function connect() {
    ws = new WebSocket(url);
    ws.onopen = () => {
      onOpen?.();
      // IRC registration
      ws.send(`CAP LS 302\r\n`);
      ws.send(`NICK ${nick}\r\n`);
      ws.send(`USER ${nick} 0 * :${nick}\r\n`);
      ws.send(`CAP REQ :${IRC_CAPS.join(" ")}\r\n`);
      ws.send(`CAP END\r\n`);
    };
    ws.onmessage = e => {
      e.data.split("\n").forEach(line => {
        line = line.trimEnd();
        if (line) onLine(line);
      });
    };
    ws.onclose = () => { if (!closed) onClose?.(); };
    ws.onerror = () => {};
  }

  connect();

  return {
    send: (raw) => ws?.readyState === WebSocket.OPEN && ws.send(raw + "\r\n"),
    close: () => { closed = true; ws?.close(); },
  };
}

// ─── Networks API ─────────────────────────────────────────────────────────────
const NetworksAPI = {
  list:   ()     => fetch(`${API_URL}/networks`).then(r => r.json()),
  create: (body) => fetch(`${API_URL}/networks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
  update: (id, body) => fetch(`${API_URL}/networks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
  delete: (id)  => fetch(`${API_URL}/networks/${id}`, { method: "DELETE" }),
};

// ─── State Reducer ───────────────────────────────────────────────────────────
const initState = {
  networks: [],          // [{id,name,host,port,nick,status,...}]
  activeNetwork: null,   // id
  channels: {},          // networkId → { channelName → { members, topic } }
  messages: {},          // networkId+channelName → [msg]
  unread: {},            // networkId+channelName → count
  activeChannel: {},     // networkId → channelName
  myNick: {},            // networkId → current nick
  ackedCaps: {},         // networkId → [cap]
  connected: {},         // networkId → bool
};

function chanKey(netId, chan) { return `${netId}::${chan}`; }

function reducer(state, action) {
  switch (action.type) {
    case "SET_NETWORKS": return { ...state, networks: action.networks };
    case "ADD_NETWORK":  return { ...state, networks: [...state.networks, action.network] };
    case "DEL_NETWORK":  return { ...state, networks: state.networks.filter(n => n.id !== action.id) };
    case "SET_CONNECTED": return { ...state, connected: { ...state.connected, [action.netId]: action.val } };
    case "SET_NICK":     return { ...state, myNick: { ...state.myNick, [action.netId]: action.nick } };
    case "SET_ACTIVE_NET": return { ...state, activeNetwork: action.netId };
    case "SET_ACTIVE_CHAN": return { ...state, activeChannel: { ...state.activeChannel, [action.netId]: action.chan } };
    case "ADD_CAP": {
      const existing = state.ackedCaps[action.netId] || [];
      return { ...state, ackedCaps: { ...state.ackedCaps, [action.netId]: [...new Set([...existing, ...action.caps])] } };
    }
    case "JOIN_CHANNEL": {
      const k = chanKey(action.netId, action.chan);
      return {
        ...state,
        channels: { ...state.channels, [k]: { members: {}, topic: "", ...(state.channels[k] || {}) } },
        messages: { ...state.messages, [k]: state.messages[k] || [] },
        unread:   { ...state.unread,   [k]: state.unread[k]   || 0  },
        activeChannel: state.activeChannel[action.netId] ? state.activeChannel : { ...state.activeChannel, [action.netId]: action.chan },
      };
    }
    case "PART_CHANNEL": {
      const k = chanKey(action.netId, action.chan);
      const newChannels = { ...state.channels };
      delete newChannels[k];
      // Find new active channel for this network
      const netChans = Object.keys(newChannels).filter(k2 => k2.startsWith(action.netId + "::"));
      const newActive = netChans.length > 0 ? netChans[0].split("::")[1] : null;
      return {
        ...state,
        channels: newChannels,
        activeChannel: { ...state.activeChannel, [action.netId]: newActive },
      };
    }
    case "SET_TOPIC": {
      const k = chanKey(action.netId, action.chan);
      return { ...state, channels: { ...state.channels, [k]: { ...(state.channels[k] || {}), topic: action.topic } } };
    }
    case "SET_MEMBERS": {
      const k = chanKey(action.netId, action.chan);
      return { ...state, channels: { ...state.channels, [k]: { ...(state.channels[k] || {}), members: { ...(state.channels[k]?.members || {}), ...action.members } } } };
    }
    case "REMOVE_MEMBER": {
      const k = chanKey(action.netId, action.chan);
      if (!state.channels[k]) return state;
      const members = { ...state.channels[k].members };
      delete members[action.nick];
      return { ...state, channels: { ...state.channels, [k]: { ...state.channels[k], members } } };
    }
    case "ADD_MESSAGE": {
      const k = chanKey(action.netId, action.chan);
      const msgs = [...(state.messages[k] || []), action.msg].slice(-500);
      const isActive = state.activeNetwork === action.netId && state.activeChannel[action.netId] === action.chan;
      return {
        ...state,
        messages: { ...state.messages, [k]: msgs },
        unread:   { ...state.unread, [k]: isActive ? 0 : (state.unread[k] || 0) + 1 },
      };
    }
    case "CLEAR_UNREAD": {
      const k = chanKey(action.netId, action.chan);
      return { ...state, unread: { ...state.unread, [k]: 0 } };
    }
    default: return state;
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function nickColor(nick) {
  const palette = ["#7eb8f7","#f7a07e","#a0f77e","#f7d07e","#d07ef7","#7ef7d0","#f77ea0","#f77ef7","#f7f77e","#7ea0f7"];
  let h = 0;
  for (let i = 0; i < nick.length; i++) h = (h * 31 + nick.charCodeAt(i)) & 0x7fffffff;
  return palette[h % palette.length];
}

const URL_RE = /(https?:\/\/[^\s]+)/g;
const MENTION_RE = /@(\w+)/g;

function renderText(text, myNick) {
  const parts = [];
  let last = 0;
  const combined = text.replace(URL_RE, "\x00URL\x00$1\x00END\x00").replace(MENTION_RE, "\x00MENTION\x00@$1\x00END\x00");
  let key = 0;
  const tokens = combined.split("\x00");
  let mode = null;
  tokens.forEach(tok => {
    if (tok === "URL")     { mode = "url";     return; }
    if (tok === "MENTION") { mode = "mention"; return; }
    if (tok === "END")     { mode = null;       return; }
    if (mode === "url") {
      parts.push(<a key={key++} href={tok} target="_blank" rel="noreferrer" style={{ color:"#7eb8f7", textDecoration:"underline", textDecorationStyle:"dotted" }}>{tok}</a>);
    } else if (mode === "mention") {
      const isMe = tok.slice(1) === myNick;
      parts.push(<mark key={key++} style={{ background: isMe ? "#f7a07e22":"#7eb8f722", color: isMe ? "#f7a07e":"#7eb8f7", borderRadius:3, padding:"0 3px" }}>{tok}</mark>);
    } else if (tok) {
      parts.push(<span key={key++}>{tok}</span>);
    }
  });
  return parts.length ? parts : text;
}

// ─── Components ──────────────────────────────────────────────────────────────

function Avatar({ nick, size = 28 }) {
  const c = nickColor(nick);
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:c+"18", border:`1.5px solid ${c}33`,
      display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.44,
      fontWeight:700, color:c, flexShrink:0, fontFamily:"'JetBrains Mono',monospace" }}>
      {nick[0]?.toUpperCase()}
    </div>
  );
}

function StatusDot({ status }) {
  const colors = { connected:"#4af7a0", connecting:"#f7d07e", disconnected:"#ffffff30", error:"#f7a07e" };
  const glow   = { connected:"0 0 6px #4af7a0", connecting:"0 0 6px #f7d07e66" };
  const c = colors[status] || colors.disconnected;
  return <div style={{ width:8, height:8, borderRadius:"50%", background:c, boxShadow:glow[status]||"none", flexShrink:0 }} />;
}

function Message({ msg, prev, myNick }) {
  const cont = prev?.type === "message" && prev.nick === msg.nick &&
    new Date(msg.time) - new Date(prev.time) < 300000;
  const isMention = msg.text?.includes("@" + myNick);
  return (
    <div
      style={{ display:"flex", gap:10, padding: cont ? "1px 12px" : "6px 12px 2px",
        background: isMention ? "#f7a07e08" : "transparent",
        borderLeft: isMention ? "2px solid #f7a07e44" : "2px solid transparent" }}
      onMouseEnter={e=>e.currentTarget.style.background=isMention?"#f7a07e10":"#ffffff06"}
      onMouseLeave={e=>e.currentTarget.style.background=isMention?"#f7a07e08":"transparent"}
    >
      <div style={{ width:28, flexShrink:0, paddingTop: cont?0:2 }}>
        {!cont && <Avatar nick={msg.nick} />}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        {!cont && (
          <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:1 }}>
            <span style={{ fontWeight:700, fontSize:13, color:nickColor(msg.nick), fontFamily:"'JetBrains Mono',monospace" }}>{msg.nick}</span>
            <span style={{ fontSize:10, color:"#ffffff30", fontFamily:"'JetBrains Mono',monospace" }}>{fmtTime(msg.time)}</span>
          </div>
        )}
        <p style={{ margin:0, fontSize:13.5, color:"#c8d8f0", lineHeight:1.5, wordBreak:"break-word" }}>
          {renderText(msg.text, myNick)}
        </p>
      </div>
    </div>
  );
}

function SystemMsg({ text, time }) {
  return (
    <div style={{ padding:"2px 12px 2px 52px" }}>
      <span style={{ fontSize:11, color:"#ffffff28", fontStyle:"italic", fontFamily:"'JetBrains Mono',monospace" }}>{text}</span>
      {time && <span style={{ fontSize:10, color:"#ffffff18", fontFamily:"'JetBrains Mono',monospace", marginLeft:6 }}>{fmtTime(time)}</span>}
    </div>
  );
}

// ─── Network Manager Modal ───────────────────────────────────────────────────
const DEFAULT_NET = { name:"", host:"", port:6667, nick:"korechat", username:"korechat", realname:"KoreChat User", password:"", auto_join:"" };

function NetworkModal({ networks, onClose, onAdd, onDelete }) {
  const [tab, setTab]     = useState("list"); // list | add
  const [form, setForm]   = useState(DEFAULT_NET);
  const [err, setErr]     = useState("");
  const [saving, setSaving] = useState(false);

  const field = (key) => ({
    value: form[key],
    onChange: e => setForm(f => ({ ...f, [key]: e.target.value }))
  });

  const handleAdd = async () => {
    setErr("");
    if (!form.name || !form.host || !form.nick) { setErr("Name, host and nick are required."); return; }
    setSaving(true);
    try {
      const net = await NetworksAPI.create({
        ...form,
        port: parseInt(form.port) || 6667,
        auto_join: form.auto_join ? form.auto_join.split(",").map(s => s.trim()).filter(Boolean) : [],
      });
      if (net.error) { setErr(net.error); return; }
      onAdd(net);
      setForm(DEFAULT_NET);
      setTab("list");
    } catch (e) {
      setErr("Server error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    background:"#0a1628", border:"1px solid #ffffff18", borderRadius:6,
    color:"#c8d8f0", padding:"7px 10px", fontSize:13, outline:"none", width:"100%",
    fontFamily:"'Inter var','Inter',sans-serif", boxSizing:"border-box",
  };
  const labelStyle = { fontSize:11, color:"#ffffff50", display:"block", marginBottom:4, fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.06em", textTransform:"uppercase" };
  const btnPrimary = { background:"#7eb8f7", color:"#0a1628", border:"none", borderRadius:6, padding:"8px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'JetBrains Mono',monospace" };
  const btnSecondary = { background:"transparent", color:"#7eb8f7", border:"1px solid #7eb8f730", borderRadius:6, padding:"8px 18px", fontSize:13, cursor:"pointer", fontFamily:"'JetBrains Mono',monospace" };

  return (
    <div style={{ position:"fixed", inset:0, background:"#000000aa", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#0d1f38", border:"1px solid #7eb8f720", borderRadius:12, width:480, maxHeight:"80vh", display:"flex", flexDirection:"column", boxShadow:"0 24px 80px #000c" }}>
        {/* Header */}
        <div style={{ padding:"16px 20px 0", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #ffffff08", paddingBottom:14 }}>
          <span style={{ fontSize:15, fontWeight:800, color:"#e8f4ff", fontFamily:"'JetBrains Mono',monospace" }}>IRC Networks</span>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:"#ffffff50", fontSize:20, cursor:"pointer", lineHeight:1 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:0, padding:"0 20px", borderBottom:"1px solid #ffffff08" }}>
          {["list","add"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background:"transparent", border:"none", borderBottom: tab===t ? "2px solid #7eb8f7" : "2px solid transparent",
              color: tab===t ? "#7eb8f7" : "#ffffff40", padding:"10px 16px 8px", fontSize:12,
              cursor:"pointer", fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase", letterSpacing:"0.06em"
            }}>{t === "list" ? "Networks" : "+ Add Network"}</button>
          ))}
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:20 }}>
          {tab === "list" && (
            networks.length === 0
              ? <div style={{ textAlign:"center", color:"#ffffff30", padding:"32px 0", fontSize:13, fontFamily:"'JetBrains Mono',monospace" }}>
                  No networks yet.<br/>Click "+ Add Network" to connect to an IRC server.
                </div>
              : networks.map(n => (
                <div key={n.id} style={{ background:"#0a1628", border:"1px solid #ffffff10", borderRadius:8, padding:"12px 14px", marginBottom:8, display:"flex", alignItems:"center", gap:12 }}>
                  <StatusDot status={n.status || "disconnected"} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:"#e8f4ff", fontFamily:"'JetBrains Mono',monospace" }}>{n.name}</div>
                    <div style={{ fontSize:11, color:"#ffffff40", marginTop:2 }}>{n.host}:{n.port} · {n.nick}</div>
                    {n.status_msg && <div style={{ fontSize:11, color:"#f7a07e", marginTop:2 }}>{n.status_msg}</div>}
                  </div>
                  <button onClick={() => onDelete(n.id)} style={{ background:"transparent", border:"1px solid #f7a07e30", borderRadius:4, color:"#f7a07e", padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:"'JetBrains Mono',monospace" }}>Remove</button>
                </div>
              ))
          )}

          {tab === "add" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {err && <div style={{ background:"#f7a07e18", border:"1px solid #f7a07e40", borderRadius:6, padding:"8px 12px", fontSize:12, color:"#f7a07e" }}>{err}</div>}

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={labelStyle}>Network Name</label>
                  <input {...field("name")} placeholder="e.g. Libera.Chat" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Server Host</label>
                  <input {...field("host")} placeholder="irc.libera.chat" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Port</label>
                  <input {...field("port")} type="number" placeholder="6667" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Nick</label>
                  <input {...field("nick")} placeholder="YourNick" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Alt Nick</label>
                  <input {...field("alt_nick")} placeholder="YourNick_" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Username</label>
                  <input {...field("username")} placeholder="yournick" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Realname</label>
                  <input {...field("realname")} placeholder="Your Name" style={inputStyle} />
                </div>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={labelStyle}>Server Password <span style={{ opacity:0.5 }}>(optional)</span></label>
                  <input {...field("password")} type="password" placeholder="Leave blank if not required" style={inputStyle} />
                </div>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={labelStyle}>Auto-join Channels <span style={{ opacity:0.5 }}>(comma separated)</span></label>
                  <input {...field("auto_join")} placeholder="#linux, #programming, #chat" style={inputStyle} />
                </div>
              </div>

              <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:4 }}>
                <button onClick={() => setTab("list")} style={btnSecondary}>Cancel</button>
                <button onClick={handleAdd} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Add Network"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Input Bar ───────────────────────────────────────────────────────────────
const COMMANDS = ["/join","/part","/topic","/nick","/away","/back","/me","/msg","/names","/quit","/list"];

function InputBar({ onSend, channel, nick }) {
  const [val, setVal]       = useState("");
  const [hist, setHist]     = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [showCmds, setShowCmds] = useState(false);

  const filtered = COMMANDS.filter(c => val.startsWith("/") && c.startsWith(val));

  const submit = () => {
    const v = val.trim();
    if (!v) return;
    onSend(v);
    setHist(h => [v, ...h.slice(0,49)]);
    setHistIdx(-1);
    setVal("");
    setShowCmds(false);
  };

  return (
    <div style={{ padding:"10px 12px", borderTop:"1px solid #ffffff0c", background:"#0a1628" }}>
      {showCmds && filtered.length > 0 && (
        <div style={{ background:"#0d1f38", border:"1px solid #7eb8f720", borderRadius:6, padding:"4px 0", marginBottom:6 }}>
          {filtered.map(cmd => (
            <div key={cmd} onClick={() => { setVal(cmd + " "); setShowCmds(false); }}
              style={{ padding:"4px 12px", fontSize:12, color:"#7eb8f7", cursor:"pointer", fontFamily:"'JetBrains Mono',monospace" }}
              onMouseEnter={e=>e.currentTarget.style.background="#7eb8f710"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >{cmd}</div>
          ))}
        </div>
      )}
      <div style={{ display:"flex", alignItems:"center", gap:8, background:"#0d1f38", borderRadius:8, border:"1px solid #ffffff12", padding:"6px 12px" }}>
        <span style={{ fontSize:12, color:"#ffffff30", fontFamily:"'JetBrains Mono',monospace", flexShrink:0 }}>{channel}</span>
        <span style={{ color:"#ffffff15" }}>›</span>
        <input
          value={val}
          onChange={e => { setVal(e.target.value); setShowCmds(e.target.value.startsWith("/")); }}
          onKeyDown={e => {
            if (e.key === "Enter") { submit(); }
            else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.min(histIdx+1, hist.length-1); setHistIdx(n); setVal(hist[n]||""); }
            else if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.max(histIdx-1,-1); setHistIdx(n); setVal(n===-1?"":hist[n]||""); }
            else if (e.key === "Escape") setShowCmds(false);
          }}
          placeholder={`Message ${channel} as ${nick}…`}
          style={{ flex:1, background:"transparent", border:"none", outline:"none", color:"#c8d8f0", fontSize:13.5, caretColor:"#7eb8f7" }}
          autoFocus
        />
      </div>
    </div>
  );
}

// ─── Sidebar pieces ──────────────────────────────────────────────────────────
function NetworkSection({ network, channels, activeChannel, unread, onSelectChan, onAddChan }) {
  const [collapsed, setCollapsed] = useState(false);
  const netChans = Object.entries(channels)
    .filter(([k]) => k.startsWith(network.id + "::"))
    .map(([k, v]) => [k.split("::")[1], v]);

  return (
    <div style={{ marginBottom:4 }}>
      <div style={{ padding:"6px 12px 4px", display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}
        onClick={() => setCollapsed(c => !c)}>
        <StatusDot status={network.status || "disconnected"} />
        <span style={{ fontSize:12, fontWeight:700, color:"#e8f4ff", fontFamily:"'JetBrains Mono',monospace", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {network.name}
        </span>
        <span style={{ fontSize:10, color:"#ffffff30", transform: collapsed?"rotate(-90deg)":"rotate(0deg)", transition:"transform 0.15s" }}>▾</span>
      </div>
      {!collapsed && (
        <div onClick={() => { const ch = prompt("Join channel (e.g. #linux):"); if (ch) onAddChan(ch.startsWith("#") ? ch : "#" + ch); }}
          style={{ padding:"3px 12px 3px 12px", cursor:"pointer", fontSize:12, color:"#ffffff20", fontFamily:"'JetBrains Mono',monospace" }}
          onMouseEnter={e=>e.currentTarget.style.color="#7eb8f7"}
          onMouseLeave={e=>e.currentTarget.style.color="#ffffff20"}
        >+ join channel</div>
      )}
      {!collapsed && netChans.map(([chanName]) => {
        const k = `${network.id}::${chanName}`;
        const isActive = chanName === activeChannel;
        const u = unread[k] || 0;
        return (
          <div key={chanName} onClick={() => onSelectChan(chanName)}
            style={{ padding:"3px 12px 3px 28px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between",
              borderRadius:4, margin:"1px 6px",
              background: isActive ? "#7eb8f715" : "transparent",
              color: isActive ? "#c8d8f0" : u > 0 ? "#8ba8c8" : "#ffffff40",
              fontWeight: isActive || u > 0 ? 600 : 400, fontSize:13,
            }}
            onMouseEnter={e=>{ if(!isActive) { e.currentTarget.style.background="#ffffff08"; e.currentTarget.style.color="#c8d8f0"; } }}
            onMouseLeave={e=>{ if(!isActive) { e.currentTarget.style.background="transparent"; e.currentTarget.style.color=u>0?"#8ba8c8":"#ffffff40"; } }}
          >
            <span style={{ display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ opacity:0.4, fontSize:11 }}>#</span>{chanName.replace(/^#/,"")}
            </span>
            {u > 0 && !isActive && (
              <span style={{ background:"#7eb8f7", color:"#0a1628", fontSize:10, fontWeight:800, borderRadius:10, padding:"0 5px", minWidth:16, textAlign:"center", fontFamily:"'JetBrains Mono',monospace" }}>{u}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function KoreChat() {
  const [state, dispatch] = useReducer(reducer, initState);
  const [showNetModal, setShowNetModal] = useState(false);
  const [showUserList, setShowUserList] = useState(true);
  const [loadingNets, setLoadingNets]   = useState(true);

  // WS connections: { [networkId]: { send, close } }
  const connections = useRef({});
  const messagesEndRef = useRef(null);

  const { networks, activeNetwork, channels, messages, unread, activeChannel, myNick, ackedCaps, connected } = state;

  // ─── Load saved networks from API on mount ──────────────────────────────
  useEffect(() => {
    NetworksAPI.list()
      .then(nets => {
        if (Array.isArray(nets)) dispatch({ type:"SET_NETWORKS", networks: nets });
      })
      .catch(() => {}) // API not available in demo mode — ignore
      .finally(() => setLoadingNets(false));
  }, []);

  // ─── IRC event handler (per network) ───────────────────────────────────
  const handleLine = useCallback((netId, line) => {
    const msg = parseIRCMessage(line);
    const { tags, prefix, command, params } = msg;
    const time = tags?.time || new Date().toISOString();
    const fromNick = nickFromPrefix(prefix);
    const nick = myNick[netId] || "me";

    const addMsg = (chan, m) => dispatch({ type:"ADD_MESSAGE", netId, chan, msg: m });
    const addSys = (chan, text) => dispatch({ type:"ADD_MESSAGE", netId, chan, msg: { type:"system", text, time } });

    switch (command) {
      case "001":
        dispatch({ type:"SET_CONNECTED", netId, val: true });
        dispatch({ type:"SET_NICK", netId, nick: params[0] });
        dispatch({ type: "SET_NETWORKS", networks: networks.map(n => n.id === netId ? { ...n, status: "connected" } : n) });
        break;

      case "CAP":
        if (params[1] === "ACK") {
          const caps = (params[2] || "").split(" ").filter(Boolean);
          dispatch({ type:"ADD_CAP", netId, caps });
        }
        break;

      case "JOIN": {
        const chan = params[0]?.replace(/^:/,"");
        if (!chan) break;
        dispatch({ type:"JOIN_CHANNEL", netId, chan });
        if (fromNick === nick) {
          dispatch({ type:"SET_ACTIVE_CHAN", netId, chan });
          if (!activeNetwork) dispatch({ type:"SET_ACTIVE_NET", netId });
          addSys(chan, `You joined ${chan}`);
        } else {
          dispatch({ type:"SET_MEMBERS", netId, chan, members: { [fromNick]: "" } });
          addSys(chan, `→ ${fromNick} joined`);
        }
        break;
      }

      case "PART": {
        const chan = params[0];
        if (fromNick === nick) {
          dispatch({ type:"PART_CHANNEL", netId, chan });
        } else {
          dispatch({ type:"REMOVE_MEMBER", netId, chan, nick: fromNick });
          addSys(chan, `← ${fromNick} left${params[1] ? ": "+params[1] : ""}`);
        }
        break;
      }

      case "353": {
        const chan = params[2];
        if (!chan) break;
        const members = {};
        (params[3] || "").trim().split(" ").forEach(m => {
          const pfx = "~&@%+".includes(m[0]) ? m[0] : "";
          const name = pfx ? m.slice(1) : m;
          if (name) members[name] = pfx;
        });
        dispatch({ type:"SET_MEMBERS", netId, chan, members });
        break;
      }

      case "332": {
        const chan = params[1];
        dispatch({ type:"SET_TOPIC", netId, chan, topic: params[2] || "" });
        break;
      }

      case "TOPIC": {
        const chan = params[0];
        dispatch({ type:"SET_TOPIC", netId, chan, topic: params[1] || "" });
        addSys(chan, `${fromNick} changed topic: ${params[1] || ""}`);
        break;
      }

      case "PRIVMSG":
      case "NOTICE": {
        const target = params[0];
        const text   = params[1] || "";
        const isDM   = target && !target.startsWith("#");
        const chan   = isDM ? fromNick : target;
        if (!chan) break;
        // Korechat status notices
        if (prefix === "*korechat*" || fromNick === "*korechat*") {
          // Find first channel or use a pseudo "status" channel
          const netChans = Object.keys(channels).filter(k => k.startsWith(netId+"::"));
          const statusChan = netChans.length > 0 ? netChans[0].split("::")[1] : "status";
          dispatch({ type:"JOIN_CHANNEL", netId, chan: statusChan });
          addSys(statusChan, text);
          break;
        }
        // BNC status messages — update connection state and nick on every subscribe/reconnect.
        // The BNC sends these two lines at the start of every WebSocket session:
        //   :*bnc* NOTICE * :status:<connected|disconnected|reconnecting|error>
        //   :*bnc* NOTICE * :replay-done nick:<currentNick>   (only when connected)
        if (prefix === "*bnc*" || fromNick === "*bnc*") {
          if (text.startsWith("status:")) {
            const bncStatus = text.slice("status:".length).trim();
            const isConn = bncStatus === "connected";
            dispatch({ type:"SET_CONNECTED", netId, val: isConn });
            dispatch({ type:"SET_NETWORKS", networks: networks.map(n =>
              n.id === netId ? { ...n, status: bncStatus } : n
            )});
          } else if (text.startsWith("replay-done nick:")) {
            const replayNick = text.slice("replay-done nick:".length).trim();
            if (replayNick) dispatch({ type:"SET_NICK", netId, nick: replayNick });
          }
          break;
        }
        if (fromNick === nick && command === "PRIVMSG") break; // echo suppression (hub already handles; proxy might not)
        dispatch({ type:"JOIN_CHANNEL", netId, chan });
        addMsg(chan, { type:"message", nick: fromNick, text, time, tags, id: tags?.msgid || Math.random().toString(36) });
        break;
      }

      case "NICK": {
        const newNick = params[0];
        if (fromNick === nick) dispatch({ type:"SET_NICK", netId, nick: newNick });
        // Update member lists
        Object.keys(channels).filter(k => k.startsWith(netId+"::")).forEach(k => {
          const chan = k.split("::")[1];
          if (channels[k]?.members?.[fromNick] !== undefined) {
            dispatch({ type:"REMOVE_MEMBER", netId, chan, nick: fromNick });
            dispatch({ type:"SET_MEMBERS", netId, chan, members: { [newNick]: channels[k].members[fromNick] } });
            addSys(chan, `${fromNick} is now known as ${newNick}`);
          }
        });
        break;
      }

      case "QUIT": {
        Object.keys(channels).filter(k => k.startsWith(netId+"::")).forEach(k => {
          const chan = k.split("::")[1];
          if (channels[k]?.members?.[fromNick] !== undefined) {
            dispatch({ type:"REMOVE_MEMBER", netId, chan, nick: fromNick });
            addSys(chan, `✕ ${fromNick} quit: ${params[0] || ""}`);
          }
        });
        break;
      }

      case "KICK": {
        const chan = params[0];
        const kicked = params[1];
        dispatch({ type:"REMOVE_MEMBER", netId, chan, nick: kicked });
        addSys(chan, `${kicked} was kicked by ${fromNick}: ${params[2] || ""}`);
        break;
      }

      case "ERROR":
        dispatch({ type: "SET_NETWORKS", networks: networks.map(n => n.id === netId ? { ...n, status: "error", status_msg: params[0] } : n) });
        break;
    }
  }, [myNick, activeNetwork, channels, networks]);

  // ─── Connect to a network ───────────────────────────────────────────────
  const connectNetwork = useCallback((net) => {
    if (connections.current[net.id]) return; // already open

    const url = `${WS_URL}?network=${net.id}`;
    dispatch({ type:"SET_NETWORKS", networks: state.networks.map(n => n.id === net.id ? { ...n, status:"connecting" } : n) });

    const conn = createIRCConnection({
      url,
      nick: net.nick,
      onLine: (line) => handleLine(net.id, line),
      onOpen: () => {
        // Mark as "connecting" immediately so the status dot turns yellow
        // while we wait for the BNC's :*bnc* NOTICE * :status:connected reply.
        dispatch({ type:"SET_CONNECTED", netId: net.id, val: false });
        dispatch({ type:"SET_NETWORKS", networks: state.networks.map(n =>
          n.id === net.id ? { ...n, status: "connecting" } : n
        )});
      },
      onClose: () => {
        dispatch({ type:"SET_CONNECTED", netId: net.id, val: false });
        dispatch({ type:"SET_NETWORKS", networks: state.networks.map(n => n.id === net.id ? { ...n, status:"disconnected" } : n) });
        delete connections.current[net.id];
      },
    });
    connections.current[net.id] = conn;

    if (!activeNetwork) dispatch({ type:"SET_ACTIVE_NET", netId: net.id });
  }, [handleLine, activeNetwork, state.networks]);

  // ─── Auto-connect networks on load ──────────────────────────────────────
  useEffect(() => {
    if (loadingNets) return;
    networks.forEach(net => {
      if (!connections.current[net.id]) connectNetwork(net);
    });
  }, [networks, loadingNets]);

  // ─── Scroll to bottom on new messages ───────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, activeNetwork, activeChannel]);

  // ─── Clear unread on focus ───────────────────────────────────────────────
  useEffect(() => {
    if (activeNetwork && activeChannel[activeNetwork]) {
      dispatch({ type:"CLEAR_UNREAD", netId: activeNetwork, chan: activeChannel[activeNetwork] });
    }
  }, [activeNetwork, activeChannel]);

  // ─── Send handler ─────────────────────────────────────────────────────────
  const handleSend = useCallback((text) => {
    const netId = activeNetwork;
    const chan  = activeChannel[netId];
    if (!netId || !chan) return;
    const conn = connections.current[netId];
    const nick = myNick[netId] || "me";

    if (text.startsWith("/")) {
      const [rawCmd, ...args] = text.slice(1).split(" ");
      const cmd = rawCmd.toUpperCase();
      switch (cmd) {
        case "JOIN":  conn?.send(`JOIN ${args[0]}`); break;
        case "PART":  conn?.send(`PART ${chan} :${args.join(" ") || "Leaving"}`); break;
        case "TOPIC": conn?.send(`TOPIC ${chan} :${args.join(" ")}`); break;
        case "NICK":  conn?.send(`NICK ${args[0]}`); break;
        case "AWAY":  conn?.send(`AWAY :${args.join(" ")}`); break;
        case "BACK":  conn?.send(`AWAY`); break;
        case "ME":    conn?.send(`PRIVMSG ${chan} :\x01ACTION ${args.join(" ")}\x01`);
                      dispatch({ type:"ADD_MESSAGE", netId, chan, msg: { type:"message", nick, text:`* ${nick} ${args.join(" ")}`, time: new Date().toISOString(), id: Math.random().toString(36) } });
                      break;
        case "MSG":   conn?.send(`PRIVMSG ${args[0]} :${args.slice(1).join(" ")}`); break;
        case "NAMES": conn?.send(`NAMES ${chan}`); break;
        case "LIST":  conn?.send(`LIST`); break;
        case "QUIT":  conn?.send(`QUIT :${args.join(" ") || "KoreChat"}`); break;
        default:      dispatch({ type:"ADD_MESSAGE", netId, chan, msg: { type:"system", text:`Unknown command: /${rawCmd}`, time: new Date().toISOString() } });
      }
    } else {
      conn?.send(`PRIVMSG ${chan} :${text}`);
      dispatch({ type:"ADD_MESSAGE", netId, chan, msg: { type:"message", nick, text, time: new Date().toISOString(), id: Math.random().toString(36), mine: true } });
    }
  }, [activeNetwork, activeChannel, myNick]);

  // ─── Derived ──────────────────────────────────────────────────────────────
  const activeNet    = networks.find(n => n.id === activeNetwork);
  const activeChan   = activeNetwork ? activeChannel[activeNetwork] : null;
  const activeChanKey = activeChan && activeNetwork ? chanKey(activeNetwork, activeChan) : null;
  const activeMsgs   = activeChanKey ? (messages[activeChanKey] || []) : [];
  const activeMembers = activeChanKey ? (channels[activeChanKey]?.members || {}) : {};
  const activeTopic   = activeChanKey ? (channels[activeChanKey]?.topic || "") : "";
  const currentNick   = activeNetwork ? (myNick[activeNetwork] || "") : "";
  const activeCaps    = activeNetwork ? (ackedCaps[activeNetwork] || []) : [];

  const ops     = Object.entries(activeMembers).filter(([,p]) => p === "@");
  const voiced  = Object.entries(activeMembers).filter(([,p]) => p === "+");
  const normal  = Object.entries(activeMembers).filter(([,p]) => !p);

  const renderMemGroup = (label, list) => list.length === 0 ? null : (
    <>
      <div style={{ padding:"8px 12px 2px", fontSize:10, color:"#ffffff25", fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.08em", textTransform:"uppercase" }}>{label} — {list.length}</div>
      {list.map(([name, pfx]) => (
        <div key={name} style={{ display:"flex", alignItems:"center", gap:8, padding:"3px 12px", borderRadius:4, margin:"1px 4px" }}
          onMouseEnter={e=>e.currentTarget.style.background="#ffffff08"}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}
        >
          <Avatar nick={name} size={22} />
          <span style={{ fontSize:12, color:"#8ba8c8", flex:1 }}>{name}</span>
          {pfx && <span style={{ fontSize:10, color: pfx==="@"?"#f7d07e":"#a0f77e", fontFamily:"'JetBrains Mono',monospace", opacity:0.7 }}>{pfx}</span>}
        </div>
      ))}
    </>
  );

  return (
    <div style={{ display:"flex", height:"100vh", width:"100%", background:"#080f1e", overflow:"hidden", color:"#c8d8f0", fontFamily:"'Inter var','Inter',sans-serif" }}>
      {showNetModal && (
        <NetworkModal
          networks={networks}
          onClose={() => setShowNetModal(false)}
          onAdd={net => {
            dispatch({ type:"ADD_NETWORK", network: net });
            connectNetwork(net);
          }}
          onDelete={async id => {
            connections.current[id]?.close();
            delete connections.current[id];
            await NetworksAPI.delete(id).catch(() => {});
            dispatch({ type:"DEL_NETWORK", id });
          }}
        />
      )}

      {/* Sidebar */}
      <div style={{ width:224, flexShrink:0, background:"#0a1628", borderRight:"1px solid #ffffff08", display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Logo */}
        <div style={{ padding:"14px 14px 10px", borderBottom:"1px solid #ffffff08" }}>
          <div style={{ fontWeight:800, fontSize:15, letterSpacing:"-0.4px", color:"#e8f4ff", fontFamily:"'JetBrains Mono',monospace", display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:22, height:22, borderRadius:6, background:"linear-gradient(135deg,#7eb8f7,#7ef7d0)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:900, color:"#0a1628" }}>K</div>
            KoreChat
          </div>
          <div style={{ fontSize:10, color:"#ffffff25", marginTop:2, paddingLeft:30, fontFamily:"'JetBrains Mono',monospace" }}>IRCv3 Client</div>
        </div>

        {/* Networks button */}
        <button onClick={() => setShowNetModal(true)} style={{
          margin:"8px 10px 4px", padding:"7px 12px", background:"#7eb8f710", border:"1px solid #7eb8f720",
          borderRadius:6, color:"#7eb8f7", fontSize:12, cursor:"pointer", textAlign:"left",
          fontFamily:"'JetBrains Mono',monospace", display:"flex", alignItems:"center", gap:6
        }}>
          <span style={{ fontSize:14 }}>⊕</span> Manage Networks
        </button>

        {/* Network / channel list */}
        <div style={{ flex:1, overflowY:"auto", paddingTop:4 }}>
          {networks.length === 0 && !loadingNets && (
            <div style={{ padding:"20px 14px", fontSize:12, color:"#ffffff25", textAlign:"center", fontFamily:"'JetBrains Mono',monospace", lineHeight:1.7 }}>
              No networks.<br/>Click Manage Networks<br/>to get started.
            </div>
          )}
          {networks.map(net => (
            <div key={net.id}
              onClick={() => dispatch({ type:"SET_ACTIVE_NET", netId: net.id })}
              style={{ cursor:"pointer" }}
            >
              <NetworkSection
                network={net}
                channels={channels}
                activeChannel={activeChannel[net.id]}
                unread={unread}
                onSelectChan={chan => {
                  dispatch({ type:"SET_ACTIVE_NET", netId: net.id });
                  dispatch({ type:"SET_ACTIVE_CHAN", netId: net.id, chan });
                  dispatch({ type:"CLEAR_UNREAD", netId: net.id, chan });
                }}
                onAddChan={chan => connections.current[net.id]?.send(`JOIN ${chan}`)}
              />
            </div>
          ))}
        </div>

        {/* Nick footer */}
        {currentNick && (
          <div style={{ padding:"8px 12px", borderTop:"1px solid #ffffff08", display:"flex", alignItems:"center", gap:8 }}>
            <Avatar nick={currentNick} size={22} />
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:"#c8d8f0", fontFamily:"'JetBrains Mono',monospace" }}>{currentNick}</div>
              <div style={{ fontSize:10, color:"#ffffff25" }}>{activeNet?.name || ""}</div>
            </div>
          </div>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Header */}
        {activeChan ? (
          <div style={{ padding:"10px 16px", borderBottom:"1px solid #ffffff08", background:"#0a1628", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
            <span style={{ fontSize:15, fontWeight:700, color:"#e8f4ff", fontFamily:"'JetBrains Mono',monospace" }}>
              #{activeChan.replace(/^#/,"")}
            </span>
            {activeTopic && <span style={{ fontSize:12, color:"#ffffff40", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{activeTopic}</span>}
            <div style={{ display:"flex", gap:8, flexShrink:0, marginLeft:"auto" }}>
              {activeCaps.length > 0 && (
                <div style={{ background:"#7eb8f710", border:"1px solid #7eb8f720", borderRadius:4, padding:"2px 7px", fontSize:10, color:"#7eb8f7", fontFamily:"'JetBrains Mono',monospace" }}>
                  IRCv3 ✓ {activeCaps.length}
                </div>
              )}
              <button onClick={() => setShowUserList(s=>!s)} style={{ background: showUserList?"#7eb8f715":"transparent", border:"1px solid #ffffff12", borderRadius:4, padding:"3px 8px", fontSize:11, color:"#7eb8f7", cursor:"pointer", fontFamily:"'JetBrains Mono',monospace" }}>
                Users {Object.keys(activeMembers).length}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding:"10px 16px", borderBottom:"1px solid #ffffff08", background:"#0a1628", display:"flex", alignItems:"center", color:"#ffffff25", fontSize:13, fontFamily:"'JetBrains Mono',monospace" }}>
            {networks.length === 0 ? "Add a network to get started →" : "Select a channel"}
          </div>
        )}

        {/* Messages + member list */}
        <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
          <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
            {activeMsgs.map((msg, i) =>
              msg.type === "system"
                ? <SystemMsg key={i} text={msg.text} time={msg.time} />
                : <Message key={msg.id||i} msg={msg} prev={activeMsgs[i-1]?.type==="message" ? activeMsgs[i-1] : null} myNick={currentNick} />
            )}
            {activeChan && activeMsgs.length === 0 && (
              <div style={{ padding:"40px 52px", color:"#ffffff20", fontSize:13, fontFamily:"'JetBrains Mono',monospace" }}>
                No messages yet in {activeChan}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {showUserList && activeChan && (
            <div style={{ width:188, flexShrink:0, borderLeft:"1px solid #ffffff08", background:"#0a1628", overflowY:"auto" }}>
              <div style={{ padding:"8px 0" }}>
                {renderMemGroup("Operators", ops)}
                {renderMemGroup("Voiced", voiced)}
                {renderMemGroup("Members", normal)}
              </div>
            </div>
          )}
        </div>

        {activeChan && <InputBar key={activeChanKey} onSend={handleSend} channel={activeChan} nick={currentNick} />}
      </div>
    </div>
  );
}
