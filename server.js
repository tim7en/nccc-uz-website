const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const SITE_CONTENT_FILE = path.join(ROOT, "assets", "data", "site-content.json");
const UI_FILE = path.join(ROOT, "assets", "data", "ui.json");
const STORAGE_DIR = path.join(ROOT, "server-data");
const USERS_FILE = path.join(STORAGE_DIR, "users.json");
const ACTIVITY_FILE = path.join(STORAGE_DIR, "activity-log.json");
const MESSAGES_FILE = path.join(STORAGE_DIR, "messages.json");

const AUTH_COOKIE = "nccc.sid";
const ONE_HOUR = 60 * 60 * 1000;
const EIGHT_HOURS = 8 * ONE_HOUR;
const THIRTY_MINUTES = 30 * 60 * 1000;

main().catch((error) => {
  console.error("[startup] fatal:", error);
  process.exit(1);
});

async function main() {
  await ensureStorage();

  const app = express();

  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      name: AUTH_COOKIE,
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: EIGHT_HOURS
      }
    })
  );

  const authLimiter = rateLimit({
    windowMs: ONE_HOUR,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many authentication attempts. Try again later." }
  });

  const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many contact requests. Try again later." }
  });

  app.get("/api/auth/session", requireAuthOptional, async (req, res) => {
    if (!req.currentUser) return res.json({ authenticated: false });
    ensureCsrf(req);
    res.json({
      authenticated: true,
      csrfToken: req.session.csrfToken,
      user: sanitizeUser(req.currentUser)
    });
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const totp = String(req.body.totp || "").trim();

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const users = await readJson(USERS_FILE, []);
    const user = users.find((item) => item.username.toLowerCase() === username);

    if (!user || !user.active) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    if (user.lockUntil && Date.now() < Date.parse(user.lockUntil)) {
      return res.status(423).json({ error: "Account temporarily locked after repeated failed attempts." });
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);

    if (!passwordOk) {
      user.failedAttempts = Number(user.failedAttempts || 0) + 1;
      if (user.failedAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + THIRTY_MINUTES).toISOString();
        user.failedAttempts = 0;
      }
      await writeJson(USERS_FILE, users);
      await appendActivity({
        userId: user.id,
        username: user.username,
        role: user.role,
        action: "login_failed",
        objectType: "auth",
        objectId: user.id,
        ip: getIp(req)
      });
      return res.status(401).json({ error: "Invalid credentials." });
    }

    if (user.totpEnabled) {
      const verified = speakeasy.totp.verify({
        secret: user.totpSecret,
        encoding: "base32",
        token: totp,
        window: 1
      });
      if (!verified) {
        return res.status(401).json({ error: "Invalid two-factor code." });
      }
    }

    user.failedAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date().toISOString();
    await writeJson(USERS_FILE, users);

    req.session.regenerate(async (error) => {
      if (error) return res.status(500).json({ error: "Could not start session." });
      req.session.userId = user.id;
      req.session.csrfToken = randomToken();
      await appendActivity({
        userId: user.id,
        username: user.username,
        role: user.role,
        action: "login_success",
        objectType: "auth",
        objectId: user.id,
        ip: getIp(req)
      });
      res.json({
        authenticated: true,
        csrfToken: req.session.csrfToken,
        user: sanitizeUser(user)
      });
    });
  });

  app.post("/api/auth/logout", requireAuthOptional, async (req, res) => {
    const currentUser = req.currentUser;
    req.session.destroy(async () => {
      if (currentUser) {
        await appendActivity({
          userId: currentUser.id,
          username: currentUser.username,
          role: currentUser.role,
          action: "logout",
          objectType: "auth",
          objectId: currentUser.id,
          ip: getIp(req)
        });
      }
      res.clearCookie(AUTH_COOKIE);
      res.json({ ok: true });
    });
  });

  app.get("/api/admin/dashboard", requireAuth, async (req, res) => {
    const [content, users, messages, activity] = await Promise.all([
      readJson(SITE_CONTENT_FILE, {}),
      readJson(USERS_FILE, []),
      readJson(MESSAGES_FILE, []),
      readJson(ACTIVITY_FILE, [])
    ]);

    res.json({
      counts: {
        news: Array.isArray(content.news) ? content.news.length : 0,
        documents: Array.isArray(content.documents) ? content.documents.length : 0,
        pages: 4,
        team: Array.isArray(content.team) ? content.team.length : 0,
        users: users.length,
        newMessages: messages.filter((item) => item.status === "new").length
      },
      recentActivity: activity
        .filter((item) => req.currentUser.role === "admin" || item.userId === req.currentUser.id)
        .slice(0, 12)
    });
  });

  app.get("/api/admin/content", requireAuth, async (_req, res) => {
    res.json(await readJson(SITE_CONTENT_FILE, {}));
  });

  app.put("/api/admin/content", requireAuth, requireCsrf, async (req, res) => {
    const payload = req.body;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({ error: "Content payload must be a JSON object." });
    }
    payload.generatedAt = new Date().toISOString().slice(0, 10);
    await writeJson(SITE_CONTENT_FILE, payload);
    await appendActivity({
      userId: req.currentUser.id,
      username: req.currentUser.username,
      role: req.currentUser.role,
      action: "content_updated",
      objectType: "site-content",
      objectId: "assets/data/site-content.json",
      ip: getIp(req)
    });
    res.json({ ok: true, generatedAt: payload.generatedAt });
  });

  app.get("/api/admin/ui", requireAuth, requireRole("admin"), async (_req, res) => {
    res.json(await readJson(UI_FILE, {}));
  });

  app.put("/api/admin/ui", requireAuth, requireRole("admin"), requireCsrf, async (req, res) => {
    const payload = req.body;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({ error: "UI payload must be a JSON object." });
    }
    await writeJson(UI_FILE, payload);
    await appendActivity({
      userId: req.currentUser.id,
      username: req.currentUser.username,
      role: req.currentUser.role,
      action: "ui_updated",
      objectType: "ui-content",
      objectId: "assets/data/ui.json",
      ip: getIp(req)
    });
    res.json({ ok: true });
  });

  app.get("/api/admin/messages", requireAuth, async (_req, res) => {
    res.json(await readJson(MESSAGES_FILE, []));
  });

  app.patch("/api/admin/messages/:id", requireAuth, requireCsrf, async (req, res) => {
    const messages = await readJson(MESSAGES_FILE, []);
    const message = messages.find((item) => item.id === req.params.id);
    if (!message) return res.status(404).json({ error: "Message not found." });
    const nextStatus = String(req.body.status || "").trim().toLowerCase();
    if (!["new", "read", "answered", "archived"].includes(nextStatus)) {
      return res.status(400).json({ error: "Invalid message status." });
    }
    message.status = nextStatus;
    message.updatedAt = new Date().toISOString();
    await writeJson(MESSAGES_FILE, messages);
    await appendActivity({
      userId: req.currentUser.id,
      username: req.currentUser.username,
      role: req.currentUser.role,
      action: "message_status_updated",
      objectType: "message",
      objectId: message.id,
      ip: getIp(req)
    });
    res.json({ ok: true, message });
  });

  app.post("/api/public/contact", contactLimiter, async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim();
    const topic = String(req.body.topic || "").trim();
    const message = String(req.body.message || "").trim();

    if (!name || !email || !topic || !message) {
      return res.status(400).json({ error: "All contact fields are required." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    const messages = await readJson(MESSAGES_FILE, []);
    const item = {
      id: `msg-${crypto.randomUUID()}`,
      name,
      email,
      topic,
      message,
      status: "new",
      createdAt: new Date().toISOString(),
      updatedAt: null
    };
    messages.unshift(item);
    await writeJson(MESSAGES_FILE, messages);
    await appendActivity({
      userId: "public",
      username: "public",
      role: "public",
      action: "message_created",
      objectType: "message",
      objectId: item.id,
      ip: getIp(req)
    });
    res.status(201).json({ ok: true });
  });

  app.get("/api/admin/users", requireAuth, requireRole("admin"), async (_req, res) => {
    const users = await readJson(USERS_FILE, []);
    res.json(users.map(sanitizeUser));
  });

  app.post("/api/admin/users", requireAuth, requireRole("admin"), requireCsrf, async (req, res) => {
    const username = String(req.body.username || "").trim().toLowerCase();
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim();
    const role = String(req.body.role || "").trim();
    const password = String(req.body.password || "");

    if (!username || !name || !email || !password) {
      return res.status(400).json({ error: "Username, name, email, and password are required." });
    }

    if (!["admin", "moderator"].includes(role)) {
      return res.status(400).json({ error: "Role must be admin or moderator." });
    }

    const users = await readJson(USERS_FILE, []);
    if (users.some((item) => item.username.toLowerCase() === username)) {
      return res.status(409).json({ error: "User already exists." });
    }

    const user = {
      id: `usr-${crypto.randomUUID()}`,
      username,
      name,
      email,
      role,
      active: true,
      passwordHash: await bcrypt.hash(password, 12),
      totpEnabled: false,
      totpSecret: null,
      failedAttempts: 0,
      lockUntil: null,
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    };
    users.push(user);
    await writeJson(USERS_FILE, users);
    await appendActivity({
      userId: req.currentUser.id,
      username: req.currentUser.username,
      role: req.currentUser.role,
      action: "user_created",
      objectType: "user",
      objectId: user.id,
      ip: getIp(req)
    });
    res.status(201).json({ ok: true, user: sanitizeUser(user) });
  });

  app.patch("/api/admin/users/:id/password", requireAuth, requireRole("admin"), requireCsrf, async (req, res) => {
    const password = String(req.body.password || "");
    if (!password || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long." });
    }
    const users = await readJson(USERS_FILE, []);
    const user = users.find((item) => item.id === req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    user.passwordHash = await bcrypt.hash(password, 12);
    user.failedAttempts = 0;
    user.lockUntil = null;
    await writeJson(USERS_FILE, users);
    await appendActivity({
      userId: req.currentUser.id,
      username: req.currentUser.username,
      role: req.currentUser.role,
      action: "password_reset",
      objectType: "user",
      objectId: user.id,
      ip: getIp(req)
    });
    res.json({ ok: true });
  });

  app.get("/api/admin/activity", requireAuth, async (req, res) => {
    const activity = await readJson(ACTIVITY_FILE, []);
    const visible = req.currentUser.role === "admin"
      ? activity
      : activity.filter((item) => item.userId === req.currentUser.id);
    res.json(visible);
  });

  app.post("/api/admin/totp/setup", requireAuth, requireRole("admin"), requireCsrf, async (req, res) => {
    const secret = speakeasy.generateSecret({
      name: `NCCC Portal (${req.currentUser.username})`,
      issuer: "NCCC Uzbekistan"
    });
    req.session.pendingTotpSecret = secret.base32;
    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
    res.json({
      qrDataUrl,
      manualKey: secret.base32
    });
  });

  app.post("/api/admin/totp/verify", requireAuth, requireRole("admin"), requireCsrf, async (req, res) => {
    const token = String(req.body.token || "").trim();
    const pendingSecret = req.session.pendingTotpSecret;
    if (!pendingSecret) return res.status(400).json({ error: "No TOTP setup session in progress." });

    const verified = speakeasy.totp.verify({
      secret: pendingSecret,
      encoding: "base32",
      token,
      window: 1
    });

    if (!verified) return res.status(400).json({ error: "Invalid verification code." });

    const users = await readJson(USERS_FILE, []);
    const user = users.find((item) => item.id === req.currentUser.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    user.totpEnabled = true;
    user.totpSecret = pendingSecret;
    await writeJson(USERS_FILE, users);
    delete req.session.pendingTotpSecret;
    await appendActivity({
      userId: req.currentUser.id,
      username: req.currentUser.username,
      role: req.currentUser.role,
      action: "totp_enabled",
      objectType: "user",
      objectId: req.currentUser.id,
      ip: getIp(req)
    });
    res.json({ ok: true });
  });

  app.use("/assets", express.static(path.join(ROOT, "assets"), { index: false }));
  app.use("/admin", express.static(path.join(ROOT, "admin")));

  app.get("/", sendFile("index.html"));
  app.get("/index.html", sendFile("index.html"));
  app.get("/privacy.html", sendFile("privacy.html"));
  app.get("/terms.html", sendFile("terms.html"));
  app.get("/site-map.html", sendFile("site-map.html"));
  app.get("/404.html", sendFile("404.html"));
  app.get("/site.webmanifest", sendFile("site.webmanifest"));
  app.get("/robots.txt", sendFile("robots.txt"));
  app.get("/sitemap.xml", sendFile("sitemap.xml"));
  app.get("/sw.js", sendFile("sw.js"));

  app.use((_req, res) => {
    res.status(404).sendFile(path.join(ROOT, "404.html"));
  });

  app.listen(PORT, () => {
    console.log(`[server] running on http://127.0.0.1:${PORT}`);
  });
}

function sendFile(filename) {
  return (_req, res) => res.sendFile(path.join(ROOT, filename));
}

async function ensureStorage() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  await ensureJsonFile(ACTIVITY_FILE, []);
  await ensureJsonFile(MESSAGES_FILE, []);
  await ensureJsonFile(USERS_FILE, []);

  const users = await readJson(USERS_FILE, []);
  if (users.length > 0) return;

  const username = (process.env.NCCC_ADMIN_USERNAME || "admin").toLowerCase();
  const password = process.env.NCCC_ADMIN_PASSWORD || "ChangeMe123!";
  const seedUser = {
    id: `usr-${crypto.randomUUID()}`,
    username,
    name: "Local Administrator",
    email: "admin@localhost",
    role: "admin",
    active: true,
    passwordHash: await bcrypt.hash(password, 12),
    totpEnabled: false,
    totpSecret: null,
    failedAttempts: 0,
    lockUntil: null,
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  };

  await writeJson(USERS_FILE, [seedUser]);
  await appendActivity({
    userId: seedUser.id,
    username: seedUser.username,
    role: seedUser.role,
    action: "bootstrap_admin_created",
    objectType: "user",
    objectId: seedUser.id,
    ip: "local"
  });

  console.log(`[bootstrap] created initial admin user '${username}' with password '${password}'`);
}

async function ensureJsonFile(filename, fallback) {
  try {
    await fs.access(filename);
  } catch {
    await writeJson(filename, fallback);
  }
}

async function readJson(filename, fallback) {
  try {
    const raw = await fs.readFile(filename, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filename, data) {
  const temp = `${filename}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(temp, filename);
}

async function appendActivity(entry) {
  const activity = await readJson(ACTIVITY_FILE, []);
  activity.unshift({
    id: `act-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    ...entry
  });
  await writeJson(ACTIVITY_FILE, activity.slice(0, 500));
}

async function requireAuthOptional(req, _res, next) {
  if (!req.session.userId) {
    req.currentUser = null;
    return next();
  }
  const users = await readJson(USERS_FILE, []);
  req.currentUser = users.find((item) => item.id === req.session.userId) || null;
  next();
}

async function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Authentication required." });
  const users = await readJson(USERS_FILE, []);
  const user = users.find((item) => item.id === req.session.userId);
  if (!user || !user.active) return res.status(401).json({ error: "Authentication required." });
  req.currentUser = user;
  ensureCsrf(req);
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.currentUser || !roles.includes(req.currentUser.role)) {
      return res.status(403).json({ error: "Insufficient permissions." });
    }
    next();
  };
}

function requireCsrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = randomToken();
  if (req.get("x-csrf-token") !== req.session.csrfToken) {
    return res.status(403).json({ error: "Invalid CSRF token." });
  }
  next();
}

function ensureCsrf(req) {
  if (!req.session.csrfToken) req.session.csrfToken = randomToken();
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    active: Boolean(user.active),
    totpEnabled: Boolean(user.totpEnabled),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    lockUntil: user.lockUntil
  };
}

function getIp(req) {
  return req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
}

function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}
