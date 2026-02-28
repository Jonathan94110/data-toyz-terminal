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

module.exports = router;
