let currentAdminToken = null;
let cachedAdminKeys = [];
let currentFilter = "all";

function getAdminToken() {
  if (!currentAdminToken) {
    currentAdminToken = localStorage.getItem('netflix_admin_token');
  }
  return currentAdminToken;
}


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
      localStorage.setItem('netflix_admin_token', data.token);
      keyInput.value = "";
      window.location.href = "/admin";
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
  const keyForm = document.getElementById("keyForm");
  if (keyForm) keyForm.classList.add("hidden");

  const card = document.getElementById("gatewayCard");
  if (card) card.style.maxWidth = "640px";

  const successCard = document.getElementById("successCard");
  if (successCard) successCard.classList.remove("hidden");

  let baseTokenUrl = data.directUrl || "https://www.netflix.com/browse";
  let nftoken = "";

  if (baseTokenUrl.includes("nftoken=")) {
    nftoken = baseTokenUrl.split("nftoken=")[1].split("&")[0];
  } else if (baseTokenUrl.includes("token=")) {
    nftoken = baseTokenUrl.split("token=")[1].split("&")[0];
  }

  const pcUrl = nftoken ? ("https://www.netflix.com/browse?nftoken=" + nftoken) : baseTokenUrl;
  const mobileUrl = nftoken ? ("https://www.netflix.com/unsupported?nftoken=" + nftoken) : "https://www.netflix.com/unsupported";
  const tvUrl = nftoken ? ("https://www.netflix.com/tv2?nftoken=" + nftoken) : "https://www.netflix.com/tv2";

  const pcInput = document.getElementById("pcUrlInput");
  if (pcInput) pcInput.value = pcUrl;
  const btnPc = document.getElementById("btnOpenPc");
  if (btnPc) btnPc.href = pcUrl;

  const mobileInput = document.getElementById("mobileUrlInput");
  if (mobileInput) mobileInput.value = mobileUrl;
  const btnMobile = document.getElementById("btnOpenMobile");
  if (btnMobile) btnMobile.href = mobileUrl;

  const tvInput = document.getElementById("tvUrlInput");
  if (tvInput) tvInput.value = tvUrl;
  const btnTv = document.getElementById("btnOpenTv");
  if (btnTv) btnTv.href = tvUrl;

  const lunaCurrentId = document.getElementById("lunaCurrentId");
  if (lunaCurrentId) {
    const randomId = "ABC #" + Math.floor(1000 + Math.random() * 9000);
    lunaCurrentId.innerText = randomId;
  }

  const lunaPlan = document.getElementById("lunaPlan");
  if (lunaPlan) lunaPlan.innerText = data.plan || "Cao cấp";

  const lunaCountry = document.getElementById("lunaCountry");
  if (lunaCountry) lunaCountry.innerText = data.country || "KW";

  const lunaStreams = document.getElementById("lunaStreams");
  if (lunaStreams) lunaStreams.innerText = data.streams || "4";

  // Khi đã vào bên trong thành công -> Đổi banner thành Mua những tài khoản khác (bỏ chữ tiền tố)
  const shopPrefix = document.getElementById("shopPromoPrefix");
  if (shopPrefix) {
    shopPrefix.innerText = "";
    shopPrefix.style.display = "none";
  }
  const shopLink = document.getElementById("shopPromoLink");
  if (shopLink) {
    shopLink.innerHTML = '<i class="fa-solid fa-store"></i> Mua những tài khoản khác tại binhluu.ai.studio <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 11px;"></i>';
  }



  const credEmail = document.getElementById("credEmail");
  if (credEmail) {
    if (data.accountDetails) {
      credEmail.value = data.accountDetails.email || "—";
      const credPass = document.getElementById("credPassword");
      if (credPass) credPass.value = data.accountDetails.password || "—";
      const credProf = document.getElementById("credProfile");
      if (credProf) credProf.value = data.accountDetails.profile || "Hồ sơ cá nhân";
      const credPin = document.getElementById("credPin");
      if (credPin) credPin.value = data.accountDetails.pin || "Không có PIN";
      if (data.accountDetails.email) switchLoginMode("account");
    } else {
      credEmail.value = "Chưa cấu hình tài khoản dự phòng";
      const credPass = document.getElementById("credPassword");
      if (credPass) credPass.value = "••••••••";
      const credProf = document.getElementById("credProfile");
      if (credProf) credProf.value = "Hồ sơ chính";
      const credPin = document.getElementById("credPin");
      if (credPin) credPin.value = "—";
      switchLoginMode("link");
    }
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

  // Khôi phục banner ngoài màn hình nhập key
  const shopPrefix = document.getElementById("shopPromoPrefix");
  if (shopPrefix) {
    shopPrefix.innerText = "Chưa có mã Key?";
    shopPrefix.style.display = "inline";
  }
  const shopLink = document.getElementById("shopPromoLink");
  if (shopLink) {
    shopLink.innerHTML = '<i class="fa-solid fa-cart-shopping"></i> Mua Key tại binhluu.ai.studio <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 11px;"></i>';
  }
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

  if (typeof event !== "undefined" && event && event.currentTarget) {
    event.currentTarget.classList.add("active");
  }
  const targetPane = document.getElementById("tab-" + tabName);
  if (targetPane) targetPane.classList.add("active");

  if (tabName === "overview" || tabName === "manage") {
    loadAdminOverview();
  }
}


async function loadAdminOverview() {

  const token = getAdminToken();
  if (!token) return;

  try {
    const res = await fetch("/api/admin/overview", {
      headers: { "Authorization": "Bearer " + token }
    });
    const data = await res.json();
    if (!data.success) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('netflix_admin_token');
        currentAdminToken = null;
        const loginBox = document.getElementById('adminLoginBox');
        const dashView = document.getElementById('adminDashboardView');
        if (loginBox) loginBox.classList.remove('hidden');
        if (dashView) dashView.classList.add('hidden');
      }
      throw new Error(data.error);
    }

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
  if (!tbody) return;
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
  const searchElem = document.getElementById("tableSearch");
  const search = searchElem ? searchElem.value.toLowerCase() : "";
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
  if (btn) btn.classList.add("active");
  filterKeyTable();
}

async function handleCreateKeys(event) {
  if (event && event.preventDefault) event.preventDefault();

  const token = getAdminToken();
  if (!token) {
    alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!");
    window.location.reload();
    return;
  }

  const countElem = document.getElementById("createCount");
  const count = countElem ? parseInt(countElem.value) || 1 : 1;

  const durationElem = document.getElementById("createDuration");
  let durationDays = durationElem ? durationElem.value : 30;
  if (durationDays === "custom") {
    const customDaysInput = document.getElementById("createCustomDays");
    durationDays = customDaysInput && customDaysInput.value ? parseFloat(customDaysInput.value) : 30;
  } else {
    durationDays = parseFloat(durationDays) || 30;
  }

  const prefixElem = document.getElementById("createPrefix");
  const customKeyPrefix = prefixElem ? prefixElem.value.trim() : "NFLX-VIP";

  const actElem = document.getElementById("createActivationType");
  const activateOnFirstUse = actElem ? (actElem.value === "true") : true;

  const noteElem = document.getElementById("createNote");
  const note = noteElem ? noteElem.value.trim() : "";

  const customKeyInput = document.getElementById("createCustomKey") || document.getElementById("createModalCustomKey");
  const customAccountInput = document.getElementById("createCustomAccount") || document.getElementById("createModalCustomAccount");

  const customRawKey = customKeyInput ? customKeyInput.value.trim() : "";
  const customAccount = customAccountInput ? customAccountInput.value.trim() : "";

  const submitBtn = (event && event.target) ? event.target.querySelector("button[type='submit']") : document.querySelector("#createKeyForm button[type='submit']");
  const originalBtnHtml = submitBtn ? submitBtn.innerHTML : "";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang tạo Key...';
  }

  try {
    const res = await fetch("/api/admin/create-keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ count, durationDays, customKeyPrefix, activateOnFirstUse, note, customRawKey, customAccount })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Không thể tạo Key!");

    const rawKeysText = (data.createdKeys || []).map(k => k.rawKey).join('\n');

    const resultTextarea = document.getElementById("createdKeysOutput");
    const resultBox = document.getElementById("createdResultBox");
    if (resultTextarea) resultTextarea.value = rawKeysText;
    if (resultBox) {
      resultBox.classList.remove("hidden");
      resultBox.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (customKeyInput) customKeyInput.value = "";
    if (customAccountInput) customAccountInput.value = "";

    loadAdminOverview();
    alert(data.message || "Tạo Key thành công!");

  } catch (err) {
    alert("Lỗi tạo Key: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
  }
}

function copyCreatedKeys() {
  const textarea = document.getElementById("createdKeysOutput");
  if (!textarea) return;
  textarea.select();
  navigator.clipboard.writeText(textarea.value);
  alert("Đã sao chép toàn bộ mã Key vào bộ nhớ tạm!");
}

async function toggleKey(keyId) {
  const token = getAdminToken();
  if (!token) return alert("Vui lòng đăng nhập lại!");
  try {
    const res = await fetch("/api/admin/toggle-key", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ keyId })
    });
    const data = await res.json();
    if (data.success) loadAdminOverview();
  } catch (err) { alert(err.message); }
}

async function renewKey(keyId) {
  const token = getAdminToken();
  if (!token) return alert("Vui lòng đăng nhập lại!");
  try {
    const res = await fetch("/api/admin/renew-key", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
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
  const token = getAdminToken();
  if (!token) return alert("Vui lòng đăng nhập lại!");
  try {
    const res = await fetch("/api/admin/delete-key", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ keyId })
    });
    const data = await res.json();
    if (data.success) loadAdminOverview();
  } catch (err) { alert(err.message); }
}

async function handleUpdateSource(event) {
  if (event && event.preventDefault) event.preventDefault();

  const token = getAdminToken();
  if (!token) return alert("Vui lòng đăng nhập lại!");

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
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
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
  const token = getAdminToken();
  if (!token) return alert("Vui lòng đăng nhập lại!");

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
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ apiUrl, sourceKey })
    });
    const data = await res.json();
    if (resBox) {
      if (data.success) {
        resBox.className = "test-result-box success";
        resBox.innerText = "✅ " + data.message;
      } else {
        resBox.className = "test-result-box error";
        resBox.innerText = "❌ Lỗi: " + (data.error || "Không thể kết nối");
      }
    }
  } catch (err) {
    if (resBox) {
      resBox.className = "test-result-box error";
      resBox.innerText = "❌ Lỗi kết nối: " + err.message;
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

    const accCard = document.getElementById("convAccountCard");
    if (data.isCredentials) {
      if (accCard) accCard.classList.remove("hidden");
      document.getElementById("convAccEmail").innerText = data.email || "-";
      document.getElementById("convAccPassword").innerText = data.password || "-";
      document.getElementById("convAccProfile").innerText = data.profile || "Hồ sơ chính";
      document.getElementById("convAccPin").innerText = data.pin || "Không có PIN";
      
      const rawPayload = `${data.email} | ${data.password} | ${data.profile || 'Profile'} | ${data.pin || ''}`;
      document.getElementById("convBtnCreateKey").onclick = function() {
        useSavedAccountForNewKey(encodeURIComponent(rawPayload));
      };
    } else {
      if (accCard) accCard.classList.add("hidden");
    }

    document.getElementById("convPcUrl").value = data.pcUrl;
    document.getElementById("convBtnPc").href = data.pcUrl;

    document.getElementById("convMobileUrl").value = data.mobileUrl;
    document.getElementById("convBtnMobile").href = data.mobileUrl;

    document.getElementById("convTvUrl").value = data.tvUrl;
    document.getElementById("convBtnTv").href = data.tvUrl;

    document.getElementById("convertResultBox").classList.remove("hidden");
    loadAdminOverview();
    alert("✅ Đã phân tích tài khoản & lưu trữ vào kho thành công!");

  } catch (err) {
    alert("Lỗi chuyển đổi: " + err.message);
  }
}




function renderSavedAccounts(accounts) {
  const tbody = document.getElementById("savedAccountsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!accounts || accounts.length === 0) {
    tbody.innerHTML = "<tr><td colspan='4' style='text-align: center; color: var(--text-muted); padding: 24px;'>Chưa có link nào được lưu trong kho.</td></tr>";
    return;
  }

  accounts.forEach(a => {
    const timeStr = new Date(a.createdAt).toLocaleTimeString() + " " + new Date(a.createdAt).toLocaleDateString();
    const sourceDisplay = a.email 
      ? ("<div style='font-weight: 700; color: #f8fafc;'>" + a.email + "</div><small style='color: #94a3b8; font-size: 11px;'>Hồ sơ: " + (a.profile || "Chính") + (a.pin ? (" • PIN: " + a.pin) : "") + "</small>") 
      : ("<div style='font-family: monospace; color: #38bdf8; font-size: 12px; font-weight: 700;'>Mã Token Stream VIP</div>");
    
    const rawToUse = a.email ? (a.email + " | " + a.password + " | " + (a.profile || "Hồ sơ") + (a.pin ? (" | " + a.pin) : "")) : a.pcUrl;

    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid rgba(255, 255, 255, 0.06)";
    tr.innerHTML = "<td style='padding: 12px 16px;'><span style='font-size: 11px; color: var(--text-muted);'>" + timeStr + "</span></td>" +
      "<td style='padding: 12px 16px;'>" + sourceDisplay + "</td>" +
      "<td style='padding: 12px 16px;'>" +
        (a.pcUrl ? "<a href='" + a.pcUrl + "' target='_blank' style='font-size: 11px; background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); padding: 3px 8px; border-radius: 4px; text-decoration: none; font-weight: 700; margin-right: 6px;'><i class='fa-solid fa-laptop'></i> PC</a>" : "") +
        (a.mobileUrl ? "<a href='" + a.mobileUrl + "' target='_blank' style='font-size: 11px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 3px 8px; border-radius: 4px; text-decoration: none; font-weight: 700; margin-right: 6px;'><i class='fa-solid fa-mobile'></i> Mobile</a>" : "") +
        (a.tvUrl ? "<a href='" + a.tvUrl + "' target='_blank' style='font-size: 11px; background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); padding: 3px 8px; border-radius: 4px; text-decoration: none; font-weight: 700;'><i class='fa-solid fa-tv'></i> TV</a>" : "") +
      "</td>" +
      "<td style='padding: 12px 16px;'>" +
        "<button class='action-btn renew' title='Tạo Key khách cho Acc này' onclick=\"useSavedAccountForNewKey('" + encodeURIComponent(rawToUse) + "')\" style='margin-right: 6px;'><i class='fa-solid fa-wand-magic-sparkles'></i> Tạo Key</button>" +
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

async function downloadVaultBackup() {
  const token = getAdminToken();
  if (!token) return alert("Vui lòng đăng nhập lại!");
  try {
    const res = await fetch("/api/admin/backup-vault", {
      headers: { "Authorization": "Bearer " + token }
    });
    if (!res.ok) throw new Error("Lỗi tải bản sao lưu");
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data.vault || data, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "netflix_vault_backup_" + new Date().toISOString().slice(0,10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert("Lỗi sao lưu: " + err.message);
  }
}

async function handleRestoreVaultFile(event) {
  const token = getAdminToken();
  if (!token) return alert("Vui lòng đăng nhập lại!");
  const file = event.target.files[0];
  if (!file) return;

  if (!confirm("⚠️ Bạn có chắc chắn muốn phục hồi dữ liệu từ file '" + file.name + "'? Toàn bộ danh sách Key và Cấu hình nguồn sẽ được cập nhật lại!")) {
    event.target.value = "";
    return;
  }

  try {
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const vaultData = JSON.parse(e.target.result);
        const res = await fetch("/api/admin/restore-vault", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify({ vaultData })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        alert("🎉 Phục hồi dữ liệu thành công! Đang làm mới bảng điều khiển...");
        loadAdminOverview();
      } catch (parseErr) {
        alert("Lỗi đọc file: " + parseErr.message);
      }
    };
    reader.readAsText(file);
  } catch (err) {
    alert("Lỗi phục hồi: " + err.message);
  } finally {
    event.target.value = "";
  }
}

async function handlePurgeExpiredKeys() {
  if (!confirm("Bạn có chắc chắn muốn dọn dẹp và xóa sạch toàn bộ các Key đã hết hạn khỏi hệ thống?")) return;
  const token = getAdminToken();
  if (!token) return alert("Vui lòng đăng nhập lại!");
  try {
    const res = await fetch("/api/admin/purge-expired", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    alert(data.message);
    loadAdminOverview();
  } catch (err) {
    alert("Lỗi dọn dẹp: " + err.message);
  }
}


