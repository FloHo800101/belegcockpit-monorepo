# Tech. Team – Übersicht

Das Avengers-Team für die Produktentwicklung mit Claude Code.
Jeder Agent ist als Subagent in Claude Code einsetzbar – die `.md`-Datei ist der Prompt.

---

## Das Team

| Nickname             | Rolle                       | Modell | Farbe   | Projekte                             |
| -------------------- | --------------------------- | ------ | ------- | ------------------------------------ |
| [[Black_TypeScript]] | TypeScript Senior Developer | Sonnet | #1a1a2e | Alle                                 |
| [[Orakel]]           | Kritischer Produktstratege  | Opus   | #8b0000 | Alle                                 |
| [[SuperBase]]        | Supabase Specialist         | Sonnet | #3ecf8e | Belegcockpit, RelationHub, Supplement MVP |
| [[React-or]]         | React Frontend Developer    | Sonnet | #61dafb | RelationHub, Belegcockpit            |
| [[Mapper]]           | Excel/Data Engineer         | Sonnet | #217346 | Rent Roll ETL                        |
| [[Synapse]]          | AI/Prompt Engineer          | Opus   | #a855f7 | RelationHub, Belegcockpit, Rent Roll, Supplement MVP |
| [[Flow]]             | UX/Onboarding Designer      | Opus   | #f97316 | Belegcockpit, RelationHub, Rent Roll, Supplement MVP |
| [[Testing_Titan]]    | QA & Testing Specialist     | Sonnet | #ef4444 | Alle                                 |
| [[NutriBase]]        | Health Data Curator         | Opus   | #22c55e | Supplement MVP                       |

---

## Projekt-Zuordnung

### Belegcockpit
Black TypeScript · SuperBase · React-or · Orakel · Synapse · Flow · Testing Titan

### Rent Roll ETL
Black TypeScript · Mapper · Orakel · Synapse · Flow · Testing Titan

### RelationHub (demnächst)
Black TypeScript · SuperBase · React-or · Orakel · Synapse · Flow · Testing Titan

### Supplement MVP
Black TypeScript · SuperBase · NutriBase · Orakel · Synapse · Flow · Testing Titan

---

## Gemeinsame Regeln (alle Agenten)

1. **Nie eigenständig committen** – kein `git commit`, kein `git push`
2. **Nie auf `main` arbeiten**
3. **Nie Pre-Commit-Hooks umgehen**
4. **Nie Secrets committen** – keine API-Keys, keine `.env`-Dateien
5. **Kommunikation auf Deutsch**, Code und Dokumentation auf Englisch
6. **Production-ready Code** – kein Prototyp, kein „machen wir später sauber"

---

## Nutzung in Claude Code

### Agent einrichten
1. Im Terminal: `/agents` eingeben
2. Name, Farbe und Prompt aus der jeweiligen `.md`-Datei einfügen
3. Modell gemäß Empfehlung wählen (Sonnet oder Opus)

### Agent aus dem Vault laden
Claude Code anweisen:
```
Lies dir die Datei [Agent-Name].md aus dem Ordner "Tech. Team" durch
und übernimm diese Rolle für die aktuelle Session.
```

### Mehrere Agenten parallel
Claude Code kann Subagenten parallel spawnen. Sinnvolle Kombinationen:
- **Black TypeScript + React-or** → Backend + Frontend gleichzeitig
- **Synapse + SuperBase** → Prompt-Design + Edge Function gleichzeitig
- **Orakel alleine** → PRD-Review vor dem Bauen (immer zuerst)
- **Testing Titan nach jedem Feature** → Tests schreiben, Lücken finden, Bericht liefern
