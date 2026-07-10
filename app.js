// app.js - DOM controller and UI manager for Bio-Defensa

let game = null;
let multiplayer = null;
let myPlayerIndex = 0;
let selectedCardsForDiscard = new Set();
let isBotMoving = false;
let lastActivePlayerIndex = -1;
let playerBadge = null;

// --- Custom Alert Implementation (Bypasses Browser default dialogs) ---
function showCustomAlert(message, type = 'info') {
    // Remove old alert overlay if present
    const oldOverlay = document.getElementById('customAlertOverlay');
    if (oldOverlay) oldOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'customAlertOverlay';
    overlay.className = 'custom-alert-overlay';
    
    let emoji = '📢';
    if (type === 'error') emoji = '⚠️';
    if (type === 'success') emoji = '🏆';

    overlay.innerHTML = `
        <div class="custom-alert-modal glass-panel">
            <div style="font-size: 2.2rem; margin-bottom: 10px;">${emoji}</div>
            <div style="font-weight: 800; font-size: 1.1rem; margin-bottom: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--primary);">
                ${type === 'error' ? 'Advertencia' : 'Aviso del Sistema'}
            </div>
            <div style="font-size: 0.9rem; line-height: 1.5; color: var(--text-primary); margin-bottom: 20px;">
                ${message}
            </div>
            <button class="btn btn-primary" onclick="this.closest('.custom-alert-overlay').remove()" style="padding: 8px 20px; font-size: 0.8rem; border-radius: 8px;">
                Aceptar
            </button>
        </div>
    `;

    document.body.appendChild(overlay);
}

function showCustomConfirm(message, onConfirm) {
    const oldOverlay = document.getElementById('customConfirmOverlay');
    if (oldOverlay) oldOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'customConfirmOverlay';
    overlay.className = 'custom-alert-overlay';

    overlay.innerHTML = `
        <div class="custom-alert-modal glass-panel" style="max-width: 450px;">
            <div style="font-size: 2.2rem; margin-bottom: 10px;">❓</div>
            <div style="font-weight: 800; font-size: 1.1rem; margin-bottom: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--primary);">
                Confirmación
            </div>
            <div style="font-size: 0.9rem; line-height: 1.5; color: var(--text-primary); margin-bottom: 20px;">
                ${message}
            </div>
            <div style="display: flex; gap: 15px; justify-content: center;">
                <button class="btn btn-secondary" onclick="this.closest('.custom-alert-overlay').remove()" style="padding: 8px 20px; font-size: 0.8rem; border-radius: 8px;">
                    Cancelar
                </button>
                <button id="customConfirmAcceptBtn" class="btn btn-danger" style="padding: 8px 20px; font-size: 0.8rem; border-radius: 8px;">
                    Aceptar
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('customConfirmAcceptBtn').addEventListener('click', () => {
        overlay.remove();
        onConfirm();
    });
}

// --- Tab Selection ---
function selectTab(tab) {
    document.getElementById('tabLogsBtn').classList.toggle('active', tab === 'logs');
    document.getElementById('tabChatBtn').classList.toggle('active', tab === 'chat');
    document.getElementById('tabLogsContent').style.display = tab === 'logs' ? 'block' : 'none';
    document.getElementById('tabChatContent').style.display = tab === 'chat' ? 'block' : 'none';
}

function addLogToUI(logObj) {
    const logs = document.getElementById('tabLogsContent');
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    let colorStyle = '';
    if (logObj.color === 'red') colorStyle = 'border-left: 3px solid var(--color-red); padding-left: 6px;';
    else if (logObj.color === 'blue') colorStyle = 'border-left: 3px solid var(--color-blue); padding-left: 6px;';
    else if (logObj.color === 'green') colorStyle = 'border-left: 3px solid var(--color-green); padding-left: 6px;';
    else if (logObj.color === 'yellow') colorStyle = 'border-left: 3px solid var(--color-yellow); padding-left: 6px;';
    else if (logObj.color === 'orange') colorStyle = 'border-left: 3px solid var(--color-halloween); padding-left: 6px;';

    entry.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; ${colorStyle}">
            <span style="font-size:1.2rem;">${logObj.icon || '📝'}</span>
            <div>
                <span class="time">${logObj.time || new Date().toLocaleTimeString()}</span>
                <span style="color: var(--text-primary);">${logObj.message}</span>
            </div>
        </div>
    `;
    logs.appendChild(entry);
    logs.scrollTop = logs.scrollHeight;
}

function addChatToUI(author, message) {
    const chat = document.getElementById('tabChatContent');
    const entry = document.createElement('div');
    entry.className = 'chat-entry';
    entry.innerHTML = `<span class="author">${author}:</span> ${message}`;
    chat.appendChild(entry);
    chat.scrollTop = chat.scrollHeight;
}

// --- Initialization & Mode Setup ---
window.addEventListener('load', async () => {
    await dbInstance.init();
    const profile = await dbInstance.getProfile();
    const stats = await dbInstance.getStats();
    playerBadge = dbInstance.getVictoryBadge(stats.gamesWon);

    // Ensure valid numerical volume defaults if database profile properties are missing/invalid
    const parseVol = (v, fallback) => (v === undefined || v === null || isNaN(parseFloat(v))) ? fallback : parseFloat(v);
    const soundVol = parseVol(profile.volumeSound, 0.5);
    const musicVol = parseVol(profile.volumeMusic, 0.3);

    localStorage.setItem('bd_vol_sound', soundVol);
    localStorage.setItem('bd_vol_music', musicVol);

    // Music will start upon first user interaction via audio.js unlockAudio

    const config = {
        numPlayers: parseInt(profile.botCount || 3),
        mode: profile.gameMode || 'normal',
        includeEvolution: true,
        includeHalloween: true
    };
    game = new VirusGame(config);

    game.onTurnTimerTick = (time) => {
        document.getElementById('turnTimerText').textContent = `${time}s`;
    };

    game.onLogUpdate = (logObj) => {
        addLogToUI(logObj);
    };

    game.onSoundTrigger = (type) => {
        playSound(type);
    };

    game.onTurnChange = (idx) => {
        updateActiveTurnUI(idx);
        triggerBotOrTurnAction();
    };

    game.onStateChange = () => {
        renderGameBoard();
    };

    game.onGameOver = async (winner) => {
        isBotMoving = false;
        renderGameBoard();
        showGameOverModal(winner);

        const duration = 150; 
        const isWin = winner.index === myPlayerIndex;
        await dbInstance.updateStats(isWin, duration, []);
        await dbInstance.addMatchToHistory({
            date: new Date().toLocaleDateString(),
            playersCount: game.numPlayers,
            result: isWin ? 'victoria' : 'derrota',
            duration: duration,
            mode: game.mode
        });

        // Update badge dynamically in case threshold was crossed
        const stats = await dbInstance.getStats();
        playerBadge = dbInstance.getVictoryBadge(stats.gamesWon);
    };

    // Register user interactions to bypass audio autoplay blocks
    document.body.addEventListener('click', () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (parseFloat(localStorage.getItem('bd_vol_music') || 0.3) > 0 && !bgMusicInterval) {
            startBackgroundMusic();
        }
    }, { once: true });

    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');

    if (modeParam === 'local') {
        const names = [profile.avatar + " " + profile.nickname];
        for (let i = 1; i < game.numPlayers; i++) {
            names.push(`🤖 Bot ${i} (${['Fácil', 'Normal', 'Difícil'][(i - 1) % 3]})`);
        }
        game.setupGame(names);
        game.onReactionRequested = (attackerIdx, cardId, targetIdx, targetOrganIdx, extraParams, shieldCardId) => {
            if (window.showReactionModal) {
                window.showReactionModal(attackerIdx, cardId, targetIdx, targetOrganIdx, extraParams, shieldCardId);
            }
        };
        myPlayerIndex = 0;
        updateActiveTurnUI(0);
        renderGameBoard();
    } 
    else if (modeParam === 'create') {
        initMultiplayer(profile.nickname, profile.avatar, true, null, stats.gamesWon);
    } 
    else if (modeParam === 'join') {
        const code = params.get('code');
        initMultiplayer(profile.nickname, profile.avatar, false, code, stats.gamesWon);
    }
});

// --- Multiplayer Connection Setup ---
function initMultiplayer(nickname, avatar, isHost, code = null, gamesWon = 0) {
    // Check if Firebase SDK is loaded before attempting multiplayer
    if (typeof firebase === 'undefined' || !firebase.database) {
        showCustomAlert('Error: No se pudo cargar el servicio multijugador. Comprueba tu conexión a internet y recarga la página.', 'error');
        document.getElementById('roomCodeDisplay').textContent = 'Error de conexión';
        return;
    }

    multiplayer = new BioDefensaMultiplayer(game);
    document.getElementById('lobbyControls').style.display = 'block';

    multiplayer.onRoomCreated = (roomId) => {
        document.getElementById('roomCodeDisplay').textContent = roomId;
        addLogToUI({ message: `Sala ${roomId} creada. Esperando jugadores...`, icon: '🏠' });
    };

    multiplayer.onPlayerJoined = (player) => {
        updateLobbyList();
        addLogToUI({ message: player ? `¡${player.nickname} se ha unido a la sala!` : "Lista de jugadores actualizada.", icon: '👥' });
        
        const isReadyToStart = multiplayer.playersList.length >= 2;
        document.getElementById('startHostGameBtn').disabled = !isReadyToStart;
    };

    multiplayer.onPlayerLeft = (player) => {
        updateLobbyList();
        if (player && player.nickname) {
            addLogToUI({ message: `El jugador ${player.nickname} ha abandonado la sala.`, icon: '🚪' });
        } else {
            addLogToUI({ message: 'Un jugador ha abandonado la sala.', icon: '🚪' });
        }
    };

    multiplayer.onChatMessage = (author, msg) => {
        addChatToUI(author, msg);
    };

    multiplayer.onConnected = () => {
        document.getElementById('roomCodeDisplay').textContent = "Esperando al anfitrión...";
        addLogToUI({ message: "Conectado al Host. Esperando inicio...", icon: '📡' });
    };

    multiplayer.onGameStateSync = (syncState) => {
        document.getElementById('lobbyControls').style.display = 'none'; 
        
        const gameOverOverlay = document.getElementById('gameOverOverlay');
        if (gameOverOverlay && !syncState.isGameOver) {
            gameOverOverlay.remove();
        }
        
        myPlayerIndex = multiplayer.getMyPlayerIndex();
        
        // Render any new history log entries from the host
        if (syncState.historyLog && syncState.historyLog.length > 0) {
            const logsContainer = document.getElementById('tabLogsContent');
            if (logsContainer) {
                // Clear and re-render the latest logs from host
                logsContainer.innerHTML = '';
                syncState.historyLog.forEach(logObj => {
                    addLogToUI(logObj);
                });
            }
        }
        
        // Reset turn timer for guest
        game.timeLeft = 30;
        if (game.turnTimer) clearInterval(game.turnTimer);
        game.turnTimer = setInterval(() => {
            if (game.pendingReaction) return; // Pause guest timer during reactions
            game.timeLeft--;
            game.onTurnTimerTick(game.timeLeft);
            if (game.timeLeft <= 0) {
                clearInterval(game.turnTimer);
            }
        }, 1000);
        game.onTurnTimerTick(game.timeLeft);
        
        updateActiveTurnUI(syncState.activePlayerIndex);
        renderGameBoard();
        
        // Play a subtle sound to notify guest of state change
        try { playSound('play_card'); } catch(e) {}
    };

    multiplayer.onError = (err) => {
        showCustomAlert(err, 'error');
        // Give the user time to read the error before redirecting
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 4000);
    };

    multiplayer.init(nickname, avatar, gamesWon).then(() => {
        if (isHost) {
            multiplayer.createRoom();
        } else {
            if (!code) {
                showCustomAlert('No se proporcionó un código de sala.', 'error');
                return;
            }
            multiplayer.joinRoom(code);
        }
    }).catch(err => {
        console.error('Multiplayer init error:', err);
        showCustomAlert('Error al inicializar el multijugador. Inténtalo de nuevo.', 'error');
    });
}

function updateLobbyList() {
    const list = document.getElementById('rivalsRow');
    if (!list) return;
    list.innerHTML = multiplayer.playersList.map(p => {
        const kickBtn = (multiplayer.isHost && !p.isHost) ? `<button class="btn btn-danger" onclick="kickPlayer('${p.peerId}')" style="padding: 4px 8px; font-size: 0.65rem; margin-top: 6px; border-radius: 6px; text-transform: none; font-weight: bold; min-width: auto;">Expulsar</button>` : '';
        return `
            <div class="glass-panel" style="padding: 10px 15px; border-radius: 8px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <div style="font-size: 1.5rem;">${p.avatar}</div>
                <div style="font-size: 0.8rem; font-weight: 600;">${p.nickname}</div>
                <div style="font-size: 0.65rem; color: var(--text-muted);">${p.isHost ? 'Anfitrión' : 'Jugador'}</div>
                ${kickBtn}
            </div>
        `;
    }).join('');
}

function startHostGame() {
    if (!multiplayer || !multiplayer.isHost) return;
    multiplayer.startMultiplayerGame(game.mode, true, true);
    document.getElementById('lobbyControls').style.display = 'none';
}

function copyInviteLink() {
    const roomCode = document.getElementById('roomCodeDisplay').textContent;
    const inviteLink = `${window.location.origin}${window.location.pathname}?mode=join&code=${roomCode}`;
    
    navigator.clipboard.writeText(inviteLink).then(() => {
        showCustomAlert("¡Enlace de invitación copiado al portapapeles!", 'info');
    }).catch(() => {
        showCustomAlert(`Código de sala: ${roomCode}`, 'info');
    });
}

// --- Turn & AI Management ---
function updateActiveTurnUI(activeIdx) {
    const activePlayer = game.players[activeIdx];
    if (!activePlayer) return;

    const turnLabel = document.getElementById('activeTurnName');
    turnLabel.textContent = (activeIdx === myPlayerIndex) ? "¡Tu Turno!" : activePlayer.name;
    
    if (activeIdx === myPlayerIndex) {
        turnLabel.style.color = "var(--color-green)";
    } else {
        turnLabel.style.color = "var(--primary)";
    }
}

function triggerBotOrTurnAction() {
    if (game.isGameOver) return;

    const activePlayer = game.players[game.activePlayerIndex];
    if (activePlayer.isBot && !isBotMoving) {
        isBotMoving = true;
        
        setTimeout(() => {
            if (game.isGameOver || game.activePlayerIndex !== activePlayer.index) {
                isBotMoving = false;
                return;
            }

            const decision = BioDefensaAI.getDecision(game, game.activePlayerIndex);
            
            if (decision.type === 'play') {
                game.playCard(
                    game.activePlayerIndex,
                    decision.cardId,
                    decision.targetPlayerIndex,
                    decision.targetOrganIndex,
                    decision.extraParams
                );
            } else if (decision.type === 'discard') {
                game.discardCards(game.activePlayerIndex, decision.cardIds);
            }

            isBotMoving = false;
        }, 1500);
    }
}

// --- Sensory Feedback (Particles & Sounds) ---
function playCardSound(card) {
    if (!card) return;
    if (card.type === 'virus') playSound('infect');
    else if (card.type === 'medicine') playSound('cure');
    else playSound('play_card');
}

function spawnParticles(ev, type) {
    const x = ev.clientX;
    const y = ev.clientY;
    
    for (let i = 0; i < 12; i++) {
        const particle = document.createElement('div');
        particle.className = `particle particle-${type}`;
        
        // Random spread
        const angle = Math.random() * Math.PI * 2;
        const velocity = 20 + Math.random() * 50;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity;
        
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        particle.style.setProperty('--tx', `${tx}px`);
        particle.style.setProperty('--ty', `${ty}px`);
        
        document.body.appendChild(particle);
        
        // Remove after animation
        setTimeout(() => particle.remove(), 800);
    }
}

// --- Drag & Drop Implementation ---
function allowDrag(ev) {
    ev.preventDefault();
}

function handleDragStart(ev, cardId) {
    if (game.activePlayerIndex !== myPlayerIndex) {
        ev.preventDefault();
        return;
    }
    ev.dataTransfer.setData("text/plain", cardId);
}

function handleBoardDragOver(ev, isInvalid = false) {
    ev.preventDefault();
    const boardPanel = document.getElementById('playerBoardPanel');
    if (boardPanel) {
        boardPanel.classList.add(isInvalid ? 'drag-over-invalid' : 'drag-over');
    }
}

function handleBoardDragLeave(ev) {
    const boardPanel = document.getElementById('playerBoardPanel');
    if (boardPanel) {
        boardPanel.classList.remove('drag-over', 'drag-over-invalid');
    }
}

function handleBoardDrop(ev) {
    ev.preventDefault();
    handleBoardDragLeave(ev);

    const cardId = ev.dataTransfer.getData("text/plain");
    const activePlayer = game.players[myPlayerIndex];
    const card = activePlayer.hand.find(c => c.id === cardId);
    if (!card) return;

    if (card.type === 'organ') {
        if (card.color === 'orange') {
            triggerMutanteSelection(cardId);
        } else {
            executePlay(cardId, myPlayerIndex, null);
        }
    } else if (card.type === 'medicine') {
        const targetOrganIdx = resolveTargetOrgan(card, myPlayerIndex, null);
        if (targetOrganIdx !== null) {
            executePlay(cardId, myPlayerIndex, targetOrganIdx);
        } else {
            showCustomAlert("Selecciona un órgano objetivo para aplicar la medicina.", 'info');
        }
    } else if (card.type === 'special') {
        const act = card.action;
        // Global specials that don't need a specific target organ
        if (['contagion', 'latex_glove', 'extra_time', 'apparition'].includes(act)) {
            executePlay(cardId, myPlayerIndex, null);
        } else if (act === 'body_swap') {
            triggerBodySwapDirection(cardId);
        } else if (act === 'transplant' || act === 'steal_organ' || act === 'alien_transplant') {
            showCustomAlert(`Para usar esta carta, debes arrastrarla directamente sobre el órgano del oponente en la mesa.`, 'info');
        } else {
            showCustomAlert("Esta carta especial requiere que la arrastres sobre un jugador u órgano específico.", 'info');
        }
    }
}

function handleOrganDragOver(ev, playerIdx, organIdx) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.currentTarget.classList.add('drag-over');
}

function handleOrganDragLeave(ev) {
    ev.stopPropagation();
    ev.currentTarget.classList.remove('drag-over');
}

function resolveTargetOrgan(card, targetPlayerIdx, targetOrganIdx) {
    if (targetOrganIdx !== null) return targetOrganIdx;
    
    const targetPlayer = game.players[targetPlayerIdx];
    if (!targetPlayer || targetPlayer.board.length === 0) return null;
    
    // If player has only 1 organ, target it automatically
    if (targetPlayer.board.length === 1) return 0;
    
    // If card targets a matching color, find that matching organ
    if (card.color && card.color !== 'multicolor' && card.color !== 'none') {
        const matchingIdx = targetPlayer.board.findIndex(slot => slot.organ.color === card.color || slot.organ.color === 'multicolor');
        if (matchingIdx !== -1) return matchingIdx;
    }
    
    return null;
}

function handleOrganDrop(ev, targetPlayerIdx, targetOrganIdx) {
    ev.preventDefault();
    ev.stopPropagation();
    ev.currentTarget.classList.remove('drag-over');

    const cardId = ev.dataTransfer.getData("text/plain");
    const activePlayer = game.players[myPlayerIndex];
    const card = activePlayer.hand.find(c => c.id === cardId);
    if (!card) return;

    // Resolve target organ dynamically if dropped on player board instead of organ slot
    targetOrganIdx = resolveTargetOrgan(card, targetPlayerIdx, targetOrganIdx);

    if (card.type === 'virus' && targetPlayerIdx === myPlayerIndex) {
        playSound('error');
        showCustomAlert("No puedes infectar tus propios órganos.", 'error');
        return;
    }

    if (card.type === 'medicine' && targetPlayerIdx !== myPlayerIndex && !activePlayer.trickOrTreatActive) {
        playSound('error');
        showCustomAlert("Solo puedes aplicar medicinas en tus propios órganos.", 'error');
        return;
    }

    if (card.type === 'special') {
        const act = card.action;
        if (act === 'transplant') {
            triggerTransplant(cardId, targetPlayerIdx, targetOrganIdx);
            return;
        }
        if (act === 'alien_transplant') {
            triggerAlienTransplant(cardId, targetPlayerIdx, targetOrganIdx);
            return;
        }
        if (act === 'failed_experiment') {
            triggerExperimentChoice(cardId, targetPlayerIdx, targetOrganIdx);
            return;
        }
        if (act === 'quarantine') {
            triggerQuarantineChoice(cardId, targetPlayerIdx, targetOrganIdx);
            return;
        }
        if (act === 'body_swap') {
            triggerBodySwapDirection(cardId);
            return;
        }
    }

    // Visual and sound feedback
    playCardSound(card);
    spawnParticles(ev, card.type);

    executePlay(cardId, targetPlayerIdx, targetOrganIdx);
}

// Discard pile drop
function handleDiscardDrop(ev) {
    ev.preventDefault();
    const cardId = ev.dataTransfer.getData("text/plain");
    if (!cardId) return;

    const activePlayer = game.players[myPlayerIndex];
    const card = activePlayer ? activePlayer.hand.find(c => c.id === cardId) : null;
    if (card && card.type === 'special' && card.action === 'apparition') {
        // Visual and sound feedback for apparition
        playCardSound(card);
        spawnParticles(ev, 'special');
        
        // Apparition / Llorona is dropped on the discard pile to activate it!
        executePlay(cardId, myPlayerIndex, null);
        return;
    }

    // Visual and sound feedback for regular discard
    playSound('play_card');
    spawnParticles(ev, 'organ'); // generic gray/organ particles for discard

    if (multiplayer && !multiplayer.isHost) {
        multiplayer.sendAction('discard', {
            cardIds: [cardId]
        });
    } else {
        game.discardCards(myPlayerIndex, [cardId]);
    }
}

function executePlay(cardId, targetPlayerIndex, targetOrganIndex, extraParams = {}) {
    if (multiplayer && !multiplayer.isHost) {
        multiplayer.sendAction('play', {
            cardId: cardId,
            targetPlayerIndex: targetPlayerIndex,
            targetOrganIndex: targetOrganIndex,
            extraParams: extraParams
        });
    } else {
        const res = game.playCard(myPlayerIndex, cardId, targetPlayerIndex, targetOrganIndex, extraParams);
        if (!res.valid) {
            showCustomAlert(res.reason, 'error');
        } else {
            if (multiplayer && multiplayer.isHost) {
                multiplayer.broadcastState();
            }
        }
    }
}

window.showGameOverModal = function(winner) {
    const oldOverlay = document.getElementById('gameOverOverlay');
    if (oldOverlay) oldOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'gameOverOverlay';
    overlay.className = 'custom-alert-overlay';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0, 0, 0, 0.8)';
    overlay.style.zIndex = '1000';

    const isHostOrLocal = !multiplayer || multiplayer.isHost;

    overlay.innerHTML = `
        <div class="custom-alert-modal glass-panel" style="max-width: 500px; text-align: center; padding: 40px; border-radius: 16px;">
            <div style="font-size: 4rem; margin-bottom: 10px;">👑</div>
            <div style="font-weight: 800; font-size: 1.8rem; margin-bottom: 5px; color: var(--primary);">
                ¡PARTIDA TERMINADA!
            </div>
            <div style="font-size: 1.2rem; margin-bottom: 25px; color: var(--text-primary);">
                El ganador es: <strong style="color: var(--color-green);">${winner.name}</strong>
            </div>
            <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                <button class="btn btn-secondary" onclick="exitToLobby()" style="padding: 10px 20px;">
                    Salir al Menú
                </button>
                ${isHostOrLocal ? `
                <button id="playAgainBtn" class="btn btn-primary" onclick="restartSameGame()" style="padding: 10px 20px;">
                    Volver a Jugar
                </button>
                ` : `
                <div style="width: 100%; font-size: 0.9rem; color: var(--text-muted); align-self: center; margin-top: 10px;">
                    Esperando a que el anfitrión inicie otra partida...
                </div>
                `}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
};

window.restartSameGame = function() {
    const overlay = document.getElementById('gameOverOverlay');
    if (overlay) overlay.remove();

    if (multiplayer && multiplayer.isHost) {
        multiplayer.startMultiplayerGame(game.mode, game.includeEvolution, game.includeHalloween);
    } else {
        const names = game.players.map(p => p.name);
        game.setupGame(names);
        game.onReactionRequested = (attackerIdx, cardId, targetIdx, targetOrganIdx, extraParams, shieldCardId) => {
            if (window.showReactionModal) {
                window.showReactionModal(attackerIdx, cardId, targetIdx, targetOrganIdx, extraParams, shieldCardId);
            }
        };
        updateActiveTurnUI(game.activePlayerIndex);
        renderGameBoard();
    }
};

// --- Interactive Selection Modals ---
function setModalIcon(emoji) {
    const iconEl = document.querySelector('.choice-modal-icon');
    if (iconEl) iconEl.textContent = emoji;
}

function triggerMutanteSelection(cardId) {
    const myPlayer = game.players[myPlayerIndex];
    if (myPlayer.board.length === 0) {
        showCustomAlert("El Órgano Mutante requiere descartar un órgano tuyo. No tienes órganos en mesa.", 'error');
        return;
    }
    const modal = document.getElementById('choiceModal');
    const title = document.getElementById('choiceModalTitle');
    const opts = document.getElementById('choiceModalOptions');

    setModalIcon('🎃');
    title.textContent = "Elige qué órgano descartar por el Órgano Mutante";
    opts.innerHTML = myPlayer.board.map((slot, idx) => `
        <button class="btn btn-secondary" onclick="confirmMutante('${cardId}', ${idx})">
            ${slot.organ.name} (${slot.organ.color})
        </button>
    `).join('');
    modal.style.display = 'flex';
}

window.confirmMutante = (cardId, replacedIndex) => {
    document.getElementById('choiceModal').style.display = 'none';
    executePlay(cardId, myPlayerIndex, null, { replacedOrganIndex: replacedIndex });
};

function triggerTransplant(cardId, enemyPlayerIdx, enemyOrganIdx) {
    if (enemyOrganIdx === null) {
        showCustomAlert("Debes arrastrar la carta sobre un órgano específico del oponente, no sobre el jugador.", 'error');
        return;
    }
    const myPlayer = game.players[myPlayerIndex];
    if (myPlayer.board.length === 0) {
        showCustomAlert("No tienes órganos para trasplantar.", 'error');
        return;
    }

    const modal = document.getElementById('choiceModal');
    const title = document.getElementById('choiceModalTitle');
    const opts = document.getElementById('choiceModalOptions');

    const targetSlot = game.players[enemyPlayerIdx].board[enemyOrganIdx];
    const targetOrganName = `${targetSlot.organ.name} (${targetSlot.organ.color})`;
    const targetPlayerName = game.players[enemyPlayerIdx].name;

    setModalIcon('🔄');
    title.textContent = `Vas a quitarle ${targetOrganName} a ${targetPlayerName}. Elige tu órgano para darle a cambio:`;
    opts.innerHTML = myPlayer.board.map((slot, idx) => `
        <button class="btn btn-secondary" onclick="confirmTransplant('${cardId}', ${enemyPlayerIdx}, ${enemyOrganIdx}, ${idx})">
            ${slot.organ.name} (${slot.organ.color})
        </button>
    `).join('');
    modal.style.display = 'flex';
}

window.confirmTransplant = (cardId, enemyPlayerIdx, enemyOrganIdx, myOrganIdx) => {
    document.getElementById('choiceModal').style.display = 'none';
    executePlay(cardId, enemyPlayerIdx, enemyOrganIdx, { myOrganIndex: myOrganIdx });
};

function triggerExperimentChoice(cardId, targetPlayerIdx, targetOrganIdx) {
    if (targetOrganIdx === null) {
        showCustomAlert("Debes arrastrar la carta sobre un órgano específico.", 'error');
        return;
    }
    const modal = document.getElementById('choiceModal');
    const title = document.getElementById('choiceModalTitle');
    const opts = document.getElementById('choiceModalOptions');

    setModalIcon('🧪');
    title.textContent = "¿Cómo actuará tu Experimento Fallido?";
    opts.innerHTML = `
        <button class="btn btn-primary" onclick="confirmExperiment('${cardId}', ${targetPlayerIdx}, ${targetOrganIdx}, 'medicine')">Cura/Vacuna</button>
        <button class="btn btn-danger" onclick="confirmExperiment('${cardId}', ${targetPlayerIdx}, ${targetOrganIdx}, 'virus')">Infección/Extirpación</button>
    `;
    modal.style.display = 'flex';
}

window.confirmExperiment = (cardId, targetPlayerIdx, targetOrganIdx, choice) => {
    document.getElementById('choiceModal').style.display = 'none';
    executePlay(cardId, targetPlayerIdx, targetOrganIdx, { experimentChoice: choice });
};

function triggerBodySwapDirection(cardId) {
    const modal = document.getElementById('choiceModal');
    const title = document.getElementById('choiceModalTitle');
    const opts = document.getElementById('choiceModalOptions');

    setModalIcon('🧱');
    title.textContent = "Elige el sentido de Cambio de Cuerpos";
    opts.innerHTML = `
        <button class="btn btn-primary" onclick="confirmBodySwap('${cardId}', 'clockwise')">Horario ➡️</button>
        <button class="btn btn-secondary" onclick="confirmBodySwap('${cardId}', 'counterclockwise')">Antihorario ⬅️</button>
    `;
    modal.style.display = 'flex';
}

window.confirmBodySwap = (cardId, dir) => {
    document.getElementById('choiceModal').style.display = 'none';
    executePlay(cardId, myPlayerIndex, null, { direction: dir });
};

function triggerQuarantineChoice(cardId, targetPlayerIdx, targetOrganIdx) {
    const slot = game.players[targetPlayerIdx].board[targetOrganIdx];
    if (!slot || slot.viruses.length === 0) {
        showCustomAlert("El órgano no tiene virus activos para poner en cuarentena.", 'error');
        return;
    }

    const modal = document.getElementById('choiceModal');
    const title = document.getElementById('choiceModalTitle');
    const opts = document.getElementById('choiceModalOptions');

    setModalIcon('🚧');
    title.textContent = "Elige el virus a retirar permanentemente";
    opts.innerHTML = slot.viruses.map((v, idx) => `
        <button class="btn btn-danger" onclick="confirmQuarantine('${cardId}', ${targetPlayerIdx}, ${targetOrganIdx}, ${idx})">
            ${v.name}
        </button>
    `).join('');
    modal.style.display = 'flex';
}

window.confirmQuarantine = (cardId, targetPlayerIdx, targetOrganIdx, virusIndex) => {
    document.getElementById('choiceModal').style.display = 'none';
    executePlay(cardId, targetPlayerIdx, targetOrganIdx, { virusIndex: virusIndex });
};

function triggerAlienTransplant(cardId, firstPlayerIdx, firstOrganIdx) {
    if (firstOrganIdx === null) {
        showCustomAlert("Debes arrastrar la carta sobre un órgano específico.", 'error');
        return;
    }
    const firstPlayer = game.players[firstPlayerIdx];
    const firstSlot = firstPlayer.board[firstOrganIdx];
    
    if (!firstSlot) return;

    const modal = document.getElementById('choiceModal');
    const title = document.getElementById('choiceModalTitle');
    const opts = document.getElementById('choiceModalOptions');

    const targetOrganName = `${firstSlot.organ.name} (${firstSlot.organ.color})`;
    const targetPlayerName = firstPlayer.name;

    setModalIcon('👽');
    title.textContent = `Trasplante Alienígena: Elegiste ${targetOrganName} de ${targetPlayerName}. Elige el segundo órgano para el intercambio:`;
    
    let optionsHtml = '';
    game.players.forEach(p => {
        p.board.forEach((slot, idx) => {
            // Can't swap with itself
            if (p.index === firstPlayerIdx && idx === firstOrganIdx) return;
            
            optionsHtml += `
                <button class="btn btn-secondary" style="margin: 4px;" onclick="confirmAlienTransplant('${cardId}', ${firstPlayerIdx}, ${firstOrganIdx}, ${p.index}, ${idx})">
                    ${p.name}: ${slot.organ.name} (${slot.organ.color})
                </button>
            `;
        });
    });

    if (!optionsHtml) {
        showCustomAlert("No hay otros órganos en juego para intercambiar.", 'error');
        return;
    }

    opts.innerHTML = optionsHtml;
    modal.style.display = 'flex';
}

window.confirmAlienTransplant = (cardId, p1Idx, org1Idx, p2Idx, org2Idx) => {
    document.getElementById('choiceModal').style.display = 'none';
    executePlay(cardId, p1Idx, org1Idx, {
        player1Index: p1Idx,
        organ1Index: org1Idx,
        player2Index: p2Idx,
        organ2Index: org2Idx
    });
};

// --- REACTION SYSTEM ---
window.currentPendingReaction = null;

window.showReactionModal = (attackerIdx, cardId, targetIdx, targetOrganIdx, extraParams, shieldCardId) => {
    const modal = document.getElementById('choiceModal');
    const title = document.getElementById('choiceModalTitle');
    const opts = document.getElementById('choiceModalOptions');
    
    const attackerName = game.players[attackerIdx].name;
    
    // Store in global window variable to avoid any quote escaping issues in HTML attributes
    window.currentPendingReaction = { attackerIdx, cardId, targetIdx, targetOrganIdx, extraParams, shieldCardId };
    
    setModalIcon('🛡️');
    title.textContent = `¡${attackerName} te está atacando! Tienes un Traje de Protección. ¿Deseas usarlo para bloquear el ataque?`;
    opts.innerHTML = `
        <button class="btn btn-primary" onclick="confirmReaction(true)">🛡️ Usar Traje (Bloquear)</button>
        <button class="btn btn-danger" onclick="confirmReaction(false)">Recibir Ataque</button>
    `;
    modal.style.display = 'flex';
};

window.confirmReaction = (accept) => {
    document.getElementById('choiceModal').style.display = 'none';
    if (!window.currentPendingReaction) return;
    
    const { attackerIdx, cardId, targetIdx, targetOrganIdx, extraParams, shieldCardId } = window.currentPendingReaction;
    window.currentPendingReaction = null;
    
    if (multiplayer) {
        multiplayer.sendReactionResponse(accept, { attackerIdx, cardId, targetIdx, targetOrganIdx, extraParams, shieldCardId });
    } else {
        // Local mode direct execution
        extraParams.skipReactionCheck = true;
        if (accept) {
            extraParams.reactionUsed = true;
            extraParams.shieldCardId = shieldCardId;
        }
        const res = game.playCard(attackerIdx, cardId, targetIdx, targetOrganIdx, extraParams);
        if (!res.valid) {
            showCustomAlert(res.reason, 'error');
        } else {
            game.onStateChange();
        }
    }
};

window.showWaitingForReaction = (targetName) => {
    const modal = document.getElementById('choiceModal');
    const title = document.getElementById('choiceModalTitle');
    const opts = document.getElementById('choiceModalOptions');
    
    setModalIcon('⏳');
    title.textContent = `Esperando a que ${targetName} decida si usa su Traje de Protección...`;
    opts.innerHTML = `<div class="loader" style="margin: 20px auto; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;"></div>`;
    modal.style.display = 'flex';
};

window.hideWaitingForReaction = () => {
    document.getElementById('choiceModal').style.display = 'none';
};

// --- Card Selection ---
window.toggleCardSelection = (cardId, cardElement) => {
    if (game.activePlayerIndex !== myPlayerIndex) return;

    if (selectedCardsForDiscard.has(cardId)) {
        selectedCardsForDiscard.delete(cardId);
        cardElement.style.transform = '';
        cardElement.style.borderColor = '';
    } else {
        selectedCardsForDiscard.add(cardId);
        cardElement.style.transform = 'translateY(-15px)';
        cardElement.style.borderColor = 'var(--accent)';
    }
};

function discardSelectedCards() {
    if (selectedCardsForDiscard.size === 0) {
        showCustomAlert("Selecciona al menos una carta haciendo clic sobre ella antes de presionar Descartar.", 'info');
        return;
    }

    const cardIdsArray = Array.from(selectedCardsForDiscard);
    selectedCardsForDiscard.clear();

    if (multiplayer && !multiplayer.isHost) {
        multiplayer.sendAction('discard', { cardIds: cardIdsArray });
    } else {
        game.discardCards(myPlayerIndex, cardIdsArray);
    }
}

// Helper function for dynamic seating layout
function getSeatLayout(numPlayers) {
    if (numPlayers === 2) {
        return {
            gridCols: "1fr 280px 1fr",
            gridRows: "auto 1fr auto",
            centerStyle: "grid-row: 2; grid-column: 2;",
            maxCols: 3,
            seats: [
                { r: 3, c: 1, span: 3 }, // Player 0 (Bottom)
                { r: 1, c: 1, span: 3 }  // Player 1 (Top)
            ]
        };
    } else if (numPlayers === 3) {
        return {
            gridCols: "1fr 1fr",
            gridRows: "auto 1fr auto",
            centerStyle: "grid-row: 2; grid-column: 1 / span 2;",
            maxCols: 2,
            seats: [
                { r: 3, c: 1, span: 2 }, // Player 0 (Bottom)
                { r: 1, c: 1, span: 1 }, // Player 1 (Top Left)
                { r: 1, c: 2, span: 1 }  // Player 2 (Top Right)
            ]
        };
    } else if (numPlayers === 4) {
        return {
            gridCols: "1fr 300px 1fr",
            gridRows: "auto 1fr auto",
            centerStyle: "grid-row: 2; grid-column: 2;",
            maxCols: 3,
            seats: [
                { r: 3, c: 1, span: 3 }, // Player 0 (Bottom)
                { r: 2, c: 1, span: 1 }, // Player 1 (Left)
                { r: 1, c: 1, span: 3 }, // Player 2 (Top)
                { r: 2, c: 3, span: 1 }  // Player 3 (Right)
            ]
        };
    } else if (numPlayers === 5) {
        return {
            gridCols: "1fr 1fr 1fr 1fr",
            gridRows: "auto 1fr auto",
            centerStyle: "grid-row: 2; grid-column: 2 / span 2;",
            maxCols: 4,
            seats: [
                { r: 3, c: 2, span: 2 }, // Player 0 (Bottom Center)
                { r: 3, c: 1, span: 1 }, // Player 1 (Bottom Left)
                { r: 1, c: 1, span: 1 }, // Player 2 (Top Left)
                { r: 1, c: 4, span: 1 }, // Player 3 (Top Right)
                { r: 3, c: 4, span: 1 }  // Player 4 (Bottom Right)
            ]
        };
    } else if (numPlayers === 6) {
        return {
            gridCols: "1fr 1fr 1fr 1fr",
            gridRows: "auto 1fr auto",
            centerStyle: "grid-row: 2; grid-column: 2 / span 2;",
            maxCols: 4,
            seats: [
                { r: 3, c: 2, span: 2 }, // Player 0 (Bottom Center)
                { r: 3, c: 1, span: 1 }, // Player 1 (Bottom Left)
                { r: 1, c: 1, span: 1 }, // Player 2 (Top Left)
                { r: 1, c: 2, span: 2 }, // Player 3 (Top Center)
                { r: 1, c: 4, span: 1 }, // Player 4 (Top Right)
                { r: 3, c: 4, span: 1 }  // Player 5 (Bottom Right)
            ]
        };
    } else if (numPlayers === 7) {
        return {
            gridCols: "1fr 1fr 1fr 1fr",
            gridRows: "auto 1fr auto",
            centerStyle: "grid-row: 2; grid-column: 2 / span 2;",
            maxCols: 4,
            seats: [
                { r: 3, c: 2, span: 2 }, // Player 0 (Bottom Center)
                { r: 3, c: 1, span: 1 }, // Player 1 (Bottom Left)
                { r: 2, c: 1, span: 1 }, // Player 2 (Left)
                { r: 1, c: 1, span: 1 }, // Player 3 (Top Left)
                { r: 1, c: 4, span: 1 }, // Player 4 (Top Right)
                { r: 2, c: 4, span: 1 }, // Player 5 (Right)
                { r: 3, c: 4, span: 1 }  // Player 6 (Bottom Right)
            ]
        };
    } else if (numPlayers === 8) {
        return {
            gridCols: "1fr 1fr 1fr 1fr",
            gridRows: "auto 1fr 1fr auto",
            centerStyle: "grid-row: 2 / span 2; grid-column: 2 / span 2;",
            maxCols: 4,
            seats: [
                { r: 4, c: 2, span: 2 }, // Player 0 (Bottom Center)
                { r: 4, c: 1, span: 1 }, // Player 1 (Bottom Left)
                { r: 3, c: 1, span: 1 }, // Player 2 (Middle Left)
                { r: 1, c: 1, span: 1 }, // Player 3 (Top Left)
                { r: 1, c: 2, span: 2 }, // Player 4 (Top Center)
                { r: 1, c: 4, span: 1 }, // Player 5 (Top Right)
                { r: 3, c: 4, span: 1 }, // Player 6 (Middle Right)
                { r: 4, c: 4, span: 1 }  // Player 7 (Bottom Right)
            ]
        };
    } else {
        // 9+ players (4x4 layout clockwise fallback)
        return {
            gridCols: "repeat(4, 1fr)",
            gridRows: "auto 1fr 1fr auto",
            centerStyle: "grid-row: 2 / span 2; grid-column: 2 / span 2;",
            maxCols: 4,
            seats: [
                { r: 4, c: 2, span: 2 }, // Seat 0
                { r: 4, c: 1, span: 1 }, // Seat 1
                { r: 3, c: 1, span: 1 }, // Seat 2
                { r: 2, c: 1, span: 1 }, // Seat 3
                { r: 1, c: 1, span: 1 }, // Seat 4
                { r: 1, c: 2, span: 1 }, // Seat 5
                { r: 1, c: 3, span: 1 }, // Seat 6
                { r: 1, c: 4, span: 1 }, // Seat 7
                { r: 2, c: 4, span: 1 }, // Seat 8
                { r: 3, c: 4, span: 1 }, // Seat 9
                { r: 4, c: 4, span: 1 }  // Seat 10
            ]
        };
    }
}

// --- Rendering boards ---
function renderGameBoard() {
    if (!game) return;

    // Clear discard selection on turn changes
    if (game.activePlayerIndex !== lastActivePlayerIndex) {
        selectedCardsForDiscard.clear();
        lastActivePlayerIndex = game.activePlayerIndex;
    }

    const activePlayer = game.players[myPlayerIndex];
    if (!activePlayer) return;

    const layout = getSeatLayout(game.numPlayers);

    // Apply dynamic grid sizing to the container
    const grid = document.getElementById('tableGrid');
    if (grid) {
        grid.style.gridTemplateColumns = layout.gridCols;
        grid.style.gridTemplateRows = layout.gridRows;
    }

    // Add compact class if many players to avoid crowding
    if (game.numPlayers >= 6) {
        grid.classList.add('compact-table');
    } else {
        grid.classList.remove('compact-table');
    }

    // Cache the original center piles HTML template to prevent rendering blank cells
    const centerCellHTML = `
        <div class="table-center-cell glass-panel" id="tableCenterCell" style="${layout.centerStyle}">
            <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:5px; font-weight:800;">Mesa Central</div>
            <div class="center-piles">
                <div class="deck-card" id="deckPile">
                    <svg viewBox="0 0 24 24" style="width:24px; height:24px; stroke:currentColor; fill:none; stroke-width:2;"><circle cx="12" cy="12" r="2"/><path d="M12 10a4 4 0 1 1-3.5 5.9M9.2 12a4 4 0 1 1 6.3 3.5M14.8 12a4 4 0 1 1-2.8-5.7"/><path d="M12 2v2M4.9 4.9l1.4 1.4M2 12h2M4.9 19.1l1.4-1.4M12 20v2M19.1 19.1l-1.4-1.4M20 12h2M19.1 4.9l1.4 1.4"/></svg>
                    <span class="deck-count" id="deckCount">0</span>
                </div>
                <div class="discard-card" id="discardPile" ondragover="allowDrag(event)" ondrop="handleDiscardDrop(event)">
                    <svg viewBox="0 0 24 24" style="width:24px; height:24px; stroke:currentColor; fill:none; stroke-width:2;"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    <span class="deck-count" id="discardCount" style="background:rgba(239, 68, 68, 0.4)">0</span>
                </div>
                <div class="discard-card" id="quarantinePile" style="border-color: var(--color-halloween); color: var(--color-halloween);">
                    <svg viewBox="0 0 24 24" style="width:24px; height:24px; stroke:currentColor; fill:none; stroke-width:2;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
                    <span class="deck-count" id="quarantineCount" style="background:var(--color-halloween)">0</span>
                </div>
            </div>
        </div>
    `;
    let gridHTML = centerCellHTML;

    // Loop through all players and render their seat mats
    game.players.forEach(p => {
        let seatSlot = 0;
        if (p.index === myPlayerIndex) {
            seatSlot = 0;
        } else {
            // Clockwise seats mapping
            seatSlot = (p.index - myPlayerIndex + game.numPlayers) % game.numPlayers;
        }

        const pos = layout.seats[seatSlot] || { r: 1, c: 1, span: 1 };
        const gridStyle = `grid-row: ${pos.r}; grid-column: ${pos.c} / span ${pos.span};`;

        const isTurn = game.activePlayerIndex === p.index;
        const extraPlaysText = p.extraPlays ? `⏰×${p.extraPlays}` : '';
        const quarantineText = p.quarantined ? '🚧' : '';
        const gloveText = p.gloveActive ? '🧤' : '';
        const trickText = p.trickOrTreatActive ? '🎃' : '';

        let organsHTML = '';
        if (p.index === myPlayerIndex) {
            if (p.board.length === 0) {
                organsHTML = `
                    <div style="font-size:0.6rem; color:var(--text-muted); text-align:center; padding:10px; border:1.5px dashed rgba(255,255,255,0.06); border-radius:8px; width:100%;" ondragover="allowDrag(event)" ondrop="handleBoardDrop(event)">
                        Arrastra tus órganos aquí
                    </div>
                `;
            } else {
                organsHTML = p.board.map((slot, idx) => {
                    const card = slot.organ;
                    let cardColor = card.color;
                    if (cardColor === 'orange') cardColor = 'halloween';
                    const cardClass = `card-${cardColor}`;
                    
                    let tokensHtml = '';
                    slot.viruses.forEach(v => {
                        tokensHtml += `<div class="token token-virus" title="${v.name}"><svg viewBox="0 0 24 24"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/><circle cx="12" cy="12" r="5"/><path d="M12 9a3 3 0 0 0-3 3"/></svg></div>`;
                    });
                    slot.medicines.forEach(m => {
                        tokensHtml += `<div class="token token-medicine" title="${m.name}"><svg viewBox="0 0 24 24"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg></div>`;
                    });

                    const isImmunized = slot.medicines.length >= 2;
                    const isVaccinated = slot.medicines.length === 1 && slot.viruses.length === 0;
                    const isInfected = slot.viruses.length > 0;

                    let stateClass = '';
                    if (isImmunized) stateClass = 'immunized';
                    else if (isVaccinated) stateClass = 'vaccinated';
                    else if (isInfected) stateClass = 'infected';

                    return `
                        <div class="board-organ-container" 
                             ondragover="handleOrganDragOver(event, ${p.index}, ${idx})" 
                             ondragleave="handleOrganDragLeave(event)" 
                             ondrop="handleOrganDrop(event, ${p.index}, ${idx})">
                            <div class="card-item ${cardClass} card-type-${card.type} ${stateClass}">
                                <div class="card-header"><span class="card-name">${card.name}</span></div>
                                <div class="card-icon">${card.icon}</div>
                                <div class="attachments-layer">${tokensHtml}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            const badgeHTML = playerBadge ? `<span style="color:${playerBadge.color}; font-size:0.7rem; margin-left:5px; border:1px solid ${playerBadge.color}; padding:0px 4px; border-radius:4px; font-weight:800; text-transform:none;">${playerBadge.short}</span>` : '';

            gridHTML += `
                <div class="player-board-panel glass-panel ${isTurn ? 'active-turn' : ''}" style="${gridStyle}" ondragover="handleBoardDragOver(event)" ondragleave="handleBoardDragLeave(event)" ondrop="handleBoardDrop(event)">
                    <div class="rival-name">TÚ (${p.name.replace(/.* /,'')})${badgeHTML} ${extraPlaysText} ${quarantineText} ${gloveText} ${trickText}</div>
                    <div class="organ-cards-row">${organsHTML}</div>
                </div>
            `;
        } else {
            const organIcons = p.board.map((slot, idx) => {
                const card = slot.organ;
                let cardColor = card.color;
                if (cardColor === 'orange') cardColor = 'halloween';
                const cardClass = `card-${cardColor}`;
                
                let tokensHtml = '';
                slot.viruses.forEach(v => {
                    tokensHtml += `<div class="token token-virus"><svg viewBox="0 0 24 24"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/><circle cx="12" cy="12" r="5"/><path d="M12 9a3 3 0 0 0-3 3"/></svg></div>`;
                });
                slot.medicines.forEach(m => {
                    tokensHtml += `<div class="token token-medicine"><svg viewBox="0 0 24 24"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg></div>`;
                });

                const isImmunized = slot.medicines.length >= 2;
                const isVaccinated = slot.medicines.length === 1 && slot.viruses.length === 0;
                const isInfected = slot.viruses.length > 0;

                let stateClass = '';
                if (isImmunized) stateClass = 'immunized';
                else if (isVaccinated) stateClass = 'vaccinated';
                else if (isInfected) stateClass = 'infected';

                return `
                    <div class="organ-slot" 
                         ondragover="handleOrganDragOver(event, ${p.index}, ${idx})" 
                         ondragleave="handleOrganDragLeave(event)" 
                         ondrop="handleOrganDrop(event, ${p.index}, ${idx})">
                        <div class="card-item ${cardClass} card-type-${card.type} ${stateClass}">
                            <div class="card-header"><span class="card-name">${card.name}</span></div>
                            <div class="card-icon">${card.icon}</div>
                            <div class="attachments-layer">${tokensHtml}</div>
                        </div>
                    </div>
                `;
            }).join('');

            const rivalBadge = p.gamesWon ? dbInstance.getVictoryBadge(p.gamesWon) : null;
            const rivalBadgeHTML = rivalBadge ? `<span style="color:${rivalBadge.color}; font-size:0.7rem; margin-left:5px; border:1px solid ${rivalBadge.color}; padding:0px 4px; border-radius:4px; font-weight:800; text-transform:none;">${rivalBadge.short}</span>` : '';

            let verticalOrigin = 'top';
            if (pos.r >= 3) {
                verticalOrigin = 'bottom';
            } else if (pos.r === 1) {
                verticalOrigin = 'top';
            } else {
                verticalOrigin = 'center';
            }

            let horizontalOrigin = 'center';
            if (pos.c === 1) {
                horizontalOrigin = 'left';
            } else if (pos.c + (pos.span || 1) - 1 >= (layout.maxCols || 4)) {
                horizontalOrigin = 'right';
            }
            if (pos.span === layout.maxCols) {
                horizontalOrigin = 'center';
            }
            const originStyle = `transform-origin: ${verticalOrigin} ${horizontalOrigin};`;

            gridHTML += `
                <div class="rival-board glass-panel ${isTurn ? 'active-turn' : ''}" style="${gridStyle} ${originStyle}" ondragover="allowDrag(event)" ondrop="handleOrganDrop(event, ${p.index}, null)">
                    <div class="rival-name">${p.name}${rivalBadgeHTML} ${extraPlaysText} ${quarantineText} ${gloveText} ${trickText}</div>
                    <div class="rival-hand-indicator">Cartas: ${p.hand.length}</div>
                    <div class="organ-slots">
                        ${organIcons.length > 0 ? organIcons : '<span style="font-size:0.6rem; color:var(--text-muted)">Vacío</span>'}
                    </div>
                </div>
            `;
        }
    });

    grid.innerHTML = gridHTML;

    // Update pile counters and elements
    document.getElementById('deckCount').textContent = game.deck.length;

    const discardPile = document.getElementById('discardPile');
    if (game.discardPile.length > 0) {
        const lastCard = game.discardPile[game.discardPile.length - 1];
        let discColor = lastCard.color;
        if (discColor === 'orange') discColor = 'halloween';
        const discClass = `card-${discColor}`;
        
        discardPile.innerHTML = `
            <div class="card-item ${discClass} card-type-${lastCard.type}">
                <div class="card-header"><span class="card-name">${lastCard.name}</span></div>
                <div class="card-icon">${lastCard.icon}</div>
            </div>
            <span class="deck-count" id="discardCount" style="background:rgba(239, 68, 68, 0.4)">${game.discardPile.length}</span>
        `;
    } else {
        discardPile.innerHTML = `
            <svg viewBox="0 0 24 24" style="width:24px; height:24px; stroke:currentColor; fill:none; stroke-width:2; margin: 15px auto;"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <span class="deck-count" id="discardCount" style="background:rgba(239, 68, 68, 0.4)">0</span>
        `;
    }

    const quarantinePile = document.getElementById('quarantinePile');
    if (quarantinePile) {
        if (game.quarantineZone && game.quarantineZone.length > 0) {
            const lastQuarantined = game.quarantineZone[game.quarantineZone.length - 1];
            let qColor = lastQuarantined.color;
            if (qColor === 'orange') qColor = 'halloween';
            const qClass = `card-${qColor}`;
            quarantinePile.innerHTML = `
                <div class="card-item ${qClass} card-type-${lastQuarantined.type}">
                    <div class="card-header"><span class="card-name">${lastQuarantined.name}</span></div>
                    <div class="card-icon">${lastQuarantined.icon}</div>
                </div>
                <span class="deck-count" id="quarantineCount" style="background:var(--color-halloween)">${game.quarantineZone.length}</span>
            `;
        } else {
            quarantinePile.innerHTML = `
                <svg viewBox="0 0 24 24" style="width:24px; height:24px; stroke:currentColor; fill:none; stroke-width:2; margin: 15px auto;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
                <span class="deck-count" id="quarantineCount" style="background:var(--color-halloween)">0</span>
            `;
        }
    }

    // Render my hand cards
    const handRow = document.getElementById('playerHandRow');
    const isMyTurn = game.activePlayerIndex === myPlayerIndex;

    handRow.innerHTML = activePlayer.hand.map(card => {
        if (card.type === 'hidden') {
            return `<div class="card-item hidden-hand-card"></div>`;
        }

        let cardColor = card.color;
        if (cardColor === 'orange') cardColor = 'halloween';
        const cardClass = `card-${cardColor}`;
        const clickAction = `toggleCardSelection('${card.id}', this)`;
        
        return `
            <div class="card-item ${cardClass} card-type-${card.type} ${!isMyTurn ? 'disabled' : ''}" 
                 draggable="${isMyTurn}" 
                 ondragstart="handleDragStart(event, '${card.id}')"
                 onclick="${clickAction}">
                <div class="card-header">
                    <span class="card-name">${card.name}</span>
                </div>
                <div class="card-icon">${card.icon}</div>
                <div class="card-desc">${card.desc}</div>
            </div>
        `;
    }).join('');
}

// --- Chat Actions ---
function handleChatEnter(ev) {
    if (ev.key === 'Enter') {
        sendChatMessage();
    }
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    if (multiplayer) {
        multiplayer.sendChat(msg);
    } else {
        addChatToUI("Tú", msg);
        setTimeout(() => {
            const responses = [
                "¡Cuidado con tus virus!",
                "Qué buen movimiento...",
                "¡Oye, no me infectes!",
                "Esa carta especial me dolió.",
                "¡A por el Brazito Biónico!"
            ];
            const botAuthor = game.players[1] ? game.players[1].name : "Bot";
            addChatToUI(botAuthor, responses[Math.floor(Math.random() * responses.length)]);
        }, 1000);
    }

    input.value = '';
}

function exitToLobby() {
    showCustomConfirm("¿Seguro que quieres abandonar la partida?", () => {
        stopBackgroundMusic();
        window.location.href = 'index.html';
    });
}

window.openGameSettings = function() {
    const getSafeVol = (key, fallback) => {
        const val = localStorage.getItem(key);
        if (val === null || val === undefined || val === 'undefined' || val === 'null' || isNaN(parseFloat(val))) {
            return fallback;
        }
        return parseFloat(val);
    };

    document.getElementById('gameSoundVol').value = getSafeVol('bd_vol_sound', 0.5);
    document.getElementById('gameMusicVol').value = getSafeVol('bd_vol_music', 0.3);

    // Handle player management for host in multiplayer
    const kickSection = document.getElementById('kickPlayersSection');
    const kickList = document.getElementById('kickPlayersList');
    if (kickSection && kickList) {
        if (multiplayer && multiplayer.isHost && multiplayer.playersList.length > 1) {
            kickSection.style.display = 'block';
            kickList.innerHTML = multiplayer.playersList
                .filter(p => p.peerId !== multiplayer.myPeerId)
                .map(p => `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 6px 10px; border-radius: 8px; margin-bottom: 4px;">
                        <span style="font-size: 0.8rem; font-weight: 600;">${p.avatar} ${p.nickname}</span>
                        <button class="btn btn-danger" onclick="kickPlayer('${p.peerId}')" style="padding: 4px 8px; font-size: 0.65rem; border-radius: 6px; text-transform: none; font-weight: bold; min-width: auto;">Expulsar</button>
                    </div>
                `).join('');
        } else {
            kickSection.style.display = 'none';
        }
    }

    document.getElementById('gameSettingsModal').style.display = 'flex';
};

window.closeGameSettings = function() {
    document.getElementById('gameSettingsModal').style.display = 'none';
};

window.saveGameConfig = async function() {
    const soundVol = parseFloat(document.getElementById('gameSoundVol').value) || 0.0;
    const musicVol = parseFloat(document.getElementById('gameMusicVol').value) || 0.0;
    
    localStorage.setItem('bd_vol_sound', soundVol);
    localStorage.setItem('bd_vol_music', musicVol);
    
    // Save to user profile via storage
    const profile = await dbInstance.getProfile();
    if (profile) {
        profile.volumeSound = soundVol;
        profile.volumeMusic = musicVol;
        await dbInstance.saveProfile(profile);
    }
    
    if (typeof bgMusicPlayer !== 'undefined' && bgMusicPlayer) {
        bgMusicPlayer.volume = musicVol;
    }
    
    if (musicVol > 0 && !isMusicPlaying) {
        startBackgroundMusic();
    } else if (musicVol == 0) {
        stopBackgroundMusic();
    }
};

window.kickPlayer = function(peerId) {
    if (!multiplayer || !multiplayer.isHost) return;
    
    const player = multiplayer.playersList.find(p => p.peerId === peerId);
    const name = player ? player.nickname : "este jugador";
    
    showCustomConfirm(`¿Seguro que deseas expulsar a ${name} de la partida?`, () => {
        multiplayer.kickPlayer(peerId);
        // Refresh the settings modal list if it is open
        if (document.getElementById('gameSettingsModal').style.display === 'flex') {
            window.openGameSettings();
        }
    });
};
