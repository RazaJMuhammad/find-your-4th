import type { Club, Game } from "@/lib/types";

const games = new Map<string, Game>();
let feed: { games: Game[]; clubs: Club[] } | null = null;
let mine: { userId: string; hosting: Game[]; playing: Game[] } | null = null;

export function rememberGame(game: Game) {
  games.set(game.id, game);
}

export function rememberGames(list: Game[]) {
  for (const game of list) rememberGame(game);
}

export function rememberedGame(id: string) {
  return games.get(id) ?? null;
}

export function readFeedCache() {
  return feed;
}

export function writeFeedCache(next: { games: Game[]; clubs: Club[] }) {
  feed = next;
  rememberGames(next.games);
}

export function readMineCache(userId: string) {
  return mine?.userId === userId ? mine : null;
}

export function writeMineCache(userId: string, hosting: Game[], playing: Game[]) {
  mine = { userId, hosting, playing };
  rememberGames(hosting);
  rememberGames(playing);
}
