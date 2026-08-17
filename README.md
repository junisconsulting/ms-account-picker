# MS Account Picker

Manifest-V3-Browser-Extension für Microsoft Edge. Sie ergänzt den OAuth-Authorize-Request um einen einzelnen Query-Parameter (`prompt=select_account` oder `login_hint=<EADM-UPN>`), damit ein Admin im EADM-Profil nicht durch den injizierten Workforce-PRT automatisch im falschen Konto landet.

**Status: Phase 1 — Struktur.** Das Repository ist vollständig strukturiert und dokumentiert, enthält aber noch keinen Produktivcode. Die Dateien unter `src/` sind Skelette mit TODO-Markierungen.

> 🔴 Die Extension operiert **innerhalb des Authentifizierungsflusses privilegierter Konten** und ist als T0-Einflussweg klassifiziert. Jede Änderung an Manifest, Permissions oder Regelbedingungen erfordert einen blockierenden Security-Review. Siehe [docs/security-review.md](docs/security-review.md).

## Dokumentation

| Datei | Inhalt |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | Verbindliche Projektregeln, harte Architektur-Constraints, Glossar |
| [docs/architecture.md](docs/architecture.md) | Lösungsansatz, verworfene Alternativen, empirischer Stand |
| [docs/security-review.md](docs/security-review.md) | T0-Klassifikation, Anforderungen, Abbruchkriterium, Datenschutz |
| [docs/deployment.md](docs/deployment.md) | `ExtensionSettings`-Policy, Signatur, Rollout, Rollback |
| [docs/verification-matrix.md](docs/verification-matrix.md) | Manuelle Testmatrix — Portale × Sessionzustände |
| [docs/open-questions.md](docs/open-questions.md) | Offene Entscheidungen, wird im Projektverlauf abgebaut |

## Entwicklung

Kein Build-Step, keine Dependencies. Was in `src/` liegt, läuft im Browser.

```bash
bash .claude/hooks/verify.sh   # Gate: manifest-JSON, node --check, Unit-Tests
node --test tests/unit/*.test.js   # Unit-Tests einzeln
```

Extension laden: `edge://extensions` → Entwicklermodus → **Entpackte Erweiterung laden** → Verzeichnis `src/`.

## Claude Code

`.claude/skills/` enthält drei Prozeduren: `verify` (Erfolgskriterien und Gate), `security-review` (blockierende Checkliste bei Manifest-/Permission-/Regeländerungen), `dnr-rule-check` (statische Regelprüfung: RE2, `resourceTypes`, Loop-Risiko, Endpunkt-Abdeckung).

`verify.sh` ist zusätzlich als `Stop`-Hook verdrahtet — ein roter Baum blockiert das Ende des Turns.
