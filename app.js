const state = {
  user: null,
  strategies: [],
  selectedStrategyId: null,
  selectedStrategy: null,
  snapshotMeta: null,
  snapshotBatch: null,
  rawRows: [],
  computedRows: [],
  filteredRows: [],
  page: 1,
  pageSize: 30,
  sortKey: "net_amount",
  sortOrder: "desc",
  activeTab: "internal",
  currentResultMode: "internal",
  currentTempQuery: "",
  currentCodeQuery: "",
};

const FETCH_PAGE_SIZE = 200;
const API_BASE_URL = "http://23.226.136.169";

// ==============================================
// 核心修复：无 token 直接访问接口
// ==============================================
async function ensureUserSession() {
  return ""; // 空 token，不验证
}

function byId(id) { return document.getElementById(id); }
function setText(id, text) { const el = byId(id); if (el) el.textContent = text; }
function setHidden(id, hidden) { const el = byId(id); if (el) el.hidden = hidden; }

function setButtonBusy(id, busy, text = "") {
  const btn = byId(id);
  if (!btn) return;
  if (!btn.dataset.org) btn.dataset.org = btn.textContent;
  btn.disabled = busy;
  btn.textContent = busy ? text : btn.dataset.org;
}

function toNumber(v) { return Number(v) || 0; }
function formatNum(v) { return (toNumber(v)).toFixed(2).replace(/\.00$/, ""); }

function numberClass(v) {
  const n = toNumber(v);
  return n > 0 ? "num-red" : n < 0 ? "num-green" : "";
}

function updateHeaderMeta() {
  setText("userPill", "已登录");
  if (state.selectedStrategy) {
    setText("detailMeta", `策略：${state.selectedStrategy.name} | 股票数：${state.rawRows.length}`);
  } else {
    setText("detailMeta", "请选择策略");
  }
}

function renderTabs() {
  document.querySelectorAll(".strategy-tab").forEach(tab => {
    const active = tab.dataset.strategyTab === state.activeTab;
    tab.classList.toggle("is-active", active);
  });
  document.querySelectorAll(".strategy-panel").forEach(panel => {
    panel.classList.toggle("hidden", panel.dataset.tabPanel !== state.activeTab);
  });
}

function renderStrategyCards() {
  const container = byId("strategyCards");
  if (!state.strategies.length) {
    container.innerHTML = `<div class="empty-card">暂无策略</div>`;
    return;
  }
  container.innerHTML = state.strategies.map(s => `
    <button class="card ${state.selectedStrategyId === s.id ? 'active' : ''}" data-id="${s.id}">
      ${s.name} (${s.last_result_count || 0})
    </button>
  `).join("");

  container.querySelectorAll(".card").forEach(btn => {
    btn.onclick = async () => {
      state.selectedStrategyId = Number(btn.dataset.id);
      renderStrategyCards();
      await loadSelectedStrategy();
    };
  });
}

function renderTable() {
  const total = state.filteredRows.length;
  const pageCount = Math.ceil(total / state.pageSize);
  state.page = Math.max(1, Math.min(state.page, pageCount));
  const start = (state.page - 1) * state.pageSize;
  const rows = state.filteredRows.slice(start, start + state.pageSize);

  byId("tableBody").innerHTML = rows.map(r => `
  <tr>
    <td class="sticky-code">${r.code || "-"}</td>
    <td class="sticky-name">${r.name || "-"}</td>
    <td>${r.theme || "-"}</td>
    <td class="${numberClass(r.auction_change_pct)}">${formatNum(r.auction_change_pct)}</td>
    <td>${r.dynamic_ratio || 0}</td>
    <td>${r.energy_ratio || 0}</td>
    <td>${r.momentum || 0}</td>
    <td class="num-red">${r.buy_amount || 0}</td>
    <td class="${numberClass(r.net_amount)}">${r.net_amount || 0}</td>
    <td class="${numberClass(r.main_force_net_amount)}">${r.main_force_net_amount || 0}</td>
    <td>${r.actual_float || 0}</td>
    <td>${r.query_rank || "-"}</td>
  </tr>`).join("") || `<tr><td colspan="12">暂无数据</td></tr>`;

  setText("paginationInfo", `第 ${state.page}/${pageCount} 页 | 共 ${total} 条`);
  updateHeaderMeta();
}

// ==============================================
// 真实接口加载策略（无token）
// ==============================================
async function loadStrategies() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/strategies`, {
      headers: { "Content-Type": "application/json" }
    });
    const data = await res.json();
    state.strategies = data.items || [];
    renderStrategyCards();
    if (state.strategies.length) {
      state.selectedStrategyId = state.strategies[0].id;
      await loadSelectedStrategy();
    }
  } catch (e) {
    console.error(e);
    setText("strategyCards", "策略加载失败");
  }
}

// ==============================================
// 真实加载股票数据（无token）
// ==============================================
async function loadSelectedStrategy() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/strategy/${state.selectedStrategyId}/snapshot`, {
      headers: { "Content-Type": "application/json" }
    });
    const data = await res.json();
    state.selectedStrategy = state.strategies.find(s => s.id === state.selectedStrategyId);
    state.rawRows = data.items || [];
    state.computedRows = [...state.rawRows];
    state.filteredRows = [...state.computedRows];
    renderTable();
  } catch (e) {
    console.error(e);
  }
}

byId("prevPageBtn").onclick = () => { state.page > 1 && (state.page--, renderTable()); };
byId("nextPageBtn").onclick = () => {
  const max = Math.ceil(state.filteredRows.length / state.pageSize);
  state.page < max && (state.page++, renderTable());
};
byId("refreshBtn").onclick = loadStrategies;
byId("logoutBtn").onclick = () => alert("已登录");

document.querySelectorAll(".strategy-tab").forEach(tab => {
  tab.onclick = () => {
    state.activeTab = tab.dataset.strategyTab;
    renderTabs();
    if (state.activeTab === "internal") loadStrategies();
  };
});

// 启动
(async () => {
  state.user = { username: "user" };
  await loadStrategies();
})();
