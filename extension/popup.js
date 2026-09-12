const configuredView = document.getElementById("configured-view");
const configuredUrlEl = document.getElementById("configured-url");
const disabledCheckbox = document.getElementById("disabled-checkbox");
const changeUrlBtn = document.getElementById("change-url-btn");
const setupForm = document.getElementById("setup-form");
const instanceUrlInput = document.getElementById("instance-url");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const saveBtn = document.getElementById("save-btn");
const cancelBtn = document.getElementById("cancel-btn");
const errorEl = document.getElementById("error");

function sendMessage(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.add("visible");
}

function clearError() {
  errorEl.textContent = "";
  errorEl.classList.remove("visible");
}

function showConfiguredView(state) {
  configuredView.hidden = false;
  setupForm.hidden = true;
  configuredUrlEl.textContent = state.instanceUrl;
  disabledCheckbox.checked = state.disabled;
}

function showSetupForm(prefillUrl, prefillEmail) {
  configuredView.hidden = true;
  setupForm.hidden = false;
  cancelBtn.hidden = !prefillUrl;
  instanceUrlInput.value = prefillUrl || "";
  emailInput.value = prefillEmail || "";
  passwordInput.value = "";
  clearError();
  instanceUrlInput.focus();
}

async function refresh() {
  const res = await sendMessage("GET_STATE");
  if (!res.ok) {
    showError(res.error);
    return;
  }
  if (res.data.configured) {
    showConfiguredView(res.data);
  } else {
    showSetupForm();
  }
}

changeUrlBtn.addEventListener("click", async () => {
  const res = await sendMessage("GET_STATE");
  showSetupForm(res.ok ? res.data.instanceUrl : "", "");
});

cancelBtn.addEventListener("click", () => { void refresh(); });

disabledCheckbox.addEventListener("change", async () => {
  disabledCheckbox.disabled = true;
  const res = await sendMessage("SET_DISABLED", { disabled: disabledCheckbox.checked });
  disabledCheckbox.disabled = false;
  if (!res.ok) {
    showError(res.error);
    disabledCheckbox.checked = !disabledCheckbox.checked;
  }
});

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const normalized = thingportNormalizeInstanceUrl(instanceUrlInput.value);
  let origin;
  try {
    origin = new URL(normalized).origin;
  } catch {
    showError("Enter a valid instance URL, e.g. https://thingport.example.com");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";
  try {
    // Must be called directly here, not inside the SAVE_CONFIG message handled by the background
    // service worker -- chrome.permissions.request() needs the user gesture this submit click
    // carries, which a runtime.sendMessage hop into the service worker would lose.
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) {
      showError("Thingport Grab needs permission to reach this instance to work.");
      return;
    }
    const res = await sendMessage("SAVE_CONFIG", {
      instanceUrl: normalized,
      email: emailInput.value,
      password: passwordInput.value,
    });
    if (!res.ok) {
      showError(res.error);
      return;
    }
    await refresh();
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
  }
});

void refresh();
