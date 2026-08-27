const competition = window.DSC3010J_COMPETITION_DATA;
const competitionApi = window.DSC3010JCompetitionAPI;
const scoreForm = document.getElementById("score-form");
const teamInput = document.getElementById("team-name");
const classCodeInput = document.getElementById("class-code");
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
document.addEventListener("dsc3010j:submission-ready", updateSubmissionSourceStatus);
updateSubmissionSourceStatus();
refreshLeaderboard();
window.setInterval(refreshLeaderboard, 15000);

async function scoreSubmission(event) {
  event.preventDefault();
  clearMessages();

  const alias = teamInput.value.normalize("NFKC").trim();
  const classCode = classCodeInput.value.trim();
  const generatedCsv = window.DSC3010J_GENERATED_SUBMISSION_CSV || "";
  if (alias.length < 1 || [...alias].length > 30) {
    showScoreError("公開ニックネームを1〜30文字で入力してください。実名・学籍番号・メールは使いません。");
    return;
  }
  if (!classCode) {
    showScoreError("教員が投影している授業コードを入力してください。");
    return;
  }
  if (!generatedCsv) {
    showScoreError("先にSTEP 1、STEP 2、STEP 3を順番に実行してください。STEP 3が終わると、提出用の答案が自動で作られます。");
    return;
  }

  scoreButton.disabled = true;
  scoreButton.textContent = "採点サーバーへ提出しています…";
  try {
    const predictions = parseSubmission(generatedCsv);
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
    updateSubmissionSourceStatus();
  }
}

function updateSubmissionSourceStatus() {
  if (!generatedSubmissionStatus) return;
  if (window.DSC3010J_GENERATED_SUBMISSION_CSV) {
    generatedSubmissionStatus.textContent = "270人分の予測答案ができています。このまま採点できます。";
    generatedSubmissionStatus.dataset.ready = "true";
    scoreButton.disabled = false;
    scoreButton.textContent = "予測答案を提出して採点する";
  } else {
    generatedSubmissionStatus.textContent = "STEP 3を実行すると、270人分の提出用答案がここに用意されます。";
    generatedSubmissionStatus.dataset.ready = "false";
    scoreButton.disabled = true;
    scoreButton.textContent = "STEP 3の実行後に提出できます";
  }
}

function parseSubmission(rawText) {
  const text = rawText.replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("提出用の答案が空です。STEP 3をもう一度実行してください。");

  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = lines.shift()?.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
  if (!header || header.length !== 2 || header[0] !== "PassengerId" || header[1] !== "Survived") {
    throw new Error("提出用答案を正しく組み立てられませんでした。ページを再読み込みし、STEP 1から実行してください。");
  }

  const rows = lines.map((line, index) => {
    const fields = line.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
    if (fields.length !== 2) throw new Error(`提出用答案の${index + 2}行目を正しく読み取れませんでした。`);
    const passengerId = Number(fields[0]);
    const survived = Number(fields[1]);
    if (!Number.isInteger(passengerId)) throw new Error(`提出用答案の${index + 2}行目に照合番号がありません。`);
    if (!Number.isInteger(survived) || ![0, 1].includes(survived)) {
      throw new Error(`提出用答案の${index + 2}行目が0または1になっていません。STEP 3を確認してください。`);
    }
    return { passengerId, survived };
  });

  if (rows.length !== competition.expectedRows) {
    throw new Error(`予測は${competition.expectedRows}人分必要ですが、現在は${rows.length}人分です。STEP 2から実行し直してください。`);
  }
  const ids = rows.map((row) => row.passengerId);
  if (new Set(ids).size !== ids.length) throw new Error("提出用答案の照合番号が重複しています。ページを再読み込みしてください。");
  const expected = new Set(competition.challengeIds);
  if (ids.some((id) => !expected.has(id)) || competition.challengeIds.some((id) => !ids.includes(id))) {
    throw new Error("提出用答案とchallengeの行が一致しません。ページを再読み込みし、STEP 1から実行してください。");
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
