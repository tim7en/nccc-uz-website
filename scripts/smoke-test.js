const BASE_URL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const USERNAME = process.env.NCCC_ADMIN_USERNAME || "admin";
const PASSWORD = process.env.NCCC_ADMIN_PASSWORD || "ChangeMe123!";

async function main() {
  const jar = new CookieJar();
  const marker = `smoke-${Date.now()}`;

  await expectStatus("Public homepage", "/", 200, { jar });
  await expectStatus("Admin shell", "/admin/", 200, { jar });

  const contact = await request("/api/public/contact", {
    method: "POST",
    jar,
    json: {
      name: "Smoke Tester",
      email: "smoke@example.com",
      topic: `Backend ${marker}`,
      message: `Automated smoke test ${marker}`
    }
  });
  assert(contact.status === 201, `Expected contact status 201, got ${contact.status}`);

  const login = await request("/api/auth/login", {
    method: "POST",
    jar,
    json: { username: USERNAME, password: PASSWORD, totp: "" }
  });
  const loginBody = await login.json();
  assert(login.status === 200, `Expected login status 200, got ${login.status}`);
  assert(loginBody.authenticated === true, "Expected authenticated login response");
  assert(typeof loginBody.csrfToken === "string" && loginBody.csrfToken.length > 10, "Expected CSRF token");

  const csrf = loginBody.csrfToken;

  const session = await request("/api/auth/session", { jar });
  const sessionBody = await session.json();
  assert(session.status === 200, `Expected session status 200, got ${session.status}`);
  assert(sessionBody.authenticated === true, "Expected authenticated session");

  const dashboard = await request("/api/admin/dashboard", { jar });
  const dashboardBody = await dashboard.json();
  assert(dashboard.status === 200, `Expected dashboard status 200, got ${dashboard.status}`);
  assert(typeof dashboardBody.counts?.news === "number", "Expected dashboard counts");

  const content = await request("/api/admin/content", { jar });
  const contentBody = await content.json();
  assert(content.status === 200, `Expected content status 200, got ${content.status}`);
  assert(Array.isArray(contentBody.news), "Expected site content with news array");

  const ui = await request("/api/admin/ui", { jar });
  const uiBody = await ui.json();
  assert(ui.status === 200, `Expected UI status 200, got ${ui.status}`);
  assert(Boolean(uiBody.uz && uiBody.ru && uiBody.en), "Expected three UI locales");

  const messages = await request("/api/admin/messages", { jar });
  const messagesBody = await messages.json();
  assert(messages.status === 200, `Expected messages status 200, got ${messages.status}`);
  const target = messagesBody.find((item) => item.topic === `Backend ${marker}`);
  assert(target, "Expected smoke-test contact message in admin messages");

  const patched = await request(`/api/admin/messages/${target.id}`, {
    method: "PATCH",
    jar,
    csrf,
    json: { status: "answered" }
  });
  const patchedBody = await patched.json();
  assert(patched.status === 200, `Expected message patch status 200, got ${patched.status}`);
  assert(patchedBody.message?.status === "answered", "Expected patched message status");

  const activity = await request("/api/admin/activity", { jar });
  const activityBody = await activity.json();
  assert(activity.status === 200, `Expected activity status 200, got ${activity.status}`);
  assert(Array.isArray(activityBody) && activityBody.length > 0, "Expected activity entries");

  await request("/api/auth/logout", {
    method: "POST",
    jar,
    csrf
  });

  console.log("Smoke test passed");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Admin user: ${USERNAME}`);
  console.log(`Message marker: Backend ${marker}`);
}

async function expectStatus(label, pathname, expected, options) {
  const response = await request(pathname, options);
  assert(response.status === expected, `${label} expected ${expected}, got ${response.status}`);
}

async function request(pathname, options = {}) {
  const headers = {
    Accept: "application/json, text/html;q=0.9",
    ...(options.csrf ? { "x-csrf-token": options.csrf } : {}),
    ...(options.json ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {})
  };

  if (options.jar) {
    const cookie = options.jar.header();
    if (cookie) headers.Cookie = cookie;
  }

  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.json ? JSON.stringify(options.json) : undefined,
    redirect: "manual"
  });

  if (options.jar) options.jar.capture(response);
  return response;
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  capture(response) {
    const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
    const cookies = getSetCookie ? getSetCookie() : [];
    for (const value of cookies) {
      const [pair] = value.split(";", 1);
      const index = pair.indexOf("=");
      if (index === -1) continue;
      const name = pair.slice(0, index).trim();
      const cookieValue = pair.slice(index + 1).trim();
      this.cookies.set(name, cookieValue);
    }
  }

  header() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(`Smoke test failed: ${error.message}`);
  process.exit(1);
});
