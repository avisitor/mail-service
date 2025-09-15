<?php
// JWKS endpoint for mail-service
$keyDir = __DIR__ . '/keys';
$jwksFile = $keyDir . '/jwks.json';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

if (file_exists($jwksFile)) {
    readfile($jwksFile);
} else {
    http_response_code(404);
    echo json_encode(['error' => 'JWKS not found']);
}
?>