async function load() {
  const status = document.getElementById("status");
  status.textContent = "loading...";
  const res = await fetch("/api/sessions");
  const data = await res.json();
  const list = document.getElementById("list");
  list.innerHTML = "";

  (data.sessions || []).forEach((name) => {
    const div = document.createElement("div");
    div.className = "row";
    div.style.margin = "10px 0";
    div.innerHTML = `
      <span class="pill">${escapeHtml(name)}</span>
      <a href="/session.html?session=${encodeURIComponent(name)}">打开</a>
    `;
    list.appendChild(div);
  });

  status.textContent = `found ${data.sessions?.length || 0}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

document.getElementById("refreshBtn").onclick = load;

document.getElementById("goBtn").onclick = () => {
  const name = document.getElementById("manualName").value.trim();
  if (!name) return;
  location.href = `/session.html?session=${encodeURIComponent(name)}`;
};

load();
