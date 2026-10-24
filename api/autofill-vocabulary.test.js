import assert from "node:assert/strict";
import test from "node:test";

import { normalizeQuotaRpcResult } from "./autofill-vocabulary.js";

const vocabulary = {
  word: "bonjour", category: "vocabulary", partOfSpeech: "interjection", english: "hello",
  ipa: "", gender: "", example: "Bonjour ! Hello!", notes: "A greeting.", tags: ["daily life"],
  conjugation: { je: "", tu: "", "il/elle": "", nous: "", vous: "", "ils/elles": "" },
  adjectiveForms: { masculine: "", feminine: "", masculinePlural: "", femininePlural: "" },
};
const wikiPayload = { query: { pages: [{ revisions: [{ slots: { main: { content: "==French==\nA French entry" } } }] }] } };
const quotaPayload = [{ allowed: true, daily_limit: 10, request_count: 1, subscription_tier: "free" }];
let moduleId = 0;

async function setup(t, overrides = {}) {
  const environment = { VITE_SUPABASE_URL: "https://autofill.supabase.test", VITE_SUPABASE_PUBLISHABLE_KEY: "test-public", OPENAI_API_KEY: "test-private", OPENAI_AUTOFILL_MODEL: "test-model" };
  for (const [key, value] of Object.entries(environment)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  // Fresh module state prevents the real Wiktionary cache/cooldown crossing tests.
  const { default: handler, upstreamTimeouts } = await import(`./autofill-vocabulary.js?test=${++moduleId}`);
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    const href = String(url);
    const service = href.includes("/auth/") ? "auth" : href.includes("/rpc/") ? "quota" : href.includes("wiktionary") ? "wiki" : href.includes("api.openai.com") ? "openai" : "unexpected";
    assert.notEqual(service, "unexpected", href);
    calls.push({ service, url: href, options });
    if (overrides[service]) return overrides[service](url, options);
    return Response.json(service === "auth" ? { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } :
      service === "quota" ? quotaPayload : service === "wiki" ? wikiPayload :
        { status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(vocabulary) }] }] });
  });
  async function run(body = { word: "bonjour" }, requestOptions = {}) {
    const result = { headers: {}, ends: 0 };
    const response = {
      setHeader(key, value) { result.headers[key] = value; },
      end(value) { result.ends += 1; result.status = this.statusCode; result.body = JSON.parse(value); },
    };
    await handler({ method: "POST", headers: { authorization: "Bearer test-token" }, body, ...requestOptions }, response);
    assert.equal(result.ends, 1);
    assert.equal(result.headers["Content-Type"], "application/json");
    if (result.status !== 200) {
      assert.equal(result.body.status, result.status);
      assert.equal(typeof result.body.code, "string");
      assert.equal(typeof result.body.error, "string");
      assert.doesNotMatch(JSON.stringify(result.body), /test-private|test-token|secret upstream|stack trace/);
    }
    return result;
  }
  return { run, calls, upstreamTimeouts };
}

test("valid French spellings reach verification with NFC and normalized punctuation", async (t) => {
  const { run, calls } = await setup(t);
  for (const word of ["œuf", "cœur", "Œuvre", "æschne", "Æschne", "ÉCOLE", "école", "e\u0301cole", "aujourd'hui", "aujourd’hui", "l'œuf", "arc-en-ciel", "arc\u2011en\u2011ciel", "pomme de terre"]) {
    assert.equal((await run({ word })).status, 200, word);
    const sent = JSON.parse(calls.filter((call) => call.service === "openai").at(-1).options.body);
    assert.equal(sent.model, "test-model");
    assert.ok(sent.input[1].content.includes(word.normalize("NFC").replaceAll("’", "'").replaceAll("\u2011", "-")));
  }
  const titles = calls.filter((call) => call.service === "wiki").map((call) => new URL(call.url).searchParams.get("titles"));
  for (const word of ["œuf", "cœur", "Œuvre", "æschne", "arc-en-ciel", "pomme de terre"]) assert.ok(titles.some((title) => title.includes(word)), word);
});

test("invalid characters, controls, punctuation-only entries and input limits fail before verification or quota", async (t) => {
  const { run, calls } = await setup(t);
  for (const word of ["", "   ", "123", "mot2", "cœur!", "你好", "a/b", "a×b", "a÷b", "---", "''", "-bonjour", "bonjour-", "a''b", "a\nb", "\tbonjour", "bonjour\r", "bon\u0000jour", "bon\u200bjour", "a".repeat(49), "un deux trois quatre cinq"]) {
    const result = await run({ word });
    assert.equal(result.status, 400, word);
    assert.equal(result.body.code, "INVALID_WORD");
  }
  assert.ok(calls.every((call) => call.service === "auth"));
  assert.equal((await run({ word: "a".repeat(48) })).status, 200);
  assert.equal((await run({ word: "un deux trois quatre" })).status, 200);
});

test("request bodies must be objects containing a string word and optional supported language", async (t) => {
  const { run, calls } = await setup(t);
  for (const body of [null, [], ["bonjour"], 12, true, "null", "[]", "{bad", '"bonjour"', {}, { word: null }, { word: 12 }, { word: [] }, { word: "bonjour", language: null }, { word: "bonjour", language: {} }, { word: "bonjour", language: "fr" }]) {
    const result = await run(body);
    assert.equal(result.status, 400);
    assert.equal(result.body.code, "INVALID_REQUEST");
  }
  assert.ok(calls.every((call) => call.service === "auth"));
  assert.equal((await run(JSON.stringify({ word: "bonjour", language: "zh" }))).status, 200);
  assert.match(calls.find((call) => call.service === "openai").options.body, /Simplified Chinese/);
});

test("method, authentication and missing configuration retain safe structured errors", async (t) => {
  const { run, calls } = await setup(t);
  assert.equal((await run({}, { method: "GET" })).status, 405);
  assert.equal((await run({}, { headers: {} })).status, 401);
  assert.equal(calls.length, 0);
  delete process.env.OPENAI_API_KEY;
  assert.equal((await run()).body.code, "AUTOFILL_NOT_CONFIGURED");
  assert.equal(calls.filter((call) => call.service === "quota").length, 0);
});

for (const service of ["wiki", "openai"]) {
  const codePrefix = service === "wiki" ? "WIKTIONARY" : "OPENAI";
  test(`returns safe JSON and preserves quota boundaries after ${service === "wiki" ? "Wiktionary" : "OpenAI"} connection failure`, async (t) => {
    const { run, calls } = await setup(t, { [service]: () => { throw new Error("secret upstream test-private stack trace"); } });
    const result = await run();
    assert.equal(result.status, 502);
    assert.equal(result.body.code, `${codePrefix}_UNAVAILABLE`);
    assert.equal(result.body.retryable, true);
    assert.equal(calls.filter((call) => call.service === "quota").length, service === "wiki" ? 0 : 1);
    assert.equal(calls.filter((call) => call.service === "openai").length, service === "wiki" ? 0 : 1);
  });

  for (const stage of ["connection", "body"]) {
    test(`bounds ${service === "wiki" ? "Wiktionary" : "OpenAI"} ${stage} timeouts when transport ignores cancellation`, async (t) => {
      let reached;
      const started = new Promise((resolve) => { reached = resolve; });
      let rejectLate;
      const pending = new Promise((_, reject) => { rejectLate = reject; });
      const { run, calls, upstreamTimeouts } = await setup(t, { [service]: () => {
        if (stage === "connection") { reached(); return pending; }
        return { ok: true, status: 200, json: () => { reached(); return pending; } };
      } });
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const request = run();
      await started;
      t.mock.timers.tick(upstreamTimeouts[service === "wiki" ? "wiktionary" : "openai"]);
      const result = await request;
      assert.equal(result.status, 504);
      assert.equal(result.body.code, `${codePrefix}_TIMEOUT`);
      assert.equal(result.body.retryable, true);
      assert.equal(calls.find((call) => call.service === service).options.signal.aborted, true);
      assert.equal(calls.filter((call) => call.service === "quota").length, service === "wiki" ? 0 : 1);
      rejectLate(new Error("late transport rejection"));
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(result.ends, 1);
    });
  }

  test(`rejects unreadable or incomplete ${service === "wiki" ? "Wiktionary" : "OpenAI"} responses`, async (t) => {
    let reply;
    const { run, calls } = await setup(t, { [service]: () => reply() });
    const payloads = service === "wiki" ? [null, [], {}, { query: { pages: {} } }, { query: { pages: [] } }, { query: { pages: [null] } }, { query: { pages: [{}] } }] :
      [null, [], {}, { output: [null, { content: [null] }] }, { status: "incomplete", output_text: JSON.stringify(vocabulary) }, { output_text: "not json" }, { output_text: "null" }, { output_text: "[]" }, { output_text: '{}' },
        ...[{ english: "" }, { partOfSpeech: "unknown" }, { notes: [] }, { tags: [null] }, { conjugation: null }, { adjectiveForms: { masculine: [] } }].map((change) => ({ output_text: JSON.stringify({ ...vocabulary, ...change }) }))];
    for (const payload of payloads) {
      reply = () => Response.json(payload);
      const result = await run();
      assert.equal(result.status, 502);
      assert.equal(result.body.code, `${codePrefix}_INVALID_RESPONSE`);
    }
    reply = () => new Response("<html>secret upstream</html>");
    assert.equal((await run()).body.code, `${codePrefix}_INVALID_RESPONSE`);
    if (service === "wiki") assert.equal(calls.filter((call) => call.service === "quota").length, 0);
    else assert.equal(calls.filter((call) => call.service === "quota").length, payloads.length + 1);
  });
}

test("Wiktionary missing entries remain 422 and temporary rate limits keep their retry semantics", async (t) => {
  let reply = () => Response.json({ query: { pages: [{ missing: true }] } });
  const { run, calls } = await setup(t, { wiki: () => reply() });
  assert.equal((await run()).status, 422);
  reply = () => new Response("secret upstream", { status: 429, headers: { "retry-after": "2" } });
  const result = await run({ word: "merci" });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, "WIKTIONARY_TEMPORARY");
  assert.equal(result.body.retryAfterMs, 2000);
  assert.equal(result.body.upstreamStatus, 429);
  assert.equal(calls.filter((call) => call.service === "quota").length, 0);
});

test("Wiktionary transient server errors retry and recover without consuming extra quota", async (t) => {
  let attempt = 0;
  let reached;
  const first = new Promise((resolve) => { reached = resolve; });
  const { run, calls } = await setup(t, { wiki: () => {
    attempt += 1;
    if (attempt > 1) return Response.json(wikiPayload);
    reached();
    return new Response("unavailable", { status: 503 });
  } });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const request = run();
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(1000);
  assert.equal((await request).status, 200);
  assert.equal(attempt, 2);
  assert.equal(calls.filter((call) => call.service === "quota").length, 1);
});

test("the Wiktionary deadline also bounds Retry-After waits", async (t) => {
  let reached;
  const started = new Promise((resolve) => { reached = resolve; });
  const { run, calls, upstreamTimeouts } = await setup(t, { wiki: () => {
    reached();
    return new Response("unavailable", { status: 503, headers: { "retry-after": "30" } });
  } });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const request = run();
  await started;
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(upstreamTimeouts.wiktionary);
  assert.equal((await request).body.code, "WIKTIONARY_TIMEOUT");
  assert.equal(calls.filter((call) => call.service === "wiki").length, 1);
  assert.equal(calls.filter((call) => call.service === "quota").length, 0);
});

test("a late Wiktionary success cannot reserve quota or populate the verification cache", async (t) => {
  let release;
  let reached;
  const started = new Promise((resolve) => { reached = resolve; });
  let pending = true;
  const { run, calls, upstreamTimeouts } = await setup(t, { wiki: () => {
    if (!pending) return Response.json(wikiPayload);
    reached();
    return new Promise((resolve) => { release = resolve; });
  } });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const request = run();
  await started;
  t.mock.timers.tick(upstreamTimeouts.wiktionary);
  assert.equal((await request).body.code, "WIKTIONARY_TIMEOUT");
  release(Response.json(wikiPayload));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.filter((call) => call.service === "quota").length, 0);
  pending = false;
  assert.equal((await run()).status, 200);
  assert.equal(calls.filter((call) => call.service === "wiki").length, 2);
  assert.equal(calls.filter((call) => call.service === "quota").length, 1);
});

test("raw streamed JSON uses the same request contract as parsed serverless bodies", async (t) => {
  const { run } = await setup(t);
  async function* stream(text) { yield Buffer.from(text.slice(0, 4)); yield Buffer.from(text.slice(4)); }
  assert.equal((await run(undefined, { body: undefined, [Symbol.asyncIterator]: () => stream('{"word":"cœur"}') })).status, 200);
  assert.equal((await run(undefined, { body: undefined, [Symbol.asyncIterator]: () => stream("null") })).status, 400);
});

test("quota failure and exhaustion do not call OpenAI or expose backend errors", async (t) => {
  let quota = { message: "secret upstream", code: "test-private" };
  let status = 400;
  const { run, calls } = await setup(t, { quota: () => Response.json(quota, { status }) });
  assert.equal((await run()).body.code, "QUOTA_UNAVAILABLE");
  status = 200;
  quota = [{ ...quotaPayload[0], allowed: false, request_count: 10 }];
  const exhausted = await run();
  assert.equal(exhausted.status, 429);
  assert.equal(exhausted.body.code, "DAILY_LIMIT_REACHED");
  assert.equal(exhausted.body.limit, 10);
  assert.equal(exhausted.body.requestCount, 10);
  assert.equal(calls.filter((call) => call.service === "openai").length, 0);
});

test("OpenAI HTTP errors are safe, have stable codes and never trigger automatic paid retries", async (t) => {
  let status;
  const { run, calls } = await setup(t, { openai: () => new Response("secret upstream test-private", { status }) });
  for (status of [400, 401, 404, 408, 429, 500, 503]) {
    const result = await run();
    const retryable = status === 408 || status === 429 || status >= 500;
    assert.equal(result.status, retryable ? 503 : 502);
    assert.equal(result.body.code, retryable ? "OPENAI_UNAVAILABLE" : "OPENAI_REJECTED");
    assert.equal(result.body.retryable, retryable);
  }
  assert.equal(calls.filter((call) => call.service === "quota").length, 7);
  assert.equal(calls.filter((call) => call.service === "openai").length, 7);
});

test("manual retry after an upstream failure reserves a new attempt, never a refund", async (t) => {
  let fail = true;
  const { run, calls } = await setup(t, { openai: () => {
    if (fail) throw new Error("connection lost");
    return Response.json({ output_text: JSON.stringify(vocabulary) });
  } });
  assert.equal((await run()).status, 502);
  fail = false;
  assert.equal((await run()).status, 200);
  assert.equal(calls.filter((call) => call.service === "quota").length, 2);
  assert.ok(calls.filter((call) => call.service === "quota").every((call) => call.url.endsWith("/rpc/consume_ai_autofill_quota")));
});

test("normalizeQuotaRpcResult accepts the authenticated quota RPC row", () => {
  assert.deepEqual(
    normalizeQuotaRpcResult([
      {
        allowed: true,
        daily_limit: 1000,
        request_count: 17,
        subscription_tier: "subscriber",
      },
    ]),
    {
      allowed: true,
      limit: 1000,
      requestCount: 17,
      subscriptionTier: "subscriber",
    },
  );
});

test("normalizeQuotaRpcResult rejects missing or malformed quota results", () => {
  assert.throws(
    () => normalizeQuotaRpcResult([]),
    /Secure quota RPC returned an invalid result/,
  );
  assert.throws(
    () =>
      normalizeQuotaRpcResult({
        allowed: true,
        daily_limit: 10,
        request_count: -1,
        subscription_tier: "free",
      }),
    /Secure quota RPC returned an invalid result/,
  );
});
