# eevee-tracker-3000

## Summary
The Eevee-Tracker 3000 is a little tool I'm building to help my wife Eve (AKA Eevee) keep track of her daily/weekly/monthly gametime and ranked progression. She wants to play more consistently and, being an engineer, I think a tool that shows her exactly how many hours she's putting in and contrasting that with her level of play/rank will really help to motivate her.

Given the use case, I'll be leaning almost entirely on the [spectator-v4](https://developer.riotgames.com/apis#spectator-v4) API to tell me when she's in/out of game. I also use the [league-v4](https://developer.riotgames.com/apis#league-v4) and [match-v5](https://developer.riotgames.com/apis#match-v5) APIs for metadata and ranked context but the main goal is tracking in-game time versus out-of-game time.

## Configuration and Setup
Install production dependencies with `npm install` or add `--production=false` to include `nodemon`.

`config.json` is used to specify the LoL account to track ([account-v1](https://developer.riotgames.com/apis#account-v1) is helpful for gathering these values) and `.env` is used to specify the Riot API key and PostgreSQL connection details.

`.env` should include the following values:
- `RIOT_API_KEY`
- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`

The PostgreSQL database should be named `eeveetracker` and can be configured by running the following:

```sql
CREATE TABLE public.match (
  timestp timestamp without time zone NULL,
  eevee_won boolean NOT NULL,
  participants text [] NOT NULL,
  info json NOT NULL,
  created_at timestamp without time zone NOT NULL,
  id text NOT NULL
);
ALTER TABLE
  public.match
ADD
  CONSTRAINT match_pkey PRIMARY KEY (id);

ALTER TABLE
	public.match
ADD
	COLUMN duration INT GENERATED ALWAYS AS ((info->>'gameDuration')::INT) STORED;

CREATE TABLE public.summary (
  data json NOT NULL,
  created_at timestamp without time zone NOT NULL,
  id integer NOT NULL
);
ALTER TABLE
  public.summary
ADD
  CONSTRAINT summary_pkey PRIMARY KEY (id);
```

*The `match.timestp` column should be generated in similar fashion to `match.duration`, but I forgot to copy the `ALTER TABLE` statement when I wrote it. This will be added to the above script in the future.*

## Usage

Use `npm run start` to run in production mode or `npm run watch` to run in development mode with `nodemon`.