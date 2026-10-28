# Szakaszidő

Böngészős rally időfutam Iklad, Domony, Aszód, Dunakeszi és Fót valódi utcáin, közös ranglistával, körpályákkal és drift arénával.

## Felépítés

- `public/index.html` – maga a játék, egyetlen fájlban
- `netlify/functions/api.mjs` – a ranglista szervere (Netlify Functions)
- `netlify.toml`, `package.json` – a Netlify beállításai

A csúcsokat és a szellemautók meneteit a Netlify Blobs tárolja, külön adatbázis nem kell.

## Feltöltés Netlifyra GitHubon keresztül

1. GitHubon hozz létre egy új repót (például `szakaszido`).
2. A repó oldalán válaszd az „uploading an existing file” lehetőséget, és húzd be ennek a mappának a teljes tartalmát úgy, hogy a mappaszerkezet megmaradjon.
3. Netlifyon: Add new project → Import an existing project → GitHub → válaszd ki a repót.
4. A beállításokat a `netlify.toml` megadja, csak kattints a Deploy gombra.

Ezután minden GitHubra feltöltött változás automatikusan kikerül az oldalra.

## Feltöltés parancssorból (ha van Node.js)

```
npm install
npx netlify-cli login
npx netlify-cli deploy --prod
```

Fontos: a sima „drag and drop” feltöltés (Netlify Drop) nem telepíti a szerverfüggvényt, ezért azzal a ranglista nem működik.

## Ranglista

- Minden név csak egyszer szerepelhet. A nevet az a böngésző birtokolja, ahol először megadták.
- A szerver ellenőrzi a beküldött meneteket: reális-e az idő, a rajtnál kezdődik és a célnál ér-e véget, nincs-e benne ugrás.
- Egy-egy bejegyzést a Netlify felületén, a projekt Blobs részében lehet törölni (`players`, `ghosts`, `daily` és `champ` tároló).

## Körpályák

- Iklad, Domony és Aszód körpályája (K1–K3) a falu valódi utcáin fut: a beégetett OSM-utcahálózatban talált leghosszabb zárt kör, a rövidebbeken több körrel (Iklad 1×6349 m, Domony 4×610 m, Aszód 3×1021 m).
- Az ikladi nagy kör kb. harmada a beégetett térképrészleten kívül, a határban fut; ott a terep a domborzati rács széléhez igazodik, a fákat és fasorokat a játék generálja. Az egykörös pályán a szokásos két részidő van (a kör harmadánál és kétharmadánál).
- Domonyban és Aszódon a beégetett adatokban nincs hosszabb zárt kör; hosszabbhoz újra le kellene tölteni a környék OSM-adatait.
- A köröket egy egyszeri szkript választotta ki (utcagráf a metszéspontokból, a körök pontozása hossz, kerekség és a közeli házak száma szerint); az eredmény a `LOOPS` konstansban van, a szerver a kezdőpontot és a hosszt ismeri.
- A szerver minden menetnél ellenőrzi, hogy a megtett út legalább a pálya hosszának 85%-a.

## Drift aréna

- A D1 Drift aréna szabad edzés: széles, zárt aszfaltkör füves szigettel, gumifallal és feldönthető bójákkal. Nincs cél és időkorlát, Esc-kel (szünet menü) lehet kilépni.
- Pont a csúszásért jár: csúszási szög (10°-tól) × sebesség × szorzó, a szorzó két másodpercenként nő (legfeljebb ×5). A csúszás 0,6 s nyugalom után ér véget és íródik jóvá; ütközéskor vagy a pályáról lecsúszva a folyamatban lévő pont elvész.
- Az arénában gázzal könnyebben kicsúszik az autó hátulja, így a drift gázzal tartható.
- A legjobb pontszám és a leghosszabb csúszás játékosonként, az eszközön tárolódik; a szerverre nem kerül.

## Napi kihívás

- Minden nap (budapesti idő szerint) egy szakasz és egy időjárás (napos, eső vagy alkony) a kihívás, mindenkinek ugyanaz. A játék és a szerver ugyanabból a dátumból, ugyanazzal a képlettel számolja.
- `GET /api/daily`: a mai kihívás és a napi ranglista. `POST /api/daily`: napi idő beküldése; a szerver ugyanúgy ellenőrzi a menetet, mint a sima ranglistánál, és csak a mai (éjfél után még 6 óráig a tegnapi) kihívást fogadja el.
- A napi idők a `daily` tárolóban vannak, `dátum/név` kulccsal.

## Bajnokság

- Az öt szakasz egymás után (Iklad napos, Domony eső, Aszód napos, Dunakeszi alkony, Fót éjszaka). Az ütközés sérülést okoz, a szakaszok között a szervizben időbüntetésért lehet javíttatni. Nincs újrakezdés, a szakasz közbeni kilépés feladás.
- `GET /api/champ`: a bajnoki ranglista. `POST /api/champ`: mind az öt menet és a szervizbüntetések; a szerver minden menetet ugyanúgy ellenőriz, mint a sima ranglistánál, és a sorrendet is.
- A bajnoki eredmények a `champ` tárolóban vannak, név szerinti kulccsal.

## Megosztás

- A célképernyőn a Megosztás gomb képet készít az eredményről, és a telefon megosztó menüjét nyitja meg. Ahol ez nincs, letölti a képet, és a linket a vágólapra másolja.
- A `?szakasz=r_iklad` link a szakaszválasztóra, a `?napi=1` link a napi kihívásra visz.
