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
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url LONGTEXT NULL AFTER last_name");

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
      category ENUM('Project','Environmental','Internal','Birthday') NOT NULL,
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
  await pool.query("ALTER TABLE events MODIFY COLUMN category ENUM('Project','Environmental','Internal','Birthday') NOT NULL");
  await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS birthday_user_id INT UNSIGNED NULL AFTER priority");

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

  // Middleware
  app.use(express.json({ limit: "1gb" }));

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
        database: "connected"
      });
    } catch (error) {
      res.status(503).json({ 
        status: "error",
        database: "disconnected",
        error: String(error).slice(0, 100)
      });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
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

  app.post("/api/auth/login", async (req, res) => {
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
      const { firstName, lastName, department, password } = req.body as {
        firstName?: string;
        lastName?: string;
        department?: string;
        password?: string;
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
        category: row.category,
        priority: row.priority,
        birthdayUserId: row.birthday_user_id ? String(row.birthday_user_id) : undefined,
        projectId: row.project_id,
        tags: JSON.parse(row.tags || "[]"),
        attachments: JSON.parse(row.attachments || "[]"),
        visibleToUserIds: JSON.parse(row.visible_to_user_ids || "[]"),
      })));
    } catch (error) {
      console.error("Fetch events error:", error);
      return res.status(500).json({ message: "Арга хэмжээнүүдийн жагсаалт авах үед алдаа гарлаа." });
    }
  });

  app.post("/api/events", async (req, res) => {
    try {
      const { id, title, description, date, category, priority, birthdayUserId, projectId, tags, attachments, visibleToUserIds } = req.body;
      if (!id || !date || !category) {
        return res.status(400).json({ message: "Үндсэн талбарыг бөглөнө үү." });
      }

      if (category === 'Birthday' && !birthdayUserId) {
        return res.status(400).json({ message: "Төрсөн өдрийн хэрэглэгчийг сонгоно уу." });
      }

      const normalizedTitle = String(title || '').trim();
      const finalTitle = normalizedTitle || (category === 'Birthday' ? 'Birthday' : 'Untitled Event');

      await pool.query(
        `INSERT INTO events (id, title, description, date, category, priority, birthday_user_id, project_id, tags, attachments, visible_to_user_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, finalTitle, description || "", date, category, priority, birthdayUserId ? Number(birthdayUserId) : null, projectId || null, JSON.stringify(tags || []), JSON.stringify(attachments || []), JSON.stringify(visibleToUserIds || [])]
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
      const { title, description, date, category, priority, birthdayUserId, projectId, tags, attachments, visibleToUserIds } = req.body;

      await pool.query(
        `UPDATE events SET title = ?, description = ?, date = ?, category = ?, priority = ?, birthday_user_id = ?, project_id = ?, tags = ?, attachments = ?, visible_to_user_ids = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [title, description || "", date, category, priority, birthdayUserId ? Number(birthdayUserId) : null, projectId || null, JSON.stringify(tags || []), JSON.stringify(attachments || []), JSON.stringify(visibleToUserIds || []), id]
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
        projectId: row.project_id,
        title: row.title,
        description: row.description || "",
        assignedToUserIds: JSON.parse(row.assigned_to_user_ids || "[]"),
        dueDate: row.due_date instanceof Date ? row.due_date.toISOString().slice(0, 10) : String(row.due_date).slice(0, 10),
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
      const { id, projectId, title, description, assignedToUserIds, dueDate, status, attachments } = req.body;
      if (!id || !projectId || !title || !dueDate) {
        return res.status(400).json({ message: "Үндсэн талбарыг бөглөнө үү." });
      }

      await pool.query(
        `INSERT INTO tasks (id, project_id, title, description, assigned_to_user_ids, due_date, status, attachments)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, title, description || "", JSON.stringify(assignedToUserIds || []), dueDate, status || "Pending", JSON.stringify(attachments || [])]
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
           contract_signed, contract_value, payment1, payment2, payment3, variance, extra_notes, visible_to_user_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
           visible_to_user_ids = ?, updated_at = CURRENT_TIMESTAMP
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

  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ message: "Оруулсан файл эсвэл зураг хэт том байна. Зургийн хэмжээг багасгаад дахин оролдоно уу." });
    }
    return next(err);
  });

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
