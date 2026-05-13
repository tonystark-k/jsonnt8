/**
 * scripts/scrape.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Abre um Chromium real via Playwright, acessa o Investing.com,
 * deixa o Cloudflare resolver o challenge, e chama a API interna
 * de dentro do browser (com os cookies já autenticados).
 *
 * Resultado: salva cache/calendar.json no repositório.
 */

'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

// ─── Onde salvar o JSON ──────────────────────────────────────────────────────
const OUTPUT_FILE = path.join(__dirname, '..', 'cache', 'calendar.json');

// ─── Data de hoje em horário de Nova York ────────────────────────────────────
function getTodayNY() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    // ex: "2024-01-15"
}

// ─── Script principal ────────────────────────────────────────────────────────
(async () => {
    const today = getTodayNY();
    console.log(`[Scraper] Data alvo (NY): ${today}`);

    let browser;
    try {
        // 1. Abre Chromium real (headless = sem janela visível, ideal para servidor)
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
            ]
        });

        const context = await browser.newContext({
            userAgent:   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            locale:      'en-US',
            timezoneId:  'America/New_York',
            viewport:    { width: 1440, height: 900 },
        });

        // Esconde o flag "webdriver" que entrega bots ao Cloudflare
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        const page = await context.newPage();

        // 2. Abre o calendário — Cloudflare faz o challenge aqui
        console.log('[Scraper] Abrindo investing.com/economic-calendar …');
        await page.goto('https://www.investing.com/economic-calendar/', {
            waitUntil: 'domcontentloaded',
            timeout:   60_000,
        });

        // 3. Aguarda o Cloudflare liberar (20 segundos é suficiente)
        console.log('[Scraper] Aguardando Cloudflare (20s) …');
        await page.waitForTimeout(20_000);

        const title = await page.title();
        console.log(`[Scraper] Título da página: "${title}"`);

        if (title.toLowerCase().includes('just a moment')) {
            throw new Error('Cloudflare NÃO liberou. Tente aumentar o timeout.');
        }

        // 4. Chama a API interna DO DENTRO do browser — usa os cookies do Cloudflare
        console.log('[Scraper] Chamando API interna do Investing.com …');
        const rawJson = await page.evaluate(async (targetDate) => {
            const body = new URLSearchParams({
                dateFrom:        targetDate,
                dateTo:          targetDate,
                'importance[]':  '3',    // 3 = alto impacto apenas
                submitFilters:   '1',
                limit_from:      '0',
            });

            const res = await fetch('/economic-calendar/Service/getCalendarFilteredData', {
                method:  'POST',
                headers: {
                    'Content-Type':     'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer':          'https://www.investing.com/economic-calendar/',
                },
                body: body.toString(),
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.text();
        }, today);

        // 5. Faz o parse do HTML dentro do JSON
        const events = parseResponse(rawJson, today);
        console.log(`[Scraper] ${events.length} evento(s) encontrado(s).`);

        // 6. Monta o payload e salva
        const payload = {
            dateET:    today,
            fetchedAt: new Date().toISOString(),
            events,
        };

        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`[Scraper] Salvo em: ${OUTPUT_FILE}`);

    } finally {
        if (browser) await browser.close();
    }
})();

// ─── Parser do HTML retornado pela API do Investing.com ──────────────────────
function parseResponse(rawJson, todayStr) {
    // Extrai o blob de HTML do campo "data" do JSON
    const match = rawJson.match(/"data"\s*:\s*"([\s\S]*?)(?<!\\)"/);

    if (!match) {
        // Campo "data" vazio = sem eventos hoje
        if (rawJson.includes('"data":""') || rawJson.includes('"data": ""')) {
            console.log('[Parser] Sem eventos hoje (campo data vazio).');
            return [];
        }
        throw new Error('Campo "data" não encontrado no JSON de resposta.');
    }

    const html = match[1]
        .replace(/\\"/g,  '"')
        .replace(/\\\//g, '/')
        .replace(/\\n/g,  '\n')
        .replace(/\\t/g,  '\t')
        .replace(/\\r/g,  '');

    const events = [];
    const rowRe  = /<tr[^>]*\bevent_attr_id="(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;

    while ((m = rowRe.exec(html)) !== null) {
        const id      = m[1];
        const content = m[2];

        const timeMatch = content.match(/<td[^>]*\btime\b[^>]*>\s*(\d{1,2}:\d{2})\s*<\/td>/i);
        const nameMatch = content.match(/<td[^>]*\bevent\b[^>]*>[\s\S]*?<a[^>]*>\s*([^<]+?)\s*<\/a>/i);
        const currMatch = content.match(/<td[^>]*\bflagCur\b[^>]*>[\s\S]*?([A-Z]{3})\s*<\/td>/i);

        if (!timeMatch || !nameMatch) continue;

        events.push({
            id:       id,
            timeET:   timeMatch[1],          // ex: "08:30" — horário Eastern
            name:     nameMatch[1].trim(),
            currency: currMatch ? currMatch[1] : '—',
            impact:   3,
        });
    }

    return events;
}
