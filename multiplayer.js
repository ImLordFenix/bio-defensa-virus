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
        this.playersList = []; // { peerId, nickname, avatar, isHost }
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
        return Promise.resolve(); // Firebase is synchronous to init
    }

    createRoom() {
        this.isHost = true;
        // Generate a 5 letter code
        this.roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        
        this.playersList = [{
            peerId: this.myPeerId,
            nickname: this.myNickname,
            avatar: this.myAvatar,
            isHost: true
        }];
        
        this.roomRef = database.ref('rooms/' + this.roomId);
        
        // Set initial state
        this.roomRef.set({
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            players: {
                [this.myPeerId]: this.playersList[0]
            }
        });
        
        this.roomRef.onDisconnect().remove(); // Cleanup when host leaves
        
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
            
            // Add self to players
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
        // Listen for players joining/leaving
        this.roomRef.child('players').on('value', snapshot => {
            if (!snapshot.exists()) return;
            const playersMap = snapshot.val();
            this.playersList = Object.values(playersMap);
            this.onPlayerJoined(null); // Just trigger UI update
        });
        
        // Listen for chat
        this.roomRef.child('chat').on('child_added', snapshot => {
            const data = snapshot.val();
            this.onChatMessage(data.nickname, data.message);
        });
        
        // Listen for client actions
        this.roomRef.child('actions').on('child_added', snapshot => {
            const action = snapshot.val();
            this.handleClientAction(action.peerId, action.data);
            // Remove action after processing so it doesn't pile up
            snapshot.ref.remove();
        });
    }

    listenForClientEvents() {
        // Listen for players list updates
        this.roomRef.child('players').on('value', snapshot => {
            if (!snapshot.exists()) {
                // Room closed
                this.onError("El anfitrión ha cerrado la sala.");
                return;
            }
            const playersMap = snapshot.val();
            this.playersList = Object.values(playersMap);
            this.onPlayerJoined(null);
        });
        
        // Listen for chat
        this.roomRef.child('chat').on('child_added', snapshot => {
            const data = snapshot.val();
            this.onChatMessage(data.nickname, data.message);
        });
        
        // Listen for game state updates
        this.roomRef.child('gameState').on('value', snapshot => {
            if (!snapshot.exists()) return;
            const stateData = snapshot.val();
            let parsedState;
            try {
                parsedState = JSON.parse(stateData.json);
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

    startMultiplayerGame(mode, includeEvolution, includeHalloween) {
        if (!this.isHost) return;

        this.game.numPlayers = this.playersList.length;
        this.game.mode = mode;
        this.game.includeEvolution = includeEvolution;
        this.game.includeHalloween = includeHalloween;

        const names = this.playersList.map(p => `${p.avatar} ${p.nickname}`);
        this.game.setupGame(names);

        this.game.onStateChange = () => {
            this.syncAndBroadcast();
        };

        this.syncAndBroadcast();
    }

    syncAndBroadcast() {
        if (!this.isHost || !this.roomRef) return;
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
                const playerListObj = this.playersList[index];
                const peerId = playerListObj ? playerListObj.peerId : null;
                return {
                    name: p.name,
                    peerId: peerId,
                    isBot: p.isBot,
                    botDifficulty: p.botDifficulty,
                    handCount: p.hand.length,
                    hand: p.hand.map(card => ({
                        id: card.id,
                        type: card.type,
                        color: card.color,
                        icon: card.icon,
                        name: card.name
                    })),
                board: p.board.map(org => ({
                    id: org.id,
                    type: org.type,
                    color: org.color,
                    icon: org.icon,
                    name: org.name,
                    viruses: org.viruses.map(c => ({ id: c.id, color: c.color, icon: c.icon })),
                    medicines: org.medicines.map(c => ({ id: c.id, color: c.color, icon: c.icon }))
                }))
            }))
        };

        const stateJson = JSON.stringify(stateObj);
        
        this.roomRef.child('gameState').set({
            json: stateJson,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }

    syncGameState(syncState) {
        if (this.isHost) return;

        this.game.numPlayers = syncState.numPlayers;
        this.game.activePlayerIndex = syncState.activePlayerIndex;
        this.game.isGameOver = syncState.isGameOver;
        
        if (syncState.winnerIndex !== -1) {
            this.game.winner = { name: syncState.players[syncState.winnerIndex].name, index: syncState.winnerIndex };
        } else {
            this.game.winner = null;
        }
        
        this.game.historyLog = syncState.historyLog || [];
        this.game.deck = new Array(syncState.deckCount).fill({ type: 'back' });
        this.game.discardPile = new Array(syncState.discardCount).fill({ type: 'back' });
        this.game.quarantineZone = new Array(syncState.quarantineCount).fill({ type: 'back' });

        this.game.players = syncState.players.map(p => ({
            name: p.name,
            peerId: p.peerId,
            isBot: p.isBot,
            botDifficulty: p.botDifficulty,
            hand: p.hand || new Array(p.handCount).fill({ type: 'back' }),
            board: p.board.map(org => {
                const organObj = { ...org };
                organObj.isDestroyed = () => organObj.viruses && organObj.viruses.length >= 2;
                organObj.isImmunized = () => organObj.medicines && organObj.medicines.length >= 2;
                organObj.isHealthy = () => !organObj.isDestroyed() && (!organObj.viruses || organObj.viruses.length === 0);
                return organObj;
            })
        }));

        this.onGameStateSync(syncState);
        
        if (this.game.isGameOver && this.game.winner && this.game.onGameOver) {
            this.game.onGameOver(this.game.winner);
        }
    }

    getMyPlayerIndex() {
        const idx = this.game.players.findIndex(p => p.peerId === this.myPeerId);
        if (idx !== -1) return idx;
        
        const myName = `${this.myAvatar} ${this.myNickname}`;
        const idxName = this.game.players.findIndex(p => p.name === myName);
        return idxName !== -1 ? idxName : 0;
    }

    broadcastState() {
        if (this.isHost) {
            this.syncAndBroadcast();
        }
    }

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

    handleClientAction(peerId, data) {
        if (!this.isHost) return;

        const playerObj = this.playersList.find(p => p.peerId === peerId);
        if (!playerObj) return;

        const pName = `${playerObj.avatar} ${playerObj.nickname}`;
        const playerIndex = this.game.players.findIndex(p => p.name === pName);

        if (playerIndex === -1) return;

        if (data.type === 'play_card' || data.actionType === 'play_card') {
            const cardObj = this.game.players[playerIndex].hand[data.cardIndex];
            if (!cardObj) return;
            
            const moveData = {
                card: cardObj,
                playerIndex: playerIndex,
                targetPlayerIndex: data.targetPlayerIndex,
                targetOrganIndex: data.targetOrganIndex,
                secondaryTargetPlayerIndex: data.secondaryTargetPlayerIndex,
                secondaryTargetOrganIndex: data.secondaryTargetOrganIndex
            };

            const isValid = this.game.validateMove(moveData);
            if (isValid) {
                this.game.playCard(moveData);
            }
        } 
        else if (data.type === 'discard' || data.actionType === 'discard') {
            const indices = data.indices || [];
            indices.sort((a,b) => b - a);
            indices.forEach(idx => {
                const c = this.game.players[playerIndex].hand.splice(idx, 1)[0];
                if (c) this.game.discardPile.push(c);
            });
            this.game.replenishHand(this.game.players[playerIndex]);
            this.game.endTurn();
        }
    }
}
