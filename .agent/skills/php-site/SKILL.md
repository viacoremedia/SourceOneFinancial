---
name: PHP Site Patterns
description: Custom PHP site development — MVC structure, PDO database access, form handling, session management, and security patterns
---

# PHP Site Skill

Patterns for building custom PHP applications without a framework. Useful for
smaller client sites that need server-side logic beyond WordPress.

## Project Structure

```
project-root/
├── public/              ← Web root (DocumentRoot points here)
│   ├── index.php        ← Entry point / front controller
│   ├── .htaccess        ← URL rewriting rules
│   └── assets/          ← CSS, JS, images (publicly accessible)
├── app/
│   ├── controllers/     ← Request handlers
│   ├── models/          ← Data access classes
│   ├── views/           ← Template files (.php)
│   └── helpers/         ← Utility functions
├── config/
│   ├── database.php     ← DB connection config
│   └── app.php          ← App-wide settings
├── storage/
│   ├── logs/            ← Error logs
│   └── cache/           ← File-based cache
└── vendor/              ← Composer dependencies
```

## Front Controller

```php
<?php
// public/index.php
require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config/app.php';

// Simple routing
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

match (true) {
    $uri === '/' => (new HomeController)->index(),
    $uri === '/contact' && $method === 'GET' => (new ContactController)->form(),
    $uri === '/contact' && $method === 'POST' => (new ContactController)->submit(),
    preg_match('#^/projects/(\d+)$#', $uri, $m) => (new ProjectController)->show($m[1]),
    default => http_response_code(404) && require __DIR__ . '/../app/views/404.php',
};
```

## Database Access (PDO)

### Connection
```php
<?php
// config/database.php
$dsn = "mysql:host={$_ENV['DB_HOST']};dbname={$_ENV['DB_NAME']};charset=utf8mb4";
$pdo = new PDO($dsn, $_ENV['DB_USER'], $_ENV['DB_PASS'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
]);
```

### Queries — ALWAYS use prepared statements
```php
// CORRECT — parameterized query
$stmt = $pdo->prepare('SELECT * FROM projects WHERE id = :id');
$stmt->execute(['id' => $projectId]);
$project = $stmt->fetch();

// CORRECT — insert with prepared statement
$stmt = $pdo->prepare('INSERT INTO contacts (name, email, message) VALUES (:name, :email, :message)');
$stmt->execute([
    'name' => $sanitizedName,
    'email' => $sanitizedEmail,
    'message' => $sanitizedMessage,
]);

// NEVER DO THIS — SQL injection vulnerability
$pdo->query("SELECT * FROM projects WHERE id = $projectId"); // ❌
```

## Form Handling

### The Pattern
```php
<?php
// app/controllers/ContactController.php
class ContactController {
    public function form() {
        $token = bin2hex(random_bytes(32));
        $_SESSION['csrf_token'] = $token;
        require __DIR__ . '/../views/contact-form.php';
    }

    public function submit() {
        // 1. Verify CSRF token
        if (!hash_equals($_SESSION['csrf_token'] ?? '', $_POST['csrf_token'] ?? '')) {
            http_response_code(403);
            die('Invalid form submission');
        }

        // 2. Validate
        $errors = [];
        $name = trim($_POST['name'] ?? '');
        $email = filter_var($_POST['email'] ?? '', FILTER_VALIDATE_EMAIL);

        if (empty($name)) $errors[] = 'Name is required';
        if (!$email) $errors[] = 'Valid email is required';

        if ($errors) {
            // Re-render form with errors
            require __DIR__ . '/../views/contact-form.php';
            return;
        }

        // 3. Sanitize
        $name = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');

        // 4. Process (save to DB, send email, etc.)
        // ...

        // 5. Redirect (PRG pattern)
        header('Location: /contact?success=1');
        exit;
    }
}
```

### View Template
```php
<!-- app/views/contact-form.php -->
<form method="POST" action="/contact">
    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($token) ?>">

    <label for="name">Name</label>
    <input type="text" id="name" name="name"
           value="<?= htmlspecialchars($name ?? '') ?>" required>

    <label for="email">Email</label>
    <input type="email" id="email" name="email"
           value="<?= htmlspecialchars($email ?? '') ?>" required>

    <button type="submit">Send</button>
</form>
```

## Security Checklist

1. **SQL Injection**: Use PDO prepared statements for ALL queries
2. **XSS**: Escape all output with `htmlspecialchars($var, ENT_QUOTES, 'UTF-8')`
3. **CSRF**: Token on every state-changing form
4. **File Uploads**: Validate MIME type, file size, and extension. Store outside web root.
5. **Session Fixation**: Call `session_regenerate_id(true)` after login
6. **Password Hashing**: `password_hash()` and `password_verify()` — NEVER MD5/SHA1
7. **Error Reporting**: `display_errors = Off` in production, log to file instead
8. **Headers**: Set `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy`

## Session Management

```php
// Start session securely
ini_set('session.cookie_httponly', 1);
ini_set('session.cookie_secure', 1); // HTTPS only
ini_set('session.use_strict_mode', 1);
session_start();

// After login
session_regenerate_id(true);
$_SESSION['user_id'] = $user['id'];
$_SESSION['role'] = $user['role'];
```
