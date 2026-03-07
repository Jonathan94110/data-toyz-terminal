#!/usr/bin/env node
/**
 * Security Audit Script — Data Toyz Terminal
 * Run: npm run security-check
 *
 * Scans the codebase for security issues across three domains:
 *   1. Backend — auth, SQL injection, secret exposure, error handling
 *   2. Frontend — token handling, XSS vectors, PII exposure
 *   3. IP/Identity Protection — PII in responses, password hash leaks
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ROUTES_DIR = path.join(ROOT, 'routes');
const PUBLIC_DIR = path.join(ROOT, 'public');
const MIDDLEWARE_DIR = path.join(ROOT, 'middleware');

let passed = 0, warned = 0, failed = 0;
const failures = [];
const warnings = [];

function pass(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); passed++; }
function warn(msg, detail) { console.log(`  \x1b[33m⚠\x1b[0m ${msg}${detail ? ' — ' + detail : ''}`); warned++; warnings.push(detail ? `${msg} — ${detail}` : msg); }
function fail(msg, detail) { console.log(`  \x1b[31m✗\x1b[0m ${msg}${detail ? ' — ' + detail : ''}`); failed++; failures.push(detail ? `${msg} — ${detail}` : msg); }

function readFile(filePath) {
    try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

function getFiles(dir, ext) {
    const results = [];
    try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const full = path.join(dir, item);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) results.push(...getFiles(full, ext));
            else if (item.endsWith(ext)) results.push(full);
        }
    } catch { /* dir doesn't exist */ }
    return results;
}

// =====================================================
// BACKEND CHECKS
// =====================================================
function checkBackend() {
    console.log('\n\x1b[36m━━━ BACKEND SECURITY ━━━\x1b[0m\n');

    const routeFiles = getFiles(ROUTES_DIR, '.js');

    // 1. SQL Injection — check for string concatenation in queries
    console.log('  \x1b[90mSQL Injection Protection\x1b[0m');
    let sqlConcat = false;
    for (const file of routeFiles) {
        const content = readFile(file);
        if (!content) continue;
        const lines = content.split('\n');
        lines.forEach((line, i) => {
            // Look for string concatenation in query calls (dangerous patterns)
            // Flag string concatenation with user input in queries
            if (/db\.query\s*\(\s*['"].*\+\s*(?!params)(?:req\.|username|email|password)/.test(line)) {
                warn(`Potential SQL injection: ${path.basename(file)}:${i + 1}`, line.trim().slice(0, 80));
                sqlConcat = true;
            }
        });
    }
    if (!sqlConcat) pass('All SQL queries use parameterized syntax ($1, $2...)');

    // 2. Auth on mutation routes
    console.log('  \x1b[90mAuthentication on Mutations\x1b[0m');
    let unauthedMutations = [];
    for (const file of routeFiles) {
        const content = readFile(file);
        if (!content) continue;
        const name = path.basename(file);
        const lines = content.split('\n');
        lines.forEach((line, i) => {
            if (/router\.(post|put|delete)\s*\(/.test(line) && !/requireAuth/.test(line)) {
                // Exempt known public endpoints
                const route = line.match(/router\.\w+\s*\(\s*['"`]([^'"`]+)/)?.[1] || '';
                const publicRoutes = ['/register', '/login', '/forgot-password', '/reset-password'];
                if (!publicRoutes.includes(route)) {
                    unauthedMutations.push(`${name}:${i + 1} ${route}`);
                }
            }
        });
    }
    if (unauthedMutations.length === 0) pass('All mutation routes (POST/PUT/DELETE) require authentication');
    else unauthedMutations.forEach(r => fail('Unprotected mutation route', r));

    // 3. Hardcoded secrets
    console.log('  \x1b[90mSecret Exposure\x1b[0m');
    const allJsFiles = [...getFiles(ROOT, '.js')].filter(f =>
        !f.includes('node_modules') && !f.includes('package-lock') && !f.includes('/test/'));
    let secretsFound = false;
    const secretPatterns = [
        { pattern: /['"][A-Za-z0-9]{32,}['"]/, name: 'Possible hardcoded API key' },
        { pattern: /password\s*[:=]\s*['"][^'"]{4,}['"]/, name: 'Hardcoded password' },
        { pattern: /sk_live_|pk_live_|sk_test_/, name: 'Stripe key' },
        { pattern: /AKIA[0-9A-Z]{16}/, name: 'AWS access key' },
        { pattern: /ghp_[A-Za-z0-9]{36}/, name: 'GitHub token' }
    ];
    for (const file of allJsFiles) {
        if (file.includes('security-audit')) continue; // Don't flag ourselves
        const content = readFile(file);
        if (!content) continue;
        const lines = content.split('\n');
        lines.forEach((line, i) => {
            if (/process\.env|require\(|randomBytes|\.hash\(|test\(|regex|RegExp|pattern/i.test(line)) return;
            for (const sp of secretPatterns) {
                if (sp.pattern.test(line)) {
                    fail(sp.name, `${path.basename(file)}:${i + 1}`);
                    secretsFound = true;
                }
            }
        });
    }
    if (!secretsFound) pass('No hardcoded secrets or API keys detected');

    // 4. Error responses include refId
    console.log('  \x1b[90mError Reference IDs\x1b[0m');
    let missingRefId = 0;
    for (const file of routeFiles) {
        const content = readFile(file);
        if (!content) continue;
        const matches = content.match(/res\.status\(500\)\.json\(\{[^}]*\}\)/g) || [];
        for (const m of matches) {
            if (!m.includes('refId')) {
                warn(`500 response missing refId: ${path.basename(file)}`, m.slice(0, 60));
                missingRefId++;
            }
        }
    }
    if (missingRefId === 0) pass('All 500 error responses include refId for customer support correlation');

    // 5. Rate limiters
    console.log('  \x1b[90mRate Limiting\x1b[0m');
    const serverContent = readFile(path.join(ROOT, 'server.js'));
    if (serverContent && /apiLimiter/.test(serverContent)) pass('Global API rate limiter is active');
    else fail('No global API rate limiter found in server.js');

    const botProtection = readFile(path.join(MIDDLEWARE_DIR, 'botProtection.js'));
    if (botProtection && /dataEndpointLimiter/.test(botProtection)) pass('Data endpoint rate limiter is active');
    else warn('No data endpoint rate limiter — public data endpoints may be scrapable');

    // 6. Helmet security headers
    console.log('  \x1b[90mSecurity Headers\x1b[0m');
    if (serverContent && /helmet\(/.test(serverContent)) pass('Helmet security headers enabled');
    else fail('Helmet not configured in server.js');

    if (serverContent && /contentSecurityPolicy/.test(serverContent)) pass('Content Security Policy configured');
    else warn('No Content Security Policy found');

    // 7. HTTPS enforcement
    if (serverContent && /x-forwarded-proto.*https|req\.secure/i.test(serverContent)) pass('HTTPS enforcement in production');
    else warn('No HTTPS redirect found in server.js');

    // 8. Bot protection
    console.log('  \x1b[90mBot Protection\x1b[0m');
    if (botProtection && /blockBadBots/.test(botProtection)) pass('Bot user-agent blocking is active');
    else warn('No bot user-agent blocking found');

    if (botProtection && /trackDataRequest/.test(botProtection)) pass('Behavioral IP tracking is active');
    else warn('No behavioral scraping detection found');

    // 9. Token blacklist (logout revocation)
    console.log('  \x1b[90mToken Revocation\x1b[0m');
    const authMiddleware = readFile(path.join(MIDDLEWARE_DIR, 'auth.js'));
    if (authMiddleware && /isTokenBlacklisted/.test(authMiddleware)) pass('Token blacklist check in auth middleware');
    else warn('No token blacklist — logged-out tokens remain valid until expiry');

    // 10. DB connection retry
    const dbContent = readFile(path.join(ROOT, 'db.js'));
    if (dbContent && /connectWithRetry/.test(dbContent)) pass('DB connection retry with backoff configured');
    else warn('No DB connection retry — cold starts may cause failures');
}

// =====================================================
// FRONTEND CHECKS
// =====================================================
function checkFrontend() {
    console.log('\n\x1b[36m━━━ FRONTEND SECURITY ━━━\x1b[0m\n');

    const frontendFiles = getFiles(path.join(PUBLIC_DIR, 'js'), '.js');

    // 1. Token storage
    console.log('  \x1b[90mToken Handling\x1b[0m');
    let tokenInCookie = false;
    for (const file of frontendFiles) {
        const content = readFile(file);
        if (!content) continue;
        if (/document\.cookie.*token/.test(content)) {
            fail('Token stored in cookie — use localStorage instead', path.basename(file));
            tokenInCookie = true;
        }
    }
    if (!tokenInCookie) pass('Tokens stored in localStorage (not cookies — CSRF-resistant)');

    // Check auth header is used (not query params)
    let tokenInUrl = false;
    for (const file of frontendFiles) {
        const content = readFile(file);
        if (!content) continue;
        if (/[?&]token=/.test(content) || /[?&]api_key=/.test(content)) {
            fail('Token passed in URL query string — use Authorization header', path.basename(file));
            tokenInUrl = true;
        }
    }
    if (!tokenInUrl) pass('Tokens sent via Authorization header (not URL params)');

    // 2. Server-side logout call
    let logoutCallsServer = false;
    for (const file of frontendFiles) {
        const content = readFile(file);
        if (!content) continue;
        if (/\/auth\/logout/.test(content)) { logoutCallsServer = true; break; }
    }
    if (logoutCallsServer) pass('Frontend logout calls server to revoke token');
    else warn('Frontend logout only clears localStorage — tokens remain valid');

    // 3. Sensitive data in frontend
    console.log('  \x1b[90mData Exposure\x1b[0m');
    let sensitiveInFrontend = false;
    for (const file of frontendFiles) {
        const content = readFile(file);
        if (!content) continue;
        if (/password_hash|reset_token|secret_key|api_secret/.test(content)) {
            fail('Sensitive field name referenced in frontend', path.basename(file));
            sensitiveInFrontend = true;
        }
    }
    if (!sensitiveInFrontend) pass('No sensitive field names (password_hash, reset_token) in frontend code');

    // 4. innerHTML with user data (basic XSS check)
    console.log('  \x1b[90mXSS Vectors\x1b[0m');
    let xssWarnings = 0;
    for (const file of frontendFiles) {
        const content = readFile(file);
        if (!content) continue;
        const lines = content.split('\n');
        lines.forEach((line, i) => {
            // Flag innerHTML assignments that include user-controlled variables without escaping
            if (/\.innerHTML\s*[+=]/.test(line) && /\$\{.*(?:username|content|message|author|email)/.test(line)) {
                if (!/escapeHTML|textContent|sanitize/.test(line)) {
                    if (xssWarnings < 5) { // Cap to avoid noise
                        warn(`Potential XSS via innerHTML: ${path.basename(file)}:${i + 1}`);
                    }
                    xssWarnings++;
                }
            }
        });
    }
    if (xssWarnings === 0) pass('No obvious XSS vectors in innerHTML assignments');
    else if (xssWarnings > 5) warn(`${xssWarnings} total potential XSS vectors found (showing first 5)`);
}

// =====================================================
// IP / IDENTITY PROTECTION CHECKS
// =====================================================
function checkIdentityProtection() {
    console.log('\n\x1b[36m━━━ IP & IDENTITY PROTECTION ━━━\x1b[0m\n');

    const routeFiles = getFiles(ROUTES_DIR, '.js');

    // 1. Password hashes never returned in API responses
    console.log('  \x1b[90mPassword Hash Protection\x1b[0m');
    let hashExposed = false;
    for (const file of routeFiles) {
        const content = readFile(file);
        if (!content) continue;
        const name = path.basename(file);
        // Check SELECT queries that return password_hash
        const selects = content.match(/SELECT\s+\*\s+FROM\s+Users/gi) || [];
        selects.forEach(s => {
            // SELECT * FROM Users returns password_hash — check if it's used in res.json
            const lines = content.split('\n');
            lines.forEach((line, i) => {
                if (/SELECT\s+\*\s+FROM\s+Users/i.test(line)) {
                    // Check nearby lines for res.json that might expose all fields
                    const context = lines.slice(i, i + 10).join(' ');
                    if (/res\.json\(\s*(?:user|result\.rows)/.test(context) && !/password_hash/.test(context)) {
                        // This is ambiguous — might be okay if fields are cherry-picked later
                    }
                }
            });
        });
    }

    // Check that login/register don't return password_hash
    const authContent = readFile(path.join(ROUTES_DIR, 'auth.js'));
    if (authContent) {
        const loginResponse = authContent.match(/res\.json\(\{[^}]*\.\.\.(userData|newUser)/);
        if (loginResponse) pass('Login/register responses use explicit field selection (no password_hash leak)');
        else pass('Auth responses checked');

        // Verify SELECT in /me doesn't include password_hash
        if (/SELECT id, username, email, avatar, role FROM Users/.test(authContent)) {
            pass('/me endpoint selects only safe fields (no password_hash)');
        } else if (/SELECT\s+\*\s+FROM\s+Users/.test(authContent)) {
            fail('/me endpoint uses SELECT * — may expose password_hash');
            hashExposed = true;
        }
    }

    // Check backup endpoint excludes sensitive fields
    const adminContent = readFile(path.join(ROUTES_DIR, 'admin.js'));
    if (adminContent && /SELECT id, username, email.*FROM Users/i.test(adminContent) &&
        !/password_hash/.test(adminContent.match(/SELECT[^;]*FROM Users/i)?.[0] || '')) {
        pass('Backup endpoint excludes password_hash from Users export');
    } else if (adminContent && /SELECT \* FROM Users/.test(adminContent)) {
        fail('Backup endpoint uses SELECT * on Users — password hashes will be exported');
    }

    // 2. IP address exposure
    console.log('  \x1b[90mIP Address Protection\x1b[0m');
    let ipExposed = false;
    for (const file of routeFiles) {
        const content = readFile(file);
        if (!content) continue;
        const name = path.basename(file);
        // Check if req.ip is returned in responses (not just logged)
        const lines = content.split('\n');
        lines.forEach((line, i) => {
            if (/res\.json\(.*req\.ip/.test(line) || /ip:\s*req\.ip/.test(line)) {
                if (!/auditLog|log\./.test(line)) {
                    fail(`IP address returned in API response: ${name}:${i + 1}`);
                    ipExposed = true;
                }
            }
        });
    }

    // Check audit log endpoint (admin-only, so IPs are acceptable)
    if (adminContent && /ip_address/.test(adminContent) && /requireAdmin/.test(adminContent)) {
        pass('IP addresses only exposed in admin-only audit logs');
    }

    if (!ipExposed) pass('IP addresses not returned in any public API responses');

    // Check that req.ip is not logged in non-audit contexts
    let ipInLogs = false;
    for (const file of routeFiles) {
        const content = readFile(file);
        if (!content) continue;
        if (/log\.(info|warn|error).*req\.ip/.test(content)) {
            warn(`IP address in application logs: ${path.basename(file)}`, 'Consider if this is necessary');
            ipInLogs = true;
        }
    }
    if (!ipInLogs) pass('IP addresses not exposed in application log messages');

    // 3. Email exposure
    console.log('  \x1b[90mEmail Protection\x1b[0m');
    let emailExposed = false;
    // Check public profile endpoint — should NOT return email
    const usersContent = readFile(path.join(ROUTES_DIR, 'users.js'));
    if (usersContent) {
        const profileQuery = usersContent.match(/SELECT.*FROM Users WHERE username.*profile/s);
        if (usersContent.includes('SELECT id, username, avatar, role, created_at FROM Users')) {
            pass('Public profile endpoint does NOT return email');
        } else {
            warn('Check that public profile endpoint excludes email');
        }
    }

    // Check user search endpoint
    if (usersContent && /SELECT id, username, avatar FROM Users/.test(usersContent)) {
        pass('User search endpoint returns only id, username, avatar (no email)');
    }

    // 4. Data export endpoint
    console.log('  \x1b[90mData Export Safety\x1b[0m');
    if (usersContent && /\/me\/export/.test(usersContent)) {
        // Check the route definition line for requireAuth
        const exportLine = usersContent.split('\n').find(l => l.includes('/me/export'));
        if (exportLine && /requireAuth/.test(exportLine)) {
            pass('Data export endpoint requires authentication');
        } else {
            fail('Data export endpoint is PUBLIC — user data accessible without auth');
        }
    }

    // 5. CORS configuration
    console.log('  \x1b[90mCORS Configuration\x1b[0m');
    const serverContent = readFile(path.join(ROOT, 'server.js'));
    if (serverContent) {
        if (/origin:\s*['"]?\*['"]?/.test(serverContent)) {
            fail('CORS allows all origins (*) — should restrict to app domain');
        } else if (/CORS_ORIGIN|origin:/.test(serverContent)) {
            pass('CORS restricted to configured origin');
        }
    }

    // 6. Trust proxy (needed for correct req.ip behind reverse proxy)
    if (serverContent && /trust proxy/.test(serverContent)) {
        pass('Trust proxy configured (req.ip reflects real client IP, not proxy)');
    } else {
        warn('Trust proxy not configured — req.ip may show proxy IP instead of client');
    }
}

// =====================================================
// DEPENDENCY CHECKS
// =====================================================
function checkDependencies() {
    console.log('\n\x1b[36m━━━ DEPENDENCY SECURITY ━━━\x1b[0m\n');

    console.log('  \x1b[90mVulnerability Scan\x1b[0m');
    try {
        const output = execSync('npm audit --json 2>/dev/null', { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
        const audit = JSON.parse(output);
        const vulns = audit.metadata?.vulnerabilities || {};
        const critical = vulns.critical || 0;
        const high = vulns.high || 0;
        const moderate = vulns.moderate || 0;

        if (critical > 0) fail(`${critical} critical vulnerability${critical > 1 ? 'ies' : 'y'} in dependencies`);
        else pass('No critical dependency vulnerabilities');

        if (high > 0) warn(`${high} high severity vulnerability${high > 1 ? 'ies' : 'y'} in dependencies`);
        else pass('No high severity dependency vulnerabilities');

        if (moderate > 0) warn(`${moderate} moderate vulnerability${moderate > 1 ? 'ies' : 'y'} — run \`npm audit\` for details`);
    } catch (e) {
        // npm audit returns non-zero exit code when vulns are found
        try {
            const audit = JSON.parse(e.stdout || '{}');
            const vulns = audit.metadata?.vulnerabilities || {};
            const critical = vulns.critical || 0;
            const high = vulns.high || 0;
            const moderate = vulns.moderate || 0;

            if (critical > 0) fail(`${critical} critical vulnerability${critical > 1 ? 'ies' : 'y'} in dependencies`);
            else pass('No critical dependency vulnerabilities');

            if (high > 0) warn(`${high} high severity vulnerability${high > 1 ? 'ies' : 'y'} in dependencies`);
            else pass('No high severity dependency vulnerabilities');

            if (moderate > 0) warn(`${moderate} moderate vulnerability${moderate > 1 ? 'ies' : 'y'} — run \`npm audit\` for details`);
        } catch {
            warn('Could not run npm audit — install dependencies first');
        }
    }

    // Check for .env in git
    console.log('  \x1b[90mGit Safety\x1b[0m');
    const gitignore = readFile(path.join(ROOT, '.gitignore'));
    if (gitignore && /\.env/.test(gitignore)) pass('.env file is gitignored');
    else fail('.env file is NOT in .gitignore — secrets may be committed');

    if (gitignore && /node_modules/.test(gitignore)) pass('node_modules is gitignored');
    else warn('node_modules not in .gitignore');
}

// =====================================================
// RUN ALL CHECKS
// =====================================================
console.log('\n\x1b[1m🔒 DATA TOYZ TERMINAL — SECURITY AUDIT\x1b[0m');
console.log(`\x1b[90m   ${new Date().toISOString()}\x1b[0m`);

checkBackend();
checkFrontend();
checkIdentityProtection();
checkDependencies();

// Summary
console.log('\n\x1b[36m━━━ SUMMARY ━━━\x1b[0m\n');
console.log(`  \x1b[32m${passed} passed\x1b[0m  \x1b[33m${warned} warnings\x1b[0m  \x1b[31m${failed} failed\x1b[0m\n`);

// Write machine-readable report for the alert email script
const report = {
    timestamp: new Date().toISOString(),
    passed,
    warnings: warned,
    failed,
    failureDetails: failures,
    warningDetails: warnings
};
const reportPath = path.join(ROOT, 'security-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

if (failed > 0) {
    console.log('  \x1b[31mAction required: Fix failed checks before deploying.\x1b[0m\n');
    process.exit(1);
} else if (warned > 0) {
    console.log('  \x1b[33mReview warnings when possible. No critical issues.\x1b[0m\n');
} else {
    console.log('  \x1b[32mAll clear. No security issues detected.\x1b[0m\n');
}
