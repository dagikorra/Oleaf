const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "oleafcleaning@gmail.com";
const FROM_EMAIL = process.env.FROM_EMAIL || "oleafcleaning@gmail.com";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const OUTBOX_DIR = path.join(DATA_DIR, "outbox");
const RESERVATIONS_FILE = path.join(DATA_DIR, "reservations.json");
const DATABASE_URL = process.env.DATABASE_URL;
let dbPool;

const staffUsers = [
  {
    email: "oleafcleaning@gmail.com",
    password: process.env.ADMIN_PASSWORD || "cleaningv1",
    role: "admin",
    name: "Oleaf Admin"
  },
  {
    email: "cleaner@oleafcleaning.com",
    password: process.env.CLEANER_PASSWORD || "cleaningv1",
    role: "cleaner",
    name: "Oleaf Cleaner"
  }
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

function getDbPool() {
  if (!dbPool) {
    const { Pool } = require("pg");
    dbPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    });
  }

  return dbPool;
}

async function ensureDatabase() {
  if (!DATABASE_URL) {
    ensureStorage();
    return;
  }

  await getDbPool().query(`
    create table if not exists reservations (
      id text primary key,
      payload jsonb not null,
      created_at timestamptz not null default now()
    )
  `);
}

function ensureStorage() {
  fs.mkdirSync(OUTBOX_DIR, { recursive: true });
  if (!fs.existsSync(RESERVATIONS_FILE)) {
    fs.writeFileSync(RESERVATIONS_FILE, "[]\n");
  }
}

async function readReservations() {
  if (DATABASE_URL) {
    await ensureDatabase();
    const result = await getDbPool().query(
      "select payload from reservations order by created_at desc"
    );
    return result.rows.map((row) => row.payload);
  }

  ensureStorage();
  return JSON.parse(fs.readFileSync(RESERVATIONS_FILE, "utf8"));
}

async function writeReservations(reservations) {
  ensureStorage();
  fs.writeFileSync(RESERVATIONS_FILE, `${JSON.stringify(reservations, null, 2)}\n`);
}

async function saveReservation(reservation) {
  if (DATABASE_URL) {
    await ensureDatabase();
    await getDbPool().query(
      `
        insert into reservations (id, payload, created_at)
        values ($1, $2, $3)
        on conflict (id) do update set payload = excluded.payload
      `,
      [reservation.id, reservation, reservation.createdAt]
    );
    return;
  }

  const reservations = await readReservations();
  reservations.unshift(reservation);
  await writeReservations(reservations);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body is too large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validateReservation(payload) {
  const requiredFields = ["serviceLabel", "date", "time", "address", "customerEmail"];
  const missing = requiredFields.filter((field) => !String(payload[field] || "").trim());

  if (missing.length > 0) {
    return `Missing required field: ${missing[0]}`;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.customerEmail)) {
    return "Enter a valid customer email";
  }

  return "";
}

function emailTemplate(reservation, audience) {
  const subject = audience === "admin"
    ? `New Oleaf reservation: ${reservation.serviceLabel}`
    : `Your Oleaf Cleaning reservation is confirmed`;

  const lines = audience === "admin"
    ? [
        "A new reservation was completed.",
        "",
        `Reservation: ${reservation.id}`,
        `Service: ${reservation.serviceLabel}`,
        `Customer email: ${reservation.customerEmail}`,
        `Customer phone: ${reservation.customerPhone || "Not provided"}`,
        `Address: ${reservation.address}`,
        `Date/time: ${reservation.date} at ${reservation.time}`,
        `Rooms: ${reservation.rooms}`,
        `Payment: ${reservation.paymentMethod}`,
        `Estimate: ${reservation.estimate}`
      ]
    : [
        "Thanks for reserving with Oleaf Cleaning.",
        "",
        `Reservation: ${reservation.id}`,
        `Service: ${reservation.serviceLabel}`,
        `Address: ${reservation.address}`,
        `Date/time: ${reservation.date} at ${reservation.time}`,
        `Estimate: ${reservation.estimate}`,
        "",
        "We will notify you when your cleaner is assigned and when the job is completed."
      ];

  return {
    subject,
    text: lines.join("\n")
  };
}

async function deliverEmail({ to, subject, text }) {
  const smtpReady = process.env.SMTP_HOST && process.env.SMTP_PORT;

  if (smtpReady) {
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        : undefined
    });

    await transporter.sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      text
    });

    return { to, status: "sent" };
  }

  ensureStorage();
  const safeName = `${Date.now()}-${to.replace(/[^a-z0-9.-]/gi, "_")}.eml`;
  const filePath = path.join(OUTBOX_DIR, safeName);
  const email = [
    `From: ${FROM_EMAIL}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    text
  ].join("\n");

  fs.writeFileSync(filePath, email);
  return { to, status: "queued", file: path.relative(ROOT, filePath) };
}

async function createReservation(payload) {
  const validationError = validateReservation(payload);
  if (validationError) {
    return { error: validationError };
  }

  const reservation = {
    id: `OC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    serviceType: payload.serviceType,
    serviceLabel: payload.serviceLabel,
    date: payload.date,
    time: payload.time,
    address: payload.address,
    rooms: Number(payload.rooms || 1),
    customerEmail: normalizeEmail(payload.customerEmail),
    customerPhone: payload.customerPhone || "",
    paymentMethod: payload.paymentMethod || "card",
    estimate: payload.estimate || "Pending",
    status: "scheduled",
    createdAt: new Date().toISOString()
  };

  await saveReservation(reservation);

  const customerEmail = emailTemplate(reservation, "customer");
  const adminEmail = emailTemplate(reservation, "admin");
  const emails = await Promise.all([
    deliverEmail({ to: reservation.customerEmail, ...customerEmail }),
    deliverEmail({ to: ADMIN_EMAIL, ...adminEmail })
  ]);

  return { reservation, emails };
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(contents);
  });
}

async function handleApi(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  try {
    if (request.url === "/api/login" && request.method === "POST") {
      const payload = await readBody(request);
      const user = staffUsers.find((candidate) => (
        candidate.email === normalizeEmail(payload.email)
        && candidate.password === payload.password
        && candidate.role === payload.role
      ));

      if (!user) {
        sendJson(response, 401, { error: "Invalid staff login" });
        return;
      }

      sendJson(response, 200, {
        user: {
          email: user.email,
          role: user.role,
          name: user.name
        },
        token: crypto.randomUUID()
      });
      return;
    }

    if (request.url === "/api/reservations" && request.method === "GET") {
      sendJson(response, 200, { reservations: await readReservations() });
      return;
    }

    if (request.url === "/api/reservations" && request.method === "POST") {
      const result = await createReservation(await readBody(request));
      if (result.error) {
        sendJson(response, 400, { error: result.error });
        return;
      }
      sendJson(response, 201, result);
      return;
    }

    sendJson(response, 404, { error: "API route not found" });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

ensureDatabase().catch((error) => {
  console.error("Database initialization failed:", error.message);
});

http.createServer((request, response) => {
  if (request.url.startsWith("/api/")) {
    handleApi(request, response);
    return;
  }
  serveStatic(request, response);
}).listen(PORT, HOST, () => {
  console.log(`Oleaf Cleaning running at http://${HOST}:${PORT}`);
});
