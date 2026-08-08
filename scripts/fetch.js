/**
 * scripts/fetch.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Downloads high-impact economic events from ForexFactory's public JSON feed.
 *
 * This feed is officially intended for exactly this use case — it's the same
 * feed used by thousands of MetaTrader (MT4/MT5) news-trading EAs. No login,
 * no cookies, no Cloudflare challenge, no browser automation required.
 *
 * Source: https://nfs.faireconomy.media/ff_calendar_thisweek.json
 * Rate limit: 2 requests / 5 minutes (irrelevant — we fetch once/day)
 *
 * IMPORTANT: the "date" field in the feed is already an ISO 8601 timestamp
 * with the correct Eastern Time UTC offset baked in (-04:00 in summer/EDT,
 * -05:00 in winter/EST). That means we do NOT need to do any timezone math
 * ourselves — the feed already handles the DST transition automatically.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SOURCE_URL  = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const OUTPUT_FILE = path.join(__dirname, '..', 'cache', 'calendar.json');

// ─── Today's date in Eastern time (matches the feed's own timezone) ─────────
function getTodayNY() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    // e.g. "2026-08-07"
}

async function main() {
    const today = getTodayNY();
    console.log(`[Fetch] Target date (Eastern): ${today}`);

    console.log('[Fetch] Downloading ForexFactory calendar feed…');
    const res = await fetch(SOURCE_URL, {
        headers: { 'User-Agent': 'NinjaTrader8-CalendarBot/1.0' }
    });

    if (!res.ok) {
        throw new Error(`Feed returned HTTP ${res.status}`);
    }

    const raw = await res.json();
    console.log(`[Fetch] Feed returned ${raw.length} total event(s) for the week.`);

    // Keep only high-impact events happening today (Eastern time)
    const events = raw
        .filter(e => e.impact === 'High')
        .filter(e => typeof e.date === 'string' && e.date.slice(0, 10) === today)
        .map((e, i) => ({
            id:       String(i + 1),
            timeET:   e.date.slice(11, 16),   // "HH:mm" — already Eastern local time
            name:     e.title,
            currency: e.country,
            impact:   3,
        }));

    console.log(`[Fetch] ${events.length} high-impact event(s) for today.`);

    const payload = {
        dateET:    today,
        fetchedAt: new Date().toISOString(),
        events,
    };

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[Fetch] Saved to ${OUTPUT_FILE}`);
}

main().catch(err => {
    console.error('[Fetch] Error:', err.message);
    process.exit(1);
});
