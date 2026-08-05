// Chess AI Master - Page Bridge (runs in MAIN world on chess.com)
// Calls board.game.move() -- the same function chess.com's UI uses for human drags.
// Chats with the content script via window.postMessage.
(function () {
  if (window.__chessAiBridge) return;
  window.__chessAiBridge = true;

  function getGame() {
    var els = document.querySelectorAll('wc-chess-board, chess-board');
    for (var i = 0; i < els.length; i++) {
      if (els[i] && els[i].game) return els[i].game;
    }
    return null;
  }

  function getFEN() {
    var g = getGame();
    if (g && typeof g.getFEN === 'function') {
      try { return String(g.getFEN()); } catch (e) {}
    }
    return null;
  }

  function getPlayerColor() {
    var b = document.querySelector('wc-chess-board, chess-board');
    return (b && b.classList && b.classList.contains('flipped')) ? 'b' : 'w';
  }

  function isPlayerTurn(fen) {
    if (!fen) return false;
    var t = fen.split(' ')[1];
    return t === getPlayerColor();
  }

  function parseUci(uci) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) return null;
    var u = uci.toLowerCase().trim();
    return {
      from: u.slice(0, 2),
      to: u.slice(2, 4),
      promotion: u.length === 5 ? u.charAt(4) : null
    };
  }

  function norm(sq) {
    return typeof sq === 'string' ? sq.slice(0, 2).toLowerCase() : '';
  }

  function findLegal(game, uci) {
    if (typeof game.getLegalMoves !== 'function') return null;
    var p = parseUci(uci);
    if (!p) return null;
    var moves = game.getLegalMoves();
    if (!moves || !moves.length) return null;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      if (!m || typeof m !== 'object') continue;
      var from = norm(m.from || m.start || m.source);
      var to = norm(m.to || m.end || m.target);
      if (from !== p.from || to !== p.to) continue;
      var prom = (typeof m.promotion === 'string') ? m.promotion.toLowerCase().charAt(0) : null;
      if (p.promotion) { if (!prom || prom !== p.promotion) continue; }
      else { if (prom) continue; }
      return m;
    }
    return null;
  }

  function makeMove(uci) {
    var game = getGame();
    if (!game || typeof game.move !== 'function') return { ok: false, error: 'no-api' };

    var legal = findLegal(game, uci);
    if (!legal) return { ok: false, error: 'illegal' };

    var p = parseUci(uci);
    var payload = {};
    var k;
    for (k in legal) { if (Object.prototype.hasOwnProperty.call(legal, k)) payload[k] = legal[k]; }
    payload.animate = false;
    payload.userGenerated = true;
    if (p && p.promotion) payload.promotion = p.promotion;

    try {
      game.move(payload);
      if (p && p.promotion) {
        setTimeout(function () {
          var sel = '.promotion-piece.w' + p.promotion + ', .promotion-piece.b' + p.promotion;
          var el = document.querySelector(sel);
          if (el) { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); el.click(); }
        }, 60);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }

  function post(type, data) {
    var msg = { source: 'chess-ai-page', target: 'chess-ai-content', type: type };
    if (data) { for (var k in data) { if (Object.prototype.hasOwnProperty.call(data, k)) msg[k] = data[k]; } }
    window.postMessage(msg, '*');
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window || !ev.data || typeof ev.data !== 'object') return;
    var d = ev.data;
    if (d.source !== 'chess-ai-content') return;

    if (d.type === 'CHESS_PLAY') {
      var r = makeMove(d.uci);
      post('CHESS_PLAY_RESULT', { uci: d.uci, ok: r.ok, error: r.error });
    } else if (d.type === 'GET_STATE') {
      var fen = getFEN();
      post('STATE', { fen: fen, color: getPlayerColor(), isPlayerTurn: fen ? isPlayerTurn(fen) : false });
    }
  });

  var last = '';
  setInterval(function () {
    var fen = getFEN();
    if (fen && fen !== last) {
      last = fen;
      post('FEN', { fen: fen, color: getPlayerColor(), isPlayerTurn: isPlayerTurn(fen) });
    }
  }, 250);

  post('BRIDGE_READY', { fen: getFEN(), color: getPlayerColor() });
})();