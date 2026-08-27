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
const restartButton = document.getElementById("restart-button");
const downloadButton = document.getElementById("download-submission");
const FINAL_CELL_ID = "09";

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

  // 実行後にボタンの文言を元に戻せるよう、最初のラベルを覚えておく
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
    "入力したコードと実行結果をすべて消して、最初の状態に戻します。よろしいですか。\n（このページ以外には影響しません）"
  );
  if (confirmed) window.location.reload();
});

if (downloadButton) {
  downloadButton.addEventListener("click", downloadSubmission);
}

initializeWebR();

async function initializeWebR() {
  if (window.location.protocol === "file:") {
    setRuntimeError(
      "このファイルは直接開けません",
      "授業用のURLから開いてください（作成者はREADMEの方法でローカルサーバーを起動してください）"
    );
    return;
  }

  try {
    setRuntimeLoading("R本体をダウンロードしています", "初回は30秒から1分ほどかかります");
    const { WebR } = await import(WEBR_MODULE_URL);
    webR = new WebR({ baseUrl: WEBR_BASE_URL });

    setRuntimeLoading("Rを起動しています", "このページを閉じずにお待ちください");
    await webR.init();
    await webR.evalRVoid('options(width = 78, digits = 4, warn = 1)');

    setRuntimeLoading("データを用意しています", "学習用とchallenge用のCSVを読み込んでいます");
    await installDataFile("data/titanic_train.csv", "/home/web_user/titanic_train.csv");
    await installDataFile("data/titanic_challenge.csv", "/home/web_user/titanic_challenge.csv");
    await webR.evalRVoid(`
      train <- read.csv("/home/web_user/titanic_train.csv", na.strings = "")
      challenge <- read.csv("/home/web_user/titanic_challenge.csv", na.strings = "")
    `);

    const globalSetup = document.getElementById("global-setup")?.textContent.trim() ?? "";
    if (globalSetup) {
      setRuntimeLoading("データを用意しています", "調査ファイルをRに読み込んでいます");
      await webR.evalRVoid(globalSetup);
    }

    runtimeReady = true;
    updateRunButtonState();
    setRuntimeReady();
  } catch (error) {
    console.error(error);
    setRuntimeError(
      "Rを起動できませんでした",
      "通信を確認して、ページを再読み込みしてください。直らないときはChromeまたはFirefoxで開いてください"
    );
  }
}

async function runCell(cell) {
  if (!runtimeReady || runtimeBusy || cell.querySelector(".run-button")?.disabled) return;

  const textarea = cell.querySelector("textarea");
  const outputBox = cell.querySelector(".r-output");
  const textOutput = cell.querySelector(".text-output");
  const plotOutput = cell.querySelector(".plot-output");
  const button = cell.querySelector(".run-button");
  const code = textarea.value.trim();

  if (!code) {
    showCellError(cell, "コードが空欄になっています。「元に戻す」を押すと、最初のコードが戻ります。");
    return;
  }

  if (cell.dataset.cellId === FINAL_CELL_ID) {
    resetGeneratedSubmission();
  }

  runtimeBusy = true;
  setButtonsDisabled(true);
  cell.classList.remove("has-error");
  cell.classList.add("is-running");
  button.textContent = "実行中…";
  outputBox.hidden = false;
  textOutput.classList.remove("is-error");
  textOutput.textContent = "Rが計算しています…";
  plotOutput.replaceChildren();
  setRuntimeLoading("コードを実行しています", `問${cell.dataset.cellId} を計算しています`);

  let shelter = null;
  try {
    shelter = await new webR.Shelter();
    const capture = await shelter.captureR(code, {
      withAutoprint: true,
      captureStreams: true,
      captureConditions: true,
      captureGraphics: {
        width: 760,
        height: 480,
        pointsize: 13,
        bg: "white",
        capture: true
      }
    });

    // 空行も残す（Rの返事は空行で段落が分かれているため、消すと読みにくくなる）
    const lines = capture.output.map((entry) => formatOutputEntry(entry));
    const printed = lines.join("\n").replace(/\s+$/, "");

    textOutput.textContent = printed;
    textOutput.classList.toggle(
      "is-error",
      capture.output.some((entry) => entry.type === "stderr" || entry.type === "warning")
    );

    for (const image of capture.images) {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `問${cell.dataset.cellId}でRが描いた図`);
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, image.width, image.height);
      plotOutput.append(canvas);
    }

    if (printed === "" && capture.images.length === 0) {
      textOutput.textContent = cell.dataset.emptyOutput || "（画面に表示される結果はありません）";
    }

    cell.classList.add("is-complete");
    completedCells.add(cell.dataset.cellId);
    updateProgress();

    if (cell.dataset.cellId === FINAL_CELL_ID) {
      const bytes = await webR.FS.readFile("/home/web_user/titanic_submission.csv");
      setGeneratedSubmission(new TextDecoder("utf-8").decode(bytes));
      if (downloadButton) {
        downloadButton.disabled = false;
        downloadButton.textContent = "submission.csv をダウンロード";
      }
    }
  } catch (error) {
    console.error(error);
    showCellError(cell, friendlyError(error));
  } finally {
    if (shelter) {
      try {
        await shelter.purge();
      } catch (purgeError) {
        console.warn("webR shelter cleanup failed", purgeError);
      }
    }

    runtimeBusy = false;
    cell.classList.remove("is-running");
    button.textContent = button.dataset.idleLabel;
    updateRunButtonState();
    setRuntimeReady();
  }
}

async function installDataFile(url, destination) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`教材データを取得できませんでした（${response.status}）`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await webR.FS.writeFile(destination, bytes);
}

async function downloadSubmission() {
  if (!runtimeReady || runtimeBusy || !downloadButton) return;

  downloadButton.disabled = true;
  downloadButton.textContent = "ファイルを準備中…";
  try {
    const bytes = await webR.FS.readFile("/home/web_user/titanic_submission.csv");
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const blob = new Blob([bom, bytes], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "titanic_submission.csv";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    downloadButton.textContent = "ダウンロードしました";
  } catch (error) {
    console.error(error);
    downloadButton.textContent = "先に問09を実行してください";
  } finally {
    window.setTimeout(() => {
      const submissionIsCurrent = Boolean(window.DSC3010J_GENERATED_SUBMISSION_CSV);
      downloadButton.disabled = !submissionIsCurrent;
      downloadButton.textContent = submissionIsCurrent
        ? "submission.csv をもう一度ダウンロード"
        : "先に問09を実行してください";
    }, 1600);
  }
}

function restoreCell(cell) {
  const textarea = cell.querySelector("textarea");

  textarea.value = textarea.dataset.initialCode;
  resizeTextarea(textarea);
  invalidateFrom(cell);
  textarea.focus();
}

// 上流のコードを変えたら、その後の結果は古くなる。
// そのため、変更した問から先を未実行へ戻し、順番に再実行してもらう。
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
    downloadButton.textContent = "先に問09を実行してください";
  }
}

function setGeneratedSubmission(csv) {
  window.DSC3010J_GENERATED_SUBMISSION_CSV = csv;
  document.dispatchEvent(new CustomEvent("dsc3010j:submission-ready", {
    detail: { ready: Boolean(csv) }
  }));
}

function showCellError(cell, message) {
  const outputBox = cell.querySelector(".r-output");
  const textOutput = cell.querySelector(".text-output");
  const plotOutput = cell.querySelector(".plot-output");

  cell.classList.add("has-error");
  outputBox.hidden = false;
  textOutput.classList.add("is-error");
  textOutput.textContent = `エラー\n${message}`;
  plotOutput.replaceChildren();
}

function friendlyError(error) {
  const raw = error instanceof Error ? error.message : String(error);
  const cleaned = raw
    .replace(/^Error:\s*/i, "")
    .replace(/^WebAssembly error:\s*/i, "")
    .trim();

  return `${cleaned}\n\n名前のつづり、括弧が半角かどうか、カンマの位置を確認してください。直らないときは「元に戻す」を押してください。`;
}

function formatOutputEntry(entry) {
  if (!entry) return "";
  const prefix = entry.type === "warning" ? "警告: " : "";
  const data = entry.data;

  if (typeof data === "string") return `${prefix}${data}`;
  if (data && typeof data.message === "string") return `${prefix}${data.message}`;

  try {
    return `${prefix}${JSON.stringify(data)}`;
  } catch {
    return `${prefix}${String(data)}`;
  }
}

function setButtonsDisabled(disabled) {
  for (const button of runButtons) button.disabled = disabled;
}

function updateRunButtonState() {
  if (!runtimeReady || runtimeBusy) {
    setButtonsDisabled(true);
    return;
  }

  const firstIncompleteIndex = cells.findIndex(
    (cell) => !completedCells.has(cell.dataset.cellId)
  );

  for (const [index, button] of runButtons.entries()) {
    button.disabled = firstIncompleteIndex !== -1 && index > firstIncompleteIndex;
  }
}

function updateProgress() {
  const completed = completedCells.size;
  const total = cells.length;
  const ratio = total === 0 ? 0 : (completed / total) * 100;
  completedCount.textContent = String(completed);
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
  statusDetail.textContent = "青い実行ボタンを押せます";
}

function setRuntimeError(title, detail) {
  runtimeReady = false;
  setButtonsDisabled(true);
  statusDot.className = "status-dot status-dot--error";
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

function resizeTextarea(textarea) {
  const isSingleLine = textarea.closest(".r-cell")?.classList.contains("r-cell--single");
  const minimumHeight = isSingleLine ? 74 : 120;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight + 2, minimumHeight), 720)}px`;
}

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.setRangeText(text, start, end, "end");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
