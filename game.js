// game.js - Pure logical game engine for Bio-Defensa (Virus!)

class VirusGame {
    constructor(config = {}) {
        this.numPlayers = config.numPlayers || 3;
        this.mode = config.mode || 'normal'; // 'normal' (4 colors), 'epic' (5 colors), 'supreme' (6 colors)
        this.includeEvolution = config.includeEvolution !== false;
        this.includeHalloween = config.includeHalloween !== false;
        this.players = [];
        this.deck = [];
        this.discardPile = [];
        this.quarantineZone = []; // Evolution quarantine list
        this.activePlayerIndex = 0;
        this.turnTimer = null;
        this.timeLeft = 30;
        this.historyLog = [];
        this.isGameOver = false;
        this.winner = null;
        this.pendingReaction = false;

        // Callback hooks
        this.onStateChange = () => {};
        this.onTurnTimerTick = () => {};
        this.onTurnChange = () => {};
        this.onGameStart = () => {};
        this.onGameOver = () => {};
        this.onLogUpdate = () => {};
        this.onSoundTrigger = () => {};
    }

    log(message, detail = {}) {
        const logObj = {
            time: new Date().toLocaleTimeString(),
            message: message,
            icon: detail.icon || '📝',
            color: detail.color || 'none'
        };
        this.historyLog.push(logObj);
        this.onLogUpdate(logObj);
    }

    setupGame(playerNames = []) {
        this.isGameOver = false;
        this.winner = null;
        this.historyLog = [];
        this.discardPile = [];
        this.quarantineZone = [];
        this.statsTrack = { virusDestroyed: 0, organsInfected: 0, medicinesApplied: 0 };

        this.handSize = 3;
        this.deck = generateDeck(this.numPlayers, this.includeEvolution, this.includeHalloween);
        this.log(`Mazo inicializado con ${this.deck.length} cartas.`, { icon: '🎴' });

        this.players = [];
        for (let i = 0; i < this.numPlayers; i++) {
            const isBot = i > 0;
            const name = playerNames[i] || (isBot ? `Bot ${i}` : "Jugador 1");
            const difficulty = isBot ? ['easy', 'normal', 'hard'][(i - 1) % 3] : 'human';
            
            this.players.push({
                index: i,
                name: name,
                avatar: isBot ? '🤖' : '👨‍⚕️',
                isBot: isBot,
                difficulty: difficulty,
                hand: [],
                board: [],
                quarantined: false,
                gloveActive: false, // Latex glove effect active
                trickOrTreatActive: false // Halloween curse
            });
        }

        // Deal cards
        for (let round = 0; round < this.handSize; round++) {
            for (let i = 0; i < this.numPlayers; i++) {
                if (this.deck.length > 0) {
                    this.players[i].hand.push(this.deck.pop());
                }
            }
        }

        this.activePlayerIndex = 0;
        this.timeLeft = 30;
        this.startTimer();
        this.log("¡La partida ha comenzado! Turno de " + this.players[this.activePlayerIndex].name, { icon: '🚀' });
        
        this.onGameStart();
        this.onStateChange();
    }

    startTimer() {
        if (this.turnTimer) clearInterval(this.turnTimer);
        this.timeLeft = 30;
        this.onTurnTimerTick(this.timeLeft);

        this.turnTimer = setInterval(() => {
            if (this.isGameOver) {
                clearInterval(this.turnTimer);
                return;
            }
            if (this.pendingReaction) {
                return; // Pause timer during reactions
            }
            this.timeLeft--;
            this.onTurnTimerTick(this.timeLeft);

            if (this.timeLeft <= 0) {
                this.log(`¡Tiempo agotado para ${this.players[this.activePlayerIndex].name}!`, { icon: '⏰' });
                this.autoDiscardAndEndTurn();
            }
        }, 1000);
    }

    autoDiscardAndEndTurn() {
        const activePlayer = this.players[this.activePlayerIndex];
        if (activePlayer.hand.length > 0) {
            const randomIndex = Math.floor(Math.random() * activePlayer.hand.length);
            const card = activePlayer.hand[randomIndex];
            this.discardCards(this.activePlayerIndex, [card.id]);
        } else {
            this.refillHand(activePlayer);
            this.endTurn();
        }
    }

    // --- Rules Checks ---
    validateMove(playerIndex, cardId, targetPlayerIndex, targetOrganIndex = null, extraParams = {}) {
        if (this.isGameOver) return { valid: false, reason: "La partida ha terminado." };
        if (playerIndex !== this.activePlayerIndex) return { valid: false, reason: "No es tu turno." };

        const player = this.players[playerIndex];
        const card = player.hand.find(c => c.id === cardId);
        if (!card) return { valid: false, reason: "Carta no encontrada en tu mano." };

        const targetPlayer = this.players[targetPlayerIndex];
        if (!targetPlayer) return { valid: false, reason: "Objetivo no válido." };

        // --- ORGANS ---
        if (card.type === 'organ') {
            if (targetPlayerIndex !== playerIndex) {
                return { valid: false, reason: "Solo puedes colocar órganos en tu propio cuerpo." };
            }
            
            // If it is Organ Mutante (orange), it needs an organ to replace, or you play it to replace one.
            if (card.color === 'orange') {
                if (player.board.length === 0) {
                    return { valid: false, reason: "El Organillo Mutante requiere descartar un organillo existente tuyo." };
                }
                // Require a valid replacedOrganIndex
                if (extraParams.replacedOrganIndex === undefined || extraParams.replacedOrganIndex === null) {
                    return { valid: false, reason: "Debes seleccionar qué órgano reemplazar con el Organillo Mutante." };
                }
                const rIdx = extraParams.replacedOrganIndex;
                if (typeof rIdx !== 'number' || rIdx < 0 || rIdx >= player.board.length) {
                    return { valid: false, reason: "Índice de órgano a reemplazar no válido." };
                }
                return { valid: true };
            }

            // Normal duplicate organ color check
            const duplicate = player.board.some(slot => slot.organ.color === card.color && card.color !== 'multicolor');
            if (duplicate) {
                return { valid: false, reason: `Ya tienes un órgano de color ${card.color}.` };
            }
            return { valid: true };
        }

        // --- VIRUS ---
        if (card.type === 'virus') {
            if (targetPlayerIndex === playerIndex) {
                return { valid: false, reason: "No puedes infectar tus propios órganos." };
            }
            if (targetOrganIndex === null || targetOrganIndex < 0 || targetOrganIndex >= targetPlayer.board.length) {
                return { valid: false, reason: "Selecciona un órgano objetivo." };
            }

            const slot = targetPlayer.board[targetOrganIndex];
            const organ = slot.organ;

            // Bionic check
            if (organ.color === 'bionic') {
                return { valid: false, reason: "El Brazito Biónico es inmune a los virus." };
            }

            if (organ.color === 'orange' && card.color !== 'multicolor') {
                return { valid: false, reason: "El Organillo Mutante solo acepta virus/cartas multicolores." };
            }

            // Color matching
            const colorMatches = card.color === 'multicolor' || organ.color === 'multicolor' || card.color === organ.color;
            if (!colorMatches) {
                return { valid: false, reason: "El color del virus no coincide con el del órgano." };
            }

            // Immunized check (2 medicines)
            if (slot.medicines.length >= 2) {
                return { valid: false, reason: "Este órgano está inmunizado." };
            }

            return { valid: true };
        }

        // --- MEDICINES ---
        if (card.type === 'medicine') {
            // "Truco o Trato" allows playing medicines on other players to cure/vaccinate their organs
            const isTrickOrTreatActive = player.trickOrTreatActive;
            if (targetPlayerIndex !== playerIndex && !isTrickOrTreatActive) {
                return { valid: false, reason: "Solo puedes aplicar medicinas en tus propios órganos." };
            }
            
            if (targetOrganIndex === null || targetOrganIndex < 0 || targetOrganIndex >= targetPlayer.board.length) {
                return { valid: false, reason: "Selecciona un órgano objetivo." };
            }

            const slot = targetPlayer.board[targetOrganIndex];
            const organ = slot.organ;

            if (organ.color === 'bionic') {
                return { valid: false, reason: "El Brazito Biónico no acepta medicinas." };
            }

            if (organ.color === 'orange' && card.color !== 'multicolor') {
                return { valid: false, reason: "El Organillo Mutante solo acepta medicinas multicolores." };
            }

            const colorMatches = card.color === 'multicolor' || organ.color === 'multicolor' || card.color === organ.color;
            if (!colorMatches) {
                return { valid: false, reason: "El color de la medicina no coincide." };
            }

            // Evolved virus check
            const hasEvolvedVirus = slot.viruses.some(v => v.isEvolved);
            if (hasEvolvedVirus && !card.isExperimental) {
                return { valid: false, reason: "El virus evolucionado requiere Medicina Experimental." };
            }

            if (slot.medicines.length >= 2) {
                return { valid: false, reason: "El órgano ya está inmunizado." };
            }

            return { valid: true };
        }

        // --- TREATMENTS / SPECIALS ---
        if (card.type === 'special') {
            const act = card.action;

            if (act === "transplant") {
                if (targetPlayerIndex === playerIndex) return { valid: false, reason: "Elige un oponente." };
                if (targetOrganIndex === null || targetOrganIndex < 0 || targetOrganIndex >= targetPlayer.board.length) return { valid: false, reason: "Selecciona un órgano del oponente." };
                const enemySlot = targetPlayer.board[targetOrganIndex];
                if (enemySlot.medicines.length >= 2) return { valid: false, reason: "No se pueden trasplantar órganos inmunizados." };
                
                const myIdx = extraParams.myOrganIndex;
                if (myIdx !== undefined) {
                    const mySlot = player.board[myIdx];
                    // Verify if player receives enemy's organ, they don't have duplicate
                    const duplicateForMe = player.board.some((s, i) => i !== myIdx && s.organ.color === enemySlot.organ.color && enemySlot.organ.color !== 'multicolor');
                    if (duplicateForMe) return { valid: false, reason: `Ya tienes un órgano de color ${enemySlot.organ.color}.` };
                    
                    // Verify if enemy receives player's organ, they don't have duplicate
                    const duplicateForEnemy = targetPlayer.board.some((s, i) => i !== targetOrganIndex && s.organ.color === mySlot.organ.color && mySlot.organ.color !== 'multicolor');
                    if (duplicateForEnemy) return { valid: false, reason: `El jugador ${targetPlayer.name} ya tiene un órgano de color ${mySlot.organ.color}.` };
                }
                
                return { valid: true };
            }
            if (act === "steal_organ") {
                if (targetPlayerIndex === playerIndex) return { valid: false, reason: "Elige un oponente." };
                if (targetOrganIndex === null || targetOrganIndex < 0 || targetOrganIndex >= targetPlayer.board.length) return { valid: false, reason: "Selecciona un órgano del oponente." };
                const slot = targetPlayer.board[targetOrganIndex];
                if (slot.medicines.length >= 2) return { valid: false, reason: "No puedes robar órganos inmunizados." };
                
                // Duplicate organ color check
                const color = slot.organ.color;
                const duplicate = player.board.some(s => s.organ.color === color && color !== 'multicolor');
                if (duplicate) return { valid: false, reason: `Ya tienes un órgano de color ${color}.` };
                
                return { valid: true };
            }
            if (act === "contagion" || act === "latex_glove" || act === "body_swap" || act === "extra_time") {
                return { valid: true };
            }
            if (act === "medical_error" || act === "second_opinion" || act === "apparition") {
                if (act === "medical_error" && targetPlayerIndex === playerIndex) return { valid: false, reason: "Elige otro jugador." };
                if (act === "second_opinion" && targetPlayerIndex === playerIndex) return { valid: false, reason: "Elige otro jugador." };
                return { valid: true };
            }
            if (act === "quarantine") {
                // Must select a virus on board to quarantine
                return { valid: true };
            }
            if (act === "steal_color") {
                if (targetPlayerIndex === playerIndex) return { valid: false, reason: "Elige un oponente." };
                if (targetOrganIndex === null || targetOrganIndex < 0 || targetOrganIndex >= targetPlayer.board.length) return { valid: false, reason: "Selecciona un órgano." };
                const slot = targetPlayer.board[targetOrganIndex];
                if (slot.organ.color !== card.color) return { valid: false, reason: `Solo puedes robar un órgano de color ${card.color}.` };
                
                // Duplicate color check
                const duplicate = player.board.some(s => s.organ.color === card.color);
                if (duplicate) return { valid: false, reason: `Ya tienes un órgano de color ${card.color}.` };
                return { valid: true };
            }
            if (act === "alien_transplant") {
                if (targetPlayerIndex === undefined || targetOrganIndex === null) return { valid: false, reason: "Elige el primer órgano." };
                
                const p1Idx = extraParams.player1Index;
                const p2Idx = extraParams.player2Index;
                const org1Idx = extraParams.organ1Index;
                const org2Idx = extraParams.organ2Index;

                if (p1Idx !== undefined && p2Idx !== undefined) {
                    const p1 = this.players[p1Idx];
                    const p2 = this.players[p2Idx];
                    const slot1 = p1.board[org1Idx];
                    const slot2 = p2.board[org2Idx];
                    
                    if (!slot1 || !slot2) return { valid: false, reason: "Órgano no válido." };

                    // Verify duplicate colors just like transplant
                    const dup1 = p1.board.some((s, i) => i !== org1Idx && s.organ.color === slot2.organ.color && slot2.organ.color !== 'multicolor');
                    if (dup1) return { valid: false, reason: `El jugador ${p1.name} ya tiene un órgano de color ${slot2.organ.color}.` };

                    const dup2 = p2.board.some((s, i) => i !== org2Idx && s.organ.color === slot1.organ.color && slot1.organ.color !== 'multicolor');
                    if (dup2) return { valid: false, reason: `El jugador ${p2.name} ya tiene un órgano de color ${slot1.organ.color}.` };
                }

                return { valid: true };
            }
            if (act === "failed_experiment") {
                if (targetOrganIndex === null) return { valid: false, reason: "Selecciona un órgano infectado o vacunado." };
                const slot = targetPlayer.board[targetOrganIndex];
                if (slot.medicines.length >= 2) return { valid: false, reason: "Un órgano inmunizado no puede ser afectado por un Experimento Fallido." };
                if (slot.viruses.length === 0 && slot.medicines.length === 0) return { valid: false, reason: "El órgano debe estar infectado o vacunado." };
                return { valid: true };
            }
            if (act === "trick_or_treat") {
                if (targetPlayerIndex === playerIndex) return { valid: false, reason: "Elige un oponente." };
                if (targetPlayer.trickOrTreatActive) return { valid: false, reason: "Este jugador ya tiene la maldición de Truco o Trato." };
                return { valid: true };
            }
        }

        return { valid: false, reason: "Acción no permitida." };
    }

    playCard(playerIndex, cardId, targetPlayerIndex, targetOrganIndex = null, extraParams = {}) {
        if (extraParams.originalTargetPlayerIndex !== undefined && extraParams.originalTargetPlayerIndex !== null) {
            targetPlayerIndex = extraParams.originalTargetPlayerIndex;
        }
        
        if (extraParams.skipReactionCheck) {
            this.pendingReaction = false;
        }

        const val = this.validateMove(playerIndex, cardId, targetPlayerIndex, targetOrganIndex, extraParams);
        if (!val.valid) {
            this.onSoundTrigger('error');
            return val;
        }

        const player = this.players[playerIndex];
        const cardIndex = player.hand.findIndex(c => c.id === cardId);
        const card = cardIndex !== -1 ? player.hand[cardIndex] : null;
        
        if (!card) {
            console.error("playCard: Carta no encontrada! cardId:", cardId);
            this.pendingReaction = false;
            return { valid: false, reason: "Error interno: Carta no encontrada." };
        }
        
        const targetPlayer = this.players[targetPlayerIndex];

        // --- REACTION SYSTEM: Traje de Protección ---
        if (!extraParams.skipReactionCheck) {
            let reactingPlayer = null;
            let isAttack = false;

            // 1. Is it a targeted attack?
            if (targetPlayerIndex !== playerIndex && targetPlayer) {
                if (card.type === 'virus' || (card.type === 'special' && ['steal_organ', 'steal_color', 'transplant', 'medical_error', 'trick_or_treat', 'alien_transplant', 'second_opinion', 'failed_experiment', 'quarantine'].includes(card.action))) {
                    isAttack = true;
                    reactingPlayer = targetPlayer;
                }
            }
            // 2. Is it a global attack?
            else if (card.type === 'special' && ['body_swap', 'latex_glove'].includes(card.action)) {
                isAttack = true;
                // Find if any other player has the shield card
                reactingPlayer = this.players.find(p => p.index !== playerIndex && p.hand.some(c => c.type === 'special' && c.action === 'shield'));
            }

            if (isAttack && reactingPlayer) {
                const shieldCard = reactingPlayer.hand.find(c => c.type === 'special' && c.action === 'shield');
                if (shieldCard) {
                    extraParams.reactingPlayerIndex = reactingPlayer.index;
                    extraParams.originalTargetPlayerIndex = targetPlayerIndex;
                    if (reactingPlayer.isBot) {
                        // Bot auto-reacts
                        extraParams.skipReactionCheck = true;
                        extraParams.reactionUsed = true;
                        extraParams.shieldCardId = shieldCard.id;
                    } else {
                        this.pendingReaction = true;
                        if (this.onReactionRequested) {
                            this.onReactionRequested(playerIndex, cardId, reactingPlayer.index, targetOrganIndex, extraParams, shieldCard.id);
                        }
                        return { valid: true, pendingReaction: true };
                    }
                }
            }
        }

        // Check if the attack was blocked by a reaction!
        if (extraParams.reactionUsed) {
            const reactingPlayerIdx = extraParams.reactingPlayerIndex !== undefined ? extraParams.reactingPlayerIndex : targetPlayerIndex;
            const reactingPlayer = this.players[reactingPlayerIdx];

            player.hand.splice(cardIndex, 1);
            this.discardPile.push(card);
            
            const shieldIndex = reactingPlayer.hand.findIndex(c => c.id === extraParams.shieldCardId);
            if (shieldIndex !== -1) {
                const shieldCard = reactingPlayer.hand.splice(shieldIndex, 1)[0];
                this.discardPile.push(shieldCard);
            }
            
            this.log(`¡${reactingPlayer.name} bloqueó el ataque de ${player.name} usando su Traje de Protección!`, { icon: '🛡️', color: 'blue' });
            this.onSoundTrigger('play_card');
            
            this.refillHand(player);
            this.refillHand(reactingPlayer);
            
            if (this.isGameOver) {
                this.onStateChange();
                this.onGameOver(this.winner);
            } else {
                this.endTurn();
            }
            return { valid: true };
        }

        // --- Normal Execution ---
        player.hand.splice(cardIndex, 1);

        // --- Play Resolutions ---
        if (card.type === 'organ') {
            if (card.color === 'orange') {
                const replacedIdx = extraParams.replacedOrganIndex;
                if (replacedIdx === undefined || replacedIdx === null || replacedIdx < 0 || replacedIdx >= player.board.length) {
                    console.error("playCard: replacedOrganIndex inválido para Organillo Mutante:", replacedIdx);
                    return { valid: false, reason: "Índice de órgano a reemplazar no válido." };
                }
                const discardedSlot = player.board.splice(replacedIdx, 1)[0];
                this.discardPile.push(discardedSlot.organ, ...discardedSlot.viruses, ...discardedSlot.medicines);
                this.log(`${player.name} reemplazó su órgano ${discardedSlot.organ.name} por el Organillo Mutante.`, { icon: '🎃', color: 'orange' });
            }

            player.board.push({
                organ: card,
                viruses: [],
                medicines: []
            });
            this.log(`${player.name} jugó el órgano ${card.name}.`, { icon: card.icon, color: card.color });
            this.onSoundTrigger('play_card');
        } 
        else if (card.type === 'virus') {
            const slot = targetPlayer.board[targetOrganIndex];
            
            if (slot.medicines.length > 0) {
                const discMed = slot.medicines.pop();
                this.discardPile.push(discMed, card);
                this.log(`${player.name} usó ${card.name} para neutralizar la medicina de ${targetPlayer.name}.`, { icon: '⚔️', color: card.color });
                this.onSoundTrigger('cure');
            } else {
                slot.viruses.push(card);
                if (player.index === this.activePlayerIndex) this.statsTrack.organsInfected++;
                this.log(`${player.name} infectó el órgano ${slot.organ.name} de ${targetPlayer.name} con ${card.name}.`, { icon: card.icon, color: card.color });
                
                if (slot.viruses.length >= 2) {
                    this.discardPile.push(slot.organ, ...slot.viruses);
                    targetPlayer.board.splice(targetOrganIndex, 1);
                    this.log(`¡El órgano ${slot.organ.name} de ${targetPlayer.name} ha sido destruido!`, { icon: '💀', color: card.color });
                    this.onSoundTrigger('error');
                } else {
                    this.onSoundTrigger('infect');
                }
            }
        } 
        else if (card.type === 'medicine') {
            const slot = targetPlayer.board[targetOrganIndex];

            // If Truco o Trato active and we cure an opponent's organ
            if (player.trickOrTreatActive && targetPlayerIndex !== playerIndex) {
                player.trickOrTreatActive = false;
                targetPlayer.trickOrTreatActive = true;
                this.log(`¡${player.name} se liberó de Truco o Trato curando a ${targetPlayer.name}!`, { icon: '🎃', color: 'orange' });
            }

            if (slot.viruses.length > 0) {
                const discVirus = slot.viruses.pop();
                this.discardPile.push(discVirus, card);
                if (player.index === this.activePlayerIndex) this.statsTrack.virusDestroyed++;
                this.log(`${player.name} curó el virus ${discVirus.name} de ${targetPlayer.name} usando ${card.name}.`, { icon: card.icon, color: card.color });
                this.onSoundTrigger('cure');
            } else {
                if (card.isExperimental && slot.medicines.length === 0) {
                    slot.medicines.push(card);
                    slot.medicines.push({ ...card }); // Clone to avoid reference issues
                    if (player.index === this.activePlayerIndex) this.statsTrack.medicinesApplied += 2;
                    this.log(`${player.name} inmunizó automáticamente el órgano ${slot.organ.name} con ${card.name}.`, { icon: card.icon, color: card.color });
                } else {
                    slot.medicines.push(card);
                    if (player.index === this.activePlayerIndex) this.statsTrack.medicinesApplied++;
                    if (slot.medicines.length >= 2) {
                        this.log(`${player.name} inmunizó el órgano ${slot.organ.name} con ${card.name}.`, { icon: card.icon, color: card.color });
                    } else {
                        this.log(`${player.name} vacunó el órgano ${slot.organ.name} con ${card.name}.`, { icon: card.icon, color: card.color });
                    }
                }
                this.onSoundTrigger('play_card');
            }
        } 
        else if (card.type === 'special') {
            this.resolveSpecial(player, card, targetPlayer, targetOrganIndex, extraParams);
            this.discardPile.push(card);
            this.onSoundTrigger('play_card');
        }

        this.checkVictory();

        // Horas Extra: player plays this card, then gets to play remaining 2 cards
        if (card.type === 'special' && card.action === 'extra_time') {
            this.log(`¡${player.name} activó Horas Extra! Puede jugar sus ${player.hand.length} cartas restantes.`, { icon: '⏰' });
            player.extraPlays = (player.extraPlays || 0) + player.hand.length;
            // Don't refill hand yet — player must play remaining cards first
            if (this.isGameOver) {
                this.onStateChange();
                this.onGameOver(this.winner);
            } else {
                this.startTimer();
                this.onStateChange();
                // Re-trigger turn action so bots can play their extra cards
                this.onTurnChange(this.activePlayerIndex);
            }
        } else if (player.extraPlays && player.extraPlays > 0) {
            // Playing one of the extra plays from Horas Extra
            player.extraPlays--;
            if (player.extraPlays <= 0) {
                // All extra plays used, refill and end turn
                delete player.extraPlays;
                this.refillHand(player);
                if (this.isGameOver) {
                    this.onStateChange();
                    this.onGameOver(this.winner);
                } else {
                    this.endTurn();
                }
            } else {
                // Still has extra plays remaining
                if (this.isGameOver) {
                    this.onStateChange();
                    this.onGameOver(this.winner);
                } else {
                    this.startTimer();
                    this.onStateChange();
                }
            }
        } else {
            this.refillHand(player);
            if (this.isGameOver) {
                this.onStateChange();
                this.onGameOver(this.winner);
            } else {
                this.endTurn();
            }
        }

        return { valid: true };
    }

    resolveSpecial(player, card, targetPlayer, targetOrganIndex, extraParams) {
        const act = card.action;

        if (act === "steal_organ" || act === "steal_color") {
            const slot = targetPlayer.board.splice(targetOrganIndex, 1)[0];
            player.board.push(slot);
            this.log(`¡${player.name} robó el órgano ${slot.organ.name} de ${targetPlayer.name} usando ${card.name}!`, { icon: '🥷', color: card.color });
        } 
        else if (act === "transplant") {
            const myIdx = extraParams.myOrganIndex;
            const enemyIdx = targetOrganIndex;
            if (myIdx !== undefined && enemyIdx !== undefined) {
                const mySlot = player.board[myIdx];
                const enemySlot = targetPlayer.board[enemyIdx];
                player.board[myIdx] = enemySlot;
                targetPlayer.board[enemyIdx] = mySlot;
                this.log(`Trasplante: ${player.name} intercambió ${mySlot.organ.name} por ${enemySlot.organ.name} con ${targetPlayer.name}.`, { icon: '🔄' });
            }
        } 
        else if (act === "alien_transplant") {
            const p1Idx = extraParams.player1Index;
            const p2Idx = extraParams.player2Index;
            const org1Idx = extraParams.organ1Index;
            const org2Idx = extraParams.organ2Index;
            if (p1Idx !== undefined && p2Idx !== undefined && org1Idx !== undefined && org2Idx !== undefined) {
                const p1 = this.players[p1Idx];
                const p2 = this.players[p2Idx];
                const slot1 = p1.board[org1Idx];
                const slot2 = p2.board[org2Idx];
                p1.board[org1Idx] = slot2;
                p2.board[org2Idx] = slot1;
                this.log(`Trasplante Alienígena realizado entre ${p1.name} y ${p2.name}.`, { icon: '👽' });
            }
        }
        else if (act === "contagion") {
            let moved = 0;
            player.board.forEach(slot => {
                while (slot.viruses.length > 0) {
                    const vir = slot.viruses[slot.viruses.length - 1];
                    let found = false;
                    for (let other of this.players) {
                        if (other.index === player.index) continue;
                        for (let otherIdx = 0; otherIdx < other.board.length; otherIdx++) {
                            const otherSlot = other.board[otherIdx];
                            // Skip bionic organs (immune) and immunized organs (2+ medicines)
                            if (otherSlot.organ.color === 'bionic') continue;
                            if (otherSlot.medicines.length >= 2) continue;
                            // Color matching: virus must match organ color
                            const colorMatches = vir.color === 'multicolor' || otherSlot.organ.color === 'multicolor' || vir.color === otherSlot.organ.color;
                            if (!colorMatches) continue;
                            // Can contagiate: organ has medicine (virus neutralizes it), or organ has <2 viruses
                            if (otherSlot.medicines.length > 0) {
                                // Virus neutralizes a medicine
                                const discMed = otherSlot.medicines.pop();
                                this.discardPile.push(discMed, vir);
                                slot.viruses.pop();
                                found = true;
                                moved++;
                                this.log(`Contagio: Virus ${vir.name} neutralizó la medicina de ${other.name}.`, { icon: '☣️' });
                                break;
                            } else if (otherSlot.viruses.length < 2) {
                                // Move virus to the organ
                                slot.viruses.pop();
                                otherSlot.viruses.push(vir);
                                found = true;
                                moved++;
                                this.log(`Contagio: Virus ${vir.name} contagiado a ${other.name}.`, { icon: '☣️' });
                                // Check if organ is now destroyed (2 viruses)
                                if (otherSlot.viruses.length >= 2) {
                                    this.discardPile.push(otherSlot.organ, ...otherSlot.viruses);
                                    other.board.splice(otherIdx, 1);
                                    this.log(`¡El órgano ${otherSlot.organ.name} de ${other.name} ha sido destruido por contagio!`, { icon: '💀' });
                                }
                                break;
                            }
                        }
                        if (found) break;
                    }
                    if (!found) break;
                }
            });
        } 
        else if (act === "latex_glove") {
            this.players.forEach(p => {
                if (p.index !== player.index) {
                    this.discardPile.push(...p.hand);
                    p.hand = [];
                    p.gloveActive = true; 
                    this.log(`Guante de Látex: ${p.name} descartó su mano y perderá su fase de acción.`, { icon: '🧤' });
                }
            });
        } 
        else if (act === "medical_error") {
            const tempBoard = [...player.board];
            player.board = [...targetPlayer.board];
            targetPlayer.board = tempBoard;
            
            const tempTrick = player.trickOrTreatActive;
            player.trickOrTreatActive = targetPlayer.trickOrTreatActive;
            targetPlayer.trickOrTreatActive = tempTrick;

            this.log(`¡Error Médico! ${player.name} intercambió su cuerpo completo con ${targetPlayer.name}.`, { icon: '👨‍⚕️' });
        } 
        else if (act === "second_opinion") {
            const tempHand = [...player.hand];
            player.hand = [...targetPlayer.hand];
            targetPlayer.hand = tempHand;
            this.log(`Segunda Opinión: Manos intercambiadas entre ${player.name} y ${targetPlayer.name}.`, { icon: '📋' });
            this.refillHand(player);
            this.refillHand(targetPlayer);
        }
        else if (act === "quarantine") {
            const vIdx = extraParams.virusIndex || 0;
            const slot = targetPlayer.board[targetOrganIndex];
            if (slot && slot.viruses.length > vIdx) {
                const quarantinedVirus = slot.viruses.splice(vIdx, 1)[0];
                this.quarantineZone.push(quarantinedVirus);
                this.log(`Cuarentena: El virus ${quarantinedVirus.name} de ${targetPlayer.name} fue retirado permanentemente.`, { icon: '🚧' });
            }
        }
        else if (act === "apparition") {
            if (this.discardPile.length > 0) {
                const lastCard = this.discardPile.pop();
                player.hand.push(lastCard);
                this.log(`Aparición: ${player.name} rescató ${lastCard.name} de los descartes.`, { icon: '👻' });
            }
        }
        else if (act === "failed_experiment") {
            const slot = targetPlayer.board[targetOrganIndex];
            const choice = extraParams.experimentChoice; 
            if (choice === 'medicine') {
                // If Truco o Trato active and we cure an opponent's organ
                if (player.trickOrTreatActive && targetPlayerIndex !== playerIndex) {
                    player.trickOrTreatActive = false;
                    targetPlayer.trickOrTreatActive = true;
                    this.log(`¡${player.name} se liberó de Truco o Trato curando a ${targetPlayer.name} con un Experimento Fallido!`, { icon: '🎃', color: 'orange' });
                }


                if (slot.viruses.length > 0) {
                    const disc = slot.viruses.pop();
                    this.discardPile.push(disc);
                    this.log(`Experimento Fallido actuó como medicina curando el virus de ${targetPlayer.name}.`, { icon: '🧪' });
                } else {
                    if (slot.medicines.length < 2) {
                        slot.medicines.push({ name: "Vacuna Fallida", color: "multicolor", type: "medicine", icon: "💊" });
                        this.log(`Experimento Fallido actuó como vacuna en ${targetPlayer.name}.`, { icon: '🧪' });
                    } else {
                        this.log(`El órgano ya está inmunizado, la vacuna no tiene efecto.`, { icon: '🧪' });
                    }
                }
            } else {
                if (slot.medicines.length > 0) {
                    const disc = slot.medicines.pop();
                    this.discardPile.push(disc);
                    this.log(`Experimento Fallido actuó como virus retirando la medicina de ${targetPlayer.name}.`, { icon: '🧪' });
                } else {
                    const destroyed = targetPlayer.board.splice(targetOrganIndex, 1)[0];
                    this.discardPile.push(destroyed.organ, ...destroyed.viruses, ...destroyed.medicines);
                    this.log(`Experimento Fallido extirpó el órgano de ${targetPlayer.name}.`, { icon: '🧪' });
                }
            }
        }
        else if (act === "trick_or_treat") {
            // Only 1 pumpkin token can exist in the game. Remove it from everyone else.
            this.players.forEach(p => {
                p.trickOrTreatActive = false;
            });
            targetPlayer.trickOrTreatActive = true;
            this.log(`¡Truco o Trato! ${targetPlayer.name} no puede ganar hasta curar un órgano ajeno.`, { icon: '🎃' });
        }
        else if (act === "body_swap") {
            const dir = extraParams.direction || 'clockwise';
            const boards = this.players.map(p => [...p.board]);
            const tricks = this.players.map(p => p.trickOrTreatActive);
            if (dir === 'clockwise') {
                for (let i = 0; i < this.numPlayers; i++) {
                    const nextIdx = (i + 1) % this.numPlayers;
                    this.players[nextIdx].board = boards[i];
                    this.players[nextIdx].trickOrTreatActive = tricks[i];
                }
                this.log(`¡Cambio de Cuerpos! Todos pasaron su cuerpo en sentido horario.`, { icon: '🧟' });
            } else {
                for (let i = 0; i < this.numPlayers; i++) {
                    const prevIdx = (i - 1 + this.numPlayers) % this.numPlayers;
                    this.players[prevIdx].board = boards[i];
                    this.players[prevIdx].trickOrTreatActive = tricks[i];
                }
                this.log(`¡Cambio de Cuerpos! Todos pasaron su cuerpo en sentido antihorario.`, { icon: '🧟' });
            }
        }
    }

    discardCards(playerIndex, cardIds) {
        if (playerIndex !== this.activePlayerIndex) return { valid: false, reason: "No es tu turno." };
        const player = this.players[playerIndex];

        let actualDiscardedCount = 0;
        cardIds.forEach(id => {
            const index = player.hand.findIndex(c => c.id === id);
            if (index !== -1) {
                const card = player.hand.splice(index, 1)[0];
                this.discardPile.push(card);
                actualDiscardedCount++;
            }
        });

        this.log(`${player.name} descartó ${actualDiscardedCount} cartas.`, { icon: '🗑️' });
        this.refillHand(player);
        this.endTurn();
        return { valid: true };
    }

    refillHand(player) {
        while (player.hand.length < this.handSize) {
            if (this.deck.length === 0) {
                if (this.discardPile.length === 0) break;
                this.deck = shuffle([...this.discardPile]);
                this.discardPile = [];
                this.log("Mazo vacío. Barajando pila de descartes.", { icon: '🔄' });
            }
            player.hand.push(this.deck.pop());
        }
    }

    endTurn() {
        if (this.isGameOver) return;

        // Clear extra plays for the player whose turn is ending to prevent leaks
        const activePlayer = this.players[this.activePlayerIndex];
        if (activePlayer && activePlayer.extraPlays !== undefined) {
            delete activePlayer.extraPlays;
        }

        this.activePlayerIndex = (this.activePlayerIndex + 1) % this.numPlayers;
        
        const nextPlayer = this.players[this.activePlayerIndex];
        
        if (nextPlayer.quarantined) {
            nextPlayer.quarantined = false;
            this.endTurn();
            return;
        }

        if (nextPlayer.gloveActive) {
            nextPlayer.gloveActive = false;
            this.log(`¡El Guante de Látex fuerza a ${nextPlayer.name} a pasar el turno robando cartas!`, { icon: '🧤' });
            this.refillHand(nextPlayer);
            this.endTurn();
            return;
        }

        // Safety: Ensure next player has cards to play/discard when their turn begins
        if (nextPlayer.hand.length === 0) {
            this.log(`¡${nextPlayer.name} no tenía cartas y roba automáticamente!`, { icon: '🃏' });
            this.refillHand(nextPlayer);
        }

        this.startTimer();
        this.onTurnChange(this.activePlayerIndex);
        this.onStateChange();
    }

    isOrganHealthy(slot) {
        if (slot.organ.color === 'bionic') return true;
        return slot.viruses.length === 0;
    }

    checkVictory() {
        let targetColorsCount = 4;
        if (this.mode === 'epic') targetColorsCount = 5;
        if (this.mode === 'supreme') targetColorsCount = 6;

        for (let player of this.players) {
            if (player.trickOrTreatActive) continue;

            const healthySlots = player.board.filter(slot => this.isOrganHealthy(slot));
            const infectedSlots = player.board.filter(slot => !this.isOrganHealthy(slot));

            // Must have enough healthy organs AND no infected organs on the board
            if (healthySlots.length >= targetColorsCount && infectedSlots.length === 0) {
                this.isGameOver = true;
                this.winner = player;
                break;
            }
        }

        if (this.isGameOver) {
            this.log(`🏆 ¡Victoria Suprema de ${this.winner.name}!`, { icon: '👑' });
            this.onSoundTrigger('win');
        }
    }
}

if (typeof module !== 'undefined') {
    module.exports = VirusGame;
}
