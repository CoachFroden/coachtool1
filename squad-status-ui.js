const modal = document.getElementById("squadModal");
const list = document.getElementById("squadList");

function ensureSquadStatusStyles() {
  if (document.getElementById("squad-status-ui-style")) return;

  const style = document.createElement("style");
  style.id = "squad-status-ui-style";
  style.textContent = `
    #squadModal .modal-content { max-width: 430px; }
    #squadModal #squadList {
      padding: 0;
      margin: 14px 0 0;
      list-style: none;
      display: block;
    }

    #squadModal .squad-group-heading {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 12px;
      margin: 18px 0 0;
      padding: 0 0 7px;
      border-bottom: 1px solid rgba(148,163,184,.14);
    }
    #squadModal .squad-group-heading:first-child { margin-top: 0; }
    #squadModal .squad-group-heading strong {
      font-size: 12px;
      letter-spacing: .08em;
      font-weight: 850;
    }
    #squadModal .squad-group-heading > span {
      min-width: 26px;
      height: 26px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: rgba(148,163,184,.10);
      font-size: 11px;
      font-weight: 850;
    }
    #squadModal .squad-group-heading.starter { color: #4ade80; }
    #squadModal .squad-group-heading.bench { color: #fbbf24; }
    #squadModal .squad-group-heading.absent { color: #94a3b8; }

    #squadModal .squad-row {
      position: relative;
      min-height: 48px;
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) 104px;
      align-items: center;
      gap: 12px;
      padding: 0 !important;
      margin: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      border-bottom: 1px solid rgba(148,163,184,.10) !important;
      background: transparent !important;
      color: #f8fafc;
      opacity: 1 !important;
    }
    #squadModal .squad-row .player-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 15px;
      font-weight: 650;
      text-align: left;
      color: #f8fafc !important;
      text-decoration: none !important;
    }
    #squadModal .squad-absent .player-name { color: #94a3b8 !important; }

    #squadModal .squad-original-control {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0,0,0,0) !important;
      white-space: nowrap !important;
      border: 0 !important;
    }

    #squadModal .squad-status-button {
      width: 104px;
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 0 9px;
      border-radius: 999px;
      border: 1px solid rgba(148,163,184,.20);
      background: rgba(15,23,42,.72);
      color: #e5edf7;
      font: inherit;
      font-size: 10px;
      font-weight: 800;
      white-space: nowrap;
      cursor: pointer;
      pointer-events: auto !important;
      position: relative;
      z-index: 31;
    }
    #squadModal .squad-status-button::after {
      content: "▾";
      font-size: 9px;
      opacity: .7;
    }
    #squadModal .squad-starter .squad-status-button {
      border-color: rgba(74,222,128,.28);
      color: #4ade80;
      background: rgba(22,163,74,.08);
    }
    #squadModal .squad-bench .squad-status-button {
      border-color: rgba(245,158,11,.28);
      color: #fbbf24;
      background: rgba(245,158,11,.07);
    }
    #squadModal .squad-absent .squad-status-button {
      color: #94a3b8;
      background: rgba(100,116,139,.06);
    }

    #squadModal .squad-status-menu {
      position: absolute;
      right: 0;
      top: 40px;
      z-index: 9999;
      pointer-events: auto !important;
      width: 154px;
      padding: 6px;
      border: 1px solid rgba(148,163,184,.20);
      border-radius: 12px;
      background: #0b1423;
      box-shadow: 0 14px 34px rgba(0,0,0,.38);
    }
    #squadModal .squad-status-menu[hidden] { display: none !important; }
    #squadModal .squad-status-menu button {
      width: 100%;
      min-height: 38px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 0 10px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #e5edf7;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      text-align: left;
    }
    #squadModal .squad-status-menu button:active { background: rgba(255,255,255,.06); }
    #squadModal .squad-status-menu .starter-choice { color: #4ade80; }
    #squadModal .squad-status-menu .bench-choice { color: #fbbf24; }
    #squadModal .squad-status-menu .absent-choice { color: #94a3b8; }

    #squadModal .starter-counter {
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      padding: 0 10px;
      border: 1px solid rgba(74,222,128,.20);
      border-radius: 999px;
      background: rgba(22,163,74,.06);
      color: #86efac;
      font-weight: 800;
      font-size: 11px;
    }

    @media (max-width: 390px) {
      #squadModal .squad-row { grid-template-columns: minmax(0, 1fr) 96px; }
      #squadModal .squad-status-button { width: 96px; font-size: 9.5px; }
      #squadModal .squad-row .player-name { font-size: 14px; }
    }
  `;
  document.head.appendChild(style);
}

if (modal && list) {
  ensureSquadStatusStyles();
  let rendering = false;

  const statusForRow = (row) => {
    const checks = row.querySelectorAll('input[type="checkbox"]');
    const present = checks[0];
    const starter = checks[1];
    if (!present || !starter) return null;
    if (!present.checked) return "absent";
    return starter.checked ? "starter" : "bench";
  };

  const statusLabel = (status) => {
    if (status === "starter") return "Starter";
    if (status === "bench") return "Innbytter";
    return "Ikke med";
  };

  const closeAllMenus = (exceptRow = null) => {
    list.querySelectorAll(":scope > .squad-row").forEach((row) => {
      if (row === exceptRow) return;
      row.querySelector(".squad-status-menu")?.setAttribute("hidden", "");
    });
  };

  const applyStatus = (row, value) => {
    const checks = row.querySelectorAll('input[type="checkbox"]');
    const present = checks[0];
    const starter = checks[1];
    if (!present || !starter) return;

    const change = (input, checked) => {
      if (input.checked === checked) return;
      input.checked = checked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    if (value === "starter") {
      change(present, true);
      change(starter, true);
    } else if (value === "bench") {
      change(present, true);
      change(starter, false);
    } else {
      change(starter, false);
      change(present, false);
    }

    row.querySelector(".squad-status-menu")?.setAttribute("hidden", "");
    requestAnimationFrame(renderSquadGroups);
  };

  const ensureStatusControl = (row) => {
    let button = row.querySelector(".squad-status-button");
    let menu = row.querySelector(".squad-status-menu");

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "squad-status-button";
      button.setAttribute("aria-label", "Endre spillerstatus");
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const wasHidden = menu.hasAttribute("hidden");
        closeAllMenus(row);
        if (wasHidden) menu.removeAttribute("hidden");
        else menu.setAttribute("hidden", "");
      });
      row.appendChild(button);
    }

    if (!menu) {
      menu = document.createElement("div");
      menu.className = "squad-status-menu";
      menu.setAttribute("hidden", "");
      menu.innerHTML = `
        <button type="button" class="starter-choice" data-status="starter">Starter</button>
        <button type="button" class="bench-choice" data-status="bench">Innbytter</button>
        <button type="button" class="absent-choice" data-status="absent">Ikke til stede</button>
      `;
      menu.querySelectorAll("button[data-status]").forEach((choice) => {
        choice.addEventListener("click", (event) => {
          event.stopPropagation();
          applyStatus(row, choice.dataset.status);
        });
      });
      row.appendChild(menu);
    }

    return { button, menu };
  };

  function makeHeading(kind, title, count) {
    const li = document.createElement("li");
    li.className = `squad-group-heading ${kind}`;
    li.innerHTML = `<div><strong>${title}</strong></div><span>${count}</span>`;
    return li;
  }

  function renderSquadGroups() {
    if (rendering) return;
    const rows = [...list.querySelectorAll(":scope > .squad-row")];
    if (!rows.length) return;
    rendering = true;

    try {
      list.querySelectorAll(":scope > .squad-group-heading").forEach((el) => el.remove());
      const groups = { starter: [], bench: [], absent: [] };

      rows.forEach((row) => {
        const status = statusForRow(row);
        if (!status) return;

        row.classList.remove("squad-starter", "squad-bench", "squad-absent");
        row.classList.add(`squad-${status}`);

        row.querySelectorAll("label.checkbox").forEach((label) => {
          label.classList.add("squad-original-control");
        });

        const { button } = ensureStatusControl(row);
        button.textContent = statusLabel(status);
        groups[status].push(row);
      });

      const fragment = document.createDocumentFragment();
      const sections = [
        ["starter", "STARTERE", groups.starter],
        ["bench", "INNBYTTERE", groups.bench],
        ["absent", "IKKE TIL STEDE", groups.absent]
      ];

      sections.forEach(([kind, title, rowsInGroup]) => {
        if (!rowsInGroup.length) return;
        fragment.appendChild(makeHeading(kind, title, rowsInGroup.length));
        rowsInGroup.forEach((row) => fragment.appendChild(row));
      });

      list.replaceChildren(fragment);
    } finally {
      rendering = false;
    }
  }

  const scheduleRender = () => {
    if (modal.classList.contains("hidden")) return;
    requestAnimationFrame(renderSquadGroups);
  };

  new MutationObserver(scheduleRender).observe(modal, {
    attributes: true,
    attributeFilter: ["class"]
  });

  new MutationObserver(scheduleRender).observe(list, { childList: true });

  document.addEventListener("click", (event) => {
    if (!modal.contains(event.target)) return;
    if (event.target.closest(".squad-status-button, .squad-status-menu")) return;
    closeAllMenus();
  });

  list.addEventListener("change", scheduleRender);
  scheduleRender();
}
