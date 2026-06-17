"use strict";

// Public Supabase values are safe in a browser app. Never put the service_role key here.
const SUPABASE_URL = "https://jjbxidmatwlgjahwofog.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_yMImgCLO1O_8XFpP2476TQ_3C5X9IM8";

const isConfigured = !SUPABASE_URL.includes("DEIN-PROJEKT") && !SUPABASE_ANON_KEY.includes("DEIN_PUBLIC");
const db = isConfigured && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const state = {
const state = {
  session: null,
  isAdmin: false,
  openElections: [],
  publicElections: [],
  adminElections: [],
  selectedAdminElection: null,
  selectedAdminCandidates: [],
  selectedVoterElection: null,
  voterCandidates: [],
  voterCandidateOrder: [],
  verifiedToken: "",
  latestGeneratedCodes: [],
  latestAdminDashboard: null,
  latestPublicDashboard: null
};

const el = {
  configWarning: document.getElementById("configWarning"),
  tabButtons: Array.from(document.querySelectorAll(".tab-button")),
  views: Array.from(document.querySelectorAll(".view")),

  voterElectionSelect: document.getElementById("voterElectionSelect"),
  voterToken: document.getElementById("voterToken"),
  tokenForm: document.getElementById("tokenForm"),
  tokenMessage: document.getElementById("tokenMessage"),
  reloadOpenElectionsButton: document.getElementById("reloadOpenElectionsButton"),
  ballotPanel: document.getElementById("ballotPanel"),
  ballotSeatBadge: document.getElementById("ballotSeatBadge"),
  ballotInstruction: document.getElementById("ballotInstruction"),
  ballotForm: document.getElementById("ballotForm"),
  ballotFields: document.getElementById("ballotFields"),
  ballotMessage: document.getElementById("ballotMessage"),
  clearBallotButton: document.getElementById("clearBallotButton"),

  loginForm: document.getElementById("loginForm"),
  adminEmail: document.getElementById("adminEmail"),
  adminPassword: document.getElementById("adminPassword"),
  loginMessage: document.getElementById("loginMessage"),
  logoutButton: document.getElementById("logoutButton"),
  adminWorkspace: document.getElementById("adminWorkspace"),
  adminStatus: document.getElementById("adminStatus"),
  adminElectionSelect: document.getElementById("adminElectionSelect"),
  newElectionButton: document.getElementById("newElectionButton"),
  refreshAdminButton: document.getElementById("refreshAdminButton"),
  electionForm: document.getElementById("electionForm"),
  electionTitleInput: document.getElementById("electionTitleInput"),
  seatsInput: document.getElementById("seatsInput"),
  candidateTextarea: document.getElementById("candidateTextarea"),
  publicResultsInput: document.getElementById("publicResultsInput"),
  electionMessage: document.getElementById("electionMessage"),
  saveElectionButton: document.getElementById("saveElectionButton"),
  openElectionButton: document.getElementById("openElectionButton"),
  closeElectionButton: document.getElementById("closeElectionButton"),
  archiveElectionButton: document.getElementById("archiveElectionButton"),
  deleteElectionButton: document.getElementById("deleteElectionButton"),
  codeAmountInput: document.getElementById("codeAmountInput"),
  generateCodesButton: document.getElementById("generateCodesButton"),
  downloadCodesButton: document.getElementById("downloadCodesButton"),
  generatedCodesOutput: document.getElementById("generatedCodesOutput"),
  codeMessage: document.getElementById("codeMessage"),
  adminStats: document.getElementById("adminStats"),
  adminTieNotice: document.getElementById("adminTieNotice"),
  adminResultBody: document.getElementById("adminResultBody"),
  adminResultMessage: document.getElementById("adminResultMessage"),
  exportResultsButton: document.getElementById("exportResultsButton"),
  copyResultsButton: document.getElementById("copyResultsButton"),

  publicElectionSelect: document.getElementById("publicElectionSelect"),
  publicResultStats: document.getElementById("publicResultStats"),
  publicTieNotice: document.getElementById("publicTieNotice"),
  publicResultBody: document.getElementById("publicResultBody"),
  publicResultMessage: document.getElementById("publicResultMessage")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  wireEvents();

  if (!db) {
    el.configWarning.classList.remove("hidden");
    disableDatabaseControls();
    return;
  }

  const { data } = await db.auth.getSession();
  state.session = data.session;
  await refreshAdminAccess();

  db.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    await refreshAdminAccess();
    if (state.isAdmin) {
      loadAdminElections();
    }
  });

  await Promise.all([loadOpenElections(), loadPublicElections()]);
  if (state.isAdmin) {
    await loadAdminElections();
  }
}

function wireEvents() {
  el.tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  el.tokenForm.addEventListener("submit", verifyVoterToken);
  el.reloadOpenElectionsButton.addEventListener("click", loadOpenElections);
  el.ballotForm.addEventListener("submit", submitBallot);
  el.clearBallotButton.addEventListener("click", resetBallotSelection);

  el.loginForm.addEventListener("submit", loginAdmin);
  el.logoutButton.addEventListener("click", logoutAdmin);
  el.adminElectionSelect.addEventListener("change", () => selectAdminElection(el.adminElectionSelect.value));
  el.newElectionButton.addEventListener("click", prepareNewElection);
  el.refreshAdminButton.addEventListener("click", loadAdminElections);
  el.electionForm.addEventListener("submit", saveElection);
  el.openElectionButton.addEventListener("click", openElection);
  el.closeElectionButton.addEventListener("click", closeElection);
  el.archiveElectionButton.addEventListener("click", archiveElection);
  el.deleteElectionButton.addEventListener("click", deleteElection);
  el.generateCodesButton.addEventListener("click", generateCodes);
  el.downloadCodesButton.addEventListener("click", downloadGeneratedCodes);
  el.exportResultsButton.addEventListener("click", exportAdminResults);
  el.copyResultsButton.addEventListener("click", copyAdminResults);

  el.publicElectionSelect.addEventListener("change", () => loadPublicDashboard(el.publicElectionSelect.value));
}

function switchTab(tabName) {
  el.tabButtons.forEach((button) => button.classList.toggle("active", button.dataset.tab === tabName));
  el.views.forEach((view) => view.classList.toggle("active", view.id === `${tabName}View`));

  if (tabName === "publicResults") {
    loadPublicElections();
  }
}

function disableDatabaseControls() {
  document.querySelectorAll("input, select, textarea, button").forEach((control) => {
    if (!control.classList.contains("tab-button")) {
      control.disabled = true;
    }
  });
}

async function loadOpenElections() {
  if (!db) return;

  clearMessage(el.tokenMessage);
  const { data, error } = await db
    .from("elections")
    .select("id,title,seats,status")
    .eq("status", "open")
    .is("archived_at", null)
    .order("opened_at", { ascending: false, nullsFirst: false });

  if (error) {
    showMessage(el.tokenMessage, readableError(error), "error");
    return;
  }

  state.openElections = data || [];
  renderElectionSelect(el.voterElectionSelect, state.openElections, "Keine offene Wahl verfügbar");

  const electionFromUrl = new URLSearchParams(window.location.search).get("election");
  if (electionFromUrl && state.openElections.some((election) => election.id === electionFromUrl)) {
    el.voterElectionSelect.value = electionFromUrl;
  }
}

async function verifyVoterToken(event) {
  event.preventDefault();
  clearMessage(el.tokenMessage);
  clearMessage(el.ballotMessage);

  const electionId = el.voterElectionSelect.value;
  const token = el.voterToken.value.trim();
  if (!electionId || !token) {
    showMessage(el.tokenMessage, "Bitte wähle eine offene Wahl aus und gib deinen Wahlcode ein.", "error");
    return;
  }

  const { data, error } = await db.rpc("check_voter_token", {
    p_election_id: electionId,
    p_token_plaintext: token
  });

  if (error || !data?.ok) {
    showMessage(el.tokenMessage, data?.message || readableError(error), "error");
    return;
  }

  const { data: candidates, error: candidateError } = await db
    .from("candidates")
    .select("id,name,sort_order")
    .eq("election_id", electionId)
    .order("sort_order", { ascending: true });

  if (candidateError) {
    showMessage(el.tokenMessage, readableError(candidateError), "error");
    return;
  }

  state.selectedVoterElection = state.openElections.find((election) => election.id === electionId);
  state.voterCandidates = candidates || [];
  state.verifiedToken = token;
  state.voterCandidateOrder = shuffle([...state.voterCandidates]);

  renderBallot();
  showMessage(el.tokenMessage, "Code gültig. Bitte fülle jetzt den Stimmzettel aus.", "success");
}

function renderBallot() {
  const election = state.selectedVoterElection;
  if (!election) return;

  el.ballotPanel.classList.remove("hidden");
  el.ballotSeatBadge.textContent = `${election.seats} ${personWord(election.seats)}`;
  el.ballotInstruction.textContent = `Wähle genau ${election.seats} unterschiedliche ${personWord(election.seats)}. Ein Name darf pro Stimmzettel nicht mehrfach gewählt werden.`;
  el.ballotFields.innerHTML = "";

  for (let index = 0; index < election.seats; index += 1) {
    const card = document.createElement("div");
    card.className = "vote-card";

    const label = document.createElement("label");
    label.htmlFor = `ballot-choice-${index}`;
    label.textContent = `Stimme ${index + 1}`;

    const select = document.createElement("select");
    select.id = `ballot-choice-${index}`;
    select.dataset.voteSelect = "true";
    select.required = true;
    select.addEventListener("change", updateBallotOptionAvailability);

    card.append(label, select);
    el.ballotFields.append(card);
  }

  updateBallotOptionAvailability();
}

function updateBallotOptionAvailability() {
  const selects = getBallotSelects();
  const selections = selects.map((select) => select.value);

  selects.forEach((select) => {
    const currentValue = select.value;
    select.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Bitte auswählen";
    select.appendChild(placeholder);

    state.voterCandidateOrder.forEach((candidate) => {
      const option = document.createElement("option");
      option.value = candidate.id;
      option.textContent = candidate.name;
      option.disabled = selections.includes(candidate.id) && currentValue !== candidate.id;
      select.appendChild(option);
    });

    select.value = currentValue;
  });
}

async function submitBallot(event) {
  event.preventDefault();
  clearMessage(el.ballotMessage);

  const candidateIds = getBallotSelects().map((select) => select.value).filter(Boolean);
  const validation = validateBallot(candidateIds, state.selectedVoterElection?.seats || 0);
  if (!validation.ok) {
    showMessage(el.ballotMessage, validation.message, "error");
    return;
  }

  const { data, error } = await db.rpc("cast_vote", {
    p_election_id: state.selectedVoterElection.id,
    p_token_plaintext: state.verifiedToken,
    p_candidate_ids: candidateIds
  });

  if (error || !data?.ok) {
    showMessage(el.ballotMessage, data?.message || readableError(error), "error");
    return;
  }

  state.verifiedToken = "";
  state.selectedVoterElection = null;
  state.voterCandidates = [];
  state.voterCandidateOrder = [];
  el.voterToken.value = "";
  el.ballotPanel.classList.add("hidden");
  el.ballotFields.innerHTML = "";
  showMessage(el.tokenMessage, "Deine Stimme wurde gezählt.", "success");
}

function resetBallotSelection() {
  state.voterCandidateOrder = shuffle([...state.voterCandidates]);
  renderBallot();
  showMessage(el.ballotMessage, "Auswahl zurückgesetzt.", "info");
}

function validateBallot(candidateIds, seats) {
  if (candidateIds.length !== seats) {
    return { ok: false, message: `Der Stimmzettel ist nur gültig, wenn genau ${seats} unterschiedliche ${personWord(seats)} ausgewählt wurden.` };
  }

  if (new Set(candidateIds).size !== candidateIds.length) {
    return { ok: false, message: "Ein Name darf pro Stimmzettel nicht mehrfach gewählt werden." };
  }

  return { ok: true };
}

async function loginAdmin(event) {
  event.preventDefault();
  clearMessage(el.loginMessage);

  const email = el.adminEmail.value.trim();
  const password = el.adminPassword.value;
  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    showMessage(el.loginMessage, readableError(error), "error");
    return;
  }

  el.loginForm.reset();
  const { data } = await db.auth.getSession();
  state.session = data.session;
  await refreshAdminAccess();

  if (state.isAdmin) {
    showMessage(el.loginMessage, "Admin-Login erfolgreich.", "success");
    await loadAdminElections();
  }
}

async function logoutAdmin() {
  await db.auth.signOut();
  state.adminElections = [];
  state.selectedAdminElection = null;
  state.latestAdminDashboard = null;
  state.isAdmin = false;
  renderAuthState();
}

async function refreshAdminAccess() {
  if (!state.session) {
    state.isAdmin = false;
    renderAuthState();
    return;
  }

  const { data, error } = await db.rpc("is_admin");
  state.isAdmin = !error && data === true;
  renderAuthState();

  if (!state.isAdmin) {
    showMessage(el.loginMessage, "Du bist eingeloggt, aber nicht als Wahlleitung freigeschaltet.", "error");
  }
}

function renderAuthState() {
  const loggedIn = Boolean(state.session);
  const canUseAdmin = loggedIn && state.isAdmin;
  el.loginForm.classList.toggle("hidden", loggedIn);
  el.logoutButton.classList.toggle("hidden", !loggedIn);
  el.adminWorkspace.classList.toggle("hidden", !canUseAdmin);
  el.adminStatus.textContent = canUseAdmin ? "Eingeloggt" : loggedIn ? "Keine Admin-Berechtigung" : "Nicht eingeloggt";
}

async function loadAdminElections() {
  if (!state.session) return;

  clearMessage(el.electionMessage);
  const { data, error } = await db
    .from("elections")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    showMessage(el.electionMessage, readableError(error), "error");
    return;
  }

  state.adminElections = data || [];
  renderElectionSelect(el.adminElectionSelect, state.adminElections, "Noch keine Wahl angelegt");

  if (state.adminElections.length > 0) {
    const currentId = state.selectedAdminElection?.id;
    const nextId = state.adminElections.some((election) => election.id === currentId)
      ? currentId
      : state.adminElections[0].id;
    el.adminElectionSelect.value = nextId;
    await selectAdminElection(nextId);
  } else {
    prepareNewElection();
    renderEmptyAdminResults();
  }
}

async function selectAdminElection(electionId) {
  clearMessage(el.electionMessage);
  clearMessage(el.codeMessage);
  clearMessage(el.adminResultMessage);

  const election = state.adminElections.find((item) => item.id === electionId);
  if (!election) {
    prepareNewElection();
    return;
  }

  state.selectedAdminElection = election;

  const { data: candidates, error } = await db
    .from("candidates")
    .select("id,name,sort_order")
    .eq("election_id", election.id)
    .order("sort_order", { ascending: true });

  if (error) {
    showMessage(el.electionMessage, readableError(error), "error");
    return;
  }

  state.selectedAdminCandidates = candidates || [];
  fillElectionForm(election, state.selectedAdminCandidates);
  await loadAdminDashboard(election.id);
}

function fillElectionForm(election, candidates) {
  el.electionTitleInput.value = election.title;
  el.seatsInput.value = election.seats;
  el.candidateTextarea.value = candidates.map((candidate) => candidate.name).join("\n");
  el.publicResultsInput.checked = Boolean(election.public_results);
  el.adminStatus.textContent = statusLabel(election.status);

  const isDraft = election.status === "draft";
  el.seatsInput.disabled = !isDraft;
  el.candidateTextarea.disabled = !isDraft;
  el.saveElectionButton.disabled = false;
  el.openElectionButton.disabled = !isDraft;
  el.closeElectionButton.disabled = election.status !== "open";
  el.generateCodesButton.disabled = !election.id || election.status === "closed";
}

function prepareNewElection() {
  state.selectedAdminElection = null;
  state.selectedAdminCandidates = [];
  state.latestAdminDashboard = null;
  el.electionForm.reset();
  el.seatsInput.value = "3";
  el.publicResultsInput.checked = false;
  el.seatsInput.disabled = false;
  el.candidateTextarea.disabled = false;
  el.saveElectionButton.disabled = false;
  el.openElectionButton.disabled = true;
  el.closeElectionButton.disabled = true;
  el.generateCodesButton.disabled = true;
  el.adminStatus.textContent = "Neue Wahl";
  renderEmptyAdminResults();
}

async function saveElection(event) {
  event.preventDefault();
  clearMessage(el.electionMessage);

  const validation = validateElectionForm();
  if (!validation.ok) {
    showMessage(el.electionMessage, validation.errors.join(" "), "error");
    return;
  }

  if (state.selectedAdminElection) {
    if (state.selectedAdminElection.status === "draft") {
      await updateDraftElection(validation);
    } else {
      await updateElectionMetadata(validation);
    }
  } else {
    await createElection(validation);
  }
}

async function createElection(validation) {
  const { data: election, error } = await db
    .from("elections")
    .insert({
      title: validation.title,
      seats: validation.seats,
      public_results: validation.publicResults
    })
    .select()
    .single();

  if (error) {
    showMessage(el.electionMessage, readableError(error), "error");
    return;
  }

  const rows = validation.candidates.map((name, index) => ({
    election_id: election.id,
    name,
    sort_order: index + 1
  }));

  const { error: candidateError } = await db.from("candidates").insert(rows);
  if (candidateError) {
    showMessage(el.electionMessage, readableError(candidateError), "error");
    return;
  }

  showMessage(el.electionMessage, "Wahl wurde als Entwurf gespeichert.", "success");
  await loadAdminElections();
  el.adminElectionSelect.value = election.id;
  await selectAdminElection(election.id);
}

async function updateDraftElection(validation) {
  if (state.selectedAdminElection.status !== "draft") {
    showMessage(el.electionMessage, "Kandidaten und Sitzzahl können nach Wahlstart nicht mehr geändert werden.", "error");
    return;
  }

  const electionId = state.selectedAdminElection.id;
  const { error: electionError } = await db
    .from("elections")
    .update({
      title: validation.title,
      seats: validation.seats,
      public_results: validation.publicResults
    })
    .eq("id", electionId);

  if (electionError) {
    showMessage(el.electionMessage, readableError(electionError), "error");
    return;
  }

  const { error: deleteError } = await db.from("candidates").delete().eq("election_id", electionId);
  if (deleteError) {
    showMessage(el.electionMessage, readableError(deleteError), "error");
    return;
  }

  const rows = validation.candidates.map((name, index) => ({
    election_id: electionId,
    name,
    sort_order: index + 1
  }));
  const { error: insertError } = await db.from("candidates").insert(rows);
  if (insertError) {
    showMessage(el.electionMessage, readableError(insertError), "error");
    return;
  }

  showMessage(el.electionMessage, "Entwurf wurde aktualisiert.", "success");
  await loadAdminElections();
}

async function updateElectionMetadata(validation) {
  const electionId = state.selectedAdminElection.id;
  const { error } = await db
    .from("elections")
    .update({
      title: validation.title,
      public_results: validation.publicResults
    })
    .eq("id", electionId);

  if (error) {
    showMessage(el.electionMessage, readableError(error), "error");
    return;
  }

  showMessage(el.electionMessage, "Titel und Ergebnisfreigabe wurden gespeichert.", "success");
  await Promise.all([loadAdminElections(), loadPublicElections()]);
}

function validateElectionForm() {
  const errors = [];
  const title = el.electionTitleInput.value.trim();
  const seats = Number.parseInt(el.seatsInput.value, 10);
  const candidates = parseCandidateLines(el.candidateTextarea.value);
  const duplicates = findDuplicates(candidates);

  if (!title) errors.push("Bitte gib einen Wahlname ein.");
  if (!Number.isInteger(seats) || seats < 1) errors.push("Die Anzahl der zu wählenden Personen muss mindestens 1 sein.");
  if (candidates.length < seats) errors.push(`Es müssen mindestens ${seats} unterschiedliche Kandidatennamen vorhanden sein.`);
  if (duplicates.length > 0) errors.push(`Diese Kandidatennamen kommen mehrfach vor: ${duplicates.join(", ")}.`);

  return {
    ok: errors.length === 0,
    errors,
    title,
    seats,
    candidates,
    publicResults: el.publicResultsInput.checked
  };
}

async function openElection() {
  const election = state.selectedAdminElection;
  if (!election) return;

  const confirmed = window.confirm("Wahl jetzt starten? Kandidatenliste und Sitzzahl werden dadurch gesperrt.");
  if (!confirmed) return;

  const { error } = await db
    .from("elections")
    .update({ status: "open", opened_at: new Date().toISOString() })
    .eq("id", election.id);

  if (error) {
    showMessage(el.electionMessage, readableError(error), "error");
    return;
  }

  showMessage(el.electionMessage, "Wahl wurde gestartet.", "success");
  await Promise.all([loadAdminElections(), loadOpenElections()]);
}

async function closeElection() {
  const election = state.selectedAdminElection;
  if (!election) return;

  const confirmed = window.confirm("Wahl schließen? Danach können keine Stimmen mehr abgegeben werden.");
  if (!confirmed) return;

  const { error } = await db
    .from("elections")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", election.id);

  if (error) {
    showMessage(el.electionMessage, readableError(error), "error");
    return;
  }

  showMessage(el.electionMessage, "Wahl wurde geschlossen.", "success");
  await Promise.all([loadAdminElections(), loadOpenElections(), loadPublicElections()]);
}

async function archiveElection() {
  const election = state.selectedAdminElection;
  if (!election) return;

  const confirmed = window.confirm("Wahl archivieren? Sie verschwindet aus der aktiven Admin-Liste.");
  if (!confirmed) return;

  const { error } = await db
    .from("elections")
    .update({
      status: election.status === "draft" ? "draft" : "closed",
      archived_at: new Date().toISOString()
    })
    .eq("id", election.id);

  if (error) {
    showMessage(el.electionMessage, readableError(error), "error");
    return;
  }

  showMessage(el.electionMessage, "Wahl wurde archiviert.", "success");
  await loadAdminElections();
}

async function deleteElection() {
  const election = state.selectedAdminElection;
  if (!election) return;

  const confirmation = window.prompt('Zum endgültigen Löschen bitte "LÖSCHEN" eingeben.');
  if (confirmation !== "LÖSCHEN") {
    showMessage(el.electionMessage, "Die Wahl wurde nicht gelöscht.", "info");
    return;
  }

  const { data, error } = await db.rpc("admin_delete_election", { p_election_id: election.id });
  if (error || !data?.ok) {
    showMessage(el.electionMessage, data?.message || readableError(error), "error");
    return;
  }

  showMessage(el.electionMessage, "Wahl und alle zugehörigen Daten wurden gelöscht.", "success");
  await Promise.all([loadAdminElections(), loadOpenElections(), loadPublicElections()]);
}

async function generateCodes() {
  clearMessage(el.codeMessage);
  const election = state.selectedAdminElection;
  const amount = Number.parseInt(el.codeAmountInput.value, 10);

  if (!election) {
    showMessage(el.codeMessage, "Bitte wähle zuerst eine Wahl aus.", "error");
    return;
  }

  if (!Number.isInteger(amount) || amount < 1 || amount > 2000) {
    showMessage(el.codeMessage, "Bitte gib eine Anzahl zwischen 1 und 2000 ein.", "error");
    return;
  }

  const codes = createReadableCodes(amount);
  const rows = await Promise.all(codes.map(async (code) => ({
    election_id: election.id,
    token_hash: await sha256Hex(normalizeToken(code))
  })));

  const { error } = await db.from("voter_tokens").insert(rows);
  if (error) {
    showMessage(el.codeMessage, readableError(error), "error");
    return;
  }

  state.latestGeneratedCodes = codes;
  el.generatedCodesOutput.value = codes.join("\n");
  el.downloadCodesButton.disabled = false;
  showMessage(el.codeMessage, `${codes.length} Wahlcodes wurden erzeugt. Bitte jetzt sicher speichern oder ausdrucken.`, "success");
  await loadAdminDashboard(election.id);
}

function createReadableCodes(amount) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codes = new Set();

  while (codes.size < amount) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let raw = "";
    bytes.forEach((byte) => {
      raw += alphabet[byte % alphabet.length];
    });
    codes.add(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }

  return Array.from(codes);
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function downloadGeneratedCodes() {
  if (state.latestGeneratedCodes.length === 0) return;

  const title = state.selectedAdminElection?.title || "wahlcodes";
  const csv = ["Wahlcode", ...state.latestGeneratedCodes].map(csvEscape).join("\n");
  downloadTextFile(csv, `wahlcodes-${slugify(title)}.csv`, "text/csv;charset=utf-8");
}

async function loadAdminDashboard(electionId) {
  const { data, error } = await db.rpc("admin_election_dashboard", { p_election_id: electionId });
  if (error) {
    showMessage(el.adminResultMessage, readableError(error), "error");
    return;
  }

  state.latestAdminDashboard = data;
  renderResults(data, {
    stats: el.adminStats,
    body: el.adminResultBody,
    tie: el.adminTieNotice,
    message: el.adminResultMessage,
    includeTokenStats: true
  });
}

function renderEmptyAdminResults() {
  el.adminStats.innerHTML = "";
  el.adminResultBody.innerHTML = "";
  clearMessage(el.adminTieNotice);
}

async function loadPublicElections() {
  if (!db) return;

  const { data, error } = await db
    .from("elections")
    .select("id,title,seats,status")
    .eq("status", "closed")
    .eq("public_results", true)
    .is("archived_at", null)
    .order("closed_at", { ascending: false, nullsFirst: false });

  if (error) {
    showMessage(el.publicResultMessage, readableError(error), "error");
    return;
  }

  state.publicElections = data || [];
  renderElectionSelect(el.publicElectionSelect, state.publicElections, "Kein Ergebnis öffentlich freigegeben");

  if (state.publicElections.length > 0) {
    await loadPublicDashboard(state.publicElections[0].id);
  } else {
    state.latestPublicDashboard = null;
    el.publicResultStats.innerHTML = "";
    el.publicResultBody.innerHTML = "";
    clearMessage(el.publicTieNotice);
  }
}

async function loadPublicDashboard(electionId) {
  if (!electionId) return;

  const { data, error } = await db.rpc("public_election_results", { p_election_id: electionId });
  if (error) {
    showMessage(el.publicResultMessage, readableError(error), "error");
    return;
  }

  state.latestPublicDashboard = data;
  renderResults(data, {
    stats: el.publicResultStats,
    body: el.publicResultBody,
    tie: el.publicTieNotice,
    message: el.publicResultMessage,
    includeTokenStats: false
  });
}

function renderResults(dashboard, targets) {
  if (!dashboard) return;

  const election = dashboard.election || {};
  const rows = rankRows(dashboard.results || [], election.seats || 0, dashboard.ballot_count || 0);

  targets.stats.innerHTML = `
    <article class="stat-card">
      <p class="stat-label">Wahl</p>
      <p class="stat-value">${escapeHtml(election.title || "-")}</p>
    </article>
    <article class="stat-card">
      <p class="stat-label">Status</p>
      <p class="stat-value">${escapeHtml(statusLabel(election.status || "-"))}</p>
    </article>
    <article class="stat-card">
      <p class="stat-label">Stimmzettel</p>
      <p class="stat-value">${dashboard.ballot_count || 0}</p>
    </article>
    <article class="stat-card">
      <p class="stat-label">Einzelstimmen</p>
      <p class="stat-value">${dashboard.single_vote_count || 0}</p>
    </article>
    ${targets.includeTokenStats ? `
      <article class="stat-card">
        <p class="stat-label">Verwendete Codes</p>
        <p class="stat-value">${dashboard.used_token_count || 0}</p>
      </article>
      <article class="stat-card">
        <p class="stat-label">Offene Codes</p>
        <p class="stat-value">${dashboard.unused_token_count || 0}</p>
      </article>
    ` : ""}
  `;

  targets.body.innerHTML = "";
  rows.rows.forEach((row) => {
    const tr = document.createElement("tr");
    if (row.isBoundaryTie) {
      tr.classList.add("row-tie");
    } else if (row.isElected) {
      tr.classList.add("row-elected");
    }

    tr.innerHTML = `
      <td>${row.rank}</td>
      <td>${escapeHtml(row.name)}</td>
      <td>${row.vote_count}</td>
      <td>${statusBadge(row)}</td>
    `;
    targets.body.appendChild(tr);
  });

  if (rows.hasBoundaryTie) {
    showMessage(targets.tie, "Achtung: Stimmengleichheit an der Entscheidungsgrenze. Es ist ggf. eine Stichwahl nötig.", "warning");
  } else {
    clearMessage(targets.tie);
  }

  clearMessage(targets.message);
}

function rankRows(results, seats, ballotCount) {
  const sorted = [...results].sort((a, b) => {
    if (b.vote_count !== a.vote_count) return b.vote_count - a.vote_count;
    return a.name.localeCompare(b.name, "de", { sensitivity: "base" });
  });

  const threshold = sorted[seats - 1];
  const next = sorted[seats];
  const hasBoundaryTie = Boolean(ballotCount > 0 && threshold && next && threshold.vote_count === next.vote_count);
  const thresholdVotes = threshold?.vote_count ?? null;

  let previousVotes = null;
  let rank = 0;
  const rows = sorted.map((row, index) => {
    if (row.vote_count !== previousVotes) {
      rank = index + 1;
      previousVotes = row.vote_count;
    }

    const isBoundaryTie = hasBoundaryTie && row.vote_count === thresholdVotes;
    const isElected = hasBoundaryTie ? row.vote_count > thresholdVotes : index < seats;
    return { ...row, rank, isBoundaryTie, isElected };
  });

  return { rows, hasBoundaryTie };
}

function statusBadge(row) {
  if (row.isBoundaryTie) return '<span class="badge badge-tie">Stichwahl prüfen</span>';
  if (row.isElected) return '<span class="badge badge-elected">Gewählt</span>';
  return '<span class="badge badge-open">Nicht gewählt</span>';
}

function exportAdminResults() {
  if (!state.latestAdminDashboard) return;
  const csv = dashboardToCsv(state.latestAdminDashboard);
  const title = state.latestAdminDashboard.election?.title || "ergebnis";
  downloadTextFile(csv, `ergebnis-${slugify(title)}.csv`, "text/csv;charset=utf-8");
}

async function copyAdminResults() {
  if (!state.latestAdminDashboard) return;
  const text = dashboardToText(state.latestAdminDashboard);

  try {
    await navigator.clipboard.writeText(text);
  } catch (_error) {
    fallbackCopy(text);
  }

  showMessage(el.adminResultMessage, "Ergebnis wurde kopiert.", "success");
}

function dashboardToCsv(dashboard) {
  const election = dashboard.election || {};
  const ranked = rankRows(dashboard.results || [], election.seats || 0, dashboard.ballot_count || 0).rows;
  const rows = [
    ["Wahl", election.title || ""],
    ["Status", statusLabel(election.status || "")],
    ["Abgegebene Stimmzettel", dashboard.ballot_count || 0],
    ["Vergebene Einzelstimmen", dashboard.single_vote_count || 0],
    ["Verwendete Wahlcodes", dashboard.used_token_count || 0],
    ["Nicht verwendete Wahlcodes", dashboard.unused_token_count || 0],
    [],
    ["Rang", "Kandidat/in", "Stimmen", "Status"],
    ...ranked.map((row) => [
      row.rank,
      row.name,
      row.vote_count,
      row.isBoundaryTie ? "Stichwahl prüfen" : row.isElected ? "Gewählt" : "Nicht gewählt"
    ])
  ];

  return rows.map((row) => row.map(csvEscape).join(";")).join("\n");
}

function dashboardToText(dashboard) {
  const election = dashboard.election || {};
  const ranked = rankRows(dashboard.results || [], election.seats || 0, dashboard.ballot_count || 0).rows;
  return [
    election.title || "Wahlergebnis",
    `Status: ${statusLabel(election.status || "")}`,
    `Abgegebene Stimmzettel: ${dashboard.ballot_count || 0}`,
    `Vergebene Einzelstimmen: ${dashboard.single_vote_count || 0}`,
    `Verwendete Wahlcodes: ${dashboard.used_token_count || 0}`,
    `Nicht verwendete Wahlcodes: ${dashboard.unused_token_count || 0}`,
    "",
    "Rang | Kandidat/in | Stimmen | Status",
    ...ranked.map((row) => {
      const status = row.isBoundaryTie ? "Stichwahl prüfen" : row.isElected ? "Gewählt" : "Nicht gewählt";
      return `${row.rank} | ${row.name} | ${row.vote_count} | ${status}`;
    })
  ].join("\n");
}

function renderElectionSelect(select, elections, emptyText) {
  select.innerHTML = "";

  if (elections.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = emptyText;
    select.appendChild(option);
    return;
  }

  elections.forEach((election) => {
    const option = document.createElement("option");
    option.value = election.id;
    option.textContent = `${election.title} (${statusLabel(election.status)})`;
    select.appendChild(option);
  });
}

function getBallotSelects() {
  return Array.from(el.ballotFields.querySelectorAll("[data-vote-select='true']"));
}

function parseCandidateLines(text) {
  return text
    .split(/\r?\n/)
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
}

function findDuplicates(names) {
  const seen = new Set();
  const duplicates = new Set();

  names.forEach((name) => {
    const key = name.toLocaleLowerCase("de-DE");
    if (seen.has(key)) duplicates.add(name);
    seen.add(key);
  });

  return Array.from(duplicates).sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
}

function normalizeToken(token) {
  return token.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

function personWord(count) {
  return count === 1 ? "Person" : "Personen";
}

function statusLabel(status) {
  const labels = {
    draft: "Entwurf",
    open: "Offen",
    closed: "Geschlossen"
  };
  return labels[status] || status;
}

function readableError(error) {
  return error?.message || "Es ist ein unerwarteter Fehler aufgetreten.";
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[;"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function slugify(text) {
  return String(text)
    .toLocaleLowerCase("de-DE")
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "wahl";
}

function downloadTextFile(content, filename, type) {
  const blob = new Blob(["\ufeff", content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function showMessage(element, text, type) {
  element.textContent = text;
  element.className = `message visible ${type}`;
}

function clearMessage(element) {
  element.textContent = "";
  element.className = "message";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
