const express = require('express');
const router = express.Router();
const db = require('../db.js');
const log = require('../logger.js');
const { normalizeRow } = require('../helpers/normalize');

// 6. Global Market Overview stats
router.get('/overview', async (req, res) => {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

        const [
            totalIntel,
            uniqueAnalysts,
            avgGrade,
            topFigure,
            totalTargets,
            totalMarketTx,
            avgSecondaryPrice,
            mostActiveBrand,
            priceTrendCurrent,
            priceTrendPrior
        ] = await Promise.all([
            db.query("SELECT COUNT(*) as count FROM Submissions"),
            db.query("SELECT COUNT(DISTINCT author) as count FROM Submissions"),
            db.query("SELECT AVG((mtsTotal + approvalScore) / 2) as avg FROM Submissions"),
            db.query(`
                SELECT s.targetName, s.targetId, AVG((s.mtsTotal + s.approvalScore) / 2) as avgGrade, COUNT(*) as subs
                FROM Submissions s GROUP BY s.targetName, s.targetId
                ORDER BY avgGrade DESC LIMIT 1
            `),
            db.query("SELECT COUNT(*) as count FROM Figures"),
            db.query("SELECT COUNT(*) as count FROM MarketTransactions"),
            db.query("SELECT AVG(price_avg) as avg FROM MarketTransactions WHERE price_type = 'secondary_market'"),
            db.query(`
                SELECT f.brand, COUNT(s.id) as cnt
                FROM Submissions s JOIN Figures f ON f.id = s.targetId
                WHERE s.date >= $1
                GROUP BY f.brand ORDER BY cnt DESC LIMIT 1
            `, [thirtyDaysAgo]),
            db.query("SELECT AVG(price_avg) as avg FROM MarketTransactions WHERE price_type = 'secondary_market' AND created_at >= $1", [thirtyDaysAgo]),
            db.query("SELECT AVG(price_avg) as avg FROM MarketTransactions WHERE price_type = 'secondary_market' AND created_at >= $1 AND created_at < $2", [sixtyDaysAgo, thirtyDaysAgo])
        ]);

        const current30Avg = priceTrendCurrent.rows[0].avg ? parseFloat(priceTrendCurrent.rows[0].avg) : null;
        const prior30Avg = priceTrendPrior.rows[0].avg ? parseFloat(priceTrendPrior.rows[0].avg) : null;
        const changePct = (current30Avg !== null && prior30Avg !== null && prior30Avg !== 0)
            ? ((current30Avg - prior30Avg) / prior30Avg * 100)
            : null;

        res.json({
            totalIntel: parseInt(totalIntel.rows[0].count),
            uniqueAnalysts: parseInt(uniqueAnalysts.rows[0].count),
            avgGrade: avgGrade.rows[0].avg ? parseFloat(avgGrade.rows[0].avg).toFixed(1) : '0.0',
            totalTargets: parseInt(totalTargets.rows[0].count),
            topFigure: topFigure.rows[0] ? {
                name: topFigure.rows[0].targetname,
                id: topFigure.rows[0].targetid,
                grade: parseFloat(topFigure.rows[0].avggrade).toFixed(1),
                subs: parseInt(topFigure.rows[0].subs)
            } : null,
            totalMarketTx: parseInt(totalMarketTx.rows[0].count),
            avgSecondaryPrice: avgSecondaryPrice.rows[0].avg ? parseFloat(avgSecondaryPrice.rows[0].avg) : null,
            mostActiveBrand: mostActiveBrand.rows[0] ? mostActiveBrand.rows[0].brand : null,
            priceTrend: {
                current30Avg,
                prior30Avg,
                changePct: changePct !== null ? parseFloat(changePct.toFixed(2)) : null
            }
        });
    } catch (err) {
        log.error('Stats overview error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// 7. Brand/Line Index aggregates
router.get('/indexes', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT f.brand, f.line,
                   COUNT(s.id) as submissions,
                   AVG((s.mtsTotal + s.approvalScore) / 2) as avgGrade,
                   COUNT(DISTINCT s.targetId) as targets
            FROM Figures f
            LEFT JOIN Submissions s ON f.id = s.targetId
            GROUP BY f.brand, f.line
            ORDER BY f.brand ASC, f.line ASC
        `);

        const indexes = result.rows.map(r => ({
            brand: r.brand,
            line: r.line,
            submissions: parseInt(r.submissions) || 0,
            avgGrade: r.avggrade ? parseFloat(r.avggrade).toFixed(1) : null,
            targets: parseInt(r.targets) || 0
        }));

        res.json(indexes);
    } catch (err) {
        log.error('Stats indexes error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Market Volume time-series
router.get('/market-volume', async (req, res) => {
    try {
        const period = req.query.period === 'weekly' ? 'weekly' : 'daily';
        const lookbackMs = period === 'daily' ? 90 * 24 * 60 * 60 * 1000 : 365 * 24 * 60 * 60 * 1000;
        const since = new Date(Date.now() - lookbackMs).toISOString();

        const dateExpr = period === 'daily' ? 'DATE(date)' : "DATE_TRUNC('week', date::timestamp)";
        const dateExprTx = period === 'daily' ? 'DATE(created_at)' : "DATE_TRUNC('week', created_at::timestamp)";

        const [subsResult, txResult] = await Promise.all([
            db.query(
                `SELECT ${dateExpr} as day, COUNT(*) as count FROM Submissions WHERE date >= $1 GROUP BY ${dateExpr} ORDER BY day ASC`,
                [since]
            ),
            db.query(
                `SELECT ${dateExprTx} as day, COUNT(*) as count FROM MarketTransactions WHERE created_at >= $1 GROUP BY ${dateExprTx} ORDER BY day ASC`,
                [since]
            )
        ]);

        const subsMap = {};
        for (const row of subsResult.rows) {
            const key = new Date(row.day).toISOString().split('T')[0];
            subsMap[key] = parseInt(row.count);
        }

        const txMap = {};
        for (const row of txResult.rows) {
            const key = new Date(row.day).toISOString().split('T')[0];
            txMap[key] = parseInt(row.count);
        }

        const allKeys = new Set([...Object.keys(subsMap), ...Object.keys(txMap)]);
        const labels = Array.from(allKeys).sort();
        const submissions = labels.map(l => subsMap[l] || 0);
        const transactions = labels.map(l => txMap[l] || 0);

        res.json({ period, labels, submissions, transactions });
    } catch (err) {
        log.error('Stats market-volume error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// Brand Index aggregates with price data
router.get('/brand-index', async (req, res) => {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

        const [figureResult, priceResult] = await Promise.all([
            db.query(`
                SELECT f.brand, COUNT(DISTINCT f.id) as figure_count, COUNT(s.id) as submission_count,
                       AVG((s.mtsTotal + s.approvalScore) / 2) as avg_grade
                FROM Figures f LEFT JOIN Submissions s ON f.id = s.targetId
                GROUP BY f.brand ORDER BY submission_count DESC
            `),
            db.query(`
                SELECT f.brand,
                       AVG(CASE WHEN mt.created_at >= $1 THEN mt.price_avg END) as avg_price_30d,
                       AVG(CASE WHEN mt.created_at >= $2 AND mt.created_at < $1 THEN mt.price_avg END) as avg_price_prior_30d,
                       AVG(mt.price_avg) as avg_price_all
                FROM MarketTransactions mt
                JOIN Figures f ON f.id = mt.figure_id
                WHERE mt.price_type = 'secondary_market'
                GROUP BY f.brand
            `, [thirtyDaysAgo, sixtyDaysAgo])
        ]);

        const priceMap = {};
        for (const row of priceResult.rows) {
            priceMap[row.brand] = row;
        }

        const brands = figureResult.rows.map(r => {
            const price = priceMap[r.brand] || {};
            const avg30 = price.avg_price_30d ? parseFloat(price.avg_price_30d) : null;
            const avgPrior30 = price.avg_price_prior_30d ? parseFloat(price.avg_price_prior_30d) : null;
            const changePct = (avg30 !== null && avgPrior30 !== null && avgPrior30 !== 0)
                ? ((avg30 - avgPrior30) / avgPrior30 * 100)
                : null;

            return {
                brand: r.brand,
                figureCount: parseInt(r.figure_count),
                submissionCount: parseInt(r.submission_count),
                avgGrade: r.avg_grade ? parseFloat(r.avg_grade).toFixed(1) : null,
                avgSecondaryPrice: price.avg_price_all ? parseFloat(price.avg_price_all) : null,
                priceChange30d: changePct !== null ? parseFloat(changePct.toFixed(2)) : null
            };
        });

        res.json(brands);
    } catch (err) {
        log.error('Stats brand-index error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// 8. Intel Headlines
router.get('/headlines', async (req, res) => {
    try {
        const recent = await db.query(`
            SELECT s.targetName, s.author, s.date, s.mtsTotal, s.approvalScore, s.jsonData,
                   f.brand, f.classTie
            FROM Submissions s
            LEFT JOIN Figures f ON f.id = s.targetId
            ORDER BY s.id DESC LIMIT 10
        `);

        const headlines = recent.rows.map(r => {
            const row = normalizeRow(r);
            const grade = ((parseFloat(row.mtsTotal) + parseFloat(row.approvalScore)) / 2).toFixed(1);
            let data = {};
            try { data = JSON.parse(row.jsonData); } catch (e) { }

            let headline = `${row.author} assessed ${row.targetName}`;
            if (parseFloat(grade) >= 80) headline = `🔥 ${row.targetName} scored an elite ${grade} grade from ${row.author}`;
            else if (parseFloat(grade) >= 60) headline = `📊 ${row.author} gave ${row.targetName} a solid ${grade} rating`;
            else if (parseFloat(grade) < 40) headline = `⚠️ ${row.author} flagged ${row.targetName} with a low ${grade} grade`;
            else headline = `📋 ${row.author} submitted intel on ${row.targetName} (Grade: ${grade})`;

            return {
                headline,
                author: row.author,
                target: row.targetName,
                brand: row.brand || 'Unknown',
                classTie: row.classTie || 'Unknown',
                grade: parseFloat(grade),
                date: row.date,
                tradeRating: data.tradeRating || null
            };
        });

        res.json(headlines);
    } catch (err) {
        log.error('Stats headlines error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// ── Weekly Movers Report ────────────────────────────────────
router.get('/weekly-movers', async (req, res) => {
    try {
        const now = Date.now();
        const d7  = new Date(now -  7 * 24 * 60 * 60 * 1000).toISOString();
        const d14 = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
        const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
        const d60 = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();

        const [figureBase, priceLatest, priceChange7d, priceChange30d,
               weeklySubmissions, weeklyFigures, brandPrices] = await Promise.all([
            // Base figure data with 7d submission counts + avg grade
            db.query(`
                SELECT f.id, f.name, f.brand, f.classTie, f.line,
                       COUNT(s.id) as total_submissions,
                       COUNT(CASE WHEN s.date >= $1 THEN 1 END) as submissions_7d,
                       AVG((s.mtsTotal + s.approvalScore) / 2) as avg_grade
                FROM Figures f LEFT JOIN Submissions s ON f.id = s.targetId
                GROUP BY f.id, f.name, f.brand, f.classTie, f.line
            `, [d7]),

            // Latest price per figure
            db.query(`
                SELECT DISTINCT ON (figure_id) figure_id, price_avg as latest_price
                FROM MarketTransactions
                WHERE price_type = 'secondary_market'
                ORDER BY figure_id, created_at DESC
            `),

            // 7-day price change
            db.query(`
                SELECT figure_id,
                       AVG(CASE WHEN created_at >= $1 THEN price_avg END) as avg_7d,
                       AVG(CASE WHEN created_at >= $2 AND created_at < $1 THEN price_avg END) as avg_prior_7d
                FROM MarketTransactions
                WHERE price_type = 'secondary_market' AND created_at >= $2
                GROUP BY figure_id
            `, [d7, d14]),

            // 30-day price change
            db.query(`
                SELECT figure_id,
                       AVG(CASE WHEN created_at >= $1 THEN price_avg END) as avg_30d,
                       AVG(CASE WHEN created_at >= $2 AND created_at < $1 THEN price_avg END) as avg_prior_30d
                FROM MarketTransactions
                WHERE price_type = 'secondary_market' AND created_at >= $2
                GROUP BY figure_id
            `, [d30, d60]),

            // Weekly submission summary
            db.query(`
                SELECT COUNT(*) as count,
                       AVG((mtsTotal + approvalScore) / 2) as avg_grade
                FROM Submissions WHERE date >= $1
            `, [d7]),

            // New entries (first submission in last 7d)
            db.query(`
                SELECT f.id, f.name, f.brand, f.classTie, f.line,
                       MIN(s.date) as first_submission
                FROM Figures f
                JOIN Submissions s ON f.id = s.targetId
                GROUP BY f.id, f.name, f.brand, f.classTie, f.line
                HAVING MIN(s.date) >= $1
                ORDER BY MIN(s.date) DESC
            `, [d7]),

            // Brand-level 7d price changes
            db.query(`
                SELECT f.brand,
                       COUNT(DISTINCT f.id) as figure_count,
                       AVG(CASE WHEN mt.created_at >= $1 THEN mt.price_avg END) as avg_price_7d,
                       AVG(CASE WHEN mt.created_at >= $2 AND mt.created_at < $1 THEN mt.price_avg END) as avg_price_prior_7d,
                       COUNT(CASE WHEN s.date >= $1 THEN 1 END) as submissions_7d
                FROM Figures f
                LEFT JOIN MarketTransactions mt ON f.id = mt.figure_id AND mt.price_type = 'secondary_market'
                LEFT JOIN Submissions s ON f.id = s.targetId
                GROUP BY f.brand
                HAVING COUNT(DISTINCT f.id) > 0
            `, [d7, d14])
        ]);

        // Build lookup maps
        const priceMap = {};
        for (const r of priceLatest.rows) priceMap[r.figure_id] = parseFloat(r.latest_price);

        const change7dMap = {};
        for (const r of priceChange7d.rows) {
            const avg = r.avg_7d ? parseFloat(r.avg_7d) : null;
            const prior = r.avg_prior_7d ? parseFloat(r.avg_prior_7d) : null;
            change7dMap[r.figure_id] = (avg !== null && prior !== null && prior !== 0)
                ? parseFloat((((avg - prior) / prior) * 100).toFixed(1)) : null;
        }

        const change30dMap = {};
        for (const r of priceChange30d.rows) {
            const avg = r.avg_30d ? parseFloat(r.avg_30d) : null;
            const prior = r.avg_prior_30d ? parseFloat(r.avg_prior_30d) : null;
            change30dMap[r.figure_id] = (avg !== null && prior !== null && prior !== 0)
                ? parseFloat((((avg - prior) / prior) * 100).toFixed(1)) : null;
        }

        // Merge into enriched figure list
        const enriched = figureBase.rows.map(r => ({
            id: r.id,
            name: r.name,
            brand: r.brand,
            classTie: r.classtie,
            line: r.line,
            totalSubmissions: parseInt(r.total_submissions) || 0,
            submissions7d: parseInt(r.submissions_7d) || 0,
            avgGrade: r.avg_grade ? parseFloat(parseFloat(r.avg_grade).toFixed(1)) : null,
            latestPrice: priceMap[r.id] ?? null,
            priceChange7d: change7dMap[r.id] ?? null,
            priceChange30d: change30dMap[r.id] ?? null
        }));

        // Sort for each section (top 10)
        const withChange7d = enriched.filter(f => f.priceChange7d !== null);

        const topGainers = [...withChange7d]
            .sort((a, b) => b.priceChange7d - a.priceChange7d)
            .slice(0, 10);

        const topLosers = [...withChange7d]
            .sort((a, b) => a.priceChange7d - b.priceChange7d)
            .filter(f => f.priceChange7d < 0)
            .slice(0, 10);

        const mostActive = [...enriched]
            .filter(f => f.submissions7d > 0)
            .sort((a, b) => b.submissions7d - a.submissions7d)
            .slice(0, 10);

        const newEntries = weeklyFigures.rows.map(r => ({
            id: r.id, name: r.name, brand: r.brand,
            classTie: r.classtie, line: r.line,
            firstSubmission: r.first_submission
        }));

        // Brand movers
        const brandMovers = brandPrices.rows.map(r => {
            const avg7 = r.avg_price_7d ? parseFloat(r.avg_price_7d) : null;
            const prior7 = r.avg_price_prior_7d ? parseFloat(r.avg_price_prior_7d) : null;
            const changePct = (avg7 !== null && prior7 !== null && prior7 !== 0)
                ? parseFloat((((avg7 - prior7) / prior7) * 100).toFixed(1)) : null;
            return {
                brand: r.brand,
                figureCount: parseInt(r.figure_count),
                submissions7d: parseInt(r.submissions_7d) || 0,
                priceChange7d: changePct
            };
        }).filter(b => b.priceChange7d !== null)
          .sort((a, b) => Math.abs(b.priceChange7d) - Math.abs(a.priceChange7d));

        const wSubs = weeklySubmissions.rows[0];
        res.json({
            summary: {
                totalSubmissions7d: parseInt(wSubs.count) || 0,
                avgGrade7d: wSubs.avg_grade ? parseFloat(parseFloat(wSubs.avg_grade).toFixed(1)) : null,
                gainersCount: topGainers.length,
                losersCount: topLosers.length,
                newEntriesCount: newEntries.length
            },
            topGainers, topLosers, mostActive, newEntries, brandMovers
        });
    } catch (err) {
        log.error('Weekly movers error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// ── Brand Health Dashboard ──────────────────────────────────
router.get('/brand-health', async (req, res) => {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

        const [brandBase, brandPrices, submissionVelocity, uniqueAnalysts,
               priceTrendSeries, gradeTrendSeries] = await Promise.all([
            // Brand base metrics (figure count, submission count, avg grade)
            db.query(`
                SELECT f.brand,
                       COUNT(DISTINCT f.id) as figure_count,
                       COUNT(s.id) as submission_count,
                       AVG((s.mtsTotal + s.approvalScore) / 2) as avg_grade
                FROM Figures f
                LEFT JOIN Submissions s ON f.id = s.targetId
                GROUP BY f.brand
                ORDER BY submission_count DESC
            `),

            // Brand secondary market prices (current 30d vs prior 30d)
            db.query(`
                SELECT f.brand,
                       AVG(mt.price_avg) as avg_price_all,
                       AVG(CASE WHEN mt.created_at >= $1 THEN mt.price_avg END) as avg_price_30d,
                       AVG(CASE WHEN mt.created_at >= $2 AND mt.created_at < $1 THEN mt.price_avg END) as avg_price_prior_30d
                FROM MarketTransactions mt
                JOIN Figures f ON f.id = mt.figure_id
                WHERE mt.price_type = 'secondary_market'
                GROUP BY f.brand
            `, [thirtyDaysAgo, sixtyDaysAgo]),

            // Submission velocity (last 30d per brand)
            db.query(`
                SELECT f.brand, COUNT(s.id) as submissions_30d
                FROM Submissions s
                JOIN Figures f ON f.id = s.targetId
                WHERE s.date >= $1
                GROUP BY f.brand
            `, [thirtyDaysAgo]),

            // Unique analysts per brand
            db.query(`
                SELECT f.brand, COUNT(DISTINCT s.author) as analysts
                FROM Submissions s
                JOIN Figures f ON f.id = s.targetId
                GROUP BY f.brand
            `),

            // Price trend time-series (weekly buckets, last 90d, per brand)
            db.query(`
                SELECT f.brand,
                       DATE_TRUNC('week', mt.created_at::timestamp) as week,
                       AVG(mt.price_avg) as avg_price
                FROM MarketTransactions mt
                JOIN Figures f ON f.id = mt.figure_id
                WHERE mt.price_type = 'secondary_market' AND mt.created_at >= $1
                GROUP BY f.brand, DATE_TRUNC('week', mt.created_at::timestamp)
                ORDER BY week ASC
            `, [ninetyDaysAgo]),

            // Grade trend time-series (weekly buckets, last 90d, per brand)
            db.query(`
                SELECT f.brand,
                       DATE_TRUNC('week', s.date::timestamp) as week,
                       AVG((s.mtsTotal + s.approvalScore) / 2) as avg_grade
                FROM Submissions s
                JOIN Figures f ON f.id = s.targetId
                WHERE s.date >= $1
                GROUP BY f.brand, DATE_TRUNC('week', s.date::timestamp)
                ORDER BY week ASC
            `, [ninetyDaysAgo])
        ]);

        // Build lookup maps
        const priceMap = {};
        for (const r of brandPrices.rows) priceMap[r.brand] = r;

        const velocityMap = {};
        for (const r of submissionVelocity.rows) velocityMap[r.brand] = parseInt(r.submissions_30d);

        const analystMap = {};
        for (const r of uniqueAnalysts.rows) analystMap[r.brand] = parseInt(r.analysts);

        // Merge into brands array
        const brands = brandBase.rows.map(r => {
            const price = priceMap[r.brand] || {};
            const avg30 = price.avg_price_30d ? parseFloat(price.avg_price_30d) : null;
            const avgPrior30 = price.avg_price_prior_30d ? parseFloat(price.avg_price_prior_30d) : null;
            const changePct = (avg30 !== null && avgPrior30 !== null && avgPrior30 !== 0)
                ? parseFloat((((avg30 - avgPrior30) / avgPrior30) * 100).toFixed(1))
                : null;

            return {
                brand: r.brand,
                figureCount: parseInt(r.figure_count),
                submissionCount: parseInt(r.submission_count),
                avgGrade: r.avg_grade ? parseFloat(parseFloat(r.avg_grade).toFixed(1)) : null,
                avgSecondaryPrice: price.avg_price_all ? parseFloat(price.avg_price_all) : null,
                priceChange30d: changePct,
                submissions30d: velocityMap[r.brand] || 0,
                uniqueAnalysts: analystMap[r.brand] || 0
            };
        });

        // Build price trend time-series
        const priceWeeks = new Set();
        const priceBrandMap = {};
        for (const r of priceTrendSeries.rows) {
            const wk = new Date(r.week).toISOString().split('T')[0];
            priceWeeks.add(wk);
            if (!priceBrandMap[r.brand]) priceBrandMap[r.brand] = {};
            priceBrandMap[r.brand][wk] = parseFloat(parseFloat(r.avg_price).toFixed(2));
        }
        const priceLabels = Array.from(priceWeeks).sort();
        const priceDatasets = Object.keys(priceBrandMap).map(brand => ({
            brand,
            data: priceLabels.map(l => priceBrandMap[brand][l] || null)
        }));

        // Build grade trend time-series
        const gradeWeeks = new Set();
        const gradeBrandMap = {};
        for (const r of gradeTrendSeries.rows) {
            const wk = new Date(r.week).toISOString().split('T')[0];
            gradeWeeks.add(wk);
            if (!gradeBrandMap[r.brand]) gradeBrandMap[r.brand] = {};
            gradeBrandMap[r.brand][wk] = parseFloat(parseFloat(r.avg_grade).toFixed(1));
        }
        const gradeLabels = Array.from(gradeWeeks).sort();
        const gradeDatasets = Object.keys(gradeBrandMap).map(brand => ({
            brand,
            data: gradeLabels.map(l => gradeBrandMap[brand][l] || null)
        }));

        res.json({
            brands,
            priceTrends: { labels: priceLabels, datasets: priceDatasets },
            gradeTrends: { labels: gradeLabels, datasets: gradeDatasets }
        });
    } catch (err) {
        log.error('Brand health error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

// ── Market Trends Timeline ──────────────────────────────────
router.get('/market-trends', async (req, res) => {
    try {
        const periodParam = req.query.period || '90d';
        let days, bucketExprTx, bucketExprSub;
        if (periodParam === '30d') {
            days = 30;
            bucketExprTx = 'DATE(mt.created_at)';
            bucketExprSub = 'DATE(s.date)';
        } else if (periodParam === '1y') {
            days = 365;
            bucketExprTx = "DATE_TRUNC('week', mt.created_at::timestamp)";
            bucketExprSub = "DATE_TRUNC('week', s.date::timestamp)";
        } else {
            days = 90;
            bucketExprTx = "DATE_TRUNC('week', mt.created_at::timestamp)";
            bucketExprSub = "DATE_TRUNC('week', s.date::timestamp)";
        }

        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const midpoint = new Date(Date.now() - Math.floor(days / 2) * 24 * 60 * 60 * 1000).toISOString();
        const recentWindow = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const startWindow = new Date(new Date(since).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

        // Find top 3 brands by transaction volume in period
        const topBrandsResult = await db.query(`
            SELECT f.brand, COUNT(*) as cnt
            FROM MarketTransactions mt
            JOIN Figures f ON f.id = mt.figure_id
            WHERE mt.price_type = 'secondary_market' AND mt.created_at >= $1
            GROUP BY f.brand ORDER BY cnt DESC LIMIT 3
        `, [since]);
        const topBrands = topBrandsResult.rows.map(r => r.brand);

        const [summaryNow, summaryStart, totalSubs, activeFigures,
               overallPriceSeries, brandPriceSeries,
               submissionActivity, txActivity, topMoversResult] = await Promise.all([
            // Current avg price (last 7d)
            db.query(`
                SELECT AVG(price_avg) as avg
                FROM MarketTransactions
                WHERE price_type = 'secondary_market' AND created_at >= $1
            `, [recentWindow]),

            // Period-start avg price (first 7d of period)
            db.query(`
                SELECT AVG(price_avg) as avg
                FROM MarketTransactions
                WHERE price_type = 'secondary_market'
                  AND created_at >= $1 AND created_at < $2
            `, [since, startWindow]),

            // Total submissions in period
            db.query(`SELECT COUNT(*) as count FROM Submissions WHERE date >= $1`, [since]),

            // Active figures (with submission or transaction in period)
            db.query(`
                SELECT COUNT(DISTINCT id) as count FROM (
                    SELECT targetId as id FROM Submissions WHERE date >= $1
                    UNION
                    SELECT figure_id as id FROM MarketTransactions WHERE created_at >= $1
                ) active
            `, [since]),

            // Overall avg price time-series
            db.query(`
                SELECT ${bucketExprTx} as bucket, AVG(mt.price_avg) as avg_price
                FROM MarketTransactions mt
                WHERE mt.price_type = 'secondary_market' AND mt.created_at >= $1
                GROUP BY ${bucketExprTx}
                ORDER BY bucket ASC
            `, [since]),

            // Top 3 brand price time-series
            topBrands.length > 0 ? db.query(`
                SELECT f.brand, ${bucketExprTx} as bucket, AVG(mt.price_avg) as avg_price
                FROM MarketTransactions mt
                JOIN Figures f ON f.id = mt.figure_id
                WHERE mt.price_type = 'secondary_market' AND mt.created_at >= $1
                  AND f.brand = ANY($2)
                GROUP BY f.brand, ${bucketExprTx}
                ORDER BY bucket ASC
            `, [since, topBrands]) : { rows: [] },

            // Submission activity time-series
            db.query(`
                SELECT ${bucketExprSub} as bucket, COUNT(*) as count
                FROM Submissions s WHERE s.date >= $1
                GROUP BY ${bucketExprSub} ORDER BY bucket ASC
            `, [since]),

            // Transaction activity time-series
            db.query(`
                SELECT ${bucketExprTx} as bucket, COUNT(*) as count
                FROM MarketTransactions mt WHERE mt.created_at >= $1
                GROUP BY ${bucketExprTx} ORDER BY bucket ASC
            `, [since]),

            // Top movers (recent half vs earlier half)
            db.query(`
                SELECT f.id, f.name, f.brand, f.classtie,
                       AVG(CASE WHEN mt.created_at >= $2 THEN mt.price_avg END) as recent_avg,
                       AVG(CASE WHEN mt.created_at < $2 THEN mt.price_avg END) as earlier_avg
                FROM MarketTransactions mt
                JOIN Figures f ON f.id = mt.figure_id
                WHERE mt.price_type = 'secondary_market' AND mt.created_at >= $1
                GROUP BY f.id, f.name, f.brand, f.classtie
                HAVING AVG(CASE WHEN mt.created_at >= $2 THEN mt.price_avg END) IS NOT NULL
                   AND AVG(CASE WHEN mt.created_at < $2 THEN mt.price_avg END) IS NOT NULL
                   AND AVG(CASE WHEN mt.created_at < $2 THEN mt.price_avg END) > 0
            `, [since, midpoint])
        ]);

        // Process summary
        const avgNow = summaryNow.rows[0].avg ? parseFloat(summaryNow.rows[0].avg) : null;
        const avgStart = summaryStart.rows[0].avg ? parseFloat(summaryStart.rows[0].avg) : null;
        const priceChangePct = (avgNow !== null && avgStart !== null && avgStart !== 0)
            ? parseFloat((((avgNow - avgStart) / avgStart) * 100).toFixed(1))
            : null;

        // Build price series
        const allBuckets = new Set();
        const overallMap = {};
        for (const r of overallPriceSeries.rows) {
            const key = new Date(r.bucket).toISOString().split('T')[0];
            allBuckets.add(key);
            overallMap[key] = parseFloat(parseFloat(r.avg_price).toFixed(2));
        }

        const brandMaps = {};
        for (const r of brandPriceSeries.rows) {
            const key = new Date(r.bucket).toISOString().split('T')[0];
            allBuckets.add(key);
            if (!brandMaps[r.brand]) brandMaps[r.brand] = {};
            brandMaps[r.brand][key] = parseFloat(parseFloat(r.avg_price).toFixed(2));
        }

        const priceLabels = Array.from(allBuckets).sort();
        const priceDatasets = [
            { label: 'Overall', data: priceLabels.map(l => overallMap[l] || null) },
            ...Object.keys(brandMaps).map(brand => ({
                label: brand,
                data: priceLabels.map(l => brandMaps[brand][l] || null)
            }))
        ];

        // Build activity series
        const actBuckets = new Set();
        const subsMap = {};
        const txMap = {};
        for (const r of submissionActivity.rows) {
            const key = new Date(r.bucket).toISOString().split('T')[0];
            actBuckets.add(key);
            subsMap[key] = parseInt(r.count);
        }
        for (const r of txActivity.rows) {
            const key = new Date(r.bucket).toISOString().split('T')[0];
            actBuckets.add(key);
            txMap[key] = parseInt(r.count);
        }
        const actLabels = Array.from(actBuckets).sort();

        // Process top movers
        const movers = topMoversResult.rows.map(r => {
            const recent = parseFloat(r.recent_avg);
            const earlier = parseFloat(r.earlier_avg);
            const changePct = parseFloat((((recent - earlier) / earlier) * 100).toFixed(1));
            return {
                id: r.id, name: r.name, brand: r.brand, classTie: r.classtie,
                currentPrice: parseFloat(recent.toFixed(2)),
                changePct
            };
        });

        const gainers = movers.filter(m => m.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, 10);
        const losers = movers.filter(m => m.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, 10);

        res.json({
            period: periodParam,
            summary: {
                avgPriceNow: avgNow !== null ? parseFloat(avgNow.toFixed(2)) : null,
                avgPriceStart: avgStart !== null ? parseFloat(avgStart.toFixed(2)) : null,
                priceChangePct,
                totalSubmissions: parseInt(totalSubs.rows[0].count),
                activeFigures: parseInt(activeFigures.rows[0].count)
            },
            priceSeries: { labels: priceLabels, datasets: priceDatasets },
            activitySeries: {
                labels: actLabels,
                submissions: actLabels.map(l => subsMap[l] || 0),
                transactions: actLabels.map(l => txMap[l] || 0)
            },
            topMovers: { gainers, losers }
        });
    } catch (err) {
        log.error('Market trends error', { error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.' });
    }
});

module.exports = router;
