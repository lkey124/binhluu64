let currentAdminToken = null;
let cachedAdminKeys = [];
let currentFilter = "all";

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      document.getElementById("keyInput").value = text.trim();
    }
  } catch {
    alert("Không thể truy cập bộ nhớ tạm. Hãy dùng phím Ctrl + V để dán.");
  }
}

async function handleVerify(event) {
  event.preventDefault();
  const keyInput = document.getElementById("keyInput");
  const rawKey = keyInput.value.trim();
  const btnSubmit = document.getElementById("btnSubmit");
  const alertBox = document.getElementById("alertBox");
  const alertMsg = document.getElementById("alertMsg");

  if (!rawKey) return;

  btnSubmit.disabled = true;
  btnSubmit.querySelector(".btn-text").classList.add("hidden");
  btnSubmit.querySelector(".btn-loader").classList.remove("hidden");
  alertBox.classList.add("hidden");

  try {
    const response = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: rawKey })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Xác thực thất bại. Vui lòng kiểm tra lại Key!");
    }

    if (data.type === "admin") {
      currentAdminToken = data.token;
      keyInput.value = "";
      openAdminModal();
      return;
    }

    showSuccessState(data);

  } catch (err) {
    alertMsg.innerText = err.message;
    alertBox.classList.remove("hidden");
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.querySelector(".btn-text").classList.remove("hidden");
    btnSubmit.querySelector(".btn-loader").classList.add("hidden");
  }
}

function showSuccessState(data) {
  document.getElementById("keyForm").classList.add("hidden");
  const card = document.getElementById("gatewayCard");
  if (card) card.style.maxWidth = "640px";
  document.getElementById("successCard").classList.remove("hidden");

  let baseTokenUrl = data.directUrl || "https://www.netflix.com/browse?nftoken=BgAAAW09e99QZdemo";
  let nftoken = "BgAAAW09e99QZ829103819";

  if (baseTokenUrl.includes("nftoken=")) {
    nftoken = baseTokenUrl.split("nftoken=")[1].split("&")[0];
  } else if (baseTokenUrl.includes("token=")) {
    nftoken = baseTokenUrl.split("token=")[1].split("&")[0];
  }

  const pcUrl = "https://www.netflix.com/browse?nftoken=" + nftoken;
  const mobileUrl = "https://www.netflix.com/unsupported?nftoken=" + nftoken;
  const tvUrl = "https://www.netflix.com/tv2?nftoken=" + nftoken;

  document.getElementById("pcUrlInput").value = pcUrl;
  document.getElementById("btnOpenPc").href = pcUrl;

  document.getElementById("mobileUrlInput").value = mobileUrl;
  document.getElementById("btnOpenMobile").href = mobileUrl;

  document.getElementById("tvUrlInput").value = tvUrl;
  document.getElementById("btnOpenTv").href = tvUrl;

  const randomId = "ABC #" + Math.floor(1000 + Math.random() * 9000);
  document.getElementById("lunaCurrentId").innerText = randomId;

  // Hiển thị thông tin tài khoản nếu có
  if (data.accountDetails) {
    document.getElementById("credEmail").value = data.accountDetails.email || "—";
    document.getElementById("credPassword").value = data.accountDetails.password || "—";
    document.getElementById("credProfile").value = data.accountDetails.profile || "Hồ sơ cá nhân";
    document.getElementById("credPin").value = data.accountDetails.pin || "Không có PIN";
    // Tự động mở tab Tài Khoản nếu là tài khoản Email/Pass
    if (data.accountDetails.email) {
      switchLoginMode("account");
    }
  } else {
    document.getElementById("credEmail").value = "Chưa cấu hình tài khoản dự phòng";
    document.getElementById("credPassword").value = "••••••••";
    document.getElementById("credProfile").value = "Hồ sơ chính";
    document.getElementById("credPin").value = "—";
    switchLoginMode("link");
  }
}

function switchLoginMode(mode) {
  const btnLink = document.getElementById("btnModeLink");
  const btnAcc = document.getElementById("btnModeAcc");
  const platformList = document.getElementById("lunaPlatformList");
  const credsBox = document.getElementById("accountCredsBox");

  if (mode === "link") {
    if (btnLink) btnLink.classList.add("active");
    if (btnAcc) btnAcc.classList.remove("active");
    if (platformList) platformList.classList.remove("hidden");
    if (credsBox) credsBox.classList.add("hidden");
  } else {
    if (btnAcc) btnAcc.classList.add("active");
    if (btnLink) btnLink.classList.remove("active");
    if (platformList) platformList.classList.add("hidden");
    if (credsBox) credsBox.classList.remove("hidden");
  }
}

function copyCred(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.select();
  navigator.clipboard.writeText(input.value);
  alert("Đã sao chép: " + input.value);
}

function copyPlatformUrl(inputId) {
  const input = document.getElementById(inputId);
  input.select();
  navigator.clipboard.writeText(input.value);
  alert("Đã sao chép link đăng nhập!");
}

function changeLunaId() {
  const newId = "ABC #" + Math.floor(1000 + Math.random() * 9000);
  document.getElementById("lunaCurrentId").innerText = newId;
  alert("Đã đổi sang ID mới: " + newId + " thành công!");
}

function resetKeyForm() {
  document.getElementById("keyForm").classList.remove("hidden");
  const card = document.getElementById("gatewayCard");
  if (card) card.style.maxWidth = "520px";
  document.getElementById("successCard").classList.add("hidden");
  document.getElementById("keyInput").value = "";
  document.getElementById("alertBox").classList.add("hidden");
}



function openAdminModal() {
  document.getElementById("adminModal").classList.remove("hidden");
  loadAdminOverview();
}

function closeAdminModal() {
  document.getElementById("adminModal").classList.add("hidden");
}

function switchAdminTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

  if (event && event.currentTarget) {
    event.currentTarget.classList.add("active");
  }
  const targetPane = document.getElementById("tab-" + tabName);
  if (targetPane) targetPane.classList.add("active");

  if (tabName === "overview" || tabName === "manage") {
    loadAdminOverview();
  }
}

async function loadAdminOverview() {
  if (!currentAdminToken) return;

  try {
    const res = await fetch("/api/admin/overview", {
      headers: { "Authorization": "Bearer " + currentAdminToken }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const setElemText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerText = val;
    };
    const setElemVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    setElemText("statTotal", data.stats.totalKeys);
    setElemText("statActive", data.stats.activeKeys);
    setElemText("statExpired", data.stats.expiredKeys);
    setElemText("statRevoked", data.stats.revokedKeys);

    setElemVal("sourceApiUrl", data.sourceConfig.apiUrl);
    setElemVal("sourceModalApiUrl", data.sourceConfig.apiUrl);

    const maskedKeyText = data.sourceConfig.sourceKeyMasked || "Chưa thiết lập";
    const updateTimeText = new Date(data.sourceConfig.updatedAt).toLocaleTimeString() + " " + new Date(data.sourceConfig.updatedAt).toLocaleDateString();

    setElemText("currentSavedKeyBadge", maskedKeyText + " (Đã bảo vệ AES-256)");
    setElemText("currentSavedModalKeyBadge", maskedKeyText + " (Đã bảo vệ AES-256)");
    setElemText("sourceLastUpdated", "Cập nhật lúc: " + updateTimeText);
    setElemText("sourceModalLastUpdated", "Cập nhật lúc: " + updateTimeText);
    setElemText("sourceStatusText", "API: " + data.sourceConfig.apiUrl + " • Key: " + maskedKeyText);


    cachedAdminKeys = data.keys || [];
    renderKeyTable(cachedAdminKeys);
    renderSavedAccounts(data.savedAccounts || []);
    renderSourceKeysTable(data.sourceKeysHistory || []);
    renderLogs(data.logs || []);

  } catch (err) {
    console.error("Lỗi tải Admin Overview:", err);
  }
}



function renderKeyTable(keys) {
  const tbody = document.getElementById("keyTableBody");
  tbody.innerHTML = "";

  if (keys.length === 0) {
    tbody.innerHTML = "<tr><td colspan='7' style='text-align: center; color: var(--text-muted); padding: 24px;'>Chưa có mã Key nào trong hệ thống.</td></tr>";
    return;
  }


  keys.forEach(k => {
    let statusBadge = "";
    if (k.status === "revoked") {
      statusBadge = "<span class='status-pill revoked'>Đã khóa</span>";
    } else if (k.isExpired) {
      statusBadge = "<span class='status-pill expired'>Hết hạn</span>";
    } else {
      statusBadge = "<span class='status-pill active'>Đang dùng</span>";
    }

    let expireText = "Chưa kích hoạt";
    if (k.expiresAt) {
      const expDate = new Date(k.expiresAt);
      expireText = expDate.getDate() + "/" + (expDate.getMonth()+1) + "/" + expDate.getFullYear() + " (" + k.daysRemaining + " ngày)";
    }

    let customBadge = k.hasCustomAccount ? " <span style='font-size: 10px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-weight: 700;'><i class='fa-solid fa-star'></i> Acc riêng</span>" : "";

    const tr = document.createElement("tr");
    tr.innerHTML = "<td><strong>" + k.displayPrefix + "</strong>" + customBadge + "</td>" +
      "<td>" + k.durationDays + " ngày</td>" +
      "<td>" + expireText + "</td>" +
      "<td>" + statusBadge + "</td>" +
      "<td>" + (k.useCount || 0) + " lần</td>" +
      "<td><span style='color: var(--text-muted); font-size: 12px;'>" + (k.note || "—") + "</span></td>" +
      "<td>" +
        "<button class='action-btn renew' title='Gia hạn thêm 30 ngày' onclick=\"renewKey('" + k.id + "')\"><i class='fa-solid fa-plus-circle'></i> +30d</button>" +
        "<button class='action-btn toggle' title='Khóa / Mở khóa Key' onclick=\"toggleKey('" + k.id + "')\"><i class='fa-solid fa-power-off'></i></button>" +
        "<button class='action-btn delete' title='Xóa Key vĩnh viễn' onclick=\"deleteKey('" + k.id + "')\"><i class='fa-solid fa-trash'></i></button>" +
      "</td>";
    tbody.appendChild(tr);
  });

}

function filterKeyTable() {
  const search = document.getElementById("tableSearch").value.toLowerCase();
  const filtered = cachedAdminKeys.filter(k => {
    const matchSearch = k.displayPrefix.toLowerCase().includes(search) || (k.note && k.note.toLowerCase().includes(search));
    let matchFilter = true;

    if (currentFilter === "active") matchFilter = k.status === "active" && !k.isExpired;
    if (currentFilter === "expired") matchFilter = k.isExpired;
    if (currentFilter === "revoked") matchFilter = k.status === "revoked";

    return matchSearch && matchFilter;
  });

  renderKeyTable(filtered);
}

function setTableFilter(filterType, btn) {
  currentFilter = filterType;
  document.querySelectorAll(".btn-filter").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  filterKeyTable();
}

async function handleCreateKeys(event) {
  event.preventDefault();
  const count = document.getElementById("createCount").value;
  const durationDays = document.getElementById("createDuration").value;
  const customKeyPrefix = document.getElementById("createPrefix").value;
  const activateOnFirstUse = document.getElementById("createActivationType").value === "true";
  const note = document.getElementById("createNote").value;

  const customKeyInput = document.getElementById("createCustomKey") || document.getElementById("createModalCustomKey");
  const customAccountInput = document.getElementById("createCustomAccount") || document.getElementById("createModalCustomAccount");

  const customRawKey = customKeyInput ? customKeyInput.value.trim() : "";
  const customAccount = customAccountInput ? customAccountInput.value.trim() : "";

  try {
    const res = await fetch("/api/admin/create-keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + currentAdminToken
      },
      body: JSON.stringify({ count, durationDays, customKeyPrefix, activateOnFirstUse, note, customRawKey, customAccount })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const rawKeysText = data.createdKeys.map(k => k.rawKey).join('\n');

    document.getElementById("createdKeysOutput").value = rawKeysText;
    document.getElementById("createdResultBox").classList.remove("hidden");

    if (customKeyInput) customKeyInput.value = "";
    if (customAccountInput) customAccountInput.value = "";

    loadAdminOverview();
    alert(data.message);

  } catch (err) {
    alert("Lỗi tạo Key: " + err.message);
  }
}


function copyCreatedKeys() {
  const textarea = document.getElementById("createdKeysOutput");
  textarea.select();
  navigator.clipboard.writeText(textarea.value);
  alert("Đã sao chép toàn bộ mã Key vào bộ nhớ tạm!");
}

async function toggleKey(keyId) {
  try {
    const res = await fetch("/api/admin/toggle-key", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentAdminToken },
      body: JSON.stringify({ keyId })
    });
    const data = await res.json();
    if (data.success) loadAdminOverview();
  } catch (err) { alert(err.message); }
}

async function renewKey(keyId) {
  try {
    const res = await fetch("/api/admin/renew-key", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentAdminToken },
      body: JSON.stringify({ keyId, extraDays: 30 })
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      loadAdminOverview();
    }
  } catch (err) { alert(err.message); }
}

async function deleteKey(keyId) {
  if (!confirm("Bạn có chắc chắn muốn xóa Key này vĩnh viễn?")) return;
  try {
    const res = await fetch("/api/admin/delete-key", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentAdminToken },
      body: JSON.stringify({ keyId })
    });
    const data = await res.json();
    if (data.success) loadAdminOverview();
  } catch (err) { alert(err.message); }
}

async function handleUpdateSource(event) {
  if (event && event.preventDefault) event.preventDefault();

  const apiUrlInput = document.getElementById("sourceApiUrl") || document.getElementById("sourceModalApiUrl");
  const sourceKeyInput = document.getElementById("sourceKeyInput") || document.getElementById("sourceModalKeyInput");

  const apiUrl = apiUrlInput ? apiUrlInput.value.trim() : "";
  const sourceKey = sourceKeyInput ? sourceKeyInput.value.trim() : "";

  if (!sourceKey && !apiUrl) {
    alert("Vui lòng nhập Key nguồn Lunakey mới!");
    return;
  }

  try {
    const res = await fetch("/api/admin/update-source", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentAdminToken },
      body: JSON.stringify({ apiUrl, sourceKey })
    });
    const data = await res.json();
    if (data.success) {
      alert("✅ " + data.message);
      if (document.getElementById("sourceKeyInput")) document.getElementById("sourceKeyInput").value = "";
      if (document.getElementById("sourceModalKeyInput")) document.getElementById("sourceModalKeyInput").value = "";
      loadAdminOverview();
    } else {
      throw new Error(data.error || "Không thể cập nhật");
    }
  } catch (err) { alert("Lỗi cập nhật nguồn: " + err.message); }
}

async function testSourceConnection() {
  const apiUrlInput = document.getElementById("sourceApiUrl") || document.getElementById("sourceModalApiUrl");
  const sourceKeyInput = document.getElementById("sourceKeyInput") || document.getElementById("sourceModalKeyInput");

  const apiUrl = apiUrlInput ? apiUrlInput.value.trim() : "";
  const sourceKey = sourceKeyInput ? sourceKeyInput.value.trim() : "";
  const resBox = document.getElementById("sourceTestResult");

  if (resBox) {
    resBox.className = "test-result-box";
    resBox.innerText = "Đang kiểm tra kết nối tới Máy chủ nguồn...";
    resBox.classList.remove("hidden");
  }


  try {
    const res = await fetch("/api/admin/test-source", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentAdminToken },
      body: JSON.stringify({ apiUrl, sourceKey })
    });
    const data = await res.json();

    if (resBox) {
      if (data.success) {
        resBox.style.background = "rgba(34, 197, 94, 0.15)";
        resBox.style.color = "#4ade80";
        resBox.innerText = "✅ Kết nối thành công! Key nguồn hoạt động tốt.";
      } else {
        resBox.style.background = "rgba(239, 68, 68, 0.15)";
        resBox.style.color = "#f87171";
        resBox.innerText = "❌ Kết nối thất bại: " + (data.error || "Key nguồn không hợp lệ hoặc bị chặn!");
      }
    }
  } catch (err) {
    if (resBox) {
      resBox.style.background = "rgba(239, 68, 68, 0.15)";
      resBox.style.color = "#f87171";
      resBox.innerText = "❌ Lỗi mạng: " + err.message;
    }
  }
}


function renderLogs(logs) {
  const logsList = document.getElementById("logsList");
  logsList.innerHTML = "";

  if (logs.length === 0) {
    logsList.innerHTML = "<p style='color: var(--text-muted); font-size: 13px;'>Chưa có nhật ký truy cập.</p>";
    return;
  }

  logs.forEach(l => {
    const div = document.createElement("div");
    div.className = "log-item " + (l.success ? "success" : "failed");
    div.innerHTML = "<div><strong>" + (l.success ? "✅ Thành công" : "❌ Thất bại") + ":</strong> " + l.message +
      "<span style='color: var(--text-muted); font-size: 11px; margin-left: 8px;'>(IP: " + l.ip + ")</span></div>" +
      "<div style='color: var(--text-muted);'>" + new Date(l.timestamp).toLocaleTimeString() + "</div>";
    logsList.appendChild(div);
  });
}

async function handleConvertAccount(event) {
  if (event && event.preventDefault) event.preventDefault();
  const input = document.getElementById("convertInput").value.trim();
  if (!input) return;

  try {
    const res = await fetch("/api/admin/convert-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + currentAdminToken
      },
      body: JSON.stringify({ input })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const titleElem = document.getElementById("convResultTitle");
    const accountCard = document.getElementById("convAccountCard");
    const platformList = document.getElementById("convPlatformList");

    if (data.isCredentials) {
      if (titleElem) titleElem.innerHTML = "<i class='fa-solid fa-user-check'></i> THÔNG TIN TÀI KHOẢN ĐĂNG NHẬP (EMAIL / PASS / PIN)";
      if (accountCard) accountCard.classList.remove("hidden");
      if (platformList) platformList.classList.add("hidden");

      document.getElementById("convAccEmail").value = data.account.email || "—";
      document.getElementById("convAccPassword").value = data.account.password || "—";
      document.getElementById("convAccProfile").value = data.account.profile || "Hồ sơ cá nhân";
      document.getElementById("convAccPin").value = data.account.pin || "Không có PIN";
    } else {
      if (titleElem) titleElem.innerHTML = "<i class='fa-solid fa-circle-check'></i> BỘ 3 LINK ĐĂNG NHẬP TỰ ĐỘNG (PC / MOBILE / TV)";
      if (accountCard) accountCard.classList.add("hidden");
      if (platformList) platformList.classList.remove("hidden");

      document.getElementById("convPcUrl").value = data.pcUrl;
      document.getElementById("convBtnPc").href = data.pcUrl;

      document.getElementById("convMobileUrl").value = data.mobileUrl;
      document.getElementById("convBtnMobile").href = data.mobileUrl;

      document.getElementById("convTvUrl").value = data.tvUrl;
      document.getElementById("convBtnTv").href = data.tvUrl;
    }

    document.getElementById("convertResultBox").classList.remove("hidden");
    loadAdminOverview();
    alert("✅ " + data.message);

  } catch (err) {
    alert("Lỗi chuyển đổi: " + err.message);
  }
}


function renderSavedAccounts(accounts) {
  const tbody = document.getElementById("savedAccountsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!accounts || accounts.length === 0) {
    tbody.innerHTML = "<tr><td colspan='6' style='text-align: center; color: var(--text-muted); padding: 20px;'>Chưa có tài khoản nào được lưu trong kho.</td></tr>";
    return;
  }

  accounts.forEach(a => {
    const timeStr = new Date(a.createdAt).toLocaleTimeString() + " " + new Date(a.createdAt).toLocaleDateString();
    const emailDisplay = a.email ? ("<strong style='color: #f1f5f9;'>" + a.email + "</strong>") : "<span style='color: var(--text-muted);'>Mã Token Link</span>";
    const passDisplay = a.password ? a.password : "—";
    const profilePin = (a.profile || "Chính") + (a.pin ? (" <span style='color: #eab308;'>(PIN: " + a.pin + ")</span>") : "");
    const rawToUse = a.email ? (a.email + " | " + a.password + " | " + (a.profile || "Hồ sơ") + (a.pin ? (" | " + a.pin) : "")) : a.pcUrl;

    const tr = document.createElement("tr");
    tr.innerHTML = "<td><span style='font-size: 11px; color: var(--text-muted);'>" + timeStr + "</span></td>" +
      "<td>" + emailDisplay + "</td>" +
      "<td><code style='color: #38bdf8; font-size: 12px;'>" + passDisplay + "</code></td>" +
      "<td><span style='font-size: 12px;'>" + profilePin + "</span></td>" +
      "<td>" +
        (a.pcUrl ? "<a href='" + a.pcUrl + "' target='_blank' style='font-size: 11px; color: #4ade80; text-decoration: underline; margin-right: 6px;'>[Mở PC]</a>" : "") +
        (a.mobileUrl ? "<a href='" + a.mobileUrl + "' target='_blank' style='font-size: 11px; color: #38bdf8; text-decoration: underline;'>[Mobile]</a>" : "") +
      "</td>" +
      "<td>" +
        "<button class='action-btn renew' title='Tạo Key khách cho Acc này' onclick=\"useSavedAccountForNewKey('" + encodeURIComponent(rawToUse) + "')\"><i class='fa-solid fa-wand-magic-sparkles'></i> Tạo Key</button>" +
        "<button class='action-btn delete' title='Xóa khỏi kho' onclick=\"deleteSavedAccount('" + a.id + "')\"><i class='fa-solid fa-trash'></i></button>" +
      "</td>";
    tbody.appendChild(tr);
  });
}

async function deleteSavedAccount(accountId) {
  if (!confirm("Bạn có chắc chắn muốn xóa tài khoản này khỏi kho lưu trữ?")) return;
  try {
    const res = await fetch("/api/admin/delete-saved-account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentAdminToken },
      body: JSON.stringify({ accountId })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    loadAdminOverview();
    alert("Đã xóa khỏi kho lưu trữ!");
  } catch (err) {
    alert("Lỗi xóa: " + err.message);
  }
}

function useSavedAccountForNewKey(rawEncoded) {
  const raw = decodeURIComponent(rawEncoded);
  const customAccInput = document.getElementById("createCustomAccount") || document.getElementById("createModalCustomAccount");
  if (customAccInput) customAccInput.value = raw;
  if (typeof switchTab === "function") switchTab("create");
  if (typeof switchAdminTab === "function") switchAdminTab("create");
  alert("Đã chuyển tài khoản sang form Tạo Key! Bạn chỉ cần điền hạn dùng rồi bấm 'LƯU & TẠO KEY NGAY'.");
}

function renderSourceKeysTable(history) {
  const tbody = document.getElementById("sourceKeysTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!history || history.length === 0) {
    tbody.innerHTML = "<tr><td colspan='5' style='text-align: center; color: var(--text-muted); padding: 16px;'>Chưa có lịch sử Key nguồn nào được lưu.</td></tr>";
    return;
  }

  history.forEach(k => {
    let statusBadge = "";
    if (k.isCurrent && k.status === "active") {
      statusBadge = "<span class='status-pill active' style='background: rgba(34, 197, 94, 0.2); color: #4ade80;'><i class='fa-solid fa-circle-check'></i> Đang phát luồng</span>";
    } else if (k.status === "expired") {
      statusBadge = "<span class='status-pill revoked' style='background: rgba(239, 68, 68, 0.2); color: #f87171;' title='" + (k.errorReason || "Key đã hết hạn") + "'><i class='fa-solid fa-triangle-exclamation'></i> Vô hiệu hóa (Hết hạn)</span>";
    } else {
      statusBadge = "<span class='status-pill expired' style='background: rgba(148, 163, 184, 0.2); color: #94a3b8;'><i class='fa-solid fa-clock'></i> Dự phòng</span>";
    }

    const addedTime = new Date(k.addedAt).toLocaleTimeString() + " " + new Date(k.addedAt).toLocaleDateString();
    const testedTime = k.lastTestedAt ? (new Date(k.lastTestedAt).toLocaleTimeString() + " " + new Date(k.lastTestedAt).toLocaleDateString()) : "Chưa test";

    const tr = document.createElement("tr");
    tr.innerHTML = "<td><strong style='font-family: monospace; font-size: 13px; color: #f8fafc;'>" + k.displayKey + "</strong>" + (k.isCurrent ? " <span style='font-size: 10px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 2px 6px; border-radius: 4px;'>Đang chọn</span>" : "") + "</td>" +
      "<td>" + statusBadge + (k.errorReason ? ("<br><small style='color: #f87171; font-size: 10px;'>" + k.errorReason + "</small>") : "") + "</td>" +
      "<td><span style='font-size: 11px; color: var(--text-muted);'>" + addedTime + "</span></td>" +
      "<td><span style='font-size: 11px; color: var(--text-muted);'>" + testedTime + "</span></td>" +
      "<td>" +
        (!k.isCurrent ? "<button class='action-btn renew' title='Kích hoạt làm Key chính' onclick=\"activateSourceKey('" + k.id + "')\"><i class='fa-solid fa-bolt'></i> Dùng key này</button>" : "<span style='font-size: 11px; color: #4ade80; font-weight: 700;'><i class='fa-solid fa-check'></i> Đang dùng</span> ") +
        "<button class='action-btn delete' title='Xóa khỏi lịch sử' onclick=\"deleteSourceKey('" + k.id + "')\"><i class='fa-solid fa-trash'></i></button>" +
      "</td>";
    tbody.appendChild(tr);
  });
}

async function activateSourceKey(keyId) {
  try {
    const res = await fetch("/api/admin/activate-source-key", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentAdminToken },
      body: JSON.stringify({ keyId })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    loadAdminOverview();
    alert("✅ " + data.message);
  } catch (err) {
    alert("Lỗi kích hoạt: " + err.message);
  }
}

async function deleteSourceKey(keyId) {
  if (!confirm("Bạn có chắc chắn muốn xóa Key nguồn này khỏi danh sách?")) return;
  try {
    const res = await fetch("/api/admin/delete-source-key", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + currentAdminToken },
      body: JSON.stringify({ keyId })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    loadAdminOverview();
    alert("Đã xóa khỏi danh sách!");
  } catch (err) {
    alert("Lỗi xóa: " + err.message);
  }
}


