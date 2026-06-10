// multiplayer.js - WebRTC Peer-to-Peer Manager using PeerJS

class BioDefensaMultiplayer {
    constructor(game) {
        this.game = game;
        this.peer = null;
        this.roomId = null;
        this.connections = []; // For Host: list of client connections. For Client: host connection.
        this.isHost = false;
        this.playersList = []; // { peerId, nickname, avatar }
        
        // Hooks
        this.onRoomCreated = () => {};
        this.onPlayerJoined = () => {};
        this.onPlayerLeft = () => {};
        this.onChatMessage = () => {};
        this.onGameStateSync = () => {};
        this.onConnected = () => {};
        this.onError = () => {};
    }

    init(nickname, avatar) {
        // Initialize PeerJS client using public server
        return new Promise((resolve, reject) => {
            try {
                this.peer = new Peer(undefined, {
                    debug: 1
                });

                this.peer.on('open', (id) => {
                    this.myPeerId = id;
                    this.myNickname = nickname;
                    this.myAvatar = avatar;
                    resolve(id);
                });

                this.peer.on('error', (err) => {
                    console.error("PeerJS error:", err);
                    this.onError(err.message || "Error de conexión WebRTC.");
                    reject(err);
                });

                this.peer.on('connection', (conn) => {
                    if (this.isHost) {
                        this.handleIncomingConnection(conn);
                    } else {
                        // Clients shouldn't receive incoming connections normally, close it
                        conn.close();
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    createRoom() {
        this.isHost = true;
        this.roomId = this.myPeerId;
        this.playersList = [{
            peerId: this.myPeerId,
            nickname: this.myNickname,
            avatar: this.myAvatar,
            isHost: true
        }];
        this.onRoomCreated(this.roomId);
        return this.roomId;
    }

    joinRoom(targetRoomId) {
        this.isHost = false;
        this.roomId = targetRoomId;

        const conn = this.peer.connect(targetRoomId, {
            metadata: {
                nickname: this.myNickname,
                avatar: this.myAvatar
            }
        });

        this.setupClientConnection(conn);
    }

    handleIncomingConnection(conn) {
        const initConn = () => {
            // Check if game already started or full
            if (this.connections.length >= 11) { // 12 players max
                conn.send({ type: 'error', message: 'La sala está llena.' });
                setTimeout(() => conn.close(), 1000);
                return;
            }

            this.connections.push(conn);
            const playerInfo = {
                peerId: conn.peer,
                nickname: conn.metadata ? (conn.metadata.nickname || 'Anónimo') : 'Anónimo',
                avatar: conn.metadata ? (conn.metadata.avatar || '🕵️') : '🕵️',
                isHost: false
            };
            this.playersList.push(playerInfo);

            this.onPlayerJoined(playerInfo);

            // Broadcast updated players list to everyone
            this.broadcast({
                type: 'players_list',
                players: this.playersList
            });

            // If a game is active, we could sync it, but usually multiplayer rooms start together.
            this.setupHostConnection(conn);
        };

        if (conn.open) {
            initConn();
        } else {
            conn.on('open', initConn);
        }
    }

    setupHostConnection(conn) {
        conn.on('data', (data) => {
            if (!data) return;

            switch (data.type) {
                case 'chat':
                    // Relay chat message to all players
                    this.broadcast({
                        type: 'chat',
                        nickname: data.nickname,
                        message: data.message
                    });
                    this.onChatMessage(data.nickname, data.message);
                    break;

                case 'action':
                    // Client executes a game action (playCard or discard)
                    this.handleClientAction(conn.peer, data);
                    break;
            }
        });

        conn.on('close', () => {
            this.removePlayer(conn.peer);
        });

        conn.on('error', () => {
            this.removePlayer(conn.peer);
        });
    }

    setupClientConnection(conn) {
        this.hostConnection = conn;

        const initClientConn = () => {
            this.onConnected();
        };

        if (conn.open) {
            initClientConn();
        } else {
            conn.on('open', initClientConn);
        }

        conn.on('data', (data) => {
            if (!data) return;

            switch (data.type) {
                case 'players_list':
                    this.playersList = data.players;
                    this.onPlayerJoined(null); // Triggers updates on UI list
                    break;

                case 'chat':
                    this.onChatMessage(data.nickname, data.message);
                    break;

                case 'sync':
                    // Synchronize game engine state
                    this.syncGameState(data.gameState);
                    break;

                case 'error':
                    this.onError(data.message);
                    break;
            }
        });

        conn.on('close', () => {
            this.onError("Conexión perdida con el Host.");
        });

        conn.on('error', (err) => {
            this.onError("Error en la conexión con el Host.");
        });
    }

    removePlayer(peerId) {
        const index = this.playersList.findIndex(p => p.peerId === peerId);
        if (index !== -1) {
            const removed = this.playersList.splice(index, 1)[0];
            this.connections = this.connections.filter(c => c.peer !== peerId);
            this.onPlayerLeft(removed);

            this.broadcast({
                type: 'players_list',
                players: this.playersList
            });
        }
    }

    broadcast(data) {
        if (!this.isHost) return;
        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send(data);
            }
        });
    }

    sendToHost(data) {
        if (this.hostConnection && this.hostConnection.open) {
            this.hostConnection.send(data);
        }
    }

    sendChat(message) {
        if (this.isHost) {
            this.broadcast({
                type: 'chat',
                nickname: this.myNickname,
                message: message
            });
            this.onChatMessage(this.myNickname, message);
        } else {
            this.sendToHost({
                type: 'chat',
                nickname: this.myNickname,
                message: message
            });
        }
    }

    // --- Host Authoritative Game Execution ---
    startMultiplayerGame(mode, includeEvolution, includeHalloween) {
        if (!this.isHost) return;

        // Configure local game instance
        this.game.numPlayers = this.playersList.length;
        this.game.mode = mode;
        this.game.includeEvolution = includeEvolution;
        this.game.includeHalloween = includeHalloween;

        const names = this.playersList.map(p => `${p.avatar} ${p.nickname}`);
        this.game.setupGame(names);

        // Bind logic to sync status on every turn/state change
        this.game.onStateChange = () => {
            this.syncAndBroadcast();
        };

        this.syncAndBroadcast();
    }

    syncAndBroadcast() {
        // Prepare state to send
        const state = this.serializeGameState();
        this.broadcast({
            type: 'sync',
            gameState: state
        });
        this.onGameStateSync(state);
    }

    serializeGameState() {
        // Serialize the game state to safely send over WebRTC (exclude timers/callbacks)
        return {
            players: this.game.players.map(p => ({
                index: p.index,
                name: p.name,
                avatar: p.avatar,
                isBot: p.isBot,
                difficulty: p.difficulty,
                handSize: p.hand.length, // Hide hand content for security!
                board: p.board,
                shieldActive: p.shieldActive,
                quarantined: p.quarantined
            })),
            activePlayerIndex: this.game.activePlayerIndex,
            timeLeft: this.game.timeLeft,
            discardPileCount: this.game.discardPile.length,
            deckCount: this.game.deck.length,
            historyLog: this.game.historyLog,
            isGameOver: this.game.isGameOver,
            winnerIndex: this.game.winner ? this.game.winner.index : null,
            // Only send the active client's own hand specifically!
            // Wait, we will broadcast a generic message, but we should make sure that each client gets their own hand!
            // Let's attach all hands mapping, but encrypt or send client hands individually if possible.
            // A simpler way: we broadcast the state, and we can include hands as an array where we only show the cards to the respective player.
            // Yes! We can send the FULL state to everyone, BUT we override the hand array for security!
            // Wait, PeerJS allows sending individual messages.
            // Let's do that!
        };
    }

    // Host sends specific hands individually
    syncIndividualStates() {
        if (!this.isHost) return;

        const baseState = this.serializeGameState();

        // Host local UI needs the host's actual hand (player 0)
        // Set up client messages
        this.connections.forEach(conn => {
            const playerIndex = this.playersList.findIndex(p => p.peerId === conn.peer);
            if (playerIndex !== -1) {
                // Copy base state
                const clientState = JSON.parse(JSON.stringify(baseState));
                // Add the exact hand for this client
                clientState.myHand = this.game.players[playerIndex].hand;
                conn.send({
                    type: 'sync',
                    gameState: clientState
                });
            }
        });

        // Set host's hand locally
        baseState.myHand = this.game.players[0].hand;
        this.onGameStateSync(baseState);
    }

    // Override broadcast to send specific states to protect hands
    broadcastState() {
        if (!this.isHost) return;
        this.syncIndividualStates();
    }

    // Host handles actions from clients
    handleClientAction(peerId, actionData) {
        const playerIndex = this.playersList.findIndex(p => p.peerId === peerId);
        if (playerIndex !== this.game.activePlayerIndex) return; // Not their turn!

        if (actionData.actionType === 'play') {
            this.game.playCard(
                playerIndex,
                actionData.cardId,
                actionData.targetPlayerIndex,
                actionData.targetOrganIndex,
                actionData.extraParams
            );
        } else if (actionData.actionType === 'discard') {
            this.game.discardCards(playerIndex, actionData.cardIds);
        }

        this.broadcastState();
    }

    // Client syncing state
    syncGameState(serverState) {
        this.game.isGameOver = serverState.isGameOver;
        this.game.activePlayerIndex = serverState.activePlayerIndex;
        this.game.timeLeft = serverState.timeLeft;
        this.game.historyLog = serverState.historyLog;
        
        // Sync players
        this.game.players = serverState.players.map((p, idx) => {
            return {
                ...p,
                // If it's this client's player, use the hand sent specifically for them
                hand: (idx === this.getMyPlayerIndex()) ? serverState.myHand : Array(p.handSize).fill({ name: "Desconocida", type: "hidden" })
            };
        });

        if (serverState.winnerIndex !== null) {
            this.game.winner = this.game.players[serverState.winnerIndex];
        }

        this.onGameStateSync(serverState);
    }

    getMyPlayerIndex() {
        return this.playersList.findIndex(p => p.peerId === this.myPeerId);
    }
}
