const endpoints = Object.freeze({
  session: "/auth/session",
  logout: "/auth/logout",
  users: "/admin/users",
});

const roleLabels = Object.freeze({
  SALES: "Értékesítés",
  TECHNICAL_PREPARATION: "Műszaki előkészítés",
  ORDER_APPROVER: "Rendelés-jóváhagyó",
  PRODUCTION_PLANNER: "Termeléstervező",
  INSTALLER: "Szerelő",
  WAREHOUSE_DISPATCH: "Raktár és kiszállítás",
  ADMINISTRATOR: "Office adminisztrátor",
  READER: "Olvasó",
});

const roleNames = Object.freeze(Object.keys(roleLabels));
const elements = Object.freeze({
  initializing: requiredElement("initializing-view"),
  signedOut: requiredElement("signed-out-view"),
  signedIn: requiredElement("signed-in-view"),
  principalName: requiredElement("principal-name"),
  principalRole: requiredElement("principal-role"),
  logout: requiredElement("logout-button"),
  rosterLoading: requiredElement("roster-loading"),
  rosterDenied: requiredElement("roster-denied"),
  rosterUnavailable: requiredElement("roster-unavailable"),
  rosterView: requiredElement("roster-view"),
  rosterFeedback: requiredElement("roster-feedback"),
  rosterList: requiredElement("roster-list"),
  refreshRoster: requiredElement("refresh-roster-button"),
  createUserForm: requiredElement("create-user-form"),
  createUserSubmit: requiredElement("create-user-submit"),
  newRole: requiredElement("new-role"),
  updateDialog: requiredElement("update-user-dialog"),
  updateUserForm: requiredElement("update-user-form"),
  updateUserSubmit: requiredElement("update-user-submit"),
  updateBindingId: requiredElement("update-binding-id"),
  updateAuditVersion: requiredElement("update-audit-version"),
  updateUserName: requiredElement("update-user-name"),
  updateRole: requiredElement("update-role"),
  updateActive: requiredElement("update-active"),
  updateManager: requiredElement("update-manager"),
  closeUpdateDialog: requiredElement("close-update-dialog"),
  cancelUpdate: requiredElement("cancel-update-button"),
});

let authenticated = false;
let rosterBusy = false;

populateRoleOptions(elements.newRole);
populateRoleOptions(elements.updateRole);
elements.logout.addEventListener("click", () => void logout());
elements.refreshRoster.addEventListener("click", () => void loadRoster());
elements.createUserForm.addEventListener("submit", (event) => void createUser(event));
elements.updateUserForm.addEventListener("submit", (event) => void updateUser(event));
elements.closeUpdateDialog.addEventListener("click", closeUpdateDialog);
elements.cancelUpdate.addEventListener("click", closeUpdateDialog);
void initialiseOffice();

async function initialiseOffice() {
  showOnly(elements.initializing);
  try {
    const response = await fetch(endpoints.session, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (response.status === 401) {
      renderSignedOut();
      return;
    }
    if (!response.ok) {
      renderSessionUnavailable();
      return;
    }
    const session = await readJson(response);
    if (!isSession(session)) {
      renderSessionUnavailable();
      return;
    }
    authenticated = true;
    elements.principalName.textContent = session.principal.displayName;
    elements.principalRole.textContent = roleLabel(session.principal.role);
    showOnly(elements.signedIn);
    await loadRoster();
  } catch {
    renderSessionUnavailable();
  }
}

function renderSignedOut() {
  clearAuthenticatedOfficeState();
  showOnly(elements.signedOut);
}

function renderSessionUnavailable() {
  clearAuthenticatedOfficeState();
  showOnly(elements.signedOut);
  const help = document.querySelector(".field-help");
  if (help) {
    help.textContent = "A munkamenet jelenleg nem ellenőrizhető. Kérjük, próbálja később újra.";
  }
}

function clearAuthenticatedOfficeState() {
  authenticated = false;
  rosterBusy = false;
  elements.principalName.textContent = "";
  elements.principalRole.textContent = "";
  elements.rosterList.replaceChildren();
  elements.rosterFeedback.hidden = true;
  elements.rosterFeedback.textContent = "";
  elements.rosterFeedback.classList.remove("is-error");
  elements.createUserForm.reset();
  elements.updateBindingId.value = "";
  elements.updateAuditVersion.value = "";
  elements.updateUserName.textContent = "";
  elements.updateRole.value = "READER";
  elements.updateActive.checked = false;
  elements.updateManager.checked = false;
  if (elements.updateDialog.open) {
    elements.updateDialog.close();
  }
  setRosterState("idle");
}

async function logout() {
  setButtonBusy(elements.logout, true, "Kijelentkezés…");
  try {
    const response = await fetch(endpoints.logout, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (response.status === 204 || response.status === 401) {
      renderSignedOut();
      return;
    }
    showRosterFeedback("A kijelentkezés most nem sikerült. Kérjük, próbálja újra.", true);
  } catch {
    showRosterFeedback("A kijelentkezés most nem sikerült. Kérjük, próbálja újra.", true);
  } finally {
    setButtonBusy(elements.logout, false, "Kijelentkezés");
  }
}

async function loadRoster() {
  if (!authenticated || rosterBusy) {
    return;
  }
  rosterBusy = true;
  setRosterState("loading");
  setButtonBusy(elements.refreshRoster, true, "Frissítés…");
  try {
    const response = await fetch(endpoints.users, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (response.status === 401) {
      renderSignedOut();
      return;
    }
    if (response.status === 403) {
      setRosterState("denied");
      return;
    }
    if (!response.ok) {
      setRosterState("unavailable");
      return;
    }
    const body = await readJson(response);
    if (!isRoster(body)) {
      setRosterState("unavailable");
      return;
    }
    renderRoster(body.users);
    setRosterState("ready");
  } catch {
    setRosterState("unavailable");
  } finally {
    rosterBusy = false;
    setButtonBusy(elements.refreshRoster, false, "Lista frissítése");
  }
}

function setRosterState(state) {
  elements.rosterLoading.hidden = state !== "loading";
  elements.rosterDenied.hidden = state !== "denied";
  elements.rosterUnavailable.hidden = state !== "unavailable";
  elements.rosterView.hidden = state !== "ready";
}

function renderRoster(users) {
  elements.rosterList.replaceChildren();
  if (users.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-roster";
    empty.textContent = "Még nincs felvett felhasználó a névsorban.";
    elements.rosterList.append(empty);
    return;
  }
  for (const user of users) {
    elements.rosterList.append(createRosterEntry(user));
  }
}

function createRosterEntry(user) {
  const entry = document.createElement("article");
  entry.className = `roster-entry${user.active ? "" : " is-inactive"}`;
  const copy = document.createElement("div");
  const name = document.createElement("p");
  name.className = "roster-name";
  name.textContent = user.displayName;
  const meta = document.createElement("div");
  meta.className = "roster-meta";
  meta.append(
    pill(roleLabel(user.role)),
    pill(user.active ? "Aktív" : "Letiltva", user.active ? "" : "is-inactive"),
  );
  if (user.canManagePilotRoster) {
    meta.append(pill("Névsorkezelő", "is-manager"));
  }
  copy.append(name, meta);
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "secondary-action";
  edit.textContent = "Jogosultság módosítása";
  edit.addEventListener("click", () => openUpdateDialog(user));
  entry.append(copy, edit);
  return entry;
}

async function createUser(event) {
  event.preventDefault();
  if (!authenticated || rosterBusy) {
    return;
  }
  const formData = new FormData(elements.createUserForm);
  const payload = {
    displayName: String(formData.get("displayName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    role: String(formData.get("role") ?? ""),
    canManagePilotRoster: formData.get("canManagePilotRoster") === "on",
  };
  if (!payload.displayName || !payload.email || !isKnownRole(payload.role)) {
    showRosterFeedback("Adjon meg nevet, céges e-mail címet és Office-szerepkört.", true);
    return;
  }
  rosterBusy = true;
  setButtonBusy(elements.createUserSubmit, true, "Meghívó küldése…");
  try {
    const response = await fetch(endpoints.users, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 401) {
      renderSignedOut();
      return;
    }
    if (response.status === 403) {
      setRosterState("denied");
      return;
    }
    if (response.status !== 201) {
      showRosterFeedback("A meghívó nem küldhető el. Ellenőrizze az adatokat, majd próbálja újra.", true);
      return;
    }
    elements.createUserForm.reset();
    showRosterFeedback("A szervezeti meghívó elkészült; a felhasználó csak a szerveroldali kötés után válik aktívvá.");
    rosterBusy = false;
    await loadRoster();
  } catch {
    showRosterFeedback("A meghívó nem küldhető el. Kérjük, próbálja újra.", true);
  } finally {
    rosterBusy = false;
    setButtonBusy(elements.createUserSubmit, false, "Meghívó küldése");
  }
}

function openUpdateDialog(user) {
  elements.updateBindingId.value = user.bindingId;
  elements.updateAuditVersion.value = String(user.auditVersion);
  elements.updateUserName.textContent = `${user.displayName} jelenlegi hozzáférése.`;
  elements.updateRole.value = user.role;
  elements.updateActive.checked = user.active;
  elements.updateManager.checked = user.canManagePilotRoster;
  elements.updateDialog.showModal();
}

function closeUpdateDialog() {
  elements.updateDialog.close();
}

async function updateUser(event) {
  event.preventDefault();
  if (!authenticated || rosterBusy) {
    return;
  }
  const bindingId = elements.updateBindingId.value;
  const expectedAuditVersion = Number(elements.updateAuditVersion.value);
  const role = elements.updateRole.value;
  if (!isBindingId(bindingId) || !Number.isSafeInteger(expectedAuditVersion) || expectedAuditVersion < 1 || !isKnownRole(role)) {
    showRosterFeedback("A felhasználó módosítása nem készíthető elő. Frissítse a névsort.", true);
    closeUpdateDialog();
    return;
  }
  const payload = {
    expectedAuditVersion,
    role,
    active: elements.updateActive.checked,
    canManagePilotRoster: elements.updateManager.checked,
  };
  rosterBusy = true;
  setButtonBusy(elements.updateUserSubmit, true, "Mentés…");
  try {
    const response = await fetch(`${endpoints.users}/${bindingId}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 401) {
      closeUpdateDialog();
      renderSignedOut();
      return;
    }
    if (response.status === 403) {
      closeUpdateDialog();
      setRosterState("denied");
      return;
    }
    if (!response.ok) {
      showRosterFeedback("A változtatás nem menthető. Frissítse a névsort, majd próbálja újra.", true);
      return;
    }
    closeUpdateDialog();
    showRosterFeedback("A felhasználó Office-jogosultsága frissült.");
    rosterBusy = false;
    await loadRoster();
  } catch {
    showRosterFeedback("A változtatás nem menthető. Kérjük, próbálja újra.", true);
  } finally {
    rosterBusy = false;
    setButtonBusy(elements.updateUserSubmit, false, "Változtatások mentése");
  }
}

function showRosterFeedback(message, isError = false) {
  elements.rosterFeedback.hidden = false;
  elements.rosterFeedback.textContent = message;
  elements.rosterFeedback.classList.toggle("is-error", isError);
}

function setButtonBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

function showOnly(visible) {
  for (const element of [elements.initializing, elements.signedOut, elements.signedIn]) {
    element.hidden = element !== visible;
  }
}

function populateRoleOptions(select) {
  select.replaceChildren();
  for (const role of roleNames) {
    const option = document.createElement("option");
    option.value = role;
    option.textContent = roleLabels[role];
    select.append(option);
  }
  select.value = "READER";
}

function roleLabel(role) {
  return roleLabels[role] ?? "Ismeretlen Office-szerepkör";
}

function pill(text, modifier = "") {
  const element = document.createElement("span");
  element.className = `pill${modifier ? ` ${modifier}` : ""}`;
  element.textContent = text;
  return element;
}

async function readJson(response) {
  const value = await response.json();
  if (!isRecord(value)) {
    throw new Error("invalid_response");
  }
  return value;
}

function isSession(value) {
  return value.authenticated === true
    && isRecord(value.principal)
    && typeof value.principal.displayName === "string"
    && isKnownRole(value.principal.role);
}

function isRoster(value) {
  return Array.isArray(value.users) && value.users.every(isRosterUser);
}

function isRosterUser(value) {
  return isRecord(value)
    && isBindingId(value.bindingId)
    && typeof value.displayName === "string"
    && isKnownRole(value.role)
    && typeof value.active === "boolean"
    && typeof value.canManagePilotRoster === "boolean"
    && Number.isSafeInteger(value.auditVersion)
    && value.auditVersion > 0;
}

function isKnownRole(value) {
  return typeof value === "string" && Object.hasOwn(roleLabels, value);
}

function isBindingId(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error("office_shell_element_missing");
  }
  return element;
}
