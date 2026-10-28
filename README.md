# Taste Transplant

Moved somewhere new? Tell the app a few places you loved back home. It finds their closest matches in your new city, same brands first, and shows why each one fits.

Live demo: https://taste-transplant.vercel.app/

Built for the Qloo Agent Hackathon. This is an independent project. It is not affiliated with NYSC or any government body.

## Who it is for

Anyone starting over in a new place: students, people who move for work, and NYSC corps members who are posted to a state they have never lived in.

## What it does

You enter the city you moved from, the city or state you moved to, and 2 to 8 places you loved. No sign-up.

- **One section per place.** Same-brand places in your new city come first (up to 4, best known first), then similar places of the same kind. A stadium gives you stadiums, a church gives you churches.
- **A reason on every card.** Each card shows the tags it shares with your place, an Open in Maps link, and a Share trip button.
- **Matched vs popular.** A switch compares your matches with what is popular in the city, and with places that are rising. The page shows how many of your matches would not appear on a popular list.
- **Where in the city fits you.** A street map with a dot for each match, over a glow from Qloo's heatmap. You can look at all your places or one at a time.
- **Your first month.** A plan in four stages (days 1 to 3, week 1, weeks 2 and 3, week 4). Your own matches go first, then well-rated basics like a pharmacy or a clinic. You can tick things off and print it.
- **Music, shows and podcasts** that fit your places, tuned to the new city.
- **Miss a dish?** Type foods you miss. It finds places in your new city known for them, or the closest cuisine if none are.
- **Which city fits you better?** Run the same places through a second city and compare the counts.
- **Share as picture.** A card you can post to WhatsApp or social media.
- **Honest results.** If a place is not found you get "Did you mean" buttons. If nothing close exists in your new city, the page says so.

## How Qloo is used

All calls run on the server, so the key never reaches the browser.

- `/search` finds your places by name near your home city's map point, and finds same-brand places near your new city.
- `/entities` reads each place's tags and photos.
- `/v2/insights` with `filter.type=urn:entity:place` uses your place as the taste signal (`signal.interests.entities`), the new city as the location, the kind of place as a tag filter (`filter.tags`), and `bias.content_based`, `bias.quality` and `bias.trends` to shape the ranking.
- `/v2/insights` with `filter.type=urn:heatmap` draws the taste map.
- `/v2/insights` with `urn:entity:artist`, `urn:entity:tv_show` and `urn:entity:podcast` gives the music, shows and podcasts.
- `/v2/tags` finds tag IDs for kinds of places, dishes and cuisines.

Without Qloo's taste data there is nothing to connect a place in one city to a place in another.

## Run it yourself

1. Get a key for the Qloo hackathon API.
2. Copy `.env.example` to `.env.local` and put your key in it.
3. Run:

```
npm install
npm run dev
```

4. Open http://localhost:3000

## Settings

- `QLOO_API_KEY`: your key
- `QLOO_BASE_URL`: `https://hackathon.api.qloo.com`

## Built with

Next.js, React, TypeScript, Tailwind CSS, Leaflet and OpenStreetMap for the map, the Wikipedia API for city photos and map points, and Vercel for hosting.

## Known limits

- Qloo's TV and podcast catalog leans American, so shows and podcasts are less local than music.
- Dish tags are thin for some regional foods, so the dish finder may show the closest cuisine instead.
- A search can take 10 to 20 seconds, because calls to Qloo are spaced out to stay under its rate limit.
- The comparison only counts matches in Qloo's data. It does not weigh jobs, rent or safety.

## License

MIT. See the LICENSE file.
