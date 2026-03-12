(() => {
  const state = {
    user: null,
    csrfToken: "",
    activeTab: "dashboard",
    dashboard: null,
    content: null,
    ui: null,
    messages: [],
    users: [],
    activity: [],
    totpSetup: null
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheDom();
    bindEvents();
    await restoreSession();
  }

  function cacheDom() {
    dom.alert = document.getElementById("adminAlert");
    dom.authView = document.getElementById("authView");
    dom.appView = document.getElementById("appView");
    dom.hero = document.getElementById("adminHero");
    dom.tabs = document.getElementById("adminTabs");
    dom.panels = document.getElementById("adminPanels");
  }

  function bindEvents() {
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
  }

  async function restoreSession() {
    try {
      const session = await api("/api/auth/session");
      if (!session.authenticated) {
        resetState();
        render();
        return;
      }
      state.user = session.user;
      state.csrfToken = session.csrfToken;
      await loadAppData();
    } catch (error) {
      showAlert(error.message, "error");
      resetState();
    }
    render();
  }

  async function loadAppData() {
    const loaders = [
      api("/api/admin/dashboard"),
      api("/api/admin/content"),
      api("/api/admin/messages"),
      api("/api/admin/activity")
    ];

    if (isAdmin()) {
      loaders.push(api("/api/admin/ui"));
      loaders.push(api("/api/admin/users"));
    }

    const results = await Promise.all(loaders);
    state.dashboard = results[0];
    state.content = results[1];
    state.messages = results[2];
    state.activity = results[3];
    state.ui = isAdmin() ? results[4] : null;
    state.users = isAdmin() ? results[5] : [];
  }

  function render() {
    if (!state.user) {
      dom.authView.hidden = false;
      dom.appView.hidden = true;
      dom.authView.innerHTML = renderAuthCard();
      return;
    }

    dom.authView.hidden = true;
    dom.appView.hidden = false;
    dom.hero.innerHTML = renderHero();
    dom.tabs.innerHTML = availableTabs()
      .map((tab) => `<button class="admin-tab${state.activeTab === tab.id ? " is-active" : ""}" type="button" data-tab="${tab.id}" role="tab" aria-selected="${state.activeTab === tab.id}">${escapeHtml(tab.label)}</button>`)
      .join("");
    dom.panels.innerHTML = availableTabs()
      .map((tab) => `<section class="section-shell admin-panel${state.activeTab === tab.id ? " is-active" : ""}" data-panel="${tab.id}" role="tabpanel">${renderPanel(tab.id)}</section>`)
      .join("");
  }

  function renderAuthCard() {
    return `
      <p class="section-kicker">Secure Access</p>
      <h1 class="section-title">NCCC CMS Login</h1>
      <p class="section-summary">This workspace controls public portal content, interface strings, contact messages, and user access.</p>
      <form class="admin-auth__form" id="loginForm">
        <label class="form-field">
          <span class="field-label">Username</span>
          <input name="username" type="text" autocomplete="username" required>
        </label>
        <label class="form-field">
          <span class="field-label">Password</span>
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <label class="form-field">
          <span class="field-label">2FA code</span>
          <input name="totp" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="Required after TOTP is enabled">
        </label>
        <div class="admin-inline-actions">
          <button class="button button-primary" type="submit">Sign in</button>
          <a class="button button-secondary" href="/">Back to portal</a>
        </div>
      </form>
      <div class="admin-note">
        <strong>Local backend note</strong>
        <p>On first start the server seeds a local admin account. Use the credentials printed by the server process, then enable 2FA from the Security tab.</p>
      </div>
    `;
  }

  function renderHero() {
    return `
      <div class="admin-hero__meta">
        <p class="section-kicker">Authenticated Session</p>
        <h1 class="section-title">Content Operations</h1>
        <div class="admin-meta">
          <span class="admin-badge">${escapeHtml(state.user.role)}</span>
          <span>${escapeHtml(state.user.name)}</span>
          <span>${escapeHtml(state.user.email)}</span>
          <span>Last login: ${escapeHtml(formatDate(state.user.lastLoginAt))}</span>
        </div>
        <p class="section-summary">Edits made here are persisted server-side and written back into the portal JSON content files.</p>
      </div>
      <div class="admin-hero__actions">
        <button class="button button-secondary" type="button" id="refreshButton">Refresh data</button>
        <button class="button button-primary" type="button" id="logoutButton">Sign out</button>
      </div>
    `;
  }

  function availableTabs() {
    const tabs = [
      { id: "dashboard", label: "Dashboard" },
      { id: "content", label: "Site content" },
      { id: "messages", label: "Messages" },
      { id: "activity", label: "Activity" }
    ];

    if (isAdmin()) {
      tabs.splice(2, 0, { id: "ui", label: "Interface strings" });
      tabs.push({ id: "users", label: "Users" });
      tabs.push({ id: "security", label: "Security" });
    }

    return tabs;
  }

  function renderPanel(id) {
    if (id === "dashboard") return renderDashboardPanel();
    if (id === "content") return renderContentPanel();
    if (id === "ui") return renderUiPanel();
    if (id === "messages") return renderMessagesPanel();
    if (id === "users") return renderUsersPanel();
    if (id === "security") return renderSecurityPanel();
    return renderActivityPanel();
  }

  function renderDashboardPanel() {
    const counts = state.dashboard?.counts || {};
    const metrics = [
      { label: "News", value: counts.news || 0 },
      { label: "Documents", value: counts.documents || 0 },
      { label: "Pages", value: counts.pages || 0 },
      { label: "Team", value: counts.team || 0 },
      { label: "Users", value: counts.users || 0 },
      { label: "New messages", value: counts.newMessages || 0 }
    ];

    return `
      <div class="admin-stack">
        <div class="admin-toolbar">
          <h2 class="admin-panel__title">Dashboard</h2>
          <span class="admin-status">Public content file: <span class="admin-code">assets/data/site-content.json</span></span>
        </div>
        <div class="admin-metric-grid">
          ${metrics.map((item) => `<article class="admin-metric"><strong>${escapeHtml(String(item.value))}</strong><span>${escapeHtml(item.label)}</span></article>`).join("")}
        </div>
        <div class="admin-grid">
          <article class="admin-card">
            <h3>Recent activity</h3>
            <div class="admin-list">
              ${(state.dashboard?.recentActivity || []).map(renderActivityItem).join("") || '<div class="admin-empty">No activity recorded yet.</div>'}
            </div>
          </article>
          <article class="admin-note">
            <h3>Current backend scope</h3>
            <p>This CMS phase uses session auth, hashed passwords, role checks, TOTP support, activity logs, contact message storage, and JSON-backed persistence.</p>
            <p>It is a practical local backend, not yet the final PostgreSQL-backed production architecture from the technical specification.</p>
          </article>
        </div>
      </div>
    `;
  }

  function renderContentPanel() {
    return `
      <div class="admin-stack">
        <div class="admin-toolbar">
          <h2 class="admin-panel__title">Site content JSON</h2>
          <span class="admin-status">Generated at: ${escapeHtml(state.content?.generatedAt || "n/a")}</span>
        </div>
        <form id="contentForm" class="admin-stack">
          <textarea class="admin-textarea" name="contentJson" spellcheck="false">${escapeHtml(JSON.stringify(state.content || {}, null, 2))}</textarea>
          <div class="admin-inline-actions">
            <button class="button button-primary" type="submit">Save content</button>
          </div>
        </form>
      </div>
    `;
  }

  function renderUiPanel() {
    return `
      <div class="admin-stack">
        <div class="admin-toolbar">
          <h2 class="admin-panel__title">Interface strings JSON</h2>
          <span class="admin-status">Admin only</span>
        </div>
        <form id="uiForm" class="admin-stack">
          <textarea class="admin-textarea" name="uiJson" spellcheck="false">${escapeHtml(JSON.stringify(state.ui || {}, null, 2))}</textarea>
          <div class="admin-inline-actions">
            <button class="button button-primary" type="submit">Save interface strings</button>
          </div>
        </form>
      </div>
    `;
  }

  function renderMessagesPanel() {
    return `
      <div class="admin-stack">
        <div class="admin-toolbar">
          <h2 class="admin-panel__title">Contact messages</h2>
          <span class="admin-status">${escapeHtml(String(state.messages.length))} stored messages</span>
        </div>
        <div class="admin-list">
          ${state.messages.length ? state.messages.map(renderMessageItem).join("") : '<div class="admin-empty">No contact messages yet.</div>'}
        </div>
      </div>
    `;
  }

  function renderUsersPanel() {
    return `
      <div class="admin-stack">
        <div class="admin-toolbar">
          <h2 class="admin-panel__title">Users</h2>
          <span class="admin-status">Admin only</span>
        </div>
        <article class="admin-card">
          <h3>Create user</h3>
          <form id="createUserForm" class="admin-inline-form">
            <label class="form-field">
              <span class="field-label">Username</span>
              <input name="username" type="text" required>
            </label>
            <label class="form-field">
              <span class="field-label">Name</span>
              <input name="name" type="text" required>
            </label>
            <label class="form-field">
              <span class="field-label">Email</span>
              <input name="email" type="email" required>
            </label>
            <label class="form-field">
              <span class="field-label">Role</span>
              <select name="role">
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label class="form-field">
              <span class="field-label">Temporary password</span>
              <input name="password" type="text" required>
            </label>
            <button class="button button-primary" type="submit">Create user</button>
          </form>
        </article>
        <div class="admin-list">
          ${state.users.map(renderUserItem).join("")}
        </div>
      </div>
    `;
  }

  function renderSecurityPanel() {
    const setup = state.totpSetup;
    const summary = state.user.totpEnabled
      ? "<p>Two-factor authentication is active for this admin account.</p>"
      : "<p>Two-factor authentication is not enabled yet. Generate a secret, scan it in your authenticator app, then verify one code.</p>";

    return `
      <div class="admin-stack">
        <div class="admin-toolbar">
          <h2 class="admin-panel__title">Security</h2>
          <span class="admin-status">TOTP setup for admin accounts</span>
        </div>
        <article class="admin-card">
          <h3>Two-factor authentication</h3>
          ${summary}
          ${state.user.totpEnabled ? '<div class="admin-badge">2FA enabled</div>' : '<button class="button button-primary" type="button" id="totpStartButton">Generate TOTP secret</button>'}
        </article>
        ${setup ? `
          <article class="admin-card">
            <h3>Verify TOTP setup</h3>
            <div class="admin-grid">
              <div class="admin-stack">
                <img class="admin-qr" src="${escapeHtml(setup.qrDataUrl)}" alt="TOTP QR code">
                <div class="admin-status">Manual key: <span class="admin-code">${escapeHtml(setup.manualKey)}</span></div>
              </div>
              <form id="verifyTotpForm" class="admin-stack">
                <label class="form-field">
                  <span class="field-label">Authenticator code</span>
                  <input name="token" type="text" inputmode="numeric" required>
                </label>
                <button class="button button-primary" type="submit">Verify and enable</button>
              </form>
            </div>
          </article>
        ` : ""}
      </div>
    `;
  }

  function renderActivityPanel() {
    return `
      <div class="admin-stack">
        <div class="admin-toolbar">
          <h2 class="admin-panel__title">Activity log</h2>
          <span class="admin-status">${escapeHtml(String(state.activity.length))} entries</span>
        </div>
        <div class="admin-list">
          ${state.activity.length ? state.activity.map(renderActivityItem).join("") : '<div class="admin-empty">No activity yet.</div>'}
        </div>
      </div>
    `;
  }

  function renderMessageItem(item) {
    return `
      <article class="admin-message-card">
        <header>
          <div>
            <strong>${escapeHtml(item.topic)}</strong>
            <div class="admin-meta">
              <span>${escapeHtml(item.name)}</span>
              <span>${escapeHtml(item.email)}</span>
              <span>${escapeHtml(formatDate(item.createdAt))}</span>
            </div>
          </div>
          <span class="admin-badge">${escapeHtml(item.status)}</span>
        </header>
        <p>${escapeHtml(item.message)}</p>
        <form class="admin-inline-form" data-message-form data-message-id="${escapeHtml(item.id)}">
          <label class="form-field">
            <span class="field-label">Status</span>
            <select name="status">
              ${["new", "read", "answered", "archived"].map((status) => `<option value="${status}"${item.status === status ? " selected" : ""}>${status}</option>`).join("")}
            </select>
          </label>
          <button class="button button-secondary" type="submit">Update</button>
        </form>
      </article>
    `;
  }

  function renderUserItem(user) {
    return `
      <article class="admin-user-card">
        <header>
          <div>
            <strong>${escapeHtml(user.name)}</strong>
            <div class="admin-meta">
              <span>${escapeHtml(user.username)}</span>
              <span>${escapeHtml(user.email)}</span>
              <span>${escapeHtml(user.role)}</span>
            </div>
          </div>
          <div class="admin-inline-actions">
            <span class="admin-badge">${user.totpEnabled ? "2FA on" : "2FA off"}</span>
            ${user.lockUntil ? `<span class="admin-code">locked until ${escapeHtml(formatDate(user.lockUntil))}</span>` : ""}
          </div>
        </header>
        <form class="admin-inline-form" data-password-form data-user-id="${escapeHtml(user.id)}">
          <label class="form-field">
            <span class="field-label">New password</span>
            <input name="password" type="text" minlength="8" required>
          </label>
          <button class="button button-secondary" type="submit">Reset password</button>
        </form>
      </article>
    `;
  }

  function renderActivityItem(item) {
    return `
      <article class="admin-activity-card">
        <header>
          <strong>${escapeHtml(item.action)}</strong>
          <span class="admin-status">${escapeHtml(formatDate(item.createdAt))}</span>
        </header>
        <div class="admin-meta">
          <span>${escapeHtml(item.username || "system")}</span>
          <span>${escapeHtml(item.role || "n/a")}</span>
          <span>${escapeHtml(item.objectType || "n/a")}</span>
          <span>${escapeHtml(item.objectId || "n/a")}</span>
        </div>
      </article>
    `;
  }

  async function onClick(event) {
    const tab = event.target.closest("[data-tab]");
    if (tab) {
      state.activeTab = tab.dataset.tab;
      render();
      return;
    }

    if (event.target.closest("#logoutButton")) {
      await api("/api/auth/logout", { method: "POST" });
      resetState();
      render();
      showAlert("Signed out.", "success");
      return;
    }

    if (event.target.closest("#refreshButton")) {
      await withBusy(async () => {
        await loadAppData();
        render();
      });
      showAlert("Data refreshed.", "success");
      return;
    }

    if (event.target.closest("#totpStartButton")) {
      await withBusy(async () => {
        state.totpSetup = await api("/api/admin/totp/setup", { method: "POST" });
        state.activeTab = "security";
        render();
      });
      showAlert("TOTP secret generated. Scan the QR code and verify one code.", "success");
    }
  }

  async function onSubmit(event) {
    event.preventDefault();

    if (event.target.id === "loginForm") {
      const form = new FormData(event.target);
      await withBusy(async () => {
        const session = await api("/api/auth/login", {
          method: "POST",
          body: {
            username: form.get("username"),
            password: form.get("password"),
            totp: form.get("totp")
          }
        });
        state.user = session.user;
        state.csrfToken = session.csrfToken;
        await loadAppData();
        render();
      });
      showAlert("Authenticated successfully.", "success");
      return;
    }

    if (event.target.id === "contentForm") {
      const textarea = event.target.elements.contentJson;
      await saveJsonPayload("/api/admin/content", textarea.value, "Content updated.");
      return;
    }

    if (event.target.id === "uiForm") {
      const textarea = event.target.elements.uiJson;
      await saveJsonPayload("/api/admin/ui", textarea.value, "Interface strings updated.");
      return;
    }

    if (event.target.id === "createUserForm") {
      const form = new FormData(event.target);
      await withBusy(async () => {
        await api("/api/admin/users", {
          method: "POST",
          body: {
            username: form.get("username"),
            name: form.get("name"),
            email: form.get("email"),
            role: form.get("role"),
            password: form.get("password")
          }
        });
        event.target.reset();
        state.users = await api("/api/admin/users");
        render();
      });
      showAlert("User created.", "success");
      return;
    }

    if (event.target.matches("[data-message-form]")) {
      const form = new FormData(event.target);
      const id = event.target.dataset.messageId;
      await withBusy(async () => {
        await api(`/api/admin/messages/${id}`, {
          method: "PATCH",
          body: { status: form.get("status") }
        });
        state.messages = await api("/api/admin/messages");
        state.dashboard = await api("/api/admin/dashboard");
        render();
      });
      showAlert("Message status updated.", "success");
      return;
    }

    if (event.target.matches("[data-password-form]")) {
      const form = new FormData(event.target);
      const id = event.target.dataset.userId;
      await withBusy(async () => {
        await api(`/api/admin/users/${id}/password`, {
          method: "PATCH",
          body: { password: form.get("password") }
        });
        event.target.reset();
      });
      showAlert("Password reset.", "success");
      return;
    }

    if (event.target.id === "verifyTotpForm") {
      const form = new FormData(event.target);
      await withBusy(async () => {
        await api("/api/admin/totp/verify", {
          method: "POST",
          body: { token: form.get("token") }
        });
        state.totpSetup = null;
        await restoreSession();
      });
      showAlert("Two-factor authentication enabled.", "success");
    }
  }

  async function saveJsonPayload(url, raw, successMessage) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      showAlert(`Invalid JSON: ${error.message}`, "error");
      return;
    }

    await withBusy(async () => {
      const response = await api(url, { method: "PUT", body: parsed });
      if (url.endsWith("/content")) {
        state.content = parsed;
        state.content.generatedAt = response.generatedAt;
        state.dashboard = await api("/api/admin/dashboard");
      } else {
        state.ui = parsed;
      }
      render();
    });
    showAlert(successMessage, "success");
  }

  async function api(url, options = {}) {
    const method = options.method || "GET";
    const headers = {
      Accept: "application/json"
    };

    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      if (state.csrfToken) headers["x-csrf-token"] = state.csrfToken;
    }

    const response = await fetch(url, {
      method,
      headers,
      credentials: "same-origin",
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const text = await response.text();
    const payload = text ? safeJsonParse(text) : {};

    if (!response.ok) {
      throw new Error(payload?.error || `Request failed with ${response.status}`);
    }

    return payload;
  }

  async function withBusy(task) {
    try {
      clearAlert();
      await task();
    } catch (error) {
      showAlert(error.message, "error");
    }
  }

  function resetState() {
    state.user = null;
    state.csrfToken = "";
    state.dashboard = null;
    state.content = null;
    state.ui = null;
    state.messages = [];
    state.users = [];
    state.activity = [];
    state.totpSetup = null;
    state.activeTab = "dashboard";
  }

  function isAdmin() {
    return state.user?.role === "admin";
  }

  function showAlert(message, type) {
    dom.alert.hidden = false;
    dom.alert.textContent = message;
    dom.alert.style.borderColor = type === "error" ? "rgba(164, 58, 58, 0.2)" : "rgba(11, 107, 103, 0.24)";
    dom.alert.style.background = type === "error" ? "rgba(164, 58, 58, 0.08)" : "rgba(11, 107, 103, 0.08)";
    dom.alert.style.color = type === "error" ? "var(--signal-red)" : "var(--brand)";
  }

  function clearAlert() {
    dom.alert.hidden = true;
  }

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  function formatDate(value) {
    if (!value) return "n/a";
    return new Date(value).toLocaleString();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }
})();
