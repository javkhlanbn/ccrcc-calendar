import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { procurementSeed } from "./procurementSeed.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

type UserStatus = "pending" | "approved" | "rejected";

const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "calendar";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin12345";

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
  charset: "utf8mb4",
  connectTimeout: 5000,
});

function toProfile(row: any) {
  return {
    uid: String(row.id),
    email: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: `${row.last_name} ${row.first_name}`.trim(),
    photoURL: row.photo_url || undefined,
    department: row.department,
    role: row.role,
    permissions: JSON.parse(row.permissions || "[]"),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function initDatabase() {
  const bootstrap = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    charset: "utf8mb4",
    connectTimeout: 5000,
  });

  try {
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    // Attachments (files/images) are stored as base64 data URLs inside JSON columns.
    // XAMPP's default max_allowed_packet is only 1 MB, which makes any attachment over
    // ~750 KB fail with a packet-too-large error. Raise it here so every save works.
    // This runs BEFORE the connection pool opens any connection, so all pooled
    // connections inherit the larger limit, and it re-applies on every server start.
    try {
      await bootstrap.query("SET GLOBAL max_allowed_packet = 268435456"); // 256 MB
    } catch (packetError) {
      console.warn("[DB] Could not raise max_allowed_packet (attachments may be limited):", packetError);
    }
  } finally {
    await bootstrap.end();
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(191) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      photo_url LONGTEXT NULL,
      department VARCHAR(255) NOT NULL,
      role ENUM('admin','user') NOT NULL DEFAULT 'user',
      permissions JSON NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url LONGTEXT NULL AFTER last_name");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSON NULL AFTER role");
  // Онлайн/офлайн төлөв — сүүлд идэвхтэй байсан цаг
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP NULL");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id VARCHAR(36) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status ENUM('Planning','Ongoing','Completed') NOT NULL DEFAULT 'Planning',
      tags JSON,
      visible_to_user_ids JSON,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id VARCHAR(36) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      date DATE NOT NULL,
      time VARCHAR(5) NULL,
      category ENUM('Project','Environmental','Internal','Birthday','Meeting','Report') NOT NULL,
      priority ENUM('Low','Medium','High') NOT NULL,
      birthday_user_id INT UNSIGNED NULL,
      project_id VARCHAR(36),
      tags JSON,
      attachments JSON,
      visible_to_user_ids JSON,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS attachments JSON NULL AFTER tags");
  await pool.query("ALTER TABLE events MODIFY COLUMN category ENUM('Project','Environmental','Internal','Birthday','Meeting','Report') NOT NULL");
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS time VARCHAR(5) NULL AFTER date");
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS birthday_user_id INT UNSIGNED NULL AFTER priority");
  // Хурлын нэмэлт талбарууд
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time VARCHAR(5) NULL AFTER time");
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS duration_minutes INT NULL AFTER end_time");
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence VARCHAR(20) NULL AFTER duration_minutes");
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS meeting_type VARCHAR(20) NULL AFTER recurrence");
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS location VARCHAR(255) NULL AFTER meeting_type");
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS attendee_user_ids JSON NULL AFTER location");
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS minutes_keeper_user_id VARCHAR(36) NULL AFTER attendee_user_ids");
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS series_id VARCHAR(36) NULL AFTER minutes_keeper_user_id");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id VARCHAR(36) PRIMARY KEY,
      project_id VARCHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      assigned_to_user_ids JSON,
      due_date DATE NOT NULL,
      status ENUM('Pending','InProgress','Completed') NOT NULL DEFAULT 'Pending',
      attachments JSON,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachments JSON NULL AFTER status");
  // Хурлаас өгсөн даалгавар төсөлгүй байж болно + эх сурвалж/оноосон хүнийг тэмдэглэнэ
  await pool.query("ALTER TABLE tasks MODIFY COLUMN project_id VARCHAR(36) NULL");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_label VARCHAR(255) NULL AFTER project_id");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_by_name VARCHAR(255) NULL AFTER source_label");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS procurement_plans (
      id VARCHAR(36) PRIMARY KEY,
      idx INT NULL,
      code VARCHAR(191),
      name TEXT,
      type VARCHAR(100),
      budget_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
      year_financing DECIMAL(15,2) NOT NULL DEFAULT 0,
      tender_method VARCHAR(255),
      tender_month VARCHAR(255),
      sustainable VARCHAR(100),
      notes TEXT,
      project_name VARCHAR(255),
      implement_period VARCHAR(255),
      committee_formed VARCHAR(255),
      advertised VARCHAR(255),
      tender_opened VARCHAR(255),
      committee_met VARCHAR(255),
      notice_sent VARCHAR(255),
      contract_signed VARCHAR(255),
      contract_value DECIMAL(15,2) NOT NULL DEFAULT 0,
      payment1 DECIMAL(15,2) NOT NULL DEFAULT 0,
      payment2 DECIMAL(15,2) NOT NULL DEFAULT 0,
      payment3 DECIMAL(15,2) NOT NULL DEFAULT 0,
      variance VARCHAR(255),
      extra_notes TEXT,
      visible_to_user_ids JSON,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query("ALTER TABLE procurement_plans ADD COLUMN IF NOT EXISTS editable_by_user_ids JSON NULL AFTER visible_to_user_ids");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_minutes (
      id VARCHAR(36) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      date DATE NOT NULL,
      time VARCHAR(5) NULL,
      attendee_user_ids JSON,
      agenda TEXT,
      decisions TEXT,
      notes TEXT,
      attachments JSON,
      visible_to_user_ids JSON,
      created_by VARCHAR(36) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Ажилчид хоорондын шууд зурвас
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(36) PRIMARY KEY,
      sender_id VARCHAR(36) NOT NULL,
      recipient_id VARCHAR(36) NOT NULL,
      content MEDIUMTEXT,
      attachments JSON,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_msg_recipient (recipient_id),
      INDEX idx_msg_pair (sender_id, recipient_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  // Миллисекунд нарийвчлал — нэг секундэд илгээсэн зурвасууд зөв эрэмбэлэгдэнэ
  await pool.query("ALTER TABLE messages MODIFY COLUMN created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");

  // Ажилтны хувийн хурлын тэмдэглэл (зөвхөн эзэнд нь харагдана)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS personal_meeting_notes (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      meeting_id VARCHAR(36) NULL,
      meeting_title VARCHAR(255) NOT NULL,
      meeting_date DATE NULL,
      notes MEDIUMTEXT,
      director_tasks MEDIUMTEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_personal_notes_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      user_name VARCHAR(255) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days INT NOT NULL DEFAULT 0,
      reason TEXT,
      status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
      year INT NOT NULL,
      reviewed_by VARCHAR(36) NULL,
      reviewed_by_name VARCHAR(255) NULL,
      reviewed_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_leave_user_year (user_id, year)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Жил бүрийн амралтын эрх — глобал өгөгдмөл (админ шинэчилж болно)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leave_settings (
      year INT PRIMARY KEY,
      days INT NOT NULL DEFAULT 15,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Ажилтан тус бүрийн амралтын хоног (override). Мөр байвал глобал өгөгдмөлийг дарж хэрэглэнэ.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leave_entitlements (
      user_id VARCHAR(36) NOT NULL,
      year INT NOT NULL,
      days INT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, year)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_signals (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      meeting_id VARCHAR(36) NULL,
      title VARCHAR(255) NOT NULL,
      meeting_time VARCHAR(5) NULL,
      started_by VARCHAR(36) NULL,
      started_by_name VARCHAR(255) NULL,
      started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Санал асуулга — асуулт, сонголтууд (JSON), тохиргоо
  await pool.query(`
    CREATE TABLE IF NOT EXISTS polls (
      id VARCHAR(36) PRIMARY KEY,
      question VARCHAR(500) NOT NULL,
      description TEXT,
      options LONGTEXT NOT NULL,
      allow_multiple TINYINT(1) NOT NULL DEFAULT 0,
      min_choices INT NULL,
      max_choices INT NULL,
      anonymous TINYINT(1) NOT NULL DEFAULT 0,
      visible_to_user_ids LONGTEXT NULL,
      status ENUM('open','closed') NOT NULL DEFAULT 'open',
      closes_at DATE NULL,
      created_by VARCHAR(36) NOT NULL,
      created_by_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMP NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Өмнө үүссэн polls хүснэгтэд сонголтын хязгаарын баганууд нэмэгдэнэ
  await pool.query("ALTER TABLE polls ADD COLUMN IF NOT EXISTS min_choices INT NULL AFTER allow_multiple");
  await pool.query("ALTER TABLE polls ADD COLUMN IF NOT EXISTS max_choices INT NULL AFTER min_choices");
  // Оролцох ажилчдын хязгаарлалт (хоосон/NULL = бүгдэд нээлттэй)
  await pool.query("ALTER TABLE polls ADD COLUMN IF NOT EXISTS visible_to_user_ids LONGTEXT NULL AFTER anonymous");

  // Санал асуулгын саналууд — нэг хүн нэг асуулгад нэг л удаа (дахин өгвөл сольж бичнэ)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS poll_votes (
      poll_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      user_name VARCHAR(255) NOT NULL,
      option_ids LONGTEXT NOT NULL,
      voted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (poll_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Ажлын төлөвлөгөө — жилийн/хагас жилийн/сарын/7 хоногийн хүснэгт, хэлтэс тус бүрээр.
  // Багана (columns_json) болон мөр (rows_json) нь чөлөөтэй нэмэгддэг тул JSON-оор хадгална.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS work_plans (
      id VARCHAR(36) PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      period_type ENUM('year','halfyear','month','week') NOT NULL DEFAULT 'month',
      plan_year INT NOT NULL,
      period_no INT NULL,
      start_date DATE NULL,
      end_date DATE NULL,
      department VARCHAR(255) NOT NULL,
      columns_json LONGTEXT NOT NULL,
      rows_json LONGTEXT NOT NULL,
      approved_by_title VARCHAR(500) NULL,
      approved_by_user_id VARCHAR(36) NULL,
      approved_by_name VARCHAR(255) NULL,
      approved_at TIMESTAMP NULL,
      reviewed_by_title VARCHAR(500) NULL,
      reviewed_by_user_id VARCHAR(36) NULL,
      reviewed_by_name VARCHAR(255) NULL,
      reviewed_at TIMESTAMP NULL,
      compiled_by_user_id VARCHAR(36) NULL,
      compiled_by_name VARCHAR(255) NULL,
      compiled_at TIMESTAMP NULL,
      visible_to_user_ids LONGTEXT NULL,
      editable_by_user_ids LONGTEXT NULL,
      visible_to_departments LONGTEXT NULL,
      editable_by_departments LONGTEXT NULL,
      created_by VARCHAR(36) NOT NULL,
      created_by_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Гарын үсгийг бүртгэлтэй ажилтнаар сонгож баталгаажуулах баганууд (хуучин хүснэгтэд нэмэгдэнэ)
  await pool.query("ALTER TABLE work_plans ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(36) NULL AFTER approved_by_title");
  await pool.query("ALTER TABLE work_plans ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL AFTER approved_by_name");
  await pool.query("ALTER TABLE work_plans ADD COLUMN IF NOT EXISTS reviewed_by_user_id VARCHAR(36) NULL AFTER reviewed_by_title");
  await pool.query("ALTER TABLE work_plans ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP NULL AFTER reviewed_by_name");
  await pool.query("ALTER TABLE work_plans ADD COLUMN IF NOT EXISTS compiled_by_user_id VARCHAR(36) NULL AFTER reviewed_at");
  await pool.query("ALTER TABLE work_plans ADD COLUMN IF NOT EXISTS compiled_at TIMESTAMP NULL AFTER compiled_by_name");

  // Seed the procurement plan with the 2026 data from the Excel file (only when empty).
  const [procCountRows] = await pool.query<any[]>("SELECT COUNT(*) AS count FROM procurement_plans");
  if (!Array.isArray(procCountRows) || Number(procCountRows[0]?.count || 0) === 0) {
    for (const row of procurementSeed) {
      const id = `seed-${row.idx ?? Math.random().toString(36).slice(2, 9)}-${Math.random().toString(36).slice(2, 7)}`;
      await pool.query(
        `INSERT INTO procurement_plans
          (id, idx, code, name, type, budget_cost, year_financing, tender_method, tender_month, sustainable, notes,
           project_name, implement_period, committee_formed, advertised, tender_opened, committee_met, notice_sent,
           contract_signed, contract_value, payment1, payment2, payment3, variance, extra_notes, visible_to_user_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, row.idx, row.code, row.name, row.type, row.budgetCost, row.yearFinancing, row.tenderMethod,
          row.tenderMonth, row.sustainable, row.notes, row.projectName, row.implementPeriod, row.committeeFormed,
          row.advertised, row.tenderOpened, row.committeeMet, row.noticeSent, row.contractSigned, row.contractValue,
          row.payment1, row.payment2, row.payment3, row.variance, row.extraNotes, JSON.stringify([]),
        ]
      );
    }
  }

  const [adminRows] = await pool.query<any[]>("SELECT id FROM users WHERE username = ? LIMIT 1", [ADMIN_USERNAME]);
  if (!Array.isArray(adminRows) || adminRows.length === 0) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await pool.query(
      `INSERT INTO users (username, password_hash, first_name, last_name, department, role, status)
       VALUES (?, ?, ?, ?, ?, 'admin', 'approved')`,
      [ADMIN_USERNAME, passwordHash, "System", "Admin", "Захиргаа, санхүүгийн хэлтэс"]
    );
  }
}

async function startServer() {
  await initDatabase();

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  const isProd = process.env.NODE_ENV === "production";

  // Продакшнд аюулгүй байдлын анхааруулга
  if (isProd) {
    if (ADMIN_PASSWORD === "admin12345") {
      console.warn("[SECURITY] ADMIN_PASSWORD анхдагч утгатай байна. .env.production дээр заавал өөрчилнө үү!");
    }
    if (!DB_PASSWORD) {
      console.warn("[SECURITY] Өгөгдлийн сангийн нууц үг хоосон байна. Продакшнд заавал тавина уу!");
    }
  }

  // Middleware — base64 хавсралт зөвшөөрөх боловч хэт том payload-оос сэргийлж хязгаарлана
  const BODY_LIMIT = process.env.BODY_LIMIT || "40mb";
  app.use(express.json({ limit: BODY_LIMIT }));

  // Аюулгүй байдлын үндсэн толгойнууд
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "0");
    if (isProd) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  // Нэвтрэх/бүртгүүлэх хүсэлтэд энгийн rate limit (brute-force-оос сэргийлнэ)
  const authHits = new Map<string, { count: number; resetAt: number }>();
  const AUTH_WINDOW_MS = 60_000;
  const AUTH_MAX = 10; // 1 минутад IP-гээс дээд тал нь 10 оролдлого
  const authRateLimit = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
    const now = Date.now();
    const entry = authHits.get(ip);
    if (!entry || now > entry.resetAt) {
      authHits.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    } else {
      entry.count += 1;
      if (entry.count > AUTH_MAX) {
        return res.status(429).json({ message: "Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу." });
      }
    }
    next();
  };

  // API routes
  app.get("/api/health", async (req, res) => {
    try {
      const conn = await pool.getConnection();
      await conn.query("SELECT 1");
      conn.release();
      res.json({
        status: "ok",
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
        database: "connected",
      });
    } catch (error) {
      // Продакшнд алдааны дэлгэрэнгүйг задлахгүй
      if (!isProd) console.error("Health check DB error:", error);
      res.status(503).json({
        status: "error",
        database: "disconnected",
      });
    }
  });

  app.post("/api/auth/register", authRateLimit, async (req, res) => {
    try {
      const { username, password, firstName, lastName, department } = req.body || {};

      if (!username || !password || !firstName || !lastName || !department) {
        return res.status(400).json({ message: "Бүх талбарыг бөглөнө үү." });
      }

      const normalizedUsername = String(username).trim().toLowerCase();
      if (normalizedUsername.includes("@")) {
        return res.status(400).json({ message: "Нэвтрэх нэрэнд @ тэмдэгт ашиглахгүй." });
      }

      const [exists] = await pool.query<any[]>("SELECT id FROM users WHERE username = ? LIMIT 1", [normalizedUsername]);
      if (Array.isArray(exists) && exists.length > 0) {
        return res.status(409).json({ message: "Энэ нэвтрэх нэр бүртгэлтэй байна." });
      }

      const passwordHash = await bcrypt.hash(String(password), 10);
      await pool.query(
        `INSERT INTO users (username, password_hash, first_name, last_name, department, role, status)
         VALUES (?, ?, ?, ?, ?, 'user', 'pending')`,
        [normalizedUsername, passwordHash, String(firstName).trim(), String(lastName).trim(), String(department).trim()]
      );

      const [rows] = await pool.query<any[]>("SELECT * FROM users WHERE username = ? LIMIT 1", [normalizedUsername]);
      const profile = toProfile(rows[0]);
      return res.status(201).json({ user: { uid: profile.uid, email: profile.email, displayName: profile.displayName, photoURL: profile.photoURL || null }, profile });
    } catch (error) {
      console.error("Register error:", error);
      return res.status(500).json({ message: "Бүртгэл үүсгэх үед алдаа гарлаа." });
    }
  });

  app.post("/api/auth/login", authRateLimit, async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ message: "Нэвтрэх нэр болон нууц үгээ оруулна уу." });
      }

      const normalizedUsername = String(username).trim().toLowerCase();
      const [rows] = await pool.query<any[]>("SELECT * FROM users WHERE username = ? LIMIT 1", [normalizedUsername]);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(401).json({ message: "Нэвтрэх нэр эсвэл нууц үг буруу байна." });
      }

      const userRow = rows[0];
      const match = await bcrypt.compare(String(password), userRow.password_hash);
      if (!match) {
        return res.status(401).json({ message: "Нэвтрэх нэр эсвэл нууц үг буруу байна." });
      }

      const profile = toProfile(userRow);
      return res.json({ user: { uid: profile.uid, email: profile.email, displayName: profile.displayName, photoURL: profile.photoURL || null }, profile });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Нэвтрэх үед алдаа гарлаа." });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const { username, password, firstName, lastName, department, role, permissions } = req.body || {};

      if (!username || !password || !firstName || !lastName || !department) {
        return res.status(400).json({ message: "Бүх талбарыг бөглөнө үү." });
      }

      const normalizedUsername = String(username).trim().toLowerCase();
      if (normalizedUsername.includes("@")) {
        return res.status(400).json({ message: "Нэвтрэх нэрэнд @ тэмдэгт ашиглахгүй." });
      }

      if (String(password).trim().length < 6) {
        return res.status(400).json({ message: "Нууц үг хамгийн багадаа 6 тэмдэгт байна." });
      }

      const finalRole = role === "admin" ? "admin" : "user";
      const finalPermissions = Array.isArray(permissions)
        ? permissions.filter((p: string) => ["procurement", "procurement_view", "meeting", "minutes"].includes(p))
        : [];

      const [exists] = await pool.query<any[]>("SELECT id FROM users WHERE username = ? LIMIT 1", [normalizedUsername]);
      if (Array.isArray(exists) && exists.length > 0) {
        return res.status(409).json({ message: "Энэ нэвтрэх нэр бүртгэлтэй байна." });
      }

      const passwordHash = await bcrypt.hash(String(password), 10);
      await pool.query(
        `INSERT INTO users (username, password_hash, first_name, last_name, department, role, permissions, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')`,
        [normalizedUsername, passwordHash, String(firstName).trim(), String(lastName).trim(), String(department).trim(), finalRole, JSON.stringify(finalPermissions)]
      );

      const [rows] = await pool.query<any[]>("SELECT * FROM users WHERE username = ? LIMIT 1", [normalizedUsername]);
      return res.status(201).json({ success: true, profile: toProfile(rows[0]) });
    } catch (error) {
      console.error("Create user error:", error);
      return res.status(500).json({ message: "Хэрэглэгч нэмэх үед алдаа гарлаа." });
    }
  });

  app.get("/api/users", async (_req, res) => {
    try {
      const [rows] = await pool.query<any[]>("SELECT * FROM users ORDER BY created_at DESC");
      return res.json((rows || []).map((row) => toProfile(row)));
    } catch (error) {
      console.error("Fetch users error:", error);
      return res.status(500).json({ message: "Хэрэглэгчдийн жагсаалт авах үед алдаа гарлаа." });
    }
  });

  app.patch("/api/users/:uid/status", async (req, res) => {
    try {
      const { uid } = req.params;
      const { status } = req.body as { status?: UserStatus };
      if (!status || !["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Төлөв буруу байна." });
      }

      await pool.query("UPDATE users SET status = ? WHERE id = ?", [status, Number(uid)]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Update user status error:", error);
      return res.status(500).json({ message: "Хэрэглэгчийн төлөв шинэчлэх үед алдаа гарлаа." });
    }
  });

  app.patch("/api/users/:uid", async (req, res) => {
    try {
      const { uid } = req.params;
      const { email, firstName, lastName, department, password, role, permissions } = req.body as {
        email?: string;
        firstName?: string;
        lastName?: string;
        department?: string;
        password?: string;
        role?: string;
        permissions?: string[];
      };

      if (!firstName || !lastName || !department) {
        return res.status(400).json({ message: "Нэр болон хэлтсийн мэдээллийг бүрэн оруулна уу." });
      }

      const updates = [
        "first_name = ?",
        "last_name = ?",
        "department = ?",
      ];
      const params: Array<string> = [
        String(firstName).trim(),
        String(lastName).trim(),
        String(department).trim(),
      ];

      if (email !== undefined) {
        const normalizedUsername = String(email).trim().toLowerCase();
        if (!normalizedUsername) {
          return res.status(400).json({ message: "Нэвтрэх нэрээ оруулна уу." });
        }
        if (normalizedUsername.includes("@")) {
          return res.status(400).json({ message: "Нэвтрэх нэрэнд @ тэмдэгт ашиглахгүй." });
        }

        const [dup] = await pool.query<any[]>(
          "SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1",
          [normalizedUsername, Number(uid)]
        );
        if (Array.isArray(dup) && dup.length > 0) {
          return res.status(409).json({ message: "Энэ нэвтрэх нэр бүртгэлтэй байна." });
        }

        updates.push("username = ?");
        params.push(normalizedUsername);
      }

      if (role !== undefined) {
        if (!["admin", "user"].includes(role)) {
          return res.status(400).json({ message: "Хэрэглэгчийн эрх буруу байна." });
        }
        updates.push("role = ?");
        params.push(role);
      }

      if (permissions !== undefined) {
        if (!Array.isArray(permissions) || permissions.some(p => !["procurement", "procurement_view", "meeting", "minutes"].includes(p))) {
          return res.status(400).json({ message: "Хандалтын эрх буруу байна." });
        }
        updates.push("permissions = ?");
        params.push(JSON.stringify(permissions));
      }

      if (password && String(password).trim().length > 0) {
        if (String(password).trim().length < 6) {
          return res.status(400).json({ message: "Нууц үг хамгийн багадаа 6 тэмдэгт байна." });
        }

        const passwordHash = await bcrypt.hash(String(password), 10);
        updates.push("password_hash = ?");
        params.push(passwordHash);
      }

      await pool.query(
        `UPDATE users SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...params, Number(uid)]
      );

      const [rows] = await pool.query<any[]>("SELECT * FROM users WHERE id = ? LIMIT 1", [Number(uid)]);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ message: "Хэрэглэгч олдсонгүй." });
      }

      return res.json({ success: true, profile: toProfile(rows[0]) });
    } catch (error) {
      console.error("Update user profile error:", error);
      return res.status(500).json({ message: "Хэрэглэгчийн мэдээлэл шинэчлэх үед алдаа гарлаа." });
    }
  });

  app.patch("/api/users/:uid/photo", async (req, res) => {
    try {
      const { uid } = req.params;
      const { photoURL } = req.body as { photoURL?: string };

      if (!photoURL || typeof photoURL !== "string") {
        return res.status(400).json({ message: "Зургийн мэдээлэл буруу байна." });
      }

      await pool.query("UPDATE users SET photo_url = ? WHERE id = ?", [photoURL, Number(uid)]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Update user photo error:", error);
      return res.status(500).json({ message: "Профайл зураг шинэчлэх үед алдаа гарлаа." });
    }
  });

  app.delete("/api/users/:uid", async (req, res) => {
    try {
      const { uid } = req.params;

      const [rows] = await pool.query<any[]>("SELECT id, role FROM users WHERE id = ? LIMIT 1", [Number(uid)]);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ message: "Хэрэглэгч олдсонгүй." });
      }

      // Сүүлчийн админыг устгуулж систем цоожлуулахаас сэргийлнэ
      if (rows[0].role === "admin") {
        const [admins] = await pool.query<any[]>("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
        if (Number(admins[0]?.count || 0) <= 1) {
          return res.status(400).json({ message: "Сүүлчийн админ хэрэглэгчийг устгах боломжгүй." });
        }
      }

      await pool.query("DELETE FROM users WHERE id = ?", [Number(uid)]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete user error:", error);
      return res.status(500).json({ message: "Хэрэглэгч устгах үед алдаа гарлаа." });
    }
  });

  // Projects API
  app.get("/api/projects", async (req, res) => {
    try {
      const [rows] = await pool.query<any[]>("SELECT * FROM projects ORDER BY created_at DESC");
      return res.json((rows || []).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status,
        tags: JSON.parse(row.tags || "[]"),
        visibleToUserIds: JSON.parse(row.visible_to_user_ids || "[]"),
      })));
    } catch (error) {
      console.error("Fetch projects error:", error);
      return res.status(500).json({ message: "Төслүүдийн жагсаалт авах үед алдаа гарлаа." });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const { id, title, description, startDate, endDate, status, tags, visibleToUserIds } = req.body;
      if (!id || !title || !startDate || !endDate) {
        return res.status(400).json({ message: "Үндсэн талбарыг бөглөнө үү." });
      }

      await pool.query(
        `INSERT INTO projects (id, title, description, start_date, end_date, status, tags, visible_to_user_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, title, description || "", startDate, endDate, status, JSON.stringify(tags || []), JSON.stringify(visibleToUserIds || [])]
      );

      return res.status(201).json({ success: true, id });
    } catch (error) {
      console.error("Create project error:", error);
      return res.status(500).json({ message: "Төсөл үүсгэх үед алдаа гарлаа." });
    }
  });

  app.put("/api/projects/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, startDate, endDate, status, tags, visibleToUserIds } = req.body;

      await pool.query(
        `UPDATE projects SET title = ?, description = ?, start_date = ?, end_date = ?, status = ?, tags = ?, visible_to_user_ids = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [title, description || "", startDate, endDate, status, JSON.stringify(tags || []), JSON.stringify(visibleToUserIds || []), id]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("Update project error:", error);
      return res.status(500).json({ message: "Төсөл өөрчлөх үед алдаа гарлаа." });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query("DELETE FROM projects WHERE id = ?", [id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete project error:", error);
      return res.status(500).json({ message: "Төсөл устгах үед алдаа гарлаа." });
    }
  });

  // Events API
  app.get("/api/events", async (req, res) => {
    try {
      const [rows] = await pool.query<any[]>("SELECT * FROM events ORDER BY date DESC");
      return res.json((rows || []).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        date: row.date,
        time: row.time || undefined,
        category: row.category,
        priority: row.priority,
        birthdayUserId: row.birthday_user_id ? String(row.birthday_user_id) : undefined,
        projectId: row.project_id,
        tags: JSON.parse(row.tags || "[]"),
        attachments: JSON.parse(row.attachments || "[]"),
        visibleToUserIds: JSON.parse(row.visible_to_user_ids || "[]"),
        endTime: row.end_time || undefined,
        durationMinutes: row.duration_minutes === null || row.duration_minutes === undefined ? undefined : Number(row.duration_minutes),
        recurrence: row.recurrence || undefined,
        meetingType: row.meeting_type || undefined,
        location: row.location || undefined,
        attendeeUserIds: JSON.parse(row.attendee_user_ids || "[]"),
        minutesKeeperUserId: row.minutes_keeper_user_id || undefined,
        seriesId: row.series_id || undefined,
      })));
    } catch (error) {
      console.error("Fetch events error:", error);
      return res.status(500).json({ message: "Арга хэмжээнүүдийн жагсаалт авах үед алдаа гарлаа." });
    }
  });

  app.post("/api/events", async (req, res) => {
    try {
      const { id, title, description, date, time, category, priority, birthdayUserId, projectId, tags, attachments, visibleToUserIds,
        endTime, durationMinutes, recurrence, meetingType, location, attendeeUserIds, minutesKeeperUserId, seriesId } = req.body;
      if (!id || !date || !category) {
        return res.status(400).json({ message: "Үндсэн талбарыг бөглөнө үү." });
      }

      if (category === 'Birthday' && !birthdayUserId) {
        return res.status(400).json({ message: "Төрсөн өдрийн хэрэглэгчийг сонгоно уу." });
      }

      if (category === 'Meeting' && !time) {
        return res.status(400).json({ message: "Хурлын эхлэх цагийг заавал оруулна уу." });
      }

      const normalizedTitle = String(title || '').trim();
      const finalTitle = normalizedTitle || (category === 'Birthday' ? 'Birthday' : 'Untitled Event');

      await pool.query(
        `INSERT INTO events (id, title, description, date, time, category, priority, birthday_user_id, project_id, tags, attachments, visible_to_user_ids,
          end_time, duration_minutes, recurrence, meeting_type, location, attendee_user_ids, minutes_keeper_user_id, series_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, finalTitle, description || "", date, time || null, category, priority, birthdayUserId ? Number(birthdayUserId) : null, projectId || null, JSON.stringify(tags || []), JSON.stringify(attachments || []), JSON.stringify(visibleToUserIds || []),
          endTime || null, durationMinutes ?? null, recurrence || null, meetingType || null, location || null, JSON.stringify(attendeeUserIds || []), minutesKeeperUserId || null, seriesId || null]
      );

      return res.status(201).json({ success: true, id });
    } catch (error) {
      console.error("Create event error:", error);
      return res.status(500).json({ message: "Арга хэмжээ үүсгэх үед алдаа гарлаа." });
    }
  });

  app.put("/api/events/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, date, time, category, priority, birthdayUserId, projectId, tags, attachments, visibleToUserIds,
        endTime, durationMinutes, recurrence, meetingType, location, attendeeUserIds, minutesKeeperUserId, seriesId } = req.body;

      if (category === 'Meeting' && !time) {
        return res.status(400).json({ message: "Хурлын эхлэх цагийг заавал оруулна уу." });
      }

      await pool.query(
        `UPDATE events SET title = ?, description = ?, date = ?, time = ?, category = ?, priority = ?, birthday_user_id = ?, project_id = ?, tags = ?, attachments = ?, visible_to_user_ids = ?,
          end_time = ?, duration_minutes = ?, recurrence = ?, meeting_type = ?, location = ?, attendee_user_ids = ?, minutes_keeper_user_id = ?, series_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [title, description || "", date, time || null, category, priority, birthdayUserId ? Number(birthdayUserId) : null, projectId || null, JSON.stringify(tags || []), JSON.stringify(attachments || []), JSON.stringify(visibleToUserIds || []),
          endTime || null, durationMinutes ?? null, recurrence || null, meetingType || null, location || null, JSON.stringify(attendeeUserIds || []), minutesKeeperUserId || null, seriesId || null, id]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("Update event error:", error);
      return res.status(500).json({ message: "Арга хэмжээ өөрчлөх үед алдаа гарлаа." });
    }
  });

  app.delete("/api/events/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query("DELETE FROM events WHERE id = ?", [id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete event error:", error);
      return res.status(500).json({ message: "Арга хэмжээ устгах үед алдаа гарлаа." });
    }
  });

  // Tasks API
  app.get("/api/tasks", async (_req, res) => {
    try {
      const [rows] = await pool.query<any[]>("SELECT * FROM tasks ORDER BY due_date ASC");
      return res.json((rows || []).map((row) => ({
        id: row.id,
        projectId: row.project_id || "",
        sourceLabel: row.source_label || undefined,
        assignedByName: row.assigned_by_name || undefined,
        title: row.title,
        description: row.description || "",
        assignedToUserIds: JSON.parse(row.assigned_to_user_ids || "[]"),
        dueDate: row.due_date instanceof Date
          ? `${row.due_date.getFullYear()}-${String(row.due_date.getMonth() + 1).padStart(2, "0")}-${String(row.due_date.getDate()).padStart(2, "0")}`
          : String(row.due_date).slice(0, 10),
        status: row.status,
        attachments: JSON.parse(row.attachments || "[]"),
        createdAt: new Date(row.created_at).toISOString(),
      })));
    } catch (error) {
      console.error("Fetch tasks error:", error);
      return res.status(500).json({ message: "Даалгаврын жагсаалт авах үед алдаа гарлаа." });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const { id, projectId, sourceLabel, assignedByName, title, description, assignedToUserIds, dueDate, status, attachments } = req.body;
      // Хурлаас өгсөн даалгавар төсөлгүй байж болно — projectId заавал шаардахгүй
      if (!id || !title || !dueDate) {
        return res.status(400).json({ message: "Үндсэн талбарыг бөглөнө үү." });
      }

      await pool.query(
        `INSERT INTO tasks (id, project_id, source_label, assigned_by_name, title, description, assigned_to_user_ids, due_date, status, attachments)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId || null, sourceLabel || null, assignedByName || null, title, description || "", JSON.stringify(assignedToUserIds || []), dueDate, status || "Pending", JSON.stringify(attachments || [])]
      );

      return res.status(201).json({ success: true, id });
    } catch (error) {
      console.error("Create task error:", error);
      return res.status(500).json({ message: "Даалгавар үүсгэх үед алдаа гарлаа." });
    }
  });

  app.put("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { projectId, title, description, assignedToUserIds, dueDate, status, attachments } = req.body;

      await pool.query(
        `UPDATE tasks SET project_id = ?, title = ?, description = ?, assigned_to_user_ids = ?, due_date = ?, status = ?, attachments = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [projectId, title, description || "", JSON.stringify(assignedToUserIds || []), dueDate, status, JSON.stringify(attachments || []), id]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("Update task error:", error);
      return res.status(500).json({ message: "Даалгавар өөрчлөх үед алдаа гарлаа." });
    }
  });

  app.patch("/api/tasks/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body as { status?: string };
      if (!status || !["Pending", "InProgress", "Completed"].includes(status)) {
        return res.status(400).json({ message: "Төлөв буруу байна." });
      }

      await pool.query("UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Update task status error:", error);
      return res.status(500).json({ message: "Даалгаврын төлөв шинэчлэх үед алдаа гарлаа." });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query("DELETE FROM tasks WHERE id = ?", [id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete task error:", error);
      return res.status(500).json({ message: "Даалгавар устгах үед алдаа гарлаа." });
    }
  });

  // Procurement plans API
  const mapProcurementRow = (row: any) => ({
    id: row.id,
    idx: row.idx === null || row.idx === undefined ? null : Number(row.idx),
    code: row.code || "",
    name: row.name || "",
    type: row.type || "",
    budgetCost: Number(row.budget_cost || 0),
    yearFinancing: Number(row.year_financing || 0),
    tenderMethod: row.tender_method || "",
    tenderMonth: row.tender_month || "",
    sustainable: row.sustainable || "",
    notes: row.notes || "",
    projectName: row.project_name || "",
    implementPeriod: row.implement_period || "",
    committeeFormed: row.committee_formed || "",
    advertised: row.advertised || "",
    tenderOpened: row.tender_opened || "",
    committeeMet: row.committee_met || "",
    noticeSent: row.notice_sent || "",
    contractSigned: row.contract_signed || "",
    contractValue: Number(row.contract_value || 0),
    payment1: Number(row.payment1 || 0),
    payment2: Number(row.payment2 || 0),
    payment3: Number(row.payment3 || 0),
    variance: row.variance || "",
    extraNotes: row.extra_notes || "",
    visibleToUserIds: JSON.parse(row.visible_to_user_ids || "[]"),
    editableByUserIds: JSON.parse(row.editable_by_user_ids || "[]"),
  });

  const procurementParams = (body: any) => [
    body.idx === null || body.idx === undefined || body.idx === "" ? null : Number(body.idx),
    body.code || "",
    body.name || "",
    body.type || "",
    Number(body.budgetCost || 0),
    Number(body.yearFinancing || 0),
    body.tenderMethod || "",
    body.tenderMonth || "",
    body.sustainable || "",
    body.notes || "",
    body.projectName || "",
    body.implementPeriod || "",
    body.committeeFormed || "",
    body.advertised || "",
    body.tenderOpened || "",
    body.committeeMet || "",
    body.noticeSent || "",
    body.contractSigned || "",
    Number(body.contractValue || 0),
    Number(body.payment1 || 0),
    Number(body.payment2 || 0),
    Number(body.payment3 || 0),
    body.variance || "",
    body.extraNotes || "",
    JSON.stringify(body.visibleToUserIds || []),
    JSON.stringify(body.editableByUserIds || []),
  ];

  app.get("/api/procurement-plans", async (_req, res) => {
    try {
      const [rows] = await pool.query<any[]>("SELECT * FROM procurement_plans ORDER BY idx ASC, created_at ASC");
      return res.json((rows || []).map(mapProcurementRow));
    } catch (error) {
      console.error("Fetch procurement plans error:", error);
      return res.status(500).json({ message: "Худалдан авах ажиллагааны төлөвлөгөө авах үед алдаа гарлаа." });
    }
  });

  app.post("/api/procurement-plans", async (req, res) => {
    try {
      const { id, name } = req.body || {};
      if (!id || !String(name || "").trim()) {
        return res.status(400).json({ message: "Худалдан авах бараа/үйлчилгээний нэрийг оруулна уу." });
      }

      await pool.query(
        `INSERT INTO procurement_plans
          (id, idx, code, name, type, budget_cost, year_financing, tender_method, tender_month, sustainable, notes,
           project_name, implement_period, committee_formed, advertised, tender_opened, committee_met, notice_sent,
           contract_signed, contract_value, payment1, payment2, payment3, variance, extra_notes, visible_to_user_ids,
           editable_by_user_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, ...procurementParams(req.body)]
      );

      return res.status(201).json({ success: true, id });
    } catch (error) {
      console.error("Create procurement plan error:", error);
      return res.status(500).json({ message: "Худалдан авах ажиллагааны мэдээлэл нэмэх үед алдаа гарлаа." });
    }
  });

  app.put("/api/procurement-plans/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query(
        `UPDATE procurement_plans SET
           idx = ?, code = ?, name = ?, type = ?, budget_cost = ?, year_financing = ?, tender_method = ?,
           tender_month = ?, sustainable = ?, notes = ?, project_name = ?, implement_period = ?, committee_formed = ?,
           advertised = ?, tender_opened = ?, committee_met = ?, notice_sent = ?, contract_signed = ?,
           contract_value = ?, payment1 = ?, payment2 = ?, payment3 = ?, variance = ?, extra_notes = ?,
           visible_to_user_ids = ?, editable_by_user_ids = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [...procurementParams(req.body), id]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("Update procurement plan error:", error);
      return res.status(500).json({ message: "Худалдан авах ажиллагааны мэдээлэл засах үед алдаа гарлаа." });
    }
  });

  app.delete("/api/procurement-plans/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query("DELETE FROM procurement_plans WHERE id = ?", [id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete procurement plan error:", error);
      return res.status(500).json({ message: "Худалдан авах ажиллагааны мэдээлэл устгах үед алдаа гарлаа." });
    }
  });

  // Meeting minutes API
  // DATE баганыг локал цагаар форматлана (toISOString нь UTC руу шилжүүлж өдөр хойшлуулдаг)
  const formatLocalDate = (value: any) => {
    if (value instanceof Date) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    }
    return String(value).slice(0, 10);
  };

  const mapMinutesRow = (row: any) => ({
    id: row.id,
    title: row.title,
    date: formatLocalDate(row.date),
    time: row.time || undefined,
    attendeeUserIds: JSON.parse(row.attendee_user_ids || "[]"),
    agenda: row.agenda || "",
    decisions: row.decisions || "",
    notes: row.notes || "",
    attachments: JSON.parse(row.attachments || "[]"),
    visibleToUserIds: JSON.parse(row.visible_to_user_ids || "[]"),
    createdBy: row.created_by ? String(row.created_by) : undefined,
  });

  app.get("/api/meeting-minutes", async (_req, res) => {
    try {
      const [rows] = await pool.query<any[]>("SELECT * FROM meeting_minutes ORDER BY date DESC, created_at DESC");
      return res.json((rows || []).map(mapMinutesRow));
    } catch (error) {
      console.error("Fetch meeting minutes error:", error);
      return res.status(500).json({ message: "Хурлын тэмдэглэл авах үед алдаа гарлаа." });
    }
  });

  app.post("/api/meeting-minutes", async (req, res) => {
    try {
      const { id, title, date, time, attendeeUserIds, agenda, decisions, notes, attachments, visibleToUserIds, createdBy } = req.body || {};
      if (!id || !String(title || "").trim() || !date) {
        return res.status(400).json({ message: "Хурлын нэр болон огноог оруулна уу." });
      }

      await pool.query(
        `INSERT INTO meeting_minutes (id, title, date, time, attendee_user_ids, agenda, decisions, notes, attachments, visible_to_user_ids, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, String(title).trim(), date, time || null, JSON.stringify(attendeeUserIds || []), agenda || "", decisions || "", notes || "", JSON.stringify(attachments || []), JSON.stringify(visibleToUserIds || []), createdBy || null]
      );

      return res.status(201).json({ success: true, id });
    } catch (error) {
      console.error("Create meeting minutes error:", error);
      return res.status(500).json({ message: "Хурлын тэмдэглэл нэмэх үед алдаа гарлаа." });
    }
  });

  app.put("/api/meeting-minutes/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { title, date, time, attendeeUserIds, agenda, decisions, notes, attachments, visibleToUserIds } = req.body || {};

      if (!String(title || "").trim() || !date) {
        return res.status(400).json({ message: "Хурлын нэр болон огноог оруулна уу." });
      }

      await pool.query(
        `UPDATE meeting_minutes SET title = ?, date = ?, time = ?, attendee_user_ids = ?, agenda = ?, decisions = ?, notes = ?, attachments = ?, visible_to_user_ids = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [String(title).trim(), date, time || null, JSON.stringify(attendeeUserIds || []), agenda || "", decisions || "", notes || "", JSON.stringify(attachments || []), JSON.stringify(visibleToUserIds || []), id]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("Update meeting minutes error:", error);
      return res.status(500).json({ message: "Хурлын тэмдэглэл засах үед алдаа гарлаа." });
    }
  });

  app.delete("/api/meeting-minutes/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query("DELETE FROM meeting_minutes WHERE id = ?", [id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete meeting minutes error:", error);
      return res.status(500).json({ message: "Хурлын тэмдэглэл устгах үед алдаа гарлаа." });
    }
  });

  // ===== Онлайн төлөв (presence) API =====
  const ONLINE_THRESHOLD_SECONDS = 45; // сүүлийн дохиогоос хойш ийм секундын дотор бол онлайн

  app.post("/api/presence/heartbeat", async (req, res) => {
    try {
      const userId = String(req.body?.userId || "").trim();
      if (!userId) return res.status(400).json({ message: "Хэрэглэгч тодорхойгүй байна." });
      await pool.query("UPDATE users SET last_seen = NOW() WHERE id = ?", [Number(userId)]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Heartbeat error:", error);
      return res.status(500).json({ message: "Төлөв шинэчлэх үед алдаа гарлаа." });
    }
  });

  app.get("/api/presence", async (_req, res) => {
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT id, last_seen,
                (last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, last_seen, NOW()) <= ?) AS online
         FROM users`,
        [ONLINE_THRESHOLD_SECONDS]
      );
      return res.json((rows || []).map((row) => ({
        userId: String(row.id),
        online: !!Number(row.online),
        lastSeen: row.last_seen ? new Date(row.last_seen).toISOString() : undefined,
      })));
    } catch (error) {
      console.error("Fetch presence error:", error);
      return res.status(500).json({ message: "Онлайн төлөв авах үед алдаа гарлаа." });
    }
  });

  // ===== Ажилчид хоорондын зурвас API =====
  const mapMessageRow = (row: any) => ({
    id: row.id,
    senderId: String(row.sender_id),
    recipientId: String(row.recipient_id),
    content: row.content || "",
    attachments: JSON.parse(row.attachments || "[]"),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString(),
  });

  // Хэрэглэгчийн бүх ярианы товч жагсаалт (хавсралтын өгөгдөлгүй — хөнгөн)
  app.get("/api/messages/threads", async (req, res) => {
    try {
      const userId = String(req.query.userId || "").trim();
      if (!userId) return res.status(400).json({ message: "Хэрэглэгч тодорхойгүй байна." });

      const [rows] = await pool.query<any[]>(
        `SELECT id, sender_id, recipient_id, LEFT(content, 140) AS preview,
                (attachments IS NOT NULL AND JSON_LENGTH(attachments) > 0) AS has_attach,
                read_at, created_at
         FROM messages
         WHERE sender_id = ? OR recipient_id = ?
         ORDER BY created_at DESC`,
        [userId, userId]
      );

      const threads: Record<string, any> = {};
      for (const row of (rows || [])) {
        const otherId = String(row.sender_id) === userId ? String(row.recipient_id) : String(row.sender_id);
        if (!threads[otherId]) {
          threads[otherId] = {
            otherUserId: otherId,
            lastMessage: row.preview || "",
            lastAt: new Date(row.created_at).toISOString(),
            lastSenderId: String(row.sender_id),
            unreadCount: 0,
            hasAttachment: !!Number(row.has_attach),
          };
        }
        // Надад ирсэн, уншаагүй зурвасыг тоолно
        if (String(row.recipient_id) === userId && !row.read_at) {
          threads[otherId].unreadCount += 1;
        }
      }

      return res.json(Object.values(threads));
    } catch (error) {
      console.error("Fetch message threads error:", error);
      return res.status(500).json({ message: "Ярианы жагсаалт авах үед алдаа гарлаа." });
    }
  });

  // Хоёр хэрэглэгчийн хоорондын зурвасууд (since өгвөл түүнээс хойшхийг л буцаана)
  app.get("/api/messages/thread", async (req, res) => {
    try {
      const userId = String(req.query.userId || "").trim();
      const otherId = String(req.query.otherId || "").trim();
      const since = String(req.query.since || "").trim();
      if (!userId || !otherId) return res.status(400).json({ message: "Хэрэглэгч тодорхойгүй байна." });

      const params: any[] = [userId, otherId, otherId, userId];
      let sinceClause = "";
      if (since) {
        sinceClause = " AND created_at > ?";
        params.push(new Date(since));
      }

      const [rows] = await pool.query<any[]>(
        `SELECT * FROM messages
         WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))${sinceClause}
         ORDER BY created_at ASC`,
        params
      );
      return res.json((rows || []).map(mapMessageRow));
    } catch (error) {
      console.error("Fetch thread error:", error);
      return res.status(500).json({ message: "Зурвас авах үед алдаа гарлаа." });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const { id, senderId, recipientId, content, attachments } = req.body || {};
      if (!id || !senderId || !recipientId) {
        return res.status(400).json({ message: "Илгээгч, хүлээн авагчийг заана уу." });
      }
      if (String(senderId) === String(recipientId)) {
        return res.status(400).json({ message: "Өөр рүүгээ зурвас илгээх боломжгүй." });
      }
      const hasContent = String(content || "").trim().length > 0;
      const hasAttach = Array.isArray(attachments) && attachments.length > 0;
      if (!hasContent && !hasAttach) {
        return res.status(400).json({ message: "Хоосон зурвас илгээх боломжгүй." });
      }

      await pool.query(
        "INSERT INTO messages (id, sender_id, recipient_id, content, attachments) VALUES (?, ?, ?, ?, ?)",
        [id, String(senderId), String(recipientId), String(content || ""), JSON.stringify(attachments || [])]
      );

      const [rows] = await pool.query<any[]>("SELECT * FROM messages WHERE id = ? LIMIT 1", [id]);
      return res.status(201).json(mapMessageRow(rows[0]));
    } catch (error) {
      console.error("Send message error:", error);
      return res.status(500).json({ message: "Зурвас илгээх үед алдаа гарлаа." });
    }
  });

  // otherId-аас надад ирсэн зурвасуудыг уншсан болгоно
  app.post("/api/messages/read", async (req, res) => {
    try {
      const { userId, otherId } = req.body || {};
      if (!userId || !otherId) return res.status(400).json({ message: "Хэрэглэгч тодорхойгүй байна." });

      await pool.query(
        "UPDATE messages SET read_at = NOW() WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL",
        [String(userId), String(otherId)]
      );
      return res.json({ success: true });
    } catch (error) {
      console.error("Mark read error:", error);
      return res.status(500).json({ message: "Уншсан тэмдэглэх үед алдаа гарлаа." });
    }
  });

  // ===== Онлайн төлөв (presence) API =====
  // Санах ойд хадгална — түр зуурын мэдээлэл тул DB шаардлагагүй (сервер дахин асахад тэглэгдэнэ)
  const presenceMap = new Map<string, number>(); // userId -> сүүлийн ping (ms)
  const PRESENCE_TTL_MS = 45000; // 45 секундэд ping ирээгүй бол офлайн

  app.post("/api/presence/ping", (req, res) => {
    const userId = String(req.body?.userId || "").trim();
    if (!userId) return res.status(400).json({ message: "Хэрэглэгч тодорхойгүй байна." });
    presenceMap.set(userId, Date.now());
    return res.json({ success: true });
  });

  app.get("/api/presence", (_req, res) => {
    const now = Date.now();
    const rows = Array.from(presenceMap.entries()).map(([userId, ts]) => ({
      userId,
      online: now - ts < PRESENCE_TTL_MS,
      lastSeen: new Date(ts).toISOString(),
    }));
    return res.json(rows);
  });

  // ===== Ажилтны хувийн хурлын тэмдэглэл API =====
  // Бүх асуулга user_id-гаар заавал шүүгдэнэ — өөр хүний тэмдэглэл хэзээ ч буцаахгүй.
  const mapPersonalNoteRow = (row: any) => ({
    id: row.id,
    userId: String(row.user_id),
    meetingId: row.meeting_id || undefined,
    meetingTitle: row.meeting_title,
    meetingDate: row.meeting_date ? formatLocalDate(row.meeting_date) : undefined,
    notes: row.notes || "",
    directorTasks: row.director_tasks || "",
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  });

  app.get("/api/personal-notes", async (req, res) => {
    try {
      const userId = String(req.query.userId || "").trim();
      if (!userId) {
        return res.status(400).json({ message: "Хэрэглэгч тодорхойгүй байна." });
      }

      const [rows] = await pool.query<any[]>(
        "SELECT * FROM personal_meeting_notes WHERE user_id = ? ORDER BY meeting_date DESC, created_at DESC",
        [userId]
      );
      return res.json((rows || []).map(mapPersonalNoteRow));
    } catch (error) {
      console.error("Fetch personal notes error:", error);
      return res.status(500).json({ message: "Хувийн тэмдэглэл авах үед алдаа гарлаа." });
    }
  });

  app.post("/api/personal-notes", async (req, res) => {
    try {
      const { id, userId, meetingId, meetingTitle, meetingDate, notes, directorTasks } = req.body || {};
      if (!id || !userId || !String(meetingTitle || "").trim()) {
        return res.status(400).json({ message: "Хурлын нэрийг оруулна уу." });
      }

      await pool.query(
        `INSERT INTO personal_meeting_notes (id, user_id, meeting_id, meeting_title, meeting_date, notes, director_tasks)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, String(userId), meetingId || null, String(meetingTitle).trim(), meetingDate || null, notes || "", directorTasks || ""]
      );

      const [rows] = await pool.query<any[]>("SELECT * FROM personal_meeting_notes WHERE id = ? LIMIT 1", [id]);
      return res.status(201).json(mapPersonalNoteRow(rows[0]));
    } catch (error) {
      console.error("Create personal note error:", error);
      return res.status(500).json({ message: "Хувийн тэмдэглэл хадгалах үед алдаа гарлаа." });
    }
  });

  app.put("/api/personal-notes/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, meetingId, meetingTitle, meetingDate, notes, directorTasks } = req.body || {};
      if (!userId) {
        return res.status(400).json({ message: "Хэрэглэгч тодорхойгүй байна." });
      }

      // Зөвхөн эзэн нь засна
      const [owned] = await pool.query<any[]>(
        "SELECT id FROM personal_meeting_notes WHERE id = ? AND user_id = ? LIMIT 1",
        [id, String(userId)]
      );
      if (!Array.isArray(owned) || owned.length === 0) {
        return res.status(403).json({ message: "Энэ тэмдэглэлийг засах эрхгүй байна." });
      }

      await pool.query(
        `UPDATE personal_meeting_notes
         SET meeting_id = ?, meeting_title = ?, meeting_date = ?, notes = ?, director_tasks = ?
         WHERE id = ? AND user_id = ?`,
        [meetingId || null, String(meetingTitle || "").trim(), meetingDate || null, notes || "", directorTasks || "", id, String(userId)]
      );

      const [rows] = await pool.query<any[]>("SELECT * FROM personal_meeting_notes WHERE id = ? LIMIT 1", [id]);
      return res.json(mapPersonalNoteRow(rows[0]));
    } catch (error) {
      console.error("Update personal note error:", error);
      return res.status(500).json({ message: "Хувийн тэмдэглэл засах үед алдаа гарлаа." });
    }
  });

  app.delete("/api/personal-notes/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = String(req.query.userId || req.body?.userId || "").trim();
      if (!userId) {
        return res.status(400).json({ message: "Хэрэглэгч тодорхойгүй байна." });
      }

      const [result] = await pool.query<any>("DELETE FROM personal_meeting_notes WHERE id = ? AND user_id = ?", [id, userId]);
      // Өөр хүний тэмдэглэл байсан бол юу ч устгагдахгүй — үүнийг амжилттай гэж хэлэхгүй
      if (!result?.affectedRows) {
        return res.status(403).json({ message: "Энэ тэмдэглэлийг устгах эрхгүй байна." });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete personal note error:", error);
      return res.status(500).json({ message: "Хувийн тэмдэглэл устгах үед алдаа гарлаа." });
    }
  });

  // ===== Ээлжийн амралт (Annual leave) API =====
  const DEFAULT_LEAVE_DAYS = 15;
  const MAX_LEAVE_SPLITS = 4;

  // Ажлын өдрийн тоо (эхлэх/дуусах өдрийг оруулна, амралтын өдрийг тооцохгүй)
  const countWorkingDays = (startDate: string, endDate: string) => {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

    let count = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const weekday = cursor.getDay();
      if (weekday !== 0 && weekday !== 6) count += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  };

  // Глобал өгөгдмөл хоног
  const getDefaultEntitlement = async (year: number) => {
    const [rows] = await pool.query<any[]>("SELECT days FROM leave_settings WHERE year = ? LIMIT 1", [year]);
    if (Array.isArray(rows) && rows.length > 0) return Number(rows[0].days) || DEFAULT_LEAVE_DAYS;
    return DEFAULT_LEAVE_DAYS;
  };

  // Тодорхой ажилтны хоног: per-user override байвал түүнийг, эс бөгөөс глобал өгөгдмөлийг
  const getLeaveEntitlement = async (year: number, userId?: string) => {
    if (userId) {
      const [rows] = await pool.query<any[]>(
        "SELECT days FROM leave_entitlements WHERE user_id = ? AND year = ? LIMIT 1",
        [String(userId), year]
      );
      if (Array.isArray(rows) && rows.length > 0) return Number(rows[0].days);
    }
    return getDefaultEntitlement(year);
  };

  const mapLeaveRow = (row: any) => ({
    id: row.id,
    userId: String(row.user_id),
    userName: row.user_name,
    startDate: formatLocalDate(row.start_date),
    endDate: formatLocalDate(row.end_date),
    days: Number(row.days) || 0,
    reason: row.reason || "",
    status: row.status,
    year: Number(row.year),
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
    reviewedByName: row.reviewed_by_name || undefined,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString(),
  });

  app.get("/api/leave-requests", async (_req, res) => {
    try {
      const [rows] = await pool.query<any[]>("SELECT * FROM leave_requests ORDER BY start_date DESC, created_at DESC");
      return res.json((rows || []).map(mapLeaveRow));
    } catch (error) {
      console.error("Fetch leave requests error:", error);
      return res.status(500).json({ message: "Амралтын хүсэлт авах үед алдаа гарлаа." });
    }
  });

  app.post("/api/leave-requests", async (req, res) => {
    try {
      const { id, userId, userName, startDate, endDate, reason } = req.body || {};
      if (!id || !userId || !startDate || !endDate) {
        return res.status(400).json({ message: "Амралтын огноог бүрэн оруулна уу." });
      }

      const days = countWorkingDays(String(startDate), String(endDate));
      if (days <= 0) {
        return res.status(400).json({ message: "Сонгосон хугацаанд ажлын өдөр байхгүй байна. Огноогоо шалгана уу." });
      }

      const year = new Date(`${startDate}T00:00:00`).getFullYear();
      const entitlement = await getLeaveEntitlement(year, String(userId));

      // Дүрмийг сервер талд шалгана: 3-аас дээш хуваахгүй, нийт эрхээс хэтрэхгүй.
      // Хүлээгдэж буй хүсэлтийг мөн тооцно (эрхээсээ хэтрүүлж захиалахаас сэргийлнэ).
      const [existing] = await pool.query<any[]>(
        "SELECT days FROM leave_requests WHERE user_id = ? AND year = ? AND status <> 'Rejected'",
        [String(userId), year]
      );
      const rows = Array.isArray(existing) ? existing : [];
      const usedDays = rows.reduce((sum, r) => sum + (Number(r.days) || 0), 0);

      if (rows.length >= MAX_LEAVE_SPLITS) {
        return res.status(400).json({
          message: `Амралтаа хамгийн ихдээ ${MAX_LEAVE_SPLITS} хэсэг болгон хуваах боломжтой. Та аль хэдийн ${rows.length} удаа авсан байна.`,
        });
      }

      if (usedDays + days > entitlement) {
        return res.status(400).json({
          message: `Үлдсэн амралт ${Math.max(0, entitlement - usedDays)} ажлын өдөр байна. ${days} өдөр авах боломжгүй.`,
        });
      }

      await pool.query(
        `INSERT INTO leave_requests (id, user_id, user_name, start_date, end_date, days, reason, status, year)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
        [id, String(userId), String(userName || ""), startDate, endDate, days, reason || "", year]
      );

      const [created] = await pool.query<any[]>("SELECT * FROM leave_requests WHERE id = ? LIMIT 1", [id]);
      return res.status(201).json(mapLeaveRow(created[0]));
    } catch (error) {
      console.error("Create leave request error:", error);
      return res.status(500).json({ message: "Амралтын хүсэлт үүсгэх үед алдаа гарлаа." });
    }
  });

  app.patch("/api/leave-requests/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status, reviewedBy, reviewedByName } = req.body || {};
      if (!status || !["Pending", "Approved", "Rejected"].includes(status)) {
        return res.status(400).json({ message: "Төлөв буруу байна." });
      }

      const [rows] = await pool.query<any[]>("SELECT * FROM leave_requests WHERE id = ? LIMIT 1", [id]);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ message: "Амралтын хүсэлт олдсонгүй." });
      }
      const current = rows[0];

      // Батлах үед эрхээс хэтрэхгүй эсэхийг дахин шалгана (өөр хүсэлт зэрэг батлагдсан байж болно).
      if (status === "Approved") {
        const entitlement = await getLeaveEntitlement(Number(current.year), String(current.user_id));
        const [others] = await pool.query<any[]>(
          "SELECT days FROM leave_requests WHERE user_id = ? AND year = ? AND status = 'Approved' AND id <> ?",
          [String(current.user_id), Number(current.year), id]
        );
        const approvedDays = (Array.isArray(others) ? others : []).reduce((sum, r) => sum + (Number(r.days) || 0), 0);
        if (approvedDays + Number(current.days) > entitlement) {
          return res.status(400).json({
            message: `Батлах боломжгүй: жилийн эрх ${entitlement} өдөр, батлагдсан ${approvedDays} өдөр байна.`,
          });
        }
      }

      await pool.query(
        "UPDATE leave_requests SET status = ?, reviewed_by = ?, reviewed_by_name = ?, reviewed_at = NOW() WHERE id = ?",
        [status, reviewedBy || null, reviewedByName || null, id]
      );

      const [updated] = await pool.query<any[]>("SELECT * FROM leave_requests WHERE id = ? LIMIT 1", [id]);
      return res.json(mapLeaveRow(updated[0]));
    } catch (error) {
      console.error("Update leave status error:", error);
      return res.status(500).json({ message: "Амралтын төлөв шинэчлэх үед алдаа гарлаа." });
    }
  });

  app.delete("/api/leave-requests/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query("DELETE FROM leave_requests WHERE id = ?", [id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete leave request error:", error);
      return res.status(500).json({ message: "Амралтын хүсэлт устгах үед алдаа гарлаа." });
    }
  });

  app.get("/api/leave-settings", async (req, res) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const days = await getLeaveEntitlement(year);
      return res.json({ year, days });
    } catch (error) {
      console.error("Fetch leave settings error:", error);
      return res.status(500).json({ message: "Амралтын тохиргоо авах үед алдаа гарлаа." });
    }
  });

  app.put("/api/leave-settings/:year", async (req, res) => {
    try {
      const year = Number(req.params.year);
      const days = Number(req.body?.days);
      if (!year || !Number.isFinite(days) || days < 0 || days > 365) {
        return res.status(400).json({ message: "Амралтын хоног буруу байна." });
      }

      await pool.query(
        "INSERT INTO leave_settings (year, days) VALUES (?, ?) ON DUPLICATE KEY UPDATE days = VALUES(days)",
        [year, days]
      );
      return res.json({ year, days });
    } catch (error) {
      console.error("Update leave settings error:", error);
      return res.status(500).json({ message: "Амралтын эрх шинэчлэх үед алдаа гарлаа." });
    }
  });

  // Ажилтан тус бүрийн амралтын хоног (override). Зөвхөн override тавьсан ажилтнуудыг буцаана.
  app.get("/api/leave-entitlements", async (req, res) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const [rows] = await pool.query<any[]>(
        "SELECT user_id, days FROM leave_entitlements WHERE year = ?",
        [year]
      );
      return res.json(
        (rows || []).map((row) => ({ userId: String(row.user_id), days: Number(row.days) }))
      );
    } catch (error) {
      console.error("Fetch leave entitlements error:", error);
      return res.status(500).json({ message: "Ажилтны амралтын эрх авах үед алдаа гарлаа." });
    }
  });

  app.put("/api/leave-entitlements/:userId/:year", async (req, res) => {
    try {
      const userId = String(req.params.userId);
      const year = Number(req.params.year);
      const rawDays = req.body?.days;

      if (!userId || !year) {
        return res.status(400).json({ message: "Ажилтан эсвэл он буруу байна." });
      }

      // Хоосон/null дамжуулбал override-ийг устгаж, глобал өгөгдмөл рүү буцаана
      if (rawDays === null || rawDays === undefined || rawDays === "") {
        await pool.query("DELETE FROM leave_entitlements WHERE user_id = ? AND year = ?", [userId, year]);
        const days = await getDefaultEntitlement(year);
        return res.json({ userId, year, days, isOverride: false });
      }

      const days = Number(rawDays);
      if (!Number.isFinite(days) || days < 0 || days > 365) {
        return res.status(400).json({ message: "Амралтын хоног буруу байна." });
      }

      await pool.query(
        "INSERT INTO leave_entitlements (user_id, year, days) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE days = VALUES(days)",
        [userId, year, days]
      );
      return res.json({ userId, year, days, isOverride: true });
    } catch (error) {
      console.error("Update leave entitlement error:", error);
      return res.status(500).json({ message: "Ажилтны амралтын эрх шинэчлэх үед алдаа гарлаа." });
    }
  });

  // Meeting "live" signal API — a started meeting flashes for every logged-in user.
  const mapSignalRow = (row: any) => ({
    id: row.id,
    meetingId: row.meeting_id || undefined,
    title: row.title,
    time: row.meeting_time || undefined,
    startedBy: row.started_by ? String(row.started_by) : undefined,
    startedByName: row.started_by_name || undefined,
    startedAt: new Date(row.started_at).toISOString(),
  });

  // ================= Санал асуулга =================
  // Дуусах хугацаа нь өнгөрсөн нээлттэй асуулгуудыг автоматаар хаана
  const autoClosePolls = async () => {
    await pool.query(
      "UPDATE polls SET status = 'closed', closed_at = NOW() WHERE status = 'open' AND closes_at IS NOT NULL AND closes_at < CURDATE()"
    );
  };

  // Асуулга + саналуудыг нэгтгэж клиентэд өгөх хэлбэрт хөрвүүлнэ.
  // Нууц асуулгад санал өгсөн хүмүүсийн нэрийг задлахгүй (зөвхөн тоо).
  const mapPollRow = (row: any, votes: any[], viewerId: string) => {
    const options = (JSON.parse(row.options || "[]") as { id: string; text: string }[]).filter(o => o && o.id);
    const anonymous = !!Number(row.anonymous);
    const results = new Map<string, { count: number; voters: string[] }>();
    options.forEach(o => results.set(o.id, { count: 0, voters: [] }));

    let myOptionIds: string[] = [];
    for (const vote of votes) {
      let ids: string[] = [];
      try {
        ids = JSON.parse(vote.option_ids || "[]");
      } catch {
        ids = [];
      }
      if (viewerId && String(vote.user_id) === viewerId) myOptionIds = ids;
      for (const optionId of ids) {
        const entry = results.get(optionId);
        if (!entry) continue;
        entry.count += 1;
        if (!anonymous) entry.voters.push(String(vote.user_name || ""));
      }
    }

    return {
      id: row.id,
      question: row.question,
      description: row.description || "",
      options,
      allowMultiple: !!Number(row.allow_multiple),
      minChoices: row.min_choices != null ? Number(row.min_choices) : null,
      maxChoices: row.max_choices != null ? Number(row.max_choices) : null,
      anonymous,
      visibleToUserIds: (() => {
        try {
          const parsed = JSON.parse(row.visible_to_user_ids || "[]");
          return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          return [];
        }
      })(),
      status: row.status,
      closesAt: row.closes_at ? formatLocalDate(row.closes_at) : undefined,
      createdBy: String(row.created_by),
      createdByName: row.created_by_name || "",
      createdAt: new Date(row.created_at).toISOString(),
      totalVotes: votes.length,
      results: options.map(o => ({ optionId: o.id, ...results.get(o.id)! })),
      myOptionIds,
    };
  };

  app.get("/api/polls", async (req, res) => {
    try {
      await autoClosePolls();
      const viewerId = String(req.query.userId || "");
      const [pollRows] = await pool.query<any[]>("SELECT * FROM polls ORDER BY status = 'open' DESC, created_at DESC");
      const [voteRows] = await pool.query<any[]>("SELECT * FROM poll_votes");
      const votesByPoll = new Map<string, any[]>();
      for (const vote of voteRows || []) {
        const list = votesByPoll.get(vote.poll_id) || [];
        list.push(vote);
        votesByPoll.set(vote.poll_id, list);
      }
      return res.json((pollRows || []).map(row => mapPollRow(row, votesByPoll.get(row.id) || [], viewerId)));
    } catch (error) {
      console.error("Fetch polls error:", error);
      return res.status(500).json({ message: "Санал асуулга авах үед алдаа гарлаа." });
    }
  });

  app.post("/api/polls", async (req, res) => {
    try {
      const { id, question, description, options, allowMultiple, minChoices, maxChoices, anonymous, visibleToUserIds, closesAt, createdBy, createdByName } = req.body || {};
      const cleanOptions = (Array.isArray(options) ? options : [])
        .map((o: any) => ({ id: String(o?.id || ""), text: String(o?.text || "").trim() }))
        .filter(o => o.id && o.text);

      if (!id || !String(question || "").trim() || !createdBy) {
        return res.status(400).json({ message: "Асуултаа оруулна уу." });
      }
      if (cleanOptions.length < 2) {
        return res.status(400).json({ message: "Дор хаяж 2 сонголт оруулна уу." });
      }

      // Сонголтын хязгаар — зөвхөн олон сонголттой үед хүчинтэй
      let min: number | null = null;
      let max: number | null = null;
      if (allowMultiple) {
        min = minChoices != null && minChoices !== "" ? Number(minChoices) : null;
        max = maxChoices != null && maxChoices !== "" ? Number(maxChoices) : null;
        if (min != null && (!Number.isInteger(min) || min < 1 || min > cleanOptions.length)) {
          return res.status(400).json({ message: "Доод хязгаар 1-ээс сонголтын тооны хооронд байх ёстой." });
        }
        if (max != null && (!Number.isInteger(max) || max < 1 || max > cleanOptions.length)) {
          return res.status(400).json({ message: "Дээд хязгаар 1-ээс сонголтын тооны хооронд байх ёстой." });
        }
        if (min != null && max != null && min > max) {
          return res.status(400).json({ message: "Доод хязгаар дээд хязгаараас их байж болохгүй." });
        }
      }

      await pool.query(
        `INSERT INTO polls (id, question, description, options, allow_multiple, min_choices, max_choices, anonymous, visible_to_user_ids, status, closes_at, created_by, created_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
        [
          id,
          String(question).trim(),
          String(description || ""),
          JSON.stringify(cleanOptions),
          allowMultiple ? 1 : 0,
          min,
          max,
          anonymous ? 1 : 0,
          JSON.stringify((Array.isArray(visibleToUserIds) ? visibleToUserIds : []).map(String)),
          closesAt || null,
          String(createdBy),
          String(createdByName || ""),
        ]
      );

      const [created] = await pool.query<any[]>("SELECT * FROM polls WHERE id = ? LIMIT 1", [id]);
      return res.status(201).json(mapPollRow(created[0], [], String(createdBy)));
    } catch (error) {
      console.error("Create poll error:", error);
      return res.status(500).json({ message: "Санал асуулга үүсгэх үед алдаа гарлаа." });
    }
  });

  app.post("/api/polls/:id/vote", async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, userName, optionIds } = req.body || {};
      const ids = (Array.isArray(optionIds) ? optionIds : []).map(String).filter(Boolean);
      if (!userId || ids.length === 0) {
        return res.status(400).json({ message: "Сонголтоо хийнэ үү." });
      }

      await autoClosePolls();
      const [rows] = await pool.query<any[]>("SELECT * FROM polls WHERE id = ? LIMIT 1", [id]);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ message: "Санал асуулга олдсонгүй." });
      }
      const poll = rows[0];
      if (poll.status !== "open") {
        return res.status(400).json({ message: "Санал асуулга хаагдсан байна." });
      }

      const validIds = new Set((JSON.parse(poll.options || "[]") as { id: string }[]).map(o => o.id));
      if (ids.some(optionId => !validIds.has(optionId))) {
        return res.status(400).json({ message: "Сонголт буруу байна." });
      }
      if (!Number(poll.allow_multiple) && ids.length > 1) {
        return res.status(400).json({ message: "Энэ асуулгад зөвхөн нэг сонголт хийх боломжтой." });
      }

      // Олон сонголттой үед доод/дээд хязгаарыг шалгана
      if (Number(poll.allow_multiple)) {
        const min = poll.min_choices != null ? Number(poll.min_choices) : null;
        const max = poll.max_choices != null ? Number(poll.max_choices) : null;
        if (min != null && ids.length < min) {
          return res.status(400).json({ message: `Дор хаяж ${min} сонголт хийнэ үү.` });
        }
        if (max != null && ids.length > max) {
          return res.status(400).json({ message: `Хамгийн ихдээ ${max} сонголт хийх боломжтой.` });
        }
      }

      // Өмнө нь санал өгсөн бол шинэчилнэ (саналаа өөрчлөх боломж)
      await pool.query(
        `INSERT INTO poll_votes (poll_id, user_id, user_name, option_ids)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE user_name = VALUES(user_name), option_ids = VALUES(option_ids)`,
        [id, String(userId), String(userName || ""), JSON.stringify(ids)]
      );

      const [votes] = await pool.query<any[]>("SELECT * FROM poll_votes WHERE poll_id = ?", [id]);
      return res.json(mapPollRow(poll, votes || [], String(userId)));
    } catch (error) {
      console.error("Vote poll error:", error);
      return res.status(500).json({ message: "Санал өгөх үед алдаа гарлаа." });
    }
  });

  app.patch("/api/polls/:id/close", async (req, res) => {
    try {
      const { id } = req.params;
      const viewerId = String(req.body?.userId || "");
      await pool.query("UPDATE polls SET status = 'closed', closed_at = NOW() WHERE id = ?", [id]);
      const [rows] = await pool.query<any[]>("SELECT * FROM polls WHERE id = ? LIMIT 1", [id]);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ message: "Санал асуулга олдсонгүй." });
      }
      const [votes] = await pool.query<any[]>("SELECT * FROM poll_votes WHERE poll_id = ?", [id]);
      return res.json(mapPollRow(rows[0], votes || [], viewerId));
    } catch (error) {
      console.error("Close poll error:", error);
      return res.status(500).json({ message: "Санал асуулга хаах үед алдаа гарлаа." });
    }
  });

  app.delete("/api/polls/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query("DELETE FROM poll_votes WHERE poll_id = ?", [id]);
      await pool.query("DELETE FROM polls WHERE id = ?", [id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete poll error:", error);
      return res.status(500).json({ message: "Санал асуулга устгах үед алдаа гарлаа." });
    }
  });

  // ================= Ажлын төлөвлөгөө =================
  const parseIdList = (value: any): string[] => {
    try {
      const parsed = JSON.parse(value || "[]");
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  };

  // Гарын үсгийн цагийг хадгалагдсан хэлбэрээр нь (серверийн ханын цаг) буцаана.
  // PHP API-тай ижил зан төлөвтэй болгож, огноо цагийн бүсийн зөрүүгээр гулсахаас сэргийлнэ.
  const formatLocalDateTime = (value: any) => {
    const d = new Date(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const mapWorkPlanRow = (row: any) => {
    // Багана нь заавал id + нэртэй байна, мөрийн нүд нь баганын id-гаар түлхүүрлэгдэнэ
    let columns: { id: string; label: string; width?: number }[] = [];
    let rows: { id: string; cells: Record<string, string> }[] = [];
    try {
      const parsed = JSON.parse(row.columns_json || "[]");
      if (Array.isArray(parsed)) {
        columns = parsed
          .filter((c: any) => c && c.id)
          .map((c: any) => ({ id: String(c.id), label: String(c.label || ""), width: c.width != null ? Number(c.width) : undefined }));
      }
    } catch {
      columns = [];
    }
    try {
      const parsed = JSON.parse(row.rows_json || "[]");
      if (Array.isArray(parsed)) {
        rows = parsed
          .filter((r: any) => r && r.id)
          .map((r: any) => ({
            id: String(r.id),
            cells: r.cells && typeof r.cells === "object" ? Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [k, String(v ?? "")])) : {},
          }));
      }
    } catch {
      rows = [];
    }

    return {
      id: row.id,
      title: row.title,
      periodType: row.period_type,
      year: Number(row.plan_year),
      periodNo: row.period_no != null ? Number(row.period_no) : null,
      startDate: row.start_date ? formatLocalDate(row.start_date) : undefined,
      endDate: row.end_date ? formatLocalDate(row.end_date) : undefined,
      department: row.department,
      columns,
      rows,
      approvedByTitle: row.approved_by_title || "",
      approvedByUserId: row.approved_by_user_id ? String(row.approved_by_user_id) : "",
      approvedByName: row.approved_by_name || "",
      approvedAt: row.approved_at ? formatLocalDateTime(row.approved_at) : undefined,
      reviewedByTitle: row.reviewed_by_title || "",
      reviewedByUserId: row.reviewed_by_user_id ? String(row.reviewed_by_user_id) : "",
      reviewedByName: row.reviewed_by_name || "",
      reviewedAt: row.reviewed_at ? formatLocalDateTime(row.reviewed_at) : undefined,
      compiledByUserId: row.compiled_by_user_id ? String(row.compiled_by_user_id) : "",
      compiledByName: row.compiled_by_name || "",
      compiledAt: row.compiled_at ? formatLocalDateTime(row.compiled_at) : undefined,
      visibleToUserIds: parseIdList(row.visible_to_user_ids),
      editableByUserIds: parseIdList(row.editable_by_user_ids),
      visibleToDepartments: parseIdList(row.visible_to_departments),
      editableByDepartments: parseIdList(row.editable_by_departments),
      createdBy: String(row.created_by),
      createdByName: row.created_by_name || "",
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at || row.created_at).toISOString(),
    };
  };

  // Хүсэлтийн биеийг DB баганад тохируулж, багана/мөрийг цэвэрлэнэ
  const workPlanPayload = (body: any) => {
    const columns = (Array.isArray(body?.columns) ? body.columns : [])
      .map((c: any) => ({ id: String(c?.id || ""), label: String(c?.label || "").trim(), width: c?.width != null ? Number(c.width) : undefined }))
      .filter((c: any) => c.id);
    const columnIds = new Set(columns.map((c: any) => c.id));
    const rows = (Array.isArray(body?.rows) ? body.rows : [])
      .map((r: any) => {
        const cells: Record<string, string> = {};
        if (r?.cells && typeof r.cells === "object") {
          // Устгагдсан баганын үлдэгдэл утгыг хадгалахгүй
          for (const [key, value] of Object.entries(r.cells)) {
            if (columnIds.has(key)) cells[key] = String(value ?? "");
          }
        }
        return { id: String(r?.id || ""), cells };
      })
      .filter((r: any) => r.id);

    return {
      title: String(body?.title || "").trim(),
      period_type: ["year", "halfyear", "month", "week"].includes(body?.periodType) ? body.periodType : "month",
      plan_year: Number(body?.year) || new Date().getFullYear(),
      period_no: body?.periodNo != null && body.periodNo !== "" ? Number(body.periodNo) : null,
      start_date: body?.startDate || null,
      end_date: body?.endDate || null,
      department: String(body?.department || ""),
      columns_json: JSON.stringify(columns),
      rows_json: JSON.stringify(rows),
      approved_by_title: String(body?.approvedByTitle || ""),
      approved_by_user_id: String(body?.approvedByUserId || "") || null,
      approved_by_name: String(body?.approvedByName || ""),
      reviewed_by_title: String(body?.reviewedByTitle || ""),
      reviewed_by_user_id: String(body?.reviewedByUserId || "") || null,
      reviewed_by_name: String(body?.reviewedByName || ""),
      compiled_by_user_id: String(body?.compiledByUserId || "") || null,
      compiled_by_name: String(body?.compiledByName || ""),
      visible_to_user_ids: JSON.stringify((Array.isArray(body?.visibleToUserIds) ? body.visibleToUserIds : []).map(String)),
      editable_by_user_ids: JSON.stringify((Array.isArray(body?.editableByUserIds) ? body.editableByUserIds : []).map(String)),
      visible_to_departments: JSON.stringify((Array.isArray(body?.visibleToDepartments) ? body.visibleToDepartments : []).map(String)),
      editable_by_departments: JSON.stringify((Array.isArray(body?.editableByDepartments) ? body.editableByDepartments : []).map(String)),
    };
  };

  app.get("/api/work-plans", async (_req, res) => {
    try {
      const [rows] = await pool.query<any[]>(
        "SELECT * FROM work_plans ORDER BY plan_year DESC, period_no DESC, created_at DESC"
      );
      return res.json((rows || []).map(mapWorkPlanRow));
    } catch (error) {
      console.error("Fetch work plans error:", error);
      return res.status(500).json({ message: "Ажлын төлөвлөгөө авах үед алдаа гарлаа." });
    }
  });

  app.post("/api/work-plans", async (req, res) => {
    try {
      const { id, createdBy, createdByName } = req.body || {};
      const payload = workPlanPayload(req.body);
      if (!id || !payload.title || !payload.department || !createdBy) {
        return res.status(400).json({ message: "Гарчиг болон хэлтсээ сонгоно уу." });
      }

      await pool.query(
        `INSERT INTO work_plans
          (id, title, period_type, plan_year, period_no, start_date, end_date, department, columns_json, rows_json,
           approved_by_title, approved_by_user_id, approved_by_name, reviewed_by_title, reviewed_by_user_id,
           reviewed_by_name, compiled_by_user_id, compiled_by_name,
           visible_to_user_ids, editable_by_user_ids, visible_to_departments, editable_by_departments,
           created_by, created_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, payload.title, payload.period_type, payload.plan_year, payload.period_no, payload.start_date, payload.end_date,
          payload.department, payload.columns_json, payload.rows_json,
          payload.approved_by_title, payload.approved_by_user_id, payload.approved_by_name,
          payload.reviewed_by_title, payload.reviewed_by_user_id, payload.reviewed_by_name,
          payload.compiled_by_user_id, payload.compiled_by_name,
          payload.visible_to_user_ids, payload.editable_by_user_ids,
          payload.visible_to_departments, payload.editable_by_departments,
          String(createdBy), String(createdByName || ""),
        ]
      );

      const [created] = await pool.query<any[]>("SELECT * FROM work_plans WHERE id = ? LIMIT 1", [id]);
      return res.status(201).json(mapWorkPlanRow(created[0]));
    } catch (error) {
      console.error("Create work plan error:", error);
      return res.status(500).json({ message: "Ажлын төлөвлөгөө үүсгэх үед алдаа гарлаа." });
    }
  });

  app.put("/api/work-plans/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const payload = workPlanPayload(req.body);
      if (!payload.title || !payload.department) {
        return res.status(400).json({ message: "Гарчиг болон хэлтсээ сонгоно уу." });
      }

      const [result] = await pool.query<any>(
        // Гарын үсэг зурах хүн солигдвол тухайн баталгаажуулалт хүчингүй болно.
        // (*_at нь *_by_user_id-аас ӨМНӨ олгогдож байгаа тул хуучин утгатай харьцуулагдана)
        `UPDATE work_plans SET
           title = ?, period_type = ?, plan_year = ?, period_no = ?, start_date = ?, end_date = ?, department = ?,
           columns_json = ?, rows_json = ?,
           approved_by_title = ?,
           approved_at = IF(approved_by_user_id <=> ?, approved_at, NULL),
           approved_by_user_id = ?, approved_by_name = ?,
           reviewed_by_title = ?,
           reviewed_at = IF(reviewed_by_user_id <=> ?, reviewed_at, NULL),
           reviewed_by_user_id = ?, reviewed_by_name = ?,
           compiled_at = IF(compiled_by_user_id <=> ?, compiled_at, NULL),
           compiled_by_user_id = ?, compiled_by_name = ?,
           visible_to_user_ids = ?, editable_by_user_ids = ?,
           visible_to_departments = ?, editable_by_departments = ?
         WHERE id = ?`,
        [
          payload.title, payload.period_type, payload.plan_year, payload.period_no, payload.start_date, payload.end_date,
          payload.department, payload.columns_json, payload.rows_json,
          payload.approved_by_title, payload.approved_by_user_id, payload.approved_by_user_id, payload.approved_by_name,
          payload.reviewed_by_title, payload.reviewed_by_user_id, payload.reviewed_by_user_id, payload.reviewed_by_name,
          payload.compiled_by_user_id, payload.compiled_by_user_id, payload.compiled_by_name,
          payload.visible_to_user_ids, payload.editable_by_user_ids,
          payload.visible_to_departments, payload.editable_by_departments, id,
        ]
      );

      if (!result || result.affectedRows === 0) {
        return res.status(404).json({ message: "Ажлын төлөвлөгөө олдсонгүй." });
      }

      const [updated] = await pool.query<any[]>("SELECT * FROM work_plans WHERE id = ? LIMIT 1", [id]);
      return res.json(mapWorkPlanRow(updated[0]));
    } catch (error) {
      console.error("Update work plan error:", error);
      return res.status(500).json({ message: "Ажлын төлөвлөгөө хадгалах үед алдаа гарлаа." });
    }
  });

  // Гарын үсэг зурах: зөвхөн тухайн үүрэгт нэрлэгдсэн ажилтан өөрөө баталгаажуулна
  app.patch("/api/work-plans/:id/sign", async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, role, revoke } = req.body || {};
      const roleColumns: Record<string, { user: string; at: string }> = {
        approve: { user: "approved_by_user_id", at: "approved_at" },
        review: { user: "reviewed_by_user_id", at: "reviewed_at" },
        compile: { user: "compiled_by_user_id", at: "compiled_at" },
      };
      const columns = roleColumns[String(role || "")];
      if (!columns || !userId) {
        return res.status(400).json({ message: "Гарын үсгийн үүрэг тодорхойгүй байна." });
      }

      const [rows] = await pool.query<any[]>("SELECT * FROM work_plans WHERE id = ? LIMIT 1", [id]);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(404).json({ message: "Ажлын төлөвлөгөө олдсонгүй." });
      }
      if (String(rows[0][columns.user] || "") !== String(userId)) {
        return res.status(403).json({ message: "Танд энэ хэсэгт гарын үсэг зурах эрхгүй байна." });
      }

      await pool.query(`UPDATE work_plans SET ${columns.at} = ${revoke ? "NULL" : "NOW()"} WHERE id = ?`, [id]);
      const [updated] = await pool.query<any[]>("SELECT * FROM work_plans WHERE id = ? LIMIT 1", [id]);
      return res.json(mapWorkPlanRow(updated[0]));
    } catch (error) {
      console.error("Sign work plan error:", error);
      return res.status(500).json({ message: "Гарын үсэг зурах үед алдаа гарлаа." });
    }
  });

  app.delete("/api/work-plans/:id", async (req, res) => {
    try {
      await pool.query("DELETE FROM work_plans WHERE id = ?", [req.params.id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete work plan error:", error);
      return res.status(500).json({ message: "Ажлын төлөвлөгөө устгах үед алдаа гарлаа." });
    }
  });

  app.get("/api/meeting-signal", async (_req, res) => {
    try {
      // Active = not ended and started within the last 3 hours (auto-expires so it can't flash forever).
      const [rows] = await pool.query<any[]>(
        "SELECT * FROM meeting_signals WHERE ended_at IS NULL AND started_at >= (NOW() - INTERVAL 3 HOUR) ORDER BY started_at DESC LIMIT 1"
      );
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.json({ active: false, signal: null });
      }
      return res.json({ active: true, signal: mapSignalRow(rows[0]) });
    } catch (error) {
      console.error("Fetch meeting signal error:", error);
      return res.status(500).json({ message: "Хурлын дохио авах үед алдаа гарлаа." });
    }
  });

  // Дууссан хурлууд хэр удсаныг буцаана (Өмнөх хурлууд дээр харуулна)
  app.get("/api/meeting-signal/history", async (_req, res) => {
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT meeting_id, title, started_at, ended_at
         FROM meeting_signals
         WHERE ended_at IS NOT NULL
         ORDER BY started_at DESC
         LIMIT 300`
      );
      return res.json(
        (rows || []).map((row) => ({
          meetingId: row.meeting_id || undefined,
          title: row.title,
          startedAt: new Date(row.started_at).toISOString(),
          endedAt: new Date(row.ended_at).toISOString(),
          durationMinutes: Math.max(
            0,
            Math.round((new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) / 60000)
          ),
        }))
      );
    } catch (error) {
      console.error("Fetch meeting history error:", error);
      return res.status(500).json({ message: "Хурлын түүх авах үед алдаа гарлаа." });
    }
  });

  app.post("/api/meeting-signal", async (req, res) => {
    try {
      const { meetingId, title, time, startedBy, startedByName } = req.body || {};
      if (!String(title || "").trim()) {
        return res.status(400).json({ message: "Хурлын нэрийг оруулна уу." });
      }

      // Only one meeting can be live at a time — close any currently active signal first.
      await pool.query("UPDATE meeting_signals SET ended_at = NOW() WHERE ended_at IS NULL");
      await pool.query(
        "INSERT INTO meeting_signals (meeting_id, title, meeting_time, started_by, started_by_name) VALUES (?, ?, ?, ?, ?)",
        [meetingId || null, String(title).trim(), time || null, startedBy || null, startedByName || null]
      );

      const [rows] = await pool.query<any[]>("SELECT * FROM meeting_signals WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1");
      return res.status(201).json({ active: true, signal: mapSignalRow(rows[0]) });
    } catch (error) {
      console.error("Start meeting signal error:", error);
      return res.status(500).json({ message: "Хурал эхлүүлэх үед алдаа гарлаа." });
    }
  });

  app.post("/api/meeting-signal/end", async (_req, res) => {
    try {
      await pool.query("UPDATE meeting_signals SET ended_at = NOW() WHERE ended_at IS NULL");
      return res.json({ success: true });
    } catch (error) {
      console.error("End meeting signal error:", error);
      return res.status(500).json({ message: "Хурал дуусгах үед алдаа гарлаа." });
    }
  });

  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ message: "Оруулсан файл эсвэл зураг хэт том байна. Зургийн хэмжээг багасгаад дахин оролдоно уу." });
    }
    return next(err);
  });

  // Тодорхойгүй /api зам — Vite-ийн proxy (/api → 3000) өөр лүүгээ эргэж
  // төгсгөлгүй давталт үүсгэхээс сэргийлж энд шууд 404 буцаана.
  app.use("/api", (_req, res) => res.status(404).json({ message: "Not Found" }));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const isDev = process.env.NODE_ENV !== "production";
    console.log(`
╔════════════════════════════════════════════════════════════╗
║         CCRCC Calendar Server Started Successfully         ║
╚════════════════════════════════════════════════════════════╝
Environment:    ${process.env.NODE_ENV || "development"}
Mode:           ${isDev ? "🔨 Development (Vite)" : "🚀 Production (Static)"}
Server:         http://localhost:${PORT}
API Health:     http://localhost:${PORT}/api/health
Database:       ${DB_HOST}:${DB_PORT}/${DB_NAME}
Timestamp:      ${new Date().toISOString()}
═══════════════════════════════════════════════════════════
    `);
  });
}

startServer().catch((error: any) => {
  const message = String(error?.message || "");
  const code = String(error?.code || "");

  if (code === "ETIMEDOUT" || message.includes("handshake: reading initial communication packet")) {
    console.error("\n[DB ERROR] MySQL/MariaDB-т холбогдож чадсангүй.");
    console.error(`[DB ERROR] Холболтын тохиргоо: ${DB_USER}@${DB_HOST}:${DB_PORT} / ${DB_NAME}`);
    console.error("[DB ERROR] XAMPP MySQL лог (mysql_error.log) дээр InnoDB corruption алдаа байгаа эсэхийг шалгана уу.");
    console.error("[DB ERROR] Алдааны жишээ: 'Lost connection ... handshake: reading initial communication packet' эсвэл 'Page ... log sequence number ... is in the future'.\n");
  }

  console.error("Server startup failed:", error);
  process.exit(1);
});
