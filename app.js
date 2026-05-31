const STORAGE_KEY = "lockInTrackerIB.v1";
const firebaseConfig = {
  apiKey: "AIzaSyAsbIaqCSTayNxbPbefmCJt_FfP7mZtvLU",
  authDomain: "lock-in-tracker.firebaseapp.com",
  databaseURL: "https://lock-in-tracker-default-rtdb.firebaseio.com",
  projectId: "lock-in-tracker",
  storageBucket: "lock-in-tracker.firebasestorage.app",
  messagingSenderId: "206686789868",
  appId: "1:206686789868:web:5a0e02fa630981f03ac5c9",
  measurementId: "G-KHT96FLV13",
};

let auth = null;
let database = null;
let googleProvider = null;

const views = [
  { id: "dashboard", label: "Dashboard", icon: "DB" },
  { id: "tasks", label: "Tareas", icon: "TA" },
  { id: "advisories", label: "Asesorias", icon: "AS" },
  { id: "ib", label: "IB", icon: "IB" },
  { id: "personal", label: "Personal", icon: "PE" },
  { id: "habits", label: "Habitos", icon: "HA" },
  { id: "resources", label: "Recursos", icon: "RE" },
  { id: "settings", label: "Ajustes", icon: "AJ" },
];

const weekdays = [
  { id: 1, label: "Lunes" },
  { id: 2, label: "Martes" },
  { id: 3, label: "Miercoles" },
  { id: 4, label: "Jueves" },
  { id: 5, label: "Viernes" },
];

const defaultSubjects = [
  { id: "literatura", name: "Literatura", color: "#79c7b3", active: true },
  { id: "sociedad-digital", name: "Sociedad Digital", color: "#8da7ff", active: true },
  { id: "matematicas", name: "Matematicas", color: "#f2c66d", active: true },
  { id: "ingles", name: "Ingles", color: "#ef9fbc", active: true },
  { id: "biologia", name: "Biologia", color: "#8be28f", active: true },
  { id: "historia", name: "Historia", color: "#ff9f7a", active: true },
];

const defaultIBProjects = [
  { id: cryptoId(), type: "IA", title: "Internal Assessments", status: "Planeacion", milestones: ["Definir tema", "Primer borrador", "Entrega final"] },
  { id: cryptoId(), type: "EE", title: "Extended Essay", status: "Investigacion", milestones: ["Pregunta de investigacion", "Fuentes", "Borrador"] },
  { id: cryptoId(), type: "TOK", title: "Theory of Knowledge", status: "Borrador", milestones: ["Exhibicion", "Ensayo", "Revision"] },
];

const defaultResourceFolders = [{ id: "general", name: "General" }];

let state = loadState();
let currentView = "dashboard";
let manualRecommendedRequired = false;
let selectedResourceFolder = "all";
let selectedResourceSubject = "all";
let firebaseSaveTimer = null;
let isRemoteHydrating = false;
let currentUser = null;
let authMode = "login";

const els = {
  authScreen: document.querySelector("#authScreen"),
  authGateForm: document.querySelector("#authGateForm"),
  authTitle: document.querySelector("#authTitle"),
  authSubmitButton: document.querySelector("#authSubmitButton"),
  authGateMessage: document.querySelector("#authGateMessage"),
  googleSignInButton: document.querySelector("#googleSignInButton"),
  toggleAuthMode: document.querySelector("#toggleAuthMode"),
  navList: document.querySelector("#navList"),
  viewTitle: document.querySelector("#viewTitle"),
  currentDate: document.querySelector("#currentDate"),
  modalBackdrop: document.querySelector("#modalBackdrop"),
  modalTitle: document.querySelector("#modalTitle"),
  modalKicker: document.querySelector("#modalKicker"),
  modalBody: document.querySelector("#modalBody"),
  modalClose: document.querySelector("#modalClose"),
  menuButton: document.querySelector("#menuButton"),
  authButton: document.querySelector("#authButton"),
  quickTaskButton: document.querySelector("#quickTaskButton"),
  quickAdvisoryButton: document.querySelector("#quickAdvisoryButton"),
  syncStatus: document.querySelector("#syncStatus"),
};

function cryptoId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  const fallback = createFallbackState();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    return normalizeState(JSON.parse(raw), fallback);
  } catch {
    return fallback;
  }
}

function createFallbackState() {
  return {
    subjects: defaultSubjects,
    advisories: [],
    tasks: [],
    habits: [
      { id: cryptoId(), name: "Repaso diario", frequency: "Diario", completions: [] },
      { id: cryptoId(), name: "Dormir temprano", frequency: "Diario", completions: [] },
    ],
    ibProjects: defaultIBProjects,
    resourceFolders: defaultResourceFolders,
    resources: [],
  };
}

function normalizeState(parsed, fallback = createFallbackState()) {
  return {
    subjects: Array.isArray(parsed?.subjects) && parsed.subjects.length ? parsed.subjects : fallback.subjects,
    advisories: Array.isArray(parsed?.advisories) ? parsed.advisories : [],
    tasks: Array.isArray(parsed?.tasks) ? parsed.tasks : [],
    habits: (parsed?.habits?.length ? parsed.habits : fallback.habits).map((habit) => ({
      id: habit.id || cryptoId(),
      name: habit.name || "Habito",
      frequency: habit.frequency || "Diario",
      completions: Array.isArray(habit.completions) ? habit.completions : [],
    })),
    ibProjects: (Array.isArray(parsed?.ibProjects) ? parsed.ibProjects : fallback.ibProjects).map((project) => ({
      id: project.id || cryptoId(),
      type: project.type || "IB",
      title: project.title || "Proyecto IB",
      status: project.status || "Planeacion",
      milestones: Array.isArray(project.milestones) ? project.milestones : [],
    })),
    resourceFolders: Array.isArray(parsed?.resourceFolders) && parsed.resourceFolders.length ? parsed.resourceFolders : fallback.resourceFolders,
    resources: Array.isArray(parsed?.resources) ? parsed.resources : [],
  };
}

function saveState(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!options.skipRemote && !isRemoteHydrating) scheduleFirebaseSave();
}

function setSyncStatus(message, tone = "muted") {
  if (!els.syncStatus) return;
  els.syncStatus.textContent = message;
  els.syncStatus.className = tone;
}

function initializeFirebase() {
  if (!window.firebase?.initializeApp || !window.firebase?.auth || !window.firebase?.database) {
    throw new Error("Firebase SDK no esta disponible.");
  }
  if (!window.firebase.apps.length) window.firebase.initializeApp(firebaseConfig);
  auth = window.firebase.auth();
  database = window.firebase.database();
  googleProvider = new window.firebase.auth.GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: "select_account" });
}

function appDataRef() {
  if (!currentUser) return null;
  return database.ref(`users/${currentUser.uid}/appData`);
}

function initFirebaseAuth() {
  setAuthGateMessage("Cargando Firebase...");
  try {
    initializeFirebase();
    auth.getRedirectResult().catch((error) => {
      setAuthGateMessage(authErrorMessage(error));
    });
    setAuthGateMessage("Entra con correo o usa tu cuenta de Google.");
    auth.onAuthStateChanged(handleAuthStateUser);
  } catch (error) {
    setAuthGateMessage("Firebase no cargo. Revisa internet, localhost y la version del SDK.");
    setSyncStatus("Firebase no cargo.", "warning");
  }
}

async function handleAuthStateUser(user) {
  currentUser = user;
  updateAuthUI();
  if (!user) {
    document.body.classList.add("auth-locked");
    setSyncStatus("Modo local. Inicia sesion para sincronizar.", "warning");
    return;
  }
  document.body.classList.remove("auth-locked");
  setAuthGateMessage("Sesion iniciada.");
  await loadFirebaseState();
}

function updateAuthUI() {
  if (!els.authButton) return;
  els.authButton.textContent = currentUser ? "Salir" : "Ingresar";
  els.authButton.title = currentUser?.email || "Iniciar sesion";
}

function updateAuthGateUI() {
  const isRegister = authMode === "register";
  els.authTitle.textContent = isRegister ? "Crear cuenta" : "Iniciar sesion";
  els.authSubmitButton.textContent = isRegister ? "Crear cuenta" : "Iniciar sesion";
  els.toggleAuthMode.textContent = isRegister ? "Ya tengo cuenta" : "Crear cuenta nueva";
  els.authGateMessage.textContent = isRegister
    ? "Crea tu cuenta con correo y una contrasena de minimo 6 caracteres."
    : "Entra con correo o usa tu cuenta de Google.";
}

function setAuthGateMessage(message) {
  if (els.authGateMessage) els.authGateMessage.textContent = message;
}

async function loadFirebaseState() {
  if (!currentUser) return;
  setSyncStatus("Conectando con tu cuenta...");
  try {
    const snapshot = await appDataRef().get();
    if (snapshot.exists()) {
      isRemoteHydrating = true;
      state = normalizeState(snapshot.val());
      saveState({ skipRemote: true });
      isRemoteHydrating = false;
      setSyncStatus("Sincronizado con Firebase.", "success");
      render();
      return;
    }
    await saveFirebaseStateNow();
    setSyncStatus("Firebase listo con tus datos locales.", "success");
  } catch (error) {
    isRemoteHydrating = false;
    setSyncStatus("Modo local: revisa Rules o conexion.", "warning");
  }
}

function scheduleFirebaseSave() {
  if (!currentUser) {
    setSyncStatus("Guardado local. Inicia sesion para sincronizar.", "warning");
    return;
  }
  setSyncStatus("Guardando en Firebase...");
  clearTimeout(firebaseSaveTimer);
  firebaseSaveTimer = setTimeout(() => {
    saveFirebaseStateNow();
  }, 650);
}

async function saveFirebaseStateNow() {
  if (!currentUser) {
    setSyncStatus("Guardado local. Inicia sesion para sincronizar.", "warning");
    return;
  }
  try {
    await appDataRef().set(state);
    setSyncStatus("Guardado en Firebase.", "success");
  } catch (error) {
    setSyncStatus("Guardado local. Firebase no disponible.", "warning");
  }
}

function subjectById(id) {
  return state.subjects.find((subject) => subject.id === id);
}

function activeSubjects() {
  return state.subjects.filter((subject) => subject.active);
}

function todayKey(date = new Date()) {
  return toDateInputValue(date);
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = parseDateOnly(value);
  return date.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

function formatLongDate(date = new Date()) {
  return date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

function normalizeText(text) {
  return text.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function compareDateValues(a, b) {
  return parseDateOnly(a || "9999-12-31") - parseDateOnly(b || "9999-12-31");
}

function getNextAdvisoryDate(subjectId, from = new Date()) {
  const matches = state.advisories
    .filter((advisory) => advisory.subjectId === subjectId)
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));

  if (!matches.length) return null;

  let best = null;
  for (const advisory of matches) {
    const candidate = nextDateForWeeklyAdvisory(advisory, from);
    if (!best || candidate < best.date) best = { date: candidate, advisory };
  }

  return {
    date: toDateInputValue(best.date),
    advisory: best.advisory,
  };
}

function nextDateForWeeklyAdvisory(advisory, from) {
  const targetWeekday = advisory.weekday;
  const currentWeekday = from.getDay() === 0 ? 7 : from.getDay();
  let daysUntil = targetWeekday - currentWeekday;
  if (daysUntil < 0) daysUntil += 7;

  const [hours, minutes] = advisory.startTime.split(":").map(Number);
  const candidate = new Date(from);
  candidate.setDate(from.getDate() + daysUntil);
  candidate.setHours(hours, minutes, 0, 0);

  if (candidate <= from) {
    candidate.setDate(candidate.getDate() + 7);
  }

  return candidate;
}

function sortedTasks() {
  const statusWeight = { pending: 0, doing: 1, complete: 2 };
  const priorityWeight = { alta: 0, media: 1, baja: 2 };
  return [...state.tasks].sort((a, b) => {
    const statusDiff = (statusWeight[a.status] ?? 0) - (statusWeight[b.status] ?? 0);
    if (statusDiff) return statusDiff;
    const priorityDiff = (priorityWeight[a.priority] ?? 1) - (priorityWeight[b.priority] ?? 1);
    if (priorityDiff) return priorityDiff;
    return compareDateValues(a.recommendedDate, b.recommendedDate) || compareDateValues(a.dueDate, b.dueDate);
  });
}

function tasksDueSoon(limit = 6) {
  return sortedTasks().filter((task) => task.status !== "complete").slice(0, limit);
}

function todaysAdvisories() {
  const day = new Date().getDay();
  return state.advisories
    .filter((advisory) => advisory.weekday === day)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function init() {
  els.currentDate.textContent = formatLongDate();
  updateAuthGateUI();
  renderNav();
  render();
  bindGlobalEvents();
  initFirebaseAuth();
}

function bindGlobalEvents() {
  els.menuButton.addEventListener("click", () => document.body.classList.toggle("nav-open"));
  els.authGateForm.addEventListener("submit", handleAuthGateSubmit);
  els.googleSignInButton.addEventListener("click", handleGoogleSignIn);
  els.toggleAuthMode.addEventListener("click", () => {
    authMode = authMode === "login" ? "register" : "login";
    updateAuthGateUI();
  });
  els.authButton.addEventListener("click", () => {
    if (currentUser) {
      auth.signOut();
      return;
    }
    openAuthModal();
  });
  els.quickTaskButton.addEventListener("click", () => openTaskModal());
  els.quickAdvisoryButton.addEventListener("click", () => openAdvisoryModal());
  els.modalClose.addEventListener("click", closeModal);
  els.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === els.modalBackdrop) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
}

function renderNav() {
  els.navList.innerHTML = views
    .map((view) => {
      const count = getNavCount(view.id);
      return `
        <button class="nav-button ${view.id === currentView ? "is-active" : ""}" type="button" data-view="${view.id}">
          <span class="nav-icon">${view.icon}</span>
          <span>${view.label}</span>
          ${count ? `<span class="nav-count">${count}</span>` : ""}
        </button>
      `;
    })
    .join("");

  els.navList.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      currentView = button.dataset.view;
      document.body.classList.remove("nav-open");
      render();
    });
  });
}

function getNavCount(viewId) {
  if (viewId === "tasks") return state.tasks.filter((task) => task.status !== "complete").length;
  if (viewId === "advisories") return state.advisories.length;
  if (viewId === "resources") return state.resources.length;
  return 0;
}

function render() {
  renderNav();
  views.forEach((view) => document.querySelector(`#view-${view.id}`).classList.toggle("is-active", view.id === currentView));
  els.viewTitle.textContent = views.find((view) => view.id === currentView)?.label || "Dashboard";

  const renderer = {
    dashboard: renderDashboard,
    tasks: renderTasks,
    advisories: renderAdvisories,
    ib: renderIB,
    personal: renderPersonal,
    habits: renderHabits,
    resources: renderResources,
    settings: renderSettings,
  }[currentView];
  renderer();
}

function renderDashboard() {
  const view = document.querySelector("#view-dashboard");
  const openTasks = state.tasks.filter((task) => task.status !== "complete");
  const completedHabits = state.habits.filter((habit) => (habit.completions || []).includes(todayKey())).length;
  view.innerHTML = `
    <div class="grid dashboard-grid">
      <div class="grid">
        <div class="grid cards-3">
          ${statCard("Pendientes", openTasks.length, "Tareas activas")}
          ${statCard("Asesorias", todaysAdvisories().length, "Programadas hoy")}
          ${statCard("Habitos", `${completedHabits}/${state.habits.length}`, "Completados hoy")}
        </div>
        <div class="panel">
          <div class="section-header">
            <div>
              <p class="eyebrow">Prioridad</p>
              <h3>Proximas tareas</h3>
            </div>
            <button class="primary-button" type="button" data-action="task">Agregar</button>
          </div>
          <div class="list">${renderTaskList(tasksDueSoon(), true)}</div>
        </div>
      </div>
      <div class="grid">
        <div class="panel">
          <div class="section-header">
            <div>
              <p class="eyebrow">Hoy</p>
              <h3>Asesorias</h3>
            </div>
            <button class="ghost-button" type="button" data-action="advisory">Editar horario</button>
          </div>
          <div class="list">${renderAdvisoryList(todaysAdvisories())}</div>
        </div>
        <div class="panel">
          <div class="section-header">
            <div>
              <p class="eyebrow">Accesos</p>
              <h3>Personal e IB</h3>
            </div>
          </div>
          <div class="grid cards-2">
            ${externalLinkCard("CAS Tracker", "Registro dedicado de CAS", "https://ib-cas-tracker.netlify.app")}
            ${externalLinkCard("Awis Gifts", "Ideas de regalos", "https://chichawis.github.io/Awis-Gifts-Tracker/")}
            ${externalLinkCard("Plan Tracker", "Salidas y dates", "https://chichawis.github.io/Plan-Tracker/")}
            ${internalCard("Recursos", "Links y apuntes por materia", "resources")}
          </div>
        </div>
      </div>
    </div>
  `;
  view.querySelector('[data-action="task"]').addEventListener("click", () => openTaskModal());
  view.querySelector('[data-action="advisory"]').addEventListener("click", () => {
    currentView = "advisories";
    render();
  });
  bindInternalCards(view);
  bindTaskActions(view);
}

function statCard(label, value, caption) {
  return `
    <div class="card stat-card">
      <p class="eyebrow">${label}</p>
      <div class="stat-value">${value}</div>
      <div class="muted">${caption}</div>
    </div>
  `;
}

function renderTasks() {
  const view = document.querySelector("#view-tasks");
  view.innerHTML = `
    <div class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Pendientes</p>
          <h3>Tareas y fechas recomendadas</h3>
        </div>
        <button class="primary-button" type="button" data-action="new-task">Nueva tarea</button>
      </div>
      <div class="toolbar">
        <button class="ghost-button" type="button" data-filter="all">Todas</button>
        <button class="ghost-button" type="button" data-filter="pending">Pendientes</button>
        <button class="ghost-button" type="button" data-filter="doing">En proceso</button>
        <button class="ghost-button" type="button" data-filter="complete">Completadas</button>
      </div>
      <div class="list" id="taskList">${renderTaskList(sortedTasks())}</div>
    </div>
  `;
  view.querySelector('[data-action="new-task"]').addEventListener("click", () => openTaskModal());
  view.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;
      let tasks = sortedTasks();
      if (filter !== "all") tasks = tasks.filter((task) => task.status === filter);
      view.querySelector("#taskList").innerHTML = renderTaskList(tasks);
      bindTaskActions(view);
    });
  });
  bindTaskActions(view);
}

function renderTaskList(tasks, compact = false) {
  if (!tasks.length) return `<div class="empty-state">No hay tareas aqui todavia.</div>`;
  return tasks
    .map((task) => {
      const subject = subjectById(task.subjectId);
      const recommendedAfterDue = task.recommendedDate && task.dueDate && parseDateOnly(task.recommendedDate) > parseDateOnly(task.dueDate);
      const overdue = task.dueDate && parseDateOnly(task.dueDate) < parseDateOnly(todayKey()) && task.status !== "complete";
      return `
        <article class="item ${task.status === "complete" ? "is-complete" : ""}">
          <div class="item-row">
            <p class="item-title">${escapeHtml(task.title)}</p>
            <div class="small-actions">
              <button class="small-button" type="button" data-task-toggle="${task.id}">${task.status === "complete" ? "Reabrir" : "Completar"}</button>
              ${compact ? "" : `<button class="small-button" type="button" data-task-edit="${task.id}">Editar</button>`}
              ${compact ? "" : `<button class="small-button" type="button" data-task-delete="${task.id}">Eliminar</button>`}
            </div>
          </div>
          <div class="meta">
            <span class="pill" style="color:${subject?.color || "var(--accent)"}"><span class="dot"></span>${subject?.name || "Materia"}</span>
            <span>Prioridad: ${task.priority || "media"}</span>
            <span>Hacer: ${formatDate(task.recommendedDate)}</span>
            <span>Vence: ${formatDate(task.dueDate)}</span>
            ${task.recommendationMode === "manual" ? `<span class="warning">Manual</span>` : ""}
            ${recommendedAfterDue ? `<span class="warning">La asesoria cae despues del vencimiento</span>` : ""}
            ${overdue ? `<span class="danger">Atrasada</span>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function bindTaskActions(root) {
  root.querySelectorAll("[data-task-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = state.tasks.find((item) => item.id === button.dataset.taskToggle);
      task.status = task.status === "complete" ? "pending" : "complete";
      saveState();
      render();
    });
  });
  root.querySelectorAll("[data-task-edit]").forEach((button) => {
    button.addEventListener("click", () => openTaskModal(button.dataset.taskEdit));
  });
  root.querySelectorAll("[data-task-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tasks = state.tasks.filter((task) => task.id !== button.dataset.taskDelete);
      saveState();
      render();
    });
  });
}

function renderAdvisories() {
  const view = document.querySelector("#view-advisories");
  view.innerHTML = `
    <div class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Lunes a viernes</p>
          <h3>Horario semanal de asesorias</h3>
        </div>
        <button class="primary-button" type="button" data-action="new-advisory">Nueva asesoria</button>
      </div>
      <div class="week-grid">
        ${weekdays
          .map((day) => {
            const items = state.advisories
              .filter((advisory) => advisory.weekday === day.id)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));
            return `
              <div class="day-column">
                <h3>${day.label}</h3>
                <div class="list">${renderAdvisoryList(items, true)}</div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
  view.querySelector('[data-action="new-advisory"]').addEventListener("click", () => openAdvisoryModal());
  bindAdvisoryActions(view);
}

function renderAdvisoryList(advisories, editable = false) {
  if (!advisories.length) return `<div class="empty-state">Sin asesorias programadas.</div>`;
  return advisories
    .map((advisory) => {
      const subject = subjectById(advisory.subjectId);
      return `
        <article class="item advisory-item" style="border-left-color:${subject?.color || "var(--accent)"}">
          <div class="item-row">
            <p class="item-title">${subject?.name || "Materia"}</p>
            ${
              editable
                ? `<div class="small-actions">
                    <button class="small-button" type="button" data-advisory-edit="${advisory.id}">Editar</button>
                    <button class="small-button" type="button" data-advisory-delete="${advisory.id}">Eliminar</button>
                  </div>`
                : ""
            }
          </div>
          <div class="meta"><span>${advisory.startTime} - ${advisory.endTime}</span></div>
        </article>
      `;
    })
    .join("");
}

function bindAdvisoryActions(root) {
  root.querySelectorAll("[data-advisory-edit]").forEach((button) => {
    button.addEventListener("click", () => openAdvisoryModal(button.dataset.advisoryEdit));
  });
  root.querySelectorAll("[data-advisory-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.advisories = state.advisories.filter((advisory) => advisory.id !== button.dataset.advisoryDelete);
      refreshAutomaticTaskRecommendations();
      saveState();
      render();
    });
  });
}

function renderIB() {
  const view = document.querySelector("#view-ib");
  view.innerHTML = `
    <div class="grid cards-2">
      <div class="panel">
        <div class="section-header">
          <div>
            <p class="eyebrow">IB</p>
            <h3>Proyectos principales</h3>
          </div>
        </div>
        <div class="list">
          ${state.ibProjects
            .map((project) => {
              const progress = project.status === "Terminado" ? 100 : project.status === "Borrador" ? 65 : project.status === "Investigacion" ? 38 : 18;
              return `
                <article class="item">
                  <div class="item-row">
                    <p class="item-title">${project.type}: ${escapeHtml(project.title)}</p>
                    <div class="small-actions">
                      <span class="pill">${project.status}</span>
                      <button class="small-button" type="button" data-ib-edit="${project.id}">Editar</button>
                    </div>
                  </div>
                  <div class="progress"><span style="width:${progress}%"></span></div>
                  <div class="meta">${project.milestones.map((milestone) => `<span>${escapeHtml(milestone)}</span>`).join("")}</div>
                </article>
              `;
            })
            .join("")}
        </div>
      </div>
      <div class="panel">
        <div class="section-header">
          <div>
            <p class="eyebrow">Externo</p>
            <h3>CAS Tracker</h3>
          </div>
        </div>
        <p class="muted">CAS vive en una pagina dedicada para mantener este centro enfocado en tareas y asesorias.</p>
        <a class="primary-button" href="https://ib-cas-tracker.netlify.app" target="_blank" rel="noreferrer">Abrir CAS Tracker</a>
      </div>
    </div>
  `;
  view.querySelectorAll("[data-ib-edit]").forEach((button) => {
    button.addEventListener("click", () => openIBProjectModal(button.dataset.ibEdit));
  });
}

function renderPersonal() {
  const view = document.querySelector("#view-personal");
  view.innerHTML = `
    <div class="grid cards-2">
      ${externalLinkCard("Awis Gifts Tracker", "Organiza regalos, ideas y detalles para tu novia.", "https://chichawis.github.io/Awis-Gifts-Tracker/")}
      ${externalLinkCard("Plan Tracker", "Planea salidas, dates y momentos juntos.", "https://chichawis.github.io/Plan-Tracker/")}
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="section-header">
        <div>
          <p class="eyebrow">Personal</p>
          <h3>Metas y balance</h3>
        </div>
      </div>
      <div class="grid cards-3">
        ${statCard("Academico", state.tasks.filter((task) => task.status !== "complete").length, "Pendientes activos")}
        ${statCard("Relacion", 2, "Herramientas enlazadas")}
        ${statCard("Rutina", state.habits.length, "Habitos configurados")}
      </div>
    </div>
  `;
}

function renderHabits() {
  const view = document.querySelector("#view-habits");
  view.innerHTML = `
    <div class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Rutina</p>
          <h3>Habitos personales</h3>
        </div>
        <button class="primary-button" type="button" data-action="new-habit">Nuevo habito</button>
      </div>
      <div class="list">
        ${
          state.habits.length
            ? state.habits
                .map((habit) => {
                  const done = habit.completions.includes(todayKey());
                  return `
                    <article class="item ${done ? "is-complete" : ""}">
                      <div class="item-row">
                        <p class="item-title">${escapeHtml(habit.name)}</p>
                        <div class="small-actions">
                          <button class="small-button" type="button" data-habit-toggle="${habit.id}">${done ? "Quitar hoy" : "Completar hoy"}</button>
                          <button class="small-button" type="button" data-habit-delete="${habit.id}">Eliminar</button>
                        </div>
                      </div>
                      <div class="meta"><span>${habit.frequency}</span><span>${habit.completions.length} registros</span></div>
                    </article>
                  `;
                })
                .join("")
            : `<div class="empty-state">Agrega habitos para cuidar tu energia, estudio y descanso.</div>`
        }
      </div>
    </div>
  `;
  view.querySelector('[data-action="new-habit"]').addEventListener("click", () => openHabitModal());
  view.querySelectorAll("[data-habit-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const habit = state.habits.find((item) => item.id === button.dataset.habitToggle);
      const key = todayKey();
      const completions = habit.completions || [];
      habit.completions = completions.includes(key) ? completions.filter((item) => item !== key) : [...completions, key];
      saveState();
      render();
    });
  });
  view.querySelectorAll("[data-habit-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.habits = state.habits.filter((habit) => habit.id !== button.dataset.habitDelete);
      saveState();
      render();
    });
  });
}

function renderResources() {
  const view = document.querySelector("#view-resources");
  const resources = state.resources.filter((resource) => {
    const folderMatch = selectedResourceFolder === "all" || (resource.folderId || "general") === selectedResourceFolder;
    const subjectMatch = selectedResourceSubject === "all" || resource.subjectId === selectedResourceSubject;
    return folderMatch && subjectMatch;
  });
  view.innerHTML = `
    <div class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Material</p>
          <h3>Recursos por materia</h3>
        </div>
        <div class="small-actions">
          <button class="ghost-button" type="button" data-action="new-folder">Nueva carpeta</button>
          <button class="primary-button" type="button" data-action="new-resource">Nuevo recurso</button>
        </div>
      </div>
      <div class="filter-row">
        <div class="segmented">
          <button type="button" data-folder-filter="all" class="${selectedResourceFolder === "all" ? "is-active" : ""}">Todas</button>
          ${state.resourceFolders
            .map((folder) => `<button type="button" data-folder-filter="${folder.id}" class="${selectedResourceFolder === folder.id ? "is-active" : ""}">${escapeHtml(folder.name)}</button>`)
            .join("")}
        </div>
        <select id="resourceSubjectFilter" aria-label="Filtrar recursos por materia">
          <option value="all">Todas las materias</option>
          ${state.subjects.map((subject) => `<option value="${subject.id}" ${selectedResourceSubject === subject.id ? "selected" : ""}>${subject.name}</option>`).join("")}
        </select>
        ${selectedResourceFolder !== "all" ? `<button class="small-button subtle-danger" type="button" data-action="delete-folder">Borrar carpeta</button>` : ""}
      </div>
      <div class="list">
        ${
          resources.length
            ? resources
                .map((resource) => {
                  const subject = subjectById(resource.subjectId);
                  const folder = state.resourceFolders.find((item) => item.id === (resource.folderId || "general"));
                  return `
                    <article class="item">
                      <div class="item-row">
                        <p class="item-title">${escapeHtml(resource.title)}</p>
                        <div class="small-actions">
                          <a class="small-button" href="${escapeAttribute(resource.url)}" target="_blank" rel="noreferrer">Abrir</a>
                          <button class="small-button" type="button" data-resource-delete="${resource.id}">Eliminar</button>
                        </div>
                      </div>
                      <div class="meta">
                        <span class="pill" style="color:${subject?.color || "var(--accent)"}"><span class="dot"></span>${subject?.name || "Materia"}</span>
                        <span>Carpeta: ${escapeHtml(folder?.name || "General")}</span>
                        <span>${escapeHtml(resource.notes || "Sin notas")}</span>
                      </div>
                    </article>
                  `;
                })
                .join("")
            : `<div class="empty-state">No hay recursos con estos filtros.</div>`
        }
      </div>
    </div>
  `;
  view.querySelector('[data-action="new-resource"]').addEventListener("click", () => openResourceModal());
  view.querySelector('[data-action="new-folder"]').addEventListener("click", () => openResourceFolderModal());
  const deleteFolderButton = view.querySelector('[data-action="delete-folder"]');
  if (deleteFolderButton) {
    deleteFolderButton.addEventListener("click", deleteSelectedResourceFolder);
  }
  view.querySelectorAll("[data-folder-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedResourceFolder = button.dataset.folderFilter;
      render();
    });
  });
  view.querySelector("#resourceSubjectFilter").addEventListener("change", (event) => {
    selectedResourceSubject = event.target.value;
    render();
  });
  view.querySelectorAll("[data-resource-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.resources = state.resources.filter((resource) => resource.id !== button.dataset.resourceDelete);
      saveState();
      render();
    });
  });
}

function renderSettings() {
  const view = document.querySelector("#view-settings");
  view.innerHTML = `
    <div class="grid cards-2">
      <div class="panel">
        <div class="section-header">
          <div>
            <p class="eyebrow">Catalogo</p>
            <h3>Materias</h3>
          </div>
          <button class="primary-button" type="button" data-action="new-subject">Nueva materia</button>
        </div>
        <div class="subject-list">
          ${state.subjects
            .map(
              (subject) => `
                <div class="subject-row">
                  <input value="${escapeAttribute(subject.name)}" data-subject-name="${subject.id}" aria-label="Nombre de materia" />
                  <input type="color" value="${subject.color}" data-subject-color="${subject.id}" aria-label="Color de ${escapeAttribute(subject.name)}" />
                  <label class="checkbox-row"><input type="checkbox" ${subject.active ? "checked" : ""} data-subject-active="${subject.id}" /> Activa</label>
                  <button class="small-button" type="button" data-subject-delete="${subject.id}">Eliminar</button>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="panel">
        <div class="section-header">
          <div>
            <p class="eyebrow">Datos</p>
            <h3>Respaldo local</h3>
          </div>
        </div>
        <div class="list">
          <button class="ghost-button" type="button" data-action="export">Exportar JSON</button>
          <label class="ghost-button" for="importFile" style="display:grid;place-items:center;cursor:pointer">Importar JSON</label>
          <input id="importFile" type="file" accept="application/json" hidden />
          <button class="danger-button" type="button" data-action="clear">Limpiar datos</button>
        </div>
      </div>
    </div>
  `;
  bindSettingsActions(view);
}

function bindSettingsActions(view) {
  view.querySelector('[data-action="new-subject"]').addEventListener("click", () => openSubjectModal());
  view.querySelectorAll("[data-subject-name]").forEach((input) => {
    input.addEventListener("change", () => {
      const subject = subjectById(input.dataset.subjectName);
      subject.name = input.value.trim() || subject.name;
      saveState();
      render();
    });
  });
  view.querySelectorAll("[data-subject-color]").forEach((input) => {
    input.addEventListener("input", () => {
      const subject = subjectById(input.dataset.subjectColor);
      subject.color = input.value;
      saveState();
      render();
    });
  });
  view.querySelectorAll("[data-subject-active]").forEach((input) => {
    input.addEventListener("change", () => {
      const subject = subjectById(input.dataset.subjectActive);
      subject.active = input.checked;
      saveState();
      render();
    });
  });
  view.querySelectorAll("[data-subject-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const inUse = state.tasks.some((task) => task.subjectId === button.dataset.subjectDelete) || state.advisories.some((advisory) => advisory.subjectId === button.dataset.subjectDelete);
      if (inUse) return alert("No se puede eliminar una materia con tareas o asesorias. Puedes desactivarla.");
      state.subjects = state.subjects.filter((subject) => subject.id !== button.dataset.subjectDelete);
      saveState();
      render();
    });
  });
  view.querySelector('[data-action="export"]').addEventListener("click", exportData);
  view.querySelector("#importFile").addEventListener("change", importData);
  view.querySelector('[data-action="clear"]').addEventListener("click", () => {
    if (!confirm("Esto borrara los datos locales de Lock-in Tracker. Deseas continuar?")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    saveFirebaseStateNow();
    render();
  });
}

function openModal(title, kicker, body) {
  els.modalTitle.textContent = title;
  els.modalKicker.textContent = kicker;
  els.modalBody.innerHTML = body;
  els.modalBackdrop.classList.add("is-active");
  els.modalBackdrop.setAttribute("aria-hidden", "false");
  const firstInput = els.modalBody.querySelector("input, select, textarea, button");
  if (firstInput) firstInput.focus();
}

function closeModal() {
  els.modalBackdrop.classList.remove("is-active");
  els.modalBackdrop.setAttribute("aria-hidden", "true");
  els.modalBody.innerHTML = "";
  manualRecommendedRequired = false;
}

async function handleAuthGateSubmit(event) {
  event.preventDefault();
  const email = document.querySelector("#gateEmail").value.trim();
  const password = document.querySelector("#gatePassword").value;
  els.authGateMessage.textContent = authMode === "register" ? "Creando cuenta..." : "Entrando...";
  try {
    if (!auth) initializeFirebase();
    if (authMode === "register") {
      const credential = await auth.createUserWithEmailAndPassword(email, password);
      await handleAuthStateUser(credential.user);
    } else {
      const credential = await auth.signInWithEmailAndPassword(email, password);
      await handleAuthStateUser(credential.user);
    }
  } catch (error) {
    els.authGateMessage.textContent = authErrorMessage(error);
  }
}

async function handleGoogleSignIn() {
  els.authGateMessage.textContent = "Abriendo Google...";
  try {
    if (!auth) initializeFirebase();
    const credential = await auth.signInWithPopup(googleProvider);
    await handleAuthStateUser(credential.user);
  } catch (error) {
    if (error?.code === "auth/popup-blocked" || error?.code === "auth/popup-closed-by-user") {
      els.authGateMessage.textContent = "El popup no se pudo completar. Redirigiendo a Google...";
      try {
        await auth.signInWithRedirect(googleProvider);
        return;
      } catch (redirectError) {
        els.authGateMessage.textContent = authErrorMessage(redirectError);
        return;
      }
    }
    els.authGateMessage.textContent = authErrorMessage(error);
  }
}

function openAuthModal() {
  openModal(
    "Ingresar",
    "Firebase Authentication",
    `
      <form id="authForm">
        <div class="form-grid">
          <div class="field full">
            <label for="authEmail">Correo</label>
            <input id="authEmail" type="email" autocomplete="email" required placeholder="tu-correo@email.com" />
          </div>
          <div class="field full">
            <label for="authPassword">Contrasena</label>
            <input id="authPassword" type="password" autocomplete="current-password" required minlength="6" />
          </div>
          <div class="field full">
            <div class="empty-state" id="authHint">Inicia sesion o crea una cuenta. Tus datos se guardaran en tu usuario.</div>
          </div>
        </div>
        <div class="form-actions">
          <button class="ghost-button" type="button" data-auth-create>Crear cuenta</button>
          <button class="primary-button" type="submit">Ingresar</button>
        </div>
      </form>
    `
  );

  const form = document.querySelector("#authForm");
  const hint = form.querySelector("#authHint");
  const getCredentials = () => ({
    email: form.querySelector("#authEmail").value.trim(),
    password: form.querySelector("#authPassword").value,
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { email, password } = getCredentials();
    hint.textContent = "Entrando...";
    try {
      if (!auth) initializeFirebase();
      const credential = await auth.signInWithEmailAndPassword(email, password);
      await handleAuthStateUser(credential.user);
      closeModal();
    } catch (error) {
      hint.textContent = authErrorMessage(error);
    }
  });

  form.querySelector("[data-auth-create]").addEventListener("click", async () => {
    const { email, password } = getCredentials();
    hint.textContent = "Creando cuenta...";
    try {
      if (!auth) initializeFirebase();
      const credential = await auth.createUserWithEmailAndPassword(email, password);
      await handleAuthStateUser(credential.user);
      closeModal();
    } catch (error) {
      hint.textContent = authErrorMessage(error);
    }
  });
}

function authErrorMessage(error) {
  const code = error?.code || "";
  if (code.includes("email-already-in-use")) return "Ese correo ya tiene cuenta. Intenta ingresar.";
  if (code.includes("invalid-email")) return "El correo no es valido.";
  if (code.includes("weak-password")) return "La contrasena debe tener al menos 6 caracteres.";
  if (code.includes("popup-closed-by-user")) return "Se cerro la ventana de Google antes de terminar.";
  if (code.includes("popup-blocked")) return "El navegador bloqueo la ventana de Google. Permite popups para esta pagina.";
  if (code.includes("unauthorized-domain")) return "Este dominio no esta autorizado en Firebase Authentication. Agrega localhost.";
  if (code.includes("operation-not-allowed")) return "Ese metodo de acceso no esta habilitado en Firebase Authentication.";
  if (code.includes("account-exists-with-different-credential")) return "Ese correo ya existe con otro metodo de acceso.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Correo o contrasena incorrectos.";
  }
  return `No se pudo completar la autenticacion${code ? ` (${code})` : ""}.`;
}

function openTaskModal(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  const subjects = activeSubjects();
  manualRecommendedRequired = false;
  openModal(
    task ? "Editar tarea" : "Nueva tarea",
    "Pendientes",
    `
      <form id="taskForm">
        <div class="form-grid">
          <div class="field full">
            <label for="taskTitle">Nombre</label>
            <input id="taskTitle" required value="${escapeAttribute(task?.title || "")}" placeholder="Ej. Ensayo de Literatura" />
          </div>
          <div class="field">
            <label for="taskSubject">Materia</label>
            <select id="taskSubject" required>
              ${subjects.map((subject) => `<option value="${subject.id}" ${task?.subjectId === subject.id ? "selected" : ""}>${subject.name}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="taskDue">Vencimiento</label>
            <input id="taskDue" type="date" required value="${task?.dueDate || ""}" />
          </div>
          <div class="field">
            <label for="taskRecommended">Fecha recomendada</label>
            <input id="taskRecommended" type="date" value="${task?.recommendedDate || ""}" />
          </div>
          <div class="field">
            <label for="taskStatus">Estado</label>
            <select id="taskStatus">
              <option value="pending" ${task?.status === "pending" ? "selected" : ""}>Pendiente</option>
              <option value="doing" ${task?.status === "doing" ? "selected" : ""}>En proceso</option>
              <option value="complete" ${task?.status === "complete" ? "selected" : ""}>Completa</option>
            </select>
          </div>
          <div class="field">
            <label for="taskPriority">Prioridad</label>
            <select id="taskPriority">
              <option value="media" ${!task?.priority || task?.priority === "media" ? "selected" : ""}>Media</option>
              <option value="alta" ${task?.priority === "alta" ? "selected" : ""}>Alta</option>
              <option value="baja" ${task?.priority === "baja" ? "selected" : ""}>Baja</option>
            </select>
          </div>
          <div class="field full">
            <div class="empty-state" id="recommendationHint">La fecha recomendada se calcula al elegir materia.</div>
          </div>
        </div>
        <div class="form-actions">
          <button class="ghost-button" type="button" data-close>Cerrar</button>
          <button class="primary-button" type="submit">${task ? "Guardar" : "Crear tarea"}</button>
        </div>
      </form>
    `
  );
  const form = document.querySelector("#taskForm");
  const subjectInput = form.querySelector("#taskSubject");
  const recommendedInput = form.querySelector("#taskRecommended");
  const hint = form.querySelector("#recommendationHint");

  const applyRecommendation = () => {
    const result = getNextAdvisoryDate(subjectInput.value);
    if (!result) {
      manualRecommendedRequired = true;
      hint.innerHTML = "No hay asesoria para esta materia. Elige manualmente la fecha recomendada.";
      recommendedInput.required = true;
      if (!task) recommendedInput.value = "";
      return;
    }
    manualRecommendedRequired = false;
    recommendedInput.required = false;
    if (!task || !recommendedInput.value || task.subjectId !== subjectInput.value) recommendedInput.value = result.date;
    const subject = subjectById(subjectInput.value);
    hint.innerHTML = `Recomendacion automatica: ${subject.name}, ${formatDate(result.date)} a las ${result.advisory.startTime}.`;
  };

  subjectInput.addEventListener("change", applyRecommendation);
  applyRecommendation();
  form.querySelector("[data-close]").addEventListener("click", closeModal);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (manualRecommendedRequired && !recommendedInput.value) {
      hint.innerHTML = "Necesitas elegir una fecha recomendada manual.";
      return;
    }
    const payload = {
      id: task?.id || cryptoId(),
      title: form.querySelector("#taskTitle").value.trim(),
      subjectId: subjectInput.value,
      dueDate: form.querySelector("#taskDue").value,
      recommendedDate: recommendedInput.value,
      recommendationMode: manualRecommendedRequired ? "manual" : "auto",
      status: form.querySelector("#taskStatus").value,
      priority: form.querySelector("#taskPriority").value,
      createdAt: task?.createdAt || new Date().toISOString(),
    };
    if (task) {
      state.tasks = state.tasks.map((item) => (item.id === task.id ? payload : item));
    } else {
      state.tasks.push(payload);
    }
    saveState();
    closeModal();
    currentView = "tasks";
    render();
  });
}

function openAdvisoryModal(advisoryId) {
  const advisory = state.advisories.find((item) => item.id === advisoryId);
  openModal(
    advisory ? "Editar asesoria" : "Nueva asesoria",
    "Horario semanal",
    `
      <form id="advisoryForm">
        <div class="form-grid">
          <div class="field">
            <label for="advisoryDay">Dia</label>
            <select id="advisoryDay" required>
              ${weekdays.map((day) => `<option value="${day.id}" ${advisory?.weekday === day.id ? "selected" : ""}>${day.label}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="advisorySubject">Materia</label>
            <select id="advisorySubject" required>
              ${activeSubjects().map((subject) => `<option value="${subject.id}" ${advisory?.subjectId === subject.id ? "selected" : ""}>${subject.name}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="advisoryStart">Inicio</label>
            <input id="advisoryStart" type="time" required value="${advisory?.startTime || "15:10"}" />
          </div>
          <div class="field">
            <label for="advisoryEnd">Fin</label>
            <input id="advisoryEnd" type="time" required value="${advisory?.endTime || "16:10"}" />
          </div>
          <div class="field full">
            <div class="empty-state" id="advisoryHint">Maximo 7 asesorias por dia para mantener el horario legible.</div>
          </div>
        </div>
        <div class="form-actions">
          <button class="ghost-button" type="button" data-close>Cerrar</button>
          <button class="primary-button" type="submit">${advisory ? "Guardar" : "Crear asesoria"}</button>
        </div>
      </form>
    `
  );
  const form = document.querySelector("#advisoryForm");
  form.querySelector("[data-close]").addEventListener("click", closeModal);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const weekday = Number(form.querySelector("#advisoryDay").value);
    const countForDay = state.advisories.filter((item) => item.weekday === weekday && item.id !== advisory?.id).length;
    const hint = form.querySelector("#advisoryHint");
    if (countForDay >= 7) {
      hint.innerHTML = "Ese dia ya tiene 7 asesorias. Edita una existente o elige otro dia.";
      return;
    }
    const startTime = form.querySelector("#advisoryStart").value;
    const endTime = form.querySelector("#advisoryEnd").value;
    if (endTime <= startTime) {
      hint.innerHTML = "La hora final debe ser despues de la hora inicial.";
      return;
    }
    const payload = {
      id: advisory?.id || cryptoId(),
      subjectId: form.querySelector("#advisorySubject").value,
      weekday,
      startTime,
      endTime,
    };
    if (advisory) {
      state.advisories = state.advisories.map((item) => (item.id === advisory.id ? payload : item));
    } else {
      state.advisories.push(payload);
    }
    refreshAutomaticTaskRecommendations();
    saveState();
    closeModal();
    currentView = "advisories";
    render();
  });
}

function openHabitModal() {
  openModal(
    "Nuevo habito",
    "Rutina",
    `
      <form id="habitForm">
        <div class="form-grid">
          <div class="field">
            <label for="habitName">Nombre</label>
            <input id="habitName" required placeholder="Ej. 30 min de lectura" />
          </div>
          <div class="field">
            <label for="habitFrequency">Frecuencia</label>
            <select id="habitFrequency">
              <option>Diario</option>
              <option>Lunes a viernes</option>
              <option>Semanal</option>
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button class="ghost-button" type="button" data-close>Cerrar</button>
          <button class="primary-button" type="submit">Crear habito</button>
        </div>
      </form>
    `
  );
  const form = document.querySelector("#habitForm");
  form.querySelector("[data-close]").addEventListener("click", closeModal);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.habits.push({ id: cryptoId(), name: form.querySelector("#habitName").value.trim(), frequency: form.querySelector("#habitFrequency").value, completions: [] });
    saveState();
    closeModal();
    render();
  });
}

function openResourceModal() {
  openModal(
    "Nuevo recurso",
    "Material",
    `
      <form id="resourceForm">
        <div class="form-grid">
          <div class="field">
            <label for="resourceTitle">Titulo</label>
            <input id="resourceTitle" required />
          </div>
          <div class="field">
            <label for="resourceSubject">Materia</label>
            <select id="resourceSubject" required>
              ${activeSubjects().map((subject) => `<option value="${subject.id}">${subject.name}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="resourceFolder">Carpeta</label>
            <select id="resourceFolder" required>
              ${state.resourceFolders.map((folder) => `<option value="${folder.id}" ${selectedResourceFolder === folder.id ? "selected" : ""}>${escapeHtml(folder.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field full">
            <label for="resourceUrl">URL</label>
            <input id="resourceUrl" type="url" required placeholder="https://" />
          </div>
          <div class="field full">
            <label for="resourceNotes">Notas</label>
            <textarea id="resourceNotes"></textarea>
          </div>
        </div>
        <div class="form-actions">
          <button class="ghost-button" type="button" data-close>Cerrar</button>
          <button class="primary-button" type="submit">Guardar recurso</button>
        </div>
      </form>
    `
  );
  const form = document.querySelector("#resourceForm");
  form.querySelector("[data-close]").addEventListener("click", closeModal);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.resources.push({
      id: cryptoId(),
      title: form.querySelector("#resourceTitle").value.trim(),
      subjectId: form.querySelector("#resourceSubject").value,
      folderId: form.querySelector("#resourceFolder").value,
      url: form.querySelector("#resourceUrl").value.trim(),
      notes: form.querySelector("#resourceNotes").value.trim(),
    });
    saveState();
    closeModal();
    render();
  });
}

function openResourceFolderModal() {
  openModal(
    "Nueva carpeta",
    "Recursos",
    `
      <form id="folderForm">
        <div class="form-grid">
          <div class="field full">
            <label for="folderName">Nombre</label>
            <input id="folderName" required placeholder="Ej. Literatura Paper 1" />
          </div>
        </div>
        <div class="form-actions">
          <button class="ghost-button" type="button" data-close>Cerrar</button>
          <button class="primary-button" type="submit">Crear carpeta</button>
        </div>
      </form>
    `
  );
  const form = document.querySelector("#folderForm");
  form.querySelector("[data-close]").addEventListener("click", closeModal);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = form.querySelector("#folderName").value.trim();
    const baseId = normalizeText(name) || cryptoId();
    let id = baseId;
    let suffix = 2;
    while (state.resourceFolders.some((folder) => folder.id === id)) id = `${baseId}-${suffix++}`;
    state.resourceFolders.push({ id, name });
    selectedResourceFolder = id;
    saveState();
    closeModal();
    render();
  });
}

function deleteSelectedResourceFolder() {
  const folder = state.resourceFolders.find((item) => item.id === selectedResourceFolder);
  if (!folder) return;
  const resourceCount = state.resources.filter((resource) => (resource.folderId || "general") === folder.id).length;
  const message = `Estas a punto de borrar la carpeta "${folder.name}". ${resourceCount} recurso(s) guardado(s) en esta carpeta se eliminaran permanentemente. Deseas continuar?`;
  if (!confirm(message)) return;
  state.resourceFolders = state.resourceFolders.filter((item) => item.id !== folder.id);
  state.resources = state.resources.filter((resource) => (resource.folderId || "general") !== folder.id);
  selectedResourceFolder = "all";
  saveState();
  render();
}

function openIBProjectModal(projectId) {
  const project = state.ibProjects.find((item) => item.id === projectId);
  if (!project) return;
  openModal(
    `Editar ${project.type}`,
    "IB",
    `
      <form id="ibProjectForm">
        <div class="form-grid">
          <div class="field">
            <label for="ibTitle">Nombre</label>
            <input id="ibTitle" required value="${escapeAttribute(project.title)}" />
          </div>
          <div class="field">
            <label for="ibStatus">Estado</label>
            <select id="ibStatus">
              <option ${project.status === "Planeacion" ? "selected" : ""}>Planeacion</option>
              <option ${project.status === "Investigacion" ? "selected" : ""}>Investigacion</option>
              <option ${project.status === "Borrador" ? "selected" : ""}>Borrador</option>
              <option ${project.status === "Terminado" ? "selected" : ""}>Terminado</option>
            </select>
          </div>
          <div class="field full">
            <label for="ibMilestones">Hitos</label>
            <textarea id="ibMilestones" placeholder="Un hito por linea">${escapeHtml(project.milestones.join("\n"))}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button class="ghost-button" type="button" data-close>Cerrar</button>
          <button class="primary-button" type="submit">Guardar</button>
        </div>
      </form>
    `
  );
  const form = document.querySelector("#ibProjectForm");
  form.querySelector("[data-close]").addEventListener("click", closeModal);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    project.title = form.querySelector("#ibTitle").value.trim();
    project.status = form.querySelector("#ibStatus").value;
    project.milestones = form
      .querySelector("#ibMilestones")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    saveState();
    closeModal();
    render();
  });
}

function openSubjectModal() {
  openModal(
    "Nueva materia",
    "Catalogo",
    `
      <form id="subjectForm">
        <div class="form-grid">
          <div class="field">
            <label for="subjectName">Nombre</label>
            <input id="subjectName" required />
          </div>
          <div class="field">
            <label for="subjectColor">Color</label>
            <input id="subjectColor" type="color" value="#79c7b3" />
          </div>
        </div>
        <div class="form-actions">
          <button class="ghost-button" type="button" data-close>Cerrar</button>
          <button class="primary-button" type="submit">Crear materia</button>
        </div>
      </form>
    `
  );
  const form = document.querySelector("#subjectForm");
  form.querySelector("[data-close]").addEventListener("click", closeModal);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = form.querySelector("#subjectName").value.trim();
    const baseId = normalizeText(name) || cryptoId();
    let id = baseId;
    let suffix = 2;
    while (state.subjects.some((subject) => subject.id === id)) id = `${baseId}-${suffix++}`;
    state.subjects.push({ id, name, color: form.querySelector("#subjectColor").value, active: true });
    saveState();
    closeModal();
    render();
  });
}

function refreshAutomaticTaskRecommendations() {
  state.tasks = state.tasks.map((task) => {
    if (task.recommendationMode === "manual") return task;
    const result = getNextAdvisoryDate(task.subjectId);
    if (!result) return { ...task, recommendationMode: "manual" };
    return { ...task, recommendedDate: result.date, recommendationMode: "auto" };
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lock-in-tracker-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state = {
        subjects: parsed.subjects || state.subjects,
        advisories: parsed.advisories || [],
        tasks: parsed.tasks || [],
        habits: parsed.habits || [],
        ibProjects: parsed.ibProjects || defaultIBProjects,
        resourceFolders: parsed.resourceFolders?.length ? parsed.resourceFolders : defaultResourceFolders,
        resources: parsed.resources || [],
      };
      saveState();
      render();
    } catch {
      alert("El archivo no parece ser un respaldo valido.");
    }
  };
  reader.readAsText(file);
}

function externalLinkCard(title, text, href) {
  return `
    <a class="card link-card" href="${href}" target="_blank" rel="noreferrer">
      <div>
        <p class="eyebrow">Link externo</p>
        <h3>${title}</h3>
      </div>
      <p class="muted">${text}</p>
    </a>
  `;
}

function internalCard(title, text, viewId) {
  return `
    <button class="card link-card" type="button" data-go-view="${viewId}">
      <div>
        <p class="eyebrow">Modulo</p>
        <h3>${title}</h3>
      </div>
      <p class="muted">${text}</p>
    </button>
  `;
}

function bindInternalCards(root) {
  root.querySelectorAll("[data-go-view]").forEach((button) => {
    button.addEventListener("click", () => {
      currentView = button.dataset.goView;
      render();
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

init();
