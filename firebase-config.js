/* ============================================================
   Firebase 設定檔
   ------------------------------------------------------------
   多個對決網頁「共用同一個 Firebase 專案」即可——靠 config.js 的 topic
   命名空間區隔資料，統計不會混在一起。所以最簡單的做法是：
   直接把你「其他對決網頁」的 firebase-config.js 內容整段複製過來。

   若要新建：到 https://console.firebase.google.com/ 建專案 →
   啟用 Realtime Database（測試模式）→ 專案設定 → 你的應用程式，
   把那段 firebaseConfig 貼到下面（務必含 databaseURL 那一行）。
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyAkxwm3QKDvvJawMYTxT8uZx2gDVSmhLK4",
  authDomain: "math-multiply-duel.firebaseapp.com",
  databaseURL: "https://math-multiply-duel-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "math-multiply-duel",
  storageBucket: "math-multiply-duel.firebasestorage.app",
  messagingSenderId: "388162320475",
  appId: "1:388162320475:web:4f660ce972b58895d6e77e",
  measurementId: "G-8VDFZXFZZ3"
};

window.firebaseConfig = firebaseConfig;
