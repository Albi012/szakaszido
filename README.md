# Szakaszidő

Böngészős rally időfutam Iklad, Domony, Aszód, Dunakeszi és Fót valódi utcáin, közös ranglistával.

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
- Egy-egy bejegyzést a Netlify felületén, a projekt Blobs részében lehet törölni (`players` és `ghosts` tároló).
