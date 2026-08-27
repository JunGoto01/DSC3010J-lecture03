const competition = window.DSC3010J_COMPETITION_DATA;
const competitionApi = window.DSC3010JCompetitionAPI;
const scoreForm = document.getElementById("score-form");
const teamInput = document.getElementById("team-name");
const classCodeInput = document.getElementById("class-code");
const fileInput = document.getElementById("submission-file");
const generatedSubmissionStatus = document.getElementById("generated-submission-status");
const scoreButton = document.getElementById("score-button");
const scoreResult = document.getElementById("score-result");
const scoreError = document.getElementById("score-error");
const copyReceiptButton = document.getElementById("copy-receipt");
const sharedBoardBody = document.getElementById("shared-leaderboard-body");
const sharedBoardEmpty = document.getElementById("shared-leaderboard-empty");
const sharedBoardStatus = document.getElementById("shared-leaderboard-status");
const refreshBoardButton = document.getElementById("refresh-shared-leaderboard");
const PENDING_KEY = "dsc3010j-pending-submission-v1";

let latestReceipt = "";
let leaderboardLoading = false;

scoreForm?.addEventListener("submit", scoreSubmission);
copyReceiptButton?.addEventListener("click", copyReceipt);
refreshBoardButton?.addEventListener("click", refreshLeaderboard);
fileInput?.addEventListener("change", updateSubmissionSourceStatus);
document.addEventListener("dsc3010j:submission-ready", updateSubmissionSourceStatus);
updateSubmissionSourceStatus();
refreshLeaderboard();
window.setInterval(refreshLeaderboard, 15000);

async function scoreSubmission(event) {
  event.preventDefault();
  clearMessages();

  const alias = teamInput.value.normalize("NFKC").trim();
  const classCode = classCodeInput.value.trim();
  const file = fileInput.files?.[0];
  const generatedCsv = window.DSC3010J_GENERATED_SUBMISSION_CSV || "";
  if (alias.length < 1 || [...alias].length > 30) {
    showScoreError("公開ニックネームを1〜30文字で入力してください。実名・学籍番号・メールは使いません。");
    return;
  }
  if (!classCode) {
    showScoreError("教員が投影している授業コードを入力してください。");
    return;
  }
  if (!file && !generatedCsv) {
    showScoreError("先に問09を実行するか、作成済みの titanic_submission.csv を選んでください。");
    return;
  }

  scoreButton.disabled = true;
  scoreButton.textContent = "採点サーバーへ提出しています…";
  try {
    const rawText = file ? await file.text() : generatedCsv;
    const predictions = parseSubmission(rawText);
    const fingerprint = await makeFingerprint(alias, predictions);
    const pending = readPending();
    const requestId = pending?.fingerprint === fingerprint
      ? pending.requestId
      : competitionApi.requestId();
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ fingerprint, requestId }));

    const result = await competitionApi.submit({
      v: 1,
      action: "submit",
      alias,
      classCode,
      requestId,
      predictions
    });
    sessionStorage.removeItem(PENDING_KEY);
    showScore(result.submission);
    classCodeInput.value = "";
    await refreshLeaderboard();
  } catch (error) {
    showScoreError(error instanceof Error ? error.message : String(error));
  } finally {
    scoreButton.disabled = false;
    scoreButton.textContent = "このCSVを公式提出する";
  }
}

function updateSubmissionSourceStatus() {
  if (!generatedSubmissionStatus) return;
  if (fileInput.files?.[0]) {
    generatedSubmissionStatus.textContent = `選択中：${fileInput.files[0].name}`;
    generatedSubmissionStatus.dataset.ready = "true";
  } else if (window.DSC3010J_GENERATED_SUBMISSION_CSV) {
    generatedSubmissionStatus.textContent = "問09で作った最新のCSVを、そのまま提出できます。";
    generatedSubmissionStatus.dataset.ready = "true";
  } else {
    generatedSubmissionStatus.textContent = "問09を実行すると、ここから直接提出できます。ファイル選択は任意です。";
    generatedSubmissionStatus.dataset.ready = "false";
  }
}

function parseSubmission(rawText) {
  const text = rawText.replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("CSVが空です。問09をもう一度実行して作り直してください。");

  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = lines.shift()?.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
  if (!header || header.length !== 2 || header[0] !== "PassengerId" || header[1] !== "Survived") {
    throw new Error("1行目は PassengerId,Survived の2列にしてください。大文字・小文字も区別します。");
  }

  const rows = lines.map((line, index) => {
    const fields = line.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
    if (fields.length !== 2) throw new Error(`${index + 2}行目の列数が2ではありません。`);
    const passengerId = Number(fields[0]);
    const survived = Number(fields[1]);
    if (!Number.isInteger(passengerId)) throw new Error(`${index + 2}行目のPassengerIdが整数ではありません。`);
    if (!Number.isInteger(survived) || ![0, 1].includes(survived)) {
      throw new Error(`${index + 2}行目のSurvivedは0または1にしてください。NAや確率は提出できません。`);
    }
    return { passengerId, survived };
  });

  if (rows.length !== competition.expectedRows) {
    throw new Error(`提出は${competition.expectedRows}行必要ですが、このCSVは${rows.length}行です。`);
  }
  const ids = rows.map((row) => row.passengerId);
  if (new Set(ids).size !== ids.length) throw new Error("PassengerIdが重複しています。");
  const expected = new Set(competition.challengeIds);
  if (ids.some((id) => !expected.has(id)) || competition.challengeIds.some((id) => !ids.includes(id))) {
    throw new Error("この授業のchallengeとPassengerIdが一致しません。最新のCSVを使ってください。");
  }
  return rows;
}

async function makeFingerprint(alias, rows) {
  const canonical = rows.slice().sort((left, right) => left.passengerId - right.passengerId)
    .map((row) => `${row.passengerId}:${row.survived}`).join("|");
  const bytes = new TextEncoder().encode(`${alias.normalize("NFKC").toLocaleLowerCase("ja")}|${canonical}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function readPending() {
  try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null"); }
  catch { return null; }
}

function showScore(entry) {
  const difference = entry.score - competition.baselineAccuracy;
  const direction = difference >= 0 ? "+" : "";
  scoreResult.hidden = false;
  scoreResult.querySelector("[data-score-team]").textContent = `${entry.alias} · Round ${entry.round}`;
  scoreResult.querySelector("[data-score-value]").textContent = entry.score.toFixed(3);
  scoreResult.querySelector("[data-score-detail]").textContent =
    `${entry.total}人中${entry.correct}人を正しく予測。多数派だけの基準点 ${competition.baselineAccuracy.toFixed(3)} に対して ${direction}${difference.toFixed(3)}。` +
    (entry.idempotent ? " 同じ通信の再送だったため、提出回数は増えていません。" : "");
  scoreResult.querySelector("[data-score-code]").textContent = entry.receipt;
  latestReceipt = `${entry.alias} | Round ${entry.round} | score=${entry.score.toFixed(3)} | ${entry.correct}/${entry.total} | receipt=${entry.receipt}`;
  copyReceiptButton.hidden = false;
  scoreResult.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showScoreError(message) {
  scoreError.hidden = false;
  scoreError.textContent = message;
  scoreError.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearMessages() {
  scoreError.hidden = true;
  scoreError.textContent = "";
  scoreResult.hidden = true;
  copyReceiptButton.hidden = true;
}

async function refreshLeaderboard() {
  if (leaderboardLoading || !sharedBoardBody) return;
  leaderboardLoading = true;
  refreshBoardButton && (refreshBoardButton.disabled = true);
  sharedBoardStatus.textContent = "公開ランキングを更新しています…";
  try {
    const result = await competitionApi.getLeaderboard();
    renderLeaderboard(result.leaderboard || []);
    const time = new Date(result.updatedAt);
    sharedBoardStatus.textContent = `全員に共有中 · ${time.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 更新`;
  } catch (error) {
    sharedBoardStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    leaderboardLoading = false;
    refreshBoardButton && (refreshBoardButton.disabled = false);
  }
}

function renderLeaderboard(entries) {
  sharedBoardBody.replaceChildren();
  entries.slice(0, 8).forEach((entry, index) => {
    const row = document.createElement("tr");
    for (const value of [index + 1, entry.alias, `Round ${entry.round}`, Number(entry.score).toFixed(3), entry.receipt]) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    }
    sharedBoardBody.append(row);
  });
  sharedBoardEmpty.hidden = entries.length > 0;
}

async function copyReceipt() {
  if (!latestReceipt) return;
  await navigator.clipboard.writeText(latestReceipt);
  copyReceiptButton.textContent = "結果票をコピーしました";
  window.setTimeout(() => { copyReceiptButton.textContent = "結果票をコピー"; }, 1400);
}

window.DSC3010J_SCORING_TEST = { parseSubmission };
