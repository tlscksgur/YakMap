import assert from "node:assert/strict";
import { AuthProviderError, authWithSupabase } from "../lib/api-providers.mjs";

const calls = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  if (String(url).includes("/auth/v1/signup")) {
    return jsonResponse(200, {
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "tester@yakmap.test",
        created_at: "2026-06-01T00:00:00.000Z"
      },
      session: {
        access_token: "user-access-token"
      }
    });
  }

  if (String(url).includes("/rest/v1/users")) {
    return jsonResponse(201, []);
  }

  return jsonResponse(404, { error: "unexpected URL" });
};

try {
  const result = await authWithSupabase("signup", {
    email: "tester@yakmap.test",
    password: "Yakmap-test-12345"
  }, {
    supabaseUrl: "https://project.supabase.co",
    supabaseAnonKey: "publishable-key",
    supabaseServiceRoleKey: "",
    integrations: { supabase: { configured: true } }
  });

  assert.equal(result.source, "supabase");
  assert.equal(result.user.id, "00000000-0000-4000-8000-000000000001");

  const profileCall = calls.find((call) => call.url.includes("/rest/v1/users"));
  assert.ok(profileCall, "auth should upsert a public.users profile row");
  assert.equal(profileCall.options.method, "POST");
  assert.match(profileCall.url, /on_conflict=id/);
  assert.equal(profileCall.options.headers.authorization, "Bearer user-access-token");
  assert.match(profileCall.options.headers.prefer, /resolution=merge-duplicates/);
  assert.deepEqual(JSON.parse(profileCall.options.body), {
    id: "00000000-0000-4000-8000-000000000001",
    email: "tester@yakmap.test",
    is_active: true,
    deleted_at: null
  });

  calls.length = 0;
  await authWithSupabase("signup", {
    email: "tester@yakmap.test",
    password: "Yakmap-test-12345"
  }, {
    supabaseUrl: "https://project.supabase.co",
    supabaseAnonKey: "publishable-key",
    supabaseServiceRoleKey: "service-role-key",
    integrations: { supabase: { configured: true } }
  });

  const serviceRoleProfileCall = calls.find((call) => call.url.includes("/rest/v1/users"));
  assert.ok(serviceRoleProfileCall, "service role config should still upsert a public.users profile row");
  assert.equal(serviceRoleProfileCall.options.headers.authorization, "Bearer service-role-key");
  assert.equal(serviceRoleProfileCall.options.headers.apikey, "service-role-key");
} finally {
  globalThis.fetch = originalFetch;
}

const rateLimitError = new AuthProviderError("email rate limit exceeded", 429);
assert.equal(rateLimitError.message, "email rate limit exceeded");
assert.equal(rateLimitError.status, 429);

console.log("PASS supabase profile");

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
