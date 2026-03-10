// helpers/market-signals.js — Auto-calculate BUY/SELL/HOLD/WATCH signals for figures
const db = require('../db.js');
const log = require('../logger.js');

function scoreFromBrackets(value, brackets) {
    for (const [threshold, score] of brackets) {
        if (value >= threshold) return score;
    }
    return brackets[brackets.length - 1][1];
}

async function calculateMarketSignal(figureId) {
    const now = Date.now();
    const d7  = new Date(now -  7 * 86400000).toISOString();
    const d30 = new Date(now - 30 * 86400000).toISOString();
    const d60 = new Date(now - 60 * 86400000).toISOString();

    const [figRow, priceData, subData] = await Promise.all([
        db.query("SELECT msrp FROM Figures WHERE id = $1", [figureId]),
        db.query(`
            SELECT
                AVG(CASE WHEN created_at >= $1 THEN price_avg END) as avg_30d,
                AVG(CASE WHEN created_at >= $2 AND created_at < $1 THEN price_avg END) as avg_prior_30d,
                (SELECT price_avg FROM MarketTransactions
                 WHERE figure_id = $3 AND price_type = 'secondary_market'
                 ORDER BY created_at DESC LIMIT 1) as latest_price
            FROM MarketTransactions
            WHERE figure_id = $3 AND price_type = 'secondary_market'
        `, [d30, d60, figureId]),
        db.query(`
            SELECT
                COUNT(*) as total,
                COUNT(CASE WHEN date >= $1 THEN 1 END) as count_7d,
                AVG((mtsTotal + approvalScore) / 2) as avg_grade
            FROM Submissions WHERE targetId = $2
        `, [d7, figureId])
    ]);

    const totalSubs = parseInt(subData.rows[0]?.total) || 0;
    if (totalSubs < 2) return null; // Insufficient data

    // 1. Price trend score (35% weight)
    const avg30 = priceData.rows[0]?.avg_30d ? parseFloat(priceData.rows[0].avg_30d) : null;
    const avgPrior = priceData.rows[0]?.avg_prior_30d ? parseFloat(priceData.rows[0].avg_prior_30d) : null;
    const priceChange = (avg30 && avgPrior && avgPrior !== 0)
        ? ((avg30 - avgPrior) / avgPrior) * 100 : 0;
    const priceTrendScore = scoreFromBrackets(priceChange, [[15, 90], [5, 70], [-5, 50], [-15, 30], [-Infinity, 10]]);

    // 2. Grade score (25% weight)
    const avgGrade = parseFloat(subData.rows[0]?.avg_grade) || 50;
    const gradeScore = scoreFromBrackets(avgGrade, [[80, 90], [65, 70], [50, 50], [35, 30], [-Infinity, 10]]);

    // 3. Volume score (20% weight)
    const subs7d = parseInt(subData.rows[0]?.count_7d) || 0;
    const volumeScore = scoreFromBrackets(subs7d, [[5, 90], [3, 70], [1, 50], [-Infinity, 20]]);

    // 4. MSRP comparison score (20% weight, redistributed if no MSRP)
    const msrp = figRow.rows[0]?.msrp ? parseFloat(figRow.rows[0].msrp) : null;
    const latestPrice = priceData.rows[0]?.latest_price ? parseFloat(priceData.rows[0].latest_price) : avg30;

    let composite;
    if (msrp && msrp > 0 && latestPrice) {
        const ratio = latestPrice / msrp;
        // Lower ratio = better value = higher score
        const msrpScore = scoreFromBrackets(1 / ratio, [[1 / 0.85, 90], [1.0, 70], [1 / 1.15, 50], [1 / 1.30, 30], [-Infinity, 10]]);
        composite = (priceTrendScore * 0.35) + (gradeScore * 0.25) + (volumeScore * 0.20) + (msrpScore * 0.20);
    } else {
        // No MSRP — redistribute weight
        composite = (priceTrendScore * 0.45) + (gradeScore * 0.30) + (volumeScore * 0.25);
    }

    if (composite >= 72) return 'BUY';
    if (composite >= 55) return 'HOLD';
    if (composite >= 38) return 'WATCH';
    return 'SELL';
}

async function updateSignalForFigure(figureId) {
    try {
        const signal = await calculateMarketSignal(figureId);
        await db.query(
            "UPDATE Figures SET market_signal = $1, market_signal_updated_at = $2 WHERE id = $3",
            [signal, new Date().toISOString(), figureId]
        );
        return signal;
    } catch (e) {
        log.error('Market signal update failed', { figureId, error: e.message });
        return null;
    }
}

module.exports = { calculateMarketSignal, updateSignalForFigure };
