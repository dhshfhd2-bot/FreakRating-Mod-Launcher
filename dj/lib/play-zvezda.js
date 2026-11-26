// «Звезда по имени Солнце» — присланный фрагмент ABC, 4/4, 115 BPM.
// Сначала вставь guitar-player.js, затем этот файл.
(async () => {
  if(!window.guitarPlayer)throw new Error('Сначала запусти guitar-player.js');
  const abc=`
"Am" A,2 E2 A2 E2 | "C" C2 G2 c2 G2 | "Dm" D2 A2 d2 A2 | "G" G,2 D2 G2 D2 |
"Am" z2 A2 A2 G2 | A2 G2 E2 D2 | "C" E4 z4 | z8 |
"Dm" z2 F2 F2 E2 | F2 E2 D2 C2 | "G" D4 z4 | z8 |
`;
  const score=[];
  let beat=0,chord=null;
  for(const bar of abc.trim().split('|').filter(s=>s.trim())){
    let unit=0,barChord=null;
    for(const m of bar.matchAll(/"([^"]+)"|([_^]?[A-Ga-gz][,']*\d*)/g)){
      if(m[1]){chord=m[1];barChord=chord;continue}
      const token=m[2],x=token.match(/^([_^]?)([A-Ga-gz])([,']*)(\d*)$/);
      const letter=x[2],units=Number(x[4]||1);
      if(letter.toLowerCase()!=='z'){
        const low=letter===letter.toLowerCase();
        const octave=(low?5:4)-[...x[3]].filter(c=>c===',').length+[...x[3]].filter(c=>c==="'").length;
        const note=letter.toUpperCase()+(x[1]==='_'?'b':x[1]==='^'?'#':'')+octave;
        score.push({at:beat+unit/2,dur:units/2,note});
      }
      unit+=units;
    }
    if(barChord||chord)score.push({at:beat,dur:4,chord:barChord||chord});
    beat+=4;
  }
  await window.guitarPlayer.play(score,{bpm:115,loop:true,humanizeMs:4});
})();
