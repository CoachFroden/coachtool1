# Coachtool1 – flere lag og sesonger

## Status
Første trygge grunnlag på egen utviklingsgren. Ingen eksisterende produksjonsdata eller sider er endret.

## Avdekket i eksisterende kode
- `kamper.js` oppretter kamper i toppnivåsamlingen `matches` uten lag- og sesongidentifikator.
- `statistikk.js` henter opptil 100 dokumenter fra `matches` uten sesongfilter.
- `oversikt.js` og `spillerbrukere.js` leser globale samlinger.
- Flere HTML-filer viser hardkodet «SAMNANGER G14».
- Firestore-regler må vurderes nøye før nye lag og sesonger kan skrives fra klienten.

## Datamodell
- `teams`: ett dokument per lag, uavhengig av sesong.
- `seasons`: én sesong knyttet til ett lag. Flere lag kan ha samme år.
- `seasonMemberships`: kobler eksisterende spiller-ID til lag og sesong.
- `matches`: beholder eksisterende samling, men nye dokumenter får `teamId` og `seasonId`.
- Historiske spillere beholder ID og historikk; en spiller kan tilhøre flere lag/sesonger.

## Migrering og utrulling
1. Eksporter og verifiser full Firestore-sikkerhetskopi. Ingen sletting.
2. Kartlegg alle lesinger og skrivinger i klient, Cloud Functions og Firestore-regler.
3. Opprett autoriserte lag- og sesongsamlinger med regler som håndhever lagtilgang.
4. Lag en eksplisitt migreringsplan: tilordne gamle kamper og spillere til riktig historisk lag/sesong, med forhåndsvisning og kontroll av antall før skriving.
5. Lag lag-/sesongvelger og administrasjon; lagre valgt kontekst per trener.
6. Oppdater alle kamp-, statistikk-, trenings-, utviklings- og spillerportalmoduler til å bruke valgt kontekst. Ingen globale fallback-spørringer.
7. Test flere lag i samme år, historikk, spiller på flere lag, tilgangskontroll og sesongbytte før sammenslåing.

## Viktige hensyn
- En ny sesong må ikke nullstille eksisterende statistikk eller overskrive spillerdata.
- Firestore-regler må validere `teamId` og tilgang på serversiden; klientfiltrering alene er ikke tilgangskontroll.
- Arkiverte sesonger bør være skrivebeskyttet i vanlig brukergrensesnitt.
- Samlinger som `assistantMatches`, `publicMatches`, refleksjoner og utviklingsplaner trenger egne beslutninger om lag-/sesongtilknytning.
- Ikke slå sammen denne grenen før migrering, regler og relevante moduler er implementert og testet.
