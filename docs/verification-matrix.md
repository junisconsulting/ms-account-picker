# Verifikationsmatrix

> **Warum manuell:** Der ESTS-Flow lässt sich nicht sinnvoll mocken. Unit-Tests beweisen das Regel-Objekt, diese Matrix beweist das Verhalten. Beides ist nötig, keines ersetzt das andere.

**Pflicht bei jeder Änderung an Regel-Logik oder Permissions** (`CLAUDE.md`, Verify Requirement). Ein nicht eingetragener Durchlauf hat nicht stattgefunden.

## 0. Vorab-Verifikationen (vor dem ersten Zeile Regel-Code)

Diese vier Annahmen tragen das Design. Sie sind manuell und einmalig — solange sie offen sind, wird auf unbelegtem Grund gebaut.

| # | Annahme | Prüfung | Konsequenz bei negativ |
| --- | --- | --- | --- |
| V1 | `prompt=select_account` **plus** `login_hint` wählt das EADM im Picker vor | Authorize-URL eines Portals von Hand um beide Parameter ergänzen, aufrufen | Keine — es bleibt beim Picker ohne Vorauswahl (`open-questions.md` F1). Bei positiv: beide Anforderungen erfüllt, Modus-Design vereinfacht sich |
| ~~V2~~ ✅ | Device Claim (`deviceDetail.deviceId`) bleibt bei `prompt`/`login_hint` erhalten | **Belegt 2026-08-17, manuell im Sign-in-Log, in beiden Modi.** Die Extension bricht die Gerätebindung nicht — das Abbruchkriterium des Gesamtkonzepts ist damit ausgeräumt | — |
| V3 | `login_hint` überschreibt einen PRT für einen **anderen** User | Manuell, wie beim `select_account`-Test | `login_hint`-Modus entfällt ersatzlos, Picker bleibt einziger Modus |
| ~~V4~~ ✅ | `host_permissions` auf `login.microsoftonline.com` reicht für den Redirect aus | **Belegt 2026-08-17 durch `tests/e2e/dnr.e2e.js`** — die Regel greift auch bei Navigation von einem fremden Origin ohne Host-Permission. Das Abbruchkriterium aus `security-review.md` §4 ist damit vorerst abgewendet | — |

### V5 ✅ — Trägt die Portal-Domain im `redirect_uri`? *(belegt 2026-08-17)*

Grundlage der Per-Site-Regeln (`architecture.md` §4.2). Geprüft an echten Authorize-Requests aus dem Zielumfeld.

| Portal | Endpunkt | Tenant-Segment | Domain im `redirect_uri` |
| --- | --- | --- | --- |
| Azure | **v2** `/oauth2/v2.0/authorize` | `/organizations/` | `portal.azure.com` ✅ |
| Defender | **v1** `/oauth2/authorize` | `/common/` | `security.microsoft.com` ✅ |
| Power Automate | **v2** `/oauth2/v2.0/authorize` | `/organizations/` | `make.powerautomate.com` ✅ |

Drei Nebenergebnisse, die mehr wert sind als das Hauptergebnis:

- **A6 ist nicht theoretisch.** Defender nutzt tatsächlich den v1-Endpunkt. Hätte die Regel nur v2 abgedeckt, wäre ein Portal im Zielumfeld stumm ungeschützt geblieben.
- **A5 bestätigt.** Zwei Portale nutzen `/organizations/`, eines `/common/` — das variable Tenant-Segment ist Pflicht, keine Vorsichtsmaßnahme.
- **Der `redirect_uri=`-Anker trägt.** Azure führt `management.core.windows.net` percent-encodiert im `scope`-Parameter, *vor* dem `redirect_uri`. Ohne den Anker hätte eine Site-Regel für diesen Host fälschlich gegriffen.

Als Regressionstest festgeschrieben in `tests/unit/rules.test.js` („the site condition works on the real shape of the target portals") — mit Platzhaltern für Client-IDs, `state` und `nonce`, erhalten bleibt nur die Struktur.

**Grenzen, die daraus folgen und dokumentiert bleiben müssen:** Die Konfiguration ist ein **exakter Host-Vergleich**. `azure.com` deckt `portal.azure.com` nicht ab. Portale, die sich einen `redirect_uri`-Host teilen, sind nicht unterscheidbar. Portale, deren `redirect_uri`-Host nicht der aufgerufene Host ist, fallen durch — bei den drei geprüften ist das nicht der Fall, bei ungeprüften ist es offen.

## 1. Automatisiert abgedeckt (nicht Teil dieser Matrix)

**Unit** (`tests/unit/`, läuft im Verify-Gate):

- UPN → DNR-Regel-Objekt (fester Input, festes erwartetes Objekt)
- RE2-Kompatibilität des generierten `regexFilter`
- kein `resourceTypes` außer `main_frame`
- leere Konfiguration → keine Regel

**E2E** (`tests/e2e/dnr.e2e.js`, geladene Extension gegen einen lokalen Fake-Endpunkt):

`--host-resolver-rules` zeigt den echten Hostnamen `login.microsoftonline.com` auf einen lokalen HTTPS-Server. DNR matcht auf die URL, nicht auf DNS — die getestete Regel ist damit die Produktivregel, nichts ist in der Extension gestubbt. Kein Kontakt zu Microsoft, keine Credentials.

| Abgedeckt | Aussage |
| --- | --- |
| **Z3** | Chromium führt einen Redirect auf eine identische URL nicht aus → kein Loop. Belegt, nicht mehr unterstellt |
| **V4** | Die Regel greift auch bei Navigation von einem fremden Origin, für das keine `host_permissions` bestehen |
| **A1** (Mechanismus) | Ein `authorize`-Request im iframe wird nicht angefasst — `prompt=none` kommt unverändert an |
| **A3** | Frisches Profil → keine Regel; nach `storage.local.clear()` wieder keine |
| **Z5** | v1-Endpunkt (`/oauth2/authorize`) greift |
| Regelakzeptanz | Chromium nimmt den `regexFilter` an (das kann kein Unit-Test beweisen) |
| Parametertreue | Die Parameter des Portals überleben die Transformation unverändert |

**Was die E2E ausdrücklich nicht beweist:** irgendetwas über das echte ESTS, den PRT oder den Device Claim. Der Endpunkt ist ein Attrappe. Z1 (Silent Token Renewal in realen Portalen) bleibt manuell — die E2E zeigt nur, dass die Regel im iframe nicht greift, nicht dass die Token-Erneuerung insgesamt intakt ist.

## 2. Matrix: Portale × Zustände

Pro Kombination drei Fragen:

- **A** — Landet die Anmeldung beim EADM?
- **B** — Ist `deviceDetail.deviceId` im Sign-in-Log gefüllt? *(Device Claim erhalten → die Device-Claim-CA blockt nicht)*
- **C** — Bricht Silent Token Renewal? *(muss **nein** sein)*

Zustände: `S1` keine Session · `S2` EADM-Session aktiv · `S3` Workforce-PRT aktiv · `S4` nach Ablauf des Sign-in-Frequency-Intervalls der Admin-Session-Baseline

| Portal | S1 (A/B/C) | S2 (A/B/C) | S3 (A/B/C) | S4 (A/B/C) |
| --- | --- | --- | --- | --- |
| Azure | | | | |
| Entra | | | | |
| Defender | | | | |
| Fabric | | | | |
| SharePoint Admin | | | | |
| Teams Admin | | | | |
| Intune | | | | |
| Purview | | | | |
| M365 Admin | | | | |

Eintrag pro Zelle: `A✓ B✓ C✓` oder die konkrete Abweichung. Kein `n/a` ohne Begründung.

## 3. Nicht-verhandelbare Zusatzprüfungen

| # | Prüfung | Erwartung |
| --- | --- | --- |
| Z1 🔴 | **Silent Token Renewal** — beliebiges M365-Portal offen lassen, Token-Lebensdauer überschreiten | Keine Re-Auth-Aufforderung, kein `interaction_required` in der Konsole. Bricht das, ist Constraint A1 verletzt |
| Z2 🔴 | **Workforce-Profil-Regression** — dieselbe Extension, im Profil **nie aktiviert** | Keinerlei Verhaltensänderung. `getDynamicRules()` liefert `[]` |
| ~~Z3~~ ✅ | **Redirect-Loop** | **Belegt 2026-08-17 durch die E2E:** Chromium überspringt einen Redirect, der eine identische URL ergäbe. Manuell nur noch stichprobenhaft gegen ein echtes Portal |
| Z4 | **Fremdtenant** (z. B. `<test-tenant>.onmicrosoft.com`) — im Picker-Default | Über die Kontoauswahl erreichbar, ohne Zutun |
| Z4b | **Fremdtenant** — im `login_hint`-Opt-in | Nur über den Toggle in der Options-Seite erreichbar; nach Wiedereinschalten greift die Regel sofort wieder |
| Z5 | **v1-Endpunkt** — Portal mit `/oauth2/authorize` (ohne `v2.0`) | Regel greift |
| Z5b | **`prompt=none` im main_frame** — nicht die iframe-Variante (die deckt A1 ab), sondern eine echte Top-Level-Navigation mit `prompt=none` | Die Regel ersetzt `none` durch `select_account` und macht aus einem stillen einen sichtbaren Flow. Nicht kaputt, aber überraschend. Beobachten, ob im Zielumfeld überhaupt ein Portal das tut — falls ja, ist es eine Design-Entscheidung, kein Bug |
| Z6 | **WS-Federation** — bekannte Lücke (A9) | Regel greift **nicht**, Verhalten unverändert. Dokumentiert, kein Fehler |

## 4. Durchlauf-Protokoll

| Datum | Extension-Version | Edge-Version | Umfang | Ergebnis | Durchgeführt von |
| --- | --- | --- | --- | --- | --- |
| 2026-08-17 | 0.1.0 | _nachzutragen_ | **V5** — Authorize-Requests von Azure, Defender, Power Automate auf die Domain im `redirect_uri` geprüft | 🟢 alle drei tragen sie. Nebenbefund: Defender nutzt den v1-Endpunkt, `/common/` und `/organizations/` kommen beide vor | D. H. + Claude |
| 2026-08-17 | 0.1.0 | n/a (Chrome 152 headless) | E2E erweitert: Per-Site-Modell E1–E9, Konfigurations-UI auf **beiden** Oberflächen | grün, 38/38 | Claude, automatisiert |
| 2026-08-17 | 0.0.0 (unpacked) | _nachzutragen_ | E2E gegen lokalen Fake-Endpunkt: Z3, V4, A1-Mechanismus, A3, Z5, Options-Seite | grün, 14/14 | Claude, automatisiert |
| 2026-08-17 | 0.0.0 (unpacked) | _nachzutragen_ | **V2** — Device Claim im Sign-in-Log, Picker- **und** Hint-Modus | 🟢 `deviceDetail.deviceId` gefüllt, beide Modi | D. H. |

Bei einer eng begrenzten Änderung genügt die betroffene Zeile plus Z1 und Z2. Vor einem Ringwechsel im Rollout: die **vollständige** Matrix.

## 5. Vorgehen je Zelle

1. Edge-Profil mit konfigurierter Extension, Zustand herstellen (Session löschen / EADM anmelden / Workforce-PRT aktiv / SIF ablaufen lassen)
2. Portal-URL aufrufen
3. **A** — angemeldetes Konto in der Portal-UI ablesen
4. **B** — Entra Sign-in-Log → betreffender Eintrag → `deviceDetail.deviceId` gefüllt?
5. **C** — Portal offen lassen, DevTools-Konsole auf `interaction_required` / fehlgeschlagene `prompt=none`-Requests beobachten

Für **B** genügt es nicht, dass die Anmeldung erfolgreich war: solange die Device-Claim-CA im Report-only-Zustand ist, beweist ein erfolgreicher Sign-in nicht, dass der Device Claim vorhanden war. Immer den Log-Eintrag selbst ansehen.
