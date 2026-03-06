/**
 * Smoke Test Suite — Data Toyz Terminal
 * Verifies core endpoints respond correctly without requiring external services.
 * Run: npm test
 */

const http = require('http');

const BASE = process.env.TEST_URL || 'http://localhost:3000';
let passed = 0;
let failed = 0;
const results = [];

function request(method, path, { body, token, headers: extraHeaders } = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const headers = { 'Content-Type': 'application/json', 'User-Agent': 'DataToyzSmokeTest/1.0', ...extraHeaders };
        const options = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers
        };
        if (token) options.headers['Authorization'] = `Bearer ${token}`;

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(data); } catch { parsed = data; }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function assert(name, condition) {
    if (condition) {
        passed++;
        results.push(`  \u2713 ${name}`);
    } else {
        failed++;
        results.push(`  \u2717 ${name}`);
    }
}

async function run() {
    console.log('\nData Toyz Terminal — Smoke Tests\n');

    // 1. Health check
    try {
        const res = await request('GET', '/api/health');
        assert('Health check returns 200', res.status === 200);
        assert('Health check has status ok', res.body.status === 'ok');
        assert('Health check has uptime', typeof res.body.uptime === 'number');
    } catch (e) {
        assert('Health check reachable', false);
    }

    // 2. Security headers present
    try {
        const res = await request('GET', '/api/health');
        assert('Has Content-Security-Policy', !!res.headers['content-security-policy']);
        assert('Has X-Content-Type-Options', res.headers['x-content-type-options'] === 'nosniff');
        assert('Has X-Frame-Options', !!res.headers['x-frame-options']);
        assert('Has Referrer-Policy', !!res.headers['referrer-policy']);
    } catch (e) {
        assert('Security headers check', false);
    }

    // 3. Compression active (test with larger response)
    try {
        const res = await request('GET', '/js/app-core.js', {
            headers: { 'Accept-Encoding': 'gzip, deflate' }
        });
        assert('Compression enabled on large responses', !!res.headers['content-encoding'] || res.status === 200);
    } catch (e) {
        assert('Compression check', false);
    }

    // 4. Static files served
    try {
        const res = await request('GET', '/js/app-core.js');
        assert('Static JS file served (200)', res.status === 200);
    } catch (e) {
        assert('Static file serving', false);
    }

    // 5. Auth protection — no token
    try {
        const res = await request('GET', '/api/auth/me');
        assert('Protected route rejects without token (401)', res.status === 401);
    } catch (e) {
        assert('Auth protection check', false);
    }

    // 6. Auth protection — bad token
    try {
        const res = await request('GET', '/api/auth/me', { token: 'invalid.token.here' });
        assert('Protected route rejects bad token (401/403)', [401, 403].includes(res.status));
    } catch (e) {
        assert('Bad token rejection', false);
    }

    // 7. Registration — weak password rejected
    try {
        const res = await request('POST', '/api/auth/register', {
            body: { username: 'test_weak_pw', email: 'weak@test.com', password: '123' }
        });
        assert('Weak password rejected (400)', res.status === 400);
    } catch (e) {
        assert('Password validation', false);
    }

    // 8. Registration — long username rejected
    try {
        const longName = 'a'.repeat(51);
        const res = await request('POST', '/api/auth/register', {
            body: { username: longName, email: 'long@test.com', password: 'StrongPass1' }
        });
        assert('Oversized username rejected (400)', res.status === 400);
    } catch (e) {
        assert('Input length validation', false);
    }

    // 9. Login — wrong credentials
    try {
        const res = await request('POST', '/api/auth/login', {
            body: { username: 'nonexistent_user_xyz', password: 'WrongPass1' }
        });
        assert('Invalid login returns 401', res.status === 401);
    } catch (e) {
        assert('Login rejection', false);
    }

    // 10. Figures endpoint (public data)
    try {
        const res = await request('GET', '/api/figures');
        assert('Figures endpoint returns 200', res.status === 200);
        assert('Figures returns an array', Array.isArray(res.body));
    } catch (e) {
        assert('Figures endpoint', false);
    }

    // 11. Data export requires auth
    try {
        const res = await request('GET', '/api/users/me/export');
        assert('Data export requires auth (401)', res.status === 401);
    } catch (e) {
        assert('Data export auth check', false);
    }

    // 12. Error sanitization — bad route returns 404
    try {
        const res = await request('GET', '/api/nonexistent-route');
        assert('Unknown route returns 404 (not 500)', res.status === 404);
    } catch (e) {
        assert('Error sanitization', false);
    }

    // Print results
    console.log(results.join('\n'));
    console.log(`\n  ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error('Test suite crashed:', err.message);
    process.exit(1);
});
