import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

function required(name) {
  assert.ok(process.env[name], `Set ${name} before running the integration suite`);
  return process.env[name];
}

function configuredUrl(name) {
  const value = required(name);
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

function configuration() {
  const api = configuredUrl("API_URL");
  const db = configuredUrl("DB_URL");
  const hostedRef = process.env.HC_DISPOSABLE_PROJECT_REF;
  if (hostedRef) {
    assert.match(hostedRef, /^[a-z0-9]{20}$/);
    assert.equal(api.origin, `https://${hostedRef}.supabase.co`);
    assert.equal(db.hostname, `db.${hostedRef}.supabase.co`);
    assert.ok(db.searchParams.get("sslmode") === "require", "Hosted PostgreSQL requires TLS");
  } else {
    const apiPort = process.env.HC_TEST_API_PORT ?? "54321";
    const dbPort = process.env.HC_TEST_DB_PORT ?? "54322";
    assert.ok(["localhost", "127.0.0.1"].some(host => api.origin === `http://${host}:${apiPort}`),
      "Use the configured local Supabase gateway");
    assert.ok(["localhost", "127.0.0.1"].includes(db.hostname) && db.port === dbPort,
      "Use the configured local PostgreSQL port");
  }
  assert.ok(["postgres:", "postgresql:"].includes(db.protocol));
  assert.ok([...db.searchParams.keys()].every(key => key === "sslmode"),
    "Only sslmode is accepted in the database URL query");
  assert.ok(db.username && db.password && db.pathname !== "/" && !db.hash);
  assert.equal(api.pathname, "/");
  assert.ok(!api.username && !api.password && !api.search && !api.hash);
  const password = decodeURIComponent(db.password);
  db.password = "";
  return { api, db, password, anon: required("ANON_KEY"), service: required("SERVICE_ROLE_KEY") };
}

function postgres(config, sqlOrArgs) {
  try {
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith("PG")),
    );
    const args = typeof sqlOrArgs === "string" ? ["-c", sqlOrArgs] : sqlOrArgs;
    return execFileSync("psql", ["-XwqAt", "-v", "ON_ERROR_STOP=1", "-d", config.db.href, ...args], {
      env: { ...environment, PGPASSWORD: config.password, PGCONNECT_TIMEOUT: "5" },
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error("PostgreSQL fixture command failed. Check psql, connectivity, and migration state.");
  }
}

function uuid(value) {
  assert.match(value, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
  return value;
}

async function request(config, route, { token, service = false, data, method } = {}) {
  const key = service ? config.service : config.anon;
  const response = await fetch(new URL(route, config.api), {
    method: method ?? (data === undefined ? "GET" : "POST"),
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  }).catch(() => { throw new Error("Supabase HTTP request failed"); });
  const text = await response.text();
  return { status: response.status, ok: response.ok, body: text ? JSON.parse(text) : null };
}

function success(response, label) {
  assert.ok(response.ok, `${label} returned HTTP ${response.status}`);
  return response.body;
}

function rpc(config, name, token, data = {}) {
  return request(config, `/rest/v1/rpc/${name}`, { token, data });
}

function denied(response, label) {
  assert.ok([401, 403, 404].includes(response.status), `${label} returned HTTP ${response.status}`);
  assert.ok(!response.ok, label);
}

function notification(frame, expected) {
  assert.ok(frame, "Expected a database Broadcast notification");
  // Realtime can add its own event ID to the database Broadcast payload.
  const { id, ...payload } = frame.payload.payload;
  if (id !== undefined) uuid(id);
  assert.deepEqual(payload, expected);
}

async function account(config, role) {
  const email = `hc-${role}-${randomUUID()}@example.com`;
  const password = `Hc9!${randomUUID()}`;
  const credentials = { email, password };
  const signup = success(await request(config, "/auth/v1/signup", {
    data: { ...credentials, data: { role: "admin" } },
  }), "signup");
  const session = success(await request(config, "/auth/v1/token?grant_type=password", {
    data: credentials,
  }), "password login");
  const id = uuid(session.user.id);
  assert.equal((signup.user ?? signup).id, id, "Signup and login refer to the same user");
  assert.ok(session.access_token, "Password login issued an access token");
  const profile = success(await rpc(config, "get_my_profile", session.access_token), "profile");
  assert.equal(profile.role, "visitor", "Signup metadata cannot set the role");
  assert.match(profile.public_id, /^VIS-/);
  assert.ok(!("id" in profile) && !("email" in profile), "Sanitized profile");
  return { id, email, token: session.access_token, publicId: profile.public_id };
}

class Channel {
  constructor(config, chat, token) {
    const url = new URL("/realtime/v1/websocket", config.api);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("apikey", config.anon);
    url.searchParams.set("vsn", "1.0.0");
    this.socket = new WebSocket(url);
    this.topic = `realtime:conversation:${chat}`;
    this.frames = [];
    this.socket.addEventListener("message", ({ data }) => this.frames.push(JSON.parse(data)));
    this.socket.addEventListener("open", () => {
      this.send("phx_join", "join", {
        config: { private: true, broadcast: { ack: true, self: true }, presence: { enabled: false } },
        access_token: token ?? config.anon,
      });
    });
  }

  send(event, ref, payload) {
    this.socket.send(JSON.stringify({ topic: this.topic, event, ref, join_ref: "join", payload }));
  }

  async find(predicate, timeout = 12000) {
    const until = Date.now() + timeout;
    do {
      const frame = this.frames.find(predicate);
      if (frame) return frame;
      if (this.socket.readyState === WebSocket.CLOSED) break;
      await delay(25);
    } while (Date.now() < until);
  }

  async joinStatus() {
    const reply = await this.find(frame => frame.event === "phx_reply" && frame.ref === "join");
    assert.ok(reply, "Realtime did not return a channel join reply");
    return reply.payload.status;
  }

  close() {
    this.socket.close();
  }
}

test("Human Connection against a fresh disposable Supabase stack", { timeout: 180000 }, async (t) => {
  const config = configuration();
  assert.equal(postgres(config, `select not exists (select from auth.users)
    and not exists (select from public.profiles)
    and not exists (select from public.volunteers)
    and not exists (select from public.conversations)
    and not exists (select from public.messages)
    and not exists (select from public.reports)
    and not exists (select from public.cleanup_logs)`), "t", "Start with an empty migrated stack");

  let visitor, secondVisitor, firstVolunteer, secondVolunteer, admin, outsider;
  let chat, volunteer, endedChat, waitingChat, receiver;
  const channels = [];
  t.after(() => channels.forEach(channel => channel.close()));
  const open = (id, token) => {
    const channel = new Channel(config, id, token);
    channels.push(channel);
    return channel;
  };
  const call = (name, user, args) => rpc(config, name, user?.token, args);
  async function step(name, fn) {
    let completed = false;
    await t.test(name, async () => {
      await fn();
      completed = true;
    });
    assert.ok(completed, `Stopped after ${name}`);
  }

  await step("real signup, login, role checks, and RPC grants", async () => {
    visitor = await account(config, "visitor");
    secondVisitor = await account(config, "second-visitor");
    firstVolunteer = await account(config, "first-volunteer");
    secondVolunteer = await account(config, "second-volunteer");
    admin = await account(config, "admin");
    outsider = await account(config, "outsider");
    const bootstrap = email => postgres(config, ["-v", `admin_email=${email}`, "-v",
      `admin_public_id=${admin.publicId}`, "-f", "supabase/operations/bootstrap-first-admin.sql"]);
    assert.throws(() => bootstrap(visitor.email), "Bootstrap rejects a mismatched account");
    const administratorId = bootstrap(admin.email);
    assert.match(administratorId, /^ADM-[0-9A-F]{12}$/);
    assert.throws(() => bootstrap(admin.email), "Bootstrap rejects a second run");
    assert.equal(success(await call("get_my_profile", admin), "bootstrapped profile").role, "admin");
    assert.deepEqual(success(await call("admin_list_reports", admin), "empty admin report list"), []);
    assert.ok(!(await call("admin_promote_volunteer", admin, {
      p_public_id: administratorId, p_languages: ["en"],
    })).ok, "An administrator cannot promote their own account");
    denied(await call("admin_list_reports", visitor), "visitor report list");
    denied(await call("get_my_profile"), "anonymous profile RPC");
    denied(await call("get_volunteer_queue", visitor), "visitor queue access");
    denied(await call("get_my_volunteer_settings", visitor), "visitor settings read");
    denied(await call("update_volunteer_settings", visitor, {
      p_is_available: true, p_supported_languages: ["ur"],
    }), "visitor settings write");
    denied(await call("admin_promote_volunteer", visitor, { p_public_id: visitor.publicId }), "self-promotion");
    denied(await call("purge_expired_data", visitor), "visitor cleanup");
    denied(await request(config, "/rest/v1/messages?select=id", { token: visitor.token }), "direct table access");
    for (const user of [firstVolunteer, secondVolunteer]) {
      const publicId = success(await call("admin_promote_volunteer", admin, {
        p_public_id: user.publicId, p_languages: ["ur"], p_max_chats: 1,
      }), "admin promotion");
      user.publicId = publicId;
      assert.match(publicId, /^VOL-/);
      denied(await call("admin_list_reports", user), "volunteer admin access");
      denied(await call("admin_promote_volunteer", user, { p_public_id: outsider.publicId }), "volunteer promotion");
      const settings = success(await call("get_my_volunteer_settings", user), "volunteer settings lookup");
      assert.deepEqual(settings, { is_available: false, supported_languages: ["ur"], max_active_conversations: 1 });
      assert.deepEqual(success(await call("get_volunteer_queue", user), "offline queue"), []);
    }
  });

  await step("waiting requests, language queue, and concurrent claims", async () => {
    const created = success(await call("request_conversation", visitor, { p_language: "ur" }), "request");
    chat = uuid(created.id);
    assert.equal(created.status, "waiting");
    receiver = open(chat, visitor.token);
    assert.equal(await receiver.joinStatus(), "ok");
    assert.ok(!(await call("request_conversation", visitor, { p_language: "ur" })).ok, "one open chat");
    denied(await call("claim_conversation", visitor, { p_conversation_id: chat }), "visitor claim");
    success(await call("update_volunteer_settings", firstVolunteer, {
      p_is_available: true, p_supported_languages: ["en"],
    }), "English-only settings");
    assert.deepEqual(success(await call("get_volunteer_queue", firstVolunteer), "language-filtered queue"), []);
    for (const languages of [[], ["fr"], ["en", "en"]]) {
      const invalid = await call("update_volunteer_settings", firstVolunteer, {
        p_is_available: true, p_supported_languages: languages,
      });
      assert.equal(invalid.body?.code, "23514");
    }
    for (const user of [firstVolunteer, secondVolunteer]) {
      success(await call("update_volunteer_settings", user, {
        p_is_available: true, p_supported_languages: ["ur"],
      }), "volunteer settings");
      const queue = success(await call("get_volunteer_queue", user), "queue");
      assert.deepEqual(queue.map(entry => Object.keys(entry).sort()), [["created_at", "id", "language"]]);
      assert.equal(queue[0].id, chat);
    }
    const candidates = [firstVolunteer, secondVolunteer];
    const claims = await Promise.all(candidates.map(user => call("claim_conversation", user, { p_conversation_id: chat })));
    assert.equal(claims.filter(response => response.ok).length, 1);
    assert.equal(claims.find(response => !response.ok).status, 400);
    volunteer = candidates[claims.findIndex(response => response.ok)];
    const change = await receiver.find(frame => frame.event === "broadcast" && frame.payload.event === "conversation_changed");
    notification(change, { conversation_id: chat });
    const other = candidates.find(user => user !== volunteer);
    const assigned = success(await call("get_my_conversations", volunteer), "assigned conversation recovery");
    assert.equal(assigned[0].id, chat);
    assert.equal(assigned[0].visitor_public_id, visitor.publicId);
    assert.deepEqual(success(await call("get_my_conversations", other), "unassigned volunteer conversation list"), []);
    success(await call("update_volunteer_settings", other, {
      p_is_available: false, p_supported_languages: ["ur"],
    }), "take unassigned volunteer offline");
    const waiting = success(await call("request_conversation", secondVisitor, { p_language: "ur" }), "capacity fallback");
    waitingChat = uuid(waiting.id);
    assert.equal(waiting.status, "waiting");
    assert.equal((await call("claim_conversation", volunteer, { p_conversation_id: waitingChat })).status, 400);
    const unrelated = await call("get_conversation", outsider, { p_conversation_id: chat });
    assert.equal(success(unrelated, "unrelated chat lookup"), null);
  });

  await step("private Broadcast, stored sender identity, and publish denial", async () => {
    const sender = open(chat, volunteer.token);
    assert.equal(await sender.joinStatus(), "ok");
    assert.equal(await open(chat, outsider.token).joinStatus(), "error");
    assert.equal(await open(chat).joinStatus(), "error");
    denied(await call("send_message", outsider, { p_conversation_id: chat, p_content: "Unrelated" }), "unrelated send");
    const sent = success(await call("send_message", volunteer, {
      p_conversation_id: chat, p_content: "Integration message",
    }), "message");
    assert.equal(sent.sender_public_id, volunteer.publicId);
    assert.equal(sent.sender_role, "volunteer");
    assert.ok(!("sender_id" in sent));
    const history = success(await call("get_messages", visitor, { p_conversation_id: chat }), "history");
    assert.ok(history.some(message => message.id === sent.id && message.content === "Integration message"));
    assert.deepEqual(success(await call("get_messages", outsider, { p_conversation_id: chat }), "unrelated history"), []);
    const event = await receiver.find(frame => frame.event === "broadcast" && frame.payload.event === "new_message");
    notification(event, { message_id: sent.id });
    const forged = randomUUID();
    sender.send("broadcast", "forged", { type: "broadcast", event: forged, payload: {} });
    const reply = await sender.find(frame => frame.event === "phx_reply" && frame.ref === "forged", 2000);
    assert.notEqual(reply?.payload.status, "ok", "Client publish must not be acknowledged as successful");
    assert.equal(await receiver.find(frame => frame.event === "broadcast" && frame.payload.event === forged, 1500), undefined);
  });

  await step("send versus end, reports, deletion, and authorization changes", async () => {
    const [send, end] = await Promise.all([
      call("send_message", volunteer, { p_conversation_id: chat, p_content: "Racing send" }),
      call("end_conversation", volunteer, { p_conversation_id: chat }),
    ]);
    const ended = success(end, "end conversation");
    assert.equal(ended.status, "ended");
    assert.equal(ended.ended_by, "volunteer");
    if (send.ok) {
      assert.ok(Date.parse(send.body.created_at) <= Date.parse(ended.ended_at));
    } else {
      assert.equal(send.status, 400);
    }
    assert.equal((await call("send_message", volunteer, { p_conversation_id: chat, p_content: "Too late" })).status, 400);
    const report = success(await call("submit_safeguarding_report", visitor, {
      p_conversation_id: chat, p_reason: "harassment", p_notes: "Original reporter evidence",
    }), "report");
    const second = success(await call("submit_safeguarding_report", visitor, {
      p_conversation_id: chat, p_reason: "other",
    }), "second report");
    assert.notEqual(uuid(report), uuid(second));
    const pending = success(await call("admin_list_reports", admin, { p_status: "pending" }), "pending report listing");
    assert.equal(pending.length, 2);
    assert.ok(pending.every(row => !("reporter_id" in row) && !("reviewed_by" in row)));
    const older = success(await call("admin_list_reports", admin, {
      p_status: "pending", p_limit: 1, p_before: pending[0].created_at, p_before_id: pending[0].id,
    }), "report cursor");
    assert.deepEqual(older.map(row => row.id), [pending[1].id]);
    denied(await call("admin_review_report", visitor, { p_report_id: report, p_status: "reviewed" }), "visitor review");
    denied(await call("admin_review_report", volunteer, { p_report_id: report, p_status: "reviewed" }), "volunteer review");
    success(await call("admin_review_report", admin, {
      p_report_id: report, p_status: "reviewed", p_admin_notes: "Separate operator decision",
    }), "review");
    const [updated] = success(await call("admin_list_reports", admin, { p_status: "reviewed" }), "reviewed report listing");
    assert.equal(updated.id, report);
    assert.equal(updated.notes, "Original reporter evidence");
    assert.equal(updated.reason, "harassment");
    assert.equal(updated.admin_notes, "Separate operator decision");
    assert.ok(updated.reviewed_at);
    const assigned = success(await call("request_conversation", outsider, { p_language: "ur" }), "automatic assignment");
    endedChat = uuid(assigned.id);
    assert.equal(assigned.status, "active");
    success(await call("send_message", outsider, { p_conversation_id: endedChat, p_content: "Retention fixture" }), "fixture message");
    success(await request(config, `/auth/v1/admin/users/${outsider.id}`, { method: "DELETE", service: true }), "account deletion");
    const oldSession = await call("get_conversation", outsider, { p_conversation_id: endedChat });
    assert.ok(oldSession.status === 401 || (oldSession.ok && oldSession.body === null), "Deleted identity loses RPC access");
    assert.equal(await open(endedChat, outsider.token).joinStatus(), "error");
    assert.equal(success(await call("get_conversation", volunteer, { p_conversation_id: endedChat }), "remaining participant").status, "ended");
  });

  await step("service-role cleanup and retention boundaries", async () => {
    const purge = async () => {
      const result = success(await request(config, "/rest/v1/rpc/purge_expired_data", { service: true, data: {} }), "cleanup");
      assert.equal(result.status, "success");
      return result;
    };
    postgres(config, `update public.conversations set created_at=now()-interval '61 minutes' where id='${waitingChat}';
      update public.conversations set ended_at=now()-interval '15 days' where id='${endedChat}';
      update public.conversations set flagged_at=now()-interval '89 days' where id='${chat}'`);
    assert.deepEqual(success(await call("get_volunteer_queue", volunteer), "expired queue"), []);
    const expired = await call("claim_conversation", volunteer, { p_conversation_id: waitingChat });
    assert.equal(expired.status, 400);
    assert.equal(expired.body?.message, "Conversation unavailable");
    const first = await purge();
    assert.equal(first.closed_waiting, 1);
    assert.equal(first.purged_messages, 1);
    assert.equal(first.purged_conversations, 0);
    postgres(config, `update public.conversations set ended_at=now()-interval '31 days' where id='${endedChat}';
      update public.conversations set flagged_at=now()-interval '91 days' where id='${chat}'`);
    const second = await purge();
    assert.ok(second.purged_messages >= 1);
    assert.equal(second.purged_conversations, 1);
    postgres(config, `update public.conversations set flagged_at=now()-interval '181 days' where id='${chat}'`);
    assert.equal((await purge()).purged_conversations, 1);
    assert.equal(postgres(config, "select count(*) from public.reports where conversation_id is null"), "2");
    postgres(config, "update public.reports set created_at=now()-interval '366 days'; update public.cleanup_logs set executed_at=now()-interval '366 days'");
    const final = await purge();
    assert.equal(final.purged_reports, 2);
    assert.equal(final.purged_logs, 3);
  });
});
