'use strict';

const HTML_URL = 'https://www.myfxbook.com/forex-economic-calendar';

// Candidate export endpoint found from old forum references — may or may not
// still be valid, worth testing directly.
const XML_URL =
    'https://www.myfxbook.com/calendar_statement.xml?start=2026-08-10 00:00&end=2026-08-14 00:00&filter=3_USD-EUR-GBP-JPY-CAD-AUD-NZD-CHF-CNY&calPeriod=10';

async function testUrl(label, url) {
    console.log(`\n[Debug] ── Testing ${label} ──────────────────────────────`);
    console.log('[Debug] URL:', url);

    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
        });

        console.log('[Debug] HTTP status:', res.status);

        const text = await res.text();
        console.log('[Debug] Response length:', text.length);

        // Check for Cloudflare / bot-block signals
        const lower = text.toLowerCase();
        if (lower.includes('just a moment') || lower.includes('cf-browser-verification') || lower.includes('challenges.cloudflare.com')) {
            console.log('[Debug] ⚠ BLOCKED — Cloudflare challenge detected.');
        } else if (res.status >= 400) {
            console.log('[Debug] ⚠ Non-200 status — possible block or invalid endpoint.');
        } else {
            console.log('[Debug] ✓ No Cloudflare challenge markers detected.');
        }

        // Check whether real event data is present in the raw response
        // (proves data is server-rendered vs loaded later via JS)
        const hasHighImpact = text.includes('>High<') || text.includes('"High"') || /\bHigh\b/.test(text);
        const hasKnownEvent = text.includes('Non Farm Payrolls') || text.includes('Nonfarm') || text.includes('Balance of Trade');

        console.log('[Debug] Contains "High" impact marker:', hasHighImpact);
        console.log('[Debug] Contains a known event name:', hasKnownEvent);

        console.log('[Debug] First 800 chars of response:');
        console.log(text.slice(0, 800));

    } catch (err) {
        console.log('[Debug] ✗ Request failed:', err.message);
    }
}

async function main() {
    await testUrl('Main calendar page (HTML)', HTML_URL);
    await testUrl('XML export endpoint', XML_URL);
}

main().catch(err => {
    console.error('[Debug] Fatal error:', err.message);
    process.exit(1);
});
