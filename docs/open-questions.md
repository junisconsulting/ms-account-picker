# Offene Fragen

> Wird im Projektverlauf abgebaut. Claude entscheidet keine offene Frage selbst — bei Berührung nachfragen. Entschiedenes wandert mit Datum und Begründung nach unten.

## Offen

*(derzeit keine — alle Fragen aus dem Briefing §11 sind entschieden)*

## Entschieden

### F3 — Konfigurationsquelle → manuelle Eingabe in der Options-Seite *(2026-08-17)*

Der EADM-UPN wird einmalig in der Extension-UI eingegeben und in `chrome.storage.local` persistiert. **Keine Vorbelegung per Edge-Policy.**

Begründung des Auftraggebers: maximale Flexibilität — die Ableitung des EADM-UPN ist bei jedem Kunden anders, ein zentrales Schema wäre pro Umgebung neu zu bauen.

Konsequenzen, die daraus folgen und nicht verhandelbar sind:

- Es gibt **keinen** `3rdparty/extensions/<id>/policy`-Pfad. Die einzige Policy im Projekt ist `ExtensionSettings` für Force-Install und Versionspinning (`deployment.md` §2).
- `chrome.storage.managed` wird nicht gelesen. Wer das später einführen will, muss beachten: eine Policy gilt für den OS-Benutzer, nicht für ein Edge-Profil — sie erreicht damit auch das Workforce-Profil und hebt die Trennung auf, auf der das Deployment beruht.
- Die Aktivierung bleibt in jedem Fall ein Flag in `chrome.storage.local`, per Default aus (Constraint A3). Picker-Modus braucht keinen UPN, also kann der UPN nicht das Gate sein.
- Der Einrichtungsschritt pro Admin ist damit gesetzt: Extension öffnen, aktivieren, ggf. UPN eintragen. Bei der Größe der EADM-Population ist das ein Onboarding-Thema, kein technisches — nicht konfigurierte Profile bleiben stumm inaktiv, nicht fehlerhaft.

### F5 — Device-Registration-Block für EADM → out of scope *(2026-08-17)*

Die CA-Policy, die EADM-Konten die Device Registration verbietet, ist im Zielumfeld **noch nicht aktiv** und wie das gesamte CA-Design kundenindividuell. Weder verlinken noch mitverwalten — dieses Repository macht keine Aussage dazu.

Zum Verständnis für später: Die Policy verhindert, dass ein EADM-Account sich an einem Gerät registriert und damit ein Admin-PRT in den CloudAP-Cache der Standard-Workstation gerät — die Clean-Source-Verletzung, die in `architecture.md` §2 als „EADM als zweites Windows-Work-Account" verworfen wurde. Für die Extension ist sie ohne Belang: sie ändert weder Regelform noch Permissions.

### F1 — Betriebsmodus → Picker als Default, `login_hint` als Opt-in *(2026-08-17)*

Der Wunsch „`login_hint` mit dem Admin-User gefüllt **und** Account-Picker" ist in dieser Form nicht erfüllbar: ein gesetztes `prompt=select_account` macht `login_hint` wirkungslos (`architecture.md` §3.1). Es gibt keinen dritten Modus „Picker mit Vorauswahl".

Entscheidung: **Picker (`prompt=select_account`) ist Default und verpflichtender Grundzustand**, `login_hint` bleibt als Opt-in pro Profil. Begründung in `architecture.md` §3.1 — kurz: der Picker ist der empirisch belegte Modus, er hält Fremdtenants erreichbar (macht F2 gegenstandslos) und schreibt keine Identität in die URL.

**Restpunkt:** Ob `prompt=select_account` **zusammen mit** `login_hint` das EADM im Picker vorauswählt, ist nicht dokumentiert und in fünf Minuten prüfbar → `verification-matrix.md` V1. Positiv = beide Wünsche erfüllt, negativ = es bleibt bei der Entscheidung.

Zur Rückfrage „UPN dynamisch abrufbar?": nicht sinnvoll. `chrome.identity.getProfileUserInfo()` liefert das Konto, mit dem das **Edge-Profil** angemeldet ist — nicht das Konto der Portal-Session. Es kostet die zusätzliche Permission `identity`/`identity.email` in einer T0-Extension und setzt voraus, dass das EADM-Profil in Edge überhaupt angemeldet ist. Mit F3 (manuelle Eingabe) ist die Frage erledigt.

### F2 — Notausgang → globaler Toggle in der Options-Seite *(2026-08-17)*

Folgt aus F1: im Picker-Default ist jeder Fremdtenant über die Kontoauswahl erreichbar, ein Notausgang ist dort gegenstandslos. Er wird nur im `login_hint`-Opt-in gebraucht, und dafür genügt ein Schalter.

Keine Tenant-Ausnahmeliste: sie bräuchte Tenant-Segment-Matching im `regexFilter` und damit zusätzliche RE2-Fläche in genau dem Code, der bei jeder Änderung reviewpflichtig ist — für einen Fall, der im Default-Modus nicht auftritt.

### F4 — Repository-Name → `ms-account-picker` *(2026-08-17)*

Extension-Name „MS Account Picker". Allgemeiner und kundenunspezifischer als der Arbeitsname `eadm-account-picker-extension`. Im gesamten Repository umgesetzt.

### F6 — E2E-Strategie → Dummy-Authorize-Endpunkt *(2026-08-17)*

`tests/e2e/` testet gegen einen lokalen Endpunkt, der die Form eines Authorize-Requests hat und die Regel triggert — **kein echter ESTS-Login, keine Credentials im Testlauf**. Beweist Regel-Registrierung, Parameter-Injektion und Redirect-Verhalten. Was das nicht beweist, bleibt Sache der Verifikationsmatrix.

Offene Detailfrage für Phase 2: Der Dummy muss unter `login.microsoftonline.com` erreichbar sein, damit die Regel greift (Host-Mapping im Testlauf) — die Alternative wäre eine Testregel mit anderem Host, dann testet man aber nicht mehr die Produktivregel.

### F7 — Endpunkt-Aliase → nicht abdecken *(2026-08-17)*

`login.windows.net` und `login.microsoft.com` bleiben außen vor. Kein Portal im Zielumfeld nutzt sie erkennbar; jeder Alias ist ein zusätzlicher `host_permissions`-Eintrag. Bei konkretem Bedarf: Host-Permission-Review nach `security-review.md`, kein Bugfix nebenbei.
