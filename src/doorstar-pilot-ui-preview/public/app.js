const previewData = Object.freeze({
  metrics: [
    { label: "Aktív projektek", value: "18", detail: "3 új a héten", tone: "indigo", icon: "▦" },
    { label: "Műszaki jóváhagyásra vár", value: "4", detail: "2 prioritásos", tone: "amber", icon: "✓" },
    { label: "Mai egyeztetések", value: "6", detail: "következő: 09:30", tone: "mint", icon: "◷" },
    { label: "Dokumentumcsomagok", value: "12", detail: "naprakész", tone: "rose", icon: "▤" }
  ],
  projects: [
    {
      reference: "DS-2608-041",
      name: "Hajdú Residence",
      area: "Budaörs · 14 beltéri ajtó",
      status: "Műszaki előkészítés",
      owner: "NK",
      attention: "2 nyitott kérdés",
      progress: 72,
      tone: "indigo"
    },
    {
      reference: "DS-2608-038",
      name: "Kossuth téri iroda",
      area: "Budapest V. · 26 tűzgátló ajtó",
      status: "Felmérés egyeztetés alatt",
      owner: "SZ",
      attention: "Válaszra vár",
      progress: 41,
      tone: "amber"
    },
    {
      reference: "DS-2607-119",
      name: "Cseresznyés villa",
      area: "Solymár · 9 egyedi ajtó",
      status: "Dokumentum jóváhagyva",
      owner: "BT",
      attention: "Átadási csomag kész",
      progress: 100,
      tone: "mint"
    }
  ],
  agenda: [
    { time: "09:30", title: "Hajdú Residence műszaki egyeztetés", attendee: "Nagy Katalin · ügyfél" },
    { time: "11:00", title: "Tűzgátló ajtók specifikációs review", attendee: "Belső Office csapat" },
    { time: "14:30", title: "Cseresznyés villa dokumentumátadás", attendee: "Bíró Tamás · tervező" }
  ]
});

const projectPreviewPath = "/office/projects/DS-26133";
const roleLabels = Object.freeze({
  READER: "Olvasó",
  SALES: "Értékesítés",
  TECHNICAL_PREPARATION: "Műszaki előkészítés",
  ADMINISTRATOR: "Office adminisztrátor"
});
let previewUsers = [
  {
    id: "sample-user-001",
    displayName: "Gábor Minta",
    email: "gabor.minta@example.invalid",
    role: "ADMINISTRATOR",
    active: true,
    canManage: true
  },
  {
    id: "sample-user-002",
    displayName: "Katalin Minta",
    email: "katalin.minta@example.invalid",
    role: "TECHNICAL_PREPARATION",
    active: true,
    canManage: false
  },
  {
    id: "sample-user-003",
    displayName: "Tamás Minta",
    email: "tamas.minta@example.invalid",
    role: "SALES",
    active: false,
    canManage: false
  }
];
let editingUserId = null;
let pendingDisableUserId = null;
let dialogReturnFocus = null;

const usersRoot = document.querySelector("#preview-user-list");
const userFeedback = document.querySelector("#preview-user-feedback");
const userDialog = document.querySelector("#preview-user-dialog");
const userForm = document.querySelector("#preview-user-form");
const userDialogTitle = document.querySelector("#preview-user-dialog-title");
const userFormError = document.querySelector("#preview-user-form-error");
const disableDialog = document.querySelector("#preview-user-disable-dialog");
const disableDialogCopy = document.querySelector("#preview-user-disable-copy");

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createButton(className, text, label) {
  const button = createElement("button", className, text);
  button.type = "button";
  if (label) button.setAttribute("aria-label", label);
  return button;
}

function renderMetrics() {
  const metricsRoot = document.querySelector("#metric-grid");
  const fragment = document.createDocumentFragment();
  previewData.metrics.forEach((metric) => {
    const card = createElement("article", "metric-card");
    const icon = createElement("span", "metric-card__icon metric-card__icon--" + metric.tone, metric.icon);
    const content = createElement("div", "metric-card__content");
    content.append(
      createElement("p", "metric-card__label", metric.label),
      createElement("strong", "metric-card__value", metric.value),
      createElement("span", "metric-card__detail", metric.detail)
    );
    card.append(icon, content);
    fragment.append(card);
  });
  metricsRoot.replaceChildren(fragment);
}

function renderProjects() {
  const projectsRoot = document.querySelector("#project-list");
  const fragment = document.createDocumentFragment();
  previewData.projects.forEach((project) => {
    const row = createElement("article", "project-row");
    const projectMain = createElement("div", "project-row__main");
    const meta = createElement("div", "project-row__meta");
    meta.append(
      createElement("span", "status-pill status-pill--" + project.tone, project.status),
      createElement("span", "attention-text", project.attention)
    );
    projectMain.append(
      createElement("p", "project-row__reference", project.reference),
      createElement("h3", "project-row__name", project.name),
      createElement("p", "project-row__area", project.area),
      meta
    );
    const projectSide = createElement("div", "project-row__side");
    const owner = createElement("span", "owner-avatar", project.owner);
    owner.setAttribute("aria-label", "Projektfelelős: " + project.owner);
    const progress = createElement("div", "progress-wrap");
    const progressTrack = createElement("div", "progress-track");
    const progressFill = createElement("span", "progress-fill progress-fill--" + project.tone);
    progressFill.style.width = project.progress + "%";
    progressTrack.append(progressFill);
    progress.append(createElement("span", "progress-text", project.progress + "% előkészítve"), progressTrack);
    projectSide.append(owner, progress);
    row.append(projectMain, projectSide);
    fragment.append(row);
  });
  projectsRoot.replaceChildren(fragment);
}

function renderAgenda() {
  const agendaRoot = document.querySelector("#agenda-list");
  const fragment = document.createDocumentFragment();
  previewData.agenda.forEach((item) => {
    const row = createElement("li", "agenda-item");
    const content = createElement("div");
    content.append(
      createElement("h3", "agenda-item__title", item.title),
      createElement("p", "agenda-item__attendee", item.attendee)
    );
    row.append(createElement("time", "agenda-item__time", item.time), content);
    fragment.append(row);
  });
  agendaRoot.replaceChildren(fragment);
}

function roleLabel(role) {
  return roleLabels[role] ?? "Ismeretlen szerepkör";
}

function showUserFeedback(message) {
  userFeedback.textContent = message;
  userFeedback.hidden = false;
}

function createUserFact(label, value) {
  const fact = createElement("div", "user-card__fact");
  fact.append(createElement("dt", "", label), createElement("dd", "", value));
  return fact;
}

function findPreviewUser(userId) {
  return previewUsers.find((user) => user.id === userId) ?? null;
}

function isOnlyEffectiveRosterManager(user) {
  return user.active
    && user.canManage
    && previewUsers.filter((candidate) => candidate.active && candidate.canManage).length === 1;
}

function findUserAction(userId, action) {
  return document.querySelector(
    `[data-preview-user-id="${userId}"][data-preview-user-action="${action}"]`,
  );
}

function setDialogReturnFocusToUserAction(userId, action) {
  dialogReturnFocus = findUserAction(userId, action);
}

function updatePreviewUser(userId, changes) {
  previewUsers = previewUsers.map((user) => user.id === userId ? { ...user, ...changes } : user);
  renderUsers();
}

function renderUsers() {
  const fragment = document.createDocumentFragment();
  previewUsers.forEach((user) => {
    const card = createElement("article", "user-card" + (user.active ? "" : " is-inactive"));
    const identity = createElement("div", "user-card__identity");
    const initials = user.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
    const copy = createElement("div", "user-card__copy");
    copy.append(
      createElement("h3", "", user.displayName),
      createElement("p", "", user.email)
    );
    identity.append(createElement("span", "user-avatar", initials || "U"), copy);

    const facts = createElement("dl", "user-card__facts");
    facts.append(
      createUserFact("Office-szerep", roleLabel(user.role)),
      createUserFact("Állapot", user.active ? "Aktív hozzáférés" : "Letiltva"),
      createUserFact("Felhasználókezelés", user.canManage ? "Kijelölt kezelő" : "Nincs")
    );

    const actions = createElement("div", "user-card__actions");
    const edit = createButton("secondary-action-button", "Szerkesztés", user.displayName + " szerkesztése");
    edit.dataset.previewUserId = user.id;
    edit.dataset.previewUserAction = "edit";
    edit.addEventListener("click", () => openUserDialog(user.id, edit));
    const state = createButton(
      user.active ? "danger-text-button" : "secondary-action-button",
      user.active ? "Letiltás" : "Visszakapcsolás",
      user.active ? user.displayName + " hozzáférésének letiltása" : user.displayName + " hozzáférésének visszakapcsolása"
    );
    state.dataset.previewUserId = user.id;
    state.dataset.previewUserAction = "state";
    state.addEventListener("click", () => {
      if (user.active) {
        if (isOnlyEffectiveRosterManager(user)) {
          showUserFeedback("A minta védi az utolsó kijelölt kezelőt — előbb jelölj ki másik felhasználókezelőt.");
          return;
        }
        openDisableDialog(user.id, state);
        return;
      }
      updatePreviewUser(user.id, { active: true });
      const refreshedStateAction = findUserAction(user.id, "state");
      if (refreshedStateAction instanceof HTMLElement) refreshedStateAction.focus();
      showUserFeedback("Mintaállapot frissült — a hozzáférés visszakapcsolva, meghívó nem ment ki.");
    });
    actions.append(edit, state);
    card.append(identity, facts, actions);
    fragment.append(card);
  });
  usersRoot.replaceChildren(fragment);
}

function openUserDialog(userId, trigger) {
  const user = userId ? findPreviewUser(userId) : null;
  editingUserId = user?.id ?? null;
  dialogReturnFocus = trigger;
  userForm.reset();
  userFormError.hidden = true;
  userFormError.textContent = "";
  userDialogTitle.textContent = user ? "Felhasználó szerkesztése" : "Új felhasználó";
  userForm.elements.userId.value = user?.id ?? "";
  userForm.elements.displayName.value = user?.displayName ?? "";
  userForm.elements.email.value = user?.email ?? "";
  userForm.elements.email.readOnly = Boolean(user);
  userForm.elements.role.value = user?.role ?? "READER";
  userForm.elements.canManage.checked = user?.canManage ?? false;
  userDialog.showModal();
  userForm.elements.displayName.focus();
}

function openDisableDialog(userId, trigger) {
  const user = findPreviewUser(userId);
  if (!user) return;
  pendingDisableUserId = user.id;
  dialogReturnFocus = trigger;
  disableDialogCopy.textContent = user.displayName + " helyi minta-hozzáférése letiltott állapotba kerül. Élesben a szerver a munkameneteit is visszavonná.";
  disableDialog.showModal();
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function restoreDialogFocus() {
  const target = dialogReturnFocus;
  dialogReturnFocus = null;
  const fallback = document.querySelector("#preview-add-user");
  if (target instanceof HTMLElement && target.isConnected) {
    target.focus();
    return;
  }
  if (fallback instanceof HTMLElement) fallback.focus();
}

userForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!userForm.checkValidity()) {
    userForm.reportValidity();
    return;
  }
  const values = new FormData(userForm);
  const displayName = String(values.get("displayName") ?? "").trim();
  const email = String(values.get("email") ?? "").trim().toLowerCase();
  const role = String(values.get("role") ?? "");
  const canManage = values.get("canManage") === "on";
  if (!displayName || !email || !roleLabels[role]) {
    userFormError.textContent = "A minta mentéséhez töltsd ki a kötelező mezőket.";
    userFormError.hidden = false;
    return;
  }
  const editingUser = editingUserId ? findPreviewUser(editingUserId) : null;
  if (editingUser && isOnlyEffectiveRosterManager(editingUser) && !canManage) {
    userFormError.textContent = "A minta nem veheti el az utolsó kijelölt kezelő jogát. Előbb jelölj ki másik kezelőt.";
    userFormError.hidden = false;
    return;
  }
  if (editingUser) {
    updatePreviewUser(editingUser.id, { displayName, role, canManage });
    setDialogReturnFocusToUserAction(editingUser.id, "edit");
    showUserFeedback("Mintaállapot frissült — szerepkör és kezelői jog módosítva, nincs szerveroldali mentés.");
  } else {
    const newUserId = "sample-user-" + String(previewUsers.length + 1).padStart(3, "0");
    previewUsers = [
      ...previewUsers,
      {
        id: newUserId,
        displayName,
        email,
        role,
        active: true,
        canManage
      }
    ];
    renderUsers();
    setDialogReturnFocusToUserAction(newUserId, "edit");
    showUserFeedback("Mintaállapot frissült — a felhasználó csak helyben jelent meg, meghívó nem ment ki.");
  }
  closeDialog(userDialog);
});

document.querySelector("#preview-add-user").addEventListener("click", (event) => {
  openUserDialog(null, event.currentTarget);
});

document.querySelector("#preview-confirm-disable").addEventListener("click", () => {
  if (!pendingDisableUserId) return;
  const userId = pendingDisableUserId;
  updatePreviewUser(userId, { active: false, canManage: false });
  setDialogReturnFocusToUserAction(userId, "state");
  pendingDisableUserId = null;
  showUserFeedback("Mintaállapot frissült — a hozzáférés letiltva, nincs szerveroldali munkamenet vagy meghívó.");
  closeDialog(disableDialog);
});

document.querySelectorAll("[data-dialog-close]").forEach((control) => {
  control.addEventListener("click", () => {
    closeDialog(document.querySelector("#" + control.dataset.dialogClose));
  });
});

userDialog.addEventListener("close", () => {
  editingUserId = null;
  restoreDialogFocus();
});
disableDialog.addEventListener("close", () => {
  pendingDisableUserId = null;
  restoreDialogFocus();
});

function setActiveView(view) {
  const viewName = ["dashboard", "project", "users"].includes(view) ? view : "login";
  document.documentElement.dataset.view = viewName;
  document.title = viewName === "dashboard"
    ? "Doorstar Office · iroda áttekintés"
    : viewName === "project"
      ? "Doorstar Office · DS-26133 projekt-előnézet"
      : viewName === "users"
        ? "Doorstar Office · felhasználókezelés minta"
        : "Doorstar Office · helyi előnézet";
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== viewName;
  });
  document.querySelectorAll("[data-view-target]").forEach((control) => {
    const selected = control.dataset.viewTarget === viewName;
    control.classList.toggle("is-active", selected);
    control.setAttribute("aria-current", selected ? "page" : "false");
  });
}

function preferredViewFromHash() {
  if (window.location.pathname === projectPreviewPath) return "project";
  const requested = window.location.hash.replace("#", "");
  return ["dashboard", "users"].includes(requested) ? requested : "login";
}

document.querySelectorAll("[data-view-target]").forEach((control) => {
  control.addEventListener("click", () => {
    const target = control.dataset.viewTarget;
    if (window.location.pathname === projectPreviewPath) {
      window.location.assign("/#" + target);
      return;
    }
    window.location.hash = target;
    setActiveView(target);
  });
});

window.addEventListener("hashchange", () => {
  if (window.location.pathname !== projectPreviewPath) setActiveView(preferredViewFromHash());
});

renderMetrics();
renderProjects();
renderAgenda();
renderUsers();
setActiveView(preferredViewFromHash());
