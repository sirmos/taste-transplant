# Taste Transplant

Moved somewhere new? Tell the app a few places you loved back home and it finds their closest matches in your new city, with the reason for each match.

Built for the Qloo Agent Hackathon.

## What it does

- You type the city you moved from, the city you moved to, and 2 to 6 places you loved.
- The app finds each place in Qloo, works out what kind of place it is (a stadium, a bar, a bookshop and so on), and builds a section for each kind.
- Each section shows places in your new city that match your taste, and says which of your places each one is like.
- A switch lets you compare with the popular places in the new city, so you can see what your taste changes.
- Each card has an "Open in Maps" link, and you can copy your whole list.

## How Qloo is used

- `/search` finds your places and the home city.
- `/entities` reads the tags of each place so the app knows what kind of place it is.
- `/v2/insights` with `filter.type=urn:entity:place`, your places as `signal.interests.entities`, and `filter.location.query` set to the new city gives the matches. `feature.explainability=true` tells us which of your places each match is closest to.
- The popular view uses the same endpoint with no taste input.

Without Qloo the app would have no way to say that a bar in one city is like a bar in another.

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

The key is only used on the server, so it never reaches the browser.

## License

MIT. See the LICENSE file.