const fs = require('fs');
const path = require('path');
const { encryptText, decryptText, hashClientKey, verifyClientKeyHash } = require('../config/security');

const DB_FILE_PATH = process.env.VERCEL 
  ? path.join('/tmp', 'vault.json') 
  : path.join(__dirname, '../../data/vault.json');

// Cấu trúc dữ liệu ban đầu
const defaultData = {
  sourceConfig: {
    apiUrl: process.env.LUNAKEY_API_URL || 'https://netflix.lunakey.net/api/get-link',
    encryptedKey: encryptText(process.env.MASTER_SOURCE_KEY || process.env.LUNAKEY_SOURCE_KEY || 'default_source_key'),
    updatedAt: new Date().toISOString(),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': 'https://netflix.lunakey.net/',
      'Origin': 'https://netflix.lunakey.net'
    }
  },
  clientKeys: [],
  accessLogs: []
};


class DatabaseManager {
  constructor() {
    this.data = this.loadData();
    // Tự động kéo dữ liệu từ Cloud Database khi khởi động nếu có cấu hình
    this.syncFromCloud();
  }

  loadData() {
    try {
      if (!fs.existsSync(DB_FILE_PATH)) {
        this.saveData(defaultData);
        return defaultData;
      }
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error('Lỗi khi đọc Database:', err.message);
      return defaultData;
    }
  }

  saveData(dataToSave = this.data) {
    try {
      const dir = path.dirname(DB_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(dataToSave, null, 2), 'utf8');
      // Đẩy sao lưu lên Cloud Database nếu có
      this.syncToCloud();
    } catch (err) {
      console.error('Lỗi khi ghi Database:', err.message);
    }
  }

  async syncFromCloud() {
    const cloudUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const cloudToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!cloudUrl || !cloudToken) return null;

    try {
      const res = await fetch(`${cloudUrl}/get/netflix_vault_data`, {
        headers: { Authorization: `Bearer ${cloudToken}` }
      });
      const json = await res.json();
      if (json && json.result) {
        const parsed = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
        if (parsed && parsed.clientKeys) {
          this.data = { ...defaultData, ...parsed };
          const dir = path.dirname(DB_FILE_PATH);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(DB_FILE_PATH, JSON.stringify(this.data, null, 2), 'utf8');
          console.log('✅ Đã đồng bộ thành công Két Dữ Liệu từ Cloud Database (Upstash Redis)!');
          return this.data;
        }
      }
    } catch (err) {
      console.warn('Lỗi đồng bộ từ Cloud Database:', err.message);
    }
    return null;
  }

  async syncToCloud() {
    const cloudUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const cloudToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!cloudUrl || !cloudToken) return;

    try {
      await fetch(`${cloudUrl}/set/netflix_vault_data`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cloudToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(this.data)
      });
    } catch (err) {
      console.warn('Lỗi ghi dữ liệu lên Cloud Database:', err.message);
    }
  }


  // --- SOURCE CONFIG ---
  getSourceConfig() {
    this.loadData();
    const decryptedKey = decryptText(this.data.sourceConfig.encryptedKey);

    return {
      apiUrl: this.data.sourceConfig.apiUrl,
      sourceKey: decryptedKey,
      updatedAt: this.data.sourceConfig.updatedAt
    };
  }

  updateSourceConfig(apiUrl, newSourceKey) {
    if (apiUrl) this.data.sourceConfig.apiUrl = apiUrl.trim();
    if (newSourceKey && newSourceKey.trim()) {
      const cleanKey = newSourceKey.trim();
      this.data.sourceConfig.encryptedKey = encryptText(cleanKey);
      this.data.sourceConfig.updatedAt = new Date().toISOString();

      if (!this.data.sourceKeysHistory) this.data.sourceKeysHistory = [];
      // Đặt tất cả key cũ thành standby nếu đang active
      this.data.sourceKeysHistory.forEach(k => {
        if (k.status === 'active') k.status = 'standby';
        k.isCurrent = false;
      });

      const displayKey = cleanKey.length > 8 
        ? (cleanKey.substring(0, 4) + '...' + cleanKey.substring(cleanKey.length - 4)) 
        : cleanKey;

      this.data.sourceKeysHistory.unshift({
        id: 'src_' + Date.now(),
        sourceKeyEncrypted: encryptText(cleanKey),
        displayKey: displayKey,
        status: 'active', // 'active' | 'expired' | 'standby'
        errorReason: null,
        addedAt: new Date().toISOString(),
        lastTestedAt: new Date().toISOString(),
        isCurrent: true
      });

      if (this.data.sourceKeysHistory.length > 50) this.data.sourceKeysHistory.pop();
    }
    this.saveData();
    return { success: true, updatedAt: this.data.sourceConfig.updatedAt };
  }

  markSourceKeyStatus(sourceKey, status = 'expired', errorReason = '') {
    if (!this.data.sourceKeysHistory) return;
    this.data.sourceKeysHistory.forEach(k => {
      try {
        const dec = decryptText(k.sourceKeyEncrypted);
        if (dec === sourceKey) {
          k.status = status;
          k.errorReason = errorReason;
          k.lastTestedAt = new Date().toISOString();
        }
      } catch {}
    });
    this.saveData();
  }

  getSourceKeysHistory() {
    this.loadData();
    if (!this.data.sourceKeysHistory) this.data.sourceKeysHistory = [];
    return this.data.sourceKeysHistory.map(k => ({
      id: k.id,
      displayKey: k.displayKey,
      status: k.status,
      errorReason: k.errorReason,
      addedAt: k.addedAt,
      lastTestedAt: k.lastTestedAt,
      isCurrent: !!k.isCurrent
    }));
  }

  activateSourceKey(id) {
    if (!this.data.sourceKeysHistory) return false;
    const target = this.data.sourceKeysHistory.find(k => k.id === id);
    if (!target) return false;

    this.data.sourceKeysHistory.forEach(k => {
      k.isCurrent = false;
      if (k.status === 'active') k.status = 'standby';
    });

    target.isCurrent = true;
    target.status = 'active';
    target.errorReason = null;
    target.lastTestedAt = new Date().toISOString();

    const rawKey = decryptText(target.sourceKeyEncrypted);
    this.data.sourceConfig.encryptedKey = encryptText(rawKey);
    this.data.sourceConfig.updatedAt = new Date().toISOString();
    this.saveData();
    return true;
  }

  deleteSourceKey(id) {
    if (!this.data.sourceKeysHistory) return false;
    const index = this.data.sourceKeysHistory.findIndex(k => k.id === id);
    if (index === -1) return false;
    this.data.sourceKeysHistory.splice(index, 1);
    this.saveData();
    return true;
  }


  // --- CLIENT KEY CREATION (ZERO-PLAINTEXT) ---
  createClientKey({ durationDays = 30, note = '', activateOnFirstUse = true, customKeyPrefix = 'NFLX', customRawKey = '', customAccount = '' }) {
    let rawKey = '';
    if (customRawKey && customRawKey.trim() !== '') {
      rawKey = customRawKey.trim().toUpperCase();
    } else {
      // Sinh Key ngẫu nhiên an toàn: VD: NFLX-9A7B-4E2C-8819
      const randomBlock = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
                          Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
                          Math.floor(1000 + Math.random() * 9000);
      rawKey = customKeyPrefix.trim().toUpperCase() + '-' + randomBlock;
    }

    // Băm mật mã một chiều - DB không lưu rawKey!
    const { hash, salt } = hashClientKey(rawKey);

    const now = new Date();
    let expiresAt = null;
    if (!activateOnFirstUse) {
      expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    }

    // Mã hóa thông tin Account/Link riêng nếu có
    const encryptedAccount = customAccount && customAccount.trim() !== '' 
      ? encryptText(customAccount.trim()) 
      : null;

    const keyRecord = {
      id: 'key_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      displayPrefix: rawKey.length > 8 ? (rawKey.substring(0, 8) + '****') : (rawKey.substring(0, 4) + '****'),
      keyHash: hash,
      salt: salt,
      encryptedAccount: encryptedAccount,
      durationDays: parseInt(durationDays),
      activateOnFirstUse: !!activateOnFirstUse,
      createdAt: now.toISOString(),
      activatedAt: activateOnFirstUse ? null : now.toISOString(),
      expiresAt: expiresAt,
      status: 'active', // 'active' | 'revoked'
      useCount: 0,
      lastUsedAt: null,
      note: note.trim()
    };

    this.data.clientKeys.unshift(keyRecord);
    this.saveData();

    // Trả về rawKey 1 LẦN DUY NHẤT để Admin copy
    return {
      rawKey: rawKey,
      keyRecord: keyRecord
    };
  }

  // --- CLIENT KEY VERIFICATION ---
  verifyAndConsumeKey(inputKey, clientIp = '') {
    this.loadData(); // Đảm bảo luôn đồng bộ dữ liệu mới nhất từ đĩa
    const trimmed = inputKey.trim();
    
    // Tìm trong danh sách hash
    const match = this.data.clientKeys.find(k => verifyClientKeyHash(trimmed, k.keyHash, k.salt));

    if (!match) {
      this.logAccess(null, clientIp, false, 'Key không tồn tại hoặc sai');
      return { success: false, reason: 'Mã Key không hợp lệ hoặc không tồn tại!' };
    }

    if (match.status === 'revoked') {
      this.logAccess(match.id, clientIp, false, 'Key đã bị Admin khóa');
      return { success: false, reason: 'Mã Key này đã bị tạm dừng hoặc thu hồi!' };
    }

    const now = new Date();

    // Kích hoạt lần đầu nếu chưa kích hoạt
    if (!match.activatedAt && match.activateOnFirstUse) {
      match.activatedAt = now.toISOString();
      match.expiresAt = new Date(now.getTime() + match.durationDays * 24 * 60 * 60 * 1000).toISOString();
    }

    // Kiểm tra hết hạn
    if (match.expiresAt && new Date(match.expiresAt) < now) {
      this.logAccess(match.id, clientIp, false, 'Key đã hết hạn');
      return { success: false, reason: 'Mã Key đã hết hạn sử dụng!' };
    }

    // Cập nhật thống kê
    match.useCount = (match.useCount || 0) + 1;
    match.lastUsedAt = now.toISOString();
    this.saveData();

    this.logAccess(match.id, clientIp, true, 'Kích hoạt / Lấy link thành công');

    // Giải mã Account/Link riêng nếu key này được gán riêng
    const customAccount = match.encryptedAccount ? decryptText(match.encryptedAccount) : null;

    return {
      success: true,
      keyId: match.id,
      customAccount: customAccount,
      expiresAt: match.expiresAt,
      daysRemaining: match.expiresAt ? Math.max(0, Math.ceil((new Date(match.expiresAt) - now) / (1000 * 60 * 60 * 24))) : match.durationDays
    };
  }


  // --- ADMIN MANAGEMENT ACTIONS ---
  getAllKeysForAdmin() {
    const now = new Date();
    return this.data.clientKeys.map(k => {
      let isExpired = false;
      let daysRemaining = null;
      if (k.expiresAt) {
        isExpired = new Date(k.expiresAt) < now;
        daysRemaining = Math.max(0, Math.ceil((new Date(k.expiresAt) - now) / (1000 * 60 * 60 * 24)));
      } else {
        daysRemaining = k.durationDays;
      }

      return {
        id: k.id,
        displayPrefix: k.displayPrefix,
        hasCustomAccount: !!k.encryptedAccount,
        durationDays: k.durationDays,
        activateOnFirstUse: k.activateOnFirstUse,
        createdAt: k.createdAt,
        activatedAt: k.activatedAt,
        expiresAt: k.expiresAt,
        status: k.status,
        isExpired: isExpired,
        daysRemaining: daysRemaining,
        useCount: k.useCount,
        lastUsedAt: k.lastUsedAt,
        note: k.note
      };

    });
  }

  toggleKeyStatus(keyId) {
    const key = this.data.clientKeys.find(k => k.id === keyId);
    if (!key) return null;
    key.status = key.status === 'active' ? 'revoked' : 'active';
    this.saveData();
    return key;
  }

  renewKey(keyId, extraDays = 30) {
    const key = this.data.clientKeys.find(k => k.id === keyId);
    if (!key) return null;

    const now = new Date();
    const baseTime = (key.expiresAt && new Date(key.expiresAt) > now) ? new Date(key.expiresAt) : now;
    key.expiresAt = new Date(baseTime.getTime() + extraDays * 24 * 60 * 60 * 1000).toISOString();
    key.durationDays = (key.durationDays || 0) + extraDays;
    key.status = 'active';
    this.saveData();
    return key;
  }

  deleteKey(keyId) {
    const index = this.data.clientKeys.findIndex(k => k.id === keyId);
    if (index === -1) return false;
    this.data.clientKeys.splice(index, 1);
    this.saveData();
    return true;
  }

  logAccess(keyId, ip, success, message) {
    this.data.accessLogs.unshift({
      timestamp: new Date().toISOString(),
      keyId: keyId || 'UNKNOWN',
      ip: ip || '127.0.0.1',
      success: !!success,
      message: message
    });
    if (this.data.accessLogs.length > 200) {
      this.data.accessLogs.pop();
    }
    this.saveData();
  }

  // --- SAVED ACCOUNTS & TOKENS LIBRARY ---
  saveAccountRecord({ inputRaw = '', email = '', password = '', profile = '', pin = '', pcUrl = '', mobileUrl = '', tvUrl = '', note = '' }) {
    if (!this.data.savedAccounts) this.data.savedAccounts = [];

    const record = {
      id: 'acc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      createdAt: new Date().toISOString(),
      email: email.trim(),
      profile: profile.trim(),
      pin: pin.trim(),
      note: note.trim(),
      // Mã hóa mật khẩu và full raw data bằng AES-256
      encryptedPassword: password ? encryptText(password.trim()) : null,
      encryptedInput: inputRaw ? encryptText(inputRaw.trim()) : null,
      pcUrl: pcUrl.trim(),
      mobileUrl: mobileUrl.trim(),
      tvUrl: tvUrl.trim()
    };

    this.data.savedAccounts.unshift(record);
    if (this.data.savedAccounts.length > 200) {
      this.data.savedAccounts.pop();
    }
    this.saveData();
    return record;
  }

  getSavedAccounts() {
    this.loadData();
    if (!this.data.savedAccounts) this.data.savedAccounts = [];

    return this.data.savedAccounts.map(a => {
      const password = a.encryptedPassword ? decryptText(a.encryptedPassword) : '';
      const inputRaw = a.encryptedInput ? decryptText(a.encryptedInput) : '';
      return {
        id: a.id,
        createdAt: a.createdAt,
        email: a.email,
        password: password,
        profile: a.profile,
        pin: a.pin,
        note: a.note,
        inputRaw: inputRaw,
        pcUrl: a.pcUrl,
        mobileUrl: a.mobileUrl,
        tvUrl: a.tvUrl
      };
    });
  }

  deleteSavedAccount(id) {
    if (!this.data.savedAccounts) return false;
    const index = this.data.savedAccounts.findIndex(a => a.id === id);
    if (index === -1) return false;
    this.data.savedAccounts.splice(index, 1);
    this.saveData();
    return true;
  }

  getLogs() {
    return this.data.accessLogs.slice(0, 50);
  }

  exportVaultData() {
    this.loadData();
    return this.data;
  }

  importVaultData(importedData) {
    if (!importedData || typeof importedData !== 'object') {
      throw new Error('Dữ liệu không hợp lệ!');
    }
    if (!importedData.clientKeys || !importedData.sourceConfig) {
      throw new Error('Cấu trúc file sao lưu không đúng định dạng!');
    }
    this.data = {
      ...defaultData,
      ...importedData
    };
    this.saveData(this.data);
    return true;
  }
}

module.exports = new DatabaseManager();


