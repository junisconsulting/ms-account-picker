# Verifikationsmatrix

> **Warum manuell:** Der ESTS-Flow lässt sich nicht sinnvoll mocken. Unit-Tests beweisen das Regel-Objekt, diese Matrix beweist das Verhalten. Beides ist nötig, keines ersetzt das andere.

**Pflicht bei jeder Änderung an Regel-Logik oder Permissions** (`CLAUDE.md`, Verify Requirement). Ein nicht eingetragener Durchlauf hat nicht stattgefunden.

## 0. Vorab-Verifikationen (vor dem ersten Zeile Regel-Code)

Diese vier Annahmen tragen das Design. Sie sind manuell und einmalig — solange sie offen sind, wird auf unbelegtem Grund gebaut.

| # | Annahme | Prüfung | Konsequenz bei negativ |
| --- | --- | --- | --- |
| V1 | `prompt=select_account` **plus** `login_hint` wählt das EADM im Picker vor | Authorize-URL eines Portals von Hand um beide Parameter ergänzen, aufrufen | Keine — es bleibt beim Picker ohne Vorauswahl (`open-questions.md` F1). Bei positiv: beide Anforderungen erfüllt, Modus-Design vereinfacht sich |
| V2 🔴 | Device Claim (`deviceDetail.deviceId`) bleibt bei `prompt`/`login_hint` erhalten | Anmelden, dann Entra Sign-in-Log → Eintrag → `deviceDetail.deviceId` | Die Device-Claim-CA blockt im Erzwingungsmodus → Projekt trägt nicht. **Ein erfolgreicher Sign-in beweist das nicht**, solange sie report-only ist |
| V3 | `login_hint` überschreibt einen PRT für einen **anderen** User | Manuell, wie beim `select_account`-Test | `login_hint`-Modus entfällt ersatzlos, Picker bleibt einziger Modus |
| V4 | `host_permissions` auf `login.microsoftonline.com` reicht für den Redirect aus | Extension laden, Regel greift ohne weitere Hosts | Initiator-Domains nötig → Governance-Neubewertung, siehe `security-review.md` §4 (Abbruchkriterium) |

## 1. Automatisiert abgedeckt (nicht Teil dieser Matrix)

Diese vier gehören in `tests/unit/` und laufen im Verify-Gate:

- UPN → DNR-Regel-Objekt (fester Input, festes erwartetes Objekt)
- RE2-Kompatibilität des generierten `regexFilter`
- kein `resourceTypes` außer `main_frame`
- leere Konfiguration → keine Regel

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
| Z3 | **Redirect-Loop** — Portal aufrufen, das selbst schon `prompt` setzt | Genau ein Redirect, kein `ERR_TOO_MANY_REDIRECTS` |
| Z4 | **Fremdtenant** (z. B. `<test-tenant>.onmicrosoft.com`) — im Picker-Default | Über die Kontoauswahl erreichbar, ohne Zutun |
| Z4b | **Fremdtenant** — im `login_hint`-Opt-in | Nur über den Toggle in der Options-Seite erreichbar; nach Wiedereinschalten greift die Regel sofort wieder |
| Z5 | **v1-Endpunkt** — Portal mit `/oauth2/authorize` (ohne `v2.0`) | Regel greift |
| Z6 | **WS-Federation** — bekannte Lücke (A9) | Regel greift **nicht**, Verhalten unverändert. Dokumentiert, kein Fehler |

## 4. Durchlauf-Protokoll

| Datum | Extension-Version | Edge-Version | Umfang | Ergebnis | Durchgeführt von |
| --- | --- | --- | --- | --- | --- |
| — | — | — | Phase 1: kein Code | — | — |

Bei einer eng begrenzten Änderung genügt die betroffene Zeile plus Z1 und Z2. Vor einem Ringwechsel im Rollout: die **vollständige** Matrix.

## 5. Vorgehen je Zelle

1. Edge-Profil mit konfigurierter Extension, Zustand herstellen (Session löschen / EADM anmelden / Workforce-PRT aktiv / SIF ablaufen lassen)
2. Portal-URL aufrufen
3. **A** — angemeldetes Konto in der Portal-UI ablesen
4. **B** — Entra Sign-in-Log → betreffender Eintrag → `deviceDetail.deviceId` gefüllt?
5. **C** — Portal offen lassen, DevTools-Konsole auf `interaction_required` / fehlgeschlagene `prompt=none`-Requests beobachten

Für **B** genügt es nicht, dass die Anmeldung erfolgreich war: solange die Device-Claim-CA im Report-only-Zustand ist, beweist ein erfolgreicher Sign-in nicht, dass der Device Claim vorhanden war. Immer den Log-Eintrag selbst ansehen.
