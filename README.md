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

## Wie Arbeit gezählt wird

- Eine **Arbeitstour** beginnt, wenn man an einem Arbeitstag von der Firma wegfährt –
  oder morgens direkt von daheim zur Baustelle (bzw. am Vorabend weit weg ins Hotel).
- Sie endet, sobald man wieder in der Firma oder daheim ist. Fahrten danach zählen nicht.
- Der Weg daheim ↔ Firma zählt nie. Mehrtägige Touren mit Hotel laufen bis zur Rückkehr durch.
- Nur Arbeitstage zählen (einstellbar, Standard Mo–Fr). Gesetzliche Feiertage werden nach Wohnort erkannt
  (Südtirol, Italien, Österreich, Deutschland/Bayern/BW, Schweiz) und zählen nicht – genauso wie eingetragene freie Tage.
- **Touren-Check:** Touren, die nicht in der Firma starten und weit weg gehen, werden als „Urlaub?“ markiert.
  Mit einem Tipp als „war frei“ oder „war Arbeit“ bestätigen.
- **Ohne Firma:** Wer immer direkt von daheim startet, setzt in den Einstellungen „Keine Firma“.
- **Einsatzorte** = Aufenthalte während einer Tour zwischen 6 und 20 Uhr, ab 3 Std insgesamt.
- **Hotelnächte** = Nächte auswärts (Standard ab 40 km, einstellbar) mitten in einer Arbeitstour.

## Einstellungen

- **Daheim** wird aus dem Export übernommen, **Firma** automatisch erkannt
  (häufigster Halt Mo–Fr morgens in der Nähe). Beides kann man auf der Karte neu setzen.
- **Urlaub & freie Tage**: ein Tag oder Zeitraum pro Zeile (oder im Tagebuch auf „war frei“ tippen), z. B.
  ```
  2025-12-24 bis 2026-01-06
  2026-08-15 bis 2026-08-22
  ```

## Hotelnamen (optional)

Der Export enthält nur Google-Place-IDs, keine Namen. Mit einem eigenen Google-API-Schlüssel
holt die Seite die Namen, Adresse und Bewertung der Hotels (Tab *Hotels → Hotelnamen von Google holen*).

1. console.cloud.google.com → Projekt anlegen, Abrechnung verbinden
2. **Maps JavaScript API** und **Places API (New)** aktivieren
3. API-Schlüssel erstellen und auf die eigene Seite (`https://<name>.github.io/*`) und diese zwei APIs einschränken
4. Schlüssel unter *Einstellungen* eintragen – er bleibt nur im Browser

Für ein paar Dutzend Hotels bleibt man im Gratis-Kontingent von Google. Namen werden gespeichert und nur einmal abgefragt.

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

Die Detailkarte („Karte“) lädt Kacheln von CARTO (Daten © OpenStreetMap-Mitwirkende). Ohne Internet oder wo das blockiert ist, wird automatisch die einfache Karte genommen.

Kilometer sind Googles Schätzung – kein Ersatz für ein Fahrtenbuch.
