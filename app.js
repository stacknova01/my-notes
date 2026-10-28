const SUPABASE_URL = "https://rmljchchvynyzwluwuyn.supabase.co";
const SUPABASE_KEY = "sb_publishable_-Qs8xSWmuhR6sr4uQ6FNJA_2_6IHCQb";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const authSection = document.getElementById("auth-section");
const notesSection = document.getElementById("notes-section");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authMsg = document.getElementById("auth-msg");
const userEmail = document.getElementById("user-email");
const titleInput = document.getElementById("note-title");
const bodyInput = document.getElementById("note-body");
const saveBtn = document.getElementById("save-btn");
const notesList = document.getElementById("notes-list");

let editingId = null;

// ---------- Auth ----------
document.getElementById("signup-btn").addEventListener("click", async () => {
  authMsg.textContent = "";
  const { error } = await sb.auth.signUp({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });
  authMsg.textContent = error
    ? error.message
    : "Sign up done. Check your email to confirm, then log in.";
});

document.getElementById("login-btn").addEventListener("click", async () => {
  authMsg.textContent = "";
  const { error } = await sb.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });
  if (error) authMsg.textContent = error.message;
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await sb.auth.signOut();
});

sb.auth.onAuthStateChange((event, session) => {
  if (session) {
    authSection.hidden = true;
    notesSection.hidden = false;
    userEmail.textContent = session.user.email;
    loadNotes();
  } else {
    authSection.hidden = false;
    notesSection.hidden = true;
    notesList.innerHTML = "";
    passwordInput.value = "";
    resetForm();
  }
});

// ---------- Notes ----------
async function loadNotes() {
  const { data, error } = await sb
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  notesList.innerHTML = "";
  if (error) {
    notesList.textContent = "Could not load notes: " + error.message;
    return;
  }
  if (data.length === 0) {
    notesList.textContent = "No notes yet. Write your first one above.";
    return;
  }
  data.forEach(renderNote);
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
    titleInput.value = note.title || "";
    bodyInput.value = note.body || "";
    saveBtn.textContent = "Update note";
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
  notesList.appendChild(div);
}

saveBtn.addEventListener("click", async () => {
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  if (!title && !body) return;

  if (editingId) {
    await sb.from("notes").update({ title, body }).eq("id", editingId);
  } else {
    await sb.from("notes").insert({ title, body });
  }
  resetForm();
  loadNotes();
});

function resetForm() {
  editingId = null;
  titleInput.value = "";
  bodyInput.value = "";
  saveBtn.textContent = "Save note";
}