// multiplayer.js - Firebase Realtime Database Multiplayer Manager

const firebaseConfig = {
  apiKey: "AIzaSyA972O2AlEU64GO_seemV_N6x-c163Q-vE",
  authDomain: "bio-defensa-multiplayer.firebaseapp.com",
  databaseURL: "https://bio-defensa-multiplayer-default-rtdb.firebaseio.com",
  projectId: "bio-defensa-multiplayer",
  storageBucket: "bio-defensa-multiplayer.firebasestorage.app",
  messagingSenderId: "363446108305",
  appId: "1:363446108305:web:99f42b340c8bc05eac7f30",
  measurementId: "G-M7HQSSZY9R"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

class BioDefensaMultiplayer {
    constructor(game) {
        this.game = game;
        this.roomId = null;
        this.isHost = false;
        this.playersList = [];
        this.myPeerId = 'player_' + Math.random().toString(36).substr(2, 9);
        
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

    init(nickname, avatar) {
        this.myNickname = nickname || 'Anónimo';
        this.myAvatar = avatar || '🕵️';
        return Promise.resolve();
    }

    createRoom() {
        this.isHost = true;
        this.roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        
        this.playersList = [{
            peerId: this.myPeerId,
            nickname: this.myNickname,
            avatar: this.myAvatar,
            isHost: true
        }];
        
        this.roomRef = database.ref('rooms/' + this.roomId);
        
        this.roomRef.set({
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            players: {
                [this.myPeerId]: this.playersList[0]
            }
        });
        
        this.roomRef.onDisconnect().remove();
        this.listenForHostEvents();
        this.onRoomCreated(this.roomId);
        return this.roomId;
    }

    joinRoom(targetRoomId) {
        this.isHost = false;
        this.roomId = targetRoomId.toUpperCase();
        
        this.roomRef = database.ref('rooms/' + this.roomId);
        
        this.roomRef.child('players').once('value', snapshot => {
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
                isHost: false
            };
            
            this.roomRef.child('players/' + this.myPeerId).set(myPlayerObj);
            this.roomRef.child('players/' + this.myPeerId).onDisconnect().remove();
            
            this.listenForClientEvents();
            this.onConnected();
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
                return;
            }
            const req = snapshot.val();
            if (req) {
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
                        trickOrTreatActive: !!p.trickOrTreatActive
                    };
                })
            };

            const stateJson = JSON.stringify(stateObj);
            
            this.roomRef.child('gameState').set({
                json: stateJson,
                timestamp: firebase.database.ServerValue.TIMESTAMP
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
        if (this.isHost) {
            this.handleClientAction(this.myPeerId, { type: actionType, ...data });
        } else {
            if (!this.roomRef) return;
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
