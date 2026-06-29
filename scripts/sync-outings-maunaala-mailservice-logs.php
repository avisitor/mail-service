#!/usr/bin/env php
<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    echo "This script must be run from the command line.\n";
    exit(1);
}

/**
 * Sync maillog and smslog from nightly outings/maunaala DB dumps
 * into the local mailservice Maillog and Smslog tables.
 *
 * Usage:
 *   php sync-outings-maunaala-mailservice-logs.php
 *
 * Expects gzipped SQL dumps at:
 *   /tmp/outingsdump.sql.gz
 *   /tmp/maunaaladump.sql.gz
 *
 * Requires mail-service/.env with DATABASE_URL pointing to the local mailservice DB.
 */

// ── config ────────────────────────────────────────────────────────────

$IDP_ROOT = dirname(__DIR__);
$PROJECT_ROOT = dirname($IDP_ROOT);

$DUMP_DIR = '/tmp';
$SOURCES = [
    'outings' => [
        'file' => $DUMP_DIR . '/outingsdump.sql.gz',
        'app_id' => 'outings-app-id',
    ],
    'maunaala' => [
        'file' => $DUMP_DIR . '/maunaaladump.sql.gz',
        'app_id' => 'outings-app-id', // same appId for both tenants
    ],
];

// Temp database name prefix (each source gets its own).
const TEMP_DB_PREFIX = '_mailservice_sync_';

// ── helpers ───────────────────────────────────────────────────────────

function loadEnvFile(string $path): array
{
    if (!file_exists($path)) {
        throw new RuntimeException("Missing env file: {$path}");
    }
    $env = [];
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        if (strpos($line, '=') === false) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if ((substr($value, 0, 1) === '"' && substr($value, -1) === '"') ||
            (substr($value, 0, 1) === "'" && substr($value, -1) === "'")) {
            $value = substr($value, 1, -1);
        }
        $env[$key] = $value;
    }
    return $env;
}

function parseDatabaseUrl(string $url): array
{
    $parsed = parse_url($url);
    if (!$parsed || ($parsed['scheme'] ?? '') !== 'mysql') {
        throw new RuntimeException("Invalid DATABASE_URL: {$url}");
    }
    return [
        'host' => $parsed['host'] ?? 'localhost',
        'dbname' => ltrim($parsed['path'] ?? '', '/'),
        'username' => urldecode($parsed['user'] ?? ''),
        'password' => urldecode($parsed['pass'] ?? ''),
        'port' => (string)($parsed['port'] ?? '3306'),
    ];
}

function connectPdo(string $dsn, string $user, string $pass): PDO
{
    return new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

function mysqlDsn(string $host, string $port, string $dbname): string
{
    return "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";
}

function mysqlDsnNoDb(string $host, string $port): string
{
    return "mysql:host={$host};port={$port};charset=utf8mb4";
}

function generateUUID(): string
{
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

// ── main ──────────────────────────────────────────────────────────────

try {
    // 1. Load mailservice DB config
    $mailServiceEnv = loadEnvFile($PROJECT_ROOT . '/mail-service/.env');
    $databaseUrl = $mailServiceEnv['DATABASE_URL'] ?? '';
    if ($databaseUrl === '') {
        throw new RuntimeException('DATABASE_URL not found in mail-service/.env');
    }
    $msConfig = parseDatabaseUrl($databaseUrl);
    $msPdo = connectPdo(
        mysqlDsn($msConfig['host'], $msConfig['port'], $msConfig['dbname']),
        $msConfig['username'],
        $msConfig['password']
    );

    $totalStats = [
        'maillog_inserted' => 0,
        'maillog_skipped' => 0,
        'smslog_inserted' => 0,
        'smslog_skipped' => 0,
    ];

    // 2. Process each source dump
    foreach ($SOURCES as $sourceLabel => $source) {
        $dumpFile = $source['file'];
        $appId = $source['app_id'];

        echo "\n── {$sourceLabel} ──\n";

        if (!file_exists($dumpFile)) {
            echo "Dump not found: {$dumpFile}, skipping.\n";
            continue;
        }

        $tempDb = TEMP_DB_PREFIX . $sourceLabel . '_' . bin2hex(random_bytes(4));

        // Connect without a default database to create the temp DB.
        $adminPdo = connectPdo(
            mysqlDsnNoDb($msConfig['host'], $msConfig['port']),
            $msConfig['username'],
            $msConfig['password']
        );

        try {
            // 2a. Create temp database
            $adminPdo->exec("CREATE DATABASE `{$tempDb}`");
            echo "Created temp database: {$tempDb}\n";

            // 2b. Import the gzipped dump into the temp database
            $cmd = sprintf(
                'gunzip -c %s | mysql -h %s -P %s -u %s -p%s %s 2>&1',
                escapeshellarg($dumpFile),
                escapeshellarg($msConfig['host']),
                escapeshellarg($msConfig['port']),
                escapeshellarg($msConfig['username']),
                escapeshellarg($msConfig['password']),
                escapeshellarg($tempDb)
            );
            $output = shell_exec($cmd);
            if ($output !== null && trim($output) !== '') {
                echo "mysql import output: {$output}\n";
            }
            echo "Imported dump into temp database\n";

            // Connect to the temp database for reading
            $tempPdo = connectPdo(
                mysqlDsn($msConfig['host'], $msConfig['port'], $tempDb),
                $msConfig['username'],
                $msConfig['password']
            );

            // 2c. Sync maillog
            $hasMaillog = $tempPdo->query("SHOW TABLES LIKE 'maillog'")->rowCount() > 0;
            if ($hasMaillog) {
                $existingCheck = $msPdo->prepare("SELECT COUNT(*) FROM Maillog WHERE messageId = ?");
                $insertStmt = $msPdo->prepare("
                    INSERT INTO Maillog (id, messageId, groupId, appId, sent, subject,
                                         senderName, senderEmail, host, username,
                                         recipients, message, opened, createdAt)
                    VALUES (:id, :messageId, :groupId, :appId, :sent, :subject,
                            :senderName, :senderEmail, :host, :username,
                            :recipients, :message, :opened, :createdAt)
                ");

                $rows = $tempPdo->query("
                    SELECT sent, subject, sendername, senderemail, host, username,
                           recipients, message, id, groupid, opened
                    FROM maillog ORDER BY sent ASC
                ");

                $inserted = 0;
                $skipped = 0;
                foreach ($rows as $row) {
                    $existingCheck->execute([$row['id']]);
                    if ($existingCheck->fetchColumn() > 0) {
                        $skipped++;
                        continue;
                    }
                    $insertStmt->execute([
                        ':id' => generateUUID(),
                        ':messageId' => $row['id'],
                        ':groupId' => $row['groupid'],
                        ':appId' => $appId,
                        ':sent' => $row['sent'],
                        ':subject' => $row['subject'],
                        ':senderName' => $row['sendername'],
                        ':senderEmail' => $row['senderemail'],
                        ':host' => $row['host'],
                        ':username' => $row['username'],
                        ':recipients' => $row['recipients'],
                        ':message' => $row['message'],
                        ':opened' => $row['opened'],
                        ':createdAt' => date('Y-m-d H:i:s'),
                    ]);
                    $inserted++;
                }
                $totalStats['maillog_inserted'] += $inserted;
                $totalStats['maillog_skipped'] += $skipped;
                echo "maillog: {$inserted} inserted, {$skipped} skipped\n";
            } else {
                echo "maillog table not found in dump, skipping\n";
            }

            // 2d. Sync smslog
            $hasSmslog = $tempPdo->query("SHOW TABLES LIKE 'smslog'")->rowCount() > 0;
            if ($hasSmslog) {
                $existingCheck = $msPdo->prepare("SELECT COUNT(*) FROM Smslog WHERE messageId = ?");
                $insertStmt = $msPdo->prepare("
                    INSERT INTO Smslog (id, messageId, appId, sent,
                                        senderName, senderPhone, recipients,
                                        message, createdAt)
                    VALUES (:id, :messageId, :appId, :sent,
                            :senderName, :senderPhone, :recipients,
                            :message, :createdAt)
                ");

                $rows = $tempPdo->query("
                    SELECT sid, sendername, senderemail, senderphone, recipient, created
                    FROM smslog ORDER BY created ASC
                ");

                $inserted = 0;
                $skipped = 0;
                foreach ($rows as $row) {
                    $existingCheck->execute([$row['sid']]);
                    if ($existingCheck->fetchColumn() > 0) {
                        $skipped++;
                        continue;
                    }
                    $insertStmt->execute([
                        ':id' => generateUUID(),
                        ':messageId' => $row['sid'],
                        ':appId' => $appId,
                        ':sent' => $row['created'],
                        ':senderName' => $row['sendername'],
                        ':senderPhone' => $row['senderphone'],
                        ':recipients' => $row['recipient'],
                        ':message' => null,
                        ':createdAt' => date('Y-m-d H:i:s'),
                    ]);
                    $inserted++;
                }
                $totalStats['smslog_inserted'] += $inserted;
                $totalStats['smslog_skipped'] += $skipped;
                echo "smslog: {$inserted} inserted, {$skipped} skipped\n";
            } else {
                echo "smslog table not found in dump, skipping\n";
            }

        } finally {
            // 2e. Drop temp database
            $adminPdo->exec("DROP DATABASE IF EXISTS `{$tempDb}`");
            echo "Dropped temp database: {$tempDb}\n";
        }
    }

    // 3. Summary
    echo "\n=== Summary ===\n";
    echo "Maillog: inserted={$totalStats['maillog_inserted']}, skipped={$totalStats['maillog_skipped']}\n";
    echo "Smslog: inserted={$totalStats['smslog_inserted']}, skipped={$totalStats['smslog_skipped']}\n";

} catch (Throwable $e) {
    fwrite(STDERR, 'Error: ' . $e->getMessage() . "\n");

    // Clean up temp database on error if we can
    if (isset($adminPdo) && isset($tempDb)) {
        try {
            $adminPdo->exec("DROP DATABASE IF EXISTS `{$tempDb}`");
        } catch (Throwable $cleanupErr) {
            fwrite(STDERR, "Cleanup warning: {$cleanupErr->getMessage()}\n");
        }
    }
    exit(1);
}
