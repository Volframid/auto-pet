# Pet Companion

Automatic pet care by CEM for TERA Toolbox. Install in the `auto-pet` folder; the command is `pet`.

Summon your preferred pet and use its buff once. The module remembers that pet and its buff automatically. Every character has a separate profile, identified by server and character ID. Different characters can use different pets without mixing their settings. Renaming a character does not erase its profile.

On subsequent logins, the saved pet is summoned automatically. If its learned buff is missing and its real cooldown is ready, it is used as soon as the character and pet are ready, without waiting for an old saved refresh deadline. If cooldown remains, recovery runs when that cooldown ends. A restored buff is recognized and keeps the existing refresh schedule.

Normal refresh is every **3 minutes 30 seconds**, counted from server-confirmed use and, when observed, the actual buff application. Sending a request, a failed attempt or receiving an old login snapshot does not restart that clock. A longer real cooldown remains authoritative; no extra 30 seconds are added after it ends. If a learned effect disappears early, missing-buff recovery takes priority over the normal interval once the skill is ready. There is no save command or repeated setup.

Buff effect IDs are learned automatically from the active pet's real effects following its skill use, separately for each character and pet. Effects are tracked through server begin, refresh, end and expiry events. Until an older profile has learned its effect IDs, login recovery still uses its saved cooldown and bounded requests; it cannot positively identify a restored effect yet. This avoids treating unrelated player/class buffs as pet buffs. The server decides whether a cast succeeds.

Switching pets updates the current character's selection after the real spawn arrives. A new pet never inherits another pet's buff: use its buff once to teach it. Previously learned pets retain their own buff when selected again. Other players' pets and generated buff packets do not teach the module.

Automation pauses during loading, death, mounting and contracts, and stops cleanly on character changes. Summon attempts and unanswered buff retries are bounded. A failed summon does not cause endless packet spam. The module sends servant packets only for these actions; it does not cancel or rewrite player attacks.

Optional feeding uses the active pet's reported maximum energy, sends one food item per attempt and stays paused during combat. Existing food choices and thresholds are retained.

## Commands

| Command | Action |
| --- | --- |
| `pet` / `pet status` | Show this character's remembered pet and buff. |
| `pet on` / `pet off` | Resume or pause this character's automation. |
| `pet toggle` | Toggle automation globally. |
| `pet summon` | Retry summoning the remembered pet. |
| `pet feed 75` | Feed below the chosen energy percentage (1–99). |

Character profiles are private settings in `config.json`. Older saved pets and their matching character buffs migrate automatically to settings version 4 without losing their selections, skills or preferences. Automatic updates use the CEM-maintained auto-pet repository; the former upstream update channel is not used. Live behavior should be verified with the character's actual pet and buff.

Based on the original Auto Pet by HSDN / PsykoDev; pet memory, character profiles and scheduling rebuilt by CEM.

## Install and update

Download the ZIP from [Releases](https://github.com/Volframid/auto-pet/releases/latest) and extract the `auto-pet` folder into `Toolbox/mods`. Keep only one installation of this module. Toolbox downloads subsequent updates automatically when module updates are enabled. Existing private settings are preserved.
