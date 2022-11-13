require('dotenv').config();

const { RiotClient, Riot } = require('poro');
const pgp = require('pg-promise')();
const express = require('express');

const db = pgp({
	host: process.env.DB_HOST,
	port: process.env.DB_PORT,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: 'eeveetracker',
});

const app = express();

const config = require('./config.json');
const apiKey = process.env.RIOT_API_KEY;
if (!apiKey) {
	throw `ERROR: RIOT_API_KEY environment variable not set, can't send requests without that!`;
}
const RANKED = 420;

const riot = new RiotClient({
	auth: process.env.RIOT_API_KEY,
	platform: Riot.Platform.NA,
	region: Riot.Region.AMERICAS,
});

const getGame = async () => {
	try {
		const game = await riot.path(
		'/lol/spectator/v4/active-games/by-summoner/{encryptedSummonerId}',
		{
			encryptedSummonerId: config.account.summonerId,
		})
		.get();

		return game.data;
	} catch(err) {
		return undefined;
	}
}

const getRankedInfo = async () => {
	const info = await riot.path(
		'/lol/league/v4/entries/by-summoner/{encryptedSummonerId}',
		{
			encryptedSummonerId: config.account.summonerId,
		})
		.get();

	return info.data.find(d => d.queueType === 'RANKED_SOLO_5x5');
}

const getToday = () => {
	const date = new Date();
	date.setHours(0, 0, 0, 0);
	return date.getTime()/1000;
}

const getMatch = async id => {
	const cached = await db.oneOrNone(`SELECT * FROM match WHERE id = $<id>`, {id});
	if (cached) {
		return cached;
	}

	const {data: raw} = await riot.path(
		'/lol/match/v5/matches/{matchId}',
		{
			matchId: id,
		}
	).get();

	const match = {
		id,
		info: raw.info,
		participants: raw.metadata.participants,
		eevee_won: raw.info.participants.find(p => p.summonerId === config.account.summonerId).win,
	};

	await db.none(`
		INSERT INTO match(id, info, participants, eevee_won)
		VALUES($<id>, $<info>, $<participants>, $<eevee_won>)`,
		match
	);

	return match;
};

const getTodaysMatches = async () => {
	const {data: ids} = await riot.path(
		'/lol/match/v5/matches/by-puuid/{puuid}/ids',
		{
			puuid: config.account.puuid,
		})
		.get({
			query: {
				startTime: getToday(),
				count: 100,
				queue: RANKED,
			}
		});

	const matches = await Promise.all(ids.map(getMatch));
	return matches.reverse();
}

const summarize = match => {
	const eevee = match.info.participants.find(p => p.summonerId === config.account.summonerId);
	return `${match.eevee_won ? 'won' : 'lost'} as ${eevee.championName} in ${(match.info.gameDuration / 60).toFixed(1)} minutes at ${new Date(match.info.gameCreation).toLocaleTimeString()}`;
}

const latestStatusTime = async ingame => {
	const raw = await db.one(`SELECT MAX(created_at) FROM summary WHERE data->>'ingame' = $<status>::TEXT`, {status: Boolean(ingame)});
	return new Date(raw.max + ' UTC');
};

const poll = async () => {
	const game = await getGame();
	let summary;
	if (game) {
		summary = {
			ingame: true,
			game,
		}
	} else {
		const info = await getRankedInfo();
		const matches = await getTodaysMatches();

		summary = {
			ingame: false,
			rank: `${info.tier} ${info.rank}`,
			lp: info.leaguePoints,
			today: {
				matches: matches.map(summarize),
				ratio: `${((matches.filter(m => m.eevee_won).length / matches.length) * 100).toFixed(0)}%`
			}
		}
	}

	const statusChangedAt = await latestStatusTime(!game);
	const status = `${game ? 'in-game' : 'out-of-game'} at ${new Date().toLocaleString()} since ${statusChangedAt.toLocaleTimeString()} (${
		((Number(new Date()) - Number(statusChangedAt)) / 1000 / 60).toFixed(1)
	} minutes)`;
	console.info(status);
	
	await db.none(`INSERT INTO summary(data) VALUES ($<data>)`, {data: summary});
	await db.none(`INSERT INTO status(output) VALUES ($<output>)`, {output: status});

	return status;
}

poll();
setInterval(poll, config.interval);

app.get('/', (req, res) => {
	const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
	console.info(`sending status to ${ip}`);
	poll().then(status => res.send(status));
});

app.listen(1313);
