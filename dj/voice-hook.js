// FreakRating DJ — перехват отправителей голосового чата игры. Ставится ДО кода игры
// (Tampermonkey: @require + @run-at document-start), иначе отправитель микрофона уже создан и не виден.
//
// Игра (voiceSfu-*) берёт микрофон через getUserMedia, пропускает его через шумодав (DeepFilterNet/RNNoise)
// и отдаёт mediasoup → RTCPeerConnection.addTransceiver / RTCRtpSender.replaceTrack. Музыку подмешиваем
// ПОСЛЕ шумодава — на уровне отправителя, иначе шумодав её съест. Пока HUD не включил трансляцию
// (hooks.map === null), перехват ничего не меняет.
(() => {
  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window; // eslint-disable-line no-undef
  if (W.FreakDJHooks) return;
  const hooks = { senders: new Map(), map: null, onSender: null, rawReplace: null };
  W.FreakDJHooks = hooks;
  const PC = W.RTCPeerConnection, Sender = W.RTCRtpSender;
  if (!PC?.prototype || !Sender?.prototype) return;
  const { addTransceiver, addTrack } = PC.prototype, { replaceTrack } = Sender.prototype;
  const isAudio = t => !!t && typeof t === 'object' && t.kind === 'audio';
  const mapped = t => { try { return (t && hooks.map?.(t)) || t; } catch { return t; } };
  const seen = (sender, track) => { hooks.senders.set(sender, track); try { hooks.onSender?.(sender); } catch { /* не мешаем игре */ } };
  hooks.rawReplace = (sender, track) => replaceTrack.call(sender, track);
  if (addTransceiver) PC.prototype.addTransceiver = function (t, ...rest) {
    if (!isAudio(t)) return addTransceiver.call(this, t, ...rest);
    const tr = addTransceiver.call(this, mapped(t), ...rest);
    seen(tr.sender, t);
    return tr;
  };
  if (addTrack) PC.prototype.addTrack = function (t, ...rest) {
    if (!isAudio(t)) return addTrack.call(this, t, ...rest);
    const s = addTrack.call(this, mapped(t), ...rest);
    seen(s, t);
    return s;
  };
  // park → replaceTrack(null), unpark/смена устройства → replaceTrack(новая дорожка): запоминаем, что хотела игра.
  Sender.prototype.replaceTrack = function (t) {
    if (!hooks.senders.has(this) && !isAudio(t)) return replaceTrack.call(this, t);
    hooks.senders.set(this, t);
    return replaceTrack.call(this, mapped(t));
  };
})();
