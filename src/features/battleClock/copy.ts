// The application currently has no global i18n service. Keep all clock copy in
// keyed dictionaries so a future app locale can select it without changing UI.
const pl = {
  title: 'Battle Clock', off: 'Wyłączony', casual: 'Casual · 120 min', competitive: 'Competitive · 90 min', custom: 'Własny limit',
  preset: 'Tryb zegara', minutes: 'Minuty na gracza / drużynę', perTeam: 'W 2v2 obaj gracze drużyny korzystają ze wspólnego czasu.',
  optional: 'Opcjonalny. Zegar nie blokuje akcji ani nie zmienia zasad bitwy.', save: 'Zapisz zegar', saving: 'Zapisywanie…', saved: 'Ustawienia zegara zapisane. Potwierdźcie ponownie gotowość.',
  hostOnly: 'Zegar ustawia host przed rozpoczęciem bitwy.', round: 'Runda', paused: 'Pauza', running: 'Odmierzanie', finished: 'Koniec bitwy',
  pass: 'Przekaż czas', target: 'Komu przekazać czas?', pause: 'Pauza', resume: 'Wznów', start: 'Uruchom zegar', collapse: 'Zwiń zegar', expand: 'Rozwiń zegar',
  statistics: 'Statystyki czasu', used: 'Wykorzystano', left: 'Pozostało', overtime: 'Przekroczenie', passes: 'Przekazania', help: 'Jak używać zegara?', close: 'Rozumiem',
  passTip: 'Przekaż czas przeciwnikowi, kiedy wykonuje dłuższe działania lub podejmuje decyzje. Nie musisz przełączać zegara po każdym Saving Throw.',
  pauseTip: 'Pauza zatrzymuje wszystkie zegary. Wznów po wspólnej przerwie lub wyjaśnieniu zasad.',
  autoTip: 'Nowa tura automatycznie wybiera zegar gracza lub drużyny. Zmiana fazy nie przełącza czasu. Ręczne przekazanie nie zmienia tury gry.',
  saves: 'Zwykłe Saving Throws mogą pozostać na czasie atakującego. Przekaż czas przy dłuższym przydzielaniu obrażeń, usuwaniu modeli lub podejmowaniu decyzji.',
  overwatch: 'Overwatch: przekaż czas reagującemu graczowi na wybór i wykonanie ostrzału. Po zakończeniu oddaj czas graczowi, którego tura trwa.',
  fight: 'Fight Phase: przekazuj czas graczowi wybierającemu i aktywującemu jednostkę. Nie przełączaj go po każdym Hit, Wound ani Saving Throw.',
  expiry: 'Upływ czasu niczego automatycznie nie blokuje. Casual: informacja. Competitive: dalsze zasady ustalcie według regulaminu wydarzenia; aplikacja nie nakłada kar.',
  initial: 'Zegar zaczyna od pauzy. Uruchom go, gdy wszyscy będą gotowi. Podczas opuszczenia ekranu, odświeżenia lub rozłączenia nadal odmierza czas, jeżeli nie został wstrzymany.',
  expired: 'Limit czasu wyczerpany', competitiveExpiry: 'Limit Competitive wyczerpany. Zastosujcie regulamin wydarzenia; akcje pozostają dostępne.',
  warning15: 'Pozostało do 15 minut', warning5: 'Pozostało do 5 minut', warning1: 'Pozostała do 1 minuty',
  offline: 'Brak potwierdzonej synchronizacji. Widoczny czas jest szacunkiem; zegar na serwerze działa dalej. Sterowanie wróci po połączeniu.',
  conflict: 'Inne urządzenie już zmieniło zegar. Wczytano aktualny stan; wybierz ponownie, jeśli nadal chcesz przekazać czas.',
  syncing: 'Łączenie zegara…', error: 'Nie udało się zsynchronizować zegara.', live: 'Bieżące dane; po zakończeniu bitwy czas zostaje zapisany.',
  shortcut: 'Spacja: przekaż czas. W FFA najpierw wybierz odbiorcę.', loading: 'Wczytywanie…',
}
type ClockCopy = { [K in keyof typeof pl]: string }
const en: ClockCopy = {
  title:'Battle Clock', off:'Disabled', casual:'Casual · 120 min', competitive:'Competitive · 90 min', custom:'Custom limit', preset:'Clock mode', minutes:'Minutes per player / team',
  perTeam:'In 2v2 both team members share one clock.',optional:'Optional. The clock never blocks actions or changes battle rules.',save:'Save clock',saving:'Saving…',saved:'Clock saved. Everyone must confirm Ready again.',hostOnly:'The host configures the clock before battle start.',
  round:'Round',paused:'Paused',running:'Running',finished:'Battle ended',pass:'Pass time',target:'Who receives the clock?',pause:'Pause',resume:'Resume',start:'Start clock',collapse:'Collapse clock',expand:'Expand clock',statistics:'Time Statistics',used:'Used',left:'Remaining',overtime:'Overtime',passes:'Handoffs',help:'How to use the clock',close:'Got it',
  passTip:'Pass time when your opponent makes decisions or performs longer actions. You do not need to switch after every Saving Throw.',pauseTip:'Pause stops all clocks. Resume after a shared break or rules discussion.',autoTip:'A new turn automatically selects its player or team clock. Phase changes do not switch time. Manual handoffs do not change the game turn.',
  saves:'Routine Saving Throws can stay on the attacker’s time. Pass for longer allocation, model removal or decisions.',overwatch:'Overwatch: pass time to the reacting player to choose and resolve shooting, then return it to the turn player.',fight:'Fight Phase: pass time to the player selecting and activating a unit, without switching after every Hit, Wound or Saving Throw.',expiry:'Timeout never blocks actions. Casual is informational. Competitive follows your event rules; the app applies no penalties.',initial:'The clock starts paused. Start when everyone is ready. If running, it continues across screens, refreshes and disconnections.',
  expired:'Time limit reached',competitiveExpiry:'Competitive time limit reached. Follow your event rules; actions remain available.',warning15:'15 minutes or less remaining',warning5:'5 minutes or less remaining',warning1:'1 minute or less remaining',offline:'Sync is not confirmed. Displayed time is an estimate; the server clock continues. Controls return after reconnecting.',conflict:'Another device changed the clock. The latest state is loaded; choose again if a handoff is still needed.',syncing:'Connecting clock…',error:'Clock synchronization failed.',live:'Live figures; the final time is saved when the battle ends.',shortcut:'Space: pass time. In FFA select a recipient first.',loading:'Loading…',
}
export const clockTranslations = { pl, en }
export const clockCopy = (locale: keyof typeof clockTranslations = 'pl'): ClockCopy => clockTranslations[locale]
