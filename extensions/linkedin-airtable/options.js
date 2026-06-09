// options.js — sauvegarde et chargement de la config dans chrome.storage.sync

document.addEventListener("DOMContentLoaded", () => {
  // Charge les valeurs existantes
  chrome.storage.sync.get(
    ["airtableToken", "baseId", "tableId", "geminiKey", "batchDelay", "batchMax"],
    (data) => {
      if (data.airtableToken) document.getElementById("airtableToken").value = data.airtableToken;
      if (data.baseId) document.getElementById("baseId").value = data.baseId;
      if (data.tableId) document.getElementById("tableId").value = data.tableId;
      if (data.geminiKey) document.getElementById("geminiKey").value = data.geminiKey;
      if (data.batchDelay) document.getElementById("batchDelay").value = data.batchDelay;
      if (data.batchMax) document.getElementById("batchMax").value = data.batchMax;
    }
  );

  document.getElementById("btn-save").addEventListener("click", () => {
    const token = document.getElementById("airtableToken").value.trim();
    const baseId = document.getElementById("baseId").value.trim();
    const tableId = document.getElementById("tableId").value.trim();
    const geminiKey = document.getElementById("geminiKey").value.trim();
    const status = document.getElementById("status");

    // Réglages batch (avec bornes de sécurité)
    let batchDelay = parseInt(document.getElementById("batchDelay").value, 10) || 45;
    let batchMax = parseInt(document.getElementById("batchMax").value, 10) || 50;
    batchDelay = Math.min(600, Math.max(10, batchDelay));  // 10s à 600s
    batchMax = Math.min(200, Math.max(1, batchMax));        // 1 à 200

    if (!token || !baseId || !tableId) {
      status.textContent = "Token, Base ID et Table ID sont requis.";
      status.className = "error";
      return;
    }

    chrome.storage.sync.set(
      { airtableToken: token, baseId, tableId, geminiKey, batchDelay, batchMax },
      () => {
        status.textContent = "✓ Paramètres enregistrés";
        status.className = "success";
        setTimeout(() => { status.className = ""; status.textContent = ""; }, 3000);
      }
    );
  });
});
