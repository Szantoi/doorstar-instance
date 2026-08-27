const previewData = Object.freeze({
  metrics: [
    {
      label: "Aktív projektek",
      value: "18",
      detail: "3 új a héten",
      tone: "indigo",
      icon: "▦"
    },
    {
      label: "Műszaki jóváhagyásra vár",
      value: "4",
      detail: "2 prioritásos",
      tone: "amber",
      icon: "✓"
    },
    {
      label: "Mai egyeztetések",
      value: "6",
      detail: "következő: 09:30",
      tone: "mint",
      icon: "◷"
    },
    {
      label: "Dokumentumcsomagok",
      value: "12",
      detail: "naprakész",
      tone: "rose",
      icon: "▤"
    }
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
    {
      time: "09:30",
      title: "Hajdú Residence műszaki egyeztetés",
      attendee: "Nagy Katalin · ügyfél"
    },
    {
      time: "11:00",
      title: "Tűzgátló ajtók specifikációs review",
      attendee: "Belső Office csapat"
    },
    {
      time: "14:30",
      title: "Cseresznyés villa dokumentumátadás",
      attendee: "Bíró Tamás · tervező"
    }
  ]
});

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function renderMetrics() {
  const metricsRoot = document.querySelector("#metric-grid");
  const fragment = document.createDocumentFragment();

  previewData.metrics.forEach((metric) => {
    const card = createElement("article", "metric-card");
    const icon = createElement("span", "metric-card__icon metric-card__icon--" + metric.tone, metric.icon);
    const content = createElement("div", "metric-card__content");
    const label = createElement("p", "metric-card__label", metric.label);
    const value = createElement("strong", "metric-card__value", metric.value);
    const detail = createElement("span", "metric-card__detail", metric.detail);

    content.append(label, value, detail);
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
    const reference = createElement("p", "project-row__reference", project.reference);
    const name = createElement("h3", "project-row__name", project.name);
    const area = createElement("p", "project-row__area", project.area);
    const meta = createElement("div", "project-row__meta");
    const status = createElement("span", "status-pill status-pill--" + project.tone, project.status);
    const attention = createElement("span", "attention-text", project.attention);

    meta.append(status, attention);
    projectMain.append(reference, name, area, meta);

    const projectSide = createElement("div", "project-row__side");
    const owner = createElement("span", "owner-avatar", project.owner);
    owner.setAttribute("aria-label", "Projektfelelős: " + project.owner);
    const progress = createElement("div", "progress-wrap");
    const progressText = createElement("span", "progress-text", project.progress + "% előkészítve");
    const progressTrack = createElement("div", "progress-track");
    const progressFill = createElement("span", "progress-fill progress-fill--" + project.tone);
    progressFill.style.width = project.progress + "%";

    progressTrack.append(progressFill);
    progress.append(progressText, progressTrack);
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
    const time = createElement("time", "agenda-item__time", item.time);
    const content = createElement("div");
    const title = createElement("h3", "agenda-item__title", item.title);
    const attendee = createElement("p", "agenda-item__attendee", item.attendee);

    content.append(title, attendee);
    row.append(time, content);
    fragment.append(row);
  });

  agendaRoot.replaceChildren(fragment);
}

function setActiveView(view) {
  const viewName = view === "dashboard" ? "dashboard" : "login";
  document.documentElement.dataset.view = viewName;
  document.title =
    viewName === "dashboard"
      ? "Doorstar Office · iroda áttekintés"
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
  return window.location.hash.replace("#", "") === "dashboard" ? "dashboard" : "login";
}

document.querySelectorAll("[data-view-target]").forEach((control) => {
  control.addEventListener("click", () => {
    const target = control.dataset.viewTarget;
    window.location.hash = target;
    setActiveView(target);
  });
});

window.addEventListener("hashchange", () => setActiveView(preferredViewFromHash()));

renderMetrics();
renderProjects();
renderAgenda();
setActiveView(preferredViewFromHash());
