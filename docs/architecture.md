# Architektur

> Status: Phase 1 (Struktur). Die Entscheidungen hier sind getroffen; die mit ⏳ markierten Annahmen sind noch nicht empirisch belegt.

## 1. Problem

Auf Hybrid-Joined-Windows-Clients injiziert Edge den Primary Refresh Token (PRT) des angemeldeten Workforce-Users in **jedes** Browser-Profil. Ein Admin, der in einem zweiten Edge-Profil mit seinem cloud-only Admin-Account (EADM) arbeiten will, wird dadurch automatisch in den Workforce-Account angemeldet.

**Betroffene Population:** die EADM-Konten des Auftraggebers, perspektivisch weitere Kunden mit gleicher Konstellation.

**Warum das nicht trivial ist:** Der PRT liefert gleichzeitig den Device Claim, den die Conditional-Access-Policy für Hybrid-Join (im Folgenden **Device-Claim-CA**) voraussetzt. Jede Lösung, die das SSO abschaltet, bricht die Gerätebindung.

## 2. Verworfene Alternativen

Nicht erneut vorschlagen. Jede Zeile ist bereits geprüft und aus dem genannten Grund gescheitert.

| Ansatz | Warum verworfen |
| --- | --- |
| Edge-Setting „Automatically sign in to sites…" | Ist ein **Picker**-Schalter, kein SSO-Schalter. Versteckt nur die Auswahl |
| Edge-Policy `AADWebSiteSSOUsingThisProfileEnabled` | `Per Profile: No` → trifft auch das Workforce-Profil |
| `loginHint` in Portal-URLs | Nur Azure- und Entra-Portal unterstützen `/signin/index/@domain?loginHint=`. Defender, Fabric, SharePoint, Teams: kein Mechanismus |
| EADM als zweites Windows-Work-Account | Admin-PRT im CloudAP-Cache der Standard-Workstation → Clean-Source-Verletzung (Enterprise Access Model). Vom Auftraggeber abgelehnt |
| CA-Block auf `MicrosoftAdminPortals` für Workforce | SSO findet trotzdem statt, Blockseite bietet keinen Kontowechsel |
| Edge Custom Site Switch | Windows-Account erscheint in jedem Profil, Profilwechsel löst das nicht |
| Firefox / Chrome ohne WAM | Kein Device Claim → die Device-Claim-CA blockt |
| Zweites Windows-Benutzerkonto / PAW / AVD | Strukturell korrekt, aber vom Auftraggeber als UX-untauglich verworfen |
| Vorgebaute Authorize-URLs | Scheitert zwingend an PKCE und Single-Use-`state`. Getestet |

## 3. Lösungsansatz

Eine **Manifest-V3-Browser-Extension**, die im EADM-Profil den OAuth-Authorize-Request im Flug um einen Query-Parameter ergänzt.

**Kernprinzip: ergänzen, nicht bauen.** Das Portal (MSAL.js) erzeugt den Request inklusive `state`, `nonce`, `code_challenge` (PKCE) und `response_mode`. Die Extension fügt ausschließlich einen Parameter hinzu. Damit funktioniert der Ansatz automatisch für jedes Microsoft-Portal, ohne dass Client-IDs oder Redirect-URIs gepflegt werden müssen.

### 3.1 Zwei Betriebsmodi

| Modus | Injizierter Parameter | Verhalten |
| --- | --- | --- |
| **Picker** | `prompt=select_account` | Kontoauswahl erscheint immer, Workforce-Account bleibt sichtbar |
| **Hint** *(Zielmodus)* | `login_hint=<EADM-UPN>` | Direkt zum EADM, Workforce-Account erscheint nie |

**Beide sind gegenseitig ausschließend** — ein gesetzter `prompt=select_account` macht `login_hint` wirkungslos. „Picker, aber mit vorausgewähltem EADM" ist damit kein verfügbarer dritter Modus.

**Entscheidung (2026-08-17):** Picker ist der Default und der verpflichtende Grundzustand. `login_hint` bleibt als Opt-in pro Profil erhalten, für Admins, die den Klick sparen wollen und keinen Fremdtenant brauchen.

Begründung:

- Der Picker ist der Modus, der ohne unbelegte Annahmen funktioniert — `prompt=select_account` ist empirisch belegt (§7.1), die `login_hint`-Wirkung gegen einen fremden PRT ist es nicht (§7.2).
- Der Picker hält jeden Fremdtenant erreichbar und macht damit einen separaten Notausgang überflüssig.
- Der Picker schreibt keine Identität in die URL — der Datenschutzpunkt aus `security-review.md` §5 entfällt in diesem Modus vollständig.

Offen bleibt, ob `prompt=select_account` zusammen mit `login_hint` das EADM im Picker **vorauswählt**. Das ist nicht dokumentiert, aber in fünf Minuten manuell prüfbar → `verification-matrix.md` V1. Fällt der Test positiv aus, ist das die Kombination aus beiden Wünschen; fällt er negativ aus, bleibt es bei der Entscheidung oben.

## 4. Komponenten

Vier Stück. Bewusst minimal — kein Framework, kein Build-Step für die Extension selbst, kein Remote Code.

```
Options-Seite  →  chrome.storage.local  →  Service Worker  →  DNR Dynamic Rule
   (UPN)              (Konfiguration)        (Rule-Sync)        (Request-Transform)
```

| Komponente | Datei | Aufgabe |
| --- | --- | --- |
| Options-Seite | `src/options/` | Aktivierung, Modus und UPN erfassen, in `chrome.storage.local` schreiben. **Einzige Konfigurationsquelle** — keine Policy-Vorbelegung, bewusst manuell (`open-questions.md` F3) |
| Rule-Builder | `src/lib/rules.js` | Konfiguration → Regel-Objekt. Rein funktional, keine `chrome.*`-Aufrufe, unit-testbar |
| Service Worker | `src/background/service-worker.js` | Liest Storage, synchronisiert die dynamische Regel. Sonst nichts |
| Manifest | `src/manifest.json` | Permissions, MV3-Deklaration |

### 4.1 Regelform

```
action.type              = "redirect"
redirect.transform.queryTransform.addOrReplaceParams
condition.regexFilter    = ^https://login\.microsoftonline\.com/[^/]+/oauth2/(?:v2\.0/)?authorize\?
condition.resourceTypes  = ["main_frame"]
```

## 5. Harte technische Randbedingungen

Die verbindliche Fassung steht in `CLAUDE.md` (A1–A10). Hier die Begründungen:

- 🔴 **`resourceTypes: ["main_frame"]` ist Pflicht.** Silent Token Renewal läuft als `prompt=none` im versteckten iframe. Greift die Regel dort, bricht die Token-Erneuerung in **allen** M365-Portalen.
- 🔴 **`regexFilter` nutzt RE2 — keine Lookaheads.** Der Loop-Schutz muss anders gelöst werden: eine identische Ziel-URL führt zu keinem Redirect. ⏳ Zu verifizieren, nicht zu unterstellen.
- ⚠️ **v1- und v2-Endpunkt abdecken:** `/oauth2/authorize` und `/oauth2/v2.0/authorize`.
- **Endpunkt-Aliase (`login.windows.net`, `login.microsoft.com`): bewusst nicht abgedeckt** (2026-08-17). Kein Portal im Zielumfeld nutzt sie erkennbar, und jeder Alias ist ein zusätzlicher `host_permissions`-Eintrag. Bei konkretem Bedarf: Host-Permission-Review, kein Bugfix.
- ⚠️ **WS-Federation (`/wsfed?`) kennt kein `prompt`.** Nicht abgedeckt — bekannte Lücke.
- **Ohne explizite Aktivierung im Profil darf keine Regel registriert werden.** Die Extension ist dann funktional inaktiv. Das ermöglicht browserweiten Force-Install per Policy, ohne das Workforce-Profil zu beeinflussen. Das Gate ist ein Flag in `chrome.storage.local` (pro Profil), **nicht** der UPN — der Picker-Default braucht gar keinen UPN.

## 6. Notausgang

Das Problem existiert **nur im `login_hint`-Modus**: dort ist kein anderer Account mehr erreichbar — auch nicht der Test-Tenant `<test-tenant>.onmicrosoft.com`. Im Picker-Modus (Default) ist jeder Account über die Kontoauswahl erreichbar, ein Notausgang ist dort gegenstandslos.

**Entscheidung (2026-08-17):** globaler Ein-/Ausschalter in der Options-Seite. Keine Tenant-Ausnahmeliste — sie bräuchte Tenant-Segment-Matching im `regexFilter` und damit zusätzliche RE2-Fläche in genau dem Teil des Codes, der bei jeder Änderung reviewpflichtig ist. Für einen Fall, der im Default-Modus gar nicht auftritt.

Der Schalter ist kein Rollback-Pfad auf Flottenebene — der läuft über die Policy, siehe `deployment.md` §5.

## 7. Empirischer Stand

### 7.1 Belegt

- `prompt=select_account` unterbricht das PRT-basierte Auto-SSO zuverlässig. Manuell verifiziert am Azure-Portal-Request (`/organizations/oauth2/v2.0/authorize`).
- Der reale Request nutzt `/organizations/`, nicht `/common/` → das Tenant-Segment im Regex muss variabel sein.
- Vorgebaute URLs scheitern an PKCE und Single-Use-`state`.

### 7.2 Noch nicht belegt (Prereqs für Phase 2)

| Annahme | Verifikation |
| --- | --- |
| `login_hint` überschreibt einen PRT für einen **anderen** User | Manuell, wie beim `select_account`-Test |
| Device Claim (`deviceDetail.deviceId`) bleibt bei `prompt`/`login_hint` erhalten | Sign-in-Log nach Anmeldung prüfen. Vom Auftraggeber als gegeben angenommen, weil die Device-Claim-CA sonst blocken würde — solange diese report-only ist, ist das **keine** belastbare Ableitung und muss einmal explizit bestätigt werden |
| Kein Redirect-Loop bei bereits gesetztem Parameter | Integrationstest |
| `host_permissions` auf `login.microsoftonline.com` reicht für Redirects aus | Integrationstest. Falls Initiator-Domains nötig sind → Governance-Neubewertung, siehe `security-review.md` §Abbruchkriterium |

## 8. Referenzen

Öffentlich:

- MS Learn: `declarativeNetRequest`, `conditionalAccessApplications`, OIDC `prompt`-Parameter
- Microsoft Enterprise Access Model — Clean-Source-Prinzip

Umgebungsspezifisch (bewusst **nicht** in diesem Repository):

- Die CA-Namenskonvention des Auftraggebers
- Die Device-Claim-CA (Hybrid-Join-Anforderung) — ihr Name unterscheidet sich je Umgebung
- Die Admin-Session-Baseline (nicht-persistente Browser-Session, Sign-in-Frequency)
- Das interne Enterprise-Access-Model-Dokument

Diese Artefakte haben ihren Lebenszyklus außerhalb der Extension. Wer sie braucht, findet sie beim Auftraggeber — in dieses Repo gehören sie nicht, weil es kunden- und umgebungsneutral bleiben soll.
