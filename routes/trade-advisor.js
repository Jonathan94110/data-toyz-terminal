/**
 * Trade Advisor — Analyze potential trades using market data + community ratings.
 * POST /api/trade-advisor/analyze
 *
 * Computes a Trade Value Index (TVI) per figure, then compares both sides
 * of the trade to produce a verdict: Accept, Fair Trade, Slightly Unbalanced,
 * Needs Sweetener, High Risk, or Pass.
 */
const express = require('express');
const router = express.Router();
const db = require('../db.js');
const log = require('../logger.js');
const { requireAuth } = require('../middleware/auth');

// ── helpers ──────────────────────────────────────────────

function getDateRanges() {
    const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const d60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    return { d30, d60 };
}

/**
 * Fetch all data needed to score a single figure.
 * Reuses the same query patterns as /figures/:id/community-metrics
 * and /figures/:id/market-intel endpoints in figures.js.
 */
async function fetchFigureData(figureId) {
    // 1. Figure basics
    const figRes = await db.query(
        "SELECT id, name, brand, classtie, line, msrp FROM Figures WHERE id = $1",
        [figureId]
    );
    if (figRes.rows.length === 0) return null;
    const fig = figRes.rows[0];

    // 2. Submissions — community metrics, tradeRating, recommendations
    const subRes = await db.query(
        "SELECT jsondata, mtstotal, approvalscore, ownership_status, author FROM Submissions WHERE targetId = $1",
        [figureId]
    );
    const subs = subRes.rows;
    let tradeRatingSum = 0, tradeRatingCount = 0;
    let yesVotes = 0, noVotes = 0;
    let mtsSum = 0, approvalSum = 0;
    const inHandAuthors = new Set();

    for (const row of subs) {
        mtsSum += parseFloat(row.mtstotal || 0);
        approvalSum += parseFloat(row.approvalscore || 0);
        if ((row.ownership_status || 'in_hand') === 'in_hand') {
            inHandAuthors.add(row.author);
        }
        try {
            const data = JSON.parse(row.jsondata || '{}');
            if (data.tradeRating && parseFloat(data.tradeRating) > 0) {
                tradeRatingSum += parseFloat(data.tradeRating);
                tradeRatingCount++;
            }
            if (data.recommendation === 'yes') yesVotes++;
            if (data.recommendation === 'no') noVotes++;
        } catch (e) { log.warn('Skipped malformed jsonData in submission', { submissionId: row.id }); }
    }

    const reviewCount = subs.length;
    const overallAvg = reviewCount > 0
        ? parseFloat(((mtsSum / reviewCount + approvalSum / reviewCount) / 2).toFixed(1))
        : null;
    const tradeRating = tradeRatingCount > 0
        ? parseFloat((tradeRatingSum / tradeRatingCount).toFixed(1))
        : null;
    const recommendPct = (yesVotes + noVotes) > 0
        ? parseFloat(((yesVotes / (yesVotes + noVotes)) * 100).toFixed(0))
        : null;

    // 3. Market intel — rolling 30d, prior 30d (for trend), lifetime
    const { d30, d60 } = getDateRanges();

    const [r30Res, rPrior30Res, rAllRes] = await Promise.all([
        db.query(
            `SELECT AVG(price_avg) as avg, MAX(COALESCE(price_high, price_avg)) as high,
                    MIN(COALESCE(price_low, price_avg)) as low, COUNT(*) as count
             FROM MarketTransactions WHERE figure_id = $1 AND created_at >= $2 AND price_type = 'secondary_market'`,
            [figureId, d30]
        ),
        db.query(
            `SELECT AVG(price_avg) as avg, COUNT(*) as count
             FROM MarketTransactions WHERE figure_id = $1 AND created_at >= $2 AND created_at < $3 AND price_type = 'secondary_market'`,
            [figureId, d60, d30]
        ),
        db.query(
            `SELECT AVG(price_avg) as avg, MAX(COALESCE(price_high, price_avg)) as high,
                    MIN(COALESCE(price_low, price_avg)) as low, COUNT(*) as count
             FROM MarketTransactions WHERE figure_id = $1 AND price_type = 'secondary_market'`,
            [figureId]
        )
    ]);

    const r30 = r30Res.rows[0];
    const rPrior30 = rPrior30Res.rows[0];
    const rAll = rAllRes.rows[0];

    const totalTx = parseInt(rAll.count) || 0;
    const avg30 = r30.avg ? parseFloat(parseFloat(r30.avg).toFixed(2)) : null;
    const avgPrior30 = rPrior30.avg ? parseFloat(parseFloat(rPrior30.avg).toFixed(2)) : null;
    const avgLifetime = rAll.avg ? parseFloat(parseFloat(rAll.avg).toFixed(2)) : null;
    const high = rAll.high ? parseFloat(parseFloat(rAll.high).toFixed(2)) : null;
    const low = rAll.low ? parseFloat(parseFloat(rAll.low).toFixed(2)) : null;
    const volatility = (high != null && low != null) ? parseFloat((high - low).toFixed(2)) : null;
    const confidence = totalTx >= 10 ? 'high' : totalTx >= 3 ? 'medium' : 'low';

    // Price change 30d
    let priceChange30d = null;
    if (avg30 != null && avgPrior30 != null && avgPrior30 > 0) {
        priceChange30d = parseFloat((((avg30 - avgPrior30) / avgPrior30) * 100).toFixed(1));
    }

    // Best available market price: 30d avg → lifetime avg → MSRP → $30
    const marketPrice = avg30 || avgLifetime || (fig.msrp ? parseFloat(fig.msrp) : null) || 30;
    const priceSource = avg30 ? '30d_avg' : avgLifetime ? 'lifetime_avg' : fig.msrp ? 'msrp' : 'default';

    // Trend label
    let trend = 'stable';
    if (priceChange30d != null) {
        if (priceChange30d > 5) trend = 'rising';
        else if (priceChange30d < -5) trend = 'falling';
    }

    return {
        id: fig.id,
        name: fig.name,
        brand: fig.brand,
        classTie: fig.classtie,
        line: fig.line,
        msrp: fig.msrp ? parseFloat(fig.msrp) : null,
        marketPrice,
        priceSource,
        tradeRating,
        overallAvg,
        reviewCount,
        recommendPct,
        priceChange30d,
        trend,
        volatility,
        confidence,
        uniqueOwnerCount: inHandAuthors.size,
        totalTx
    };
}

/**
 * Compute Trade Value Index (TVI) for a figure, 0-100 scale.
 * @param {object} fig  - figure data from fetchFigureData()
 * @param {number} maxPrice - highest market price across ALL figures in the trade
 */
function computeTVI(fig, maxPrice) {
    // Market Value (35%) — normalized relative to the most expensive figure
    const effectiveMax = Math.max(maxPrice, 1);
    const marketScore = Math.min(100, (fig.marketPrice / effectiveMax) * 100);

    // Quality (25%) — tradeRating (1-5) or overallAvg as fallback
    let qualityScore = 50; // neutral default
    if (fig.tradeRating != null) {
        qualityScore = (fig.tradeRating / 5) * 100;
    } else if (fig.overallAvg != null) {
        qualityScore = fig.overallAvg; // already 0-100
    }

    // Trend (15%) — map priceChange30d to 0-100
    let trendScore = 50; // neutral default
    if (fig.priceChange30d != null) {
        // Clamp between -30 and +30 and map to 20-80 range
        const clamped = Math.max(-30, Math.min(30, fig.priceChange30d));
        trendScore = 50 + (clamped / 30) * 30; // range: 20-80
    }

    // Community (15%) — review count + recommendation %
    let communityScore = 0;
    communityScore += Math.min(60, fig.reviewCount * 8);
    if (fig.recommendPct != null) {
        communityScore += (fig.recommendPct / 100) * 40;
    }
    communityScore = Math.min(100, communityScore);

    // Data Confidence (10%) — transaction count + unique owners
    let confidenceScore = fig.confidence === 'high' ? 80 : fig.confidence === 'medium' ? 50 : 20;
    confidenceScore += Math.min(20, fig.uniqueOwnerCount * 2);
    confidenceScore = Math.min(100, confidenceScore);

    const tvi = (0.35 * marketScore)
              + (0.25 * qualityScore)
              + (0.15 * trendScore)
              + (0.15 * communityScore)
              + (0.10 * confidenceScore);

    return parseFloat(tvi.toFixed(1));
}

/**
 * Determine the verdict from the blended delta and modifiers.
 */
function determineVerdict(blendedScore, starDelta, lowDataRatio, figures) {
    let verdict, verdictCode;

    if (blendedScore > 25) {
        verdict = 'Accept'; verdictCode = 'accept';
    } else if (blendedScore > -10) {
        verdict = 'Fair Trade'; verdictCode = 'fair';
    } else if (blendedScore > -25) {
        verdict = 'Slightly Unbalanced'; verdictCode = 'unbalanced';
    } else if (blendedScore > -40) {
        verdict = 'Needs Sweetener'; verdictCode = 'sweetener';
    } else {
        verdict = 'Pass'; verdictCode = 'pass';
    }

    // Modifier: quality imbalance in fair-trade zone
    let qualityImbalance = false;
    if (starDelta > 1.5) {
        qualityImbalance = true;
        if (verdictCode === 'fair') {
            verdict = 'Slightly Unbalanced';
            verdictCode = 'unbalanced';
        }
    }

    // Modifier: low data risk
    const highRisk = lowDataRatio > 0.5;
    if (highRisk) {
        verdict += ', High Risk';
    }

    // Warnings
    const warnings = [];
    for (const fig of figures) {
        if (fig.priceChange30d != null && fig.priceChange30d < -15) {
            warnings.push(`${fig.name} has ${fig.priceChange30d.toFixed(0)}% 30d momentum (falling value)`);
        }
        if (fig.priceSource === 'default') {
            warnings.push(`${fig.name} has no price data — using $30 default`);
        }
    }
    if (qualityImbalance) {
        warnings.push('Quality imbalance detected — star ratings differ significantly between sides');
    }

    // Overall confidence
    const avgConfidence = lowDataRatio > 0.5 ? 'low' : lowDataRatio > 0.2 ? 'medium' : 'high';

    return { verdict, verdictCode, qualityImbalance, highRisk, warnings, confidence: avgConfidence };
}


// ── POST /analyze ────────────────────────────────────────

router.post('/analyze', requireAuth, async (req, res) => {
    try {
        const { yourSide, theirSide } = req.body;

        // Validate input
        if (!Array.isArray(yourSide) || !Array.isArray(theirSide)) {
            return res.status(400).json({ error: 'yourSide and theirSide must be arrays of figure IDs.' });
        }
        if (yourSide.length === 0 || theirSide.length === 0) {
            return res.status(400).json({ error: 'Each side must have at least 1 figure.' });
        }
        if (yourSide.length > 5 || theirSide.length > 5) {
            return res.status(400).json({ error: 'Maximum 5 figures per side.' });
        }

        const allIds = [...yourSide, ...theirSide].map(Number);
        if (allIds.some(id => isNaN(id) || id <= 0)) {
            return res.status(400).json({ error: 'All IDs must be positive integers.' });
        }
        const uniqueIds = new Set(allIds);
        if (uniqueIds.size !== allIds.length) {
            return res.status(400).json({ error: 'Duplicate figures found. Each figure can only appear once.' });
        }

        // Fetch data for all figures in parallel
        const yourData = await Promise.all(yourSide.map(id => fetchFigureData(Number(id))));
        const theirData = await Promise.all(theirSide.map(id => fetchFigureData(Number(id))));

        // Check for missing figures
        const missingYour = yourData.findIndex(f => f === null);
        const missingTheir = theirData.findIndex(f => f === null);
        if (missingYour !== -1) {
            return res.status(404).json({ error: `Figure ID ${yourSide[missingYour]} not found.` });
        }
        if (missingTheir !== -1) {
            return res.status(404).json({ error: `Figure ID ${theirSide[missingTheir]} not found.` });
        }

        // Find max market price across all figures for TVI normalization
        const allFigures = [...yourData, ...theirData];
        const maxPrice = Math.max(...allFigures.map(f => f.marketPrice));

        // Compute TVI for each figure
        for (const fig of allFigures) {
            fig.tvi = computeTVI(fig, maxPrice);
        }

        // Side totals
        const sumSide = (figures) => {
            const totalValue = figures.reduce((s, f) => s + f.marketPrice, 0);
            const avgTvi = figures.reduce((s, f) => s + f.tvi, 0) / figures.length;

            // Average star rating — use tradeRating where available, overallAvg/20 as fallback
            const ratings = figures.map(f => {
                if (f.tradeRating != null) return f.tradeRating;
                if (f.overallAvg != null) return f.overallAvg / 20; // convert 0-100 to 0-5
                return 2.5; // neutral
            });
            const avgRating = ratings.reduce((s, r) => s + r, 0) / ratings.length;

            return {
                totalValue: parseFloat(totalValue.toFixed(2)),
                avgTvi: parseFloat(avgTvi.toFixed(1)),
                avgRating: parseFloat(avgRating.toFixed(2))
            };
        };

        const yourTotals = sumSide(yourData);
        const theirTotals = sumSide(theirData);

        // Deltas (positive = their side is more valuable = good for you)
        const avgDollar = (yourTotals.totalValue + theirTotals.totalValue) / 2 || 1;
        const dollarDelta = theirTotals.totalValue - yourTotals.totalValue;
        const dollarDeltaPct = parseFloat(((dollarDelta / avgDollar) * 100).toFixed(1));

        const avgTvi = (yourTotals.avgTvi + theirTotals.avgTvi) / 2 || 1;
        const tviDelta = parseFloat((theirTotals.avgTvi - yourTotals.avgTvi).toFixed(1));
        const tviDeltaPct = parseFloat(((tviDelta / avgTvi) * 100).toFixed(1));

        const qualityDelta = parseFloat((theirTotals.avgRating - yourTotals.avgRating).toFixed(2));
        const starDelta = Math.abs(qualityDelta);

        const blendedScore = parseFloat((0.6 * dollarDeltaPct + 0.4 * tviDeltaPct).toFixed(1));

        // Low data ratio
        const lowDataCount = allFigures.filter(f => f.confidence === 'low').length;
        const lowDataRatio = lowDataCount / allFigures.length;

        // Determine verdict
        const { verdict, verdictCode, qualityImbalance, warnings, confidence } =
            determineVerdict(blendedScore, starDelta, lowDataRatio, allFigures);

        // Build response
        const formatFigure = (f) => ({
            id: f.id,
            name: f.name,
            brand: f.brand,
            classTie: f.classTie,
            line: f.line,
            marketPrice: f.marketPrice,
            priceSource: f.priceSource,
            tradeRating: f.tradeRating,
            overallAvg: f.overallAvg,
            tvi: f.tvi,
            trend: f.trend,
            confidence: f.confidence,
            reviews: f.reviewCount,
            recommendPct: f.recommendPct,
            priceChange30d: f.priceChange30d,
            volatility: f.volatility
        });

        res.json({
            verdict,
            verdictCode,
            confidence,
            warnings,
            qualityImbalance,
            yourSide: {
                figures: yourData.map(formatFigure),
                totalValue: yourTotals.totalValue,
                avgRating: yourTotals.avgRating,
                avgTvi: yourTotals.avgTvi
            },
            theirSide: {
                figures: theirData.map(formatFigure),
                totalValue: theirTotals.totalValue,
                avgRating: theirTotals.avgRating,
                avgTvi: theirTotals.avgTvi
            },
            breakdown: {
                dollarDelta: parseFloat(dollarDelta.toFixed(2)),
                dollarDeltaPct,
                tviDelta,
                tviDeltaPct,
                qualityDelta,
                blendedScore
            }
        });

    } catch (err) {
        log.error('Trade Advisor analysis error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred during trade analysis.', refId: req.requestId });
    }
});

module.exports = router;
