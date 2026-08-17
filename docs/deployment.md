# Deployment

> Status: Phase 1 — Verfahren beschrieben, noch nicht durchgeführt. Konkrete Werte (Extension-ID, `update_url`, Hashes) sind Platzhalter und werden in Phase 2 gefüllt.

## 1. Grundsatz

**Kein Upload in den Edge Add-ons Store.** Self-hosted CRX auf interner Infrastruktur.

Begründung: Der Store-Weg gibt die Kontrolle über Auslieferungszeitpunkt und Version aus der Hand — bei einem T0-Einflussweg nicht akzeptabel. Zusätzlich wäre der Code öffentlich einsehbar, inklusive der Endpunkt-Regeln.

## 2. Verteilung

Über Edge-Policy `ExtensionSettings`, browserweit:

- `installation_mode: force_installed`
- `update_url` auf den internen Endpunkt
- **gepinnte Version** — kein Auto-Update ohne Freigabe

Der Force-Install erfolgt **browserweit**; die funktionale Trennung ergibt sich daraus, dass das Workforce-Profil nie aktiviert wird (Constraint A3 — ohne Aktivierungsflag keine Regel). Das ist der zentrale Deployment-Trick: ein einziges Policy-Objekt, kein Profil-Targeting.

`ExtensionSettings` ist die **einzige** Policy im Projekt. Die Extension-Konfiguration selbst (Aktivierung, Modus, UPN) wird bewusst nicht per Policy verteilt, sondern pro Profil manuell in der Options-Seite gesetzt (`open-questions.md` F3). Pro Admin fällt damit ein einmaliger Einrichtungsschritt an — das gehört ins Onboarding, nicht ins Deployment.

### 2.1 Policy-Skelett

```json
{
  "<extension-id>": {
    "installation_mode": "force_installed",
    "update_url": "https://<interner-endpunkt>/updates.xml",
    "override_update_url": true,
    "pinned_version": "<x.y.z>"
  }
}
```

<!-- TODO Phase 2: Extension-ID nach erstem Packaging eintragen, update_url mit der
     tatsächlichen internen Infrastruktur abstimmen, Policy-Pfad (GPO/Intune) ergänzen. -->

## 3. Build und Signatur

Anforderung aus `security-review.md`: reproduzierbarer Build, Signaturkette auf IDemFlow-Niveau, Artefakt-Hash dokumentiert.

Die Extension hat keinen Build-Step im Sinne von Transpilierung oder Bundling — `src/` ist das, was läuft. „Build" heißt hier ausschließlich: packen und signieren.

```
src/  →  CRX3 (signiert)  →  build/ms-account-picker-<version>.crx
```

<!-- TODO Phase 2: Packaging-Kommando festlegen, Schlüsselverwahrung klären
     (HSM / Key Vault — der Schlüssel gehört nicht auf eine Entwicklermaschine),
     Reproduzierbarkeit nachweisen: zweimal packen, gleicher Hash. -->

### 3.1 Artefakt-Register

| Version | Datum | SHA-256 | Freigegeben von |
| --- | --- | --- | --- |
| — | — | — | — |

Jede ausgelieferte Version wird hier eingetragen. Eine Version ohne Eintrag ist nicht freigegeben.

## 4. Rollout

<!-- TODO Phase 2: Ringe und Abbruchkriterien mit dem Auftraggeber festlegen. -->

Vorschlag zur Abstimmung:

1. **Ring 0** — Projektbeteiligte, manuell entpackt geladen. Verifikationsmatrix vollständig.
2. **Ring 1** — kleine EADM-Pilotgruppe per Policy. Mindestens eine SIF-Ablauf-Periode (8h/4h, `CATA-01`) abwarten.
3. **Ring 2** — alle ~500 EADM-Accounts.

Vor jedem Ringwechsel: Verifikationsmatrix grün, Security-Review eingetragen, Artefakt-Hash registriert.

## 5. Rollback

Der Notausgang auf Nutzerebene (Frage 2 der offenen Fragen) ersetzt keinen Rollback-Pfad auf Flottenebene.

Rollback = `pinned_version` auf die Vorversion zurücksetzen oder `installation_mode` auf `blocked`. Beides greift erst beim nächsten Policy-Refresh — die Zeit bis dahin ist die tatsächliche Wiederherstellzeit und muss bekannt sein.

<!-- TODO Phase 2: Policy-Refresh-Intervall im Zielumfeld messen, hier eintragen. -->
