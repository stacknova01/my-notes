const SUPABASE_URL = "https://rmljchchvynyzwluwuyn.supabase.co";
const SUPABASE_KEY = "sb_publishable_-Qs8xSWmuhR6sr4uQ6FNJA_2_6IHCQb";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);
const root = document.documentElement;

// ---------- State ----------
const FREE_LIMIT = 2;
let allNotes = [];
let activeSubject = "All";
let editingId = null;
let isSubscribed = false;
let expiresAt = null;
let signingUp = false;

// ---------- Theme & font ----------
function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  $("theme-btn").textContent = theme === "dark" ? "☀️ Light mode" : "🌙 Dark mode";
  try { localStorage.setItem("theme", theme); } catch (e) {}
}

function applyFont(font) {
  root.setAttribute("data-font", font);
  $("font-select").value = font;
  try { localStorage.setItem("font", font); } catch (e) {}
}

(function loadPrefs() {
  let theme = "dark";
  let font = "system";
  try {
    theme = localStorage.getItem("theme") || theme;
    font = localStorage.getItem("font") || font;
  } catch (e) {}
  applyTheme(theme);
  applyFont(font);
})();

$("theme-btn").addEventListener("click", () => {
  applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
});
$("font-select").addEventListener("change", (e) => applyFont(e.target.value));

// ---------- Auth pages ----------
function setMsg(text, ok = false) {
  const m = $("auth-msg");
  m.textContent = text;
  m.className = ok ? "ok" : "";
}

function showAuthView(view, message = "", ok = false) {
  $("login-view").hidden = view !== "login";
  $("signup-view").hidden = view !== "signup";
  setMsg(message, ok);
}

$("to-signup").addEventListener("click", (e) => { e.preventDefault(); showAuthView("signup"); });
$("to-login").addEventListener("click", (e) => { e.preventDefault(); showAuthView("login"); });

$("signup-btn").addEventListener("click", async () => {
  const name = $("signup-name").value.trim();
  const email = $("signup-email").value.trim();
  const password = $("signup-password").value;

  if (!name || !email || !password) { setMsg("Please fill in your name, email and password."); return; }
  if (password.length < 6) { setMsg("Password must be at least 6 characters."); return; }

  setMsg("");
  signingUp = true;
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });

  if (error) { signingUp = false; setMsg(error.message); return; }

  const autoLoggedIn = !!data.session;
  if (autoLoggedIn) await sb.auth.signOut();
  signingUp = false;

  $("signup-password").value = "";
  $("login-email").value = email;
  showAuthView(
    "login",
    autoLoggedIn
      ? "Account created! Please log in."
      : "Account created! Check your email to confirm, then log in.",
    true
  );
});

$("login-btn").addEventListener("click", async () => {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  if (!email || !password) { setMsg("Enter your email and password."); return; }

  setMsg("");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) setMsg(error.message);
});

$("login-password").addEventListener("keydown", (e) => { if (e.key === "Enter") $("login-btn").click(); });
$("signup-password").addEventListener("keydown", (e) => { if (e.key === "Enter") $("signup-btn").click(); });

$("logout-btn").addEventListener("click", async () => { await sb.auth.signOut(); });

sb.auth.onAuthStateChange((event, session) => {
  if (session && signingUp) return; // stay on the login page after sign up

  document.body.classList.toggle("auth-page", !session);
  $("auth-section").hidden = !!session;
  $("notes-section").hidden = !session;

  if (session) {
    const name = session.user.user_metadata && session.user.user_metadata.full_name;
    $("greeting").textContent = name ? "Hello, " + name + " 👋" : session.user.email;
        setTimeout(async () => { await handlePaymentReturn(); loadNotes(); loadSubscription(); }, 0);
  } else {
    allNotes = [];
    isSubscribed = false;
    expiresAt = null;
    $("notes-list").innerHTML = "";
    $("login-password").value = "";
    hideUpgrade();
    resetForm();
  }
});

// ---------- Subscription ----------
async function loadSubscription() {
  const { data } = await sb.from("subscriptions").select("status, expires_at").maybeSingle();
  expiresAt = data && data.expires_at ? new Date(data.expires_at) : null;
  isSubscribed = !!expiresAt && expiresAt > new Date();
  renderPlan();
}

function renderPlan() {
  if (isSubscribed) {
    $("plan-text").textContent = "⭐ Premium until " + expiresAt.toLocaleDateString();
    $("upgrade-btn").hidden = true;
  } else {
    $("plan-text").textContent = "Free plan: " + allNotes.length + " notes (limit " + FREE_LIMIT + ")";
    $("upgrade-btn").hidden = false;
  }
}

function showUpgrade() {
  $("upgrade-box").hidden = false;
  $("upgrade-box").scrollIntoView({ behavior: "smooth", block: "center" });
}
function hideUpgrade() { $("upgrade-box").hidden = true; }

$("upgrade-btn").addEventListener("click", showUpgrade);
$("close-upgrade").addEventListener("click", hideUpgrade);
$("subscribe-btn").addEventListener("click", async () => {
  const btn = $("subscribe-btn");
  btn.disabled = true;
  btn.textContent = "Opening payment...";
  try {
    const { data } = await sb.auth.getSession();
    const r = await fetch("/api/pay", {
      method: "POST",
      headers: { Authorization: "Bearer " + data.session.access_token },
    });
    const out = await r.json();
    if (!r.ok || !out.url) throw new Error(out.error || "Could not start payment");
    window.location.href = out.url;
  } catch (e) {
    alert(e.message);
    btn.disabled = false;
    btn.textContent = "Subscribe: KSh 150/month";
  }
});

async function handlePaymentReturn() {
  const ref = new URLSearchParams(location.search).get("reference");
  if (!ref) return;
  history.replaceState({}, "", location.pathname);
  try {
    const r = await fetch("/api/verify?reference=" + encodeURIComponent(ref));
    const out = await r.json();
    await loadSubscription();
    alert(out.ok
      ? "Payment received. Premium is active. Thank you!"
      : "We couldn't confirm your payment yet. If you were charged, wait a minute and refresh the page.");
  } catch (e) {
    alert("Could not confirm the payment. Please refresh in a minute.");
  }
}

// ---------- Notes ----------
async function loadNotes() {
  const { data, error } = await sb
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    $("notes-list").textContent = "Could not load notes: " + error.message;
    return;
  }
  allNotes = data;
  render();
}

function subjectOf(note) {
  return note.subject || "General";
}

function updateSubjectUI() {
  const subjects = [...new Set(allNotes.map(subjectOf))].sort((a, b) => a.localeCompare(b));
  if (activeSubject !== "All" && !subjects.includes(activeSubject)) activeSubject = "All";

  const chips = $("subject-filters");
  chips.innerHTML = "";
  ["All", ...subjects].forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (s === activeSubject ? " active" : "");
    b.textContent = s;
    b.addEventListener("click", () => { activeSubject = s; render(); });
    chips.appendChild(b);
  });

  const list = $("subject-list");
  list.innerHTML = "";
  subjects.forEach((s) => {
    const o = document.createElement("option");
    o.value = s;
    list.appendChild(o);
  });
}

function render() {
  updateSubjectUI();
  renderPlan();

  const term = $("search").value.trim().toLowerCase();
  const list = $("notes-list");
  list.innerHTML = "";

  const filtered = allNotes.filter((n) => {
    const subj = subjectOf(n);
    if (activeSubject !== "All" && subj !== activeSubject) return false;
    if (!term) return true;
    return (
      (n.title || "").toLowerCase().includes(term) ||
      (n.body || "").toLowerCase().includes(term) ||
      subj.toLowerCase().includes(term)
    );
  });

  if (filtered.length === 0) {
    list.textContent = allNotes.length
      ? "No notes match your search."
      : "No notes yet. Write your first one above.";
    return;
  }

  const groups = {};
  filtered.forEach((n) => {
    const s = subjectOf(n);
    (groups[s] = groups[s] || []).push(n);
  });

  Object.keys(groups)
    .sort((a, b) => a.localeCompare(b))
    .forEach((s) => {
      const h = document.createElement("h2");
      h.className = "group-title";
      h.textContent = s + " (" + groups[s].length + ")";
      list.appendChild(h);
      groups[s].forEach(renderNote);
    });
}

function renderNote(note) {
  const div = document.createElement("div");
  div.className = "note";

  const h3 = document.createElement("h3");
  h3.textContent = note.title || "(No title)";

  const small = document.createElement("small");
  small.textContent = new Date(note.created_at).toLocaleString();

  const p = document.createElement("p");
  p.textContent = note.body || "";

  const row = document.createElement("div");
  row.className = "row";

  const editBtn = document.createElement("button");
  editBtn.className = "secondary";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => {
    editingId = note.id;
    $("note-subject").value = subjectOf(note);
    $("note-title").value = note.title || "";
    $("note-body").value = note.body || "";
    $("save-btn").textContent = "Update note";
    $("cancel-btn").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  const delBtn = document.createElement("button");
  delBtn.className = "danger";
  delBtn.textContent = "Delete";
  delBtn.addEventListener("click", async () => {
    if (!confirm("Delete this note?")) return;
    await sb.from("notes").delete().eq("id", note.id);
    loadNotes();
  });

  row.append(editBtn, delBtn);
  div.append(h3, small, p, row);
  $("notes-list").appendChild(div);
}

$("save-btn").addEventListener("click", async () => {
  const subject = $("note-subject").value.trim() || "General";
  const title = $("note-title").value.trim();
  const body = $("note-body").value.trim();
  if (!title && !body) return;

  if (editingId) {
    const { error } = await sb.from("notes").update({ subject, title, body }).eq("id", editingId);
    if (error) { alert("Could not update: " + error.message); return; }
  } else {
    if (!isSubscribed && allNotes.length >= FREE_LIMIT) { showUpgrade(); return; }
    const { error } = await sb.from("notes").insert({ subject, title, body });
    if (error) {
      if (error.code === "42501") showUpgrade();
      else alert("Could not save: " + error.message);
      return;
    }
  }
  resetForm();
  hideUpgrade();
  loadNotes();
});

$("cancel-btn").addEventListener("click", resetForm);
$("search").addEventListener("input", render);

function resetForm() {
  editingId = null;
  $("note-subject").value = "";
  $("note-title").value = "";
  $("note-body").value = "";
  $("save-btn").textContent = "Save note";
  $("cancel-btn").hidden = true;
}