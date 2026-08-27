(() => {
  const config = window.DSC3010J_COMPETITION_API_CONFIG;
  if (!config?.endpoint) throw new Error("Competition API endpoint is not configured.");

  async function submit(payload) {
    const response = await fetch(config.endpoint, {
      method: "POST",
      credentials: "omit",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`採点サーバーへ接続できませんでした（HTTP ${response.status}）。`);
    const result = await response.json();
    if (!result?.ok) throw new Error(result?.error?.message || "採点サーバーでエラーが発生しました。");
    return result;
  }

  function getLeaderboard() {
    return new Promise((resolve, reject) => {
      const callback = `dsc3010j_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => finish(new Error("ランキングの取得がタイムアウトしました。")), 12000);

      function cleanup() {
        window.clearTimeout(timeout);
        script.remove();
        try { delete window[callback]; } catch { window[callback] = undefined; }
      }

      function finish(error, value) {
        cleanup();
        if (error) reject(error);
        else resolve(value);
      }

      window[callback] = (result) => {
        if (!result?.ok) finish(new Error(result?.error?.message || "ランキングを取得できませんでした。"));
        else finish(null, result);
      };
      script.onerror = () => finish(new Error("ランキングサーバーへ接続できませんでした。"));
      script.src = `${config.endpoint}?action=leaderboard&callback=${encodeURIComponent(callback)}&_=${Date.now()}`;
      document.head.append(script);
    });
  }

  function requestId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (character) =>
      (Number(character) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(character) / 4).toString(16)
    );
  }

  window.DSC3010JCompetitionAPI = Object.freeze({ submit, getLeaderboard, requestId });
})();
