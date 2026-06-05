// popup.js — orchestration : scrape → affichage → confirmation → envoi

const states = ["loading", "wrong-page", "no-config", "data", "saving", "batch-config", "batch", "success", "error"];

function showState(name) {
  states.forEach((s) => {
    const el = document.getElementById(`state-${s}`);
    if (el) el.classList.toggle("active", s === name);
  });
}

function fillField(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (value) {
    el.textContent = value;
    el.classList.remove("empty");
  } else {
    el.textContent = "—";
    el.classList.add("empty");
  }
}

let currentProfile = null;
let currentConfig = null;
let currentBatchConfig = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // Boutons
  document.getElementById("btn-cancel").addEventListener("click", () => window.close());
  document.getElementById("btn-save").addEventListener("click", saveContact);
  document.getElementById("btn-retry").addEventListener("click", init);
  document.getElementById("btn-open-options")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Boutons batch (présents sur plusieurs écrans)
  document.getElementById("btn-batch-icon")?.addEventListener("click", showBatchConfig);
  document.getElementById("btn-batch-from-wrong")?.addEventListener("click", showBatchConfig);
  // Boutons batch-config
  document.getElementById("btn-batch-start")?.addEventListener("click", startBatchWithCount);
  document.getElementById("btn-batch-cancel")?.addEventListener("click", init);
  document.querySelectorAll(".batch-quick-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const count = e.target.getAttribute("data-count");
      document.getElementById("batch-count-input").value = count;
    });
  });
  document.getElementById("batch-count-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") startBatchWithCount();
  });

  document.getElementById("btn-batch-stop")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "stopBatch" }).catch(() => {});
    document.getElementById("btn-batch-stop").textContent = "⏹️ Arrêt en cours…";
    document.getElementById("btn-batch-stop").disabled = true;
  });
  document.getElementById("btn-batch-close")?.addEventListener("click", () => window.close());

  // Écoute les mises à jour de progression du batch (poussées par background.js)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "batchProgress") renderBatch(msg.state);
  });

  // Si un batch tourne déjà (popup rouvert), on bascule directement sur son écran
  chrome.runtime.sendMessage({ action: "getBatchStatus" }, (status) => {
    if (chrome.runtime.lastError) return;
    if (status?.running || (status && status.total > 0 && status.current > 0)) {
      showState("batch");
      renderBatch(status);
    }
  });

  await init();
});

// ─── Mode batch ─────────────────────────────────────────────────────────────

async function showBatchConfig() {
  const cfg = await chrome.storage.sync.get([
    "airtableToken", "baseId", "tableId", "geminiKey", "batchDelay", "batchMax",
  ]);
  if (!cfg.airtableToken || !cfg.baseId || !cfg.tableId) {
    alert("Configurez d'abord votre token Airtable, Base ID et Table ID dans les paramètres.");
    chrome.runtime.openOptionsPage();
    return;
  }

  // Affiche l'écran de choix du nombre de profils
  currentBatchConfig = {
    token: cfg.airtableToken,
    baseId: cfg.baseId,
    tableId: cfg.tableId,
    geminiKey: cfg.geminiKey || "",
    batchDelay: parseInt(cfg.batchDelay, 10) || 45,
  };

  showState("batch-config");

  // Pré-remplis l'input avec la dernière valeur ou le défaut
  const input = document.getElementById("batch-count-input");
  if (input) input.value = parseInt(cfg.batchMax, 10) || 50;
}

function startBatchWithCount() {
  if (!currentBatchConfig) return;

  const countInput = document.getElementById("batch-count-input");
  let count = parseInt(countInput.value, 10) || 50;

  // Borne de sécurité
  count = Math.min(300, Math.max(1, count));

  // Sauvegarde le choix pour la prochaine fois
  chrome.storage.sync.set({ batchMax: count });

  // Ouvre une fenêtre persistante pour le monitoring du batch
  const monitorUrl = chrome.runtime.getURL("batch-monitor.html");
  chrome.windows.create(
    { url: monitorUrl, type: "popup", width: 700, height: 900, left: 100, top: 100 },
    () => {
      // Lancez le batch une fois la fenêtre ouverte
      chrome.runtime.sendMessage({
        action: "startBatch",
        config: {
          token: currentBatchConfig.token,
          baseId: currentBatchConfig.baseId,
          tableId: currentBatchConfig.tableId,
          geminiKey: currentBatchConfig.geminiKey,
          batchDelay: currentBatchConfig.batchDelay,
          maxCount: count,
        },
      }).catch(() => {});
    }
  );
}

function renderBatch(state) {
  if (!state) return;
  const { current = 0, total = 0, ok = 0, failed = 0, currentName = "", running, logs = [] } = state;

  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  document.getElementById("batch-bar").style.width = pct + "%";
  document.getElementById("batch-counter").textContent = total > 0 ? `${current} / ${total}` : "—";
  document.getElementById("batch-current").textContent = currentName ? `👤 ${currentName}` : "";
  document.getElementById("batch-stats").textContent =
    `✅ ${ok} réussi(s)   ❌ ${failed} échec(s)`;

  const logBox = document.getElementById("batch-logs");
  logBox.textContent = (logs || []).join("\n");
  logBox.scrollTop = logBox.scrollHeight;

  // Batch terminé : bascule les boutons
  if (running === false && total > 0) {
    const stopBtn = document.getElementById("btn-batch-stop");
    stopBtn.style.display = "none";
    document.getElementById("btn-batch-close").style.display = "";
  }
}

async function init() {
  showState("loading");

  // 1. Vérifie la config
  const config = await loadConfig();
  if (!config) {
    showState("no-config");
    return;
  }
  currentConfig = config;

  // 2. Vérifie qu'on est sur un profil LinkedIn
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.match(/linkedin\.com\/in\//)) {
    showState("wrong-page");
    return;
  }

  // 3. Lance le scraping
  //    Le content script est auto-injecté par Chrome (déclaré dans manifest.json)
  //    Si la page vient d'être chargée, on inject manuellement en fallback.
  let result;
  const trySend = () => chrome.tabs.sendMessage(tab.id, { action: "scrapeProfile" });

  try {
    result = await trySend();
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await new Promise(r => setTimeout(r, 400));
      result = await trySend();
    } catch (e) {
      showError("Rechargez la page LinkedIn puis réessayez. (" + e.message + ")");
      return;
    }
  }

  if (!result?.success) {
    showError("Scraping échoué. Assurez-vous d'être sur une page de profil LinkedIn.");
    return;
  }

  currentProfile = result.data;
  displayProfile(currentProfile);
  showState("data");
}

// ─── Affichage ────────────────────────────────────────────────────────────────

function displayProfile(p) {
  fillField("f-fullName", p.fullName);
  fillField("f-position", p.position);
  fillField("f-company", p.company);
  fillField("f-email", p.email);
  fillField("f-phone", p.phone);
  fillField("f-linkedinUrl", p.linkedinUrl);

  const img = document.getElementById("photo-img");
  const placeholder = document.getElementById("photo-placeholder");
  if (p.photoBase64) {
    img.src = p.photoBase64;
    img.style.display = "block";
    placeholder.style.display = "none";
  } else {
    img.style.display = "none";
    placeholder.style.display = "inline-flex";
  }
}

// ─── Sauvegarde ───────────────────────────────────────────────────────────────

async function saveContact() {
  if (!currentProfile || !currentConfig) return;

  showState("saving");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await chrome.runtime.sendMessage({
    action: "saveToAirtable",
    profile: currentProfile,
    config: currentConfig,
    tabId: tab?.id,
    classifications: {
      prospect: document.getElementById("prospect-check")?.checked || false,
      resource: document.getElementById("resource-check")?.checked || false,
    },
  });

  if (response?.success) {
    const d = response.details || {};
    let msg = currentProfile.fullName || "Contact";
    if (d.mode) msg += ` (${d.mode})`;
    const infos = [];
    if (d.summary === "Gemini") infos.push("résumé IA");
    if (d.mutual)               infos.push(`${d.mutual} en commun`);
    if (d.phone)                infos.push("tél.");
    if (d.website)              infos.push("site web");
    if (infos.length) msg += " — " + infos.join(", ");

    const warnings = [];
    if (d.pdfError)        warnings.push("PDF : " + d.pdfError);
    else if (!d.pdf)       warnings.push("PDF non uploadé");
    if (d.summaryError)    warnings.push("Gemini : " + d.summaryError);
    if (!d.email && currentProfile.linkedinUrl) warnings.push("Email non trouvé");

    document.getElementById("success-name").textContent =
      msg + (warnings.length ? "\n⚠ " + warnings.join(" | ") : "");
    // Met à jour le titre de l'état succès selon le mode
    const h2 = document.querySelector("#state-success h2");
    if (h2) h2.textContent = d.mode === "mise à jour" ? "Contact mis à jour !" : "Contact enregistré !";
    showState("success");
  } else {
    showError(response?.error || "Erreur inconnue");
  }
}

function showError(msg) {
  document.getElementById("error-msg").textContent = msg;
  showState("error");
}

// ─── Config ───────────────────────────────────────────────────────────────────

function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["airtableToken", "baseId", "tableId", "geminiKey"], (data) => {
      if (data.airtableToken && data.baseId && data.tableId) {
        resolve({
          token: data.airtableToken,
          baseId: data.baseId,
          tableId: data.tableId,
          geminiKey: data.geminiKey || "",
        });
      } else {
        resolve(null);
      }
    });
  });
}
