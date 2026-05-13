// ═══════════════════════════════════════════════════════════════════════════
//  NinjaTrader 8 — Patch para ler o calendário do GitHub (gratuito)
// ═══════════════════════════════════════════════════════════════════════════
//
//  COMO APLICAR:
//    1. Crie o repositório no GitHub (veja README.md)
//    2. Substitua SEU_USUARIO e SEU_REPOSITORIO abaixo
//    3. Cole os dois métodos abaixo no seu arquivo de strategy,
//       substituindo o FetchEconomicCalendar() original
//    4. Recompile no NinjaTrader
//
//  O que muda: em vez de chamar o Investing.com diretamente,
//  o NT8 lê um arquivo JSON estático hospedado no GitHub.
//  Rápido, gratuito, sem bloqueio, sem servidor.
// ═══════════════════════════════════════════════════════════════════════════

// ── PASSO 1: adicione esta constante junto com os outros campos da classe ───

        // URL do arquivo JSON gerado pelo GitHub Actions
        // Troque SEU_USUARIO e SEU_REPOSITORIO pelo seu GitHub real
        private const string CALENDAR_JSON_URL =
            "https://raw.githubusercontent.com/SEU_USUARIO/SEU_REPOSITORIO/main/cache/calendar.json";


// ── PASSO 2: substitua FetchEconomicCalendar() por este ────────────────────

        private void FetchEconomicCalendar()
        {
            lastCalendarFetch = DateTime.Now;

            try
            {
                // Lê o arquivo JSON diretamente do GitHub (sem autenticação)
                var response = CalendarHttp.GetAsync(CALENDAR_JSON_URL)
                    .GetAwaiter().GetResult();

                if (!response.IsSuccessStatusCode)
                {
                    Print(String.Format("[Calendar] GitHub retornou HTTP {0}.",
                        (int)response.StatusCode));
                    return;
                }

                string json = response.Content.ReadAsStringAsync()
                    .GetAwaiter().GetResult();

                // Extrai a data Eastern do JSON
                var dateMatch = System.Text.RegularExpressions.Regex.Match(
                    json, "\"dateET\"\\s*:\\s*\"([^\"]+)\"");

                if (!dateMatch.Success)
                {
                    Print("[Calendar] JSON inválido ou arquivo ainda não gerado pelo GitHub.");
                    return;
                }

                string dateET  = dateMatch.Groups[1].Value;
                string todayET = DateTime.UtcNow.AddHours(-5).ToString("yyyy-MM-dd"); // aproximado

                if (dateET == "1970-01-01")
                {
                    Print("[Calendar] Arquivo placeholder — aguarde o primeiro run do GitHub Actions.");
                    return;
                }

                // Parse dos eventos
                ParseAndStoreCalendarJson(json, dateET);
            }
            catch (TaskCanceledException) { Print("[Calendar] Timeout ao buscar JSON do GitHub."); }
            catch (Exception ex)          { Print("[Calendar] Erro: " + ex.Message); }
        }


// ── PASSO 3: adicione este método ao lado do existente ─────────────────────

        private void ParseAndStoreCalendarJson(string json, string dateET)
        {
            var newEvents = new List<EconomicEvent>();

            // Percorre cada objeto de evento no array "events"
            // Formato: { "id":"...", "timeET":"HH:mm", "name":"...", "currency":"..." }
            var pattern = new System.Text.RegularExpressions.Regex(
                "\\{[^{}]*\"id\"\\s*:\\s*\"(\\d+)\"[^{}]*\"timeET\"\\s*:\\s*\"([^\"]+)\"" +
                "[^{}]*\"name\"\\s*:\\s*\"([^\"]+)\"[^{}]*\"currency\"\\s*:\\s*\"([^\"]+)\"[^{}]*\\}"
            );

            foreach (System.Text.RegularExpressions.Match m in pattern.Matches(json))
            {
                string id       = m.Groups[1].Value;
                string timeET   = m.Groups[2].Value;   // "08:30" Eastern
                string name     = m.Groups[3].Value;
                string currency = m.Groups[4].Value;

                DateTime etTime;
                if (!DateTime.TryParseExact(
                        dateET + " " + timeET,
                        "yyyy-MM-dd HH:mm",
                        System.Globalization.CultureInfo.InvariantCulture,
                        System.Globalization.DateTimeStyles.None,
                        out etTime)) continue;

                // EasternToLocal() já existe na sua strategy — não muda nada
                DateTime localTime = EasternToLocal(etTime);

                newEvents.Add(new EconomicEvent
                {
                    Id       = id,
                    Time     = localTime,
                    Name     = name,
                    Currency = currency,
                    Notified = localTime <= DateTime.Now
                });
            }

            lock (calendarLock) { todayEvents = newEvents; }
            Print(String.Format("[Calendar] {0} evento(s) de alto impacto para {1} (via GitHub).",
                newEvents.Count, dateET));
        }
