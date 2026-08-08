/**
 * scripts/fetch.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Downloads high-impact (3-star) United States economic events from
 * TradingEconomics' public calendar page.
 *
 * Unlike Investing.com and MyFxBook, this page is NOT behind a Cloudflare
 * bot-challenge — a plain HTTP GET returns the full HTML with real data.
 *
 * Filtering:
 *   - Country:  United States only  (currency is hardcoded to "USD")
 *   - Impact:   "calendar-date-3" class only (the site's 3-star / highest
 *               impact marker — confirmed against a real Non-Farm Payrolls row)
 *
 * Timezone handling:
 *   TradingEconomics displays times in UTC by default. This script converts
 *   each UTC timestamp to US Eastern time (DST-aware, via Node's built-in
 *   Intl/timeZone support) before filtering for "today".
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SOURCE_URL  = 'https://tradingeconomics.com/calendar';
const OUTPUT_FILE = path.join(__dirname, '..', 'cache', 'calendar.json');

// ─── Today's date in Eastern time ────────────────────────────────────────────
function getTodayNY() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    // e.g. "2026-08-07"
}

// ─── Convert a UTC date+time (as shown on the page) to Eastern date+time ────
function utcToEastern(dateUTC, timeUTC) {
    const m = timeUTC.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!m) return null;

    let hours = parseInt(m[1], 10);
    const minutes = m[2];
    const ampm = m[3].toUpperCase();

    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const hh = String(hours).padStart(2, '0');
    const utcISO = `${dateUTC}T${hh}:${minutes}:00Z`;
    const utcDate = new Date(utcISO);
    if (isNaN(utcDate.getTime())) return null;

    const dateET = utcDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const timeET = utcDate.toLocaleTimeString('en-GB', {
        timeZone: 'America/New_York',
        hour:     '2-digit',
        minute:   '2-digit',
        hour12:   false,
    });

    return { dateET, timeET };
}

async function main() {
    const todayET = getTodayNY();
    console.log(`[Fetch] Target date (Eastern): ${todayET}`);

    console.log('[Fetch] Downloading TradingEconomics calendar…');
    const res = await fetch(SOURCE_URL, {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
    });

    if (!res.ok) {
        throw new Error(`TradingEconomics returned HTTP ${res.status}`);
    }

    const html = await res.text();
    console.log(`[Fetch] Downloaded ${html.length} chars.`);

    if (html.toLowerCase().includes('just a moment')) {
        throw new Error('Blocked by Cloudflare challenge.');
    }

    // ── Find every row for United States events ─────────────────────────────
    const rowStartRe =
        /<tr\s+data-url="[^"]*"\s+data-id="(\d+)"\s+data-country="united states"[^>]*>/g;

    let usRowCount = 0;
    let match;
    const events = [];

    while ((match = rowStartRe.exec(html)) !== null) {
        usRowCount++;
        const id = match[1];
        const windowHtml = html.slice(match.index, match.index + 1500);

        // Date + impact level + time, e.g.:
        //   class=' 2026-08-07'> <span class="event-46 calendar-date-3"> 12:30 PM </span>
        const dtMatch = windowHtml.match(
            /class='\s*(\d{4}-\d{2}-\d{2})'[\s\S]*?calendar-date-(\d)"[\s\S]*?>\s*(\d{1,2}:\d{2}\s*[AP]M)\s*</i
        );
        if (!dtMatch) continue;

        const [, dateUTC, impactLevel, timeUTC] = dtMatch;
        if (impactLevel !== '3') continue;   // only highest-impact (3-star) events

        // Event name, e.g.: <a class='calendar-event' href='...'>Non Farm Payrolls</a>
        const nameMatch = windowHtml.match(/class='calendar-event'[^>]*>([^<]+)</);
        if (!nameMatch) continue;

        const converted = utcToEastern(dateUTC, timeUTC);
        if (!converted) continue;

        // Only keep events landing on "today" once converted to Eastern time
        if (converted.dateET !== todayET) continue;

        events.push({
            id,
            timeET:   converted.timeET,
            name:     nameMatch[1].trim(),
            currency: 'USD',
            impact:   3,
        });
    }

    console.log(`[Fetch] Found ${usRowCount} United States row(s) total on the page.`);
    console.log(`[Fetch] ${events.length} high-impact USD event(s) for today.`);

    if (usRowCount === 0) {
        // This should essentially never happen — signals a page-structure change.
        throw new Error('No United States rows found at all — page markup may have changed.');
    }

    const payload = {
        dateET:    todayET,
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
