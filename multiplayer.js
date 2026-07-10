// multiplayer.js - Firebase Realtime Database Multiplayer Manager

const firebaseConfig = {
  apiKey: "AIzaSyAlbpt1adcn1tDENJGII1VghZ55bKtDY3g",
  authDomain: "bio-defensa-multiplayer-1bf16.firebaseapp.com",
  databaseURL: "https://bio-defensa-multiplayer-1bf16-default-rtdb.firebaseio.com",
  projectId: "bio-defensa-multiplayer-1bf16",
  storageBucket: "bio-defensa-multiplayer-1bf16.firebasestorage.app",
  messagingSenderId: "849629999158",
  appId: "1:849629999158:web:814712fe20ce782d63e897",
  measurementId: "G-62E9F1PF7D"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

class BioDefensaMultiplayer {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.isHost = false;
        this.roomId = null;
        
        let storedPeerId = sessionStorage.getItem('bd_peer_id');
        if (!storedPeerId) {
            storedPeerId = Math.random().toString(36).substring(2, 15);
            sessionStorage.setItem('bd_peer_id', storedPeerId);
        }
        this.myPeerId = storedPeerId;
        
        this.playersList = [];
        this.myNickname = 'Jugador';
        
        // Hooks
        this.onRoomCreated = () => {};
        this.onPlayerJoined = () => {};
        this.onPlayerLeft = () => {};
        this.onChatMessage = () => {};
        this.onGameStateSync = () => {};
        this.onConnected = () => {};
        this.onError = () => {};
        
        this.roomRef = null;
    }

    init(nickname, avatar, gamesWon = 0, isPublic = true) {
        console.log("🔥 INICIALIZANDO MULTIJUGADOR. Conectando a:", firebaseConfig.databaseURL);
        this.myNickname = nickname || 'Anónimo';
        this.myAvatar = avatar || '🕵️';
        this.myGamesWon = gamesWon;
        this.isPublic = isPublic;
        return Promise.resolve();
    }

    createRoom() {
        this.isHost = true;
        this.roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        
        this.playersList = [{
            peerId: this.myPeerId,
            nickname: this.myNickname,
            avatar: this.myAvatar,
            isHost: true,
            gamesWon: this.myGamesWon || 0
        }];
        
        // Show room code immediately (generated locally, no need to wait for Firebase)
        this.onRoomCreated(this.roomId);
        
        this.roomRef = database.ref('rooms/' + this.roomId);
        
        this.roomRef.set({
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            isPublic: this.isPublic,
            hostName: this.myNickname,
            numPlayers: 1,
            players: {
                [this.myPeerId]: this.playersList[0]
            }
        }).then(() => {
            console.log('Room created successfully:', this.roomId);
        }).catch((err) => {
            console.error('Failed to create room in Firebase:', err);
            this.onError('Error al crear la sala. Comprueba tu conexión a internet e inténtalo de nuevo.');
        });
        
        this.roomRef.onDisconnect().remove();
        this.listenForHostEvents();
        
        // Monitor connection state
        this._connectionRef = database.ref('.info/connected');
        this._connectionRef.on('value', (snap) => {
            if (snap.val() === true) {
                console.log('Firebase connected');
            } else {
                console.warn('Firebase disconnected');
            }
        });
        
        return this.roomId;
    }

    joinRoom(targetRoomId) {
        this.isHost = false;
        this.roomId = targetRoomId.toUpperCase();
        
        this.roomRef = database.ref('rooms/' + this.roomId);
        
        // Set a timeout in case Firebase doesn't respond
        const joinTimeout = setTimeout(() => {
            this.onError('No se pudo conectar al servidor. Comprueba tu conexión a internet.');
        }, 10000);
        
        this.roomRef.child('players').once('value').then(snapshot => {
            clearTimeout(joinTimeout);
            
            if (!snapshot.exists()) {
                this.onError("La sala no existe o el anfitrión se ha desconectado.");
                return;
            }
            
            const players = snapshot.val();
            if (Object.keys(players).length >= 12) {
                this.onError("La sala está llena.");
                return;
            }
            
            const myPlayerObj = {
                peerId: this.myPeerId,
                nickname: this.myNickname,
                avatar: this.myAvatar,
                isHost: false,
                gamesWon: this.myGamesWon || 0
            };
            
            this.roomRef.child('players/' + this.myPeerId).set(myPlayerObj).catch(err => {
                console.error('Failed to join room:', err);
                this.onError('Error al unirse a la sala. Inténtalo de nuevo.');
            });
            this.roomRef.child('players/' + this.myPeerId).onDisconnect().remove();
            
            this.listenForClientEvents();
            this.onConnected();
        }).catch(err => {
            clearTimeout(joinTimeout);
            console.error('joinRoom error:', err);
            this.onError('Error al buscar la sala. Comprueba tu conexión a internet.');
        });
    }

    listenForHostEvents() {
        this.roomRef.child('players').on('value', snapshot => {
            if (!snapshot.exists()) return;
            const playersMap = snapshot.val();
            this.playersList = Object.values(playersMap).sort((a, b) => {
                if (a.isHost) return -1;
                if (b.isHost) return 1;
                return a.peerId.localeCompare(b.peerId);
            });
            
            // Reemplazo por bot si el juego está en curso
            if (this.game && this.game.players && this.game.players.length > 0 && !this.game.isGameOver) {
                let stateChanged = false;
                this.game.players.forEach(p => {
                    if (!p.isBot && p.peerId && !playersMap[p.peerId]) {
                        // Jugador desconectado o expulsado
                        p.isBot = true;
                        p.aiLevel = 'Normal';
                        p.name = '🤖 Bot (Reemplazo)';
                        stateChanged = true;
                        if (typeof showCustomAlert === 'function') {
                            showCustomAlert(`Un jugador se ha desconectado. Ahora juega un Bot.`, 'info');
                        }
                    }
                });
                if (stateChanged) {
                    this.syncAndBroadcast();
                }
            }

            this.onPlayerJoined(null);
        });
        
        this.roomRef.child('chat').on('child_added', snapshot => {
            const data = snapshot.val();
            if (data) this.onChatMessage(data.nickname, data.message);
        });
        
        this.roomRef.child('actions').on('child_added', snapshot => {
            const action = snapshot.val();
            if (action) {
                this.handleClientAction(action.peerId, action.data);
            }
            snapshot.ref.remove();
        });

        this.roomRef.child('emotes').on('child_added', snapshot => {
            const data = snapshot.val();
            if (data && typeof renderEmote === 'function') {
                const playerIndex = this.game.players.findIndex(p => p.peerId === data.peerId);
                if (playerIndex !== -1) {
                    renderEmote(playerIndex, data.emoji);
                }
            }
            snapshot.ref.remove();
        });

        this.roomRef.child('reaction_responses').on('child_added', snapshot => {
            const resp = snapshot.val();
            if (resp) {
                if (window.hideWaitingForReaction) window.hideWaitingForReaction();
                this.roomRef.child('reactions').remove(); // Host cleans up the reactions node
                
                const data = resp.data;
                const extraParams = data.extraParams || {};
                extraParams.skipReactionCheck = true;
                if (resp.accept) {
                    extraParams.reactionUsed = true;
                    extraParams.shieldCardId = data.shieldCardId;
                }
                
                this.game.playCard(data.attackerIdx, data.cardId, data.targetIdx, data.targetOrganIdx, extraParams);
                this.syncAndBroadcast();
            }
            snapshot.ref.remove();
        });

        this.setupReactionsListener();
    }

    listenForClientEvents() {
        this.roomRef.child('players').on('value', snapshot => {
            if (!snapshot.exists()) {
                this.onError("El anfitrión ha cerrado la sala.");
                return;
            }
            const playersMap = snapshot.val();
            this.playersList = Object.values(playersMap).sort((a, b) => {
                if (a.isHost) return -1;
                if (b.isHost) return 1;
                return a.peerId.localeCompare(b.peerId);
            });
            this.onPlayerJoined(null);
        });
        
        this.roomRef.child('chat').on('child_added', snapshot => {
            const data = snapshot.val();
            if (data) this.onChatMessage(data.nickname, data.message);
        });

        this.roomRef.child('emotes').on('child_added', snapshot => {
            const data = snapshot.val();
            if (data && typeof renderEmote === 'function') {
                const playerIndex = this.game.players.findIndex(p => p.peerId === data.peerId);
                if (playerIndex !== -1) {
                    renderEmote(playerIndex, data.emoji);
                }
            }
        });
        
        this.roomRef.child('gameState').on('value', snapshot => {
            if (!snapshot.exists()) return;
            const stateData = snapshot.val();
            try {
                const parsedState = JSON.parse(stateData.json);
                this.syncGameState(parsedState);
            } catch (e) {
                console.error("Error parsing sync state", e);
            }
        });

        // Guest listens for kick notifications
        this.roomRef.child('kicked_players/' + this.myPeerId).on('value', snapshot => {
            if (snapshot.exists() && snapshot.val() === true) {
                this.roomRef.child('kicked_players/' + this.myPeerId).off();
                this.onError("Has sido expulsado de la partida por el anfitrión.");
            }
        });

        this.setupReactionsListener();
    }

    setupReactionsListener() {
        this.roomRef.child('reactions').on('value', snapshot => {
            if (!snapshot.exists()) {
                if (window.hideWaitingForReaction) window.hideWaitingForReaction();
                this.game.pendingReaction = false;
                return;
            }
            const req = snapshot.val();
            if (req) {
                this.game.pendingReaction = true;
                if (req.targetPeerId === this.myPeerId) {
                    if (window.showReactionModal) {
                        window.showReactionModal(req.data.attackerIdx, req.data.cardId, req.data.targetIdx, req.data.targetOrganIdx, req.data.extraParams, req.data.shieldCardId);
                    }
                } else {
                    const attackerIndex = req.data.attackerIdx;
                    const myIdx = this.getMyPlayerIndex();
                    if (attackerIndex === myIdx) {
                        const targetPlayer = this.game.players[req.data.targetIdx];
                        const targetPlayerName = targetPlayer ? targetPlayer.name : "el oponente";
                        if (window.showWaitingForReaction) {
                            window.showWaitingForReaction(targetPlayerName);
                        }
                    }
                }
            }
        });
    }

    sendChat(message) {
        if (!this.roomRef) return;
        this.roomRef.child('chat').push({
            nickname: this.myNickname,
            message: message,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }

    // =========================================================================
    // HOST: Start a multiplayer game
    // =========================================================================
    startMultiplayerGame(mode, includeEvolution, includeHalloween) {
        if (!this.isHost) return;

        // Clear any residual reactions in database on start/restart
        if (this.roomRef) {
            this.roomRef.child('reactions').remove();
            this.roomRef.child('reaction_responses').remove();
        }

        this.game.numPlayers = this.playersList.length;
        this.game.mode = mode;
        this.game.includeEvolution = includeEvolution;
        this.game.includeHalloween = includeHalloween;

        const names = this.playersList.map(p => `${p.avatar} ${p.nickname}`);
        this.game.setupGame(names);
        
        // CRITICAL: Mark all players as human so game.js doesn't auto-play for them
        this.game.players.forEach((p, i) => {
            p.isBot = false;
            p.peerId = this.playersList[i] ? this.playersList[i].peerId : null;
            p.gamesWon = this.playersList[i] ? (this.playersList[i].gamesWon || 0) : 0;
        });

        // Register reaction requested handler for host to push to Firebase
        this.game.onReactionRequested = (attackerIdx, cardId, targetIdx, targetOrganIdx, extraParams, shieldCardId) => {
            const targetPlayer = this.game.players[targetIdx];
            if (targetPlayer && this.roomRef) {
                this.roomRef.child('reactions').set({
                    targetPeerId: targetPlayer.peerId,
                    data: { attackerIdx, cardId, targetIdx, targetOrganIdx, extraParams, shieldCardId }
                });
            }
        };

        // IMPORTANT: Chain the original onStateChange (which renders the board)
        // instead of replacing it, so the host's UI keeps updating
        const originalOnStateChange = this.game.onStateChange;
        this.game.onStateChange = () => {
            if (typeof originalOnStateChange === 'function') {
                originalOnStateChange();
            }
            this.syncAndBroadcast();
        };

        // Also chain onTurnChange so host gets proper turn UI updates
        const originalOnTurnChange = this.game.onTurnChange;
        this.game.onTurnChange = (idx) => {
            if (typeof originalOnTurnChange === 'function') {
                originalOnTurnChange(idx);
            }
        };

        this.syncAndBroadcast();
    }

    // =========================================================================
    // HOST: Serialize full game state and push to Firebase
    // =========================================================================
    _serializeCard(card) {
        if (!card) return null;
        return {
            id: card.id || null,
            type: card.type || 'unknown',
            color: card.color || 'none',
            icon: card.icon || '',
            name: card.name || '',
            desc: card.desc || '',
            action: card.action || null
        };
    }

    _serializeSlot(slot) {
        if (!slot || !slot.organ) return null;
        return {
            organ: this._serializeCard(slot.organ),
            viruses: (slot.viruses || []).map(v => this._serializeCard(v)),
            medicines: (slot.medicines || []).map(m => this._serializeCard(m))
        };
    }

    syncAndBroadcast() {
        if (!this.isHost || !this.roomRef) return;

        try {
            const stateObj = {
                numPlayers: this.game.numPlayers,
                activePlayerIndex: this.game.activePlayerIndex,
                isGameOver: this.game.isGameOver,
                winnerIndex: this.game.winner ? this.game.winner.index : -1,
                historyLog: this.game.historyLog.slice(-5),
                deckCount: this.game.deck.length,
                discardCount: this.game.discardPile.length,
                discardTopCard: this.game.discardPile.length > 0 ? this._serializeCard(this.game.discardPile[this.game.discardPile.length - 1]) : null,
                quarantineCount: this.game.quarantineZone ? this.game.quarantineZone.length : 0,
                quarantineTopCard: (this.game.quarantineZone && this.game.quarantineZone.length > 0) ? this._serializeCard(this.game.quarantineZone[this.game.quarantineZone.length - 1]) : null,
                players: this.game.players.map((p, index) => {
                    return {
                        name: p.name,
                        index: p.index,
                        peerId: p.peerId || null,
                        isBot: false,
                        hand: p.hand.map(c => this._serializeCard(c)),
                        board: p.board.map(slot => this._serializeSlot(slot)).filter(s => s !== null),
                        shieldActive: !!p.shieldActive,
                        quarantined: !!p.quarantined,
                        gloveActive: !!p.gloveActive,
                        trickOrTreatActive: !!p.trickOrTreatActive,
                        gamesWon: p.gamesWon || 0
                    };
                })
            };

            const stateJson = JSON.stringify(stateObj);
            
            this.roomRef.child('gameState').set({
                json: stateJson,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            }).catch(err => {
                console.error('syncAndBroadcast Firebase write error:', err);
            });
        } catch (e) {
            console.error("syncAndBroadcast error:", e);
        }
    }

    // =========================================================================
    // CLIENT: Receive and apply game state from host
    // =========================================================================
    syncGameState(syncState) {
        if (this.isHost) return;

        this.game.numPlayers = syncState.numPlayers;
        this.game.activePlayerIndex = syncState.activePlayerIndex;
        this.game.isGameOver = syncState.isGameOver;
        
        if (syncState.winnerIndex !== -1 && syncState.players[syncState.winnerIndex]) {
            this.game.winner = { 
                name: syncState.players[syncState.winnerIndex].name, 
                index: syncState.winnerIndex 
            };
        } else {
            this.game.winner = null;
        }
        
        this.game.historyLog = syncState.historyLog || [];
        this.game.deck = new Array(syncState.deckCount || 0).fill({ type: 'back' });
        this.game.discardPile = new Array(syncState.discardCount || 0).fill({ type: 'back' });
        if (syncState.discardCount > 0 && syncState.discardTopCard) {
            this.game.discardPile[this.game.discardPile.length - 1] = syncState.discardTopCard;
        }

        this.game.quarantineZone = new Array(syncState.quarantineCount || 0).fill({ type: 'back' });
        if (syncState.quarantineCount > 0 && syncState.quarantineTopCard) {
            this.game.quarantineZone[this.game.quarantineZone.length - 1] = syncState.quarantineTopCard;
        }

        this.game.players = syncState.players.map(p => ({
            name: p.name,
            index: p.index,
            peerId: p.peerId,
            isBot: false,
            gamesWon: p.gamesWon || 0,
            hand: (p.hand || []).map(c => ({
                id: c.id,
                type: c.type || 'unknown',
                color: c.color || 'none',
                icon: c.icon || '',
                name: c.name || '',
                desc: c.desc || '',
                action: c.action || null
            })),
            board: (p.board || []).map(slot => ({
                organ: {
                    id: slot.organ.id,
                    type: slot.organ.type || 'organ',
                    color: slot.organ.color || 'none',
                    icon: slot.organ.icon || '',
                    name: slot.organ.name || ''
                },
                viruses: (slot.viruses || []).map(v => ({
                    id: v.id,
                    type: v.type || 'virus',
                    color: v.color || 'none',
                    icon: v.icon || '',
                    name: v.name || ''
                })),
                medicines: (slot.medicines || []).map(m => ({
                    id: m.id,
                    type: m.type || 'medicine',
                    color: m.color || 'none',
                    icon: m.icon || '',
                    name: m.name || ''
                }))
            })),
            shieldActive: !!p.shieldActive,
            quarantined: !!p.quarantined,
            gloveActive: !!p.gloveActive,
            trickOrTreatActive: !!p.trickOrTreatActive
        }));

        this.onGameStateSync(syncState);
        
        if (this.game.isGameOver && this.game.winner && this.game.onGameOver) {
            this.game.onGameOver(this.game.winner);
        }
    }

    // =========================================================================
    // Get my player index based on peerId
    // =========================================================================
    getMyPlayerIndex() {
        // The host is always player 0
        if (this.isHost) return 0;

        // Try matching by precise unique peerId first
        const idx = this.game.players.findIndex(p => p.peerId === this.myPeerId);
        if (idx !== -1) return idx;
        
        // Fallback: match by name, but ensure we don't accidentally match the host (index 0)
        // if both players left their name as default "Anónimo"
        const myName = `${this.myAvatar} ${this.myNickname}`;
        const idxName = this.game.players.findIndex(p => p.name === myName && p.index !== 0);
        if (idxName !== -1) return idxName;
        
        // Absolute fallback for guests: you must be player 1 (or the first non-host slot)
        return 1;
    }

    broadcastState() {
        if (this.isHost) {
            this.syncAndBroadcast();
        }
    }

    // =========================================================================
    // CLIENT: Send an action to the host via Firebase
    // =========================================================================
    sendAction(actionType, data) {
        if (!this.roomRef) return;
        
        if (actionType === 'emote') {
            this.roomRef.child('emotes').push({
                peerId: this.myPeerId,
                emoji: data.emoji,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            return;
        }

        if (this.isHost) {
            this.handleClientAction(this.myPeerId, { type: actionType, ...data });
        } else {
            this.roomRef.child('actions').push({
                peerId: this.myPeerId,
                data: Object.assign({ type: actionType }, data),
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        }
    }

    sendReactionResponse(accept, data) {
        if (!this.roomRef) return;
        if (this.isHost) {
            if (window.hideWaitingForReaction) window.hideWaitingForReaction();
            this.roomRef.child('reactions').remove();
            const extraParams = data.extraParams || {};
            extraParams.skipReactionCheck = true;
            if (accept) {
                extraParams.reactionUsed = true;
                extraParams.shieldCardId = data.shieldCardId;
            }
            this.game.playCard(data.attackerIdx, data.cardId, data.targetIdx, data.targetOrganIdx, extraParams);
            this.syncAndBroadcast();
        } else {
            this.roomRef.child('reaction_responses').push({
                accept: accept,
                data: data,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        }
    }

    // =========================================================================
    // HOST: Process an action received from a client
    // =========================================================================
    handleClientAction(peerId, data) {
        if (!this.isHost) return;

        // Find which game player this peerId maps to
        const playerIndex = this.game.players.findIndex(p => p.peerId === peerId);
        if (playerIndex === -1) {
            console.warn("handleClientAction: unknown peerId", peerId);
            return;
        }

        if (data.type === 'play') {
            this.game.playCard(
                playerIndex, 
                data.cardId, 
                data.targetPlayerIndex, 
                data.targetOrganIndex, 
                data.extraParams || {}
            );
        } 
        else if (data.type === 'discard') {
            const cardIds = data.cardIds || [];
            if (cardIds.length > 0) {
                this.game.discardCards(playerIndex, cardIds);
            }
        }
    }

    kickPlayer(peerId) {
        if (!this.isHost || !this.roomRef) return;
        
        // Remove from players list
        this.roomRef.child('players/' + peerId).remove();
        
        // Set a kicked flag under kicked_players so they get notified
        this.roomRef.child('kicked_players/' + peerId).set(true);
    }
}
