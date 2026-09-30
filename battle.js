const BOARD_SIZE = 10;
const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'];
const SHIP_TYPES = [
    { name: 'Линкор', size: 4, count: 1 },
    { name: 'Крейсер', size: 3, count: 2 },
    { name: 'Эсминец', size: 2, count: 3 },
    { name: 'Катер', size: 1, count: 4 }
];

class SoundFX {
    constructor() { this.enabled = true; this.audioCtx = null; }
    init() { if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    playTone(type, freqStart, freqEnd, dur, vol) {
        if (!this.enabled) return;
        this.init();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freqEnd, this.audioCtx.currentTime + dur);
        gain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + dur);
        osc.connect(gain); gain.connect(this.audioCtx.destination);
        osc.start(); osc.stop(this.audioCtx.currentTime + dur);
    }
    playShot() { this.playTone('sawtooth', 300, 40, 0.25, 0.3); }
    playHit() { this.playTone('square', 150, 30, 0.4, 0.5); }
    playSplash() { this.playTone('sine', 600, 100, 0.2, 0.2); }
    playWin() {
        if (!this.enabled) return; this.init();
        const now = this.audioCtx.currentTime;
        [261.63, 329.63, 392.00, 523.25].forEach((freq, idx) => {
            const osc = this.audioCtx.createOscillator(), gain = this.audioCtx.createGain();
            osc.frequency.setValueAtTime(freq, now + idx * 0.12);
            gain.gain.setValueAtTime(0.3, now + idx * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.12 + 0.3);
            osc.connect(gain); gain.connect(this.audioCtx.destination);
            osc.start(now + idx * 0.12); osc.stop(now + idx * 0.12 + 0.3);
        });
    }
}
const sounds = new SoundFX();

let state = {
    mode: 'ai',
    aiDifficulty: 'medium',
    phase: 'setup',
    activePlayer: 1,
    turn: 1,
    selectedShipSize: 4,
    isHorizontal: true,
    player1: { grid: createEmptyGrid(), ships: [], placedShips: [] },
    player2: { grid: createEmptyGrid(), ships: [], placedShips: [] },
    aiTargetQueue: []
};

let passScreenCallback = null;

function createEmptyGrid() { return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0)); }

document.addEventListener('DOMContentLoaded', () => {
    initDock(); renderGrids();
    document.getElementById('soundToggleBtn').addEventListener('click', function() {
        sounds.enabled = !sounds.enabled;
        this.innerHTML = sounds.enabled ? `<i class="fa-solid fa-volume-high text-sm"></i><span class="hidden sm:inline">Звук: ВКЛ</span>` : `<i class="fa-solid fa-volume-xmark text-sm"></i><span class="hidden sm:inline">Звук: ВЫКЛ</span>`;
    });
    document.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'r' || e.key.toLowerCase() === 'к') toggleShipOrientation(); });
});

function selectMode(mode) {
    state.mode = mode;
    const btnAi = document.getElementById('btnModeAi');
    const btnFriend = document.getElementById('btnModeFriend');
    const rightTitle = document.getElementById('rightPlayerTitle');

    if (mode === 'ai') {
        btnAi.className = 'group relative p-5 rounded-xl border border-cyan-400 bg-cyan-900/40 text-left flex items-start gap-4 transition';
        btnFriend.className = 'group relative p-5 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-indigo-500/50 text-left flex items-start gap-4 transition';
        rightTitle.innerHTML = `<i class="fa-solid fa-robot"></i> Флот Бота`;
        logCombat(`[Режим]: Игра против Бота.`);
    } else {
        btnFriend.className = 'group relative p-5 rounded-xl border border-indigo-400 bg-indigo-900/40 text-left flex items-start gap-4 transition';
        btnAi.className = 'group relative p-5 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-cyan-500/50 text-left flex items-start gap-4 transition';
        rightTitle.innerHTML = `<i class="fa-solid fa-user"></i> Флот Противника`;
        logCombat(`[Режим]: Игра против друга.`);
    }
    resetFleetPlacement();
}

function setAiDiff(diff, event) {
    event.stopPropagation(); state.aiDifficulty = diff;
    document.querySelectorAll('.ai-diff-btn').forEach(el => {
        el.className = 'ai-diff-btn px-2.5 py-1 rounded text-[11px] font-mono border border-slate-700 bg-slate-800 text-slate-300 cursor-pointer';
    });
    event.currentTarget.className = 'ai-diff-btn px-2.5 py-1 rounded text-[11px] font-mono border border-cyan-500 bg-cyan-500/20 text-cyan-300 font-bold cursor-pointer';
}

function initDock() {
    const dock = document.getElementById('shipsDock'); dock.innerHTML = '';
    const counts = getRemainingShipsToPlace(state.activePlayer);
    
    SHIP_TYPES.forEach(ship => {
        const count = counts[ship.size] || 0;
        const btn = document.createElement('button');
        btn.className = `px-3 py-1.5 rounded-lg border flex items-center gap-2 text-xs font-mono transition ${state.selectedShipSize === ship.size ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold' : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-700'} ${count === 0 ? 'opacity-40 cursor-not-allowed' : ''}`;
        btn.disabled = count === 0;
        btn.onclick = () => { state.selectedShipSize = ship.size; initDock(); };
        
        let decksSvg = Array(ship.size).fill(`<span class="w-2.5 h-2.5 rounded-sm ${state.selectedShipSize === ship.size ? 'bg-cyan-400' : 'bg-slate-500'} inline-block"></span>`).join('');
        btn.innerHTML = `<span>${ship.name}</span><div class="flex gap-0.5">${decksSvg}</div><span class="px-1.5 py-0.5 rounded bg-slate-950 text-[10px] text-cyan-400">x${count}</span>`;
        dock.appendChild(btn);
    });
    document.getElementById('btnStartBattle').disabled = Object.values(counts).some(c => c > 0);
}

function getRemainingShipsToPlace(pNum) {
    const counts = { 4: 1, 3: 2, 2: 3, 1: 4 };
    state[`player${pNum}`].placedShips.forEach(s => counts[s.size]--);
    return counts;
}

function toggleShipOrientation() {
    state.isHorizontal = !state.isHorizontal;
    document.getElementById('orientationLabel').innerHTML = `Ориентация: <strong class="text-white">${state.isHorizontal ? 'Горизонтально' : 'Вертикально'}</strong>`;
}

function renderGrids() {
    if (state.phase === 'setup') {
        renderGrid('leftBoardGrid', state[`player${state.activePlayer}`].grid, true, state.activePlayer);
        renderGrid('rightBoardGrid', createEmptyGrid(), false, state.activePlayer === 1 ? 2 : 1);
    } else {
        if (state.mode === 'ai') {
            renderGrid('leftBoardGrid', state.player1.grid, true, 1);
            renderGrid('rightBoardGrid', state.player2.grid, false, 2);
        } else {
            const myPlayer = state.turn;
            const enemyPlayer = state.turn === 1 ? 2 : 1;
            renderGrid('leftBoardGrid', state[`player${myPlayer}`].grid, true, myPlayer);
            renderGrid('rightBoardGrid', state[`player${enemyPlayer}`].grid, false, enemyPlayer);
        }
    }
}

function renderGrid(containerId, gridData, showShips, playerNum) {
    const container = document.getElementById(containerId); container.innerHTML = '';
    container.appendChild(Object.assign(document.createElement('div'), { className: 'board-cell cell-label' }));
    LETTERS.forEach(l => container.appendChild(Object.assign(document.createElement('div'), { className: 'board-cell cell-label', innerText: l })));
    
    for (let r = 0; r < BOARD_SIZE; r++) {
        container.appendChild(Object.assign(document.createElement('div'), { className: 'board-cell cell-label', innerText: r + 1 }));
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'board-cell cell-water';
            const val = gridData[r][c];
            if (val === 1 && showShips) cell.classList.add('cell-ship');
            else if (val === 2) cell.classList.add('cell-miss');
            else if (val === 3) cell.classList.add('cell-hit');
            else if (val === 4) cell.classList.add('cell-sunk-halo');
            
            if (state.phase === 'setup' && playerNum === state.activePlayer && containerId === 'leftBoardGrid') {
                cell.onmouseenter = () => handleCellHover(r, c, playerNum);
                cell.onmouseleave = () => document.querySelectorAll('.cell-valid-preview, .cell-invalid-preview').forEach(el => el.classList.remove('cell-valid-preview', 'cell-invalid-preview'));
                cell.onclick = () => handleCellClickPlacement(r, c, playerNum);
            } else if (state.phase === 'battle') {
                if (state.mode === 'ai' && playerNum === 2 && state.turn === 1 && containerId === 'rightBoardGrid') {
                    cell.onclick = () => handleBattleShot(r, c, 2);
                }
                else if (state.mode === 'friend' && playerNum !== state.turn && containerId === 'rightBoardGrid') {
                    cell.onclick = () => handleBattleShot(r, c, playerNum);
                }
            }
            container.appendChild(cell);
        }
    }
}

function handleCellHover(r, c, pNum) {
    document.querySelectorAll('.cell-valid-preview, .cell-invalid-preview').forEach(el => el.classList.remove('cell-valid-preview', 'cell-invalid-preview'));
    const size = state.selectedShipSize;
    if (getRemainingShipsToPlace(pNum)[size] <= 0) return;
    const isValid = checkValidPlacement(state[`player${pNum}`].grid, r, c, size, state.isHorizontal);
    for (let i = 0; i < size; i++) {
        const tr = state.isHorizontal ? r : r + i, tc = state.isHorizontal ? c + i : c;
        if (tr < BOARD_SIZE && tc < BOARD_SIZE) {
            const idx = (tr + 1) * 11 + (tc + 1);
            const cellEl = document.getElementById('leftBoardGrid').children[idx];
            if (cellEl) cellEl.classList.add(isValid ? 'cell-valid-preview' : 'cell-invalid-preview');
        }
    }
}

function checkValidPlacement(grid, r, c, size, isH) {
    if ((isH && c + size > BOARD_SIZE) || (!isH && r + size > BOARD_SIZE)) return false;
    for (let i = 0; i < size; i++) {
        const checkR = isH ? r : r + i, checkC = isH ? c + i : c;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = checkR + dr, nc = checkC + dc;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && grid[nr][nc] === 1) return false;
            }
        }
    } return true;
}

function handleCellClickPlacement(r, c, pNum) {
    const size = state.selectedShipSize;
    if (getRemainingShipsToPlace(pNum)[size] <= 0 || !checkValidPlacement(state[`player${pNum}`].grid, r, c, size, state.isHorizontal)) return;
    
    const decks = [];
    for (let i = 0; i < size; i++) {
        const tr = state.isHorizontal ? r : r + i, tc = state.isHorizontal ? c + i : c;
        state[`player${pNum}`].grid[tr][tc] = 1;
        decks.push({ r: tr, c: tc, hit: false });
    }
    state[`player${pNum}`].placedShips.push({ size, decks });
    sounds.playSplash();
    const counts = getRemainingShipsToPlace(pNum);
    if (counts[size] === 0) { const next = [4,3,2,1].find(s => counts[s] > 0); if (next) state.selectedShipSize = next; }
    initDock(); renderGrids();
}

function autoPlaceShips() {
    state[`player${state.activePlayer}`].grid = createEmptyGrid();
    state[`player${state.activePlayer}`].placedShips = [];
    SHIP_TYPES.forEach(ship => {
        for (let k = 0; k < ship.count; k++) {
            let placed = false, attempts = 0;
            while (!placed && attempts < 200) {
                attempts++; const r = Math.floor(Math.random() * BOARD_SIZE), c = Math.floor(Math.random() * BOARD_SIZE), isH = Math.random() < 0.5;
                if (checkValidPlacement(state[`player${state.activePlayer}`].grid, r, c, ship.size, isH)) {
                    const decks = [];
                    for (let i = 0; i < ship.size; i++) {
                        const tr = isH ? r : r + i, tc = isH ? c + i : c;
                        state[`player${state.activePlayer}`].grid[tr][tc] = 1;
                        decks.push({ r: tr, c: tc, hit: false });
                    }
                    state[`player${state.activePlayer}`].placedShips.push({ size: ship.size, decks });
                    placed = true;
                }
            }
        }
    });
    sounds.playSplash(); initDock(); renderGrids();
}

function resetFleetPlacement() {
    state[`player${state.activePlayer}`].grid = createEmptyGrid();
    state[`player${state.activePlayer}`].placedShips = [];
    state.selectedShipSize = 4;
    initDock(); renderGrids();
}

function startGameBattle() {
    if (state.mode === 'friend' && state.activePlayer === 1) {
        showPassScreen(2, () => {
            state.activePlayer = 2;
            document.getElementById('turnStatusText').innerText = 'Игрок 2: Расставьте свой флот';
            document.getElementById('leftPlayerTitle').innerHTML = '<i class="fa-solid fa-shield-halved"></i> Ваш Флот (Игрок 2)';
            resetFleetPlacement();
        });
        return;
    }
    if (state.mode === 'friend' && state.activePlayer === 2) {
        showPassScreen(1, () => { state.activePlayer = 1; initBattlePhase(); });
        return;
    }
    if (state.mode === 'ai') {
        state.activePlayer = 2; autoPlaceShips(); state.activePlayer = 1; initBattlePhase();
    }
}

function initBattlePhase() {
    state.phase = 'battle'; state.turn = 1;
    document.getElementById('placementControls').classList.add('hidden');
    document.getElementById('modeSelector').classList.add('hidden');
    document.getElementById('btnAutoPlace').classList.add('hidden');
    document.getElementById('btnResetPlacement').classList.add('hidden');
    document.getElementById('btnStartBattle').classList.add('hidden');
    document.getElementById('btnEndGame').classList.remove('hidden');
    document.getElementById('rightBoardWrapper').classList.remove('opacity-75', 'pointer-events-none');
    document.getElementById('turnStatusBadge').className = 'px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    document.getElementById('turnStatusBadge').innerText = 'БОЙ ИДЕТ';
    
    updateBoardTitles(); updateTurnDisplay();
    logCombat(`[Сражение]: Бой начался! Первый выстрел за Игроком 1.`);
    renderGrids(); updateShipsAliveCounters();
}

function handleBattleShot(r, c, targetPNum) {
    if (state.phase !== 'battle') return;
    
    if (state.mode === 'ai' && targetPNum === 2 && state.turn !== 1) return;
    if (state.mode === 'friend' && state.turn === targetPNum) return;

    const defender = state[`player${targetPNum}`];
    const cellVal = defender.grid[r][c];
    if (cellVal >= 2) return; 

    sounds.playShot();

    if (cellVal === 1) {
        defender.grid[r][c] = 3; sounds.playHit();
        logCombat(`[Попадание]: Точный выстрел в ${LETTERS[c]}${r + 1}! Стрелок продолжает ход.`);
        
        const sunkShip = checkAndMarkSunk(defender, r, c);
        if (sunkShip) logCombat(`[УНИЧТОЖЕН]: Корабль пошел на дно!`);
        
        renderGrids(); updateShipsAliveCounters();
        if (checkVictory(targetPNum)) { handleGameOver(state.turn); return; }
        
        if (state.mode === 'ai' && state.turn === 2) setTimeout(executeAiTurn, 800);
    } 
    else {
        defender.grid[r][c] = 2; sounds.playSplash();
        logCombat(`[Промах]: Выстрел мимо. Переход хода.`);
        renderGrids();
        
        if (state.mode === 'friend') {
            setTimeout(() => {
                state.turn = state.turn === 1 ? 2 : 1;
                showPassScreen(state.turn, () => {
                    updateTurnDisplay(); updateBoardTitles(); renderGrids();
                });
            }, 800);
        } else {
            if (state.turn === 1) {
                state.turn = 2; 
                updateTurnDisplay(); 
                renderGrids();
                setTimeout(executeAiTurn, 900); 
            } else {
                state.turn = 1; 
                updateTurnDisplay(); 
                renderGrids();
            }
        }
    }
}

function checkAndMarkSunk(defender, r, c) {
    for (let ship of defender.placedShips) {
        const deck = ship.decks.find(d => d.r === r && d.c === c);
        if (deck) {
            deck.hit = true;
            if (ship.decks.every(d => d.hit)) {
                ship.decks.forEach(d => {
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const nr = d.r + dr, nc = d.c + dc;
                            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && defender.grid[nr][nc] === 0) defender.grid[nr][nc] = 4;
                        }
                    }
                });
                return ship;
            }
            break;
        }
    } return null;
}

function showPassScreen(nextP, callback) {
    document.getElementById('passTurnOverlay').classList.remove('hidden');
    document.getElementById('passTurnTitle').innerText = `ПЕРЕДАЙТЕ УСТРОЙСТВО ИГРОКУ ${nextP}`;
    passScreenCallback = callback;
}
function acceptPass() {
    document.getElementById('passTurnOverlay').classList.add('hidden');
    if (passScreenCallback) { passScreenCallback(); passScreenCallback = null; }
}

function updateTurnDisplay() {
    const text = document.getElementById('turnStatusText');
    if (state.mode === 'ai') text.innerText = state.turn === 1 ? 'Игрок 1: Ваш ход!' : 'Бот: Идет анализ целей...';
    else text.innerText = `Игрок ${state.turn}: Ваш ход!`;
}

function updateBoardTitles() {
    const lTitle = document.getElementById('leftPlayerTitle'), rTitle = document.getElementById('rightPlayerTitle');
    if (state.mode === 'ai') {
        lTitle.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Ваш Флот`;
        rTitle.innerHTML = `<i class="fa-solid fa-robot"></i> Флот Бота`;
    } else {
        lTitle.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Ваш Флот (Игрок ${state.turn})`;
        rTitle.innerHTML = `<i class="fa-solid fa-crosshairs"></i> Флот Противника (Игрок ${state.turn === 1 ? 2 : 1})`;
    }
}

function updateShipsAliveCounters() {
    [1, 2].forEach(pNum => {
        const alive = state[`player${pNum}`].placedShips.filter(s => !s.decks.every(d => d.hit)).length;
        document.getElementById(pNum === 1 ? 'leftShipsAlive' : 'rightShipsAlive').innerText = `Кораблей: ${alive}/10`;
    });
}

function checkVictory(defenderPNum) { return state[`player${defenderPNum}`].placedShips.every(s => s.decks.every(d => d.hit)); }

// ИСПРАВЛЕНО: Умный цикл выбора цели, который не дает игре зависнуть!
function executeAiTurn() {
    if (state.phase !== 'battle' || state.turn !== 2) return;
    
    let tr = -1, tc = -1;
    let validTargetFound = false;

    while (!validTargetFound) {
        if (state.aiDifficulty === 'easy') {
            tr = Math.floor(Math.random() * BOARD_SIZE);
            tc = Math.floor(Math.random() * BOARD_SIZE);
            if (state.player1.grid[tr][tc] < 2) validTargetFound = true;
        } else {
            if (state.aiTargetQueue.length > 0) {
                const next = state.aiTargetQueue.shift();
                tr = next.r; tc = next.c;
                // Бот проверяет: "А не пометилась ли эта клетка серым, пока она лежала в очереди?"
                if (state.player1.grid[tr][tc] < 2) {
                    validTargetFound = true;
                }
            } else {
                const cand = [];
                for (let r = 0; r < BOARD_SIZE; r++) {
                    for (let c = 0; c < BOARD_SIZE; c++) {
                        if (state.player1.grid[r][c] < 2) {
                            if (state.aiDifficulty === 'hard' && (r + c) % 2 === 0) cand.push({ r, c });
                            else if (state.aiDifficulty !== 'hard') cand.push({ r, c });
                        }
                    }
                }
                if (cand.length > 0) {
                    const chosen = cand[Math.floor(Math.random() * cand.length)];
                    tr = chosen.r; tc = chosen.c;
                    validTargetFound = true;
                } else {
                    let rr, cc;
                    do {
                        rr = Math.floor(Math.random() * BOARD_SIZE);
                        cc = Math.floor(Math.random() * BOARD_SIZE);
                    } while (state.player1.grid[rr][cc] >= 2);
                    tr = rr; tc = cc;
                    validTargetFound = true;
                }
            }
        }
    }
    
    // Если бот попал, он планирует обстрел соседних клеток
    if (state.player1.grid[tr][tc] === 1) {
        [{ r: tr-1, c: tc }, { r: tr+1, c: tc }, { r: tr, c: tc-1 }, { r: tr, c: tc+1 }].forEach(n => {
            if (n.r >= 0 && n.r < BOARD_SIZE && n.c >= 0 && n.c < BOARD_SIZE && state.player1.grid[n.r][n.c] < 2 && !state.aiTargetQueue.some(q => q.r === n.r && q.c === n.c)) {
                state.aiTargetQueue.unshift(n);
            }
        });
    }
    
    // Стреляет
    handleBattleShot(tr, tc, 1);
}

function logCombat(msg) {
    const log = document.getElementById('combatLog');
    log.appendChild(Object.assign(document.createElement('div'), { innerText: msg }));
    log.scrollTop = log.scrollHeight;
}
function clearCombatLog() { document.getElementById('combatLog').innerHTML = ''; }

function endGame() {
    if (confirm("Вы уверены, что хотите завершить текущую игру? Весь прогресс будет сброшен.")) restartFullGame();
}

function handleGameOver(winnerNum) {
    state.phase = 'gameover'; sounds.playWin();
    const title = document.getElementById('modalTitle'), msg = document.getElementById('modalMessage');
    if (state.mode === 'ai') {
        if (winnerNum === 1) { title.innerText = 'ПОБЕДА!'; title.className = 'font-[\'Orbitron\'] text-2xl font-black text-emerald-400 mb-2'; msg.innerText = 'Вы уничтожили флот Бота!'; }
        else { title.innerText = 'ПОРАЖЕНИЕ!'; title.className = 'font-[\'Orbitron\'] text-2xl font-black text-rose-500 mb-2'; msg.innerText = 'Бот оказался сильнее.'; }
    } else {
        title.innerText = `ПОБЕДА ИГРОКА ${winnerNum}!`; title.className = 'font-[\'Orbitron\'] text-2xl font-black text-cyan-400 mb-2'; msg.innerText = `Игрок ${winnerNum} доминировал в бою!`;
    }
    document.getElementById('gameModal').classList.remove('hidden');
}

function restartFullGame() {
    document.getElementById('gameModal').classList.add('hidden');
    document.getElementById('placementControls').classList.remove('hidden');
    document.getElementById('modeSelector').classList.remove('hidden');
    document.getElementById('btnAutoPlace').classList.remove('hidden');
    document.getElementById('btnResetPlacement').classList.remove('hidden');
    document.getElementById('btnStartBattle').classList.remove('hidden');
    document.getElementById('btnEndGame').classList.add('hidden');
    
    state.phase = 'setup'; state.activePlayer = 1; state.turn = 1;
    state.player1 = { grid: createEmptyGrid(), ships: [], placedShips: [] };
    state.player2 = { grid: createEmptyGrid(), ships: [], placedShips: [] };
    state.aiTargetQueue = [];
    
    document.getElementById('turnStatusBadge').className = 'px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/40';
    document.getElementById('turnStatusBadge').innerText = 'Этап: Расстановка';
    document.getElementById('turnStatusText').innerText = 'Расставьте свой флот на игровом поле';
    
    updateBoardTitles(); initDock(); renderGrids();
}