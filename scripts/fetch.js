'use strict';

const fs   = require('fs');
const path = require('path');

const SOURCE_URL  = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const OUTPUT_FILE = path.join(__dirname, '..', 'cache', 'calendar.json');

function getTodayNY() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
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

    const events = raw
        .filter(e => e.impact === 'High')
        .filter(e => typeof e.date === 'string' && e.date.slice(0, 10) === today)
        .map((e, i) => ({
            id:       String(i + 1),
            timeET:   e.date.slice(11, 16),
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
