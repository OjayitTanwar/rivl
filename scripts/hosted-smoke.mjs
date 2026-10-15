// Explicit integration smoke test. Administrator-only; never import into app.
// Creates two clearly labeled short-lived users, then deletes them in finally.
import { randomBytes, randomUUID } from "node:crypto";
const target = process.env.RIVL_SMOKE_PROJECT_REF;
const publicKey = process.env.RIVL_SMOKE_PUBLIC_KEY;
const adminKey = process.env.RIVL_SMOKE_ADMIN_KEY;
if (
  !process.argv.includes("--allow-test-accounts") ||
  !/^[a-z0-9]{20}$/.test(target ?? "") ||
  !publicKey ||
  !adminKey
) {
  throw new Error(
    "Set the three RIVL_SMOKE_* server-side variables and explicitly pass --allow-test-accounts. Never commit keys.",
  );
}
const base = `https://${target}.supabase.co`;
const users = [];
const checks = [];
async function request(
  path,
  { token, admin = false, method = "GET", body, prefer } = {},
) {
  const response = await fetch(base + path, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      apikey: admin ? adminKey : publicKey,
      ...(admin || token
        ? { Authorization: `Bearer ${admin ? adminKey : token}` }
        : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: response.status, data };
}
function assert(condition, label) {
  if (!condition) throw new Error(label);
}
async function expectSuccess(path, options, label) {
  const result = await request(path, options);
  assert(
    result.status >= 200 && result.status < 300,
    `${label}: HTTP ${result.status}`,
  );
  return result.data;
}
let failed = false;
try {
  const suffix = randomBytes(6).toString("hex");
  for (const index of [1, 2]) {
    const email = `rivl-smoke-${suffix}-${index}@example.com`;
    const password = randomBytes(24).toString("base64url");
    const created = await expectSuccess(
      "/auth/v1/admin/users",
      {
        admin: true,
        method: "POST",
        body: {
          email,
          password,
          email_confirm: true,
          user_metadata: { name: "Temporary RIVL integration check" },
        },
      },
      "Temporary account creation",
    );
    users.push({ id: created.id }); // Register cleanup before any subsequent step can fail.
    const login = await expectSuccess(
      "/auth/v1/token?grant_type=password",
      { method: "POST", body: { email, password } },
      "Password login",
    );
    assert(
      login.user.id === created.id && login.access_token && login.refresh_token,
      "Login owner/session mismatch",
    );
    const user = users.at(-1);
    user.token = login.access_token;
    const refresh = await expectSuccess(
      "/auth/v1/token?grant_type=refresh_token",
      { method: "POST", body: { refresh_token: login.refresh_token } },
      "Session refresh",
    );
    assert(
      refresh.user.id === user.id && refresh.access_token,
      "Refresh owner mismatch",
    );
    user.token = refresh.access_token;
    await expectSuccess(
      "/rest/v1/profiles",
      {
        token: user.token,
        method: "POST",
        body: {
          id: user.id,
          name: "Temporary RIVL integration check",
          handle: `smoke.${suffix}.${index}`,
        },
      },
      "Own profile creation",
    );
  }
  checks.push("Two real password logins and refresh-token rotations");
  const [a, b] = users;
  const sample = randomUUID();
  await expectSuccess(
    "/rest/v1/health_samples",
    {
      token: a.token,
      method: "POST",
      body: {
        id: sample,
        owner_id: a.id,
        source: "temporary-integration-check",
        kind: "steps",
        value: 1,
        recorded_at: new Date().toISOString(),
      },
    },
    "Own private sample creation",
  );
  const own = await expectSuccess(
    `/rest/v1/health_samples?id=eq.${sample}&select=id`,
    { token: a.token },
    "Own private read",
  );
  const foreign = await expectSuccess(
    `/rest/v1/health_samples?id=eq.${sample}&select=id`,
    { token: b.token },
    "Foreign private read",
  );
  assert(
    own.length === 1 && foreign.length === 0,
    "Private row isolation failed",
  );
  const overwrite = await expectSuccess(
    `/rest/v1/health_samples?id=eq.${sample}`,
    {
      token: b.token,
      method: "PATCH",
      body: { value: 2 },
      prefer: "return=representation",
    },
    "Foreign update request",
  );
  assert(overwrite.length === 0, "Foreign update modified a private sample");
  const spoof = await request("/rest/v1/health_samples", {
    token: b.token,
    method: "POST",
    body: {
      owner_id: a.id,
      source: "temporary-integration-check",
      kind: "steps",
      value: 1,
      recorded_at: new Date().toISOString(),
    },
  });
  assert(spoof.status === 403, "Foreign owner insert was accepted");
  checks.push(
    "Cross-account private read, update and forged-owner insertion blocked",
  );
  await expectSuccess(
    "/rest/v1/friendships",
    {
      token: a.token,
      method: "POST",
      body: { requester_id: a.id, recipient_id: b.id },
    },
    "Friend request",
  );
  const forged = await request(
    `/rest/v1/friendships?requester_id=eq.${a.id}&recipient_id=eq.${b.id}`,
    {
      token: b.token,
      method: "PATCH",
      body: { requester_id: b.id, recipient_id: a.id, status: "accepted" },
    },
  );
  assert(forged.status === 403, "Friendship endpoint rewrite was accepted");
  const accepted = await expectSuccess(
    `/rest/v1/friendships?requester_id=eq.${a.id}&recipient_id=eq.${b.id}`,
    {
      token: b.token,
      method: "PATCH",
      body: { status: "accepted" },
      prefer: "return=representation",
    },
    "Legitimate friend acceptance",
  );
  assert(
    accepted.length === 1 && accepted[0].status === "accepted",
    "Friend acceptance did not persist",
  );
  await expectSuccess(
    `/rest/v1/friendships?requester_id=eq.${a.id}&recipient_id=eq.${b.id}`,
    { token: a.token, method: "DELETE" },
    "Friend removal",
  );
  checks.push("Friend request, immutable endpoints, acceptance and removal");
  await expectSuccess(
    "/auth/v1/logout?scope=local",
    { token: a.token, method: "POST" },
    "Hosted sign-out",
  );
  checks.push("Hosted local-session sign-out");
} catch (error) {
  failed = true;
  console.error(
    error instanceof Error ? error.message : "Hosted integration check failed",
  );
} finally {
  let cleaned = 0;
  for (const user of users) {
    try {
      const result = await request(`/auth/v1/admin/users/${user.id}`, {
        admin: true,
        method: "DELETE",
      });
      if (![200, 204, 404].includes(result.status)) throw new Error();
      const remaining = await request(`/auth/v1/admin/users/${user.id}`, {
        admin: true,
      });
      if (remaining.status !== 404) throw new Error();
      cleaned++;
    } catch {
      failed = true;
      console.error(
        `Temporary account cleanup needs administrator attention: ${user.id}`,
      );
    }
  }
  console.log(
    JSON.stringify(
      {
        project: target,
        checks,
        temporaryUsersCreated: users.length,
        temporaryUsersRemoved: cleaned,
        limitation:
          "Admin-confirmed test identities bypass email delivery. OAuth providers, email confirmation/recovery delivery, device UI and load capacity are not verified.",
      },
      null,
      2,
    ),
  );
}
if (failed) process.exitCode = 1;
