const params = new URLSearchParams(location.search);
const session = params.get("session");

document.getElementById("title").textContent = session ? `session: ${session}` : "session: (missing)";
const conn = document.getElementById("conn");
const pre = document.getElementById("pre");
const out = document.getElementById("output");
const toast = document.getElementById("toast");

let autoScroll = true;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function append(text) {
  pre.textContent += text;
  if (autoScroll) {
    out.scrollTop = out.scrollHeight;
  } else {
    document.getElementById("jumpBtn").style.display = "inline-block";
  }
}

out.addEventListener("scroll", () => {
  const nearBottom = (out.scrollHeight - out.scrollTop - out.clientHeight) < 40;
  autoScroll = nearBottom;
  document.getElementById("autoscroll").textContent = autoScroll ? "ON" : "OFF";
  if (autoScroll) document.getElementById("jumpBtn").style.display = "none";
});

document.getElementById("jumpBtn").onclick = () => {
  autoScroll = true;
  out.scrollTop = out.scrollHeight;
  document.getElementById("autoscroll").textContent = "ON";
  document.getElementById("jumpBtn").style.display = "none";
};

async function attach() {
  if (!session) return;
  conn.textContent = "attaching...";
  const r = await fetch(`/api/sessions/${encodeURIComponent(session)}/attach`, { method: "POST" });
  const j = await r.json();
  if (!r.ok) {
    conn.textContent = `attach failed: ${j.error || r.status}`;
    return;
  }
  conn.textContent = "attached";
}

async function loadTail() {
  if (!session) return;
  const r = await fetch(`/api/sessions/${encodeURIComponent(session)}/log?tail=40000`);
  if (r.ok) {
    const t = await r.text();
    pre.textContent = t;
    out.scrollTop = out.scrollHeight;
  }
}

async function sendInput(text) {
  const r = await fetch(`/api/sessions/${encodeURIComponent(session)}/input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    append(`\n[client] send failed: ${j.error || r.status}\n`);
  }
}

async function sendCtrl(action) {
  const r = await fetch(`/api/sessions/${encodeURIComponent(session)}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    append(`\n[client] control failed: ${j.error || r.status}\n`);
  }
}

document.getElementById("sendBtn").onclick = () => {
  const inp = document.getElementById("input");
  const text = inp.value;
  inp.value = "";
  if (text.trim()) sendInput(text);
};

document.getElementById("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("sendBtn").click();
  }
});

document.getElementById("yesBtn").onclick = () => sendInput("y");
document.getElementById("noBtn").onclick = () => sendInput("n");
document.getElementById("enterBtn").onclick = () => sendCtrl("enter");
document.getElementById("ctrlcBtn").onclick = () => sendCtrl("ctrl_c");

async function main() {
  if (!session) {
    append("missing session param\n");
    return;
  }
  await attach();
  await loadTail();

  const wsProto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${wsProto}://${location.host}/ws?session=${encodeURIComponent(session)}`);

  ws.onopen = () => conn.textContent = "ws connected";
  ws.onclose = () => conn.textContent = "ws closed";
  ws.onerror = () => conn.textContent = "ws error";

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "chunk") append(msg.data);
    if (msg.type === "input-activity") showToast("📱 其他设备刚刚输入了内容");
  };
}

main();
