# Security Review — Klassifikation und Anforderungen

> Verbindlich. Die operative Checkliste für einzelne Änderungen liegt in `.claude/skills/security-review/SKILL.md` und ist **blockierend**.

## 1. Klassifikation: T0-Einflussweg

Die Extension operiert **innerhalb des Authentifizierungsflusses** privilegierter Konten. Wer sie ausliefern oder aktualisieren kann, könnte statt `prompt` auch `redirect_uri` manipulieren — ein perfekt getarnter Token-Diebstahlpfad gegen genau die Population, die durch phishing-resistente Verfahren geschützt werden soll.

Damit ist die Build- und Auslieferungskette der Extension selbst ein T0-Asset. Sie ist nicht schwächer zu schützen als die Systeme, die sie beeinflusst.

## 2. Verbindliche Anforderungen

1. Build- und Signaturkette auf demselben Schutzniveau wie die IDemFlow-Pipelines
2. `host_permissions` minimal — idealerweise ausschließlich `https://login.microsoftonline.com/*`
3. Kein Background-Script über den Rule-Sync hinaus, kein `fetch`, kein Remote Code, keine Telemetrie
4. Review-Pflicht bei **jeder** Änderung an Regeln oder Permissions
5. Reproduzierbarer Build; Artefakt-Hash dokumentiert (`deployment.md`)
6. Gepinnte Version in der Deployment-Policy — kein Auto-Update ohne Freigabe

## 3. Angriffsflächen und Gegenmaßnahmen

| Fläche | Risiko | Gegenmaßnahme |
| --- | --- | --- |
| Regel-`action` | Umschreiben auf `redirect_uri` → Auth-Code landet beim Angreifer | Security-Review-Skill §2: nur `prompt`/`login_hint` in `addOrReplaceParams`, Ziel-Host == Request-Host |
| `host_permissions` | Ausweitung auf Portal-Domains → Zugriff auf Session-tragende Requests | Erweiterung nur nach Rückfrage; siehe Abbruchkriterium |
| Update-Kanal | Untergeschobene Version an alle Admin-Profile | Self-hosted `update_url` auf interner Infrastruktur, gepinnte Version, signierte CRX |
| Service Worker | Nachladen von Code, Exfiltration des UPN | Kein `fetch`/`eval`/`chrome.scripting`; MV3-CSP; Review-Checkliste §3 |
| Dependencies | Supply-Chain-Kompromittierung | Null Runtime-Dependencies. Jede Aufnahme ist eine explizite Entscheidung des Auftraggebers |
| Repository | Signaturschlüssel oder echte Identifier im Klartext | `.gitignore` für `*.pem`/`*.crx`; keine echten UPNs/Tenant-IDs in Code, Tests, Docs, Commits |

## 4. Abbruchkriterium 🔴

Falls sich in Phase 2 zeigt, dass Host-Permissions auf die Portal-Domains (`portal.azure.com`, `security.microsoft.com`, …) nötig sind, ist die Risikobewertung **neu zu führen**. Das Projekt ist dann gegebenenfalls einzustellen.

Begründung: Eine Extension mit Leserechten auf den Portal-Domains sieht die authentifizierten Sessions selbst, nicht mehr nur den Authorize-Request. Der Nutzen (Komfort beim Kontowechsel) rechtfertigt diese Fläche nicht.

## 5. Datenschutz

Der EADM-UPN erscheint in jeder Authorize-URL → Browser-Historie, Proxy-Logs, ggf. `Referer`.

Bewertung: **kein neuer Angriffsvektor** gegenüber den Sign-in-Logs, in denen derselbe UPN ohnehin steht — aber breitere Sichtbarkeit, insbesondere gegenüber Rollen mit Proxy-Log-Zugriff, die keinen Entra-Log-Zugriff haben.

Konsequenz: benennen, nicht verschleiern. Eine Obfuskation des UPN in der URL wäre wirkungslos (ESTS braucht den Klartext) und würde die Nachvollziehbarkeit verschlechtern.

Im Picker-Modus (`prompt=select_account`) entfällt dieser Punkt vollständig — der Parameter enthält keine Identität. Das ist ein Argument in Frage 1 der offenen Fragen.

## 6. Review-Historie

| Datum | Umfang | Ergebnis | Reviewer |
| --- | --- | --- | --- |
| — | Phase 1: Struktur, kein Code | — | — |

Jeder Review nach Skill-Checkliste wird hier mit Datum, Diff-Umfang und Ergebnis eingetragen. Ein nicht eingetragener Review hat nicht stattgefunden.
