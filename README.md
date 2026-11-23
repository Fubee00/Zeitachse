# Zeitachse – Fahrten & Einsatzorte

Wertet den **Google-Maps-Zeitachsen-Export** aus und zeigt ihn auf einer Karte:

- Heatmap, wo du überall warst (Alle / Arbeit / Freizeit, pro Monat)
- Kilometer mit dem Auto, davon Arbeits-km (Mo–Fr, ohne Weg daheim ↔ Firma)
- Einsatzorte mit Stunden und Tagen (Rangliste)
- Tagebuch: pro Tag die Einsatzorte, Hotel und km
- Hotelnächte
- Zeitleiste zum Abspielen, Tag für Tag

**Datenschutz:** Die Datei wird nur im Browser ausgewertet. Nichts wird hochgeladen.
Sie bleibt im Browser gespeichert (IndexedDB), damit man sie nicht jedes Mal neu laden muss –
unter *Einstellungen* kann man sie löschen.

## Export holen

**Android:** Einstellungen → Standort → Standortdienste → Zeitachse → *Zeitachsendaten exportieren*
**iPhone:** Google Maps → Profilbild → Einstellungen → Persönliche Inhalte → *Zeitachsendaten exportieren*

Die Datei (`Zeitachse.json` / `Timeline.json`) dann auf der Seite auswählen oder reinziehen.

## Einstellungen

- **Daheim** wird aus dem Export übernommen, **Firma** automatisch erkannt
  (häufigster Halt Mo–Fr morgens in der Nähe). Beides kann man auf der Karte neu setzen.
- **Urlaub & freie Tage**: ein Tag oder Zeitraum pro Zeile, z. B.
  ```
  2025-12-24 bis 2026-01-06
  2026-08-15 bis 2026-08-22
  ```

## Online stellen (GitHub Pages)

Repo → *Settings* → *Pages* → *Deploy from a branch* → `main` / `root`.
Danach läuft die Seite unter `https://<name>.github.io/<repo>/`.

Lokal testen: `python3 -m http.server` im Ordner und `http://localhost:8000` öffnen
(direkt als Datei geöffnet funktioniert der Web Worker nicht).

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche, Karte, Tabellen |
| `worker.js` | Auswertung des Exports (läuft im Hintergrund) |
| `data/laender.json` | Ländergrenzen (Natural Earth, gemeinfrei) |
| `data/strassen.json` | Autobahnen, Hauptstraßen, Seen (Natural Earth) |
| `data/staedte.json` | Städtenamen für die Karte (Natural Earth) |
| `data/orte.json` | Ortsnamen für Einsatzorte (GeoNames, CC BY 4.0) |

Kilometer sind Googles Schätzung – kein Ersatz für ein Fahrtenbuch.
