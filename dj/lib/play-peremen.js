// Кино — «Перемен!»: аккордовое сопровождение под готовые аккорды Forest.
// Сначала запусти guitar-player.js, затем этот файл.
(async () => {
  if(!window.guitarPlayer)throw new Error('Сначала запусти guitar-player.js');
  // В игре нет F#m, Bm, A и G#: используем транспонированный вариант
  // Em, Am, G, D и заменяем недоступный F# на ближайший готовый F.
  const intro=['Em','Am','Em','Am','F','G'];
  const verse=['Em','G','D','Em','Em','G','D','Em'];
  const chorus=['Am','G','D','Em','Am','G','D','Em','Am','G','D','Em','Am','D','Em'];
  const score=[];
  let at=0;
  const add=chords=>{for(const chord of chords){score.push({at,dur:2,chord});at+=2}};
  add([...intro,...intro, ...verse, ...chorus, ...intro, ...verse, ...chorus, ...verse, ...chorus, ...chorus, 'Em','G','D','Em','G','D','Em']);
  await window.guitarPlayer.play(score,{bpm:112,loop:true,humanizeMs:5});
})();
