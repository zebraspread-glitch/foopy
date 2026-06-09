/**
 * Player image URL helper.
 *
 * Images live in public/players/ in git but at 647 MB the folder exceeds
 * Vercel's static-asset deployment limit, so we serve them via jsDelivr
 * (a free CDN that mirrors public GitHub repos) instead of /public.
 */

export const PLAYER_IMG_BASE = "https://cdn.jsdelivr.net/gh/zebraspread-glitch/foopy@main/public";
const CDN = PLAYER_IMG_BASE;

const CLUB_FOLDER: Record<string, string> = {
  adelaide: "crows", brisbanelions: "lions", brisbane: "lions", carlton: "blues",
  collingwood: "magpies", essendon: "bombers", fremantle: "dockers",
  geelongcats: "cats", geelong: "cats", goldcoast: "suns", gwsgiants: "giants",
  gws: "giants", hawthorn: "hawks", melbourne: "demons",
  northmelbourne: "kangaroos", portadelaide: "power", richmond: "tigers",
  stkilda: "saints", sydney: "swans", sydneyswans: "swans",
  westcoast: "eagles", westcoasteagles: "eagles", westernbulldogs: "bulldogs",
};

function slugTeam(t: string) { return t.toLowerCase().replace(/[^a-z0-9]/g, ""); }

/** Returns the CDN URL for a player's headshot. */
export function playerImgUrl(name: string, team: string): string {
  const slug   = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const folder = CLUB_FOLDER[slugTeam(team)] ?? slugTeam(team);
  if (!slug || !folder) return "";
  return `${CDN}/players/${folder}/${slug}.png`;
}

/** Same as playerImgUrl but accepts an already-resolved folder string. */
export function playerImgUrlFromFolder(folder: string, slug: string): string {
  if (!slug || !folder) return "";
  return `${CDN}/players/${folder}/${slug}.png`;
}
