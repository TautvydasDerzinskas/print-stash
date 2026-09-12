// Renders the floating Thingport icon + its import panel on a recognized MakerWorld/
// Thingiverse/Printables page. All actual network calls go through background.js's API_CALL
// message (see its own doc comment for why) -- this file only classifies the current URL,
// walks the user through whatever picking/decisions the import needs, and renders the result.
(() => {
  if (window.__thingportGrabInjected) return;
  window.__thingportGrabInjected = true;

  const ICON_URL = chrome.runtime.getURL("icons/thingport-icon-color.svg");

  function call(type, payload) {
    return chrome.runtime.sendMessage({ type, payload });
  }
  /** Unwraps background.js's `{ok, data}` / `{ok:false, error}` message-response shape into a
   *  plain resolve-with-data-or-throw call, so every call site below can just `await api(...)`
   *  and try/catch it like a normal fetch. */
  async function api(method, path, body) {
    const res = await call("API_CALL", { method, path, body });
    if (!res.ok) throw new Error(res.error);
    return res.data;
  }

  // -- Shell: shadow-rooted host, icon button, panel container ---------------------------------

  let shadowRoot = null;
  let panelEl = null;
  let panelOpen = false;
  /** Set once per page, from the classification + (for a single-model page) whatever
   *  /import/inspect returned -- everything the panel's render functions need to know which
   *  step to show and which endpoints to call. */
  let context = null;

  async function injectStyles(root) {
    const res = await fetch(chrome.runtime.getURL("content.css"));
    const style = document.createElement("style");
    style.textContent = await res.text();
    root.appendChild(style);
  }

  async function mount() {
    const host = document.createElement("div");
    host.id = "thingport-grab-host";
    document.documentElement.appendChild(host);
    shadowRoot = host.attachShadow({ mode: "open" });
    await injectStyles(shadowRoot);

    const button = document.createElement("button");
    button.className = "tg-fab";
    button.setAttribute("aria-label", "Import to Thingport");
    button.innerHTML = `<img src="${ICON_URL}" alt="" />`;
    button.addEventListener("click", togglePanel);
    shadowRoot.appendChild(button);

    panelEl = document.createElement("div");
    panelEl.className = "tg-panel";
    panelEl.hidden = true;
    shadowRoot.appendChild(panelEl);
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    panelEl.hidden = !panelOpen;
    if (panelOpen && !panelEl.dataset.loaded) {
      panelEl.dataset.loaded = "1";
      void loadPanel();
    }
  }

  function renderPanel(html) {
    panelEl.innerHTML = html;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // -- Collection picker (single-item imports only -- see the plan's scope note) ---------------

  async function collectionOptionsHtml() {
    try {
      const collections = await api("GET", "/collections");
      const opts = collections
        .filter((c) => !c.system_key)
        .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
        .join("");
      return `
        <label class="tg-label" for="tg-collection">Add to collection (optional)</label>
        <select id="tg-collection" class="tg-select"><option value="">No collection</option>${opts}</select>
      `;
    } catch {
      return ""; // Collections failed to load -- import still works without the picker.
    }
  }

  // -- Single-item flow (Thingiverse Thing / Printables Model skip straight to import; a plain
  //    MakerWorld model link -- and any other generic single link -- goes through /import/inspect
  //    first, mirroring the web app's own useUploadImport.tsx branching exactly) ----------------

  async function loadSingleItem() {
    renderPanel(`<div class="tg-status">Checking link…</div>`);
    const { provider, type } = context.classification;
    const skipInspect = (provider === "thingiverse" && type === "thing") || (provider === "printables" && type === "model");

    let zip = null;
    if (!skipInspect) {
      try {
        const inspect = await api("POST", "/import/inspect", { url: context.url });
        if (inspect.is_zip) zip = { filename: inspect.filename };
      } catch (err) {
        renderPanel(errorHtml(err));
        return;
      }
    }

    if (!zip) {
      renderPanel(await readyToImportHtml());
      bindImportButton(() => runDirectImport());
      return;
    }

    renderPanel(await zipChoiceHtml(zip.filename));
    panelEl.querySelector("[data-action=import-as-zip]").addEventListener("click", () => runDirectImport());
    panelEl.querySelector("[data-action=choose-files]").addEventListener("click", () => void loadZipEntries());
  }

  async function readyToImportHtml() {
    const collectionHtml = await collectionOptionsHtml();
    return `
      <div class="tg-title">Import this model</div>
      ${collectionHtml}
      <button class="tg-btn" data-action="import">Import</button>
    `;
  }

  async function zipChoiceHtml(filename) {
    const collectionHtml = await collectionOptionsHtml();
    return `
      <div class="tg-title">Import this model</div>
      <div class="tg-hint">${escapeHtml(filename)} contains multiple files.</div>
      ${collectionHtml}
      <button class="tg-btn" data-action="import-as-zip">Import as one model</button>
      <button class="tg-btn tg-btn-secondary" data-action="choose-files">Choose files…</button>
    `;
  }

  async function loadZipEntries() {
    renderPanel(`<div class="tg-status">Loading files…</div>`);
    let result;
    try {
      result = await api("POST", "/import/zip/entries", { url: context.url });
    } catch (err) {
      renderPanel(errorHtml(err));
      return;
    }
    const collectionHtml = await collectionOptionsHtml();
    const rows = result.entries
      .map(
        (entry, i) => `
          <label class="tg-entry">
            <input type="checkbox" class="tg-entry-checkbox" value="${escapeHtml(entry)}" checked />
            <span>${escapeHtml(entry)}</span>
          </label>
        `,
      )
      .join("");
    renderPanel(`
      <div class="tg-title">Choose files to import</div>
      <div class="tg-entries">${rows}</div>
      ${collectionHtml}
      <button class="tg-btn" data-action="import">Import selected</button>
    `);
    bindImportButton(() => {
      const entries = [...panelEl.querySelectorAll(".tg-entry-checkbox:checked")].map((el) => el.value);
      if (!entries.length) return;
      void runDirectImport({ entries });
    });
  }

  function bindImportButton(handler) {
    panelEl.querySelector("[data-action=import]").addEventListener("click", handler);
  }

  function selectedCollectionId() {
    const select = panelEl.querySelector("#tg-collection");
    return select && select.value ? select.value : null;
  }

  async function runDirectImport(opts) {
    const collectionId = selectedCollectionId();
    renderPanel(`<div class="tg-status">Importing…</div>`);
    try {
      const print = opts && opts.entries
        ? await api("POST", "/import/zip", { url: context.url, entries: opts.entries }).then((job) => waitForJobSingleResult(job.job_id))
        : await api("POST", "/import", { url: context.url });
      if (collectionId && print && print.id) {
        await api("POST", `/collection/${collectionId}/items/${print.id}`).catch(() => undefined);
      }
      renderPanel(successHtml(print ? `${context.instanceUrl}/models/${print.id}` : `${context.instanceUrl}/models`));
    } catch (err) {
      renderPanel(errorHtml(err));
    }
  }

  /** /import/zip is a background job even for a single "choose files" selection (it can still
   *  resolve to more than one print) -- polls to completion and returns the single Print DTO
   *  only when exactly one resulted (matching resultPrintId's own semantics), else null. Throws
   *  on an ERROR job so the caller's existing catch block renders the error state instead of
   *  mistaking a failed job for a (null-print) success. */
  async function waitForJobSingleResult(jobId) {
    const job = await pollJob(jobId);
    if (job.status === "ERROR") throw new Error(job.error_message || "Import failed");
    if (job.result_print_id) return { id: job.result_print_id };
    return null;
  }

  // -- Batch flow (a collection/Likes listing page) ---------------------------------------------

  const BATCH_ENTRIES_PATH = {
    "makerworld:collection": "/import/collection/entries",
    "thingiverse:likes": "/import/thingiverse-likes/entries",
    "thingiverse:collection": "/import/thingiverse-collection/entries",
    "printables:collection": "/import/printables-collection/entries",
  };
  const BATCH_START_PATH = {
    "makerworld:collection": "/import/collection",
    "thingiverse:likes": "/import/thingiverse-likes",
    "thingiverse:collection": "/import/thingiverse-collection",
    "printables:collection": "/import/printables-collection",
  };
  const BATCH_ID_FIELD = {
    "makerworld:collection": "design_ids",
    "thingiverse:likes": "thing_ids",
    "thingiverse:collection": "thing_ids",
    "printables:collection": "model_ids",
  };

  function batchKey() {
    return `${context.classification.provider}:${context.classification.type}`;
  }

  async function loadBatchEntries() {
    renderPanel(`<div class="tg-status">Loading models…</div>`);
    let result;
    try {
      result = await api("POST", BATCH_ENTRIES_PATH[batchKey()], { url: context.url });
    } catch (err) {
      renderPanel(errorHtml(err));
      return;
    }
    const rows = result.entries
      .map(
        (entry) => `
          <label class="tg-entry ${entry.already_imported ? "tg-entry-imported" : ""}">
            <input type="checkbox" class="tg-entry-checkbox" value="${escapeHtml(entry.design_id)}" ${entry.already_imported ? "" : "checked"} />
            <span>${escapeHtml(entry.title || entry.design_id)}</span>
            ${entry.already_imported ? '<span class="tg-badge">already imported</span>' : ""}
          </label>
        `,
      )
      .join("");
    renderPanel(`
      <div class="tg-title">${escapeHtml(result.title || "Import models")}</div>
      <div class="tg-hint">${result.entries.length} models found${result.truncated ? " (more available on the site)" : ""}</div>
      <div class="tg-entries">${rows}</div>
      <button class="tg-btn" data-action="import">Import selected</button>
    `);
    panelEl.querySelector("[data-action=import]").addEventListener("click", () => void runBatchImport());
  }

  async function runBatchImport() {
    const ids = [...panelEl.querySelectorAll(".tg-entry-checkbox:checked")].map((el) => el.value);
    if (!ids.length) return;
    renderPanel(`<div class="tg-status">Starting import…</div>`);
    try {
      const body = { url: context.url, [BATCH_ID_FIELD[batchKey()]]: ids };
      const { job_id } = await api("POST", BATCH_START_PATH[batchKey()], body);
      await pollJobWithProgress(job_id);
    } catch (err) {
      renderPanel(errorHtml(err));
    }
  }

  async function pollJob(jobId) {
    // Matches ImportJobContext.tsx's own cadence -- see that file for why 1s.
    for (;;) {
      const job = await api("GET", `/import/jobs/${jobId}`);
      if (job.status !== "RUNNING") return job;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  async function pollJobWithProgress(jobId) {
    for (;;) {
      const job = await api("GET", `/import/jobs/${jobId}`);
      if (job.status === "RUNNING") {
        renderPanel(`<div class="tg-status">Importing ${job.processed} of ${job.total}…</div>`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      if (job.status === "ERROR") {
        renderPanel(errorHtml(new Error(job.error_message || "Import failed")));
        return;
      }
      const link = job.result_print_id ? `${context.instanceUrl}/models/${job.result_print_id}` : `${context.instanceUrl}/models`;
      renderPanel(successHtml(link, `Imported ${job.imported} of ${job.total}.`));
      return;
    }
  }

  // -- Shared result states -----------------------------------------------------------------

  function successHtml(link, note) {
    return `
      <div class="tg-title">Imported!</div>
      ${note ? `<div class="tg-hint">${escapeHtml(note)}</div>` : ""}
      <a class="tg-btn tg-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Open in Thingport</a>
    `;
  }

  function errorHtml(err) {
    const message = err instanceof Error ? err.message : String(err);
    return `<div class="tg-title tg-error">Something went wrong</div><div class="tg-hint">${escapeHtml(message)}</div>`;
  }

  async function loadPanel() {
    if (context.classification.kind === "single") await loadSingleItem();
    else await loadBatchEntries();
  }

  // -- Entry point: decide whether this page gets the icon at all -------------------------------

  async function init() {
    const stateRes = await call("GET_STATE");
    if (!stateRes.ok || !stateRes.data.configured || stateRes.data.disabled) return;

    const classification = thingportClassifyUrl(location.href);
    if (!classification) return;

    if (classification.kind === "single") {
      try {
        const status = await api("GET", `/import/status?url=${encodeURIComponent(location.href)}`);
        if (status.already_imported) return;
      } catch {
        // If the status check fails (instance unreachable, bad credentials, etc.) still show the
        // icon -- the panel's own error state will surface the real problem when they try it.
      }
    }

    context = { url: location.href, instanceUrl: stateRes.data.instanceUrl, classification };
    await mount();
  }

  void init();
})();
