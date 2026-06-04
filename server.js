import { createReadStream, existsSync } from "node:fs";
import { randomInt } from "node:crypto";
import { extname, normalize, resolve } from "node:path";
import { createServer } from "node:http";
import { connect as netConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { loadEnv } from "./lib/env.mjs";
import {
  authWithSupabase,
  classifyMedicine,
  extractMedicineNames,
  extractTextFromImage,
  getRuntimeConfig,
  listHospitals,
  listPharmacies,
  publicConfig,
  registerFcmToken,
  unregisterFcmToken
} from "./lib/api-providers.mjs";

const root = process.cwd();
const env = loadEnv(root);
const port = Number(env.PORT || 4173);
const config = getRuntimeConfig(env);
const signupCodes = new Map();
const signupCodeTtlMs = 10 * 60 * 1000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}).listen(port, () => {
  console.log(`Yak-Map server running at http://localhost:${port}`);
});

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/config") {
    sendJson(response, 200, publicConfig(config));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/medicine/search") {
    const query = url.searchParams.get("q") || "";
    const medicine = await classifyMedicine(query, config);
    sendJson(response, 200, medicine);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/ocr") {
    const body = await readJson(request);
    const ocr = await extractTextFromImage(body.imageBase64 || "", config);
    const medicines = extractMedicineNames(`${ocr.text}\n${body.text || ""}`);
    sendJson(response, 200, { ...ocr, medicines });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/pharmacies") {
    const result = await listPharmacies(queryObject(url), config);
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/hospitals") {
    const result = await listHospitals(queryObject(url), config);
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/fcm/register") {
    const result = await registerFcmToken(await readJson(request), config);
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/fcm/unregister") {
    const result = await unregisterFcmToken(await readJson(request), config);
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/signup-code") {
    try {
      const { email } = await readJson(request);
      const result = await sendSignupVerificationCode(email);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/password-reset-code") {
    try {
      const { email } = await readJson(request);
      const result = await sendPasswordResetCode(email);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && (url.pathname === "/api/auth/signup" || url.pathname === "/api/auth/login")) {
    try {
      const mode = url.pathname.endsWith("signup") ? "signup" : "login";
      const body = await readJson(request);
      if (mode === "signup") {
        verifySignupCode(body.email, body.verificationCode);
      }
      const result = await authWithSupabase(mode, body, config);
      if (mode === "signup") {
        signupCodes.delete(normalizeEmail(body.email));
      }
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, error.status || 401, { error: error.message });
    }
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

async function serveStatic(response, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(root, `.${normalize(decodeURIComponent(safePath))}`);
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    sendJson(response, 404, { error: "File not found." });
    return;
  }

  response.writeHead(200, {
    "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=3600"
  });
  createReadStream(filePath).pipe(response);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function queryObject(url) {
  return Object.fromEntries(url.searchParams.entries());
}

async function sendSignupVerificationCode(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw httpError("사용할 수 없는 이메일 주소입니다.", 400);
  }

  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  await sendMail({
    to: normalizedEmail,
    subject: "[약-맵] 회원가입 인증코드",
    text: `약-맵 회원가입 인증코드입니다.\n\n인증코드: ${code}\n\n10분 안에 앱 화면에 입력하세요.`,
    html: `<p>약-맵 회원가입 인증코드입니다.</p><p style="font-size:24px;font-weight:700;">${code}</p><p>10분 안에 앱 화면에 입력하세요.</p>`
  });

  signupCodes.set(normalizedEmail, {
    code,
    expiresAt: Date.now() + signupCodeTtlMs,
    attempts: 0
  });

  return { ok: true, expires_in_seconds: signupCodeTtlMs / 1000 };
}

async function sendPasswordResetCode(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw httpError("사용할 수 없는 이메일 주소입니다.", 400);
  }

  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  await sendMail({
    to: normalizedEmail,
    subject: "[약-맵] 비밀번호 재설정 인증코드",
    text: `약-맵 비밀번호 재설정 인증코드입니다.\n\n인증코드: ${code}\n\n본인이 요청하지 않았다면 이 메일을 무시하세요.`,
    html: `<p>약-맵 비밀번호 재설정 인증코드입니다.</p><p style="font-size:24px;font-weight:700;">${code}</p><p>본인이 요청하지 않았다면 이 메일을 무시하세요.</p>`
  });

  return { ok: true, expires_in_seconds: signupCodeTtlMs / 1000 };
}

function verifySignupCode(email, code) {
  const normalizedEmail = normalizeEmail(email);
  const saved = signupCodes.get(normalizedEmail);
  if (!saved) throw httpError("인증코드를 먼저 이메일로 받아야 합니다.", 401);
  if (Date.now() > saved.expiresAt) {
    signupCodes.delete(normalizedEmail);
    throw httpError("인증코드가 만료되었습니다. 다시 요청하세요.", 401);
  }
  saved.attempts += 1;
  if (saved.attempts > 5) {
    signupCodes.delete(normalizedEmail);
    throw httpError("인증코드 입력 횟수를 초과했습니다. 다시 요청하세요.", 429);
  }
  if (normalizeVerificationCode(code) !== saved.code) {
    throw httpError("인증코드가 올바르지 않습니다.", 401);
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeVerificationCode(code) {
  return String(code || "").replace(/\D/g, "");
}

async function sendMail({ to, subject, text, html }) {
  const smtp = smtpConfig();
  const client = await createSmtpClient(smtp);
  try {
    await client.expect(220);
    await client.command(`EHLO ${smtp.localName}`);
    if (!smtp.secure) {
      await client.command("STARTTLS", 220);
      await client.upgradeTls(smtp.host);
      await client.command(`EHLO ${smtp.localName}`);
    }
    await client.command(`AUTH PLAIN ${Buffer.from(`\0${smtp.user}\0${smtp.pass}`).toString("base64")}`, 235);
    await client.command(`MAIL FROM:<${smtp.fromAddress}>`);
    await client.command(`RCPT TO:<${to}>`);
    await client.command("DATA", 354);
    await client.writeData(buildEmail({ from: smtp.from, to, subject, text, html }));
    await client.command("QUIT", 221).catch(() => {});
  } finally {
    client.close();
  }
}

function smtpConfig() {
  const host = env.SMTP_HOST || "";
  const user = env.SMTP_USER || "";
  const pass = env.SMTP_PASS || "";
  const from = env.SMTP_FROM || user;
  if (!host || !user || !pass || !from) {
    throw httpError("SMTP 설정이 필요합니다. .env에 SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM을 넣으세요.", 503);
  }
  const normalizedPass = isGmailSmtp(host) ? pass.replace(/\s+/g, "") : pass;
  if (isGmailSmtp(host) && normalizedPass.length !== 16) {
    throw httpError("Gmail SMTP_PASS는 Google 로그인 비밀번호가 아니라 16자리 앱 비밀번호여야 합니다.", 503);
  }
  return {
    host,
    port: Number(env.SMTP_PORT || 587),
    secure: String(env.SMTP_SECURE || "false") === "true",
    user,
    pass: normalizedPass,
    from,
    fromAddress: extractEmailAddress(from),
    localName: env.SMTP_LOCAL_NAME || "localhost"
  };
}

function isGmailSmtp(host) {
  return String(host || "").toLowerCase() === "smtp.gmail.com";
}

function extractEmailAddress(value) {
  const match = String(value).match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

function buildEmail({ from, to, subject, text, html }) {
  const boundary = `yakmap-${Date.now()}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${mimeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  ];
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${boundary}--`
  ];
  return dotStuff([...headers, "", ...body].join("\r\n"));
}

function mimeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value), "utf8").toString("base64")}?=`;
}

function dotStuff(message) {
  return message.replace(/^\./gm, "..");
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function createSmtpClient({ host, port, secure }) {
  let socket = secure
    ? tlsConnect({ host, port, servername: host })
    : netConnect({ host, port });
  let buffer = "";
  const waiters = [];

  attachSocket(socket);

  function attachSocket(nextSocket) {
    socket = nextSocket;
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      drainWaiters();
    });
    socket.on("error", (error) => {
      while (waiters.length) waiters.shift().reject(error);
    });
  }

  function drainWaiters() {
    for (let index = 0; index < waiters.length; index += 1) {
      const waiter = waiters[index];
      const response = readSmtpResponse();
      if (!response) break;
      waiters.splice(index, 1);
      index -= 1;
      waiter.resolve(response);
    }
  }

  function readSmtpResponse() {
    const lines = buffer.split(/\r?\n/);
    if (lines.length < 2) return null;
    let consumed = 0;
    const responseLines = [];
    for (const line of lines) {
      if (!line) break;
      consumed += line.length + 2;
      responseLines.push(line);
      if (/^\d{3} /.test(line)) {
        buffer = buffer.slice(consumed);
        return responseLines.join("\n");
      }
      if (!/^\d{3}-/.test(line)) break;
    }
    return null;
  }

  function nextResponse() {
    return new Promise((resolve, reject) => {
      waiters.push({ resolve, reject });
      drainWaiters();
    });
  }

  async function expect(code) {
    const response = await nextResponse();
    if (!response.startsWith(String(code))) throw new Error(`SMTP ${response}`);
    return response;
  }

  return {
    async command(command, okCode = 250) {
      socket.write(`${command}\r\n`);
      return expect(okCode);
    },
    async writeData(data) {
      socket.write(`${data}\r\n.\r\n`);
      return expect(250);
    },
    async upgradeTls(servername) {
      await new Promise((resolve, reject) => {
        const plainSocket = socket;
        plainSocket.removeAllListeners("data");
        plainSocket.removeAllListeners("error");
        const secured = tlsConnect({ socket: plainSocket, servername }, () => {
          attachSocket(secured);
          resolve();
        });
        secured.on("error", reject);
      });
    },
    expect,
    close() {
      socket.end();
    }
  };
}
