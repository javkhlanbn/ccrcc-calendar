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

    if ($method === 'PATCH' && preg_match('#^/users/(\d+)$#', $route, $matches)) {
        $uid = (int)$matches[1];
        $firstName = trim((string)($body['firstName'] ?? ''));
        $lastName = trim((string)($body['lastName'] ?? ''));
        $department = trim((string)($body['department'] ?? ''));
        $password = trim((string)($body['password'] ?? ''));

        if ($firstName === '' || $lastName === '' || $department === '') {
            json_response(['message' => 'Нэр болон хэлтсийн мэдээллийг бүрэн оруулна уу.'], 400);
        }

        if ($password !== '' && strlen($password) < 6) {
            json_response(['message' => 'Нууц үг хамгийн багадаа 6 тэмдэгт байна.'], 400);
        }

        if ($password !== '') {
            $stmt = $pdo->prepare(
                'UPDATE users SET first_name = :first_name, last_name = :last_name, department = :department, password_hash = :password_hash, updated_at = CURRENT_TIMESTAMP WHERE id = :id'
            );
            $stmt->execute([
                'first_name' => $firstName,
                'last_name' => $lastName,
                'department' => $department,
                'password_hash' => password_hash($password, PASSWORD_BCRYPT),
                'id' => $uid,
            ]);
        } else {
            $stmt = $pdo->prepare(
                'UPDATE users SET first_name = :first_name, last_name = :last_name, department = :department, updated_at = CURRENT_TIMESTAMP WHERE id = :id'
            );
            $stmt->execute([
                'first_name' => $firstName,
                'last_name' => $lastName,
                'department' => $department,
                'id' => $uid,
            ]);
        }

        $rowStmt = $pdo->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
        $rowStmt->execute(['id' => $uid]);
        $row = $rowStmt->fetch();

        if (!$row) {
            json_response(['message' => 'Хэрэглэгч олдсонгүй.'], 404);
        }

        json_response(['success' => true, 'profile' => to_profile($row)]);
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
                'category' => $row['category'],
                'priority' => $row['priority'],
                'birthdayUserId' => $row['birthday_user_id'] !== null ? (string)$row['birthday_user_id'] : null,
                'projectId' => $row['project_id'],
                'tags' => json_field($row['tags'] ?? null),
                'attachments' => json_field($row['attachments'] ?? null),
                'visibleToUserIds' => json_field($row['visible_to_user_ids'] ?? null),
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
            'INSERT INTO events (id, title, description, date, category, priority, birthday_user_id, project_id, tags, attachments, visible_to_user_ids)
             VALUES (:id, :title, :description, :date, :category, :priority, :birthday_user_id, :project_id, :tags, :attachments, :visible_to_user_ids)'
        );
        $stmt->execute([
            'id' => $id,
            'title' => $title,
            'description' => (string)($body['description'] ?? ''),
            'date' => $date,
            'category' => $category,
            'priority' => $priority,
            'birthday_user_id' => ($birthdayUserId === null || $birthdayUserId === '') ? null : (int)$birthdayUserId,
            'project_id' => ($body['projectId'] ?? null) ?: null,
            'tags' => json_encode(is_array($body['tags'] ?? null) ? $body['tags'] : []),
            'attachments' => json_encode(is_array($body['attachments'] ?? null) ? $body['attachments'] : []),
            'visible_to_user_ids' => json_encode(is_array($body['visibleToUserIds'] ?? null) ? $body['visibleToUserIds'] : []),
        ]);

        json_response(['success' => true, 'id' => $id], 201);
    }

    if ($method === 'PUT' && preg_match('#^/events/([^/]+)$#', $route, $matches)) {
        $id = urldecode((string)$matches[1]);

        $stmt = $pdo->prepare(
            'UPDATE events SET title = :title, description = :description, date = :date, category = :category, priority = :priority, birthday_user_id = :birthday_user_id, project_id = :project_id, tags = :tags, attachments = :attachments, visible_to_user_ids = :visible_to_user_ids, updated_at = CURRENT_TIMESTAMP
             WHERE id = :id'
        );
        $stmt->execute([
            'title' => (string)($body['title'] ?? ''),
            'description' => (string)($body['description'] ?? ''),
            'date' => (string)($body['date'] ?? ''),
            'category' => (string)($body['category'] ?? 'Project'),
            'priority' => (string)($body['priority'] ?? 'Low'),
            'birthday_user_id' => (($body['birthdayUserId'] ?? null) === null || ($body['birthdayUserId'] ?? '') === '') ? null : (int)$body['birthdayUserId'],
            'project_id' => ($body['projectId'] ?? null) ?: null,
            'tags' => json_encode(is_array($body['tags'] ?? null) ? $body['tags'] : []),
            'attachments' => json_encode(is_array($body['attachments'] ?? null) ? $body['attachments'] : []),
            'visible_to_user_ids' => json_encode(is_array($body['visibleToUserIds'] ?? null) ? $body['visibleToUserIds'] : []),
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
                'projectId' => $row['project_id'],
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

        if ($id === '' || $projectId === '' || $title === '' || $dueDate === '') {
            json_response(['message' => 'Үндсэн талбарыг бөглөнө үү.'], 400);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO tasks (id, project_id, title, description, assigned_to_user_ids, due_date, status, attachments)
             VALUES (:id, :project_id, :title, :description, :assigned_to_user_ids, :due_date, :status, :attachments)'
        );
        $stmt->execute([
            'id' => $id,
            'project_id' => $projectId,
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
                 contract_signed, contract_value, payment1, payment2, payment3, variance, extra_notes, visible_to_user_ids)
             VALUES (:id, :idx, :code, :name, :type, :budget_cost, :year_financing, :tender_method, :tender_month, :sustainable, :notes,
                 :project_name, :implement_period, :committee_formed, :advertised, :tender_opened, :committee_met, :notice_sent,
                 :contract_signed, :contract_value, :payment1, :payment2, :payment3, :variance, :extra_notes, :visible_to_user_ids)'
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
                updated_at = CURRENT_TIMESTAMP
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

    json_response(['message' => 'Not Found'], 404);
} catch (Throwable $e) {
    json_response([
        'message' => 'Server error',
        'error' => mb_substr($e->getMessage(), 0, 180),
    ], 500);
}
