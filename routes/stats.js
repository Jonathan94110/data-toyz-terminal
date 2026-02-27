const express = require('express');
const router = express.Router();
const db = require('../db.js');
const log = require('../logger.js');
const { normalizeRow } = require('../helpers/normalize');

// 6. Global Market Overview stats
router.get('/overview', async (req, res) => {
    try {
        const totalIntel = await db.query("SELECT COUNT(*) as count FROM Submissions");
        const uniqueAnalysts = await db.query("SELECT COUNT(DISTINCT author) as count FROM Submissions");
        const avgGrade = await db.query("SELECT AVG((mtsTotal + approvalScore) / 2) as avg FROM Submissions");
        const topFigure = await db.query(`
            SELECT s.targetName, s.targetId, AVG((s.mtsTotal + s.approvalScore) / 2) as avgGrade, COUNT(*) as subs
            FROM Submissions s GROUP BY s.targetName, s.targetId
            ORDER BY avgGrade DESC LIMIT 1
        `);
        const totalTargets = await db.query("SELECT COUNT(*) as count FROM Figures");

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
            } : null
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
