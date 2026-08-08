'use strict';

const URL_ = 'https://tradingeconomics.com/calendar';

async function main() {
    console.log('[Debug] Fetching', URL_);

    const res = await fetch(URL_, {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
    });

    console.log('[Debug] HTTP status:', res.status);

    const html = await res.text();
    console.log('[Debug] Response length:', html.length);

    const lower = html.toLowerCase();
    if (lower.includes('just a moment') || lower.includes('challenges.cloudflare.com')) {
        console.log('[Debug] ⚠ BLOCKED — Cloudflare challenge detected.');
        console.log(html.slice(0, 1000));
        return;
    }
    console.log('[Debug] ✓ No Cloudflare challenge markers detected.');

    // Look for a well-known HIGH-impact event to inspect surrounding markup
    const candidates = ['Non Farm Payrolls', 'Interest Rate Decision', 'Unemployment Rate'];
    let idx = -1;
    let found = '';

    for (const name of candidates) {
        idx = html.indexOf(name);
        if (idx !== -1) { found = name; break; }
    }

    if (idx === -1) {
        console.log('[Debug] None of the candidate event names were found in raw HTML.');
        console.log('[Debug] Dumping first 3000 chars instead:');
        console.log(html.slice(0, 3000));
    } else {
        console.log(`[Debug] Found "${found}" at index ${idx}.`);
        console.log('[Debug] Dumping 1200 chars BEFORE it (should contain the <tr> row markup with any color/importance class):');
        console.log(html.slice(Math.max(0, idx - 1200), idx + 300));
    }
}

main().catch(err => {
    console.error('[Debug] Error:', err.message);
    process.exit(1);
});
