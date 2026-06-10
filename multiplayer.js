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
            this.playersList = Object.values(playersMap);
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
    }

    listenForClientEvents() {
        this.roomRef.child('players').on('value', snapshot => {
            if (!snapshot.exists()) {
                this.onError("El anfitrión ha cerrado la sala.");
                return;
            }
            const playersMap = snapshot.val();
            this.playersList = Object.values(playersMap);
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

        this.game.onStateChange = () => {
            this.syncAndBroadcast();
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
                quarantineCount: this.game.quarantineZone ? this.game.quarantineZone.length : 0,
                players: this.game.players.map((p, index) => {
                    return {
                        name: p.name,
                        index: p.index,
                        peerId: p.peerId || (this.playersList[index] ? this.playersList[index].peerId : null),
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
        this.game.quarantineZone = new Array(syncState.quarantineCount || 0).fill({ type: 'back' });

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
        // First try matching by peerId
        const idx = this.game.players.findIndex(p => p.peerId === this.myPeerId);
        if (idx !== -1) return idx;
        
        // Fallback: match by name
        const myName = `${this.myAvatar} ${this.myNickname}`;
        const idxName = this.game.players.findIndex(p => p.name === myName);
        return idxName !== -1 ? idxName : 0;
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
                data: { type: actionType, ...data },
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
}
