-- ============================================================
-- Ажлын төлөвлөгөөний модулийн өгөгдлийн сангийн өөрчлөлт
-- Production (peatland_calendar) дээр phpMyAdmin-аас ажиллуулна.
--
-- Тайлбар: api/index.php нь эхний хүсэлт дээр энэ хүснэгтийг
-- автоматаар үүсгэдэг тул энэ файл нь гараар ажиллуулах хувилбар юм.
-- ============================================================

-- Жилийн / хагас жилийн / сарын / 7 хоногийн төлөвлөгөө — хэлтэс тус бүрээр.
-- Багана (columns_json) болон мөр (rows_json) нь чөлөөтэй нэмэгддэг тул JSON-оор хадгална.
CREATE TABLE IF NOT EXISTS work_plans (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    period_type ENUM('year','halfyear','month','week') NOT NULL DEFAULT 'month',
    plan_year INT NOT NULL,
    period_no INT NULL,                        -- хагас жил 1|2, сар 1-12, 7 хоног 1-53
    start_date DATE NULL,
    end_date DATE NULL,
    department VARCHAR(255) NOT NULL,
    columns_json LONGTEXT NOT NULL,            -- JSON: [{ id, label, width }]
    rows_json LONGTEXT NOT NULL,               -- JSON: [{ id, cells: { <columnId>: "утга" } }]
    -- Гарын үсгийн хэсэг: зурах хүнийг бүртгэлтэй ажилчдаас сонгоно (*_by_user_id),
    -- тухайн ажилтан өөрөө "Батлах" дарахад *_at бөглөгдөнө.
    approved_by_title VARCHAR(500) NULL,       -- БАТЛАВ — албан тушаал
    approved_by_user_id VARCHAR(36) NULL,      -- БАТЛАВ — сонгогдсон ажилтан
    approved_by_name VARCHAR(255) NULL,        -- БАТЛАВ — нэр
    approved_at TIMESTAMP NULL,                -- БАТЛАВ — гарын үсэг зурсан огноо
    reviewed_by_title VARCHAR(500) NULL,       -- ХЯНАСАН — албан тушаал
    reviewed_by_user_id VARCHAR(36) NULL,
    reviewed_by_name VARCHAR(255) NULL,        -- ХЯНАСАН — нэр
    reviewed_at TIMESTAMP NULL,
    compiled_by_user_id VARCHAR(36) NULL,      -- ТӨЛӨВЛӨГӨӨ НЭГТГЭСЭН
    compiled_by_name VARCHAR(255) NULL,
    compiled_at TIMESTAMP NULL,
    visible_to_user_ids LONGTEXT NULL,         -- JSON: харах эрхтэй ажилчид
    editable_by_user_ids LONGTEXT NULL,        -- JSON: засах эрхтэй ажилчид
    visible_to_departments LONGTEXT NULL,      -- JSON: харах эрхтэй хэлтсүүд
    editable_by_departments LONGTEXT NULL,     -- JSON: засах эрхтэй хэлтсүүд
    created_by VARCHAR(36) NOT NULL,
    created_by_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ALTER — work_plans хүснэгт нь гарын үсгийн баганагүй ХУУЧИН хувилбараар
-- аль хэдийн үүссэн байвал л ажиллуулна. Шинээр үүсгэсэн бол ХЭРЭГГҮЙ.
-- (MariaDB дээр IF NOT EXISTS ажиллана; MySQL 5.7/8.0 дээр IF NOT EXISTS-ийг хасна.)
-- ============================================================

ALTER TABLE work_plans ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(36) NULL AFTER approved_by_title;
ALTER TABLE work_plans ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL AFTER approved_by_name;
ALTER TABLE work_plans ADD COLUMN IF NOT EXISTS reviewed_by_user_id VARCHAR(36) NULL AFTER reviewed_by_title;
ALTER TABLE work_plans ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP NULL AFTER reviewed_by_name;
ALTER TABLE work_plans ADD COLUMN IF NOT EXISTS compiled_by_user_id VARCHAR(36) NULL AFTER reviewed_at;
ALTER TABLE work_plans ADD COLUMN IF NOT EXISTS compiled_at TIMESTAMP NULL AFTER compiled_by_name;
