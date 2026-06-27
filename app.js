/* ============================================================
   兩位數乘一位數大對決 — 主程式
   - Firebase Realtime Database 做跨裝置即時配對與記錄
   - host(主持方) 建立房間並掌控題目進度
   - guest(訪客) 掃 QR / 輸入房號加入
   ============================================================ */

(function () {
  "use strict";

  const QDURATION = 20;        // 每題秒數
  const REVEAL_MS = 1500;      // 兩人答完後，停留看解析的時間(毫秒)
  const CFG = window.APP_CONFIG || {};
  const TOPIC = (CFG.topic || "default").replace(/[^a-z0-9\-]/gi, "-").toLowerCase();
  const QR = window.QRCode;
  const QUESTIONS = window.QUESTIONS || [];
  const QMAP = {};
  QUESTIONS.forEach(q => { QMAP[q.id] = q; });

  // ---- 全域狀態 ----
  const S = {
    role: null,        // 'host' | 'guest'
    roomId: null,
    roomRef: null,
    room: null,        // 最新房間資料
    questions: [],     // 依序解析後的題目物件
    answered: false,
    lastIndex: -1,
    tick: null,        // 倒數計時 interval
    hostTimer: null,   // host 用的截止 timeout
    statsWritten: false,
    finishedShown: false,
    advancedFrom: -1,  // host 已推進過的題號，避免重複推進
  };

  let db = null;
  let firebaseReady = false;

  // 所有資料都放在 topics/<主題>/ 底下，讓多個主題共用同一個 Firebase 也不會混淆
  function ref(path) { return db.ref("topics/" + TOPIC + "/" + path); }

  // ---- 小工具 ----
  const $ = (id) => document.getElementById(id);
  const views = ["home", "create", "join", "lobby", "quiz", "result", "stats"];
  function show(view) {
    views.forEach(v => $("view-" + v).classList.toggle("hidden", v !== view));
    window.scrollTo(0, 0);
  }
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function randCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆字
    let s = "";
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ---- Firebase 初始化 ----
  function initFirebase() {
    const cfg = window.firebaseConfig || {};
    const looksUnset = !cfg.apiKey || /請貼上|你的專案|你的_/.test(cfg.apiKey + cfg.databaseURL + cfg.projectId);
    if (looksUnset) {
      $("setupBanner").classList.remove("hidden");
      firebaseReady = false;
      return;
    }
    try {
      firebase.initializeApp(cfg);
      db = firebase.database();
      firebaseReady = true;
    } catch (e) {
      console.error(e);
      $("setupBanner").classList.remove("hidden");
      firebaseReady = false;
    }
  }
  function requireFirebase() {
    if (!firebaseReady) {
      toast("尚未設定 Firebase，請先完成設定(見 README)");
      $("setupBanner").classList.remove("hidden");
      return false;
    }
    return true;
  }

  /* =========================================================
     建立房間（host）
     ========================================================= */
  function createRoom() {
    if (!requireFirebase()) return;
    const name = ($("hostName").value || "").trim() || "主持方";
    const count = parseInt($("qCount").value, 10) || 8;
    const ids = shuffle(QUESTIONS.map(q => q.id)).slice(0, Math.min(count, QUESTIONS.length));

    const roomId = randCode();
    S.role = "host";
    S.roomId = roomId;
    S.roomRef = ref("rooms/" + roomId);
    S.statsWritten = false;
    S.finishedShown = false;
    S.advancedFrom = -1;

    S.roomRef.set({
      status: "lobby",
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      count: ids.length,
      questionIds: ids,
      current: -1,
      deadline: 0,
      host: { name: name, score: 0 },
      guest: null,
      answers: null,
    }).then(() => {
      resolveQuestions(ids);
      buildWaitScreen(name);
      attachRoomListener();
    }).catch(err => {
      console.error(err);
      toast("建立房間失敗：" + err.message);
    });
  }

  function resolveQuestions(ids) {
    S.questions = ids.map(id => QMAP[id]).filter(Boolean);
  }

  function buildWaitScreen(hostName) {
    $("createNameCard").classList.add("hidden");
    $("waitCard").classList.remove("hidden");
    $("roomCodeText").textContent = S.roomId;
    $("hostNameShow").textContent = hostName;

    const link = location.origin + location.pathname + "#room=" + S.roomId;
    $("shareLink").value = link;

    // 產生 QR Code
    const box = $("qrcode");
    box.innerHTML = "";
    if (QR) {
      new QR(box, { text: link, width: 188, height: 188, correctLevel: QR.CorrectLevel.M });
    } else {
      box.textContent = "QR 元件載入失敗，請改用房號：" + S.roomId;
    }
    show("create");
  }

  /* =========================================================
     加入房間（guest）
     ========================================================= */
  function joinRoom() {
    if (!requireFirebase()) return;
    const code = ($("joinCode").value || "").trim().toUpperCase();
    const name = ($("guestName").value || "").trim() || "對手";
    if (code.length < 4) { toast("請輸入正確房號"); return; }

    const roomRef = ref("rooms/" + code);
    roomRef.get().then(snap => {
      if (!snap.exists()) { toast("找不到此房間，請確認房號"); return; }
      const room = snap.val();
      if (room.guest && room.guest.name) { toast("房間已有對手，無法加入"); return; }
      if (room.status !== "lobby") { toast("對戰已開始或已結束"); return; }

      S.role = "guest";
      S.roomId = code;
      S.roomRef = roomRef;
      resolveQuestions(room.questionIds || []);

      roomRef.child("guest").set({ name: name, score: 0 }).then(() => {
        $("lobbyCode").textContent = code;
        $("lobbyHostName").textContent = room.host ? room.host.name : "主持方";
        $("lobbyGuestName").textContent = name;
        show("lobby");
        attachRoomListener();
      });
    }).catch(err => {
      console.error(err);
      toast("加入失敗：" + err.message);
    });
  }

  /* =========================================================
     監聽房間變化（雙方共用）
     ========================================================= */
  function attachRoomListener() {
    S.roomRef.on("value", snap => {
      const room = snap.val();
      if (!room) {
        if (S.room && S.room.status !== "finished") toast("房間已關閉");
        cleanupListeners();
        return;
      }
      S.room = room;
      onRoomUpdate(room);
    });
  }

  function onRoomUpdate(room) {
    // 等待畫面：對手加入後啟用開始鈕
    if (S.role === "host" && room.status === "lobby") {
      const g = room.guest;
      const slot = $("slotGuest");
      if (g && g.name) {
        $("guestNameShow").textContent = g.name;
        $("guestTag").textContent = "已加入";
        $("slotGuest").querySelector(".avatar").textContent = "🙋";
        slot.classList.add("ready");
        $("btnStartGame").disabled = false;
        $("btnStartGame").textContent = "▶ 開始對戰";
      } else {
        $("guestNameShow").textContent = "等待對手…";
        $("guestTag").textContent = "尚未加入";
        slot.classList.remove("ready");
        $("btnStartGame").disabled = true;
        $("btnStartGame").textContent = "等待對手加入…";
      }
    }

    // 開始 / 進行中
    if (room.status === "playing") {
      if (room.current !== S.lastIndex) {
        renderQuestion(room);
      } else {
        // 同題內的對手作答更新
        updateLiveScore(room);
        maybeShowOpponent(room);
      }
      if (S.role === "host") hostScheduleDeadline(room);
    }

    // 結束
    if (room.status === "finished" && !S.finishedShown) {
      S.finishedShown = true;
      stopTick();
      if (S.role === "host" && !S.statsWritten) {
        S.statsWritten = true;
        writeStats(room);
      }
      renderResult(room);
    }
  }

  /* =========================================================
     開始遊戲（host）
     ========================================================= */
  function startGame() {
    if (!S.room || !S.room.guest) { toast("尚無對手"); return; }
    S.roomRef.update({
      status: "playing",
      current: 0,
      deadline: Date.now() + QDURATION * 1000,
    });
  }

  // host：到截止時間自動進入下一題
  function hostScheduleDeadline(room) {
    clearTimeout(S.hostTimer);
    const ms = room.deadline - Date.now() + 900;
    S.hostTimer = setTimeout(hostTryAdvance, Math.max(ms, 300));
    // 也立即檢查（雙方都答完時）
    hostTryAdvance();
  }

  // 只更新必要欄位（不覆寫整個房間，避免蓋掉對方的答案），
  // 並用 advancedFrom 保證每一題只推進一次。
  function hostTryAdvance() {
    if (!S.roomRef || S.role !== "host") return;
    const room = S.room;
    if (!room || room.status !== "playing") return;
    const cur = room.current;
    if (S.advancedFrom === cur) return; // 這一題已經推進過了

    const total = S.questions.length;
    const ans = room.answers || {};
    const hAns = ans.host && ans.host[cur];
    const gAns = ans.guest && ans.guest[cur];
    const both = hAns && gAns;
    const expired = Date.now() > room.deadline + 600;
    if (!both && !expired) return; // 尚未達成推進條件

    S.advancedFrom = cur; // 先上鎖，避免重複推進
    const done = cur >= total - 1;
    const doAdvance = () => {
      const payload = done
        ? { status: "finished", finishedAt: Date.now() }
        : { current: cur + 1, deadline: Date.now() + QDURATION * 1000 };
      S.roomRef.update(payload).catch(err => {
        console.error("advance failed", err);
        S.advancedFrom = -1; // 寫入失敗就解鎖，下次再試
      });
    };
    // 兩人都答完 → 停留一下看解析再換題；逾時 → 直接換
    if (both && !expired) setTimeout(doAdvance, REVEAL_MS);
    else doAdvance();
  }

  /* =========================================================
     答題畫面
     ========================================================= */
  function renderQuestion(room) {
    S.lastIndex = room.current;
    S.answered = false;
    show("quiz");

    const q = S.questions[room.current];
    const total = S.questions.length;

    $("meLabel").textContent = S.role === "host"
      ? (room.host ? room.host.name : "你")
      : (room.guest ? room.guest.name : "你");
    $("oppLabel").textContent = S.role === "host"
      ? (room.guest ? room.guest.name : "對手")
      : (room.host ? room.host.name : "對手");

    $("quizProgress").textContent = `第 ${room.current + 1} / ${total} 題`;
    $("quizCategory").textContent = q.category || "乘法";
    $("quizClaim").textContent = q.claim;

    // 重置選項
    ["choiceTrue", "choiceFalse"].forEach(id => {
      const el = $(id);
      el.disabled = false;
      el.classList.remove("selected", "correct", "wrong");
    });
    $("quizFeedback").classList.add("hidden");
    $("quizFeedback").innerHTML = "";

    updateLiveScore(room);
    startTick(room);

    // 若這台裝置先前已經答過（重新整理等情況）就鎖定
    const myAns = room.answers && room.answers[S.role] && room.answers[S.role][room.current];
    if (myAns) lockAfterAnswer(q, myAns.choice, room);
  }

  function startTick(room) {
    stopTick();
    const update = () => {
      const remain = Math.max(0, room.deadline - Date.now());
      const sec = Math.ceil(remain / 1000);
      const t = $("quizTimer");
      t.textContent = sec;
      t.classList.toggle("low", sec <= 5);
      $("quizBar").style.width = (remain / (QDURATION * 1000) * 100) + "%";
      if (remain <= 0) {
        stopTick();
        if (!S.answered) submitAnswer(null, room); // 逾時自動以未作答計
      }
    };
    update();
    S.tick = setInterval(update, 200);
  }
  function stopTick() { if (S.tick) { clearInterval(S.tick); S.tick = null; } }

  function submitAnswer(choiceBool, room) {
    room = room || S.room;
    if (S.answered) return;
    S.answered = true;
    stopTick();

    const cur = room.current;
    const q = S.questions[cur];
    const correct = choiceBool !== null && choiceBool === q.answer;
    const remain = Math.max(0, room.deadline - Date.now());
    const ms = QDURATION * 1000 - remain;
    const points = correct ? 100 + Math.round(remain / 1000) * 5 : 0;

    // 一次寫入這題答案（含分數），分數最後從各題加總，不再額外寫 score
    S.roomRef.child("answers/" + S.role + "/" + cur).set({
      choice: choiceBool, correct: correct, ms: ms, points: points
    });

    lockAfterAnswer(q, choiceBool, room);
    if (S.role === "host") hostTryAdvance();
  }

  // 由各題 points 加總出總分（取代即時寫入的 score 欄位）
  function sumScore(room, role) {
    const ra = room.answers && room.answers[role];
    if (!ra) return 0;
    let s = 0;
    Object.keys(ra).forEach(k => { s += (ra[k] && ra[k].points) || 0; });
    return s;
  }

  function lockAfterAnswer(q, choiceBool, room) {
    const tBtn = $("choiceTrue"), fBtn = $("choiceFalse");
    tBtn.disabled = true; fBtn.disabled = true;
    // 標示正解
    (q.answer ? tBtn : fBtn).classList.add("correct");
    if (choiceBool !== null && choiceBool !== q.answer) {
      (choiceBool ? tBtn : fBtn).classList.add("wrong");
    }
    if (choiceBool !== null) {
      (choiceBool ? tBtn : fBtn).classList.add("selected");
    }

    const correct = choiceBool !== null && choiceBool === q.answer;
    const fb = $("quizFeedback");
    let head;
    if (choiceBool === null) head = `<div class="verdict no">⏰ 時間到，未作答</div>`;
    else if (correct) head = `<div class="verdict ok">✅ 答對了！</div>`;
    else head = `<div class="verdict no">❌ 答錯了</div>`;
    const verdictWord = q.answer ? "這個答案是「正確的」。" : "這個答案是「錯誤的」。";
    fb.innerHTML = head +
      `<div><strong>${esc(verdictWord)}</strong><br>${esc(q.explain)}</div>` +
      `<div class="opp" id="oppLine">等待對手作答…</div>`;
    fb.classList.remove("hidden");

    maybeShowOpponent(room);
  }

  function maybeShowOpponent(room) {
    const oppRole = S.role === "host" ? "guest" : "host";
    const cur = room.current;
    const oppAns = room.answers && room.answers[oppRole] && room.answers[oppRole][cur];
    const line = $("oppLine");
    if (!line) return;
    if (oppAns) {
      if (oppAns.choice === null) line.textContent = "對手：時間到未作答";
      else line.textContent = "對手：" + (oppAns.correct ? "答對 ✅" : "答錯 ❌");
    }
  }

  function updateLiveScore(room) {
    const oppRole = S.role === "host" ? "guest" : "host";
    $("meScore").textContent = sumScore(room, S.role);
    $("oppScore").textContent = sumScore(room, oppRole);
  }

  /* =========================================================
     結果畫面
     ========================================================= */
  function renderResult(room) {
    show("result");
    const host = room.host || { name: "主持方" };
    const guest = room.guest || { name: "對手" };
    const hs = sumScore(room, "host"), gs = sumScore(room, "guest");

    const myIsHost = S.role === "host";
    const myScore = myIsHost ? hs : gs;
    const oppScore = myIsHost ? gs : hs;

    let title, crown, sub;
    if (hs === gs) { title = "平手！"; crown = "🤝"; sub = "勢均力敵，再來一場分高下！"; }
    else if (myScore > oppScore) { title = "你贏了！"; crown = "🏆"; sub = "乘法達人就是你！"; }
    else { title = "惜敗"; crown = "💪"; sub = "別氣餒，看看下面的解析再戰一場！"; }

    $("resultCrown").textContent = crown;
    $("resultTitle").textContent = title;
    $("resultSub").textContent = sub;

    const meWin = myScore >= oppScore;
    $("scoreFinal").innerHTML =
      `<div class="sb ${meWin ? "win" : ""}"><b>${myScore}</b><span>${esc(myIsHost ? host.name : guest.name)}（你）</span></div>` +
      `<div class="dash">：</div>` +
      `<div class="sb ${!meWin ? "win" : ""}"><b>${oppScore}</b><span>${esc(myIsHost ? guest.name : host.name)}</span></div>`;

    // 逐題回顧
    const ans = room.answers || {};
    const myAns = ans[S.role] || {};
    const oppAns = ans[S.role === "host" ? "guest" : "host"] || {};
    let html = "";
    S.questions.forEach((q, i) => {
      const ma = myAns[i], oa = oppAns[i];
      const mMark = ma && ma.correct ? '<span class="mark ok">✅ 你答對</span>'
        : (ma && ma.choice !== null ? '<span class="mark no">❌ 你答錯</span>' : '<span class="mark no">⏰ 你未答</span>');
      const oMark = oa && oa.correct ? '<span class="mark ok">對手答對</span>'
        : (oa && oa.choice !== null ? '<span class="mark no">對手答錯</span>' : '<span class="mark no">對手未答</span>');
      html += `<div class="review-item">
        <div class="rq">${i + 1}. ${esc(q.claim)}</div>
        <div class="rrow">${mMark}<span>${oMark}</span></div>
        <div class="meta" style="margin-top:6px;color:var(--muted);font-size:12px;line-height:1.6">
          正解：${q.answer ? "正確" : "錯誤"}　|　${esc(q.explain)}</div>
      </div>`;
    });
    $("reviewList").innerHTML = html;
  }

  /* =========================================================
     寫入統計（host 在結束時呼叫一次）
     ========================================================= */
  function writeStats(room) {
    if (!db) return;
    const ans = room.answers || {};
    let totalAnswers = 0;
    ["host", "guest"].forEach(role => {
      const ra = ans[role];
      if (!ra) return;
      (room.questionIds || []).forEach((qid, i) => {
        const a = ra[i];
        if (!a) return;
        totalAnswers++;
        const wrong = !a.correct ? 1 : 0;
        ref("stats/questions/" + qid + "/attempts").transaction(v => (v || 0) + 1);
        if (wrong) ref("stats/questions/" + qid + "/wrong").transaction(v => (v || 0) + 1);
      });
    });
    ref("stats/totals/matches").transaction(v => (v || 0) + 1);
    ref("stats/totals/answers").transaction(v => (v || 0) + totalAnswers);

    // 對戰記錄
    ref("matches").push({
      host: room.host ? room.host.name : "",
      guest: room.guest ? room.guest.name : "",
      hostScore: sumScore(room, "host"),
      guestScore: sumScore(room, "guest"),
      count: (room.questionIds || []).length,
      finishedAt: room.finishedAt || Date.now(),
    });
  }

  /* =========================================================
     統計分析頁
     ========================================================= */
  function loadStats() {
    show("stats");
    $("statsList").innerHTML = '<div class="spinner"></div>';
    if (!requireFirebase()) {
      $("statsList").innerHTML = '<p class="muted center">需先設定 Firebase 才能讀取統計。</p>';
      return;
    }
    ref("stats").get().then(snap => {
      const data = snap.val() || {};
      const totals = data.totals || {};
      const qstats = data.questions || {};
      $("kpiMatches").textContent = totals.matches || 0;
      $("kpiAnswers").textContent = totals.answers || 0;

      let totalWrong = 0, totalAtt = 0;
      const rows = QUESTIONS.map(q => {
        const st = qstats[q.id] || {};
        const att = st.attempts || 0;
        const wrong = st.wrong || 0;
        totalWrong += wrong; totalAtt += att;
        return { q, att, wrong, rate: att ? wrong / att : 0 };
      });
      $("kpiWrong").textContent = totalAtt ? Math.round(totalWrong / totalAtt * 100) + "%" : "0%";

      const answered = rows.filter(r => r.att > 0).sort((a, b) => b.rate - a.rate || b.att - a.att);
      if (!answered.length) {
        $("statsList").innerHTML = '<p class="muted center">目前還沒有作答記錄，玩幾場再回來看吧！</p>';
        return;
      }
      $("statsList").innerHTML = answered.map(r => {
        const pct = Math.round(r.rate * 100);
        return `<div class="stat-row">
          <div class="sq"><span>${esc(r.q.claim)}</span><span class="pct">${pct}%</span></div>
          <div class="sbar"><i style="width:${Math.max(pct, 3)}%"></i></div>
          <div class="meta">作答 ${r.att} 次，答錯 ${r.wrong} 次　·　正解：${r.q.answer ? "正確" : "錯誤"}　·　${esc(r.q.category)}</div>
        </div>`;
      }).join("");
    }).catch(err => {
      console.error(err);
      $("statsList").innerHTML = '<p class="muted center">讀取統計失敗：' + esc(err.message) + '</p>';
    });
  }

  // 管理員一鍵重置：清空本主題的統計、對戰記錄與殘留房間（換班時用）
  function resetStats() {
    if (!requireFirebase()) return;
    const correct = CFG.adminPass || "";
    if (!correct) { toast("尚未在 config.js 設定 adminPass，無法重置"); return; }
    const pass = window.prompt("請輸入管理密碼以重置統計：");
    if (pass === null) return;            // 使用者取消
    if (pass !== correct) { toast("密碼錯誤，未重置"); return; }
    if (!window.confirm("確定要清除「" + (CFG.title || "本主題") + "」的所有統計與對戰記錄嗎？\n此動作無法復原，建議先截圖保存。")) return;
    Promise.all([
      ref("stats").remove(),
      ref("matches").remove(),
      ref("rooms").remove()
    ]).then(() => {
      toast("✅ 已重置，統計歸零");
      loadStats();
    }).catch(err => {
      console.error(err);
      toast("重置失敗：" + err.message);
    });
  }

  /* =========================================================
     清理 & 重置
     ========================================================= */
  function cleanupListeners() {
    if (S.roomRef) S.roomRef.off();
    clearTimeout(S.hostTimer);
    stopTick();
  }
  function resetToHome() {
    cleanupListeners();
    if (S.role === "host" && S.roomRef && S.room && S.room.status !== "playing") {
      S.roomRef.remove().catch(() => {});
    }
    S.role = null; S.roomId = null; S.roomRef = null; S.room = null;
    S.questions = []; S.lastIndex = -1; S.answered = false;
    S.statsWritten = false; S.finishedShown = false; S.advancedFrom = -1;
    $("createNameCard").classList.remove("hidden");
    $("waitCard").classList.add("hidden");
    history.replaceState(null, "", location.pathname);
    show("home");
  }

  /* =========================================================
     事件綁定 & 啟動
     ========================================================= */
  function bind() {
    $("btnCreate").onclick = () => { show("create"); $("createNameCard").classList.remove("hidden"); $("waitCard").classList.add("hidden"); };
    $("btnJoinManual").onclick = () => show("join");
    $("btnStats").onclick = loadStats;
    $("navStats").onclick = loadStats;
    $("btnStatsBack").onclick = resetToHome;
    $("btnResetStats").onclick = resetStats;

    $("btnBackHome1").onclick = resetToHome;
    $("btnBackHome2").onclick = resetToHome;
    $("btnDoCreate").onclick = createRoom;
    $("btnDoJoin").onclick = joinRoom;
    $("btnCancelRoom").onclick = resetToHome;
    $("btnStartGame").onclick = startGame;
    $("btnPlayAgain").onclick = resetToHome;
    $("btnResultStats").onclick = loadStats;

    $("btnCopyLink").onclick = () => {
      const inp = $("shareLink");
      inp.select();
      navigator.clipboard ? navigator.clipboard.writeText(inp.value).then(() => toast("已複製連結")) : (document.execCommand("copy"), toast("已複製連結"));
    };

    $("choiceTrue").onclick = () => submitAnswer(true, S.room);
    $("choiceFalse").onclick = () => submitAnswer(false, S.room);

    $("joinCode").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase(); });
  }

  // 依 config.js 套用品牌文字（標題、副標、選項文字等）
  function applyBranding() {
    const setText = (id, v) => { const el = $(id); if (el && v != null) el.textContent = v; };
    const setHTML = (id, v) => { const el = $(id); if (el && v != null) el.innerHTML = v; };
    if (CFG.title) document.title = CFG.title;
    setText("brandTitle", CFG.title);
    setText("brandSubtitle", CFG.subtitle);
    setText("brandLogo", CFG.logo);
    setText("homeTitle", CFG.title);
    setHTML("homeIntro", CFG.intro);
    setHTML("homeFooter", CFG.footer);
    if (CFG.trueLabel) $("choiceTrue").innerHTML = '<span class="emoji">✅</span>' + esc(CFG.trueLabel);
    if (CFG.falseLabel) $("choiceFalse").innerHTML = '<span class="emoji">❌</span>' + esc(CFG.falseLabel);
  }

  function start() {
    applyBranding();
    initFirebase();
    bind();
    // 從 QR Code 連結進入 → 直接帶到加入畫面
    const params = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams((location.hash || "").replace(/^#/, ""));
    const room = params.get("room") || hashParams.get("room");
    if (room) {
      $("joinCode").value = room.toUpperCase();
      show("join");
      setTimeout(() => $("guestName").focus(), 100);
    } else {
      show("home");
    }
  }

  document.addEventListener("DOMContentLoaded", start);
})();
