import { createReadStream, existsSync } from "node:fs";
import { extname, normalize, resolve } from "node:path";
import { createServer } from "node:http";
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

  if (request.method === "POST" && (url.pathname === "/api/auth/signup" || url.pathname === "/api/auth/login")) {
    try {
      const mode = url.pathname.endsWith("signup") ? "signup" : "login";
      const result = await authWithSupabase(mode, await readJson(request), config);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 401, { error: error.message });
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
