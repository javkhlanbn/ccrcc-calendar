-- ============================================================
-- Санал асуулгын модулийн өгөгдлийн сангийн өөрчлөлт
-- Production (peatland_calendar) дээр phpMyAdmin-аас ажиллуулна.
--
-- Тайлбар: api/index.php нь эхний хүсэлт дээр эдгээрийг автоматаар
-- үүсгэдэг тул энэ файл нь гараар ажиллуулах хувилбар юм.
-- ============================================================

-- 1. Санал асуулга — асуулт, сонголтууд (JSON), тохиргоо
CREATE TABLE IF NOT EXISTS polls (
    id VARCHAR(36) PRIMARY KEY,
    question VARCHAR(500) NOT NULL,
    description TEXT,
    options LONGTEXT NOT NULL,
    allow_multiple TINYINT(1) NOT NULL DEFAULT 0,      -- олон сонголт зөвшөөрөх эсэх
    min_choices INT NULL,                               -- доод тал нь хэдэн сонголт (NULL = хязгааргүй)
    max_choices INT NULL,                               -- дээд тал нь хэдэн сонголт (NULL = хязгааргүй)
    anonymous TINYINT(1) NOT NULL DEFAULT 0,            -- нууц санал асуулга
    visible_to_user_ids LONGTEXT NULL,                  -- JSON: хоосон/NULL = бүх ажилтанд нээлттэй
    status ENUM('open','closed') NOT NULL DEFAULT 'open',
    closes_at DATE NULL,                                -- автоматаар хаагдах огноо
    created_by VARCHAR(36) NOT NULL,
    created_by_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Саналууд — нэг хүн нэг асуулгад нэг л удаа (дахин өгвөл сольж бичигдэнэ)
CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    option_ids LONGTEXT NOT NULL,                       -- JSON: сонгосон сонголтын id-ууд
    voted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (poll_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. ALTER — polls хүснэгт ХУУЧИН хувилбараар (дээрх 3 баганагүйгээр)
--    аль хэдийн үүссэн байвал л ажиллуулна.
--    Шинээр үүсгэсэн бол энэ хэсэг ХЭРЭГГҮЙ (Duplicate column алдаа өгнө).
--
--    MariaDB (cPanel-ийн ихэнх сервер) дээр IF NOT EXISTS ажиллана:
-- ============================================================

ALTER TABLE polls ADD COLUMN IF NOT EXISTS min_choices INT NULL AFTER allow_multiple;
ALTER TABLE polls ADD COLUMN IF NOT EXISTS max_choices INT NULL AFTER min_choices;
ALTER TABLE polls ADD COLUMN IF NOT EXISTS visible_to_user_ids LONGTEXT NULL AFTER anonymous;

-- Хэрэв MySQL 5.7/8.0 (IF NOT EXISTS дэмжихгүй) бол дээрх 3 мөрийн оронд:
-- ALTER TABLE polls ADD COLUMN min_choices INT NULL AFTER allow_multiple;
-- ALTER TABLE polls ADD COLUMN max_choices INT NULL AFTER min_choices;
-- ALTER TABLE polls ADD COLUMN visible_to_user_ids LONGTEXT NULL AFTER anonymous;
