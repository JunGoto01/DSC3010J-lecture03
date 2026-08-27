const publicBoardApi = window.DSC3010JCompetitionAPI;
const boardBody = document.getElementById("leaderboard-body");
const boardEmpty = document.getElementById("leaderboard-empty");
const boardStatus = document.getElementById("leaderboard-status");
const refreshBoardButton = document.getElementById("refresh-leaderboard");
const exportBoardButton = document.getElementById("export-leaderboard");

let latestEntries = [];
let loading = false;

refreshBoardButton?.addEventListener("click", refreshBoard);
exportBoardButton?.addEventListener("click", exportBoard);
refreshBoard();
window.setInterval(refreshBoard, 15000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshBoard(); });

async function refreshBoard() {
  if (loading) return;
  loading = true;
  refreshBoardButton.disabled = true;
  boardStatus.textContent = "ランキングを更新しています…";
  try {
    const result = await publicBoardApi.getLeaderboard();
    latestEntries = Array.isArray(result.leaderboard) ? result.leaderboard : [];
    renderBoard(latestEntries);
    const updated = new Date(result.updatedAt);
    boardStatus.textContent = `全員に共有中 · ${updated.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 更新 · 多数派基準 ${Number(result.baselineAccuracy).toFixed(3)}`;
  } catch (error) {
    boardStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    loading = false;
    refreshBoardButton.disabled = false;
  }
}

function renderBoard(entries) {
  boardBody.replaceChildren();
  entries.forEach((entry, index) => {
    const row = document.createElement("tr");
    const values = [
      index + 1,
      entry.alias,
      `Round ${entry.round}`,
      Number(entry.score).toFixed(3),
      `${entry.correct}/${entry.total}`,
      entry.receipt
    ];
    values.forEach((value, column) => {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      if (column === 0) cell.className = "rank";
      if (column === 3) cell.className = "board-score";
      row.append(cell);
    });
    boardBody.append(row);
  });
  boardEmpty.hidden = entries.length > 0;
}

function exportBoard() {
  const lines = [
    "rank,alias,bestRound,score,correct,total,receipt,timestamp",
    ...latestEntries.map((entry, index) => [
      index + 1,
      csvCell(entry.alias),
      entry.round,
      Number(entry.score).toFixed(6),
      entry.correct,
      entry.total,
      csvCell(entry.receipt),
      csvCell(entry.timestamp)
    ].join(","))
  ];
  const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "dsc3010j_titanic_public_leaderboard.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}
