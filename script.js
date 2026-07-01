/* ============================================================
   TOKENBET CTF — vulnerabilidades propositais para treino:

   1) Senhas de usuário salvas em texto puro no localStorage.
   2) Credenciais do admin fixas ("hardcoded") no código-fonte.
   3) Controle de acesso da aba Admin decidido só no cliente
      (basta setar localStorage.isAdmin = "true").
   4) Saldo do usuário é um valor confiável vindo do localStorage,
      editável diretamente pelo console do navegador.
   5) No jogo Mines, as posições das minas são calculadas e
      expostas no console/DOM ANTES do clique nos quadrados.
   ============================================================ */

// ---------- "flags" ----------
const FLAGS = {
  hardcodedAdmin: "FLAG{hardcoded_admin_credentials_in_source}",
  plaintextPass:  "FLAG{plaintext_password_storage_localstorage}",
  clientBalance:  "FLAG{client_side_trusted_balance_value}",
  minesLeak:      "FLAG{mines_positions_leaked_before_click}",
  adminAccess:    "FLAG{privilege_escalation_client_side_isAdmin}"
};

// VULNERABILIDADE 2: credenciais do admin fixas no código-fonte.
// Qualquer pessoa que abrir "ver código-fonte" encontra isto.
const ADMIN_ACCOUNT = { email: "admin@tokenbet.ctf", pass: "admin123", isAdmin: true };
console.log("%c[debug] admin seed ->", "color:#ff4d5e", ADMIN_ACCOUNT, FLAGS.hardcodedAdmin);

const DB_KEY = "tb_users_v1";
const SESSION_KEY = "tb_session_v1";

function loadDB(){
  let db = JSON.parse(localStorage.getItem(DB_KEY) || "null");
  if(!db){
    db = {};
    // conta pré-criada pedida pelo usuário
    db["zezo@gmail.com"] = { pass: "10201020", balance: 100, isAdmin: false };
    db[ADMIN_ACCOUNT.email] = { pass: ADMIN_ACCOUNT.pass, balance: 999999, isAdmin: true };
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }
  return db;
}
function saveDB(db){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }

let db = loadDB();
let session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");

function toast(msg){
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 2200);
}

// ---------- AUTH ----------
function showRegister(){
  document.getElementById("registerCard").classList.remove("hidden");
}
function showLogin(){
  document.getElementById("registerCard").classList.add("hidden");
}

function doRegister(){
  const email = document.getElementById("regEmail").value.trim().toLowerCase();
  const pass = document.getElementById("regPass").value;
  if(!email || !pass){ toast("preencha email e senha"); return; }
  if(db[email]){ toast("essa conta já existe"); return; }
  // VULNERABILIDADE 1: senha salva em texto puro
  db[email] = { pass: pass, balance: 100, isAdmin: false };
  saveDB(db);
  toast("conta criada — " + FLAGS.plaintextPass);
  console.log("%c[debug] nova conta salva em texto puro:", "color:#ffb454", db[email]);
  showLogin();
}

function doLogin(){
  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const pass = document.getElementById("loginPass").value;
  const user = db[email];
  if(!user || user.pass !== pass){ toast("credenciais inválidas"); return; }
  session = { email, isAdmin: !!user.isAdmin };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  enterApp();
}

function logout(){
  session = null;
  localStorage.removeItem(SESSION_KEY);
  document.getElementById("appScreen").classList.add("hidden");
  document.getElementById("authScreen").classList.remove("hidden");
  document.getElementById("headerBalance").classList.add("hidden");
}

function currentUser(){ return db[session.email]; }

// ---------- BALANCE RULES ----------
// regra pedida: ao reiniciar, se o saldo salvo for menor que 100, volta pra 100.
// se for 100 ou mais, mantém o valor salvo (nada acontece).
function normalizeBalanceOnLoad(email){
  const u = db[email];
  if(u.balance < 100) u.balance = 100;
  saveDB(db);
}

function refreshBalanceUI(){
  const u = currentUser();
  document.getElementById("balanceValue").textContent = u.balance;
  document.getElementById("headerBalance").classList.remove("hidden");
}

function changeBalance(delta){
  const u = currentUser();
  u.balance = Math.max(0, u.balance + delta);
  saveDB(db);
  refreshBalanceUI();
}

// ---------- APP BOOT ----------
function enterApp(){
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("appScreen").classList.remove("hidden");
  normalizeBalanceOnLoad(session.email);
  refreshBalanceUI();

  // VULNERABILIDADE 3: a aba admin só é escondida via CSS/JS no cliente.
  // isAdmin também é lido da sessão local, que pode ser editada manualmente:
  // localStorage.setItem('tb_session_v1', JSON.stringify({email:"qualquer@x.com", isAdmin:true}))
  const isAdminNow = session.isAdmin || localStorage.getItem("isAdmin") === "true";
  document.getElementById("adminTab").style.display = isAdminNow ? "block" : "none";
  if(isAdminNow) renderAdminUsers();
}

if(session && db[session.email]){
  enterApp();
}

// ---------- TABS ----------
function switchTab(name){
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  ["mines","dice","coin","crash","admin"].forEach(p=>{
    document.getElementById("panel-"+p).classList.toggle("hidden", p !== name);
  });
}

// ---------- MINES ----------
let minesState = null;

function startMines(){
  const bet = parseInt(document.getElementById("minesBet").value) || 0;
  let count = parseInt(document.getElementById("minesCount").value) || 3;
  count = Math.min(Math.max(count,1), 24);
  const u = currentUser();
  if(bet <= 0 || bet > u.balance){ toast("aposta inválida"); return; }

  changeBalance(-bet);

  const positions = new Set();
  while(positions.size < count){
    positions.add(Math.floor(Math.random()*25));
  }

  // VULNERABILIDADE 5: as posições das minas vazam no console e no DOM
  // (atributo data-mine) antes de o jogador clicar em qualquer quadrado.
  console.log("%c[debug] posições das minas:", "color:#ff4d5e", [...positions], FLAGS.minesLeak);

  minesState = { bet, count, positions, revealed:new Set(), alive:true, multi:1 };

  const grid = document.getElementById("minesGrid");
  grid.innerHTML = "";
  for(let i=0;i<25;i++){
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.dataset.i = i;
    tile.dataset.mine = positions.has(i) ? "1" : "0"; // vulnerabilidade: exposto no HTML
    tile.textContent = "";
    tile.onclick = () => revealTile(i, tile);
    grid.appendChild(tile);
  }
  document.getElementById("cashoutBtn").disabled = false;
  document.getElementById("minesMulti").textContent = "1.00";
  toast("rodada iniciada — aposta debitada");
}

function revealTile(i, tileEl){
  if(!minesState || !minesState.alive) return;
  if(minesState.revealed.has(i)) return;
  minesState.revealed.add(i);

  if(minesState.positions.has(i)){
    tileEl.classList.add("bomb");
    tileEl.textContent = "💥";
    endMines(false);
    return;
  }

  tileEl.classList.add("safe");
  tileEl.textContent = "💎";
  const safeLeft = 25 - minesState.count;
  const revealedSafe = minesState.revealed.size;
  minesState.multi = (1 + (minesState.count/25) * revealedSafe * 0.9).toFixed(2);
  document.getElementById("minesMulti").textContent = minesState.multi;

  if(revealedSafe >= safeLeft){
    cashoutMines();
  }
}

function endMines(won){
  minesState.alive = false;
  document.getElementById("cashoutBtn").disabled = true;
  document.querySelectorAll("#minesGrid .tile").forEach(t=>{
    t.classList.add("disabled");
    if(t.dataset.mine === "1" && !t.classList.contains("bomb")){
      t.textContent = "💣";
    }
  });
  if(!won) toast("💥 explodiu — rodada perdida");
}

function cashoutMines(){
  if(!minesState || !minesState.alive) return;
  const payout = Math.floor(minesState.bet * minesState.multi);
  changeBalance(payout);
  toast("retirado! +" + payout + " tokens");
  endMines(true);
}

// ---------- DICE ----------
function playDice(){
  const bet = parseInt(document.getElementById("diceBet").value) || 0;
  const target = Math.min(Math.max(parseInt(document.getElementById("diceTarget").value)||50, 2), 98);
  const u = currentUser();
  if(bet <= 0 || bet > u.balance){ toast("aposta inválida"); return; }

  const roll = +(Math.random()*100).toFixed(2);
  const win = roll > target;
  const chance = (100-target)/100;
  const multi = +(0.97/chance).toFixed(2);

  document.getElementById("diceResult").textContent = roll.toFixed(2);

  if(win){
    const payout = Math.floor(bet*multi);
    changeBalance(payout - bet);
    toast("ganhou! +" + (payout-bet) + " tokens");
  } else {
    changeBalance(-bet);
    toast("perdeu " + bet + " tokens");
  }
  addHistoryChip("diceHistory", win);
}

// ---------- COINFLIP ----------
function playCoin(choice){
  const bet = parseInt(document.getElementById("coinBet").value) || 0;
  const u = currentUser();
  if(bet <= 0 || bet > u.balance){ toast("aposta inválida"); return; }

  const result = Math.random() < 0.5 ? "cara" : "coroa";
  const win = result === choice;
  document.getElementById("coinResult").textContent = result === "cara" ? "🪙 CARA" : "🪙 COROA";

  if(win){
    changeBalance(bet);
    toast("ganhou! +" + bet + " tokens");
  } else {
    changeBalance(-bet);
    toast("perdeu " + bet + " tokens");
  }
  addHistoryChip("coinHistory", win);
}

// ---------- CRASH ----------
let crashInterval = null;
let crashPoint = 1;
let crashCurrent = 1;
let crashBetAmount = 0;
let crashActive = false;

function startCrash(){
  const bet = parseInt(document.getElementById("crashBet").value) || 0;
  const u = currentUser();
  if(bet <= 0 || bet > u.balance){ toast("aposta inválida"); return; }
  changeBalance(-bet);
  crashBetAmount = bet;
  crashActive = true;
  crashCurrent = 1.00;
  // ponto de explosão sorteado com distribuição simples
  crashPoint = 1 + Math.random()*Math.random()*9;

  document.getElementById("crashStartBtn").classList.add("hidden");
  document.getElementById("crashCashout").classList.remove("hidden");

  crashInterval = setInterval(()=>{
    crashCurrent = +(crashCurrent + 0.03 + crashCurrent*0.01).toFixed(2);
    document.getElementById("crashResult").textContent = crashCurrent.toFixed(2) + "x";
    if(crashCurrent >= crashPoint){
      clearInterval(crashInterval);
      crashActive = false;
      document.getElementById("crashResult").textContent = "💥 " + crashPoint.toFixed(2) + "x";
      document.getElementById("crashCashout").classList.add("hidden");
      document.getElementById("crashStartBtn").classList.remove("hidden");
      toast("crash! perdeu " + crashBetAmount + " tokens");
    }
  }, 120);
}

function cashoutCrash(){
  if(!crashActive) return;
  clearInterval(crashInterval);
  crashActive = false;
  const payout = Math.floor(crashBetAmount * crashCurrent);
  changeBalance(payout);
  toast("retirado em " + crashCurrent.toFixed(2) + "x! +" + payout + " tokens");
  document.getElementById("crashCashout").classList.add("hidden");
  document.getElementById("crashStartBtn").classList.remove("hidden");
}

function addHistoryChip(containerId, win){
  const el = document.getElementById(containerId);
  const chip = document.createElement("div");
  chip.className = "chip " + (win ? "win" : "lose");
  chip.textContent = win ? "WIN" : "LOSE";
  el.prepend(chip);
  while(el.children.length > 12) el.removeChild(el.lastChild);
}

// ---------- ADMIN ----------
function renderAdminUsers(){
  const log = document.getElementById("adminUsersLog");
  log.innerHTML = "";
  Object.keys(db).forEach(email=>{
    const u = db[email];
    const line = document.createElement("div");
    line.textContent = email + " — saldo: " + u.balance + (u.isAdmin ? " [admin]" : "");
    log.appendChild(line);
  });
}

function adminSetBalance(){
  // VULNERABILIDADE: nenhuma validação real de que quem chama é admin
  // de verdade no servidor — tudo roda no cliente.
  const email = document.getElementById("adminTargetEmail").value.trim().toLowerCase();
  const val = parseInt(document.getElementById("adminTargetBalance").value);
  if(!db[email]){ toast("usuário não encontrado"); return; }
  db[email].balance = val;
  saveDB(db);
  toast("saldo atualizado");
  renderAdminUsers();
  if(email === session.email) refreshBalanceUI();
}
