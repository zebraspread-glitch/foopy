import playersJson from "@/app/data/players.json";

export type CardPlayer = {
  id: string;
  name: string;
  team: string;
  folder: string;
  teamLogo: string;
  position: "FWD" | "MID" | "DEF" | "RUCK";
};

const CARD_NAME_OVERRIDES: Record<string, string> = {
  adamsweid: "Adam Sweid",
  aidenriddle: "Aiden Riddle",
  angusclarke: "Angus Clarke",
  balynobrien: "Balyn O'Brien",
  bennybarrett: "Benny Barrett",
  bobbyhill: "Bobby Hill",
  callumbrown: "Callum Brown",
  charlienicholls: "Charlie Nicholls",
  cillianbourke: "Cillian Bourke",
  codyangove: "Cody Angove",
  coopersimpson: "Cooper Simpson",
  darcyjones: "Darcy Jones",
  finnegandavis: "Finnegan Davis",
  harrisonjones: "Harrison Jones",
  harrisonoliver: "Harrison Oliver",
  harrisonramm: "Harrison Ramm",
  harrydemattia: "Harry DeMattia",
  harveyharrison: "Harvey Harrison",
  ilirosmit: "Iliro Smit",
  ivansoldo: "Ivan Soldo",
  jackough: "Jack Ough",
  jaisaxena: "Jai Saxena",
  jakobryan: "Jakob Ryan",
  jarencarr: "Jaren Carr",
  joshkelly: "Josh Kelly",
  joshsinn: "Josh Sinn",
  joshuadraper: "Joshua Draper",
  kaylegerryn: "Kayle Gerryn",
  leonkickett: "Leon Kickett",
  lewishayes: "Lewis Hayes",
  liammcmahon: "Liam McMahon",
  logansmith: "Logan Smith",
  maniliddy: "Mani Liddy",
  nathanwardius: "Nathan Wardius",
  nickbryan: "Nick Bryan",
  nicmartin: "Nic Martin",
  noahhowes: "Noah Howes",
  olliemurphy: "Ollie Murphy",
  oskartaylor: "Oskar Taylor",
  reefmcinnes: "Reef McInnes",
  rhysunwin: "Rhys Unwin",
  rileyhamilton: "Riley Hamilton",
  rydaluke: "Ryda Luke",
  sampowellpepper: "Sam Powell-Pepper",
  samswadling: "Sam Swadling",
  samsturt: "Sam Sturt",
  samtaylor: "Sam Taylor",
  tewjiath: "Tew Jiath",
  tobynmurray: "Tobyn Murray",
  tobywhan: "Toby Whan",
  tomanastasopoulos: "Tom Anastasopoulos",
  tomcochrane: "Tom Cochrane",
  tomgreen: "Tom Green",
  tyanprindable: "Tyan Prindable",
  vigovisentini: "Vigo Visentini",
  willsetterfield: "Will Setterfield",
  xavierwalsh: "Xavier Walsh",
  zacmccarthy: "Zac McCarthy",
};

export const CARD_PLAYER_ID_ALIASES: Record<string, string> = {
  archiemay: "archermay",
  bodieryan: "brodieryan",
  bradleyclose: "bradclose",
  chrisscerri: "christopherscerri",
  connornash: "conornash",
  danielbutler: "danbutler",
  josephfonti: "joefonti",
  joshdraper: "joshuadraper",
  joshuagibcus: "joshgibcus",
  joshuakelly: "joshkelly",
  kaylegerreyn: "kaylegerryn",
  lennoxhoffman: "lennoxhofmann",
  leolombard: "leonardolombard",
  matthewroberts: "mattyroberts",
  mitchellknevitt: "mitchknevitt",
  mitchellewis: "mitchlewis",
  mitchitoowens: "mitchowens",
  nickdriscoll: "nicholasdriscoll",
  nikolascox: "nikcox",
  noahrobertsthomson: "noahrobertsthompson",
  olliedempsey: "oliverdempsey",
  olliegreeves: "olivergreeves",
  roberthansenjr: "roberthansen",
  thomassims: "tomsims",
  willgreen: "williamgreen",
  zacharywilliams: "zacwilliams",
};

export const CARD_PLAYERS: CardPlayer[] = [
  // ── Carlton (Blues) ──────────────────────────────────────
  { id: "adamcerra",       name: "Adam Cerra",       team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "MID" },
  { id: "adamsaad",        name: "Adam Saad",        team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },
  { id: "ashtonmoir",      name: "Ashton Moir",      team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "MID" },
  { id: "benainsworth",    name: "Ben Ainsworth",    team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "bencamporeale",   name: "Ben Camporeale",   team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },
  { id: "billywilson",     name: "Billy Wilson",     team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "blakeacres",      name: "Blake Acres",      team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "MID" },
  { id: "brodiekemp",      name: "Brodie Kemp",      team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "MID" },
  { id: "campbellchesser", name: "Campbell Chesser", team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },
  { id: "cooperlord",      name: "Cooper Lord",      team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "elijahhollands",  name: "Elijah Hollands",  team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "MID" },
  { id: "flynnyoung",      name: "Flynn Young",      team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },
  { id: "francisevans",    name: "Francis Evans",    team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "georgehewett",    name: "George Hewett",    team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "MID" },
  { id: "harrycharleson",  name: "Harry Charleson",  team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "MID" },
  { id: "harrydean",       name: "Harry Dean",       team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },
  { id: "harrymckay",      name: "Harry McKay",      team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "harryofarrell",   name: "Harry O'Farrell",  team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },
  { id: "hudsonokeeffe",   name: "Hudson O'Keeffe",  team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "MID" },
  { id: "jackison",        name: "Jack Ison",        team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "MID" },
  { id: "jacobweitering",  name: "Jacob Weitering",  team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },
  { id: "jaggasmith",      name: "Jagger Smith",     team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "jessemotlop",     name: "Jesse Motlop",     team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "jordanboyd",      name: "Jordan Boyd",      team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "lachiefogarty",   name: "Lachie Fogarty",   team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "lachlancowan",    name: "Lachlan Cowan",    team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },
  { id: "lewisyoung",      name: "Lewis Young",      team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },
  { id: "liamreidy",       name: "Liam Reidy",       team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "MID" },
  { id: "lucascamporeale", name: "Lucas Camporeale", team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },
  { id: "marcpittonet",    name: "Marc Pittonet",    team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "RUCK" },
  { id: "mattduffy",       name: "Matt Duffy",       team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },
  { id: "matthewcarroll",  name: "Matthew Carroll",  team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "matthewcottrell", name: "Matthew Cottrell", team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "mitchmcgovern",   name: "Mitch McGovern",   team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "nickhaynes",      name: "Nick Haynes",      team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },
  { id: "nicnewman",       name: "Nic Newman",       team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },
  { id: "oliverflorent",   name: "Oliver Florent",   team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "MID" },
  { id: "oliverhollands",  name: "Oliver Hollands",  team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "MID" },
  { id: "patrickcripps",   name: "Patrick Cripps",   team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "MID" },
  { id: "robmonahan",      name: "Rob Monahan",      team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },
  { id: "samwalsh",        name: "Sam Walsh",        team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "MID" },
  { id: "talorbyrne",      name: "Talor Byrne",      team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "wadederksen",     name: "Wade Derksen",     team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "willhayward",     name: "Will Hayward",     team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "FWD" },
  { id: "zacwilliams",     name: "Zac Williams",     team: "Carlton",          folder: "blues",    teamLogo: "/team-logos/blues.png",     position: "DEF" },

  // ── Western Bulldogs ─────────────────────────────────────
  { id: "aaronnaughton",     name: "Aaron Naughton",     team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "FWD" },
  { id: "adamtreloar",       name: "Adam Treloar",       team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "MID" },
  { id: "arthurjones",       name: "Arthur Jones",       team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "DEF" },
  { id: "baileydale",        name: "Bailey Dale",        team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "DEF" },
  { id: "baileywilliams",    name: "Bailey Williams",    team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "FWD" },
  { id: "bukukhamis",        name: "Buku Khamis",        team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "FWD" },
  { id: "codyweightman",     name: "Cody Weightman",     team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "FWD" },
  { id: "connorbudarick",    name: "Connor Budarick",    team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "MID" },
  { id: "cooperhynes",       name: "Cooper Hynes",       team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "DEF" },
  { id: "edrichards",        name: "Ed Richards",        team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "DEF" },
  { id: "harveygallagher",   name: "Harvey Gallagher",   team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "MID" },
  { id: "jamesodonnell",     name: "James O'Donnell",    team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "DEF" },
  { id: "jeddbusslinger",    name: "Jedd Busslinger",    team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "MID" },
  { id: "joelfreijah",       name: "Joel Freijah",       team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "DEF" },
  { id: "jordancroft",       name: "Jordan Croft",       team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "RUCK" },
  { id: "joshdolan",         name: "Josh Dolan",         team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "FWD" },
  { id: "lachiejaques",      name: "Lachie Jaques",      team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "DEF" },
  { id: "lachlanbramble",    name: "Lachlan Bramble",    team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "MID" },
  { id: "lachlancarmichael", name: "Lachlan Carmichael", team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "FWD" },
  { id: "lachlanmcneil",     name: "Lachlan McNeil",     team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "FWD" },
  { id: "lachlansmith",      name: "Lachlan Smith",      team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "DEF" },
  { id: "laithamvandermeer", name: "Laitham Vandermeer", team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "MID" },
  { id: "louisemmett",       name: "Louis Emmett",       team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "FWD" },
  { id: "lukecleary",        name: "Luke Cleary",        team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "DEF" },
  { id: "lukekennedy",       name: "Luke Kennedy",       team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "FWD" },
  { id: "marcusbontempelli", name: "Marcus Bontempelli", team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "MID" },
  { id: "matthewkennedy",    name: "Matthew Kennedy",    team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "MID" },
  { id: "michaelsellwood",   name: "Michael Sellwood",   team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "FWD" },
  { id: "nickcoffield",      name: "Nick Coffield",      team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "DEF" },
  { id: "oskarbaker",        name: "Oskar Baker",        team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "MID" },
  { id: "rhyleewest",        name: "Rhylee West",        team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "MID" },
  { id: "rileygarcia",       name: "Riley Garcia",       team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "MID" },
  { id: "rorylobb",          name: "Rory Lobb",          team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "RUCK" },
  { id: "ryangardner",       name: "Ryan Gardner",       team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "DEF" },
  { id: "ryleysanders",      name: "Ryley Sanders",      team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "MID" },
  { id: "samdarcy",          name: "Sam Darcy",          team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "RUCK" },
  { id: "samdavidson",       name: "Sam Davidson",       team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "DEF" },
  { id: "thomasliberatore",  name: "Thomas Liberatore",  team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "MID" },
  { id: "timothyenglish",    name: "Timothy English",    team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "RUCK" },
  { id: "willdarcy",         name: "Will Darcy",         team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "RUCK" },
  { id: "willlewis",         name: "Will Lewis",         team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "FWD" },
  { id: "zacwalker",         name: "Zac Walker",         team: "Western Bulldogs", folder: "bulldogs", teamLogo: "/team-logos/bulldogs.png", position: "FWD" },

  // ── Adelaide Crows ────────────────────────────────────────
  { id: "alexnealbullen",  name: "Alex Neal-Bullen",  team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },
  { id: "archieludowyke",  name: "Archie Ludowyke",   team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "benkeays",        name: "Ben Keays",         team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },
  { id: "billydowling",    name: "Billy Dowling",     team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "FWD" },
  { id: "braydencook",     name: "Brayden Cook",      team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },
  { id: "callumahchee",    name: "Callum Ah Chee",    team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "FWD" },
  { id: "charlieedwards",  name: "Charlie Edwards",   team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "chaycejones",     name: "Chayce Jones",      team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },
  { id: "danielcurtin",    name: "Daniel Curtin",     team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "darcyfogarty",    name: "Darcy Fogarty",     team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "FWD" },
  { id: "finnbarmaley",    name: "Finnbar Maley",     team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "RUCK" },
  { id: "hughbond",        name: "Hugh Bond",         team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "indycotton",      name: "Indy Cotton",       team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },
  { id: "isaaccumming",    name: "Isaac Cumming",     team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "izakrankine",     name: "Izak Rankine",      team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "FWD" },
  { id: "jakesoligo",      name: "Jake Soligo",       team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },
  { id: "jamesborlase",    name: "James Borlase",     team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },
  { id: "jamespeatling",   name: "James Peatling",    team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },
  { id: "jordandawson",    name: "Jordan Dawson",     team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "jordonbutts",     name: "Jordon Butts",      team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "joshrachele",     name: "Josh Rachele",      team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "FWD" },
  { id: "joshworrell",     name: "Josh Worrell",      team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "lachlanmcandrew", name: "Lachlan McAndrew",  team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "FWD" },
  { id: "lachlansholl",    name: "Lachlan Sholl",     team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "lukenankervis",   name: "Luke Nankervis",    team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "RUCK" },
  { id: "lukepedlar",      name: "Luke Pedlar",       team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },
  { id: "markkeane",       name: "Mark Keane",        team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "maxmichalanney",  name: "Max Michalanney",   team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "mitchellhinge",   name: "Mitchell Hinge",    team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },
  { id: "mitchellmarsh",   name: "Mitchell Marsh",    team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },
  { id: "nickmurray",      name: "Nick Murray",       team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "oscarryan",       name: "Oscar Ryan",        team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },
  { id: "reillyobrien",    name: "Reilly O'Brien",    team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "RUCK" },
  { id: "rileythilthorpe", name: "Riley Thilthorpe",  team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "FWD" },
  { id: "rorylaird",       name: "Rory Laird",        team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "samberry",        name: "Sam Berry",         team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },
  { id: "siddraper",       name: "Sid Draper",        team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "taylorwalker",    name: "Taylor Walker",     team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "FWD" },
  { id: "tobymurray",      name: "Toby Murray",       team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "tylerwelsh",      name: "Tyler Welsh",       team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },
  { id: "waynemilera",     name: "Wayne Milera",      team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "DEF" },
  { id: "zactaylor",       name: "Zac Taylor",        team: "Adelaide", folder: "crows", teamLogo: "/team-logos/crows.png", position: "MID" },

  // ── Brisbane Lions ────────────────────────────────────────
  { id: "benmurphy",        name: "Ben Murphy",        team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "brucereville",     name: "Bruce Reville",     team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "camrayner",        name: "Cam Rayner",        team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "FWD" },
  { id: "charliecameron",   name: "Charlie Cameron",   team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "FWD" },
  { id: "codycurtin",       name: "Cody Curtin",       team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "conormckenna",     name: "Conor McKenna",     team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "danielannable",    name: "Daniel Annable",    team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "FWD" },
  { id: "darcyfort",        name: "Darcy Fort",        team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "RUCK" },
  { id: "darcygardiner",    name: "Darcy Gardiner",    team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "darcywilmot",      name: "Darcy Wilmot",      team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "darraghjoyce",     name: "Darragh Joyce",     team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "daynezorko",       name: "Dayne Zorko",       team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "MID" },
  { id: "erichipwood",      name: "Eric Hipwood",      team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "FWD" },
  { id: "harrisandrews",    name: "Harris Andrews",    team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "henrysmith",       name: "Henry Smith",       team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "FWD" },
  { id: "hughmccluggage",   name: "Hugh McCluggage",   team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "MID" },
  { id: "jackpayne",        name: "Jack Payne",        team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "jamestunstill",    name: "James Tunstill",    team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "FWD" },
  { id: "jarrodberry",      name: "Jarrod Berry",      team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "MID" },
  { id: "jaspafletcher",    name: "Jaspa Fletcher",    team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "MID" },
  { id: "joshdunkley",      name: "Josh Dunkley",      team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "MID" },
  { id: "kailohmann",       name: "Kai Lohmann",       team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "FWD" },
  { id: "keideancoleman",   name: "Keidean Coleman",   team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "kobyevans",        name: "Koby Evans",        team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "MID" },
  { id: "lachieneale",      name: "Lachie Neale",      team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "MID" },
  { id: "leviashcroft",     name: "Levi Ashcroft",     team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "MID" },
  { id: "lincolnmccarthy",  name: "Lincoln McCarthy",  team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "FWD" },
  { id: "loganmorris",      name: "Logan Morris",      team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "lukebeecken",      name: "Luke Beecken",      team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "MID" },
  { id: "lukelloyd",        name: "Luke Lloyd",        team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "FWD" },
  { id: "noahanswerth",     name: "Noah Answerth",     team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "oscarallen",       name: "Oscar Allen",       team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "FWD" },
  { id: "reecetorrent",     name: "Reece Torrent",     team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "ryanlester",       name: "Ryan Lester",       team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "samdraper",        name: "Sam Draper",        team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "RUCK" },
  { id: "sammarshall",      name: "Sam Marshall",      team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "shadeaubrain",     name: "Shadeau Brain",     team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "FWD" },
  { id: "taihayes",         name: "Tai Hayes",         team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "MID" },
  { id: "tomdoedee",        name: "Tom Doedee",        team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "tygallop",         name: "Ty Gallop",         team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "MID" },
  { id: "willashcroft",     name: "Will Ashcroft",     team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "MID" },
  { id: "willmclachlan",    name: "Will McLachlan",    team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },
  { id: "zacbailey",        name: "Zac Bailey",        team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "MID" },
  { id: "zanezakostelsky",  name: "Zane Zakostelsky",  team: "Brisbane Lions", folder: "lions", teamLogo: "/team-logos/lions.png", position: "DEF" },

  // New image-backed teams
  ...makeTeamCards("Collingwood", "magpies", [
    "angusanderson", "beaumccreery", "billyframpton", "bobbyhill", "braydenmaynard", "charliewest", "danhouston", "danielmcstay", "darcycameron", "darcymoore", "edwardallan", "harrydemattia", "harryperryman", "harveyharrison", "ilirosmit", "isaacquaynor", "jackbuller", "jackcrisp", "jaisaxena", "jakobryan", "jamieelliott", "jeremyhowe", "joelcochran", "jordandegoey", "joshdaicos", "lachieschultz", "lachiesullivan", "nedlong", "nickdaicos", "noahhowes", "oscarsteene", "patricklipinski", "reefmcinnes", "roansteele", "samswadling", "scottpendlebury", "steelesidebottom", "tewjiath", "timmembrey", "tyanprindable", "williamhayes", "wilparker", "zacmccarthy",
  ]),
  ...makeTeamCards("Essendon", "bombers", [
    "andrewmcgrath", "angusclarke", "archerdaywicks", "archermay", "archieperkins", "archieroberts", "benmckay", "braydenfiorini", "cillianbourke", "darcyparish", "dysonsharp", "elijahtsatas", "harrisonjones", "hussienelachkar", "isaackako", "jacobfarrow", "jadegresham", "jaxonprior", "jaydennguyen", "jordanridley", "jyecaldwell", "kaylegerryn", "kylelangford", "lachlanblakiston", "lewishayes", "liammcmahon", "masonredman", "mattguelfi", "maxkondogiannis", "natecaddy", "nickbryan", "nicmartin", "nikcox", "peterwright", "rhysunwin", "saadelhawli", "samdurham", "sullivanrobey", "thomasedwards", "vigovisentini", "willsetterfield", "xavierduursma", "zachmerrett", "zachreid", "zakjohnson",
  ]),
  ...makeTeamCards("Fremantle", "dockers", [
    "adamsweid", "aidenriddle", "alexpearce", "andrewbrayshaw", "baileybanfield", "brandonwalker", "brennancox", "calebserong", "charlienicholls", "christopherscerri", "coopersimpson", "coreywagner", "haydenyoung", "heathchapman", "hughdavies", "isaiahdudley", "jaegeromeara", "jarencarr", "jeremysharp", "jordanclark", "joshtreacy", "joshuadraper", "juddmcvee", "jyeamiss", "karlworner", "leonkickett", "lukejackson", "lukeryan", "masoncox", "matthewjohnson", "michaelfrederick", "murphyreid", "nathanodriscoll", "neilerasmus", "olliemurphy", "oscarmcdonald", "patrickvoss", "rydaluke", "samsturt", "samswitkowski", "seandarcy", "shaibolton", "tobynmurray", "tobywhan",
  ]),
  ...makeTeamCards("GWS", "giants", [
    "aaroncadman", "brentdaniels", "callumbrown", "claytonoliver", "codyangove", "connoridun", "conorstone", "darcyjones", "finncallaghan", "finnegandavis", "harrisonoliver", "harryhimmelberg", "harryrowston", "harveythomas", "jackbuckley", "jackough", "jakericcardi", "jakestringer", "jamesleake", "jaydenlaverde", "jessehogan", "joefonti", "josaiadelana", "joshkelly", "kierenbriggs", "lachieash", "lachiewhitfield", "leekaleer", "logansmith", "maxgruzewski", "nathanwardius", "nicholasmadden", "oliverhannaford", "oskartaylor", "phoenixgothard", "rileyhamilton", "ryanangwin", "samtaylor", "stephenconiglio", "tobybedford", "tobygreene", "tobymcmullin", "tomgreen", "xavierohalloran",
  ]),
  ...makeTeamCards("Geelong", "cats", [
    "baileysmith", "bradclose", "connorosullivan", "georgestevens", "gryanmiers", "harleybarker", "hunterholmes", "jackbowes", "jackhenry", "jackmartin", "jacobmolier", "jakekolodjashnij", "jamesworpel", "jedbews", "jeremycameron", "joepike", "keightonmatofaiforbes", "lawsonhumphries", "lennoxhoffman", "markblicavs", "markoconnor", "maxholmes", "mitchknevitt", "mitchelledwards", "nickdriscoll", "oisinmullin", "oliverhenry", "oliverwiltshire", "patrickdangerfield", "rhysstanley", "samdekoning", "shannonneale", "shaunmannagh", "tannerbruhn", "tobyconway", "tomatkins", "tomstewart", "tysonstengle", "zachguthrie",
  ]),
  ...makeTeamCards("Hawthorn", "hawks", [
    "aidanschubert", "baileymacdonald", "brodieryan", "calsherdear", "cammackenzie", "cameronnairn", "codyanderson", "connormacdonald", "conornash", "dylanmoore", "finnmaginness", "flynnperez", "harrymorrison", "henryhustwaite", "jackdalton", "jackginnivan", "jackgunston", "jackscrimshaw", "jainewcombe", "jamesblanck", "jamessicily", "jarmanimpey", "joshbattle", "joshward", "joshweddle", "karlamon", "lloydmeek", "mabiorchol", "massimodambrosio", "matthill", "maxramsden", "mitchlewis", "nedreeves", "nickwatson", "noahmraz", "olliegreeves", "sambutler", "tombarrass", "willday", "williammccabe",
  ]),
  ...makeTeamCards("Melbourne", "demons", [
    "aidanjohnson", "baileylaurie", "bayleyfritsch", "blakehowes", "brodymihocek", "calebwindsor", "christiansalem", "danielturner", "edlangdon", "harrisonpetty", "harrysharp", "harveylangford", "jackhenderson", "jacksteele", "jackviney", "jacobvanrooyen", "jakebowey", "jakelever", "jakemelksham", "jedadams", "kadechandler", "kalaniwhite", "latrellepickett", "lukerkentfield", "matthewjefferson", "maxgawn", "maxheath", "oscarberry", "paddycross", "rickymentha", "rileyonley", "shanemcadam", "thomasmatthews", "tomcampbell", "tommcdonald", "tomsparrow", "trentrivers", "xaviertaylor",
  ]),
  ...makeTeamCards("North Melbourne", "kangaroos", [
    "aidancorr", "baileyscott", "blakethredgold", "braydengeorge", "calebdaniel", "callumcolemanjones", "cameronzurhaar", "charliecomben", "charliespargo", "colbymckercher", "cooperharvey", "coopertrembath", "dylanstephens", "finnosullivan", "georgewardlaw", "griffinlogue", "harrysheezel", "hugomikunda", "jackdarling", "jacksonarcher", "jacobkonstanty", "joshgoater", "jysimpkin", "lachydovaston", "lukedaviesuniacke", "lukemcdonald", "lukeparker", "lukeurquhart", "mattwhitlock", "nicklarkey", "paulcurtis", "rileyhardeman", "riverstevens", "roberthansen", "taylorgoad", "tobypink", "tomblamires", "tompowell", "tristanxerri", "zacbanch", "zacfisher", "zaneduursma",
  ]),
  ...makeTeamCards("Richmond", "tigers", [
    "benmiller", "campbellgray", "dionprestia", "harryarmstrong", "hugoralphsmith", "jackross", "jacobhopper", "jamestrezise", "jasperalger", "jaydenshort", "jontyfaull", "joshsmillie", "judsonclarke", "kalebsmith", "kanemcauliffe", "liamfawcett", "luketrainor", "mauricerioli", "mykeltilefau", "nathanbroad", "nickvlastuin", "noahbalta", "oliverhayesbrown", "patrickretschko", "rhyanmansell", "sambanks", "samcumming", "samlalor", "samsonryan", "sethcampbell", "steelygreen", "tajhotton", "thomaslynch", "thomassims", "timtaranto", "tobynankervis", "tombrown", "tomburton", "tylersonsie", "zanepeucker",
  ]),
  ...makeTeamCards("St Kilda", "saints", [
    "alexdodson", "alixtauru", "angushastie", "anthonycaminiti", "bradleyhill", "callumwilkie", "charliebanfield", "coopersharman", "danbutler", "darcywilson", "dougalhoward", "eamonnarmstrong", "hughboxshall", "hugogarcia", "hunterclark", "isaackeeler", "jackcarroll", "jackhiggins", "jacksilvagni", "jacksinclair", "jackmacrae", "kobemcdonald", "kyefincher", "lancecollard", "liamhenry", "liamoconnell", "liamstocker", "marcuswindhager", "masonwood", "maxhall", "maxking", "mitchowens", "nasiahwanganeenmilera", "paddydow", "patricksaid", "rowanmarshall", "ryanbyrnes", "samflanders", "tobietravaglia", "tomdekoning",
  ]),
  ...makeTeamCards("Sydney", "swans", [
    "angussheldrick", "billycootee", "braedencampbell", "brodiegrundy", "caidencleary", "callummills", "chadwarner", "coreywarner", "danerampe", "errolgulden", "harrycunningham", "haydenmclean", "isaacheeney", "jaiserong", "jakelloyd", "jamesrowbottom", "jessedattoli", "joelhamling", "justinmcinerney", "lewismelican", "liamhetherton", "loganmcdonald", "nedbowman", "nickblakey", "noahchamberlain", "patricksnell", "peterladhams", "riakandrew", "rileybice", "samwicks", "tayloradams", "tomhanily", "tommccartin", "tompapley", "willgreen",
  ]),
  ...makeTeamCards("West Coast", "eagles", [
    "archerreid", "boallan", "bradyhough", "brandonstarcevich", "clayhall", "devenrobertson", "elijahhewett", "elliotyeo", "finlaymacrae", "fredrodriguez", "hamishdavis", "harleyreid", "harrybarnett", "harryedwards", "harryschoenberg", "harveyjohnston", "jackgraham", "jackhutchinson", "jackwilliams", "jacobnewton", "jakewaterman", "jamiecripps", "jobeshanahan", "joshlindsay", "liambaker", "liamduggan", "mattflynn", "matthewowies", "milanmurdock", "noahlong", "reubenginbey", "rhettbazzo", "ryanmaric", "samallen", "sandybrock", "timkelly", "tomcole", "tomgross", "tommccarthy", "tylerbrockman", "tyrelldewar", "willemduursma",
  ]),
  ...makeTeamCards("Gold Coast", "suns", [
    "alexdavies", "ashereastham", "averythomas", "baileyhumphrey", "beauaddinsall", "benjepson", "benking", "benlong", "calebgraham", "caleblewis", "charlieballard", "cooperbell", "danielrioli", "dylanpatterson", "elliotthimmelberg", "ethanread", "jaimurray", "jakerogers", "jarrodwitts", "jedwalter", "joeljeffrey", "johnnoble", "kobycoulson", "lachieweller", "lachlangulbin", "leonardolombard", "mattrowell", "maxknobel", "nedmoyle", "nickholman", "noahanderson", "oscaradams", "samclohesy", "samcollins", "toukmiller", "wilpowell", "willgraham", "zakevans",
  ]),
  ...makeTeamCards("Port Adelaide", "power", [
    "aliiraliir", "balynobrien", "bennybarrett", "brandonzerkthatcher", "christianmoraes", "connorrozee", "coreydurdin", "dantevisentini", "darcybyrnejones", "esavaratugolea", "ewanmackinlay", "harrisonramm", "ivansoldo", "jacklukosius", "jacksonmead", "jackwatkins", "jackwhitlock", "jacobmoss", "jacobwehr", "jaseburgoyne", "jasonhornefrancis", "joeberry", "joerichards", "jordonsweet", "joshlai", "joshsinn", "kanefarrell", "lachiejones", "loganevans", "maniliddy", "milesbergman", "mitchgeorgiades", "mitchzadow", "ollielord", "olliewines", "poe", "sampowellpepper", "toddmarshall", "tomanastasopoulos", "tomcochrane", "willbrodie", "willemdrew", "willlorenz", "xavierwalsh", "zakbutters",
  ]),
];

export const CARD_PLAYER_BY_ID = new Map(CARD_PLAYERS.map((player) => [player.id, player]));

export function normalizeCardPlayerId(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function resolveCardPlayerId(value: string | null | undefined): string {
  const normalized = normalizeCardPlayerId(value);
  return CARD_PLAYER_ID_ALIASES[normalized] ?? normalized;
}

export function findCardPlayerForCard(card: { player_id?: string | null; player_name?: string | null }) {
  const candidates = [card.player_id, card.player_name].map(resolveCardPlayerId).filter(Boolean);
  return candidates.map((id) => CARD_PLAYER_BY_ID.get(id)).find(Boolean) ?? null;
}

export function canonicalCardPlayerIdForCard(card: { player_id?: string | null; player_name?: string | null }) {
  return findCardPlayerForCard(card)?.id ?? resolveCardPlayerId(card.player_id);
}

export function getPlayerImage(folder: string, id: string): string {
  return `/players/${folder}/${id}.png`;
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeTeamCards(team: string, folder: string, ids: string[]): CardPlayer[] {
  const teamLogo = `/team-logos/${folder}.png`;

  return ids.map((id) => {
    const player = findPlayerByCardId(team, id);

    return {
      id,
      name: player?.name ?? CARD_NAME_OVERRIDES[id] ?? prettifyCardId(id),
      team,
      folder,
      teamLogo,
      position: "MID",
    };
  });
}

function findPlayerByCardId(team: string, id: string) {
  return (playersJson as Array<{ name: string; team: string }>).find(
    (player) => player.team === team && cardIdForName(player.name) === id
  );
}

function cardIdForName(name: string): string {
  return name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "");
}

function prettifyCardId(id: string): string {
  return id.replace(/(^|[a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (letter) => letter.toUpperCase());
}
