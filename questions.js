/* ============================================================
   題庫：兩位數乘一位數，適合小學五年級
   true = 算式答案正確 / false = 算式答案錯誤
   ============================================================ */
const QUESTIONS = [
  {
    id: "q01",
    category: "不進位",
    claim: "23 × 3 = 69",
    answer: true,
    explain: "23 × 3 可以拆成 20 × 3 + 3 × 3，也就是 60 + 9 = 69。"
  },
  {
    id: "q02",
    category: "個位進位",
    claim: "18 × 4 = 62",
    answer: false,
    explain: "18 × 4 = 10 × 4 + 8 × 4 = 40 + 32 = 72，不是 62。"
  },
  {
    id: "q03",
    category: "十位進位",
    claim: "42 × 6 = 252",
    answer: true,
    explain: "42 × 6 = 40 × 6 + 2 × 6 = 240 + 12 = 252。"
  },
  {
    id: "q04",
    category: "常見少加",
    claim: "37 × 5 = 175",
    answer: false,
    explain: "37 × 5 = 30 × 5 + 7 × 5 = 150 + 35 = 185。這題容易把 35 少算成 25。"
  },
  {
    id: "q05",
    category: "個位進位",
    claim: "56 × 3 = 168",
    answer: true,
    explain: "56 × 3 = 50 × 3 + 6 × 3 = 150 + 18 = 168。"
  },
  {
    id: "q06",
    category: "進位陷阱",
    claim: "64 × 7 = 438",
    answer: false,
    explain: "64 × 7 = 60 × 7 + 4 × 7 = 420 + 28 = 448，不是 438。"
  },
  {
    id: "q07",
    category: "乘以 9",
    claim: "29 × 9 = 261",
    answer: true,
    explain: "29 × 9 可以想成 30 × 9 - 9 = 270 - 9 = 261。"
  },
  {
    id: "q08",
    category: "估算檢查",
    claim: "71 × 8 = 568",
    answer: true,
    explain: "71 × 8 = 70 × 8 + 1 × 8 = 560 + 8 = 568。"
  },
  {
    id: "q09",
    category: "十位少算",
    claim: "83 × 4 = 312",
    answer: false,
    explain: "83 × 4 = 80 × 4 + 3 × 4 = 320 + 12 = 332，不是 312。"
  },
  {
    id: "q10",
    category: "個位進位",
    claim: "47 × 6 = 282",
    answer: true,
    explain: "47 × 6 = 40 × 6 + 7 × 6 = 240 + 42 = 282。"
  },
  {
    id: "q11",
    category: "進位陷阱",
    claim: "68 × 5 = 330",
    answer: false,
    explain: "68 × 5 = 60 × 5 + 8 × 5 = 300 + 40 = 340，不是 330。"
  },
  {
    id: "q12",
    category: "乘以 7",
    claim: "75 × 7 = 525",
    answer: true,
    explain: "75 × 7 = 70 × 7 + 5 × 7 = 490 + 35 = 525。"
  },
  {
    id: "q13",
    category: "接近整十",
    claim: "39 × 8 = 312",
    answer: true,
    explain: "39 × 8 可以想成 40 × 8 - 8 = 320 - 8 = 312。"
  },
  {
    id: "q14",
    category: "個位少加",
    claim: "52 × 9 = 458",
    answer: false,
    explain: "52 × 9 = 50 × 9 + 2 × 9 = 450 + 18 = 468，不是 458。"
  },
  {
    id: "q15",
    category: "不進位",
    claim: "34 × 2 = 68",
    answer: true,
    explain: "34 × 2 = 30 × 2 + 4 × 2 = 60 + 8 = 68。"
  },
  {
    id: "q16",
    category: "進位陷阱",
    claim: "96 × 3 = 278",
    answer: false,
    explain: "96 × 3 = 90 × 3 + 6 × 3 = 270 + 18 = 288，不是 278。"
  },
  {
    id: "q17",
    category: "乘以 4",
    claim: "88 × 4 = 352",
    answer: true,
    explain: "88 × 4 = 80 × 4 + 8 × 4 = 320 + 32 = 352。"
  },
  {
    id: "q18",
    category: "估算檢查",
    claim: "91 × 6 = 546",
    answer: true,
    explain: "91 × 6 = 90 × 6 + 1 × 6 = 540 + 6 = 546。"
  },
  {
    id: "q19",
    category: "十位少算",
    claim: "74 × 8 = 582",
    answer: false,
    explain: "74 × 8 = 70 × 8 + 4 × 8 = 560 + 32 = 592，不是 582。"
  },
  {
    id: "q20",
    category: "接近整十",
    claim: "99 × 5 = 495",
    answer: true,
    explain: "99 × 5 可以想成 100 × 5 - 5 = 500 - 5 = 495。"
  }
];

window.QUESTIONS = QUESTIONS;
