export type TabKey = "feed" | "game" | "home" | "away" | "chat" | "polls";

export type SortKey =
  | "foopy"
  | "goals"
  | "goalAssists"
  | "disposals"
  | "kicks"
  | "handballs"
  | "marks"
  | "tackles"
  | "hitouts"
  | "inside50s"
  | "clearances"
  | "clangers"
  | "rebound50s"
  | "freesFor"
  | "freesAgainst";

export type StatMode = "basic" | "advanced";

export type MatchGame = {
  id?: string | number;
  hteam: string;
  ateam: string;
  hscore?: number | string;
  ascore?: number | string;
  complete?: number | string;
  is_final?: number;
  date?: string;
  round?: number | string;
  venue?: string;
  timestr?: string;   // Squiggle live clock e.g. "Q2 12:19"
  q?: number | string; // Squiggle current quarter number
};

export type PlayerStat = {
  player?: string;
  name?: string;
  team?: string;
  foopy?: number | string;

  goals?: number | string;
  goalAssists?: number | string;
  behinds?: number | string;

  disposals?: number | string;
  kicks?: number | string;
  handballs?: number | string;
  marks?: number | string;
  tackles?: number | string;
  hitouts?: number | string;

  inside50s?: number | string;
  clearances?: number | string;
  clangers?: number | string;
  rebound50s?: number | string;

  freesFor?: number | string;
  freesAgainst?: number | string;

  frees?: number | string;
  ff?: number | string;
  fa?: number | string;

  freeKicksFor?: number | string;
  freeKicksAgainst?: number | string;

  fantasy?: number | string;
  supercoach?: number | string;
  sc?: number | string;
  af?: number | string;
};

export type SavedMatchStats = {
  apiSportsId?: number | string;
  apiSportsGameId?: number | string;
  aflApiId?: number | string;
  matchId?: number | string;
  homeTeam?: string;
  awayTeam?: string;
  homePlayers?: any[];
  awayPlayers?: any[];
};

export type LiveEvent = {
  quarter?: string;
  period?: number | string;
  minute?: number | string;
  type?: string;
  teamId?: number | string;
  playerId?: number | string;
  label?: string;
  homeScore?: number | string;
  awayScore?: number | string;
};