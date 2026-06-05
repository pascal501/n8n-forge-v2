// Page de monitoring du batch — fenêtre persistante
// Écoute les mises à jour batchProgress du background.js

document.getElementById("btn-batch-stop")?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "stopBatch" });
  document.getElementById("btn-batch-stop").textContent = "⏹️ Arrêt en cours…";
  document.getElementById("btn-batch-stop").disabled = true;
});

// Écoute les mises à jour de progression du batch
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "batchProgress") {
    renderBatch(msg.state);
  }
});

// Requête initiale : récupérer l'état actuel du batch
chrome.runtime.sendMessage({ action: "getBatchStatus" }, (status) => {
  if (status) {
    renderBatch(status);
  }
});

function renderBatch(state) {
  const { running, current, total, ok, failed, currentName, logs } = state;

  // Barre de progression
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  document.getElementById("batch-bar").style.width = pct + "%";

  // Compteur
  document.getElementById("batch-counter").textContent = total > 0 ? `${current} / ${total}` : "—";

  // Nom du contact actuel
  document.getElementById("batch-current").textContent = currentName ? `👤 ${currentName}` : "";

  // Stats
  document.getElementById("batch-ok").textContent = ok;
  document.getElementById("batch-fail").textContent = failed;

  // Logs
  const logBox = document.getElementById("batch-logs");
  if (logs && logs.length > 0) {
    logBox.textContent = logs.join("\n");
    logBox.scrollTop = logBox.scrollHeight;
  }

  // Bouton arrêt
  const stopBtn = document.getElementById("btn-batch-stop");
  if (!running) {
    stopBtn.textContent = "✅ Terminé (fermer la fenêtre)";
    stopBtn.disabled = true;
    stopBtn.style.background = "#27ae60";
  }
}
