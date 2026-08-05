// Chess AI Master v4.0 - Board-API Move Injection
// IQ: 9,000,000. Auto-plays via page bridge (board.game.move()).
// Content script runs in the isolated world; bridge runs in main world.

(function () {
  var CONFIG = {
    DEFAULT_DEPTH: 20,
    DEFAULT_TIME: 3000,
    AUTO_START: false,
    AUTO_PLAY: true,
    ARROW_COLORS: ['#00ff88', '#00aaff', '#ff6600']
  };

  var FILES = { a:1, b:2, c:3, d:4, e:5, f:6, g:7, h:8 };

  var iconUrl = null;
  try {
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL) iconUrl = browser.runtime.getURL('icons/icon.png');
    else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) iconUrl = chrome.runtime.getURL('icons/icon.png');
  } catch (e) {}

  // ==================== BRIDGE COMMUNICATION ====================
  var bridge = {
    ready: false,
    fen: null,
    color: null,
    isMyTurn: false,
    requestState: function () {
      window.postMessage({ source: 'chess-ai-content', target: 'chess-ai-page', type: 'GET_STATE' }, '*');
    },
    play: function (uci, cb) {
      window.postMessage({ source: 'chess-ai-content', target: 'chess-ai-page', type: 'CHESS_PLAY', uci: uci }, '*');
      if (cb) setTimeout(cb, 100);
    }
  };

  window.addEventListener('message', function (ev) {
    if (ev.source !== window || !ev.data || typeof ev.data !== 'object') return;
    var d = ev.data;
    if (d.source !== 'chess-ai-page' || d.target !== 'chess-ai-content') return;

    if (d.type === 'BRIDGE_READY' || d.type === 'FEN' || d.type === 'STATE') {
      bridge.ready = true;
      if (d.fen) bridge.fen = d.fen;
      if (d.color) bridge.color = d.color;
      if (d.isPlayerTurn !== undefined) bridge.isMyTurn = d.isPlayerTurn;
    }
  });

  // ==================== FEN (DOM fallback) ====================
  function readFEN() {
    if (bridge.fen) return bridge.fen;
    var board = document.querySelector('wc-chess-board');
    if (!board) return null;
    var turn = board.classList.contains('flipped') ? 'b' : 'w';
    var fen = '';
    for (var r = 8; r >= 1; r--) {
      var empty = 0;
      for (var f = 1; f <= 8; f++) {
        var pos = f + '' + r;
        var el = document.querySelector('.piece.square-' + pos);
        if (!el) { empty++; }
        else {
          if (empty > 0) { fen += empty; empty = 0; }
          var parts = el.className.split(' ');
          var code = '';
          for (var i = 0; i < parts.length; i++) {
            if (parts[i].length === 2 && /^[wb][kqrbnp]$/.test(parts[i])) { code = parts[i]; break; }
          }
          if (code) fen += code[0] === 'w' ? code[1].toUpperCase() : code[1];
        }
      }
      if (empty > 0) fen += empty;
      if (r > 1) fen += '/';
    }
    return fen + ' ' + turn + ' KQkq - 0 1';
  }

  function getTurn(fen) {
    if (!fen) return null;
    var f = fen.split(' ')[1];
    return f === 'w' || f === 'b' ? f : null;
  }

  function isPlayerTurn() {
    if (bridge.isMyTurn !== null && bridge.fen) return bridge.isMyTurn;
    var fen = readFEN();
    if (!fen) return false;
    return getTurn(fen) === bridge.color;
  }

  function formatEval(score, type) {
    if (type === 'mate') return score > 0 ? 'M' + Math.abs(score) : '-M' + Math.abs(score);
    var v = (score / 100).toFixed(2);
    return score > 0 ? '+' + v : v;
  }

  // ==================== ENGINE ====================
  var engine = {
    worker: null,
    ready: false
  };

  function createEngine(onBestMove, onInfo) {
    var w = null;
    try {
      w = new Worker('/bundles/app/js/vendor/jschessengine/stockfish.asm.1abfa10c.js');
    } catch (e) {
      console.error('[ChessAI] Engine error:', e);
      return null;
    }
    w.onmessage = function (event) {
      var data = event.data;
      if (typeof data !== 'string') return;
      if (data.indexOf('bestmove') === 0 && onBestMove) {
        onBestMove(data.split(' ')[1]);
      } else if (data.indexOf('info') === 0 && onInfo) {
        var info = {};
        var dm = data.match(/depth (\d+)/);
        var sm = data.match(/score (cp|mate) (-?\d+)/);
        var pm = data.match(/ pv (.+)$/);
        var mm = data.match(/multipv (\d+)/);
        var nm = data.match(/nps (\d+)/);
        if (dm) info.depth = parseInt(dm[1]);
        if (sm) { info.scoreType = sm[1]; info.score = parseInt(sm[2]); }
        if (pm) info.pv = pm[1];
        if (mm) info.multipv = parseInt(mm[1]);
        if (nm) info.nps = parseInt(nm[1]);
        if (info.depth && info.score !== undefined) onInfo(info);
      }
    };
    w.onerror = function () {};
    var e = {
      go: function (fen, depth, time, mpv) {
        w.postMessage('stop');
        w.postMessage('ucinewgame');
        w.postMessage('setoption name MultiPV value ' + (mpv || 3));
        w.postMessage('position fen ' + fen);
        w.postMessage('go depth ' + (depth || 20) + ' movetime ' + (time || 3000));
      },
      stop: function () { w.postMessage('stop'); }
    };
    return e;
  }

  // ==================== ARROWS ====================
  var arrowSvg = null;
  function initArrows(board) {
    arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrowSvg.setAttribute('style', 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999');
    board.appendChild(arrowSvg);
  }
  function clearArrows() { if (arrowSvg) arrowSvg.innerHTML = ''; }
  function sqToXY(sq, flipped) {
    var file = FILES[sq[0]] - 1;
    var rank = parseInt(sq[1]) - 1;
    return flipped ? { x: 7 - file, y: rank } : { x: file, y: 7 - rank };
  }
  function drawArrow(board, from, to, color, width) {
    if (!arrowSvg) return;
    var br = board.getBoundingClientRect();
    var sz = br.width / 8;
    var flipped = board.classList.contains('flipped');
    var f1 = sqToXY(from, flipped);
    var f2 = sqToXY(to, flipped);
    var x1 = f1.x * sz + sz / 2;
    var y1 = f1.y * sz + sz / 2;
    var x2 = f2.x * sz + sz / 2;
    var y2 = f2.y * sz + sz / 2;
    var ang = Math.atan2(y2 - y1, x2 - x1);
    var len = Math.hypot(x2 - x1, y2 - y1);
    var hl = Math.min(20, len * 0.3);
    var hw = hl * 0.6;
    var ns = 'http://www.w3.org/2000/svg';
    var g = document.createElementNS(ns, 'g');
    var glow = document.createElementNS(ns, 'line');
    glow.setAttribute('x1', x1); glow.setAttribute('y1', y1);
    glow.setAttribute('x2', x2); glow.setAttribute('y2', y2);
    glow.setAttribute('stroke', color); glow.setAttribute('stroke-width', width + 6);
    glow.setAttribute('stroke-linecap', 'round'); glow.setAttribute('opacity', '0.25');
    g.appendChild(glow);
    var line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', color); line.setAttribute('stroke-width', width);
    line.setAttribute('stroke-linecap', 'round'); line.setAttribute('opacity', '0.85');
    g.appendChild(line);
    var bx = x2 - hl * Math.cos(ang);
    var by = y2 - hl * Math.sin(ang);
    var pts = x2 + ',' + y2 + ' ' + (bx + hw * Math.cos(ang + Math.PI / 2)) + ',' + (by + hw * Math.sin(ang + Math.PI / 2)) + ' ' + (bx + hw * Math.cos(ang - Math.PI / 2)) + ',' + (by + hw * Math.sin(ang - Math.PI / 2));
    var head = document.createElementNS(ns, 'polygon');
    head.setAttribute('points', pts); head.setAttribute('fill', color); head.setAttribute('opacity', '0.85');
    g.appendChild(head);
    arrowSvg.appendChild(g);
  }

  // ==================== CSS ====================
  var CSS = '#cai-panel{position:fixed;left:calc(100% - 375px);top:calc(50% - 290px);width:360px;max-height:580px;user-select:none;-webkit-user-select:none;z-index:100000;background:linear-gradient(135deg,rgba(15,15,35,0.97),rgba(10,10,25,0.99));border-radius:16px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 15px 50px rgba(0,0,0,0.6);font-family:system-ui,sans-serif;color:#fff;overflow:hidden;transition:all 0.3s}#cai-panel.mini{width:50px;height:50px;border-radius:50%;cursor:grab}#cai-panel.mini .cai-body,#cai-panel.mini .cai-btns,#cai-panel.mini .cai-settings{display:none}#cai-panel.mini .cai-hdr{padding:0;justify-content:center}#cai-panel.mini .cai-title{display:none}.cai-mini-ico{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;border-radius:50%;display:none;pointer-events:none;-webkit-user-drag:none}#cai-panel.mini .cai-mini-ico{display:block}#cai-panel.mini .cai-logo{display:none}.cai-resize{position:absolute;bottom:2px;right:2px;width:14px;height:14px;border-radius:50%;background:#667eea;cursor:nwse-resize;display:none;z-index:5;border:1px solid rgba(255,255,255,0.4);box-shadow:0 0 6px rgba(102,126,234,0.6)}#cai-panel.mini .cai-resize{display:block}.cai-hdr{cursor:grab}.cai-hdr:active{cursor:grabbing}#cai-panel.mini.cai-noimg .cai-logo{display:block;font-size:26px;line-height:1}.cai-hdr{display:flex;align-items:center;gap:10px;padding:14px 16px;background:linear-gradient(135deg,rgba(100,100,255,0.12),rgba(50,50,200,0.08));border-bottom:1px solid rgba(255,255,255,0.04)}.cai-logo{font-size:28px;filter:drop-shadow(0 0 8px rgba(100,100,255,0.4))}.cai-title{flex:1}.cai-name{font-size:15px;font-weight:700;background:linear-gradient(135deg,#fff,#a0a0ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.cai-iq{font-size:10px;color:#ff6b6b;font-weight:600;letter-spacing:1px}.cai-btns{display:flex;gap:6px}.cai-ico{width:28px;height:28px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#888;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center}.cai-ico:hover{background:rgba(255,255,255,0.08);color:#fff}.cai-body{padding:0;max-height:480px;overflow-y:auto}.cai-body::-webkit-scrollbar{width:3px}.cai-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:3px}.cai-status{display:flex;align-items:center;gap:8px;padding:8px 16px;font-size:11px;color:#777;border-bottom:1px solid rgba(255,255,255,0.04)}.cai-dot{width:7px;height:7px;border-radius:50%;background:#555;transition:0.3s}.cai-dot.on{background:#00ff88;box-shadow:0 0 8px #00ff88;animation:cai-pulse 1.5s infinite}@keyframes cai-pulse{0%,100%{opacity:1}50%{opacity:0.4}}.cai-controls{padding:12px 16px;display:flex;gap:8px;flex-wrap:wrap}.cai-btn{padding:10px;border-radius:10px;border:none;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;transition:0.2s}.cai-btn-go{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;flex:1}.cai-btn-go:hover{transform:translateY(-1px);box-shadow:0 4px 15px rgba(102,126,234,0.3)}.cai-btn-stop{background:linear-gradient(135deg,#ff4444,#cc0000);color:#fff;flex:1}.cai-btn-play{background:linear-gradient(135deg,#00cc6a,#00aa55);color:#fff;flex:1}.cai-btn-play.active{background:linear-gradient(135deg,#ff8800,#cc6600);animation:cai-glow 1s infinite}@keyframes cai-glow{0%,100%{box-shadow:0 0 5px rgba(255,136,0,0.3)}50%{box-shadow:0 0 20px rgba(255,136,0,0.6)}}.cai-best{margin:0 16px 12px;padding:12px;background:rgba(0,255,136,0.06);border-radius:10px;border:1px solid rgba(0,255,136,0.15);text-align:center}.cai-best-lbl{font-size:10px;color:#777;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}.cai-best-val{font-size:26px;font-weight:800;font-family:monospace;background:linear-gradient(135deg,#00ff88,#00cc6a);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.cai-opening{margin:0 16px 12px;padding:8px 12px;background:rgba(100,100,255,0.08);border-radius:8px;display:flex;align-items:center;gap:8px;font-size:12px;color:#bbb}.cai-tabs{display:flex;padding:0 16px;gap:3px;border-bottom:1px solid rgba(255,255,255,0.04)}.cai-tab{flex:1;padding:8px;background:none;border:none;color:#555;font-family:inherit;font-size:11px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent}.cai-tab:hover{color:#999}.cai-tab.active{color:#fff;border-bottom-color:#667eea}.cai-tabcon{display:none;padding:12px 16px}.cai-tabcon.active{display:block}.cai-info-row{display:flex;justify-content:space-between;font-size:11px;color:#777;margin-bottom:10px}.cai-info-row b{color:#fff}.cai-eval-box{text-align:center;padding:12px;background:rgba(0,0,0,0.2);border-radius:10px}.cai-eval-lbl{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}.cai-eval-val{font-size:32px;font-weight:800;font-family:monospace}.cai-eval-val.pos{color:#00ff88}.cai-eval-val.neg{color:#ff4444}.cai-lines{display:flex;flex-direction:column;gap:6px}.cai-line{display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:8px;border:1px solid rgba(255,255,255,0.04);cursor:pointer;transition:0.2s}.cai-line:hover{background:rgba(255,255,255,0.05)}.cai-line.best{border-color:rgba(0,255,136,0.2)}.cai-l-num{width:22px;height:22px;border-radius:5px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#777}.cai-line.best .cai-l-num{background:rgba(0,255,136,0.15);color:#00ff88}.cai-l-eval{font-family:monospace;font-size:12px;font-weight:700;min-width:55px}.cai-l-move{font-family:monospace;font-size:13px;font-weight:600;color:#ddd;flex:1}.cai-l-pv{font-size:10px;color:#555;font-family:monospace}.cai-threats{display:flex;flex-direction:column;gap:6px}.cai-threat{padding:8px 10px;border-radius:8px;font-size:11px;display:flex;align-items:center;gap:8px}.cai-threat.danger{background:rgba(255,68,68,0.08);border:1px solid rgba(255,68,68,0.15);color:#ff6666}.cai-threat.warn{background:rgba(255,170,0,0.08);border:1px solid rgba(255,170,0,0.15);color:#ffaa00}.cai-threat.safe{background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.15);color:#00ff88}.cai-info{font-size:11px;color:#555;text-align:center;padding:10px}.cai-settings{position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(10,10,25,0.98);z-index:10;padding:16px;overflow-y:auto}.cai-set-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.cai-set-hdr h3{margin:0;font-size:15px}.cai-set-body{display:flex;flex-direction:column;gap:14px}.cai-set-body label{font-size:12px;color:#aaa;display:flex;justify-content:space-between}.cai-set-body input[type="range"]{width:100%;-webkit-appearance:none;height:5px;background:rgba(255,255,255,0.1);border-radius:3px}.cai-set-body input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;background:#667eea;border-radius:50%;cursor:pointer}.cai-toggles{display:flex;flex-direction:column;gap:8px}.cai-toggles label{font-size:12px;color:#ccc;display:flex;align-items:center;gap:8px;cursor:pointer}.cai-toggles input{accent-color:#667eea}.cai-shortcuts{font-size:11px;color:#555;margin-top:10px}.cai-shortcuts div{margin-top:4px}kbd{background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:3px;font-family:monospace;font-size:10px}';

  // ==================== APP STATE ====================
  var app = {
    engine: null,
    panel: null,
    running: false,
    autoPlay: CONFIG.AUTO_PLAY,
    minimized: false,
    lastFEN: '',
    playedFEN: '',
    results: [],
    depth: CONFIG.DEFAULT_DEPTH,
    time: CONFIG.DEFAULT_TIME,
    multiPV: 3,
    showArrows: true,
    autoStart: CONFIG.AUTO_START,
    board: null,
    miniSize: null,
    savedPanel: null
  };

  var SETTINGS_KEY = 'chess-ai-settings';

  function saveSettings() {
    var p = app.panel;
    var data = {
      depth: app.depth,
      time: app.time,
      multiPV: app.multiPV,
      showArrows: app.showArrows,
      autoStart: app.autoStart,
      autoPlay: app.autoPlay,
      panel: {
        left: p ? p.style.left : '',
        top: p ? p.style.top : '',
        miniSize: app.miniSize || null,
        minimized: app.minimized
      }
    };
    try { chrome.storage.local.set({ 'chess-ai-settings': data }); } catch (e) {}
  }

  function loadSettings(cb) {
    try {
      chrome.storage.local.get('chess-ai-settings', function (r) {
        var s = (r && r['chess-ai-settings']) || {};
        if (s.depth) app.depth = parseInt(s.depth, 10) || CONFIG.DEFAULT_DEPTH;
        if (s.time) app.time = parseInt(s.time, 10) || CONFIG.DEFAULT_TIME;
        if (s.multiPV) app.multiPV = parseInt(s.multiPV, 10) || 3;
        if (typeof s.showArrows === 'boolean') app.showArrows = s.showArrows;
        if (typeof s.autoPlay === 'boolean') app.autoPlay = s.autoPlay;
        app.autoStart = false;
        app.miniSize = (s.panel && s.panel.miniSize) || null;
        app.savedPanel = s.panel || null;
        if (cb) cb();
      });
    } catch (e) {
      if (cb) cb();
    }
  }

  function curFEN() { return bridge.fen || readFEN(); }

  function onInfo(d) {
    if (!d.pv) return;
    var idx = -1;
    for (var i = 0; i < app.results.length; i++) {
      if (app.results[i].multipv === d.multipv) { idx = i; break; }
    }
    if (idx >= 0) app.results[idx] = d; else app.results.push(d);
    app.results.sort(function (a, b) { return a.multipv - b.multipv; });
    if (d.multipv === 1) {
      var de = document.getElementById('cai-depth');
      var ne = document.getElementById('cai-nps');
      if (de) de.textContent = d.depth || 0;
      if (ne) ne.textContent = d.nps ? Math.round(d.nps / 1000) + 'K' : '0';
    }
    renderLines();
    renderThreats();
  }

  function onBestMove(move) {
    if (!move) return;
    var be = document.getElementById('cai-best');
    if (be) be.textContent = move.toUpperCase();

    var best = null;
    for (var i = 0; i < app.results.length; i++) {
      if (app.results[i].multipv === 1) { best = app.results[i]; break; }
    }
    if (best) {
      var ev = formatEval(best.score, best.scoreType);
      var ee = document.getElementById('cai-eval');
      if (ee) { ee.textContent = ev; ee.className = 'cai-eval-val ' + (best.score > 0 ? 'pos' : best.score < 0 ? 'neg' : ''); }
    }

    if (app.showArrows && app.board) {
      clearArrows();
      for (var i = 0; i < Math.min(3, app.results.length); i++) {
        var r = app.results[i];
        if (r.pv && r.pv.length >= 4) {
          drawArrow(app.board, r.pv.substring(0, 2), r.pv.substring(2, 4), CONFIG.ARROW_COLORS[i], 10 - i * 2);
        }
      }
    }

    // AUTO-PLAY
    var safe = (app.autoPlay && app.running && isPlayerTurn() && curFEN() && curFEN() !== app.playedFEN);
    if (safe) {
      var st = document.getElementById('cai-status');
      if (st) st.textContent = 'Playing: ' + move.toUpperCase();
      app.playedFEN = curFEN();
      setTimeout(function () {
        bridge.play(move);
      }, 250);
    }
  }

  function renderLines() {
    var c = document.getElementById('cai-lines');
    if (!c) return;
    c.innerHTML = '';
    for (var i = 0; i < app.results.length; i++) {
      var r = app.results[i];
      if (!r.pv) continue;
      var ev = formatEval(r.score, r.scoreType);
      var col = r.score > 0 ? '#00ff88' : r.score < 0 ? '#ff4444' : '#888';
      var div = document.createElement('div');
      div.className = 'cai-line' + (i === 0 ? ' best' : '');
      div.innerHTML = '<div class="cai-l-num">' + (i + 1) + '</div><div class="cai-l-eval" style="color:' + col + '">' + ev + '</div><div class="cai-l-move">' + r.pv.substring(0, 4).toUpperCase() + '</div><div class="cai-l-pv">' + r.pv.split(' ').slice(0, 5).join(' ') + '</div>';
      c.appendChild(div);
    }
  }

  function renderThreats() {
    var c = document.getElementById('cai-threats');
    if (!c) return;
    c.innerHTML = '';
    var best = null;
    for (var i = 0; i < app.results.length; i++) {
      if (app.results[i].multipv === 1) { best = app.results[i]; break; }
    }
    if (!best) return;
    var html = '';
    if (best.scoreType === 'mate') {
      if (best.score > 0) html = '<div class="cai-threat safe"><span>&#127942;</span><span>Checkmate in ' + Math.abs(best.score) + '!</span></div>';
      else html = '<div class="cai-threat danger"><span>&#9888;</span><span>Opponent mates in ' + Math.abs(best.score) + '!</span></div>';
    } else if (best.score < -300) {
      html = '<div class="cai-threat danger"><span>&#9888;</span><span>Critical! You are losing badly.</span></div>';
    } else if (best.score < -150) {
      html = '<div class="cai-threat warn"><span>&#9888;</span><span>You are slightly worse.</span></div>';
    } else if (best.score > 150) {
      html = '<div class="cai-threat safe"><span>&#10003;</span><span>You have an advantage!</span></div>';
    } else {
      html = '<div class="cai-threat safe"><span>&#10003;</span><span>Position is balanced.</span></div>';
    }
    c.innerHTML = html;
  }

  function startAnalysis() {
    if (app.running) return;
    var fen = curFEN();
    if (!fen) return;
    app.running = true;
    app.lastFEN = fen;
    app.results = [];
    var s = document.getElementById('cai-start');
    var p = document.getElementById('cai-stop');
    var d = document.getElementById('cai-dot');
    var t = document.getElementById('cai-status');
    if (s) s.style.display = 'none';
    if (p) p.style.display = 'block';
    if (d) d.classList.add('on');
    if (t) t.textContent = app.autoPlay ? 'Auto Play: ON' : 'Analyzing...';
    app.engine.go(fen, app.depth, app.time, app.multiPV);
  }

  function stopAnalysis() {
    app.running = false;
    if (app.engine) app.engine.stop();
    var s = document.getElementById('cai-start');
    var p = document.getElementById('cai-stop');
    var d = document.getElementById('cai-dot');
    var t = document.getElementById('cai-status');
    if (s) s.style.display = 'block';
    if (p) p.style.display = 'none';
    if (d) d.classList.remove('on');
    if (t) t.textContent = 'Stopped';
    clearArrows();
  }

  function toggleAutoPlay() {
    app.autoPlay = !app.autoPlay;
    var btn = document.getElementById('cai-play-btn');
    if (btn) {
      btn.textContent = 'AUTO: ' + (app.autoPlay ? 'ON' : 'OFF');
      if (app.autoPlay) btn.classList.add('active'); else btn.classList.remove('active');
    }
    var t = document.getElementById('cai-status');
    if (t) t.textContent = app.autoPlay ? 'Auto Play: ON' : 'Auto Play: OFF';
    saveSettings();
  }

  function toggleMin() {
    app.minimized = !app.minimized;
    if (app.panel) {
      if (app.minimized) {
        app.panel.classList.add('mini');
        if (app.miniSize) {
          app.panel.style.width = app.miniSize.w + 'px';
          app.panel.style.height = app.miniSize.h + 'px';
        }
      } else {
        app.panel.classList.remove('mini');
        app.panel.style.width = '';
        app.panel.style.height = '';
      }
    }
    saveSettings();
  }

  var dragMoved = false;

  function enableDrag() {
    var panel = app.panel;
    panel.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest('.cai-ico') || e.target.closest('.cai-resize')) return;
      if (!app.minimized && !e.target.closest('.cai-hdr')) return;
      e.preventDefault();
      var sx = e.clientX, sy = e.clientY;
      var sl = panel.offsetLeft, st = panel.offsetTop;
      var moved = false;
      panel.style.transition = 'none';
      function onMove(ev) {
        var dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
        var nl = Math.max(0, Math.min(sl + dx, window.innerWidth - panel.offsetWidth));
        var nt = Math.max(0, Math.min(st + dy, window.innerHeight - panel.offsetHeight));
        panel.style.left = nl + 'px';
        panel.style.top = nt + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        panel.style.transition = '';
        if (moved) {
          dragMoved = true;
          setTimeout(function () { dragMoved = false; }, 300);
          saveSettings();
        }
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function enableResize() {
    var panel = app.panel;
    var handle = document.getElementById('cai-resize');
    if (!handle) return;
    handle.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      var sx = e.clientX, sy = e.clientY;
      var ss = panel.offsetWidth;
      panel.style.transition = 'none';
      function onMove(ev) {
        var s = Math.max(44, Math.min(400, ss + Math.max(ev.clientX - sx, ev.clientY - sy)));
        panel.style.width = s + 'px';
        panel.style.height = s + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        panel.style.transition = '';
        app.miniSize = { w: panel.offsetWidth, h: panel.offsetHeight };
        saveSettings();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function createPanel() {
    if (document.getElementById('cai-panel')) return;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var panel = document.createElement('div');
    panel.id = 'cai-panel';
    panel.innerHTML =
      '<div class="cai-hdr">' +
        '<img class="cai-mini-ico" src="' + (iconUrl || '') + '" alt="Chess AI">' +
        '<div class="cai-logo">&#9818;</div>' +
        '<div class="cai-title"><div class="cai-name">Chess AI Master</div><div class="cai-iq">IQ: 9,000,000 by MR-golem</div></div>' +
        '<div class="cai-btns"><button class="cai-ico" id="cai-set-btn" title="Settings">&#9881;</button><button class="cai-ico" id="cai-min-btn" title="Minimize">&#8722;</button></div>' +
      '</div>' +
      '<div class="cai-body">' +
        '<div class="cai-status"><span class="cai-dot" id="cai-dot"></span><span id="cai-status">Initializing...</span></div>' +
        '<div class="cai-controls">' +
          '<button class="cai-btn cai-btn-go" id="cai-start">&#9654; Start</button>' +
          '<button class="cai-btn cai-btn-stop" id="cai-stop" style="display:none">&#9632; Stop</button>' +
          '<button class="cai-btn cai-btn-play' + (app.autoPlay ? ' active' : '') + '" id="cai-play-btn">AUTO: ' + (app.autoPlay ? 'ON' : 'OFF') + '</button>' +
        '</div>' +
        '<div class="cai-best"><div class="cai-best-lbl">Best Move</div><div class="cai-best-val" id="cai-best">---</div></div>' +
        '<div class="cai-tabs">' +
          '<button class="cai-tab active" data-t="analysis">Analysis</button>' +
          '<button class="cai-tab" data-t="lines">Lines</button>' +
          '<button class="cai-tab" data-t="threats">Threats</button>' +
        '</div>' +
        '<div class="cai-tabcon active" id="cai-t-analysis">' +
          '<div class="cai-info-row"><span>Depth: <b id="cai-depth">0</b>/' + app.depth + '</span><span>NPS: <b id="cai-nps">0</b></span></div>' +
          '<div class="cai-eval-box"><div class="cai-eval-lbl">Evaluation</div><div class="cai-eval-val" id="cai-eval">0.00</div></div>' +
        '</div>' +
        '<div class="cai-tabcon" id="cai-t-lines"><div id="cai-lines"></div></div>' +
        '<div class="cai-tabcon" id="cai-t-threats"><div id="cai-threats"><div class="cai-info">Start analysis to detect threats</div></div></div>' +
      '</div>' +
      '<div class="cai-settings" id="cai-settings-panel" style="display:none">' +
        '<div class="cai-set-hdr"><h3>Settings</h3><button class="cai-ico" id="cai-close-set">&#10005;</button></div>' +
        '<div class="cai-set-body">' +
          '<label>Depth: <span id="cai-d-val">' + app.depth + '</span></label>' +
          '<input type="range" min="1" max="40" value="' + app.depth + '" id="cai-d-slider">' +
          '<label>Time (ms): <span id="cai-t-val">' + app.time + '</span></label>' +
          '<input type="range" min="500" max="30000" step="500" value="' + app.time + '" id="cai-t-slider">' +
          '<label>Multi-PV: <span id="cai-mpv-val">' + app.multiPV + '</span></label>' +
          '<input type="range" min="1" max="5" value="' + app.multiPV + '" id="cai-mpv-slider">' +
          '<div class="cai-toggles">' +
            '<label><input type="checkbox"' + (app.showArrows ? ' checked' : '') + ' id="cai-t-arrows"> Show Arrows</label>' +
            '<label><input type="checkbox"' + (app.autoStart ? ' checked' : '') + ' id="cai-t-auto"> Auto Start</label>' +
            '<label><input type="checkbox"' + (app.autoPlay ? ' checked' : '') + ' id="cai-t-play"> Auto Play</label>' +
          '</div>' +
          '<div class="cai-shortcuts">' +
            '<b>Shortcuts:</b>' +
            '<div><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> Toggle Panel</div>' +
            '<div><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> Start/Stop</div>' +
            '<div><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> Auto Play</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="cai-resize" id="cai-resize" title="Resize"></div>';
    document.body.appendChild(panel);
    app.panel = panel;

    var miniImg = panel.querySelector('.cai-mini-ico');
    if (miniImg) {
      miniImg.onerror = function () {
        this.style.display = 'none';
        panel.classList.add('cai-noimg');
      };
    }

    if (app.savedPanel) {
      if (app.savedPanel.left) panel.style.left = app.savedPanel.left;
      if (app.savedPanel.top) panel.style.top = app.savedPanel.top;
      if (app.savedPanel.minimized) {
        app.minimized = true;
        panel.classList.add('mini');
        if (app.miniSize) {
          panel.style.width = app.miniSize.w + 'px';
          panel.style.height = app.miniSize.h + 'px';
        }
      }
    }
    enableDrag();
    enableResize();

    document.getElementById('cai-start').onclick = startAnalysis;
    document.getElementById('cai-stop').onclick = stopAnalysis;
    document.getElementById('cai-play-btn').onclick = toggleAutoPlay;
    document.getElementById('cai-set-btn').onclick = function () {
      var p = document.getElementById('cai-settings-panel');
      if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
    };
    document.getElementById('cai-close-set').onclick = function () {
      document.getElementById('cai-settings-panel').style.display = 'none';
    };
    document.getElementById('cai-min-btn').onclick = function (e) {
      e.stopPropagation();
      toggleMin();
    };
    panel.onclick = function (e) {
      if (dragMoved) { dragMoved = false; e.stopPropagation(); return; }
      if (app.minimized) { toggleMin(); e.stopPropagation(); }
    };

    var tabs = document.querySelectorAll('.cai-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].onclick = function () {
        var allTabs = document.querySelectorAll('.cai-tab');
        var allCons = document.querySelectorAll('.cai-tabcon');
        for (var j = 0; j < allTabs.length; j++) allTabs[j].classList.remove('active');
        for (var j = 0; j < allCons.length; j++) allCons[j].classList.remove('active');
        this.classList.add('active');
        var tg = document.getElementById('cai-t-' + this.getAttribute('data-t'));
        if (tg) tg.classList.add('active');
      };
    }

    document.getElementById('cai-d-slider').oninput = function () {
      app.depth = parseInt(this.value);
      document.getElementById('cai-d-val').textContent = app.depth;
      saveSettings();
    };
    document.getElementById('cai-t-slider').oninput = function () {
      app.time = parseInt(this.value);
      document.getElementById('cai-t-val').textContent = app.time;
      saveSettings();
    };
    document.getElementById('cai-mpv-slider').oninput = function () {
      app.multiPV = parseInt(this.value);
      document.getElementById('cai-mpv-val').textContent = app.multiPV;
      saveSettings();
    };
    document.getElementById('cai-t-arrows').onchange = function () { app.showArrows = this.checked; saveSettings(); };
    document.getElementById('cai-t-auto').onchange = function () { app.autoStart = this.checked; saveSettings(); };
    document.getElementById('cai-t-play').onchange = function () {
      app.autoPlay = this.checked;
      var btn = document.getElementById('cai-play-btn');
      if (btn) {
        btn.textContent = 'AUTO: ' + (app.autoPlay ? 'ON' : 'OFF');
        if (app.autoPlay) btn.classList.add('active'); else btn.classList.remove('active');
      }
      saveSettings();
    };
  }

  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      var ctrl = e.ctrlKey || e.metaKey;
      var shift = e.shiftKey;
      if (ctrl && shift && e.code === 'KeyX') { e.preventDefault(); e.stopPropagation(); toggleMin(); return false; }
      if (ctrl && shift && e.code === 'KeyS') { e.preventDefault(); e.stopPropagation(); if (app.running) stopAnalysis(); else startAnalysis(); return false; }
      if (ctrl && shift && e.code === 'KeyP') { e.preventDefault(); e.stopPropagation(); toggleAutoPlay(); return false; }
      if (ctrl && shift && e.code === 'KeyA') { e.preventDefault(); e.stopPropagation(); app.showArrows = !app.showArrows; if (!app.showArrows) clearArrows(); var c = document.getElementById('cai-t-arrows'); if (c) c.checked = app.showArrows; saveSettings(); return false; }
    }, true);
  }

  function injectBridge() {
    if (document.getElementById('cai-bridge-script')) return;
    var src = null;
    try {
      if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL) src = browser.runtime.getURL('scripts/page.js');
      else if (chrome && chrome.runtime && chrome.runtime.getURL) src = chrome.runtime.getURL('scripts/page.js');
    } catch (e) {}
    if (!src) return;
    var s = document.createElement('script');
    s.id = 'cai-bridge-script';
    s.src = src;
    (document.head || document.documentElement).appendChild(s);
    s.onload = function () { if (s.parentNode) s.parentNode.removeChild(s); };
  }

  function bindMessages() {
    try {
      chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
        if (!msg) return;
        if (msg.action === 'toggleSettings') {
          var p = document.getElementById('cai-settings-panel');
          if (p) {
            p.style.display = p.style.display === 'none' ? 'block' : 'none';
            if (app.minimized) toggleMin();
          }
          if (sendResponse) sendResponse({ ok: true });
        }
        if (msg.action === 'exportAnalysis') {
          try {
            var txt = 'Chess AI Master - Analysis Export\n' + new Date().toLocaleString() + '\n\n';
            for (var i = 0; i < app.results.length; i++) {
              var r = app.results[i];
              if (!r || !r.pv) continue;
              txt += '#' + (r.multipv || i + 1) + ' ' + (r.scoreType === 'mate' ? 'M' + r.score : (r.score / 100).toFixed(2)) + ' ' + r.pv + '\n';
            }
            var blob = new Blob([txt], { type: 'text/plain' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'chess-ai-analysis.txt';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
          } catch (e) {}
          if (sendResponse) sendResponse({ ok: true });
        }
      });
    } catch (e) {}
  }

  function init() {
    if (document.getElementById('cai-panel')) return;
    loadSettings(startInit);
  }

  function startInit() {
    if (document.getElementById('cai-panel')) return;
    app.board = document.querySelector('wc-chess-board');
    if (!app.board) { setTimeout(init, 500); return; }

    injectBridge();

    app.engine = createEngine(onBestMove, onInfo);
    if (!app.engine) return;

    createPanel();
    initArrows(app.board);
    bindKeys();
    bindMessages();

    setInterval(function () {
      bridge.requestState();
      if (!bridge.ready) return;
      if (!app.autoStart && !app.running) return;
      var fen = curFEN();
      if (fen && fen !== app.lastFEN) {
        app.lastFEN = fen;
        app.results = [];
        if (app.autoStart && !app.running) startAnalysis();
        else if (app.running) app.engine.go(fen, app.depth, app.time, app.multiPV);
      }
    }, 400);

    console.log('[ChessAI] Ready - IQ: 9,000,000');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  var lastUrl = location.href;
  new MutationObserver(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(init, 1500);
    }
  }).observe(document, { subtree: true, childList: true });
})();