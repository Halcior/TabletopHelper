import type { ExportFile } from '../src/features/companion/data'
// Synthetic parser/UI fixtures. Never imported by application runtime code.
export const companionCsv: Partial<Record<ExportFile, string>> = {
  'Factions.csv': 'id|name|\nAC|Adeptus Custodes|\n',
  'Datasheets.csv': 'id|name|faction_id|link|\n001|Test Sentinel|AC|https://wahapedia.ru/|\n',
  'Datasheets_models.csv': 'datasheet_id|name|M|T|Sv|W|Ld|OC|\n001|TEST ONLY|6"|5|2+|3|6+|2|\n',
  'Datasheets_wargear.csv': 'datasheet_id|name|type|range|A|BS_WS|S|AP|D|description|\n001|Test spear|Melee|Melee|4|2+|6|-2|2|TEST ONLY|\n001|Test axe|Melee|Melee|3|2+|7|-2|3||\n',
  'Datasheets_abilities.csv': 'datasheet_id|ability_id|name|description|parameter|\n001|0007|||5+|\n001||Test ability|<b>TEST ONLY</b><br>Unknown timing.||\n',
  'Abilities.csv': 'id|name|description|faction_id|\n0007|Test defense|TEST ONLY|AC|\n0007|Other faction|Must not leak|NEC|\n',
  'Stratagems.csv': 'id|name|faction_id|cp_cost|description|phase|turn|type|detachment|\ns1|TEST ONLY — Shield||1|<b>WHEN:</b> Test.<br><b>TARGET:</b> Test.<br><b>EFFECT:</b> None.|||Core – Test||\ns2|TEST ONLY — Boarding||1|No effect|||Boarding Actions – Test||\ns3|TEST ONLY — Unknown cost||X|No effect|Shooting phase|Your turn|Core – Test||\n',
  'Last_update.csv': 'last_update|\n2026-11-01 12:00:00|\n',
}
