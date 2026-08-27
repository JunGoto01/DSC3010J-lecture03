const WEBR_VERSION = "v0.6.0";
const WEBR_BASE_URL = `https://webr.r-wasm.org/${WEBR_VERSION}/`;
const WEBR_MODULE_URL = `${WEBR_BASE_URL}webr.mjs`;

const cells = [...document.querySelectorAll(".r-cell")];
const runButtons = [...document.querySelectorAll(".run-button")];
const statusDot = document.getElementById("status-dot");
const statusTitle = document.getElementById("status-title");
const statusDetail = document.getElementById("status-detail");
const completedCount = document.getElementById("completed-count");
const totalCount = document.getElementById("total-count");
const progressFill = document.getElementById("progress-fill");
const barProgressFill = document.getElementById("bar-progress-fill");
const runtimeCompletedCount = document.getElementById("runtime-completed-count");
const restartButton = document.getElementById("restart-button");
const downloadButton = document.getElementById("download-submission");
const saveScriptButton = document.getElementById("save-script-button");
const saveScriptStatus = document.getElementById("save-script-status");
const submissionPreviewBody = document.getElementById("submission-preview-body");
const FINAL_CELL_ID = "03";

let webR = null;
let runtimeReady = false;
let runtimeBusy = false;
const completedCells = new Set();
window.DSC3010J_GENERATED_SUBMISSION_CSV = "";

totalCount.textContent = String(cells.length);

for (const cell of cells) {
  const textarea = cell.querySelector("textarea");
  const runButton = cell.querySelector(".run-button");
  const restoreButton = cell.querySelector(".restore-button");

  textarea.dataset.initialCode = textarea.value;
  textarea.wrap = "off";
  resizeTextarea(textarea);
  runButton.dataset.idleLabel = runButton.textContent;

  textarea.addEventListener("input", () => {
    resizeTextarea(textarea);
    invalidateFrom(cell);
  });
  textarea.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (runtimeReady && !runtimeBusy && !runButton.disabled) runCell(cell);
    }
    if (event.key === "Tab") {
      event.preventDefault();
      insertAtCursor(textarea, "  ");
    }
  });

  runButton.addEventListener("click", () => runCell(cell));
  restoreButton.addEventListener("click", () => restoreCell(cell));
}

restartButton.addEventListener("click", () => {
  const confirmed = window.confirm(
    "このタブ内のコード編集、実行結果、R object、提出答案を消して、最初の状態に戻します。よろしいですか。"
  );
  if (confirmed) window.location.reload();
});

downloadButton?.addEventListener("click", downloadSubmission);
saveScriptButton?.addEventListener("click", downloadCurrentScript);

initializeWebR();

async function initializeWebR() {
  if (window.location.protocol === "file:") {
    setRuntimeError("このファイルは直接開けません", "授業用のURLからページを開いてください");
    return;
  }

  try {
    setRuntimeLoading("R本体をダウンロードしています", "初回は30秒から1分ほどかかります");
    const { WebR } = await import(WEBR_MODULE_URL);
    webR = new WebR({ baseUrl: WEBR_BASE_URL });

    setRuntimeLoading("Rを起動しています", "このページを閉じずにお待ちください");
    await webR.init();
    await installDataFile("data/titanic_train.csv", "/home/web_user/titanic_train.csv");
    await installDataFile("data/titanic_challenge.csv", "/home/web_user/titanic_challenge.csv");
    await resetAnalysisEnvironment();

    runtimeReady = true;
    updateRunButtonState();
    setRuntimeReady();
  } catch (error) {
    console.error(error);
    setRuntimeError(
      "Rを起動できませんでした",
      "通信を確認してページを再読み込みしてください。直らない場合はChromeまたはFirefoxで開いてください"
    );
  }
}

async function resetAnalysisEnvironment() {
  await webR.evalRVoid(`
    rm(list = ls(envir = .GlobalEnv), envir = .GlobalEnv)
    options(width = 78, digits = 4, warn = 1)
    train <- read.csv("/home/web_user/titanic_train.csv", na.strings = "")
    challenge <- read.csv("/home/web_user/titanic_challenge.csv", na.strings = "")
  `);

  const globalSetup = document.getElementById("global-setup")?.textContent.trim() ?? "";
  if (globalSetup) await webR.evalRVoid(globalSetup);
}

async function runCell(cell) {
  const button = cell.querySelector(".run-button");
  if (!runtimeReady || runtimeBusy || button?.disabled) return;

  const textarea = cell.querySelector("textarea");
  const outputBox = cell.querySelector(".r-output");
  const textOutput = cell.querySelector(".text-output");
  const plotOutput = cell.querySelector(".plot-output");
  const code = textarea.value.trim();
  const cellIndex = cells.indexOf(cell);

  if (!code) {
    showCellError(cell, "コードが空欄です。「元のコードに戻す」を押すと、最初のコードが戻ります。");
    return;
  }

  // 実行する区画以降を古い結果として破棄する。
  // その後、現在画面に見えているコードを先頭からここまで再実行する。
  invalidateFrom(cell);
  runtimeBusy = true;
  setButtonsDisabled(true);
  cell.classList.remove("has-error");
  cell.classList.add("is-running");
  button.textContent = "実行中…";
  outputBox.hidden = false;
  textOutput.classList.remove("is-error");
  textOutput.textContent = "Rが計算しています…";
  plotOutput.replaceChildren();
  setRuntimeLoading("コードを実行しています", `STEP ${cell.dataset.cellId}までを上から計算しています`);

  let shelter = null;
  try {
    await resetAnalysisEnvironment();

    for (const previousCell of cells.slice(0, cellIndex)) {
      const previousCode = previousCell.querySelector("textarea").value.trim();
      if (!previousCode) throw new Error(`STEP ${previousCell.dataset.cellId}のコードが空欄です。`);
      try {
        await webR.evalRVoid(previousCode);
      } catch (error) {
        throw new Error(`STEP ${previousCell.dataset.cellId}を再実行できませんでした。\n${friendlyError(error)}`);
      }
    }

    shelter = await new webR.Shelter();
    const displayCode = {
      "01": "round(coef(model), 2)",
      "02": "round(head(probability), 3)",
      "03": `{
        cat("先頭6人の0/1\\n")
        print(head(prediction))
        cat("\\n270人の内訳\\n")
        print(c("予測0" = sum(prediction == 0), "予測1" = sum(prediction == 1)))
      }`
    }[cell.dataset.cellId];
    const capture = await shelter.captureR(`${code}\n\n# ページが結果確認のために実行する表示処理\n${displayCode}`, {
      withAutoprint: true,
      captureStreams: true,
      captureConditions: true,
      captureGraphics: { width: 760, height: 480, pointsize: 13, bg: "white", capture: true }
    });

    const lines = capture.output.map((entry) => formatOutputEntry(entry));
    const printed = lines.join("\n").replace(/\s+$/, "");
    if (capture.output.some((entry) => entry.type === "stderr")) {
      throw new Error(printed || "Rがコードを実行できませんでした。");
    }

    await validateRequiredObject(cell.dataset.cellId);
    textOutput.textContent = printed || "（objectを保存しました）";
    textOutput.classList.toggle("is-error", capture.output.some((entry) => entry.type === "warning"));

    for (const image of capture.images) {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `STEP ${cell.dataset.cellId}でRが描いた図`);
      canvas.getContext("2d").drawImage(image, 0, 0, image.width, image.height);
      plotOutput.append(canvas);
    }

    if (cell.dataset.cellId === FINAL_CELL_ID) await buildSubmissionAutomatically();

    cell.classList.add("is-complete");
    completedCells.add(cell.dataset.cellId);
    updateProgress();
  } catch (error) {
    console.error(error);
    showCellError(cell, friendlyError(error));
  } finally {
    if (shelter) {
      try { await shelter.purge(); }
      catch (purgeError) { console.warn("webR shelter cleanup failed", purgeError); }
    }
    runtimeBusy = false;
    cell.classList.remove("is-running");
    button.textContent = button.dataset.idleLabel;
    updateRunButtonState();
    setRuntimeReady();
  }
}

async function validateRequiredObject(cellId) {
  const checks = {
    "01": `if (!exists("model") || !inherits(model, "glm")) stop("modelが作られていません。model <- glm(...) の行を確認してください。")`,
    "02": `if (!exists("probability") || length(probability) != nrow(challenge)) stop("270人分のprobabilityが作られていません。probability <- predict(...) の行を確認してください。")`,
    "03": `if (!exists("prediction") || length(prediction) != nrow(challenge) || any(!prediction %in% c(0, 1))) stop("270人分の0/1 predictionが作られていません。ifelse(...) の行を確認してください。")`
  };
  await webR.evalRVoid(checks[cellId]);
}

async function buildSubmissionAutomatically() {
  await webR.evalRVoid(`
    submission <- data.frame(
      PassengerId = challenge$PassengerId,
      Survived = as.integer(prediction)
    )
    write.csv(
      submission,
      "/home/web_user/titanic_submission.csv",
      row.names = FALSE
    )
  `);
  const bytes = await webR.FS.readFile("/home/web_user/titanic_submission.csv");
  setGeneratedSubmission(new TextDecoder("utf-8").decode(bytes));
  if (downloadButton) {
    downloadButton.disabled = false;
    downloadButton.textContent = "現在の提出答案をCSVでダウンロード";
  }
}

async function installDataFile(url, destination) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`教材データを取得できませんでした（${response.status}）`);
  await webR.FS.writeFile(destination, new Uint8Array(await response.arrayBuffer()));
}

function downloadCurrentScript() {
  const codeSections = cells.map((cell, index) => {
    const code = cell.querySelector("textarea").value.trim();
    return `\n\n# STEP ${index + 1} ---------------------------------------------------------------\n${code}`;
  }).join("");

  const script = `# DSC3010J 第3回：ロジスティック回帰pipeline
# Webページの三つのコード欄を、一本のRスクリプトにまとめた保存版です。
# インターネット接続があれば、このファイル単体でデータを読み込めます。

# ページが自動で行っていたデータ読込
train <- read.csv(
  "https://raw.githubusercontent.com/JunGoto01/DSC3010J-lecture03/main/data/raw/titanic_train.csv",
  na.strings = ""
)
challenge <- read.csv(
  "https://raw.githubusercontent.com/JunGoto01/DSC3010J-lecture03/main/data/raw/titanic_challenge.csv",
  na.strings = ""
)
${codeSections}


# ページが自動で行っていた提出答案の作成 ------------------------------
# PassengerIdは採点用の番号で、回帰式には使いません。
submission <- data.frame(
  PassengerId = challenge$PassengerId,
  Survived = as.integer(prediction)
)
write.csv(submission, "titanic_submission.csv", row.names = FALSE)
`;

  downloadTextFile(script, "lecture03_logistic_pipeline.R", "text/plain;charset=utf-8");
  if (saveScriptStatus) {
    saveScriptStatus.textContent = "lecture03_logistic_pipeline.R をダウンロードしました。";
    window.setTimeout(() => { saveScriptStatus.textContent = ""; }, 3000);
  }
}

async function downloadSubmission() {
  if (!runtimeReady || runtimeBusy || !downloadButton || !window.DSC3010J_GENERATED_SUBMISSION_CSV) return;
  downloadButton.disabled = true;
  downloadButton.textContent = "ファイルを準備中…";
  downloadTextFile(
    window.DSC3010J_GENERATED_SUBMISSION_CSV,
    "titanic_submission.csv",
    "text/csv;charset=utf-8",
    true
  );
  downloadButton.textContent = "ダウンロードしました";
  window.setTimeout(() => {
    const ready = Boolean(window.DSC3010J_GENERATED_SUBMISSION_CSV);
    downloadButton.disabled = !ready;
    downloadButton.textContent = ready
      ? "現在の提出答案をもう一度ダウンロード"
      : "STEP 3の実行後にダウンロードできます";
  }, 1600);
}

function downloadTextFile(text, filename, type, includeBom = false) {
  const parts = includeBom ? [new Uint8Array([0xef, 0xbb, 0xbf]), text] : [text];
  const blob = new Blob(parts, { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function restoreCell(cell) {
  const textarea = cell.querySelector("textarea");
  textarea.value = textarea.dataset.initialCode;
  resizeTextarea(textarea);
  invalidateFrom(cell);
  textarea.focus();
}

function invalidateFrom(cell) {
  const startIndex = cells.indexOf(cell);
  if (startIndex < 0) return;

  for (const downstreamCell of cells.slice(startIndex)) {
    const outputBox = downstreamCell.querySelector(".r-output");
    const textOutput = downstreamCell.querySelector(".text-output");
    const plotOutput = downstreamCell.querySelector(".plot-output");
    outputBox.hidden = true;
    textOutput.textContent = "";
    textOutput.classList.remove("is-error");
    plotOutput.replaceChildren();
    downstreamCell.classList.remove("has-error", "is-complete");
    completedCells.delete(downstreamCell.dataset.cellId);
  }

  resetGeneratedSubmission();
  updateProgress();
  updateRunButtonState();
}

function resetGeneratedSubmission() {
  setGeneratedSubmission("");
  if (downloadButton) {
    downloadButton.disabled = true;
    downloadButton.textContent = "STEP 3の実行後にダウンロードできます";
  }
}

function setGeneratedSubmission(csv) {
  window.DSC3010J_GENERATED_SUBMISSION_CSV = csv;
  renderSubmissionPreview(csv);
  document.dispatchEvent(new CustomEvent("dsc3010j:submission-ready", {
    detail: { ready: Boolean(csv) }
  }));
}

function renderSubmissionPreview(csv) {
  if (!submissionPreviewBody) return;
  submissionPreviewBody.replaceChildren();
  if (!csv) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 2;
    cell.textContent = "STEP 3を実行すると、ここに先頭6行が表示されます。";
    row.append(cell);
    submissionPreviewBody.append(row);
    return;
  }

  const lines = csv.trim().split(/\r?\n/).slice(1, 7);
  for (const line of lines) {
    const [passengerId, survived] = line.split(",").map((value) => value.replace(/^"|"$/g, "").trim());
    const row = document.createElement("tr");
    for (const value of [passengerId, survived]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    submissionPreviewBody.append(row);
  }
}

function showCellError(cell, message) {
  const outputBox = cell.querySelector(".r-output");
  const textOutput = cell.querySelector(".text-output");
  cell.classList.add("has-error");
  outputBox.hidden = false;
  textOutput.classList.add("is-error");
  textOutput.textContent = `エラー\n${message}`;
  cell.querySelector(".plot-output").replaceChildren();
}

function friendlyError(error) {
  const raw = error instanceof Error ? error.message : String(error);
  const cleaned = raw.replace(/^Error:\s*/i, "").replace(/^WebAssembly error:\s*/i, "").trim();
  return `${cleaned}\n\n名前のつづり、括弧、カンマを確認してください。直らない場合は「元のコードに戻す」を押してください。`;
}

function formatOutputEntry(entry) {
  if (!entry) return "";
  const prefix = entry.type === "warning" ? "警告: " : "";
  const data = entry.data;
  if (typeof data === "string") return `${prefix}${data}`;
  if (data && typeof data.message === "string") return `${prefix}${data.message}`;
  try { return `${prefix}${JSON.stringify(data)}`; }
  catch { return `${prefix}${String(data)}`; }
}

function setButtonsDisabled(disabled) {
  for (const button of runButtons) button.disabled = disabled;
}

function updateRunButtonState() {
  if (!runtimeReady || runtimeBusy) {
    setButtonsDisabled(true);
    return;
  }
  const firstIncompleteIndex = cells.findIndex((cell) => !completedCells.has(cell.dataset.cellId));
  for (const [index, button] of runButtons.entries()) {
    button.disabled = firstIncompleteIndex !== -1 && index > firstIncompleteIndex;
  }
}

function updateProgress() {
  const completed = completedCells.size;
  const total = cells.length;
  const ratio = total === 0 ? 0 : (completed / total) * 100;
  completedCount.textContent = String(completed);
  if (runtimeCompletedCount) runtimeCompletedCount.textContent = `${completed} / ${total}`;
  progressFill.style.width = `${ratio}%`;
  if (barProgressFill) barProgressFill.style.width = `${ratio}%`;
}

function setRuntimeLoading(title, detail) {
  statusDot.className = "status-dot status-dot--loading";
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

function setRuntimeReady() {
  statusDot.className = "status-dot status-dot--ready";
  statusTitle.textContent = "Rの準備ができました";
  statusDetail.textContent = "STEP 1から上の順に実行できます";
}

function setRuntimeError(title, detail) {
  runtimeReady = false;
  setButtonsDisabled(true);
  statusDot.className = "status-dot status-dot--error";
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

function resizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight + 2, 120), 720)}px`;
}

function insertAtCursor(textarea, text) {
  textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, "end");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
