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
   *  plain resolve-with-data-or-throw call, so every call site below can just `await` it and
   *  try/catch it like a normal fetch. */
  function unwrap(res) {
    if (!res.ok) throw new Error(res.error);
    return res.data;
  }
  function api(method, path, body) {
    return call("API_CALL", { method, path, body }).then(unwrap);
  }

  // -- Shell: shadow-rooted host, icon button, panel container ---------------------------------

  let shadowRoot = null;
  let panelEl = null;
  let contentEl = null;
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

    // Lives outside contentEl (renderPanel's target) so it survives every re-render instead of
    // needing to be re-added to each step's template -- closing an accidental open shouldn't
    // depend on which step happened to be showing.
    const closeBtn = document.createElement("button");
    closeBtn.className = "tg-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closePanel);
    panelEl.appendChild(closeBtn);

    contentEl = document.createElement("div");
    contentEl.className = "tg-panel-content";
    panelEl.appendChild(contentEl);

    shadowRoot.appendChild(panelEl);
  }

  function closePanel() {
    panelOpen = false;
    panelEl.hidden = true;
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
    // A no-op, not a bug, once the panel's been torn down (unmount(), e.g. an SPA route change
    // mid-import) -- a still-in-flight step like the batch progress poll below has nothing left
    // to draw into, but the underlying request/job it's watching keeps running regardless (see
    // background.js's handleImportSingle and the README's own note on batch jobs).
    if (!contentEl) return;
    contentEl.innerHTML = html;
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

  /** Best-effort model name for the "Import ..." heading, read straight from the current page --
   *  used only for Thingiverse Thing/Printables Model pages, which skip /import/inspect (see
   *  skipInspect below) and so never get inspect's own resolved `title`. og:title is set
   *  accurately by both sites without the "... - Thingiverse" site-name suffix document.title
   *  tends to carry, so it's tried first. */
  function guessPageTitle() {
    const og = document.querySelector('meta[property="og:title"]');
    if (og && og.content && og.content.trim()) return og.content.trim();
    return document.title.trim() || null;
  }

  function importHeading() {
    return context.title ? `Import "${escapeHtml(context.title)}"` : "Import this model";
  }

  async function loadSingleItem() {
    renderPanel(`<div class="tg-status">Checking link…</div>`);
    const { provider, type } = context.classification;
    // Printables' generic page-fetch flow is Cloudflare-gated (inspectImportLink would just fail)
    // and a Thingiverse Thing always resolves through its own dedicated API path regardless -- see
    // useUploadImport.tsx's identical isThingiverseThingUrl/isPrintablesModelUrl special-case.
    // Neither needs (or can safely use) /import/inspect at all.
    const skipInspect = (provider === "thingiverse" && type === "thing") || (provider === "printables" && type === "model");

    let zip = null;
    if (skipInspect) {
      context.title = guessPageTitle();
    } else {
      try {
        const inspect = await api("POST", "/import/inspect", { url: context.url });
        context.title = inspect.title || null;
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
      <div class="tg-title">${importHeading()}</div>
      ${collectionHtml}
      <button class="tg-btn" data-action="import">Import</button>
    `;
  }

  async function zipChoiceHtml(filename) {
    const collectionHtml = await collectionOptionsHtml();
    return `
      <div class="tg-title">${importHeading()}</div>
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

  // Captured up front rather than read from `context` after the await below -- if the page
  // navigates (an SPA route change) while the import is still in flight, `context` gets nulled
  // out from under this still-running function (see unmount()); these locals keep working
  // regardless, though there's nothing left to render into a torn-down panel by then anyway (see
  // renderPanel's own guard for that).
  async function runDirectImport(opts) {
    const collectionId = selectedCollectionId();
    const { url, instanceUrl } = context;
    renderPanel(`<div class="tg-status">Importing…</div>`);
    try {
      // One message, not two -- import (and, per collectionId, filing the result into a
      // collection) both run to completion inside the background service worker regardless of
      // whether this tab/page is still around by the time it finishes (see background.js's
      // handleImportSingle for why that matters: a content script's own execution ends the
      // moment the page navigates or fully reloads, but the service worker doesn't).
      const print = await call("IMPORT_SINGLE", { url, entries: opts && opts.entries, collectionId }).then(unwrap);
      renderPanel(successHtml(print ? `${instanceUrl}/models/${print.id}` : `${instanceUrl}/models`));
    } catch (err) {
      renderPanel(errorHtml(err));
    }
  }

  // -- Batch flow (a collection/Likes listing page) ---------------------------------------------

  const BATCH_ENTRIES_PATH = {
    "makerworld:collection": "/import/collection/entries",
    "thingiverse:likes": "/import/thingiverse-likes/entries",
    "thingiverse:collection": "/import/thingiverse-collection/entries",
    "printables:collection": "/import/printables-collection/entries",
  };
  // MakerWorld collections don't use these two -- see loadMakerworldGuidedCollection/
  // startMakerworldGuidedImport above instead, which never calls the bulk job-start endpoint.
  const BATCH_START_PATH = {
    "thingiverse:likes": "/import/thingiverse-likes",
    "thingiverse:collection": "/import/thingiverse-collection",
    "printables:collection": "/import/printables-collection",
  };
  const BATCH_ID_FIELD = {
    "thingiverse:likes": "thing_ids",
    "thingiverse:collection": "thing_ids",
    "printables:collection": "model_ids",
  };

  function batchKey() {
    return `${context.classification.provider}:${context.classification.type}`;
  }

  // -- MakerWorld guided collection import -------------------------------------------------------
  //
  // MakerWorld specifically (not the other providers below) trips a multi-hour account-wide
  // CAPTCHA lockout from a burst of collection-import API calls, even with pacing -- see
  // background.js's startMakerworldCollectionJob for the full reasoning. Rather than the generic
  // "pick entries, start a background job" flow every other batch provider uses, this drives the
  // tab through each not-yet-imported model's own page one at a time. There's no entry-selection
  // step here (unlike loadBatchEntries below) -- every not-yet-imported model gets queued.

  async function loadMakerworldGuidedCollection() {
    renderPanel(`<div class="tg-status">Loading models…</div>`);
    let result;
    try {
      result = await api("POST", BATCH_ENTRIES_PATH["makerworld:collection"], { url: context.url });
    } catch (err) {
      renderPanel(errorHtml(err));
      return;
    }
    const toImport = result.entries.filter((e) => !e.already_imported);
    const alreadyImported = result.entries.filter((e) => e.already_imported);
    const collectionHtml = await collectionOptionsHtml();
    const parts = [];
    if (toImport.length) parts.push(`${toImport.length} new model${toImport.length === 1 ? "" : "s"} to import`);
    if (alreadyImported.length) parts.push(`${alreadyImported.length} already in your library`);
    renderPanel(`
      <div class="tg-title">${escapeHtml(result.title || "Import collection")}</div>
      <div class="tg-hint">
        ${parts.join(", ") || "No models found."}${result.truncated ? " (more available on the site)" : ""}
      </div>
      ${collectionHtml}
      <button class="tg-btn" data-action="start" ${toImport.length || alreadyImported.length ? "" : "disabled"}>Start import</button>
      <div class="tg-hint" style="margin-top:8px">
        New models are imported one page visit at a time, pacing itself to avoid MakerWorld's rate
        limiting -- this can take a while for a large collection.
      </div>
    `);
    const startBtn = panelEl.querySelector("[data-action=start]");
    if (startBtn) startBtn.addEventListener("click", () => void startMakerworldGuidedImport(toImport, alreadyImported));
  }

  async function startMakerworldGuidedImport(toImport, alreadyImported) {
    const collectionId = selectedCollectionId();
    const originalUrl = context.url;

    if (alreadyImported.length && collectionId) {
      renderPanel(
        `<div class="tg-status">Adding ${alreadyImported.length} existing model${alreadyImported.length === 1 ? "" : "s"} to your collection…</div>`,
      );
      for (const entry of alreadyImported) {
        try {
          const modelUrl = thingportMakerworldModelUrl(entry.design_id);
          const status = await api("GET", `/import/status?url=${encodeURIComponent(modelUrl)}`);
          if (status.print_id) {
            await api("POST", `/collection/${collectionId}/items/${status.print_id}`).catch(() => undefined);
          }
        } catch {
          // Best-effort -- one failed lookup shouldn't block filing the rest, or the new imports.
        }
      }
    }

    if (!toImport.length) {
      renderPanel(successHtml(`${context.instanceUrl}/models`, "Nothing new to import -- already-imported models were added to your collection."));
      return;
    }

    renderPanel(`<div class="tg-status">Starting guided import…</div>`);
    const urls = toImport.map((e) => thingportMakerworldModelUrl(e.design_id));
    await call("START_MAKERWORLD_COLLECTION_JOB", { urls, collectionId, originalUrl });
    // The tab is about to navigate to the first model's page (background just kicked that off) --
    // nothing more to render here; the full-page overlay (mountJobOverlay) takes over from there.
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
    const { url, instanceUrl } = context;
    renderPanel(`<div class="tg-status">Starting import…</div>`);
    try {
      const body = { url, [BATCH_ID_FIELD[batchKey()]]: ids };
      const { job_id } = await api("POST", BATCH_START_PATH[batchKey()], body);
      await pollJobWithProgress(job_id, instanceUrl);
    } catch (err) {
      renderPanel(errorHtml(err));
    }
  }

  async function pollJobWithProgress(jobId, instanceUrl) {
    for (;;) {
      // The panel was torn down (unmount(), e.g. an SPA route change) since the last tick --
      // stop polling. The job itself is unaffected: it keeps running server-side either way
      // (see the README's own note on this), this just stops burning a request every second on
      // a job nothing is watching any more.
      if (!contentEl) return;
      const job = await api("GET", `/import/jobs/${jobId}`);
      if (!contentEl) return;
      if (job.status === "RUNNING") {
        renderPanel(`<div class="tg-status">Importing ${job.processed} of ${job.total}…</div>`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      if (job.status === "ERROR") {
        renderPanel(errorHtml(new Error(job.error_message || "Import failed")));
        return;
      }
      const link = job.result_print_id ? `${instanceUrl}/models/${job.result_print_id}` : `${instanceUrl}/models`;
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
    else if (batchKey() === "makerworld:collection") await loadMakerworldGuidedCollection();
    else await loadBatchEntries();
  }

  function unmount() {
    const host = document.getElementById("thingport-grab-host");
    if (host) host.remove();
    shadowRoot = null;
    panelEl = null;
    contentEl = null;
    panelOpen = false;
    context = null;
  }

  // -- MakerWorld guided-import full-page cover ---------------------------------------------------
  //
  // Shown instead of the normal fab/panel on every page this tab visits while a guided collection
  // import (see background.js) is running -- each model's own page is a fresh navigation, so this
  // mounts fresh each time too, reading the job's current progress from storage rather than
  // carrying any state of its own across pages.

  async function mountJobOverlay(job) {
    const host = document.createElement("div");
    host.id = "thingport-grab-host";
    document.documentElement.appendChild(host);
    shadowRoot = host.attachShadow({ mode: "open" });
    await injectStyles(shadowRoot);

    const overlay = document.createElement("div");
    overlay.className = "tg-overlay";
    const percent = job.total ? Math.round((job.imported / job.total) * 100) : 0;
    overlay.innerHTML = `
      <div class="tg-overlay-card">
        <img class="tg-overlay-icon" src="${ICON_URL}" alt="" />
        <div class="tg-overlay-title">Importing from MakerWorld…</div>
        <div class="tg-overlay-count">${job.imported} / ${job.total} models imported (${percent}%)</div>
        <button class="tg-btn tg-overlay-abort" type="button" data-action="abort">Abort</button>
      </div>
    `;
    shadowRoot.appendChild(overlay);
    overlay.querySelector("[data-action=abort]").addEventListener("click", (event) => {
      const btn = event.currentTarget;
      btn.disabled = true;
      btn.textContent = "Aborting…";
      void call("ABORT_MAKERWORLD_COLLECTION_JOB");
    });
  }

  // -- Entry point: decide whether this page gets the icon at all -------------------------------

  // Bumped on every re-init so a status-check/mount still in flight for a page the user has
  // already navigated away from (see installNavigationWatcher below) discards its result instead
  // of mounting a stale icon for the wrong URL.
  let initToken = 0;

  function reportTabIconState(active) {
    void call("SET_TAB_ICON_STATE", { active });
  }

  async function init() {
    const myToken = ++initToken;

    // A guided MakerWorld collection import in progress for this tab takes over the whole page,
    // on every model page it visits along the way -- checked before anything else below, since
    // none of the normal single/batch detection applies while this is running.
    const jobRes = await call("GET_MAKERWORLD_JOB");
    if (myToken !== initToken) return;
    if (jobRes.ok && jobRes.data) {
      await mountJobOverlay(jobRes.data);
      if (myToken !== initToken) return;
      reportTabIconState(true);
      return;
    }

    const stateRes = await call("GET_STATE");
    if (myToken !== initToken) return;
    if (!stateRes.ok || !stateRes.data.configured || stateRes.data.disabled) {
      reportTabIconState(false);
      return;
    }

    const classification = thingportClassifyUrl(location.href);
    if (!classification) {
      reportTabIconState(false);
      return;
    }

    if (classification.kind === "single") {
      try {
        const status = await api("GET", `/import/status?url=${encodeURIComponent(location.href)}`);
        if (myToken !== initToken) return;
        if (status.already_imported) {
          reportTabIconState(false);
          return;
        }
      } catch {
        // If the status check fails (instance unreachable, bad credentials, etc.) still show the
        // icon -- the panel's own error state will surface the real problem when they try it.
      }
    }
    if (myToken !== initToken) return;

    context = { url: location.href, instanceUrl: stateRes.data.instanceUrl, classification };
    await mount();
    if (myToken !== initToken) return;
    reportTabIconState(true);

    // A guided import that just stopped early (see background.js's advanceMakerworldJob) always
    // lands back here, on the collection page it started from -- surface why immediately rather
    // than leaving the user to wonder why it only got partway through.
    if (jobRes.ok && jobRes.error) {
      panelOpen = true;
      panelEl.hidden = false;
      const { message, imported, total } = jobRes.error;
      renderPanel(errorHtml(new Error(`Guided import stopped after ${imported} of ${total} models: ${message}`)));
    }
  }

  // MakerWorld, Printables, and Thingiverse are all client-side-routed SPAs -- navigating from
  // one model to another (or away from one) changes location.href without a full page load, so
  // this content script only ever runs once per *tab*, not once per page. Without this, the icon
  // either never appears on a later model page, or stays stuck showing for a page you've already
  // left. Patching history.pushState/replaceState covers every router built on the standard History
  // API (which is all three of these); popstate covers back/forward; the interval is a cheap,
  // low-frequency safety net for the rare navigation that manages to bypass both.
  function installNavigationWatcher() {
    let lastHref = location.href;
    const onLocationChange = () => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      unmount();
      void init();
    };

    const origPushState = history.pushState;
    history.pushState = function (...args) {
      const result = origPushState.apply(this, args);
      onLocationChange();
      return result;
    };
    const origReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      const result = origReplaceState.apply(this, args);
      onLocationChange();
      return result;
    };
    window.addEventListener("popstate", onLocationChange);
    setInterval(onLocationChange, 1000);
  }

  // Re-evaluates immediately if the user flips "Disable extension" (or changes the instance URL)
  // from the popup while already sitting on an importable page -- without this, the floating
  // icon/panel and the toolbar icon would only catch up on the next navigation.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const relevant = ["instanceUrl", "email", "password", "disabled"].some((key) => key in changes);
    if (!relevant) return;
    unmount();
    void init();
  });

  installNavigationWatcher();
  void init();
})();
