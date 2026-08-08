'use strict';

const URL_ =
    'https://ec.forexprostools.com/?columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&features=datepicker,timezone&calType=day';

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
    console.log('[Debug] Total HTML length:', html.length);

    // Try to find a well-known high-impact event name to inspect the markup around it
    const candidates = ['Nonfarm Payrolls', 'Non-Farm', 'Interest Rate Decision', 'CPI'];
    let idx = -1;
    let found = '';

    for (const name of candidates) {
        idx = html.indexOf(name);
        if (idx !== -1) { found = name; break; }
    }

    if (idx === -1) {
        console.log('[Debug] None of the candidate event names were found.');
        console.log('[Debug] Dumping first 3000 chars of the HTML instead:');
        console.log(html.slice(0, 3000));
    } else {
        console.log(`[Debug] Found "${found}" at index ${idx}.`);
        console.log('[Debug] Dumping 1800 chars BEFORE it (this usually contains the <tr> row markup, including the impact icon):');
        console.log(html.slice(Math.max(0, idx - 1800), idx + 200));
    }

    // Also specifically hunt for the word "Volatility" which we know appears in
    // the legend — let's see if it also appears per-row (title attributes etc.)
    console.log('\n[Debug] ── Occurrences of "Volatility" in the HTML ──────────────');
    let count = 0;
    let searchIdx = 0;
    while (count < 5) {
        const found2 = html.indexOf('Volatility', searchIdx);
        if (found2 === -1) break;
        console.log(`[Debug] Match #${count + 1} at ${found2}:`);
        console.log(html.slice(Math.max(0, found2 - 200), found2 + 60));
        console.log('---');
        searchIdx = found2 + 1;
        count++;
    }
}

main().catch(err => {
    console.error('[Debug] Error:', err.message);
    process.exit(1);
});
