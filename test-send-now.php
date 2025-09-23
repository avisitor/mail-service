<?php
/**
 * Test script for sending emails via the /send-now API endpoint
 * This demonstrates how to use the MailServiceClient PHP class
 */

//require_once __DIR__ . '/vendor/autoload.php'; // If using Composer

class MailServiceClient {
    private $baseUrl;
    private $clientId;
    private $clientSecret;
    private $token;
    private $tokenExpiry;

    public function __construct($baseUrl, $clientId, $clientSecret) {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->clientId = $clientId;
        $this->clientSecret = $clientSecret;
        $this->token = null;
        $this->tokenExpiry = null;
    }

    public function getToken() {
        // Check if current token is still valid
        if ($this->token && $this->tokenExpiry && time() < $this->tokenExpiry) {
            return $this->token;
        }

        // Request new token
        $data = [
            'appId' => $this->clientId,
            'clientSecret' => $this->clientSecret,
            'type' => 'application'
        ];

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $this->baseUrl . '/api/token',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($data),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json'
            ],
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => true
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        
        if (curl_error($ch)) {
            throw new Exception('cURL error: ' . curl_error($ch));
        }
        curl_close($ch);

        if ($httpCode !== 200) {
            throw new Exception("Authentication failed: HTTP $httpCode - $response");
        }

        $responseData = json_decode($response, true);
        if (!$responseData) {
            throw new Exception('Invalid JSON response from token endpoint');
        }

        $this->token = $responseData['token'];
        // Set expiry with 1-minute buffer
        $this->tokenExpiry = time() + ($responseData['expiresIn'] - 60);
        
        echo "✅ Token obtained successfully (expires in " . $responseData['expiresIn'] . " seconds)\n";
        return $this->token;
    }

    public function sendEmail($emailData) {
        $token = $this->getToken();
        
        return $this->makeApiRequest('/send-now', $emailData, $token);
    }

    private function makeApiRequest($endpoint, $data, $token, $retry = true) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $this->baseUrl . $endpoint,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($data),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
                'Authorization: Bearer ' . $token
            ],
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => true
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        
        if (curl_error($ch)) {
            curl_close($ch);
            throw new Exception('cURL error: ' . curl_error($ch));
        }
        curl_close($ch);

        // Handle token expiration
        if ($httpCode === 401 && $retry) {
            // Token expired, retry once with fresh token
            $this->token = null;
            $newToken = $this->getToken();
            return $this->makeApiRequest($endpoint, $data, $newToken, false);
        }

        return [
            'statusCode' => $httpCode,
            'body' => $response,
            'data' => json_decode($response, true)
        ];
    }
}

// Configuration - Update these values
$config = [
    'mailServiceUrl' => 'http://localhost:3100',
    'appId' => 'cmfka688r0001b77ofpgm57ix',
    'clientSecret' => 'bXwMxsX40R47QaZLA0oK3t1yDH+Y/cS/+X0Bu55jjN8=', // Replace with your actual client secret
];

// Initialize the mail client
$mailClient = new MailServiceClient(
    $config['mailServiceUrl'],
    $config['appId'],
    $config['clientSecret']
);

echo "🚀 Testing Mail Service /send-now endpoint\n";
echo "📧 Sending test email...\n\n";

try {
    // Test 1: Send email using direct content
    echo "Test 1: Sending email with direct content\n";
    echo "----------------------------------------\n";
    
    $response1 = $mailClient->sendEmail([
        'appId' => $config['appId'],
        'subject' => 'Test Email from PHP - Direct Content',
        'html' => '<h1>Hello ${name}!</h1><p>This is a test email sent from PHP using direct content.</p><p>Your role: ${role}</p>',
        'text' => 'Hello {{name}}! This is a test email sent from PHP using direct content. Your role: {{role}}',
        'recipients' => [
            [
                'email' => 'robw@worldspot.com',
                'name' => 'Rob Weltman',
                'context' => [
                    'name' => 'Rob',
                    'role' => 'Developer'
                ]
            ],
            [
                'email' => 'rob.weltman@gmail.com', 
                'name' => 'Rob Weltman',
                'context' => [
                    'name' => 'Rob',
                    'role' => 'Designer'
                ]
            ]
        ]
    ]);

    if ($response1['statusCode'] === 200) {
        echo "✅ Email sent successfully!\n";
        echo "📊 Response: " . json_encode($response1['data'], JSON_PRETTY_PRINT) . "\n\n";
    } else {
        echo "❌ Failed to send email: " . $response1['statusCode'] . "\n";
        echo "📝 Error: " . $response1['body'] . "\n\n";
    }

    // Test 2: Send email using template ID (if you have templates)
    echo "Test 2: Sending email with template ID\n";
    echo "---------------------------------------\n";
    
    $response2 = $mailClient->sendEmail([
        'appId' => $config['appId'],
        'templateId' => 'cmft7bjew00fs5etindh3ekys', // Replace with actual template ID
        'recipients' => [
            [
                'email' => 'robw@worldspot.com',
                'name' => 'Rob Weltman',
                'context' => [
                    'userName' => 'Rob',
                    'companyName' => 'Acme Corp',
                    'welcomeMessage' => 'Welcome to our service!'
                ]
            ]
        ]
    ]);

    if ($response2['statusCode'] === 200) {
        echo "✅ Template email sent successfully!\n";
        echo "📊 Response: " . json_encode($response2['data'], JSON_PRETTY_PRINT) . "\n\n";
    } else {
        echo "❌ Failed to send template email: " . $response2['statusCode'] . "\n";
        echo "📝 Error: " . $response2['body'] . "\n";
        echo "ℹ️  Note: This might fail if the template doesn't exist\n\n";
    }

    // Test 3: Send scheduled email
    echo "Test 3: Sending scheduled email\n";
    echo "--------------------------------\n";
    
    $scheduleTime = date('c', strtotime('+5 minutes')); // Schedule for 5 minutes from now
    
    $response3 = $mailClient->sendEmail([
        'appId' => $config['appId'],
        'subject' => 'Scheduled Test Email from PHP',
        'html' => '<h1>Scheduled Email</h1><p>This email was scheduled to be sent at {{scheduleTime}}.</p>',
        'scheduleAt' => $scheduleTime,
        'recipients' => [
            [
                'email' => 'robw@worldspot.com',
                'name' => 'Scheduled Recipient',
                'context' => [
                    'scheduleTime' => $scheduleTime
                ]
            ]
        ]
    ]);

    if ($response3['statusCode'] === 200) {
        echo "✅ Scheduled email created successfully!\n";
        echo "⏰ Scheduled for: $scheduleTime\n";
        echo "📊 Response: " . json_encode($response3['data'], JSON_PRETTY_PRINT) . "\n\n";
    } else {
        echo "❌ Failed to schedule email: " . $response3['statusCode'] . "\n";
        echo "📝 Error: " . $response3['body'] . "\n\n";
    }

} catch (Exception $e) {
    echo "💥 Error: " . $e->getMessage() . "\n";
    echo "🔧 Make sure:\n";
    echo "   - Mail service is running on " . $config['mailServiceUrl'] . "\n";
    echo "   - App ID '" . $config['appId'] . "' exists in the database\n";
    echo "   - Client secret is correct\n";
    echo "   - SMTP is configured (or SMTP_DRY_RUN=true for testing)\n";
}

echo "\n🎉 Test completed!\n";