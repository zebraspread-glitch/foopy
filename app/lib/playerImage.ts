/**
 * Player image URL helper.
 *
 * Images are stored in Supabase Storage (bucket: "players").
 */

export const PLAYER_IMG_BASE = "https://ogdtvdvdtxohgyrhlgfk.supabase.co/storage/v1/object/public/players";
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
  return `${CDN}/${folder}/${slug}.png`;
}

/** Same as playerImgUrl but accepts an already-resolved folder string. */
export function playerImgUrlFromFolder(folder: string, slug: string): string {
  if (!slug || !folder) return "";
  return `${CDN}/${folder}/${slug}.png`;
}
