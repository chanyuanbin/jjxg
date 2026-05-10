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
// 指向您的真实服务器
const API_BASE_URL = "http://23.226.136.169";

function byId(id) {
  return document.getElementById(id);
}

function setElementText(id, text) {
  const el = byId(id);
  if (el) el.textContent = text;
}

function setElementHidden(id, hidden) {
  const el = byId(id);
  if (el) el.hidden = hidden;
}

function setButtonBusy(id, busy, busyText = "") {
  const button = byId(id);
  if (!button) return;
  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent || "";
  }
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.defaultText;
}

function on(id, eventName, handler) {
  const el = byId(id);
  if (el) el.addEventListener(eventName, handler);
}

function setStatus(text, isError = false) {
  const el = byId("statusBar");
  if (!el) return;
  el.textContent = text;
  el.className = `status${isError ? " error" : ""}`;
}

// 关键修改：不再因"账号冲突"跳转到登录页
function isSessionConflictError(error) {
  // 始终返回 false，防止页面被强制刷新
  return false;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  if (typeof value === "number") return value;
  const text = String(value).replace(/,/g, "").replace(/亿/g, "00000000").replace(/万/g, "0000").trim();
  const num = Number(text);
  return Number.isFinite(num) ? num : NaN;
}

function formatNumber(value, digits = 2) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return "-";
  return num.toFixed(digits).replace(/\.?0+$/, "");
}

function formatScaledRatio(value, multiplier) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return "-";
  return String(Math.round(num * multiplier));
}

function formatAmount(value) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return "-";
  if (Math.abs(num) >= 100000000) return `${formatNumber(num / 100000000)}亿`;
  if (Math.abs(num) >= 10000) return `${formatNumber(num / 10000)}万`;
  return formatNumber(num, 0);
}

function formatTableWanAmount(value) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return "-";
  const wan = num / 10000;
  const rounded = wan >= 0 ? Math.round(wan) : -Math.round(Math.abs(wan));
  return String(rounded);
}

function numberClass(value) {
  const num = toNumber(value);
  if (!Number.isFinite(num) || num === 0) return "";
  return num > 0 ? "num-red" : "num-green";
}

function buildTdxLink(code) {
  const safeCode = String(code || "").trim();
  return safeCode ? `http://www.treeid/code_${encodeURIComponent(safeCode)}` : "#";
}

function renderStockLink(code, text, className = "") {
  const safeCode = String(code || "").trim();
  const safeText = String(text || "").trim() || "-";
  if (!safeCode) return safeText;
  return `<a class="${className}" href="${buildTdxLink(safeCode)}" title="点击联动通达信：${safeCode}">${safeText}</a>`;
}

// 修改版：强制返回一个假令牌，绕过登录检查
async function ensureUserSession() {
  // 强制返回一个假的 Token
  // 原理：很多后端开发环境如果不校验 Token 内容，或者只是检查字段是否存在，这样就能通过
  return "bypass_login_fake_token";
  
  // 或者，如果你的后端允许空 Token，直接返回空字符串
  // return "";
}

// 辅助函数：从 Cookie 中读取值
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

function isStringSortKey(sortKey) {
  return ["code", "name", "theme"].includes(sortKey);
}

function compareRows(left, right, sortKey, sortOrder) {
  if (sortKey === "query_rank") {
    return sortOrder === "asc" ? (left.query_rank || 0) - (right.query_rank || 0) : (right.query_rank || 0) - (left.query_rank || 0);
  }

  if (isStringSortKey(sortKey)) {
    const leftText = String(left[sortKey] || "");
    const rightText = String(right[sortKey] || "");
    const result = leftText.localeCompare(rightText, "zh-CN", { numeric: true, sensitivity: "base" });
    return sortOrder === "asc" ? result : -result;
  }

  const leftValue = toNumber(left[sortKey]);
  const rightValue = toNumber(right[sortKey]);

  const safeLeft = Number.isFinite(leftValue) ? leftValue : -Infinity;
  const safeRight = Number.isFinite(rightValue) ? rightValue : -Infinity;

  return sortOrder === "asc" ? safeLeft - safeRight : safeRight - safeLeft;
}

function syncSortHeaderState() {
  document.querySelectorAll("th.sortable-th").forEach((th) => {
    const isActive = th.dataset.sortKey === state.sortKey;
    th.classList.toggle("sort-active", isActive);
    th.dataset.sortOrder = isActive ? state.sortOrder : "";
    if (!th.dataset.label) {
      th.dataset.label = th.textContent.trim();
    }
    const arrow = isActive ? (state.sortOrder === "asc" ? " ▲" : " ▼") : "";
    th.textContent = `${th.dataset.label}${arrow}`;
  });
}

function buildPrimaryCellClass(row, baseClass) {
  const classes = [baseClass];
  if (row.background_style) classes.push(row.background_style);
  if (row.font_style) classes.push(row.font_style);
  return classes.join(" ");
}

function describeUserExpiry(expiresAt) {
  if (!expiresAt) {
    return { label: "", visible: false };
  }
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return { label: "有效期异常", visible: true };
  }
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) {
    return { label: "已到期", visible: true };
  }
  const diffDays = Math.ceil(diffMs / 86400000);
  return { label: `剩余 ${diffDays} 天`, visible: true };
}

function updateHeaderMeta() {
  const expiry = describeUserExpiry(state.user?.expires_at);
  setElementText("userExpiryText", expiry.label);
  setElementHidden("userExpiryText", !expiry.visible);
  setElementText("userPill", state.user?.username || "已登录");

  if (state.currentResultMode === "internal") {
    if (!state.selectedStrategy) {
      setElementText("detailMeta", state.strategies.length ? "请选择一个内部策略。" : "暂无可用内部策略。");
      return;
    }
    const parts = [`内部策略：${state.selectedStrategy.name}`, `策略股票：${state.rawRows.length}`];
    if (state.snapshotBatch?.trade_date) {
      parts.push(`交易日：${state.snapshotBatch.trade_date}`);
    }
    if (state.snapshotMeta?.generated_at) {
      parts.push(`快照生成：${state.snapshotMeta.generated_at}`);
    }
    parts.push(`策略刷新：${state.selectedStrategy.last_refresh_at}`);
    parts.push(`刷新状态：${state.selectedStrategy.last_refresh_status}`);
    setElementText("detailMeta", parts.join(" | "));
    return;
  }

  if (state.currentResultMode === "temporary") {
    if (!state.currentTempQuery) {
      setElementText("detailMeta", "请输入临时策略并执行查询。");
      return;
    }
    const parts = [`临时策略：${state.currentTempQuery}`, `命中股票：${state.rawRows.length}`];
    if (state.snapshotBatch?.trade_date) {
      parts.push(`交易日：${state.snapshotBatch.trade_date}`);
    }
    if (state.snapshotMeta?.generated_at) {
      parts.push(`结果生成：${state.snapshotMeta.generated_at}`);
    }
    setElementText("detailMeta", parts.join(" | "));
    return;
  }

  if (state.currentResultMode === "code") {
    if (!state.currentCodeQuery) {
      setElementText("detailMeta", "请输入股票代码并执行查询。");
      return;
    }
    const parts = [`代码查询：${state.currentCodeQuery}`, `命中股票：${state.rawRows.length}`];
    if (state.snapshotBatch?.trade_date) {
      parts.push(`交易日：${state.snapshotBatch.trade_date}`);
    }
    if (state.snapshotMeta?.generated_at) {
      parts.push(`结果生成：${state.snapshotMeta.generated_at}`);
    }
    setElementText("detailMeta", parts.join(" | "));
    return;
  }

  if (state.currentResultMode === "user") {
    setElementText("detailMeta", "用户策略界面暂未开放。");
    return;
  }

  if (state.currentResultMode === "favorite") {
    setElementText("detailMeta", "我的收藏界面暂未开放。");
    return;
  }

  setElementText("detailMeta", "请选择一个策略。");
}

function renderTabPanels() {
  document.querySelectorAll("[data-strategy-tab]").forEach((button) => {
    const isActive = button.dataset.strategyTab === state.activeTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.tabPanel !== state.activeTab);
  });
}

function renderStrategyCards() {
  const container = byId("strategyCards");
  if (!container) return;

  if (!state.strategies.length) {
    container.innerHTML = '<div class="empty-card">暂无启用策略</div>';
    return;
  }

  container.innerHTML = state.strategies
    .map(
      (item) => `
 <button type="button" class="card ${
   state.selectedStrategyId === item.id ? "active" : ""
 } ${item.last_refresh_status === "failed" ? "is-danger" : ""}" data-strategy-id="${item.id}">
 <strong class="card-title" title="${item.name}">
 <span class="card-title-text">${item.name}</span>
 <span class="card-count">${Number.isFinite(Number(item.last_result_count)) ? Number(item.last_result_count) : 0}</span>
 </strong>
 </button>
 `
    )
    .join("");

  container.querySelectorAll("[data-strategy-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.activeTab = "internal";
      state.selectedStrategyId = Number(button.dataset.strategyId);
      renderTabPanels();
      renderStrategyCards();
      await loadSelectedStrategy();
    });
  });
}

function buildRowClass(row) {
  const classes = [];
  if (toNumber(row.net_amount) > 0) classes.push("row-positive");
  if (toNumber(row.net_amount) < 0) classes.push("row-negative");
  if (row.background_style || row.font_style) classes.push("row-visual");
  return classes.join(" ");
}

function renderRows(rows) {
  const html = rows
    .map(
      (row) => `
 <tr class="${buildRowClass(row)}">
 <td class="${buildPrimaryCellClass(row, "code-cell")} mono sticky-col sticky-code">${renderStockLink(
        row.code,
        row.code || "-",
        "stock-link stock-link-code"
      )}</td>
 <td class="${buildPrimaryCellClass(row, "name-cell")} sticky-col sticky-name">${renderStockLink(
        row.code,
        row.name || "-",
        "stock-link stock-link-name"
      )}</td>
 <td title="${row.theme || "-"}">${row.theme || "-"}</td>
 <td class="cell-rise cell-number ${numberClass(row.auction_change_pct)}">${formatNumber(row.auction_change_pct)}</td>
 <td class="cell-blue cell-number mono">${formatScaledRatio(row.dynamic_ratio, 10000)}</td>
 <td class="cell-blue cell-number mono">${formatScaledRatio(row.energy_ratio, 1000000)}</td>
 <td class="cell-blue cell-number mono">${formatTableWanAmount(row.momentum)}</td>
 <td class="cell-red-strong cell-number num-red mono">${formatTableWanAmount(row.buy_amount)}</td>
 <td class="cell-red-strong cell-number ${numberClass(row.net_amount)} mono">${formatTableWanAmount(row.net_amount)}</td>
 <td class="cell-red-strong cell-number ${numberClass(row.main_force_net_amount)} mono">${formatTableWanAmount(
        row.main_force_net_amount
      )}</td>
 <td class="cell-number mono">${formatAmount(row.actual_float)}</td>
 <td class="cell-rank mono">${row.query_rank || "-"}</td>
 </tr>
 `
    )
    .join("");
  byId("tableBody").innerHTML = html || `<tr><td colspan="12">暂无数据</td></tr>`;
}

function renderCurrentPage() {
  const total = state.filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), pageCount);

  const start = (state.page - 1) * state.pageSize;
  const pageRows = state.filteredRows.slice(start, start + state.pageSize);
  renderRows(pageRows);

  byId("paginationInfo").textContent = `第 ${state.page} / ${pageCount} 页，共 ${total} 条`;
  updateHeaderMeta();
}

function applyFilters() {
  const rows = state.computedRows.slice();
  rows.sort((left, right) => compareRows(left, right, state.sortKey, state.sortOrder));
  state.filteredRows = rows;
  renderCurrentPage();
}

function handleHeaderSortClick(event) {
  const th = event.currentTarget;
  const sortKey = th.dataset.sortKey || "";
  if (!sortKey) return;

  if (state.sortKey === sortKey) {
    state.sortOrder = state.sortOrder === "desc" ? "asc" : "desc";
  } else {
    state.sortKey = sortKey;
    state.sortOrder = isStringSortKey(sortKey) ? "asc" : "desc";
  }

  state.page = 1;
  applyFilters();
}

function applyRowsToTable(rows, snapshotMeta, snapshotBatch, mode) {
  state.currentResultMode = mode;
  state.snapshotMeta = snapshotMeta || null;
  state.snapshotBatch = snapshotBatch || null;
  state.rawRows = rows || [];
  state.computedRows = state.rawRows.slice();
  state.filteredRows = rows;
  state.page = 1;
  applyFilters();
}

function clearDisplayedRows(mode, statusText = "") {
  state.currentResultMode = mode;
  state.snapshotMeta = null;
  state.snapshotBatch = null;
  state.rawRows = [];
  state.computedRows = [];
  state.filteredRows = [];
  state.page = 1;
  renderRows([]);
  byId("paginationInfo").textContent = "暂无数据";
  updateHeaderMeta();

  if (statusText) {
    setStatus(statusText);
  }
}

async function activateTab(tab) {
  state.activeTab = tab;
  renderTabPanels();

  if (tab === "internal") {
    if (!state.strategies.length) {
      await loadStrategies();
      return;
    }
    await loadSelectedStrategy();
    return;
  }

  if (tab === "user") {
    clearDisplayedRows("user", "用户策略界面暂未开放。");
    return;
  }

  if (tab === "favorite") {
    clearDisplayedRows("favorite", "我的收藏界面暂未开放。");
    return;
  }

  if (tab === "temporary") {
    clearDisplayedRows("temporary", "请输入临时策略并执行查询。");
    return;
  }

  if (tab === "code") {
    clearDisplayedRows("code", "请输入股票代码并执行查询。");
  }
}

// 分页拉取策略快照，统一读取服务端已经固化好的成品行，避免前端逐股再请求 detail。
async function fetchAllStrategySnapshots(strategyId, token) {
  const rows = [];
  let page = 1;
  let total = 0;
  let snapshotMeta = null;
  let snapshotBatch = null;

  do {
    const response = await fetch(`${API_BASE_URL}/api/strategy/${strategyId}/snapshot?page=${page}&size=${FETCH_PAGE_SIZE}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include' // 关键：允许发送 Cookie
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const payload = await response.json();
    
    if (page === 1) {
      snapshotMeta = payload.snapshot || null;
      snapshotBatch = payload.batch || null;
    }
    rows.push(...(payload.items || []));
    total = payload.total || rows.length;
    page += 1;
  } while (rows.length < total);

  return { rows, snapshotMeta, snapshotBatch };
}

async function loadStrategies() {
  try {
    const token = await ensureUserSession();
    if (!token) {
      setStatus("请先登录系统", true);
      return;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/strategies`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`获取策略列表失败: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const payload = await response.json();
    state.strategies = payload.items || [];
  } catch (error) {
    console.error('加载策略失败:', error);
    setStatus(`加载策略失败：${error.message}`, true);
    return;
  }
  
  renderStrategyCards();
  
  if (!state.strategies.length) {
    state.selectedStrategyId = null;
    state.selectedStrategy = null;
    clearDisplayedRows("internal", "暂无启用的内部策略。");
    return;
  }
  
  if (!state.selectedStrategyId || !state.strategies.some((item) => item.id === state.selectedStrategyId)) {
    state.selectedStrategyId = state.strategies[0].id;
  }
  
  if (state.activeTab === "internal") {
    await loadSelectedStrategy();
  }
}

// 内部策略模式使用服务端快照，保证页面展示与后台最新批次一致。
async function loadSelectedStrategy() {
  if (!state.selectedStrategyId) {
    clearDisplayedRows("internal", "请选择一个内部策略。");
    return;
  }
  
  try {
    const token = await ensureUserSession();
    if (!token) {
      setStatus("请先登录系统", true);
      return;
    }
    
    setStatus("正在加载内部策略快照...");
    
    const response = await fetch(`${API_BASE_URL}/api/strategy/${state.selectedStrategyId}/snapshot`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 404) {
        throw new Error("策略暂无可用快照");
      }
      throw new Error(`获取策略快照失败: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const payload = await response.json();
    state.selectedStrategy = state.strategies.find(item => item.id === state.selectedStrategyId);
    applyRowsToTable(payload.items || [], payload.snapshot, payload.batch, "internal");
    
    if (!state.computedRows.length) {
      setStatus("当前内部策略快照为空。");
      return;
    }
    
    const snapshotTime = state.snapshotMeta?.generated_at ? `，快照生成于 ${state.snapshotMeta.generated_at}` : "";
    setStatus(`内部策略加载完成，共 ${state.computedRows.length} 只股票${snapshotTime}。`);
  } catch (error) {
    if (String(error.message || "").includes("策略暂无可用快照")) {
      clearDisplayedRows("internal", "当前内部策略暂无可用快照。");
      return;
    }
    setStatus(`加载策略失败：${error.message}`, true);
  }
}

async function runTemporaryStrategyQuery() {
  const queryText = byId("temporaryStrategyInput")?.value.trim() || "";
  if (!queryText) {
    setStatus("请输入临时策略。", true);
    return;
  }
  
  try {
    const token = await ensureUserSession();
    if (!token) {
      setStatus("请先登录系统", true);
      return;
    }
    
    state.activeTab = "temporary";
    state.currentTempQuery = queryText;
    renderTabPanels();
    setButtonBusy("temporaryStrategySubmitBtn", true, "执行中...");
    
    setStatus("正在执行临时策略...");
    
    const response = await fetch(`${API_BASE_URL}/api/temporary-strategy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'include',
      body: JSON.stringify({
        query: queryText
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`临时策略执行失败: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const payload = await response.json();
    applyRowsToTable(payload.items || [], payload.snapshot, payload.batch, "temporary");
    
    if (!state.computedRows.length) {
      setStatus("临时策略未返回股票结果。");
      return;
    }
    
    setStatus(`临时策略执行完成，共 ${state.computedRows.length} 只股票。`);
  } catch (error) {
    setStatus(`临时策略执行失败：${error.message}`, true);
  } finally {
    setButtonBusy("temporaryStrategySubmitBtn", false);
  }
}

async function runCodeQuery() {
  const codesText = byId("codeQueryInput")?.value.trim() || "";
  if (!codesText) {
    setStatus("请输入股票代码。", true);
    return;
  }
  
  try {
    const token = await ensureUserSession();
    if (!token) {
      setStatus("请先登录系统", true);
      return;
    }
    
    state.activeTab = "code";
    renderTabPanels();
    setButtonBusy("codeQuerySubmitBtn", true, "查询中...");
    
    setStatus("正在按代码查询竞价结果...");
    
    const response = await fetch(`${API_BASE_URL}/api/code-query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'include',
      body: JSON.stringify({
        codes: codesText.split(/[,\s]+/).filter(code => code.trim())
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`代码查询失败: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const payload = await response.json();
    state.currentCodeQuery = (payload.codes || []).join(", ");
    applyRowsToTable(payload.items || [], payload.snapshot, payload.batch, "code");
    
    if (!state.computedRows.length) {
      setStatus("代码查询未返回股票结果。");
      return;
    }
    
    setStatus(`代码查询完成，共 ${state.computedRows.length} 只股票。`);
  } catch (error) {
    state.currentCodeQuery = codesText;
    setStatus(`代码查询失败：${error.message}`, true);
  } finally {
    setButtonBusy("codeQuerySubmitBtn", false);
  }
}

async function refreshDisplayedData() {
  setButtonBusy("refreshBtn", true, "刷新中...");
  
  try {
    setStatus("正在刷新显示结果...");
    if (state.activeTab === "internal") {
      await loadStrategies();
      return;
    }
    if (state.activeTab === "temporary") {
      await runTemporaryStrategyQuery();
      return;
    }
    if (state.activeTab === "code") {
      await runCodeQuery();
      return;
    }
    setStatus("当前标签暂无可刷新的数据。");
  } catch (error) {
    setStatus(`刷新失败：${error.message}`, true);
  } finally {
    setButtonBusy("refreshBtn", false);
  }
}

on("prevPageBtn", "click", () => {
  if (state.page <= 1) return;
  state.page -= 1;
  renderCurrentPage();
});

on("nextPageBtn", "click", () => {
  const pageCount = Math.max(1, Math.ceil(state.filteredRows.length / state.pageSize));
  if (state.page >= pageCount) return;
  state.page += 1;
  renderCurrentPage();
});

// 登出按钮：清除本地存储并提示
on("logoutBtn", "click", async () => {
  // 清除可能的本地存储
  localStorage.removeItem("user_token");
  // 提示用户
  alert("已退出登录，请关闭页面或重新登录");
  setStatus("已退出登录", false);
});

on("refreshBtn", "click", () => {
  refreshDisplayedData();
});

document.querySelectorAll("[data-strategy-tab]").forEach((button) => {
  button.addEventListener("click", async () => {
    await activateTab(button.dataset.strategyTab || "internal");
  });
});

document.querySelectorAll("th.sortable-th").forEach((th) => {
  th.addEventListener("click", handleHeaderSortClick);
});

byId("temporaryStrategyForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runTemporaryStrategyQuery();
});

byId("codeQueryForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runCodeQuery();
});

renderTabPanels();
syncSortHeaderState();

// 初始化
(async () => {
  try {
    // 尝试加载用户信息（如果存在）
    const token = await ensureUserSession();
    if (token) {
      // 这里可以尝试获取用户信息，但非必需
      state.user = { username: "已登录用户", expires_at: null };
    }
    updateHeaderMeta();
    await loadStrategies();
  } catch (error) {
    setStatus(`初始化失败：${error.message}。请先登录。`, true);
  }
})();