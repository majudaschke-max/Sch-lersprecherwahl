# Schülersprecherwahl Online

Browserbasierte Online-Wahl-App für eine Schülersprecherwahl mit zentraler Speicherung in Supabase. Das Frontend ist statisch und kann über GitHub Pages betrieben werden.

Die App ist für schulinterne, niedrigschwellige Online-Abstimmungen gedacht. Sie ersetzt keine rechtliche Wahlsoftware mit echter Manipulationssicherheit. Ausgabe der Wahlcodes, Aufsicht, Dokumentation und organisatorische Kontrolle bleiben Aufgabe der Wahlleitung.

## Funktionen

- Wähleransicht ohne Login
- Admin-Bereich mit Supabase Auth
- Wahlen als Entwurf anlegen, starten, schließen, archivieren oder löschen
- Kandidatenliste und Anzahl der zu wählenden Personen
- Einmal-Wahlcodes für z. B. 600 Schülerinnen und Schüler
- Speicherung nur von Hashes der Wahlcodes
- atomare Stimmabgabe über Supabase RPC-Funktion `cast_vote`
- keine Speicherung von Namen der Wählenden
- Auswertung nur für Admins
- optional öffentliches Ergebnis nach Wahlende
- CSV-Export für Wahlcodes und Ergebnisse

## Dateien

- `index.html` - statische App-Oberfläche
- `style.css` - Layout und Gestaltung
- `script.js` - Frontend-Logik und Supabase-Zugriff
- `supabase.sql` - Tabellen, RLS-Policies und RPC-Funktionen
- `README.md` - diese Anleitung

## Supabase einrichten

1. Neues Supabase-Projekt erstellen.
2. In Supabase den SQL Editor öffnen.
3. Den Inhalt von `supabase.sql` ausführen.
4. In Supabase Auth einen Admin-Benutzer mit E-Mail und Passwort anlegen.
5. Die `id` dieses Auth-Benutzers in `public.admin_users` eintragen:

```sql
insert into public.admin_users (user_id)
values ('AUTH-USER-ID-HIER-EINTRAGEN');
```

6. In `script.js` diese Werte ersetzen:

```js
const SUPABASE_URL = "https://DEIN-PROJEKT.supabase.co";
const SUPABASE_ANON_KEY = "DEIN_PUBLIC_ANON_KEY";
```

Der öffentliche anon key darf im Frontend stehen. Der `service_role` key darf niemals in `script.js`, GitHub Pages oder anderem Frontend-Code verwendet werden.

## Bedienung

1. Admin-Bereich öffnen und mit Supabase Auth einloggen.
2. Neue Wahl anlegen: Titel, Sitzzahl und Kandidatenliste eintragen.
3. Wahl speichern.
4. Gewünschte Anzahl Wahlcodes erzeugen, direkt als CSV speichern oder ausdrucken.
5. Wahl starten. Danach sind Kandidatenliste und Sitzzahl gesperrt.
6. Wahl-Link an Schülerinnen und Schüler weitergeben.
7. Schülerinnen und Schüler geben ihren Wahlcode ein und wählen exakt die festgelegte Anzahl unterschiedlicher Kandidaturen.
8. Wahl schließen.
9. Ergebnis im Admin-Bereich auswerten, kopieren oder als CSV exportieren.

## Wahlcodes

Wahlcodes werden im Browser zufällig erzeugt und gut ablesbar formatiert, zum Beispiel `AB7K-29QF`. In Supabase wird nur ein SHA-256-Hash des normalisierten Codes gespeichert.

Die Klartext-Codes werden nur direkt nach dem Erzeugen angezeigt. Danach können sie aus Sicherheitsgründen nicht erneut im Klartext aus der Datenbank gelesen werden.

## Zentrale Wahlregel

Die Regel gegen Häufelung wird doppelt abgesichert:

- im Frontend: bereits ausgewählte Kandidaturen werden in anderen Auswahlfeldern deaktiviert
- in Supabase: `cast_vote(election_id, token_plaintext, candidate_ids)` prüft atomar, dass genau die richtige Anzahl unterschiedlicher Kandidaturen gewählt wurde

Die RPC-Funktion prüft außerdem:

- Wahl existiert und ist geöffnet
- Wahlcode ist gültig
- Wahlcode wurde noch nicht verwendet
- alle Kandidaturen gehören zur richtigen Wahl
- der Stimmzettel enthält keine doppelten Kandidaturen
- erst danach werden Stimmzettel, Einzelstimmen und verwendeter Wahlcode gespeichert

In `ballots` wird kein Wahlcode gespeichert. Dadurch ist ein Stimmzettel nicht direkt mit einem Wahlcode verknüpft.

## Datenschutz

Die App speichert keine Namen der Wählenden. Verarbeitet werden nur:

- Wahl- und Kandidatendaten
- Hashes der Wahlcodes
- Stimmzettel ohne Tokenbezug
- Einzelstimmen je Kandidatur

Normale Wählerinnen und Wähler können keine Ergebnisdaten lesen und nicht direkt in `votes`, `ballots` oder `voter_tokens` schreiben. Die Stimmabgabe läuft ausschließlich über die RPC-Funktion.

## GitHub Pages

1. Repository mit `index.html`, `style.css`, `script.js`, `supabase.sql` und `README.md` erstellen.
2. Supabase-Werte in `script.js` eintragen.
3. Dateien nach GitHub pushen.
4. Unter `Settings` -> `Pages` den Branch auswählen.
5. Die angezeigte GitHub-Pages-URL als Wahl-Link verwenden.

Optional kann eine konkrete Wahl per URL-Parameter vorausgewählt werden:

```text
https://deinname.github.io/dein-repo/?election=WAHL-ID
```
