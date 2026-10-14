# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, equally important (confirmed by the owner, 2026-10-14):

- **Charles (charlesshen), the owner.** Uses the private side daily as his own reading and thinking system: reviewing book highlights, saving articles to read later, reading newsletters, keeping a list of recurring questions. Opens it as an installed home-screen app and in the browser.
- **Readers of the public pages.** People who come to read what Charles thinks. Their job is reading, mainly the Stream and Writing pages; Projects shows what he is working on.

## Product Purpose

Unwind collects scattered input (books, articles, passing thoughts) into one searchable place, and brings it back when it is needed. Its own line: 「散落各處的輸入 —— 書、文章、念頭 —— 在這裡收斂成一個可被搜尋的腦。需要時，才找出來用。」 Motto: *from many, one*.

Success for the owner: what he reads and thinks converges instead of piling up, and resurfaces (daily review, search, linking) when it is useful. Success for a reader: they read his thoughts, in Stream and Writing.

## Positioning

A personal "searchable brain" that is also a public notebook: the same place holds the owner's private reading tools (Kobo highlights, read-later, newsletters, daily review push) and the public writing that comes out of them. It is built by and for one person, so its structure follows his habits rather than a product category.

## Operating Context

- Hosted on GitHub Pages at theunwindpath.com (repo `charles555456/Unwind`), backed by Supabase for posts and private data.
- Kobo highlights reach the site through a local sync job that exports `kobo-highlights.json`; publishing it is a manual push.
- Installable as a home-screen web app with a daily review notification at a time the owner chooses.
- Video summaries are published as standalone pages under `/videos/`; saved Instagram and YouTube items feed Read Later through separate skills.
- Several Claude sessions edit this repo. Changes are committed locally and pushed only when the owner says 「推」.

## Capabilities and Constraints

- Public pages: Home, Projects, Stream, Writing.
- Private pages, shown only after unlocking with the password: Highlights, Review (daily review), Reading (Kobo notes), Problems, Later (read-later with highlighting), Inbox (newsletters), Private.
- Static site with no build step: one `index.html` plus plain scripts (`extras.js`, `pwa.js`, `review-pick.js`, `pointcloud.js`, `astronaut.js`, `page-art.js`).
- Private reads and all writes go through password-checked database functions.
- Open, not decided: whether the design is phone-first, and a language policy for UI text. Both were offered and not made binding.

## Brand Commitments

- Name: **Unwind**, by **charlesshen**. Motto *from many, one*.
- Visual commitment made binding by the owner: black background, monochrome, point-dust imagery in the manner of the home page particle sphere (see the `point-dust` skill). No cute or mascot styling, and no stock effects such as glows, lens flares or coloured glitch.
- Private content stays locked: nothing from the private side may appear on public pages or before unlocking.

## Evidence on Hand

- Real public posts in Stream and Writing (Supabase), real projects with thumbnails in `projects/` (DinoCut, yet coffee × Deep Work, yet POS, Timebox, Price Action Trading).
- About 2,500 Kobo highlights across about 70 books in `kobo-highlights.json`.
- Video summary pages in `videos/`.
- Point-art assets in `art/`, made from public-domain sources listed in `art/CREDITS.txt`.
- Absent, and not to be invented: testimonials, follower or reader counts, press, a contact or collaboration channel.

## Product Principles

1. **Reading comes first in public.** Public pages exist so people can read his thoughts; everything there serves reading Stream and Writing.
2. **Converge, don't accumulate.** New features should help input turn into something findable or reusable, not add another pile.
3. **Private stays private.** The private side is a personal tool; its content and controls never leak into public pages.
4. **Quiet over spectacle.** The site should feel calm enough to think in; imagery and motion are restrained.
5. **One owner's habits are the spec.** Structure follows how Charles actually reads and writes, not what a generic personal site usually has.
