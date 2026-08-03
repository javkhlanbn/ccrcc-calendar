<?php
declare(strict_types=1);

date_default_timezone_set('UTC');
header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', '0');

function json_response($payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function parse_env_file(string $path): array
{
    if (!is_file($path)) {
        return [];
    }

    $env = [];
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return $env;
    }

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || str_starts_with($trimmed, '#')) {
            continue;
        }

        $parts = explode('=', $trimmed, 2);
        if (count($parts) !== 2) {
            continue;
        }

        $key = trim($parts[0]);
        $value = trim($parts[1]);
        $value = trim($value, "\"'");
        $env[$key] = $value;
    }

    return $env;
}

function env_value(string $key, $default, array $env)
{
    if (array_key_exists($key, $env)) {
        return $env[$key];
    }

    $value = getenv($key);
    if ($value !== false && $value !== '') {
        return $value;
    }

    return $default;
}

function column_exists(PDO $pdo, string $table, string $column): bool
{
    $sql = 'SELECT COUNT(*) AS cnt FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = :table AND column_name = :column';
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['table' => $table, 'column' => $column]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return (int)($row['cnt'] ?? 0) > 0;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $root = dirname(__DIR__);
    $env = parse_env_file($root . '/.env.local');

    $dbHost = (string)env_value('DB_HOST', '127.0.0.1', $env);
    $dbPort = (string)env_value('DB_PORT', '3306', $env);
    $dbUser = (string)env_value('DB_USER', 'root', $env);
    $dbPassword = (string)env_value('DB_PASSWORD', '', $env);
    $dbName = (string)env_value('DB_NAME', 'calendar', $env);

    $adminUsername = (string)env_value('ADMIN_USERNAME', 'admin', $env);
    $adminPassword = (string)env_value('ADMIN_PASSWORD', 'admin12345', $env);

    $serverDsn = sprintf('mysql:host=%s;port=%s;charset=utf8mb4', $dbHost, $dbPort);
    $serverPdo = new PDO($serverDsn, $dbUser, $dbPassword, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    try {
        $serverPdo->exec(sprintf('CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', str_replace('`', '``', $dbName)));
    } catch (Throwable $e) {
        // Shared hosting can block CREATE DATABASE. Continue if DB already exists.
    }

    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $dbHost, $dbPort, $dbName);
    $pdo = new PDO($dsn, $dbUser, $dbPassword, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS users (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS projects (
            id VARCHAR(36) PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            status ENUM('Planning','Ongoing','Completed') NOT NULL DEFAULT 'Planning',
            tags LONGTEXT,
            visible_to_user_ids LONGTEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS events (
            id VARCHAR(36) PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            date DATE NOT NULL,
            category ENUM('Project','Environmental','Internal','Birthday') NOT NULL,
            priority ENUM('Low','Medium','High') NOT NULL,
            birthday_user_id INT UNSIGNED NULL,
            project_id VARCHAR(36),
            tags LONGTEXT,
            attachments LONGTEXT,
            visible_to_user_ids LONGTEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS tasks (
            id VARCHAR(36) PRIMARY KEY,
            project_id VARCHAR(36) NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            assigned_to_user_ids LONGTEXT,
            due_date DATE NOT NULL,
            status ENUM('Pending','InProgress','Completed') NOT NULL DEFAULT 'Pending',
            attachments LONGTEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS procurement_plans (
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
            visible_to_user_ids LONGTEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    if (!column_exists($pdo, 'users', 'photo_url')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN photo_url LONGTEXT NULL AFTER last_name');
    }
    if (!column_exists($pdo, 'events', 'attachments')) {
        $pdo->exec('ALTER TABLE events ADD COLUMN attachments LONGTEXT NULL AFTER tags');
    }
    if (!column_exists($pdo, 'events', 'birthday_user_id')) {
        $pdo->exec('ALTER TABLE events ADD COLUMN birthday_user_id INT UNSIGNED NULL AFTER priority');
    }
    if (!column_exists($pdo, 'tasks', 'attachments')) {
        $pdo->exec('ALTER TABLE tasks ADD COLUMN attachments LONGTEXT NULL AFTER status');
    }

    // ===== 2026 шинэчлэл: нэмэлт баганууд =====
    if (!column_exists($pdo, 'users', 'permissions')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN permissions LONGTEXT NULL AFTER role');
    }
    if (!column_exists($pdo, 'events', 'time')) {
        $pdo->exec('ALTER TABLE events ADD COLUMN `time` VARCHAR(5) NULL AFTER date');
    }
    if (!column_exists($pdo, 'events', 'end_time')) {
        $pdo->exec('ALTER TABLE events ADD COLUMN end_time VARCHAR(5) NULL AFTER `time`');
    }
    if (!column_exists($pdo, 'events', 'duration_minutes')) {
        $pdo->exec('ALTER TABLE events ADD COLUMN duration_minutes INT NULL AFTER end_time');
    }
    if (!column_exists($pdo, 'events', 'recurrence')) {
        $pdo->exec('ALTER TABLE events ADD COLUMN recurrence VARCHAR(20) NULL AFTER duration_minutes');
    }
    if (!column_exists($pdo, 'events', 'meeting_type')) {
        $pdo->exec('ALTER TABLE events ADD COLUMN meeting_type VARCHAR(20) NULL AFTER recurrence');
    }
    if (!column_exists($pdo, 'events', 'location')) {
        $pdo->exec('ALTER TABLE events ADD COLUMN location VARCHAR(255) NULL AFTER meeting_type');
    }
    if (!column_exists($pdo, 'events', 'attendee_user_ids')) {
        $pdo->exec('ALTER TABLE events ADD COLUMN attendee_user_ids LONGTEXT NULL AFTER location');
    }
    if (!column_exists($pdo, 'events', 'minutes_keeper_user_id')) {
        $pdo->exec('ALTER TABLE events ADD COLUMN minutes_keeper_user_id VARCHAR(36) NULL AFTER attendee_user_ids');
    }
    if (!column_exists($pdo, 'events', 'series_id')) {
        $pdo->exec('ALTER TABLE events ADD COLUMN series_id VARCHAR(36) NULL AFTER minutes_keeper_user_id');
    }
    // events.category ENUM-д Meeting/Report нэмэх (шаардлагатай үед л)
    try {
        $col = $pdo->query("SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'events' AND column_name = 'category'")->fetch();
        if ($col && stripos((string)$col['COLUMN_TYPE'], 'Meeting') === false) {
            $pdo->exec("ALTER TABLE events MODIFY COLUMN category ENUM('Project','Environmental','Internal','Birthday','Meeting','Report') NOT NULL");
        }
    } catch (Throwable $e) { /* ignore */ }
    // tasks: source_label, assigned_by_name + project_id NULL
    if (!column_exists($pdo, 'tasks', 'source_label')) {
        $pdo->exec('ALTER TABLE tasks ADD COLUMN source_label VARCHAR(255) NULL AFTER project_id');
    }
    if (!column_exists($pdo, 'tasks', 'assigned_by_name')) {
        $pdo->exec('ALTER TABLE tasks ADD COLUMN assigned_by_name VARCHAR(255) NULL AFTER source_label');
    }
    try {
        $c = $pdo->query("SELECT IS_NULLABLE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tasks' AND column_name = 'project_id'")->fetch();
        if ($c && strtoupper((string)$c['IS_NULLABLE']) === 'NO') {
            $pdo->exec('ALTER TABLE tasks MODIFY COLUMN project_id VARCHAR(36) NULL');
        }
    } catch (Throwable $e) { /* ignore */ }
    // procurement_plans.editable_by_user_ids
    if (!column_exists($pdo, 'procurement_plans', 'editable_by_user_ids')) {
        $pdo->exec('ALTER TABLE procurement_plans ADD COLUMN editable_by_user_ids LONGTEXT NULL AFTER visible_to_user_ids');
    }

    // ===== 2026 шинэчлэл: шинэ хүснэгтүүд =====
    $pdo->exec("CREATE TABLE IF NOT EXISTS meeting_minutes (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        `time` VARCHAR(5) NULL,
        attendee_user_ids LONGTEXT,
        agenda LONGTEXT,
        decisions LONGTEXT,
        notes LONGTEXT,
        attachments LONGTEXT,
        visible_to_user_ids LONGTEXT,
        created_by VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS leave_requests (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        days INT NOT NULL DEFAULT 0,
        reason TEXT,
        status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
        `year` INT NOT NULL,
        reviewed_by VARCHAR(36) NULL,
        reviewed_by_name VARCHAR(255) NULL,
        reviewed_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_leave_user_year (user_id, `year`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS leave_settings (
        `year` INT PRIMARY KEY,
        days INT NOT NULL DEFAULT 15,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS leave_entitlements (
        user_id VARCHAR(36) NOT NULL,
        `year` INT NOT NULL,
        days INT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, `year`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS meeting_signals (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        meeting_id VARCHAR(36) NULL,
        title VARCHAR(255) NOT NULL,
        meeting_time VARCHAR(5) NULL,
        started_by VARCHAR(36) NULL,
        started_by_name VARCHAR(255) NULL,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(36) PRIMARY KEY,
        sender_id VARCHAR(36) NOT NULL,
        recipient_id VARCHAR(36) NOT NULL,
        content LONGTEXT,
        attachments LONGTEXT,
        read_at TIMESTAMP NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_msg_recipient (recipient_id),
        INDEX idx_msg_pair (sender_id, recipient_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS personal_meeting_notes (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        meeting_id VARCHAR(36) NULL,
        meeting_title VARCHAR(255) NOT NULL,
        meeting_date DATE NULL,
        notes LONGTEXT,
        director_tasks LONGTEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_personal_notes_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Онлайн төлөв (PHP stateless тул хүснэгтэд хадгална)
    $pdo->exec("CREATE TABLE IF NOT EXISTS user_presence (
        user_id VARCHAR(36) PRIMARY KEY,
        last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS director_tasks (
            id VARCHAR(36) PRIMARY KEY,
            title VARCHAR(500) NOT NULL,
            description LONGTEXT,
            assigned_to_user_ids LONGTEXT,
            department VARCHAR(255),
            priority ENUM('High','Medium','Low') NOT NULL DEFAULT 'Medium',
            start_date DATE NOT NULL,
            due_date DATE NOT NULL,
            status ENUM('NotStarted','InProgress','Completed','Cancelled') NOT NULL DEFAULT 'NotStarted',
            progress INT NOT NULL DEFAULT 0,
            attachments LONGTEXT,
            notes LONGTEXT,
            activity_log LONGTEXT,
            created_by VARCHAR(36),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Санал асуулга — асуулт, сонголтууд (JSON), тохиргоо
    $pdo->exec("CREATE TABLE IF NOT EXISTS polls (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Өмнө үүссэн polls хүснэгтэд сонголтын хязгаарын баганууд нэмэгдэнэ
    if (!column_exists($pdo, 'polls', 'min_choices')) {
        $pdo->exec('ALTER TABLE polls ADD COLUMN min_choices INT NULL AFTER allow_multiple');
    }
    if (!column_exists($pdo, 'polls', 'max_choices')) {
        $pdo->exec('ALTER TABLE polls ADD COLUMN max_choices INT NULL AFTER min_choices');
    }
    // Оролцох ажилчдын хязгаарлалт (хоосон/NULL = бүгдэд нээлттэй)
    if (!column_exists($pdo, 'polls', 'visible_to_user_ids')) {
        $pdo->exec('ALTER TABLE polls ADD COLUMN visible_to_user_ids LONGTEXT NULL AFTER anonymous');
    }

    // Санал асуулгын саналууд — нэг хүн нэг асуулгад нэг л удаа (дахин өгвөл сольж бичнэ)
    $pdo->exec("CREATE TABLE IF NOT EXISTS poll_votes (
        poll_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        option_ids LONGTEXT NOT NULL,
        voted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (poll_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Ажлын төлөвлөгөө — жилийн/хагас жилийн/сарын/7 хоногийн хүснэгт, хэлтэс тус бүрээр.
    // Багана (columns_json) болон мөр (rows_json) нь чөлөөтэй нэмэгддэг тул JSON-оор хадгална.
    $pdo->exec("CREATE TABLE IF NOT EXISTS work_plans (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Гарын үсгийг бүртгэлтэй ажилтнаар сонгож баталгаажуулах баганууд (хуучин хүснэгтэд нэмэгдэнэ)
    foreach ([
        'approved_by_user_id' => 'VARCHAR(36) NULL',
        'approved_at' => 'TIMESTAMP NULL',
        'reviewed_by_user_id' => 'VARCHAR(36) NULL',
        'reviewed_at' => 'TIMESTAMP NULL',
        'compiled_by_user_id' => 'VARCHAR(36) NULL',
        'compiled_at' => 'TIMESTAMP NULL',
    ] as $column => $definition) {
        if (!column_exists($pdo, 'work_plans', $column)) {
            $pdo->exec("ALTER TABLE work_plans ADD COLUMN {$column} {$definition}");
        }
    }

    $stmt = $pdo->prepare('SELECT id FROM users WHERE username = :username LIMIT 1');
    $stmt->execute(['username' => $adminUsername]);
    $admin = $stmt->fetch();

    if (!$admin) {
        $insert = $pdo->prepare(
            "INSERT INTO users (username, password_hash, first_name, last_name, department, role, status)
             VALUES (:username, :password_hash, :first_name, :last_name, :department, 'admin', 'approved')"
        );
        $insert->execute([
            'username' => $adminUsername,
            'password_hash' => password_hash($adminPassword, PASSWORD_BCRYPT),
            'first_name' => 'System',
            'last_name' => 'Admin',
            'department' => 'Захиргаа, санхүүгийн хэлтэс',
        ]);
    }

    return $pdo;
}

function json_field($value): array
{
    if ($value === null || $value === '') {
        return [];
    }

    $decoded = json_decode((string)$value, true);
    return is_array($decoded) ? $decoded : [];
}

// Map a procurement-plan request body (camelCase) to DB columns (snake_case).
function procurement_payload(array $body): array
{
    $num = static fn ($v) => ($v === null || $v === '') ? 0 : (float)$v;
    $idx = $body['idx'] ?? null;
    return [
        'idx' => ($idx === null || $idx === '') ? null : (int)$idx,
        'code' => (string)($body['code'] ?? ''),
        'name' => (string)($body['name'] ?? ''),
        'type' => (string)($body['type'] ?? ''),
        'budget_cost' => $num($body['budgetCost'] ?? 0),
        'year_financing' => $num($body['yearFinancing'] ?? 0),
        'tender_method' => (string)($body['tenderMethod'] ?? ''),
        'tender_month' => (string)($body['tenderMonth'] ?? ''),
        'sustainable' => (string)($body['sustainable'] ?? ''),
        'notes' => (string)($body['notes'] ?? ''),
        'project_name' => (string)($body['projectName'] ?? ''),
        'implement_period' => (string)($body['implementPeriod'] ?? ''),
        'committee_formed' => (string)($body['committeeFormed'] ?? ''),
        'advertised' => (string)($body['advertised'] ?? ''),
        'tender_opened' => (string)($body['tenderOpened'] ?? ''),
        'committee_met' => (string)($body['committeeMet'] ?? ''),
        'notice_sent' => (string)($body['noticeSent'] ?? ''),
        'contract_signed' => (string)($body['contractSigned'] ?? ''),
        'contract_value' => $num($body['contractValue'] ?? 0),
        'payment1' => $num($body['payment1'] ?? 0),
        'payment2' => $num($body['payment2'] ?? 0),
        'payment3' => $num($body['payment3'] ?? 0),
        'variance' => (string)($body['variance'] ?? ''),
        'extra_notes' => (string)($body['extraNotes'] ?? ''),
        'visible_to_user_ids' => json_encode(is_array($body['visibleToUserIds'] ?? null) ? $body['visibleToUserIds'] : []),
        'editable_by_user_ids' => json_encode(is_array($body['editableByUserIds'] ?? null) ? $body['editableByUserIds'] : []),
    ];
}

function to_iso($value): string
{
    $time = strtotime((string)$value);
    if ($time === false) {
        return gmdate('c');
    }
    return gmdate('c', $time);
}

function to_local_date($value): string
{
    return substr((string)$value, 0, 10);
}

// Ажлын өдрийн тоо (эхлэх/дуусах өдрийг оруулна, амралтын өдрийг тооцохгүй)
function count_working_days(string $start, string $end): int
{
    $s = DateTime::createFromFormat('Y-m-d', substr($start, 0, 10));
    $e = DateTime::createFromFormat('Y-m-d', substr($end, 0, 10));
    if (!$s || !$e) {
        return 0;
    }
    $s->setTime(0, 0);
    $e->setTime(0, 0);
    if ($e < $s) {
        return 0;
    }
    $count = 0;
    $cur = clone $s;
    while ($cur <= $e) {
        $dow = (int)$cur->format('N'); // 1=Даваа .. 7=Ням
        if ($dow < 6) {
            $count++;
        }
        $cur->modify('+1 day');
    }
    return $count;
}

// Тухайн ажилтны амралтын эрх: override байвал түүнийг, эс бөгөөс глобал өгөгдмөл (15)
function leave_entitlement(PDO $pdo, int $year, ?string $userId = null): int
{
    if ($userId !== null && $userId !== '') {
        $st = $pdo->prepare('SELECT days FROM leave_entitlements WHERE user_id = :u AND `year` = :y LIMIT 1');
        $st->execute(['u' => $userId, 'y' => $year]);
        $r = $st->fetch();
        if ($r) {
            return (int)$r['days'];
        }
    }
    $st = $pdo->prepare('SELECT days FROM leave_settings WHERE `year` = :y LIMIT 1');
    $st->execute(['y' => $year]);
    $r = $st->fetch();
    return $r ? (int)$r['days'] : 15;
}

const MAX_LEAVE_SPLITS = 4;

function to_profile(array $row): array
{
    $displayName = trim(((string)($row['last_name'] ?? '')) . ' ' . ((string)($row['first_name'] ?? '')));

    return [
        'uid' => (string)$row['id'],
        'email' => $row['username'],
        'firstName' => $row['first_name'],
        'lastName' => $row['last_name'],
        'displayName' => $displayName,
        'photoURL' => $row['photo_url'] ?: null,
        'department' => $row['department'],
        'role' => $row['role'],
        'permissions' => json_field($row['permissions'] ?? null),
        'status' => $row['status'],
        'createdAt' => to_iso($row['created_at'] ?? ''),
    ];
}

function current_route(): string
{
    $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $basePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');

    if ($basePath !== '' && $basePath !== '/' && str_starts_with($uriPath, $basePath)) {
        $uriPath = substr($uriPath, strlen($basePath));
    }

    if (str_starts_with($uriPath, '/index.php')) {
        $uriPath = substr($uriPath, 10) ?: '/';
    }

    if (str_starts_with($uriPath, '/api')) {
        $uriPath = substr($uriPath, 4) ?: '/';
    }

    return '/' . ltrim($uriPath, '/');
}

try {
    $pdo = db();
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $route = current_route();
    $body = read_json_body();

    if ($method === 'GET' && $route === '/health') {
        $pdo->query('SELECT 1');
        json_response([
            'status' => 'ok',
            'environment' => getenv('NODE_ENV') ?: 'production',
            'timestamp' => gmdate('c'),
            'database' => 'connected',
        ]);
    }

    if ($method === 'POST' && $route === '/auth/register') {
        $username = strtolower(trim((string)($body['username'] ?? '')));
        $password = (string)($body['password'] ?? '');
        $firstName = trim((string)($body['firstName'] ?? ''));
        $lastName = trim((string)($body['lastName'] ?? ''));
        $department = trim((string)($body['department'] ?? ''));

        if ($username === '' || $password === '' || $firstName === '' || $lastName === '' || $department === '') {
            json_response(['message' => 'Бүх талбарыг бөглөнө үү.'], 400);
        }

        if (str_contains($username, '@')) {
            json_response(['message' => 'Нэвтрэх нэрэнд @ тэмдэгт ашиглахгүй.'], 400);
        }

        $stmt = $pdo->prepare('SELECT id FROM users WHERE username = :username LIMIT 1');
        $stmt->execute(['username' => $username]);
        if ($stmt->fetch()) {
            json_response(['message' => 'Энэ нэвтрэх нэр бүртгэлтэй байна.'], 409);
        }

        $insert = $pdo->prepare(
            "INSERT INTO users (username, password_hash, first_name, last_name, department, role, status)
             VALUES (:username, :password_hash, :first_name, :last_name, :department, 'user', 'pending')"
        );
        $insert->execute([
            'username' => $username,
            'password_hash' => password_hash($password, PASSWORD_BCRYPT),
            'first_name' => $firstName,
            'last_name' => $lastName,
            'department' => $department,
        ]);

        $rowStmt = $pdo->prepare('SELECT * FROM users WHERE username = :username LIMIT 1');
        $rowStmt->execute(['username' => $username]);
        $row = $rowStmt->fetch();

        if (!$row) {
            json_response(['message' => 'Бүртгэл үүсгэх үед алдаа гарлаа.'], 500);
        }

        $profile = to_profile($row);
        json_response([
            'user' => [
                'uid' => $profile['uid'],
                'email' => $profile['email'],
                'displayName' => $profile['displayName'],
                'photoURL' => $profile['photoURL'],
            ],
            'profile' => $profile,
        ], 201);
    }

    if ($method === 'POST' && $route === '/auth/login') {
        $username = strtolower(trim((string)($body['username'] ?? '')));
        $password = (string)($body['password'] ?? '');

        if ($username === '' || $password === '') {
            json_response(['message' => 'Нэвтрэх нэр болон нууц үгээ оруулна уу.'], 400);
        }

        $stmt = $pdo->prepare('SELECT * FROM users WHERE username = :username LIMIT 1');
        $stmt->execute(['username' => $username]);
        $row = $stmt->fetch();

        if (!$row || !password_verify($password, (string)$row['password_hash'])) {
            json_response(['message' => 'Нэвтрэх нэр эсвэл нууц үг буруу байна.'], 401);
        }

        $profile = to_profile($row);
        json_response([
            'user' => [
                'uid' => $profile['uid'],
                'email' => $profile['email'],
                'displayName' => $profile['displayName'],
                'photoURL' => $profile['photoURL'],
            ],
            'profile' => $profile,
        ]);
    }

    if ($method === 'GET' && $route === '/users') {
        $rows = $pdo->query('SELECT * FROM users ORDER BY created_at DESC')->fetchAll();
        $profiles = array_map('to_profile', $rows ?: []);
        json_response($profiles);
    }

    if ($method === 'PATCH' && preg_match('#^/users/(\d+)/status$#', $route, $matches)) {
        $uid = (int)$matches[1];
        $status = (string)($body['status'] ?? '');
        if (!in_array($status, ['pending', 'approved', 'rejected'], true)) {
            json_response(['message' => 'Төлөв буруу байна.'], 400);
        }

        $stmt = $pdo->prepare('UPDATE users SET status = :status, updated_at = CURRENT_TIMESTAMP WHERE id = :id');
        $stmt->execute(['status' => $status, 'id' => $uid]);
        json_response(['success' => true]);
    }

    if ($method === 'POST' && $route === '/users') {
        $username = strtolower(trim((string)($body['username'] ?? '')));
        $password = (string)($body['password'] ?? '');
        $firstName = trim((string)($body['firstName'] ?? ''));
        $lastName = trim((string)($body['lastName'] ?? ''));
        $department = trim((string)($body['department'] ?? ''));

        if ($username === '' || $password === '' || $firstName === '' || $lastName === '' || $department === '') {
            json_response(['message' => 'Бүх талбарыг бөглөнө үү.'], 400);
        }
        if (str_contains($username, '@')) {
            json_response(['message' => 'Нэвтрэх нэрэнд @ тэмдэгт ашиглахгүй.'], 400);
        }
        if (strlen(trim($password)) < 6) {
            json_response(['message' => 'Нууц үг хамгийн багадаа 6 тэмдэгт байна.'], 400);
        }

        $allowedPerms = ['procurement', 'procurement_view', 'meeting', 'minutes'];
        $role = ((string)($body['role'] ?? 'user')) === 'admin' ? 'admin' : 'user';
        $perms = array_values(array_filter(is_array($body['permissions'] ?? null) ? $body['permissions'] : [], fn ($p) => in_array($p, $allowedPerms, true)));

        $exists = $pdo->prepare('SELECT id FROM users WHERE username = :username LIMIT 1');
        $exists->execute(['username' => $username]);
        if ($exists->fetch()) {
            json_response(['message' => 'Энэ нэвтрэх нэр бүртгэлтэй байна.'], 409);
        }

        $insert = $pdo->prepare(
            "INSERT INTO users (username, password_hash, first_name, last_name, department, role, permissions, status)
             VALUES (:username, :password_hash, :first_name, :last_name, :department, :role, :permissions, 'approved')"
        );
        $insert->execute([
            'username' => $username,
            'password_hash' => password_hash($password, PASSWORD_BCRYPT),
            'first_name' => $firstName,
            'last_name' => $lastName,
            'department' => $department,
            'role' => $role,
            'permissions' => json_encode($perms),
        ]);

        $rowStmt = $pdo->prepare('SELECT * FROM users WHERE username = :username LIMIT 1');
        $rowStmt->execute(['username' => $username]);
        json_response(['success' => true, 'profile' => to_profile($rowStmt->fetch())], 201);
    }

    if ($method === 'PATCH' && preg_match('#^/users/(\d+)$#', $route, $matches)) {
        $uid = (int)$matches[1];
        $firstName = trim((string)($body['firstName'] ?? ''));
        $lastName = trim((string)($body['lastName'] ?? ''));
        $department = trim((string)($body['department'] ?? ''));
        $password = trim((string)($body['password'] ?? ''));

        if ($firstName === '' || $lastName === '' || $department === '') {
            json_response(['message' => 'Нэр болон хэлтсийн мэдээллийг бүрэн оруулна уу.'], 400);
        }

        $sets = ['first_name = :first_name', 'last_name = :last_name', 'department = :department'];
        $params = ['first_name' => $firstName, 'last_name' => $lastName, 'department' => $department, 'id' => $uid];

        if (array_key_exists('email', $body)) {
            $newUsername = strtolower(trim((string)$body['email']));
            if ($newUsername === '') {
                json_response(['message' => 'Нэвтрэх нэрээ оруулна уу.'], 400);
            }
            if (str_contains($newUsername, '@')) {
                json_response(['message' => 'Нэвтрэх нэрэнд @ тэмдэгт ашиглахгүй.'], 400);
            }
            $dup = $pdo->prepare('SELECT id FROM users WHERE username = :u AND id <> :id LIMIT 1');
            $dup->execute(['u' => $newUsername, 'id' => $uid]);
            if ($dup->fetch()) {
                json_response(['message' => 'Энэ нэвтрэх нэр бүртгэлтэй байна.'], 409);
            }
            $sets[] = 'username = :username';
            $params['username'] = $newUsername;
        }

        if (array_key_exists('role', $body)) {
            $role = (string)$body['role'];
            if (!in_array($role, ['admin', 'user'], true)) {
                json_response(['message' => 'Хэрэглэгчийн эрх буруу байна.'], 400);
            }
            $sets[] = 'role = :role';
            $params['role'] = $role;
        }

        if (array_key_exists('permissions', $body)) {
            $allowedPerms = ['procurement', 'procurement_view', 'meeting', 'minutes'];
            $perms = is_array($body['permissions']) ? $body['permissions'] : [];
            foreach ($perms as $p) {
                if (!in_array($p, $allowedPerms, true)) {
                    json_response(['message' => 'Хандалтын эрх буруу байна.'], 400);
                }
            }
            $sets[] = 'permissions = :permissions';
            $params['permissions'] = json_encode(array_values($perms));
        }

        if ($password !== '') {
            if (strlen($password) < 6) {
                json_response(['message' => 'Нууц үг хамгийн багадаа 6 тэмдэгт байна.'], 400);
            }
            $sets[] = 'password_hash = :password_hash';
            $params['password_hash'] = password_hash($password, PASSWORD_BCRYPT);
        }

        $stmt = $pdo->prepare('UPDATE users SET ' . implode(', ', $sets) . ', updated_at = CURRENT_TIMESTAMP WHERE id = :id');
        $stmt->execute($params);

        $rowStmt = $pdo->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
        $rowStmt->execute(['id' => $uid]);
        $row = $rowStmt->fetch();
        if (!$row) {
            json_response(['message' => 'Хэрэглэгч олдсонгүй.'], 404);
        }
        json_response(['success' => true, 'profile' => to_profile($row)]);
    }

    if ($method === 'DELETE' && preg_match('#^/users/(\d+)$#', $route, $matches)) {
        $uid = (int)$matches[1];
        $row = $pdo->prepare('SELECT id, role FROM users WHERE id = :id LIMIT 1');
        $row->execute(['id' => $uid]);
        $target = $row->fetch();
        if (!$target) {
            json_response(['message' => 'Хэрэглэгч олдсонгүй.'], 404);
        }
        if ($target['role'] === 'admin') {
            $cnt = (int)($pdo->query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")->fetch()['c'] ?? 0);
            if ($cnt <= 1) {
                json_response(['message' => 'Сүүлчийн админ хэрэглэгчийг устгах боломжгүй.'], 400);
            }
        }
        $stmt = $pdo->prepare('DELETE FROM users WHERE id = :id');
        $stmt->execute(['id' => $uid]);
        json_response(['success' => true]);
    }

    if ($method === 'PATCH' && preg_match('#^/users/(\d+)/photo$#', $route, $matches)) {
        $uid = (int)$matches[1];
        $photoURL = (string)($body['photoURL'] ?? '');

        if ($photoURL === '') {
            json_response(['message' => 'Зургийн мэдээлэл буруу байна.'], 400);
        }

        $stmt = $pdo->prepare('UPDATE users SET photo_url = :photo_url, updated_at = CURRENT_TIMESTAMP WHERE id = :id');
        $stmt->execute(['photo_url' => $photoURL, 'id' => $uid]);
        json_response(['success' => true]);
    }

    if ($method === 'GET' && $route === '/projects') {
        $rows = $pdo->query('SELECT * FROM projects ORDER BY created_at DESC')->fetchAll();
        $projects = [];
        foreach ($rows ?: [] as $row) {
            $projects[] = [
                'id' => $row['id'],
                'title' => $row['title'],
                'description' => $row['description'],
                'startDate' => $row['start_date'],
                'endDate' => $row['end_date'],
                'status' => $row['status'],
                'tags' => json_field($row['tags'] ?? null),
                'visibleToUserIds' => json_field($row['visible_to_user_ids'] ?? null),
            ];
        }
        json_response($projects);
    }

    if ($method === 'POST' && $route === '/projects') {
        $id = (string)($body['id'] ?? '');
        $title = (string)($body['title'] ?? '');
        $description = (string)($body['description'] ?? '');
        $startDate = (string)($body['startDate'] ?? '');
        $endDate = (string)($body['endDate'] ?? '');
        $status = (string)($body['status'] ?? 'Planning');
        $tags = $body['tags'] ?? [];
        $visibleToUserIds = $body['visibleToUserIds'] ?? [];

        if ($id === '' || $title === '' || $startDate === '' || $endDate === '') {
            json_response(['message' => 'Үндсэн талбарыг бөглөнө үү.'], 400);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO projects (id, title, description, start_date, end_date, status, tags, visible_to_user_ids)
             VALUES (:id, :title, :description, :start_date, :end_date, :status, :tags, :visible_to_user_ids)'
        );
        $stmt->execute([
            'id' => $id,
            'title' => $title,
            'description' => $description,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'status' => $status,
            'tags' => json_encode(is_array($tags) ? $tags : []),
            'visible_to_user_ids' => json_encode(is_array($visibleToUserIds) ? $visibleToUserIds : []),
        ]);

        json_response(['success' => true, 'id' => $id], 201);
    }

    if ($method === 'PUT' && preg_match('#^/projects/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);

        $stmt = $pdo->prepare(
            'UPDATE projects SET title = :title, description = :description, start_date = :start_date, end_date = :end_date, status = :status, tags = :tags, visible_to_user_ids = :visible_to_user_ids, updated_at = CURRENT_TIMESTAMP
             WHERE id = :id'
        );
        $stmt->execute([
            'title' => (string)($body['title'] ?? ''),
            'description' => (string)($body['description'] ?? ''),
            'start_date' => (string)($body['startDate'] ?? ''),
            'end_date' => (string)($body['endDate'] ?? ''),
            'status' => (string)($body['status'] ?? 'Planning'),
            'tags' => json_encode(is_array($body['tags'] ?? null) ? $body['tags'] : []),
            'visible_to_user_ids' => json_encode(is_array($body['visibleToUserIds'] ?? null) ? $body['visibleToUserIds'] : []),
            'id' => $id,
        ]);

        json_response(['success' => true]);
    }

    if ($method === 'DELETE' && preg_match('#^/projects/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $stmt = $pdo->prepare('DELETE FROM projects WHERE id = :id');
        $stmt->execute(['id' => $id]);
        json_response(['success' => true]);
    }

    if ($method === 'GET' && $route === '/events') {
        $rows = $pdo->query('SELECT * FROM events ORDER BY date DESC')->fetchAll();
        $events = [];
        foreach ($rows ?: [] as $row) {
            $events[] = [
                'id' => $row['id'],
                'title' => $row['title'],
                'description' => $row['description'],
                'date' => $row['date'],
                'time' => ($row['time'] ?? null) ?: null,
                'category' => $row['category'],
                'priority' => $row['priority'],
                'birthdayUserId' => $row['birthday_user_id'] !== null ? (string)$row['birthday_user_id'] : null,
                'projectId' => $row['project_id'],
                'tags' => json_field($row['tags'] ?? null),
                'attachments' => json_field($row['attachments'] ?? null),
                'visibleToUserIds' => json_field($row['visible_to_user_ids'] ?? null),
                'endTime' => ($row['end_time'] ?? null) ?: null,
                'durationMinutes' => ($row['duration_minutes'] ?? null) === null ? null : (int)$row['duration_minutes'],
                'recurrence' => ($row['recurrence'] ?? null) ?: null,
                'meetingType' => ($row['meeting_type'] ?? null) ?: null,
                'location' => ($row['location'] ?? null) ?: null,
                'attendeeUserIds' => json_field($row['attendee_user_ids'] ?? null),
                'minutesKeeperUserId' => ($row['minutes_keeper_user_id'] ?? null) ?: null,
                'seriesId' => ($row['series_id'] ?? null) ?: null,
            ];
        }
        json_response($events);
    }

    if ($method === 'POST' && $route === '/events') {
        $id = (string)($body['id'] ?? '');
        $date = (string)($body['date'] ?? '');
        $category = (string)($body['category'] ?? '');
        $priority = (string)($body['priority'] ?? 'Low');
        $birthdayUserId = $body['birthdayUserId'] ?? null;

        if ($id === '' || $date === '' || $category === '') {
            json_response(['message' => 'Үндсэн талбарыг бөглөнө үү.'], 400);
        }

        if ($category === 'Birthday' && ($birthdayUserId === null || $birthdayUserId === '')) {
            json_response(['message' => 'Төрсөн өдрийн хэрэглэгчийг сонгоно уу.'], 400);
        }

        $title = trim((string)($body['title'] ?? ''));
        if ($title === '') {
            $title = $category === 'Birthday' ? 'Birthday' : 'Untitled Event';
        }

        $stmt = $pdo->prepare(
            'INSERT INTO events (id, title, description, date, `time`, category, priority, birthday_user_id, project_id, tags, attachments, visible_to_user_ids,
                end_time, duration_minutes, recurrence, meeting_type, location, attendee_user_ids, minutes_keeper_user_id, series_id)
             VALUES (:id, :title, :description, :date, :time, :category, :priority, :birthday_user_id, :project_id, :tags, :attachments, :visible_to_user_ids,
                :end_time, :duration_minutes, :recurrence, :meeting_type, :location, :attendee_user_ids, :minutes_keeper_user_id, :series_id)'
        );
        $stmt->execute([
            'id' => $id,
            'title' => $title,
            'description' => (string)($body['description'] ?? ''),
            'date' => $date,
            'time' => ($body['time'] ?? null) ?: null,
            'category' => $category,
            'priority' => $priority,
            'birthday_user_id' => ($birthdayUserId === null || $birthdayUserId === '') ? null : (int)$birthdayUserId,
            'project_id' => ($body['projectId'] ?? null) ?: null,
            'tags' => json_encode(is_array($body['tags'] ?? null) ? $body['tags'] : []),
            'attachments' => json_encode(is_array($body['attachments'] ?? null) ? $body['attachments'] : []),
            'visible_to_user_ids' => json_encode(is_array($body['visibleToUserIds'] ?? null) ? $body['visibleToUserIds'] : []),
            'end_time' => ($body['endTime'] ?? null) ?: null,
            'duration_minutes' => ($body['durationMinutes'] ?? null) === null || ($body['durationMinutes'] ?? '') === '' ? null : (int)$body['durationMinutes'],
            'recurrence' => ($body['recurrence'] ?? null) ?: null,
            'meeting_type' => ($body['meetingType'] ?? null) ?: null,
            'location' => ($body['location'] ?? null) ?: null,
            'attendee_user_ids' => json_encode(is_array($body['attendeeUserIds'] ?? null) ? $body['attendeeUserIds'] : []),
            'minutes_keeper_user_id' => ($body['minutesKeeperUserId'] ?? null) ?: null,
            'series_id' => ($body['seriesId'] ?? null) ?: null,
        ]);

        json_response(['success' => true, 'id' => $id], 201);
    }

    if ($method === 'PUT' && preg_match('#^/events/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);

        $stmt = $pdo->prepare(
            'UPDATE events SET title = :title, description = :description, date = :date, `time` = :time, category = :category, priority = :priority, birthday_user_id = :birthday_user_id, project_id = :project_id, tags = :tags, attachments = :attachments, visible_to_user_ids = :visible_to_user_ids,
                end_time = :end_time, duration_minutes = :duration_minutes, recurrence = :recurrence, meeting_type = :meeting_type, location = :location, attendee_user_ids = :attendee_user_ids, minutes_keeper_user_id = :minutes_keeper_user_id, series_id = :series_id, updated_at = CURRENT_TIMESTAMP
             WHERE id = :id'
        );
        $stmt->execute([
            'title' => (string)($body['title'] ?? ''),
            'description' => (string)($body['description'] ?? ''),
            'date' => (string)($body['date'] ?? ''),
            'time' => ($body['time'] ?? null) ?: null,
            'category' => (string)($body['category'] ?? 'Project'),
            'priority' => (string)($body['priority'] ?? 'Low'),
            'birthday_user_id' => (($body['birthdayUserId'] ?? null) === null || ($body['birthdayUserId'] ?? '') === '') ? null : (int)$body['birthdayUserId'],
            'project_id' => ($body['projectId'] ?? null) ?: null,
            'tags' => json_encode(is_array($body['tags'] ?? null) ? $body['tags'] : []),
            'attachments' => json_encode(is_array($body['attachments'] ?? null) ? $body['attachments'] : []),
            'visible_to_user_ids' => json_encode(is_array($body['visibleToUserIds'] ?? null) ? $body['visibleToUserIds'] : []),
            'end_time' => ($body['endTime'] ?? null) ?: null,
            'duration_minutes' => ($body['durationMinutes'] ?? null) === null || ($body['durationMinutes'] ?? '') === '' ? null : (int)$body['durationMinutes'],
            'recurrence' => ($body['recurrence'] ?? null) ?: null,
            'meeting_type' => ($body['meetingType'] ?? null) ?: null,
            'location' => ($body['location'] ?? null) ?: null,
            'attendee_user_ids' => json_encode(is_array($body['attendeeUserIds'] ?? null) ? $body['attendeeUserIds'] : []),
            'minutes_keeper_user_id' => ($body['minutesKeeperUserId'] ?? null) ?: null,
            'series_id' => ($body['seriesId'] ?? null) ?: null,
            'id' => $id,
        ]);

        json_response(['success' => true]);
    }

    if ($method === 'DELETE' && preg_match('#^/events/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $stmt = $pdo->prepare('DELETE FROM events WHERE id = :id');
        $stmt->execute(['id' => $id]);
        json_response(['success' => true]);
    }

    if ($method === 'GET' && $route === '/tasks') {
        $rows = $pdo->query('SELECT * FROM tasks ORDER BY due_date ASC')->fetchAll();
        $tasks = [];
        foreach ($rows ?: [] as $row) {
            $tasks[] = [
                'id' => $row['id'],
                'projectId' => $row['project_id'] ?? '',
                'sourceLabel' => ($row['source_label'] ?? null) ?: null,
                'assignedByName' => ($row['assigned_by_name'] ?? null) ?: null,
                'title' => $row['title'],
                'description' => $row['description'] ?? '',
                'assignedToUserIds' => json_field($row['assigned_to_user_ids'] ?? null),
                'dueDate' => substr((string)$row['due_date'], 0, 10),
                'status' => $row['status'],
                'attachments' => json_field($row['attachments'] ?? null),
                'createdAt' => to_iso($row['created_at'] ?? ''),
            ];
        }
        json_response($tasks);
    }

    if ($method === 'POST' && $route === '/tasks') {
        $id = (string)($body['id'] ?? '');
        $projectId = (string)($body['projectId'] ?? '');
        $title = (string)($body['title'] ?? '');
        $dueDate = (string)($body['dueDate'] ?? '');

        // Хурлаас өгсөн даалгавар төсөлгүй байж болно — projectId заавал шаардахгүй
        if ($id === '' || $title === '' || $dueDate === '') {
            json_response(['message' => 'Үндсэн талбарыг бөглөнө үү.'], 400);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO tasks (id, project_id, source_label, assigned_by_name, title, description, assigned_to_user_ids, due_date, status, attachments)
             VALUES (:id, :project_id, :source_label, :assigned_by_name, :title, :description, :assigned_to_user_ids, :due_date, :status, :attachments)'
        );
        $stmt->execute([
            'id' => $id,
            'project_id' => $projectId !== '' ? $projectId : null,
            'source_label' => ($body['sourceLabel'] ?? null) ?: null,
            'assigned_by_name' => ($body['assignedByName'] ?? null) ?: null,
            'title' => $title,
            'description' => (string)($body['description'] ?? ''),
            'assigned_to_user_ids' => json_encode(is_array($body['assignedToUserIds'] ?? null) ? $body['assignedToUserIds'] : []),
            'due_date' => $dueDate,
            'status' => (string)($body['status'] ?? 'Pending'),
            'attachments' => json_encode(is_array($body['attachments'] ?? null) ? $body['attachments'] : []),
        ]);

        json_response(['success' => true, 'id' => $id], 201);
    }

    if ($method === 'PUT' && preg_match('#^/tasks/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);

        $stmt = $pdo->prepare(
            'UPDATE tasks SET project_id = :project_id, title = :title, description = :description, assigned_to_user_ids = :assigned_to_user_ids, due_date = :due_date, status = :status, attachments = :attachments, updated_at = CURRENT_TIMESTAMP
             WHERE id = :id'
        );
        $stmt->execute([
            'project_id' => (string)($body['projectId'] ?? ''),
            'title' => (string)($body['title'] ?? ''),
            'description' => (string)($body['description'] ?? ''),
            'assigned_to_user_ids' => json_encode(is_array($body['assignedToUserIds'] ?? null) ? $body['assignedToUserIds'] : []),
            'due_date' => (string)($body['dueDate'] ?? ''),
            'status' => (string)($body['status'] ?? 'Pending'),
            'attachments' => json_encode(is_array($body['attachments'] ?? null) ? $body['attachments'] : []),
            'id' => $id,
        ]);

        json_response(['success' => true]);
    }

    if ($method === 'PATCH' && preg_match('#^/tasks/([^/]+)/status$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $status = (string)($body['status'] ?? '');

        if (!in_array($status, ['Pending', 'InProgress', 'Completed'], true)) {
            json_response(['message' => 'Төлөв буруу байна.'], 400);
        }

        $stmt = $pdo->prepare('UPDATE tasks SET status = :status, updated_at = CURRENT_TIMESTAMP WHERE id = :id');
        $stmt->execute(['status' => $status, 'id' => $id]);
        json_response(['success' => true]);
    }

    if ($method === 'DELETE' && preg_match('#^/tasks/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $stmt = $pdo->prepare('DELETE FROM tasks WHERE id = :id');
        $stmt->execute(['id' => $id]);
        json_response(['success' => true]);
    }

    if ($method === 'GET' && $route === '/procurement-plans') {
        $rows = $pdo->query('SELECT * FROM procurement_plans ORDER BY idx ASC, created_at ASC')->fetchAll();
        $plans = [];
        foreach ($rows ?: [] as $row) {
            $plans[] = [
                'id' => $row['id'],
                'idx' => ($row['idx'] === null) ? null : (int)$row['idx'],
                'code' => $row['code'] ?? '',
                'name' => $row['name'] ?? '',
                'type' => $row['type'] ?? '',
                'budgetCost' => (float)($row['budget_cost'] ?? 0),
                'yearFinancing' => (float)($row['year_financing'] ?? 0),
                'tenderMethod' => $row['tender_method'] ?? '',
                'tenderMonth' => $row['tender_month'] ?? '',
                'sustainable' => $row['sustainable'] ?? '',
                'notes' => $row['notes'] ?? '',
                'projectName' => $row['project_name'] ?? '',
                'implementPeriod' => $row['implement_period'] ?? '',
                'committeeFormed' => $row['committee_formed'] ?? '',
                'advertised' => $row['advertised'] ?? '',
                'tenderOpened' => $row['tender_opened'] ?? '',
                'committeeMet' => $row['committee_met'] ?? '',
                'noticeSent' => $row['notice_sent'] ?? '',
                'contractSigned' => $row['contract_signed'] ?? '',
                'contractValue' => (float)($row['contract_value'] ?? 0),
                'payment1' => (float)($row['payment1'] ?? 0),
                'payment2' => (float)($row['payment2'] ?? 0),
                'payment3' => (float)($row['payment3'] ?? 0),
                'variance' => $row['variance'] ?? '',
                'extraNotes' => $row['extra_notes'] ?? '',
                'visibleToUserIds' => json_field($row['visible_to_user_ids'] ?? null),
                'editableByUserIds' => json_field($row['editable_by_user_ids'] ?? null),
            ];
        }
        json_response($plans);
    }

    if ($method === 'POST' && $route === '/procurement-plans') {
        $id = (string)($body['id'] ?? '');
        $name = trim((string)($body['name'] ?? ''));
        if ($id === '' || $name === '') {
            json_response(['message' => 'Худалдан авах бараа/үйлчилгээний нэрийг оруулна уу.'], 400);
        }

        $params = array_merge(['id' => $id], procurement_payload($body));
        $stmt = $pdo->prepare(
            'INSERT INTO procurement_plans
                (id, idx, code, name, type, budget_cost, year_financing, tender_method, tender_month, sustainable, notes,
                 project_name, implement_period, committee_formed, advertised, tender_opened, committee_met, notice_sent,
                 contract_signed, contract_value, payment1, payment2, payment3, variance, extra_notes, visible_to_user_ids, editable_by_user_ids)
             VALUES (:id, :idx, :code, :name, :type, :budget_cost, :year_financing, :tender_method, :tender_month, :sustainable, :notes,
                 :project_name, :implement_period, :committee_formed, :advertised, :tender_opened, :committee_met, :notice_sent,
                 :contract_signed, :contract_value, :payment1, :payment2, :payment3, :variance, :extra_notes, :visible_to_user_ids, :editable_by_user_ids)'
        );
        $stmt->execute($params);
        json_response(['success' => true, 'id' => $id], 201);
    }

    if ($method === 'PUT' && preg_match('#^/procurement-plans/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $params = array_merge(procurement_payload($body), ['id' => $id]);
        $stmt = $pdo->prepare(
            'UPDATE procurement_plans SET
                idx = :idx, code = :code, name = :name, type = :type, budget_cost = :budget_cost, year_financing = :year_financing,
                tender_method = :tender_method, tender_month = :tender_month, sustainable = :sustainable, notes = :notes,
                project_name = :project_name, implement_period = :implement_period, committee_formed = :committee_formed,
                advertised = :advertised, tender_opened = :tender_opened, committee_met = :committee_met, notice_sent = :notice_sent,
                contract_signed = :contract_signed, contract_value = :contract_value, payment1 = :payment1, payment2 = :payment2,
                payment3 = :payment3, variance = :variance, extra_notes = :extra_notes, visible_to_user_ids = :visible_to_user_ids,
                editable_by_user_ids = :editable_by_user_ids, updated_at = CURRENT_TIMESTAMP
             WHERE id = :id'
        );
        $stmt->execute($params);
        json_response(['success' => true]);
    }

    if ($method === 'DELETE' && preg_match('#^/procurement-plans/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $stmt = $pdo->prepare('DELETE FROM procurement_plans WHERE id = :id');
        $stmt->execute(['id' => $id]);
        json_response(['success' => true]);
    }

    // ---- Director Tasks ----
    if ($method === 'GET' && $route === '/director-tasks') {
        $rows = $pdo->query('SELECT * FROM director_tasks ORDER BY created_at DESC')->fetchAll();
        $items = [];
        foreach ($rows ?: [] as $row) {
            $items[] = [
                'id' => $row['id'],
                'title' => $row['title'],
                'description' => $row['description'] ?? '',
                'assignedToUserIds' => json_field($row['assigned_to_user_ids'] ?? null),
                'department' => $row['department'] ?? '',
                'priority' => $row['priority'],
                'startDate' => substr((string)$row['start_date'], 0, 10),
                'dueDate' => substr((string)$row['due_date'], 0, 10),
                'status' => $row['status'],
                'progress' => (int)($row['progress'] ?? 0),
                'attachments' => json_field($row['attachments'] ?? null),
                'notes' => $row['notes'] ?? '',
                'activityLog' => json_field($row['activity_log'] ?? null),
                'createdBy' => $row['created_by'] ?? '',
                'createdAt' => to_iso($row['created_at'] ?? ''),
                'updatedAt' => to_iso($row['updated_at'] ?? ''),
            ];
        }
        json_response($items);
    }

    if ($method === 'POST' && $route === '/director-tasks') {
        $id = (string)($body['id'] ?? '');
        $title = trim((string)($body['title'] ?? ''));
        $startDate = (string)($body['startDate'] ?? '');
        $dueDate = (string)($body['dueDate'] ?? '');
        if ($id === '' || $title === '' || $startDate === '' || $dueDate === '') {
            json_response(['message' => 'Үндсэн талбарыг бөглөнө үү.'], 400);
        }
        $activityLog = [[
            'id' => bin2hex(random_bytes(5)),
            'type' => 'created',
            'description' => 'Үүрэг үүсгэгдсэн',
            'userId' => (string)($body['createdBy'] ?? ''),
            'userName' => (string)($body['createdByName'] ?? 'Система'),
            'timestamp' => gmdate('c'),
        ]];
        $stmt = $pdo->prepare(
            'INSERT INTO director_tasks (id, title, description, assigned_to_user_ids, department, priority, start_date, due_date, status, progress, attachments, notes, activity_log, created_by)
             VALUES (:id, :title, :description, :assigned_to_user_ids, :department, :priority, :start_date, :due_date, :status, :progress, :attachments, :notes, :activity_log, :created_by)'
        );
        $stmt->execute([
            'id' => $id,
            'title' => $title,
            'description' => (string)($body['description'] ?? ''),
            'assigned_to_user_ids' => json_encode(is_array($body['assignedToUserIds'] ?? null) ? $body['assignedToUserIds'] : []),
            'department' => (string)($body['department'] ?? ''),
            'priority' => in_array((string)($body['priority'] ?? ''), ['High','Medium','Low'], true) ? (string)($body['priority']) : 'Medium',
            'start_date' => $startDate,
            'due_date' => $dueDate,
            'status' => in_array((string)($body['status'] ?? ''), ['NotStarted','InProgress','Completed','Cancelled'], true) ? (string)($body['status']) : 'NotStarted',
            'progress' => max(0, min(100, (int)($body['progress'] ?? 0))),
            'attachments' => json_encode(is_array($body['attachments'] ?? null) ? $body['attachments'] : []),
            'notes' => (string)($body['notes'] ?? ''),
            'activity_log' => json_encode(array_merge($activityLog, is_array($body['activityLog'] ?? null) ? $body['activityLog'] : [])),
            'created_by' => (string)($body['createdBy'] ?? ''),
        ]);
        json_response(['success' => true, 'id' => $id], 201);
    }

    if ($method === 'PUT' && preg_match('#^/director-tasks/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $stmt = $pdo->prepare(
            'UPDATE director_tasks SET title=:title, description=:description, assigned_to_user_ids=:assigned_to_user_ids,
             department=:department, priority=:priority, start_date=:start_date, due_date=:due_date, status=:status,
             progress=:progress, attachments=:attachments, notes=:notes, activity_log=:activity_log, updated_at=CURRENT_TIMESTAMP
             WHERE id=:id'
        );
        $stmt->execute([
            'title' => (string)($body['title'] ?? ''),
            'description' => (string)($body['description'] ?? ''),
            'assigned_to_user_ids' => json_encode(is_array($body['assignedToUserIds'] ?? null) ? $body['assignedToUserIds'] : []),
            'department' => (string)($body['department'] ?? ''),
            'priority' => in_array((string)($body['priority'] ?? ''), ['High','Medium','Low'], true) ? (string)($body['priority']) : 'Medium',
            'start_date' => (string)($body['startDate'] ?? ''),
            'due_date' => (string)($body['dueDate'] ?? ''),
            'status' => in_array((string)($body['status'] ?? ''), ['NotStarted','InProgress','Completed','Cancelled'], true) ? (string)($body['status']) : 'NotStarted',
            'progress' => max(0, min(100, (int)($body['progress'] ?? 0))),
            'attachments' => json_encode(is_array($body['attachments'] ?? null) ? $body['attachments'] : []),
            'notes' => (string)($body['notes'] ?? ''),
            'activity_log' => json_encode(is_array($body['activityLog'] ?? null) ? $body['activityLog'] : []),
            'id' => $id,
        ]);
        json_response(['success' => true]);
    }

    if ($method === 'PATCH' && preg_match('#^/director-tasks/([^/]+)/progress$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $progress = max(0, min(100, (int)($body['progress'] ?? 0)));
        $comment = (string)($body['comment'] ?? '');
        $status = (string)($body['status'] ?? '');
        $userName = (string)($body['userName'] ?? '');
        $userId = (string)($body['userId'] ?? '');

        $row = $pdo->prepare('SELECT activity_log, status FROM director_tasks WHERE id = :id');
        $row->execute(['id' => $id]);
        $existing = $row->fetch();
        if (!$existing) json_response(['message' => 'Олдсонгүй.'], 404);

        $log = json_field($existing['activity_log']);
        $logEntry = [
            'id' => bin2hex(random_bytes(5)),
            'type' => 'progress',
            'description' => "Явц {$progress}% болсон" . ($comment ? ": {$comment}" : ''),
            'userId' => $userId,
            'userName' => $userName,
            'timestamp' => gmdate('c'),
            'data' => ['progress' => $progress, 'comment' => $comment],
        ];
        $log[] = $logEntry;

        $newStatus = in_array($status, ['NotStarted','InProgress','Completed','Cancelled'], true) ? $status : $existing['status'];

        $stmt = $pdo->prepare('UPDATE director_tasks SET progress=:progress, status=:status, activity_log=:activity_log, updated_at=CURRENT_TIMESTAMP WHERE id=:id');
        $stmt->execute(['progress' => $progress, 'status' => $newStatus, 'activity_log' => json_encode($log), 'id' => $id]);
        json_response(['success' => true]);
    }

    if ($method === 'PATCH' && preg_match('#^/director-tasks/([^/]+)/comment$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $comment = trim((string)($body['comment'] ?? ''));
        $userName = (string)($body['userName'] ?? '');
        $userId = (string)($body['userId'] ?? '');

        if ($comment === '') json_response(['message' => 'Сэтгэгдэл хоосон байна.'], 400);

        $row = $pdo->prepare('SELECT activity_log FROM director_tasks WHERE id = :id');
        $row->execute(['id' => $id]);
        $existing = $row->fetch();
        if (!$existing) json_response(['message' => 'Олдсонгүй.'], 404);

        $log = json_field($existing['activity_log']);
        $log[] = [
            'id' => bin2hex(random_bytes(5)),
            'type' => 'comment',
            'description' => $comment,
            'userId' => $userId,
            'userName' => $userName,
            'timestamp' => gmdate('c'),
        ];

        $stmt = $pdo->prepare('UPDATE director_tasks SET activity_log=:activity_log, updated_at=CURRENT_TIMESTAMP WHERE id=:id');
        $stmt->execute(['activity_log' => json_encode($log), 'id' => $id]);
        json_response(['success' => true]);
    }

    if ($method === 'DELETE' && preg_match('#^/director-tasks/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $stmt = $pdo->prepare('DELETE FROM director_tasks WHERE id = :id');
        $stmt->execute(['id' => $id]);
        json_response(['success' => true]);
    }

    // ================= Хурлын тэмдэглэл =================
    $map_minutes = static function (array $row): array {
        return [
            'id' => $row['id'],
            'title' => $row['title'],
            'date' => to_local_date($row['date']),
            'time' => ($row['time'] ?? null) ?: null,
            'attendeeUserIds' => json_field($row['attendee_user_ids'] ?? null),
            'agenda' => $row['agenda'] ?? '',
            'decisions' => $row['decisions'] ?? '',
            'notes' => $row['notes'] ?? '',
            'attachments' => json_field($row['attachments'] ?? null),
            'visibleToUserIds' => json_field($row['visible_to_user_ids'] ?? null),
            'createdBy' => ($row['created_by'] ?? null) ?: null,
        ];
    };

    if ($method === 'GET' && $route === '/meeting-minutes') {
        $rows = $pdo->query('SELECT * FROM meeting_minutes ORDER BY date DESC, created_at DESC')->fetchAll();
        json_response(array_map($map_minutes, $rows ?: []));
    }

    if ($method === 'POST' && $route === '/meeting-minutes') {
        $id = (string)($body['id'] ?? '');
        $title = trim((string)($body['title'] ?? ''));
        $date = (string)($body['date'] ?? '');
        if ($id === '' || $title === '' || $date === '') {
            json_response(['message' => 'Хурлын нэр болон огноог оруулна уу.'], 400);
        }
        $stmt = $pdo->prepare(
            'INSERT INTO meeting_minutes (id, title, date, `time`, attendee_user_ids, agenda, decisions, notes, attachments, visible_to_user_ids, created_by)
             VALUES (:id, :title, :date, :time, :attendee_user_ids, :agenda, :decisions, :notes, :attachments, :visible_to_user_ids, :created_by)'
        );
        $stmt->execute([
            'id' => $id,
            'title' => $title,
            'date' => $date,
            'time' => ($body['time'] ?? null) ?: null,
            'attendee_user_ids' => json_encode(is_array($body['attendeeUserIds'] ?? null) ? $body['attendeeUserIds'] : []),
            'agenda' => (string)($body['agenda'] ?? ''),
            'decisions' => (string)($body['decisions'] ?? ''),
            'notes' => (string)($body['notes'] ?? ''),
            'attachments' => json_encode(is_array($body['attachments'] ?? null) ? $body['attachments'] : []),
            'visible_to_user_ids' => json_encode(is_array($body['visibleToUserIds'] ?? null) ? $body['visibleToUserIds'] : []),
            'created_by' => ($body['createdBy'] ?? null) ?: null,
        ]);
        json_response(['success' => true, 'id' => $id], 201);
    }

    if ($method === 'PUT' && preg_match('#^/meeting-minutes/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $title = trim((string)($body['title'] ?? ''));
        $date = (string)($body['date'] ?? '');
        if ($title === '' || $date === '') {
            json_response(['message' => 'Хурлын нэр болон огноог оруулна уу.'], 400);
        }
        $stmt = $pdo->prepare(
            'UPDATE meeting_minutes SET title = :title, date = :date, `time` = :time, attendee_user_ids = :attendee_user_ids, agenda = :agenda, decisions = :decisions, notes = :notes, attachments = :attachments, visible_to_user_ids = :visible_to_user_ids, updated_at = CURRENT_TIMESTAMP
             WHERE id = :id'
        );
        $stmt->execute([
            'title' => $title,
            'date' => $date,
            'time' => ($body['time'] ?? null) ?: null,
            'attendee_user_ids' => json_encode(is_array($body['attendeeUserIds'] ?? null) ? $body['attendeeUserIds'] : []),
            'agenda' => (string)($body['agenda'] ?? ''),
            'decisions' => (string)($body['decisions'] ?? ''),
            'notes' => (string)($body['notes'] ?? ''),
            'attachments' => json_encode(is_array($body['attachments'] ?? null) ? $body['attachments'] : []),
            'visible_to_user_ids' => json_encode(is_array($body['visibleToUserIds'] ?? null) ? $body['visibleToUserIds'] : []),
            'id' => $id,
        ]);
        json_response(['success' => true]);
    }

    if ($method === 'DELETE' && preg_match('#^/meeting-minutes/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $stmt = $pdo->prepare('DELETE FROM meeting_minutes WHERE id = :id');
        $stmt->execute(['id' => $id]);
        json_response(['success' => true]);
    }

    // ================= Ээлжийн амралт =================
    $map_leave = static function (array $row): array {
        return [
            'id' => $row['id'],
            'userId' => (string)$row['user_id'],
            'userName' => $row['user_name'],
            'startDate' => to_local_date($row['start_date']),
            'endDate' => to_local_date($row['end_date']),
            'days' => (int)$row['days'],
            'reason' => $row['reason'] ?? '',
            'status' => $row['status'],
            'year' => (int)$row['year'],
            'reviewedBy' => ($row['reviewed_by'] ?? null) ?: null,
            'reviewedByName' => ($row['reviewed_by_name'] ?? null) ?: null,
            'reviewedAt' => ($row['reviewed_at'] ?? null) ? to_iso($row['reviewed_at']) : null,
            'createdAt' => to_iso($row['created_at'] ?? ''),
        ];
    };

    if ($method === 'GET' && $route === '/leave-requests') {
        $rows = $pdo->query('SELECT * FROM leave_requests ORDER BY start_date DESC, created_at DESC')->fetchAll();
        json_response(array_map($map_leave, $rows ?: []));
    }

    if ($method === 'POST' && $route === '/leave-requests') {
        $id = (string)($body['id'] ?? '');
        $userId = (string)($body['userId'] ?? '');
        $startDate = (string)($body['startDate'] ?? '');
        $endDate = (string)($body['endDate'] ?? '');
        if ($id === '' || $userId === '' || $startDate === '' || $endDate === '') {
            json_response(['message' => 'Амралтын огноог бүрэн оруулна уу.'], 400);
        }
        $days = count_working_days($startDate, $endDate);
        if ($days <= 0) {
            json_response(['message' => 'Сонгосон хугацаанд ажлын өдөр байхгүй байна. Огноогоо шалгана уу.'], 400);
        }
        $year = (int)substr($startDate, 0, 4);
        $entitlement = leave_entitlement($pdo, $year, $userId);
        $st = $pdo->prepare("SELECT days FROM leave_requests WHERE user_id = :u AND `year` = :y AND status <> 'Rejected'");
        $st->execute(['u' => $userId, 'y' => $year]);
        $existing = $st->fetchAll();
        $usedDays = 0;
        foreach ($existing as $r) {
            $usedDays += (int)$r['days'];
        }
        if (count($existing) >= MAX_LEAVE_SPLITS) {
            json_response(['message' => 'Амралтаа хамгийн ихдээ ' . MAX_LEAVE_SPLITS . ' хэсэг болгон хуваах боломжтой. Та аль хэдийн ' . count($existing) . ' удаа авсан байна.'], 400);
        }
        if ($usedDays + $days > $entitlement) {
            json_response(['message' => 'Үлдсэн амралт ' . max(0, $entitlement - $usedDays) . ' ажлын өдөр байна. ' . $days . ' өдөр авах боломжгүй.'], 400);
        }
        $stmt = $pdo->prepare(
            "INSERT INTO leave_requests (id, user_id, user_name, start_date, end_date, days, reason, status, `year`)
             VALUES (:id, :user_id, :user_name, :start_date, :end_date, :days, :reason, 'Pending', :year)"
        );
        $stmt->execute([
            'id' => $id,
            'user_id' => $userId,
            'user_name' => (string)($body['userName'] ?? ''),
            'start_date' => $startDate,
            'end_date' => $endDate,
            'days' => $days,
            'reason' => (string)($body['reason'] ?? ''),
            'year' => $year,
        ]);
        $rowStmt = $pdo->prepare('SELECT * FROM leave_requests WHERE id = :id LIMIT 1');
        $rowStmt->execute(['id' => $id]);
        json_response($map_leave($rowStmt->fetch()), 201);
    }

    if ($method === 'PATCH' && preg_match('#^/leave-requests/([^/]+)/status$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $status = (string)($body['status'] ?? '');
        if (!in_array($status, ['Pending', 'Approved', 'Rejected'], true)) {
            json_response(['message' => 'Төлөв буруу байна.'], 400);
        }
        $cur = $pdo->prepare('SELECT * FROM leave_requests WHERE id = :id LIMIT 1');
        $cur->execute(['id' => $id]);
        $current = $cur->fetch();
        if (!$current) {
            json_response(['message' => 'Амралтын хүсэлт олдсонгүй.'], 404);
        }
        if ($status === 'Approved') {
            $entitlement = leave_entitlement($pdo, (int)$current['year'], (string)$current['user_id']);
            $ost = $pdo->prepare("SELECT days FROM leave_requests WHERE user_id = :u AND `year` = :y AND status = 'Approved' AND id <> :id");
            $ost->execute(['u' => $current['user_id'], 'y' => (int)$current['year'], 'id' => $id]);
            $approvedDays = 0;
            foreach ($ost->fetchAll() as $r) {
                $approvedDays += (int)$r['days'];
            }
            if ($approvedDays + (int)$current['days'] > $entitlement) {
                json_response(['message' => 'Батлах боломжгүй: жилийн эрх ' . $entitlement . ' өдөр, батлагдсан ' . $approvedDays . ' өдөр байна.'], 400);
            }
        }
        $stmt = $pdo->prepare('UPDATE leave_requests SET status = :status, reviewed_by = :reviewed_by, reviewed_by_name = :reviewed_by_name, reviewed_at = NOW() WHERE id = :id');
        $stmt->execute([
            'status' => $status,
            'reviewed_by' => ($body['reviewedBy'] ?? null) ?: null,
            'reviewed_by_name' => ($body['reviewedByName'] ?? null) ?: null,
            'id' => $id,
        ]);
        $rowStmt = $pdo->prepare('SELECT * FROM leave_requests WHERE id = :id LIMIT 1');
        $rowStmt->execute(['id' => $id]);
        json_response($map_leave($rowStmt->fetch()));
    }

    if ($method === 'DELETE' && preg_match('#^/leave-requests/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $stmt = $pdo->prepare('DELETE FROM leave_requests WHERE id = :id');
        $stmt->execute(['id' => $id]);
        json_response(['success' => true]);
    }

    if ($method === 'GET' && $route === '/leave-settings') {
        $year = (int)($_GET['year'] ?? date('Y'));
        json_response(['year' => $year, 'days' => leave_entitlement($pdo, $year)]);
    }

    if ($method === 'PUT' && preg_match('#^/leave-settings/(\d+)$#', $route, $matches)) {
        $year = (int)$matches[1];
        $days = isset($body['days']) ? (int)$body['days'] : -1;
        if ($year <= 0 || $days < 0 || $days > 365) {
            json_response(['message' => 'Амралтын хоног буруу байна.'], 400);
        }
        $stmt = $pdo->prepare('INSERT INTO leave_settings (`year`, days) VALUES (:y, :d) ON DUPLICATE KEY UPDATE days = VALUES(days)');
        $stmt->execute(['y' => $year, 'd' => $days]);
        json_response(['year' => $year, 'days' => $days]);
    }

    if ($method === 'GET' && $route === '/leave-entitlements') {
        $year = (int)($_GET['year'] ?? date('Y'));
        $st = $pdo->prepare('SELECT user_id, days FROM leave_entitlements WHERE `year` = :y');
        $st->execute(['y' => $year]);
        $out = [];
        foreach ($st->fetchAll() as $r) {
            $out[] = ['userId' => (string)$r['user_id'], 'days' => (int)$r['days']];
        }
        json_response($out);
    }

    if ($method === 'PUT' && preg_match('#^/leave-entitlements/([^/]+)/(\d+)$#', $route, $matches)) {
        $userId = urldecode((string)$matches[1]);
        $year = (int)$matches[2];
        $raw = $body['days'] ?? null;
        if ($userId === '' || $year <= 0) {
            json_response(['message' => 'Ажилтан эсвэл он буруу байна.'], 400);
        }
        if ($raw === null || $raw === '') {
            $del = $pdo->prepare('DELETE FROM leave_entitlements WHERE user_id = :u AND `year` = :y');
            $del->execute(['u' => $userId, 'y' => $year]);
            json_response(['userId' => $userId, 'year' => $year, 'days' => leave_entitlement($pdo, $year), 'isOverride' => false]);
        }
        $days = (int)$raw;
        if ($days < 0 || $days > 365) {
            json_response(['message' => 'Амралтын хоног буруу байна.'], 400);
        }
        $st = $pdo->prepare('INSERT INTO leave_entitlements (user_id, `year`, days) VALUES (:u, :y, :d) ON DUPLICATE KEY UPDATE days = VALUES(days)');
        $st->execute(['u' => $userId, 'y' => $year, 'd' => $days]);
        json_response(['userId' => $userId, 'year' => $year, 'days' => $days, 'isOverride' => true]);
    }

    // ================= Хурлын дохио (live) =================
    $map_signal = static function (array $row): array {
        return [
            'id' => (int)$row['id'],
            'meetingId' => ($row['meeting_id'] ?? null) ?: null,
            'title' => $row['title'],
            'time' => ($row['meeting_time'] ?? null) ?: null,
            'startedBy' => ($row['started_by'] ?? null) ?: null,
            'startedByName' => ($row['started_by_name'] ?? null) ?: null,
            'startedAt' => to_iso($row['started_at'] ?? ''),
        ];
    };

    if ($method === 'GET' && $route === '/meeting-signal') {
        $rows = $pdo->query('SELECT * FROM meeting_signals WHERE ended_at IS NULL AND started_at >= (NOW() - INTERVAL 3 HOUR) ORDER BY started_at DESC LIMIT 1')->fetchAll();
        if (!$rows) {
            json_response(['active' => false, 'signal' => null]);
        }
        json_response(['active' => true, 'signal' => $map_signal($rows[0])]);
    }

    if ($method === 'GET' && $route === '/meeting-signal/history') {
        $rows = $pdo->query('SELECT meeting_id, title, started_at, ended_at FROM meeting_signals WHERE ended_at IS NOT NULL ORDER BY started_at DESC LIMIT 300')->fetchAll();
        $out = [];
        foreach ($rows ?: [] as $r) {
            $mins = max(0, (int)round((strtotime((string)$r['ended_at']) - strtotime((string)$r['started_at'])) / 60));
            $out[] = [
                'meetingId' => ($r['meeting_id'] ?? null) ?: null,
                'title' => $r['title'],
                'startedAt' => to_iso($r['started_at']),
                'endedAt' => to_iso($r['ended_at']),
                'durationMinutes' => $mins,
            ];
        }
        json_response($out);
    }

    if ($method === 'POST' && $route === '/meeting-signal') {
        $title = trim((string)($body['title'] ?? ''));
        if ($title === '') {
            json_response(['message' => 'Хурлын нэрийг оруулна уу.'], 400);
        }
        $pdo->exec('UPDATE meeting_signals SET ended_at = NOW() WHERE ended_at IS NULL');
        $stmt = $pdo->prepare('INSERT INTO meeting_signals (meeting_id, title, meeting_time, started_by, started_by_name) VALUES (:meeting_id, :title, :meeting_time, :started_by, :started_by_name)');
        $stmt->execute([
            'meeting_id' => ($body['meetingId'] ?? null) ?: null,
            'title' => $title,
            'meeting_time' => ($body['time'] ?? null) ?: null,
            'started_by' => ($body['startedBy'] ?? null) ?: null,
            'started_by_name' => ($body['startedByName'] ?? null) ?: null,
        ]);
        $rows = $pdo->query('SELECT * FROM meeting_signals WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1')->fetchAll();
        json_response(['active' => true, 'signal' => $map_signal($rows[0])], 201);
    }

    if ($method === 'POST' && $route === '/meeting-signal/end') {
        $pdo->exec('UPDATE meeting_signals SET ended_at = NOW() WHERE ended_at IS NULL');
        json_response(['success' => true]);
    }

    // ================= Ажилчид хоорондын зурвас =================
    $map_message = static function (array $row): array {
        return [
            'id' => $row['id'],
            'senderId' => (string)$row['sender_id'],
            'recipientId' => (string)$row['recipient_id'],
            'content' => $row['content'] ?? '',
            'attachments' => json_field($row['attachments'] ?? null),
            'readAt' => ($row['read_at'] ?? null) ? to_iso($row['read_at']) : null,
            'createdAt' => to_iso(substr((string)($row['created_at'] ?? ''), 0, 19)),
        ];
    };

    if ($method === 'GET' && $route === '/messages/threads') {
        $userId = trim((string)($_GET['userId'] ?? ''));
        if ($userId === '') {
            json_response(['message' => 'Хэрэглэгч тодорхойгүй байна.'], 400);
        }
        $st = $pdo->prepare(
            "SELECT id, sender_id, recipient_id, LEFT(content, 140) AS preview,
                    (attachments IS NOT NULL AND attachments <> '[]' AND attachments <> '') AS has_attach,
                    read_at, created_at
             FROM messages WHERE sender_id = :u OR recipient_id = :u ORDER BY created_at DESC"
        );
        $st->execute(['u' => $userId]);
        $threads = [];
        foreach ($st->fetchAll() as $row) {
            $otherId = ((string)$row['sender_id'] === $userId) ? (string)$row['recipient_id'] : (string)$row['sender_id'];
            if (!isset($threads[$otherId])) {
                $threads[$otherId] = [
                    'otherUserId' => $otherId,
                    'lastMessage' => $row['preview'] ?? '',
                    'lastAt' => to_iso(substr((string)$row['created_at'], 0, 19)),
                    'lastSenderId' => (string)$row['sender_id'],
                    'unreadCount' => 0,
                    'hasAttachment' => (bool)((int)$row['has_attach']),
                ];
            }
            if ((string)$row['recipient_id'] === $userId && empty($row['read_at'])) {
                $threads[$otherId]['unreadCount']++;
            }
        }
        json_response(array_values($threads));
    }

    if ($method === 'GET' && $route === '/messages/thread') {
        $userId = trim((string)($_GET['userId'] ?? ''));
        $otherId = trim((string)($_GET['otherId'] ?? ''));
        if ($userId === '' || $otherId === '') {
            json_response(['message' => 'Хэрэглэгч тодорхойгүй байна.'], 400);
        }
        $st = $pdo->prepare(
            'SELECT * FROM messages
             WHERE (sender_id = :u AND recipient_id = :o) OR (sender_id = :o AND recipient_id = :u)
             ORDER BY created_at ASC'
        );
        $st->execute(['u' => $userId, 'o' => $otherId]);
        json_response(array_map($map_message, $st->fetchAll() ?: []));
    }

    if ($method === 'POST' && $route === '/messages') {
        $id = (string)($body['id'] ?? '');
        $senderId = (string)($body['senderId'] ?? '');
        $recipientId = (string)($body['recipientId'] ?? '');
        if ($id === '' || $senderId === '' || $recipientId === '') {
            json_response(['message' => 'Илгээгч, хүлээн авагчийг заана уу.'], 400);
        }
        if ($senderId === $recipientId) {
            json_response(['message' => 'Өөр рүүгээ зурвас илгээх боломжгүй.'], 400);
        }
        $content = (string)($body['content'] ?? '');
        $attachments = is_array($body['attachments'] ?? null) ? $body['attachments'] : [];
        if (trim($content) === '' && count($attachments) === 0) {
            json_response(['message' => 'Хоосон зурвас илгээх боломжгүй.'], 400);
        }
        $stmt = $pdo->prepare('INSERT INTO messages (id, sender_id, recipient_id, content, attachments) VALUES (:id, :sender_id, :recipient_id, :content, :attachments)');
        $stmt->execute([
            'id' => $id,
            'sender_id' => $senderId,
            'recipient_id' => $recipientId,
            'content' => $content,
            'attachments' => json_encode($attachments),
        ]);
        $rowStmt = $pdo->prepare('SELECT * FROM messages WHERE id = :id LIMIT 1');
        $rowStmt->execute(['id' => $id]);
        json_response($map_message($rowStmt->fetch()), 201);
    }

    if ($method === 'POST' && $route === '/messages/read') {
        $userId = (string)($body['userId'] ?? '');
        $otherId = (string)($body['otherId'] ?? '');
        if ($userId === '' || $otherId === '') {
            json_response(['message' => 'Хэрэглэгч тодорхойгүй байна.'], 400);
        }
        $stmt = $pdo->prepare('UPDATE messages SET read_at = NOW() WHERE recipient_id = :u AND sender_id = :o AND read_at IS NULL');
        $stmt->execute(['u' => $userId, 'o' => $otherId]);
        json_response(['success' => true]);
    }

    // ================= Ажилтны хувийн тэмдэглэл =================
    $map_note = static function (array $row): array {
        return [
            'id' => $row['id'],
            'userId' => (string)$row['user_id'],
            'meetingId' => ($row['meeting_id'] ?? null) ?: null,
            'meetingTitle' => $row['meeting_title'],
            'meetingDate' => ($row['meeting_date'] ?? null) ? to_local_date($row['meeting_date']) : null,
            'notes' => $row['notes'] ?? '',
            'directorTasks' => $row['director_tasks'] ?? '',
            'createdAt' => to_iso($row['created_at'] ?? ''),
            'updatedAt' => ($row['updated_at'] ?? null) ? to_iso($row['updated_at']) : null,
        ];
    };

    if ($method === 'GET' && $route === '/personal-notes') {
        $userId = trim((string)($_GET['userId'] ?? ''));
        if ($userId === '') {
            json_response(['message' => 'Хэрэглэгч тодорхойгүй байна.'], 400);
        }
        $st = $pdo->prepare('SELECT * FROM personal_meeting_notes WHERE user_id = :u ORDER BY meeting_date DESC, created_at DESC');
        $st->execute(['u' => $userId]);
        json_response(array_map($map_note, $st->fetchAll() ?: []));
    }

    if ($method === 'POST' && $route === '/personal-notes') {
        $id = (string)($body['id'] ?? '');
        $userId = (string)($body['userId'] ?? '');
        $meetingTitle = trim((string)($body['meetingTitle'] ?? ''));
        if ($id === '' || $userId === '' || $meetingTitle === '') {
            json_response(['message' => 'Хурлын нэрийг оруулна уу.'], 400);
        }
        $stmt = $pdo->prepare('INSERT INTO personal_meeting_notes (id, user_id, meeting_id, meeting_title, meeting_date, notes, director_tasks) VALUES (:id, :user_id, :meeting_id, :meeting_title, :meeting_date, :notes, :director_tasks)');
        $stmt->execute([
            'id' => $id,
            'user_id' => $userId,
            'meeting_id' => ($body['meetingId'] ?? null) ?: null,
            'meeting_title' => $meetingTitle,
            'meeting_date' => ($body['meetingDate'] ?? null) ?: null,
            'notes' => (string)($body['notes'] ?? ''),
            'director_tasks' => (string)($body['directorTasks'] ?? ''),
        ]);
        $rowStmt = $pdo->prepare('SELECT * FROM personal_meeting_notes WHERE id = :id LIMIT 1');
        $rowStmt->execute(['id' => $id]);
        json_response($map_note($rowStmt->fetch()), 201);
    }

    if ($method === 'PUT' && preg_match('#^/personal-notes/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $userId = (string)($body['userId'] ?? '');
        if ($userId === '') {
            json_response(['message' => 'Хэрэглэгч тодорхойгүй байна.'], 400);
        }
        $own = $pdo->prepare('SELECT id FROM personal_meeting_notes WHERE id = :id AND user_id = :u LIMIT 1');
        $own->execute(['id' => $id, 'u' => $userId]);
        if (!$own->fetch()) {
            json_response(['message' => 'Энэ тэмдэглэлийг засах эрхгүй байна.'], 403);
        }
        $stmt = $pdo->prepare('UPDATE personal_meeting_notes SET meeting_id = :meeting_id, meeting_title = :meeting_title, meeting_date = :meeting_date, notes = :notes, director_tasks = :director_tasks WHERE id = :id AND user_id = :u');
        $stmt->execute([
            'meeting_id' => ($body['meetingId'] ?? null) ?: null,
            'meeting_title' => trim((string)($body['meetingTitle'] ?? '')),
            'meeting_date' => ($body['meetingDate'] ?? null) ?: null,
            'notes' => (string)($body['notes'] ?? ''),
            'director_tasks' => (string)($body['directorTasks'] ?? ''),
            'id' => $id,
            'u' => $userId,
        ]);
        $rowStmt = $pdo->prepare('SELECT * FROM personal_meeting_notes WHERE id = :id LIMIT 1');
        $rowStmt->execute(['id' => $id]);
        json_response($map_note($rowStmt->fetch()));
    }

    if ($method === 'DELETE' && preg_match('#^/personal-notes/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $userId = trim((string)($_GET['userId'] ?? ($body['userId'] ?? '')));
        if ($userId === '') {
            json_response(['message' => 'Хэрэглэгч тодорхойгүй байна.'], 400);
        }
        $stmt = $pdo->prepare('DELETE FROM personal_meeting_notes WHERE id = :id AND user_id = :u');
        $stmt->execute(['id' => $id, 'u' => $userId]);
        if ($stmt->rowCount() === 0) {
            json_response(['message' => 'Энэ тэмдэглэлийг устгах эрхгүй байна.'], 403);
        }
        json_response(['success' => true]);
    }

    // ================= Санал асуулга =================
    // Дуусах хугацаа нь өнгөрсөн нээлттэй асуулгуудыг автоматаар хаана
    $auto_close_polls = static function (PDO $pdo): void {
        $pdo->exec("UPDATE polls SET status = 'closed', closed_at = NOW() WHERE status = 'open' AND closes_at IS NOT NULL AND closes_at < CURDATE()");
    };

    // Асуулга + саналуудыг нэгтгэж клиентэд өгөх хэлбэрт хөрвүүлнэ.
    // Нууц асуулгад санал өгсөн хүмүүсийн нэрийг задлахгүй (зөвхөн тоо).
    $map_poll = static function (array $row, array $votes, string $viewerId): array {
        $options = json_decode((string)($row['options'] ?? '[]'), true);
        $options = is_array($options) ? array_values(array_filter($options, static fn ($o) => is_array($o) && !empty($o['id']))) : [];
        $anonymous = (bool)(int)($row['anonymous'] ?? 0);

        $results = [];
        foreach ($options as $o) {
            $results[(string)$o['id']] = ['count' => 0, 'voters' => []];
        }

        $myOptionIds = [];
        foreach ($votes as $vote) {
            $ids = json_decode((string)($vote['option_ids'] ?? '[]'), true);
            $ids = is_array($ids) ? array_map('strval', $ids) : [];
            if ($viewerId !== '' && (string)$vote['user_id'] === $viewerId) {
                $myOptionIds = $ids;
            }
            foreach ($ids as $optionId) {
                if (!isset($results[$optionId])) {
                    continue;
                }
                $results[$optionId]['count'] += 1;
                if (!$anonymous) {
                    $results[$optionId]['voters'][] = (string)($vote['user_name'] ?? '');
                }
            }
        }

        $resultList = [];
        foreach ($options as $o) {
            $oid = (string)$o['id'];
            $resultList[] = ['optionId' => $oid, 'count' => $results[$oid]['count'], 'voters' => $results[$oid]['voters']];
        }

        return [
            'id' => $row['id'],
            'question' => $row['question'],
            'description' => $row['description'] ?? '',
            'options' => $options,
            'allowMultiple' => (bool)(int)($row['allow_multiple'] ?? 0),
            'minChoices' => ($row['min_choices'] ?? null) !== null ? (int)$row['min_choices'] : null,
            'maxChoices' => ($row['max_choices'] ?? null) !== null ? (int)$row['max_choices'] : null,
            'anonymous' => $anonymous,
            'visibleToUserIds' => array_map('strval', json_field($row['visible_to_user_ids'] ?? null)),
            'status' => $row['status'],
            'closesAt' => ($row['closes_at'] ?? null) ? to_local_date($row['closes_at']) : null,
            'createdBy' => (string)$row['created_by'],
            'createdByName' => $row['created_by_name'] ?? '',
            'createdAt' => to_iso($row['created_at'] ?? ''),
            'totalVotes' => count($votes),
            'results' => $resultList,
            'myOptionIds' => $myOptionIds,
        ];
    };

    if ($method === 'GET' && $route === '/polls') {
        $auto_close_polls($pdo);
        $viewerId = trim((string)($_GET['userId'] ?? ''));
        $pollRows = $pdo->query("SELECT * FROM polls ORDER BY status = 'open' DESC, created_at DESC")->fetchAll();
        $voteRows = $pdo->query('SELECT * FROM poll_votes')->fetchAll();
        $votesByPoll = [];
        foreach ($voteRows ?: [] as $vote) {
            $votesByPoll[(string)$vote['poll_id']][] = $vote;
        }
        $out = [];
        foreach ($pollRows ?: [] as $row) {
            $out[] = $map_poll($row, $votesByPoll[(string)$row['id']] ?? [], $viewerId);
        }
        json_response($out);
    }

    if ($method === 'POST' && $route === '/polls') {
        $id = (string)($body['id'] ?? '');
        $question = trim((string)($body['question'] ?? ''));
        $createdBy = (string)($body['createdBy'] ?? '');
        $rawOptions = is_array($body['options'] ?? null) ? $body['options'] : [];
        $cleanOptions = [];
        foreach ($rawOptions as $o) {
            $oid = (string)($o['id'] ?? '');
            $text = trim((string)($o['text'] ?? ''));
            if ($oid !== '' && $text !== '') {
                $cleanOptions[] = ['id' => $oid, 'text' => $text];
            }
        }
        if ($id === '' || $question === '' || $createdBy === '') {
            json_response(['message' => 'Асуултаа оруулна уу.'], 400);
        }
        if (count($cleanOptions) < 2) {
            json_response(['message' => 'Дор хаяж 2 сонголт оруулна уу.'], 400);
        }

        // Сонголтын хязгаар — зөвхөн олон сонголттой үед хүчинтэй
        $allowMultiple = !empty($body['allowMultiple']);
        $min = null;
        $max = null;
        if ($allowMultiple) {
            $optionCount = count($cleanOptions);
            $rawMin = $body['minChoices'] ?? null;
            $rawMax = $body['maxChoices'] ?? null;
            $min = ($rawMin === null || $rawMin === '') ? null : (int)$rawMin;
            $max = ($rawMax === null || $rawMax === '') ? null : (int)$rawMax;
            if ($min !== null && ($min < 1 || $min > $optionCount)) {
                json_response(['message' => 'Доод хязгаар 1-ээс сонголтын тооны хооронд байх ёстой.'], 400);
            }
            if ($max !== null && ($max < 1 || $max > $optionCount)) {
                json_response(['message' => 'Дээд хязгаар 1-ээс сонголтын тооны хооронд байх ёстой.'], 400);
            }
            if ($min !== null && $max !== null && $min > $max) {
                json_response(['message' => 'Доод хязгаар дээд хязгаараас их байж болохгүй.'], 400);
            }
        }

        $visibleTo = is_array($body['visibleToUserIds'] ?? null) ? array_values(array_map('strval', $body['visibleToUserIds'])) : [];
        $stmt = $pdo->prepare(
            "INSERT INTO polls (id, question, description, options, allow_multiple, min_choices, max_choices, anonymous, visible_to_user_ids, status, closes_at, created_by, created_by_name)
             VALUES (:id, :question, :description, :options, :allow_multiple, :min_choices, :max_choices, :anonymous, :visible_to_user_ids, 'open', :closes_at, :created_by, :created_by_name)"
        );
        $stmt->execute([
            'id' => $id,
            'question' => $question,
            'description' => (string)($body['description'] ?? ''),
            'options' => json_encode($cleanOptions, JSON_UNESCAPED_UNICODE),
            'allow_multiple' => $allowMultiple ? 1 : 0,
            'min_choices' => $min,
            'max_choices' => $max,
            'anonymous' => !empty($body['anonymous']) ? 1 : 0,
            'visible_to_user_ids' => json_encode($visibleTo, JSON_UNESCAPED_UNICODE),
            'closes_at' => ($body['closesAt'] ?? null) ?: null,
            'created_by' => $createdBy,
            'created_by_name' => (string)($body['createdByName'] ?? ''),
        ]);
        $rowStmt = $pdo->prepare('SELECT * FROM polls WHERE id = :id LIMIT 1');
        $rowStmt->execute(['id' => $id]);
        json_response($map_poll($rowStmt->fetch(), [], $createdBy), 201);
    }

    if ($method === 'POST' && preg_match('#^/polls/([^/]+)/vote$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $userId = (string)($body['userId'] ?? '');
        $ids = is_array($body['optionIds'] ?? null) ? array_values(array_filter(array_map('strval', $body['optionIds']))) : [];
        if ($userId === '' || count($ids) === 0) {
            json_response(['message' => 'Сонголтоо хийнэ үү.'], 400);
        }
        $auto_close_polls($pdo);
        $cur = $pdo->prepare('SELECT * FROM polls WHERE id = :id LIMIT 1');
        $cur->execute(['id' => $id]);
        $poll = $cur->fetch();
        if (!$poll) {
            json_response(['message' => 'Санал асуулга олдсонгүй.'], 404);
        }
        if ($poll['status'] !== 'open') {
            json_response(['message' => 'Санал асуулга хаагдсан байна.'], 400);
        }
        $options = json_decode((string)$poll['options'], true) ?: [];
        $validIds = [];
        foreach ($options as $o) {
            $validIds[(string)($o['id'] ?? '')] = true;
        }
        foreach ($ids as $optionId) {
            if (!isset($validIds[$optionId])) {
                json_response(['message' => 'Сонголт буруу байна.'], 400);
            }
        }
        if (!(int)$poll['allow_multiple'] && count($ids) > 1) {
            json_response(['message' => 'Энэ асуулгад зөвхөн нэг сонголт хийх боломжтой.'], 400);
        }
        // Олон сонголттой үед доод/дээд хязгаарыг шалгана
        if ((int)$poll['allow_multiple']) {
            $min = ($poll['min_choices'] ?? null) !== null ? (int)$poll['min_choices'] : null;
            $max = ($poll['max_choices'] ?? null) !== null ? (int)$poll['max_choices'] : null;
            if ($min !== null && count($ids) < $min) {
                json_response(['message' => 'Дор хаяж ' . $min . ' сонголт хийнэ үү.'], 400);
            }
            if ($max !== null && count($ids) > $max) {
                json_response(['message' => 'Хамгийн ихдээ ' . $max . ' сонголт хийх боломжтой.'], 400);
            }
        }
        // Өмнө нь санал өгсөн бол шинэчилнэ (саналаа өөрчлөх боломж)
        $stmt = $pdo->prepare(
            'INSERT INTO poll_votes (poll_id, user_id, user_name, option_ids)
             VALUES (:poll_id, :user_id, :user_name, :option_ids)
             ON DUPLICATE KEY UPDATE user_name = VALUES(user_name), option_ids = VALUES(option_ids)'
        );
        $stmt->execute([
            'poll_id' => $id,
            'user_id' => $userId,
            'user_name' => (string)($body['userName'] ?? ''),
            'option_ids' => json_encode($ids, JSON_UNESCAPED_UNICODE),
        ]);
        $vt = $pdo->prepare('SELECT * FROM poll_votes WHERE poll_id = :id');
        $vt->execute(['id' => $id]);
        json_response($map_poll($poll, $vt->fetchAll() ?: [], $userId));
    }

    if ($method === 'PATCH' && preg_match('#^/polls/([^/]+)/close$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $viewerId = (string)($body['userId'] ?? '');
        $stmt = $pdo->prepare("UPDATE polls SET status = 'closed', closed_at = NOW() WHERE id = :id");
        $stmt->execute(['id' => $id]);
        $cur = $pdo->prepare('SELECT * FROM polls WHERE id = :id LIMIT 1');
        $cur->execute(['id' => $id]);
        $poll = $cur->fetch();
        if (!$poll) {
            json_response(['message' => 'Санал асуулга олдсонгүй.'], 404);
        }
        $vt = $pdo->prepare('SELECT * FROM poll_votes WHERE poll_id = :id');
        $vt->execute(['id' => $id]);
        json_response($map_poll($poll, $vt->fetchAll() ?: [], $viewerId));
    }

    if ($method === 'DELETE' && preg_match('#^/polls/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $pdo->prepare('DELETE FROM poll_votes WHERE poll_id = :id')->execute(['id' => $id]);
        $pdo->prepare('DELETE FROM polls WHERE id = :id')->execute(['id' => $id]);
        json_response(['success' => true]);
    }

    // ================= Ажлын төлөвлөгөө =================
    $map_work_plan = static function (array $row): array {
        // Багана нь заавал id + нэртэй, мөрийн нүд нь баганын id-гаар түлхүүрлэгдэнэ
        $columns = json_decode((string)($row['columns_json'] ?? '[]'), true);
        $columns = is_array($columns) ? $columns : [];
        $cleanColumns = [];
        foreach ($columns as $c) {
            if (!is_array($c) || ($c['id'] ?? '') === '') {
                continue;
            }
            $col = ['id' => (string)$c['id'], 'label' => (string)($c['label'] ?? '')];
            if (($c['width'] ?? null) !== null) {
                $col['width'] = (int)$c['width'];
            }
            $cleanColumns[] = $col;
        }

        $rows = json_decode((string)($row['rows_json'] ?? '[]'), true);
        $rows = is_array($rows) ? $rows : [];
        $cleanRows = [];
        foreach ($rows as $r) {
            if (!is_array($r) || ($r['id'] ?? '') === '') {
                continue;
            }
            $cells = [];
            if (isset($r['cells']) && is_array($r['cells'])) {
                foreach ($r['cells'] as $key => $value) {
                    $cells[(string)$key] = (string)($value ?? '');
                }
            }
            $cleanRows[] = ['id' => (string)$r['id'], 'cells' => (object)$cells];
        }

        return [
            'id' => $row['id'],
            'title' => $row['title'],
            'periodType' => $row['period_type'],
            'year' => (int)$row['plan_year'],
            'periodNo' => ($row['period_no'] ?? null) !== null ? (int)$row['period_no'] : null,
            'startDate' => ($row['start_date'] ?? null) ? to_local_date($row['start_date']) : null,
            'endDate' => ($row['end_date'] ?? null) ? to_local_date($row['end_date']) : null,
            'department' => $row['department'],
            'columns' => $cleanColumns,
            'rows' => $cleanRows,
            'approvedByTitle' => $row['approved_by_title'] ?? '',
            'approvedByUserId' => (string)($row['approved_by_user_id'] ?? ''),
            'approvedByName' => $row['approved_by_name'] ?? '',
            'approvedAt' => ($row['approved_at'] ?? null) ? to_iso($row['approved_at']) : null,
            'reviewedByTitle' => $row['reviewed_by_title'] ?? '',
            'reviewedByUserId' => (string)($row['reviewed_by_user_id'] ?? ''),
            'reviewedByName' => $row['reviewed_by_name'] ?? '',
            'reviewedAt' => ($row['reviewed_at'] ?? null) ? to_iso($row['reviewed_at']) : null,
            'compiledByUserId' => (string)($row['compiled_by_user_id'] ?? ''),
            'compiledByName' => $row['compiled_by_name'] ?? '',
            'compiledAt' => ($row['compiled_at'] ?? null) ? to_iso($row['compiled_at']) : null,
            'visibleToUserIds' => array_map('strval', json_field($row['visible_to_user_ids'] ?? null)),
            'editableByUserIds' => array_map('strval', json_field($row['editable_by_user_ids'] ?? null)),
            'visibleToDepartments' => array_map('strval', json_field($row['visible_to_departments'] ?? null)),
            'editableByDepartments' => array_map('strval', json_field($row['editable_by_departments'] ?? null)),
            'createdBy' => (string)$row['created_by'],
            'createdByName' => $row['created_by_name'] ?? '',
            'createdAt' => to_iso($row['created_at'] ?? ''),
            'updatedAt' => to_iso($row['updated_at'] ?? ($row['created_at'] ?? '')),
        ];
    };

    // Хүсэлтийн биеийг DB баганад тохируулж, багана/мөрийг цэвэрлэнэ
    $work_plan_payload = static function (array $body): array {
        $rawColumns = is_array($body['columns'] ?? null) ? $body['columns'] : [];
        $columns = [];
        $columnIds = [];
        foreach ($rawColumns as $c) {
            $cid = (string)($c['id'] ?? '');
            if ($cid === '') {
                continue;
            }
            $col = ['id' => $cid, 'label' => trim((string)($c['label'] ?? ''))];
            if (($c['width'] ?? null) !== null) {
                $col['width'] = (int)$c['width'];
            }
            $columns[] = $col;
            $columnIds[$cid] = true;
        }

        $rawRows = is_array($body['rows'] ?? null) ? $body['rows'] : [];
        $rows = [];
        foreach ($rawRows as $r) {
            $rid = (string)($r['id'] ?? '');
            if ($rid === '') {
                continue;
            }
            $cells = [];
            if (isset($r['cells']) && is_array($r['cells'])) {
                // Устгагдсан баганын үлдэгдэл утгыг хадгалахгүй
                foreach ($r['cells'] as $key => $value) {
                    if (isset($columnIds[(string)$key])) {
                        $cells[(string)$key] = (string)($value ?? '');
                    }
                }
            }
            $rows[] = ['id' => $rid, 'cells' => (object)$cells];
        }

        $periodType = (string)($body['periodType'] ?? 'month');
        if (!in_array($periodType, ['year', 'halfyear', 'month', 'week'], true)) {
            $periodType = 'month';
        }
        $periodNo = $body['periodNo'] ?? null;

        return [
            'title' => trim((string)($body['title'] ?? '')),
            'period_type' => $periodType,
            'plan_year' => (int)($body['year'] ?? date('Y')),
            'period_no' => ($periodNo === null || $periodNo === '') ? null : (int)$periodNo,
            'start_date' => ($body['startDate'] ?? null) ?: null,
            'end_date' => ($body['endDate'] ?? null) ?: null,
            'department' => (string)($body['department'] ?? ''),
            'columns_json' => json_encode($columns, JSON_UNESCAPED_UNICODE),
            'rows_json' => json_encode($rows, JSON_UNESCAPED_UNICODE),
            'approved_by_title' => (string)($body['approvedByTitle'] ?? ''),
            'approved_by_user_id' => ((string)($body['approvedByUserId'] ?? '')) ?: null,
            'approved_by_name' => (string)($body['approvedByName'] ?? ''),
            'reviewed_by_title' => (string)($body['reviewedByTitle'] ?? ''),
            'reviewed_by_user_id' => ((string)($body['reviewedByUserId'] ?? '')) ?: null,
            'reviewed_by_name' => (string)($body['reviewedByName'] ?? ''),
            'compiled_by_user_id' => ((string)($body['compiledByUserId'] ?? '')) ?: null,
            'compiled_by_name' => (string)($body['compiledByName'] ?? ''),
            'visible_to_user_ids' => json_encode(is_array($body['visibleToUserIds'] ?? null) ? array_values(array_map('strval', $body['visibleToUserIds'])) : [], JSON_UNESCAPED_UNICODE),
            'editable_by_user_ids' => json_encode(is_array($body['editableByUserIds'] ?? null) ? array_values(array_map('strval', $body['editableByUserIds'])) : [], JSON_UNESCAPED_UNICODE),
            'visible_to_departments' => json_encode(is_array($body['visibleToDepartments'] ?? null) ? array_values(array_map('strval', $body['visibleToDepartments'])) : [], JSON_UNESCAPED_UNICODE),
            'editable_by_departments' => json_encode(is_array($body['editableByDepartments'] ?? null) ? array_values(array_map('strval', $body['editableByDepartments'])) : [], JSON_UNESCAPED_UNICODE),
        ];
    };

    if ($method === 'GET' && $route === '/work-plans') {
        $rows = $pdo->query('SELECT * FROM work_plans ORDER BY plan_year DESC, period_no DESC, created_at DESC')->fetchAll();
        $out = [];
        foreach ($rows ?: [] as $row) {
            $out[] = $map_work_plan($row);
        }
        json_response($out);
    }

    if ($method === 'POST' && $route === '/work-plans') {
        $id = (string)($body['id'] ?? '');
        $createdBy = (string)($body['createdBy'] ?? '');
        $payload = $work_plan_payload($body);
        if ($id === '' || $payload['title'] === '' || $payload['department'] === '' || $createdBy === '') {
            json_response(['message' => 'Гарчиг болон хэлтсээ сонгоно уу.'], 400);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO work_plans
                (id, title, period_type, plan_year, period_no, start_date, end_date, department, columns_json, rows_json,
                 approved_by_title, approved_by_user_id, approved_by_name, reviewed_by_title, reviewed_by_user_id,
                 reviewed_by_name, compiled_by_user_id, compiled_by_name,
                 visible_to_user_ids, editable_by_user_ids, visible_to_departments, editable_by_departments,
                 created_by, created_by_name)
             VALUES (:id, :title, :period_type, :plan_year, :period_no, :start_date, :end_date, :department, :columns_json, :rows_json,
                 :approved_by_title, :approved_by_user_id, :approved_by_name, :reviewed_by_title, :reviewed_by_user_id,
                 :reviewed_by_name, :compiled_by_user_id, :compiled_by_name,
                 :visible_to_user_ids, :editable_by_user_ids, :visible_to_departments, :editable_by_departments,
                 :created_by, :created_by_name)'
        );
        $stmt->execute($payload + [
            'id' => $id,
            'created_by' => $createdBy,
            'created_by_name' => (string)($body['createdByName'] ?? ''),
        ]);

        $rowStmt = $pdo->prepare('SELECT * FROM work_plans WHERE id = :id LIMIT 1');
        $rowStmt->execute(['id' => $id]);
        json_response($map_work_plan($rowStmt->fetch()), 201);
    }

    if ($method === 'PUT' && preg_match('#^/work-plans/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $payload = $work_plan_payload($body);
        if ($payload['title'] === '' || $payload['department'] === '') {
            json_response(['message' => 'Гарчиг болон хэлтсээ сонгоно уу.'], 400);
        }

        // Гарын үсэг зурах хүн солигдвол тухайн баталгаажуулалт хүчингүй болно.
        // (*_at нь *_by_user_id-аас ӨМНӨ олгогдож байгаа тул хуучин утгатай харьцуулагдана)
        $stmt = $pdo->prepare(
            'UPDATE work_plans SET
                title = :title, period_type = :period_type, plan_year = :plan_year, period_no = :period_no,
                start_date = :start_date, end_date = :end_date, department = :department,
                columns_json = :columns_json, rows_json = :rows_json,
                approved_by_title = :approved_by_title,
                approved_at = IF(approved_by_user_id <=> :approved_cmp, approved_at, NULL),
                approved_by_user_id = :approved_by_user_id, approved_by_name = :approved_by_name,
                reviewed_by_title = :reviewed_by_title,
                reviewed_at = IF(reviewed_by_user_id <=> :reviewed_cmp, reviewed_at, NULL),
                reviewed_by_user_id = :reviewed_by_user_id, reviewed_by_name = :reviewed_by_name,
                compiled_at = IF(compiled_by_user_id <=> :compiled_cmp, compiled_at, NULL),
                compiled_by_user_id = :compiled_by_user_id, compiled_by_name = :compiled_by_name,
                visible_to_user_ids = :visible_to_user_ids,
                editable_by_user_ids = :editable_by_user_ids, visible_to_departments = :visible_to_departments,
                editable_by_departments = :editable_by_departments
             WHERE id = :id'
        );
        $stmt->execute($payload + [
            'id' => $id,
            'approved_cmp' => $payload['approved_by_user_id'],
            'reviewed_cmp' => $payload['reviewed_by_user_id'],
            'compiled_cmp' => $payload['compiled_by_user_id'],
        ]);

        $rowStmt = $pdo->prepare('SELECT * FROM work_plans WHERE id = :id LIMIT 1');
        $rowStmt->execute(['id' => $id]);
        $updated = $rowStmt->fetch();
        if (!$updated) {
            json_response(['message' => 'Ажлын төлөвлөгөө олдсонгүй.'], 404);
        }
        json_response($map_work_plan($updated));
    }

    // Гарын үсэг зурах: зөвхөн тухайн үүрэгт нэрлэгдсэн ажилтан өөрөө баталгаажуулна
    if ($method === 'PATCH' && preg_match('#^/work-plans/([^/]+)/sign$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $userId = (string)($body['userId'] ?? '');
        $role = (string)($body['role'] ?? '');
        $roleColumns = [
            'approve' => ['user' => 'approved_by_user_id', 'at' => 'approved_at'],
            'review' => ['user' => 'reviewed_by_user_id', 'at' => 'reviewed_at'],
            'compile' => ['user' => 'compiled_by_user_id', 'at' => 'compiled_at'],
        ];
        if (!isset($roleColumns[$role]) || $userId === '') {
            json_response(['message' => 'Гарын үсгийн үүрэг тодорхойгүй байна.'], 400);
        }

        $cur = $pdo->prepare('SELECT * FROM work_plans WHERE id = :id LIMIT 1');
        $cur->execute(['id' => $id]);
        $plan = $cur->fetch();
        if (!$plan) {
            json_response(['message' => 'Ажлын төлөвлөгөө олдсонгүй.'], 404);
        }
        if ((string)($plan[$roleColumns[$role]['user']] ?? '') !== $userId) {
            json_response(['message' => 'Танд энэ хэсэгт гарын үсэг зурах эрхгүй байна.'], 403);
        }

        $value = !empty($body['revoke']) ? 'NULL' : 'NOW()';
        $pdo->prepare("UPDATE work_plans SET {$roleColumns[$role]['at']} = {$value} WHERE id = :id")->execute(['id' => $id]);
        $cur->execute(['id' => $id]);
        json_response($map_work_plan($cur->fetch()));
    }

    if ($method === 'DELETE' && preg_match('#^/work-plans/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);
        $pdo->prepare('DELETE FROM work_plans WHERE id = :id')->execute(['id' => $id]);
        json_response(['success' => true]);
    }

    // ================= Онлайн төлөв (presence) =================
    if (($method === 'POST') && ($route === '/presence/ping' || $route === '/presence/heartbeat')) {
        $userId = trim((string)($body['userId'] ?? ''));
        if ($userId === '') {
            json_response(['message' => 'Хэрэглэгч тодорхойгүй байна.'], 400);
        }
        $stmt = $pdo->prepare('INSERT INTO user_presence (user_id, last_seen) VALUES (:u, NOW()) ON DUPLICATE KEY UPDATE last_seen = NOW()');
        $stmt->execute(['u' => $userId]);
        json_response(['success' => true]);
    }

    if ($method === 'GET' && $route === '/presence') {
        $rows = $pdo->query('SELECT user_id, last_seen, TIMESTAMPDIFF(SECOND, last_seen, NOW()) AS age FROM user_presence')->fetchAll();
        $out = [];
        foreach ($rows ?: [] as $r) {
            $out[] = [
                'userId' => (string)$r['user_id'],
                'online' => ((int)$r['age']) < 45,
                'lastSeen' => to_iso($r['last_seen']),
            ];
        }
        json_response($out);
    }

    json_response(['message' => 'Not Found'], 404);
} catch (Throwable $e) {
    json_response([
        'message' => 'Server error',
        'error' => mb_substr($e->getMessage(), 0, 180),
    ], 500);
}
