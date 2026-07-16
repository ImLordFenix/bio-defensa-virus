// ai.js - AI decision engine for Bio-Defensa bots (Virus! rules updated)

class BioDefensaAI {
    static getDecision(game, botIndex) {
        const bot = game.players[botIndex];
        const difficulty = bot.difficulty || 'normal';

        if (difficulty === 'easy') {
            return this.getEasyMove(game, botIndex);
        } else if (difficulty === 'normal') {
            return this.getNormalMove(game, botIndex);
        } else {
            return this.getHardMove(game, botIndex);
        }
    }

    static getEasyMove(game, botIndex) {
        const bot = game.players[botIndex];
        
        // Simple random valid plays
        const validPlays = [];
        bot.hand.forEach(card => {
            game.players.forEach(targetPlayer => {
                const extraParams = {};
                if (card.color === 'orange') extraParams.replacedOrganIndex = BioDefensaAI.pickWorstOrganIndex(game, botIndex);
                if (card.action === 'failed_experiment') extraParams.experimentChoice = 'medicine';
                if (card.action === 'body_swap') extraParams.direction = 'clockwise';
                if (card.action === 'transplant') extraParams.myOrganIndex = 0;

                let val = game.validateMove(botIndex, card.id, targetPlayer.index, null, extraParams);
                if (val.valid) {
                    validPlays.push({ type: 'play', cardId: card.id, targetPlayerIndex: targetPlayer.index, targetOrganIndex: null, extraParams });
                }

                for (let organIndex = 0; organIndex < targetPlayer.board.length; organIndex++) {
                    val = game.validateMove(botIndex, card.id, targetPlayer.index, organIndex, extraParams);
                    if (val.valid) {
                        validPlays.push({ type: 'play', cardId: card.id, targetPlayerIndex: targetPlayer.index, targetOrganIndex: organIndex, extraParams });
                    }
                }
            });
        });

        if (validPlays.length > 0 && Math.random() < 0.8) {
            return validPlays[Math.floor(Math.random() * validPlays.length)];
        }

        if (bot.hand.length > 0) {
            // Discard 1 to 3 cards to cycle hand faster
            const numToDiscard = Math.floor(Math.random() * Math.min(3, bot.hand.length)) + 1;
            const cardsToDiscard = [...bot.hand].sort(() => 0.5 - Math.random()).slice(0, numToDiscard);
            return { type: 'discard', cardIds: cardsToDiscard.map(c => c.id) };
        }
        return { type: 'discard', cardIds: [] };
    }

    static getNormalMove(game, botIndex) {
        const bot = game.players[botIndex];
        const hand = bot.hand;

        // 1. Try playing normal organs
        const organCards = hand.filter(c => c.type === 'organ');
        for (let card of organCards) {
            const extraParams = {};
            if (card.color === 'orange') extraParams.replacedOrganIndex = BioDefensaAI.pickWorstOrganIndex(game, botIndex);
            const val = game.validateMove(botIndex, card.id, botIndex, null, extraParams);
            if (val.valid) {
                return { type: 'play', cardId: card.id, targetPlayerIndex: botIndex, targetOrganIndex: null, extraParams };
            }
        }

        // 2. Cure own body
        const medicineCards = hand.filter(c => c.type === 'medicine');
        for (let card of medicineCards) {
            for (let i = 0; i < bot.board.length; i++) {
                const val = game.validateMove(botIndex, card.id, botIndex, i);
                if (val.valid && bot.board[i].viruses.length > 0) {
                    return { type: 'play', cardId: card.id, targetPlayerIndex: botIndex, targetOrganIndex: i };
                }
            }
        }

        // 3. Vaccinate own body
        for (let card of medicineCards) {
            for (let i = 0; i < bot.board.length; i++) {
                const val = game.validateMove(botIndex, card.id, botIndex, i);
                if (val.valid) {
                    return { type: 'play', cardId: card.id, targetPlayerIndex: botIndex, targetOrganIndex: i };
                }
            }
        }

        // 4. Attack enemies
        const virusCards = hand.filter(c => c.type === 'virus');
        for (let card of virusCards) {
            for (let target of game.players) {
                if (target.index === botIndex || target.shieldActive) continue;
                for (let i = 0; i < target.board.length; i++) {
                    const val = game.validateMove(botIndex, card.id, target.index, i);
                    if (val.valid) {
                        return { type: 'play', cardId: card.id, targetPlayerIndex: target.index, targetOrganIndex: i };
                    }
                }
            }
        }

        // 5. Use simple specials
        const specialCards = hand.filter(c => c.type === 'special');
        for (let card of specialCards) {
            const ep = {};
            if (card.action === 'failed_experiment') ep.experimentChoice = 'medicine';
            if (card.action === 'body_swap') ep.direction = 'clockwise';
            if (card.action === 'transplant') ep.myOrganIndex = 0;

            for (let target of game.players) {
                const val = game.validateMove(botIndex, card.id, target.index, null, ep);
                if (val.valid) {
                    return { type: 'play', cardId: card.id, targetPlayerIndex: target.index, targetOrganIndex: null, extraParams: ep };
                }
            }
        }

        // 6. Default discard
        if (hand.length > 0) {
            // Discard up to 3 useless cards
            const numToDiscard = Math.floor(Math.random() * Math.min(3, hand.length)) + 1;
            const cardsToDiscard = [...hand].sort(() => 0.5 - Math.random()).slice(0, numToDiscard);
            return { type: 'discard', cardIds: cardsToDiscard.map(c => c.id) };
        }
        return { type: 'discard', cardIds: [] };
    }

    static getHardMove(game, botIndex) {
        const bot = game.players[botIndex];
        const hand = bot.hand;

        // Ordenar oponentes por cantidad de órganos sanos (líderes primero)
        const opponents = game.players.filter(p => p.index !== botIndex).sort((a, b) => {
            const aH = a.board.filter(s => game.isOrganHealthy(s)).length;
            const bH = b.board.filter(s => game.isOrganHealthy(s)).length;
            return bH - aH;
        });

        // 1. Jugar órganos (siempre es bueno construir el propio cuerpo)
        const organCards = hand.filter(c => c.type === 'organ');
        for (let card of organCards) {
            const extraParams = {};
            if (card.color === 'orange') extraParams.replacedOrganIndex = BioDefensaAI.pickWorstOrganIndex(game, botIndex);
            const val = game.validateMove(botIndex, card.id, botIndex, null, extraParams);
            if (val.valid) {
                return { type: 'play', cardId: card.id, targetPlayerIndex: botIndex, targetOrganIndex: null, extraParams };
            }
        }

        // 2. Curar propio cuerpo
        const medicineCards = hand.filter(c => c.type === 'medicine');
        for (let card of medicineCards) {
            for (let i = 0; i < bot.board.length; i++) {
                const val = game.validateMove(botIndex, card.id, botIndex, i);
                if (val.valid && bot.board[i].viruses.length > 0) {
                    return { type: 'play', cardId: card.id, targetPlayerIndex: botIndex, targetOrganIndex: i };
                }
            }
        }

        // 3. Especiales inteligentes (Trasplante, Robo) contra los líderes
        const specialCards = hand.filter(c => c.type === 'special');
        for (let card of specialCards) {
            if (card.action === 'transplant') {
                const ep = {};
                for (let target of opponents) {
                    for (let targetOrgIdx = 0; targetOrgIdx < target.board.length; targetOrgIdx++) {
                        for (let myOrgIdx = 0; myOrgIdx < bot.board.length; myOrgIdx++) {
                            ep.myOrganIndex = myOrgIdx;
                            const val = game.validateMove(botIndex, card.id, target.index, targetOrgIdx, ep);
                            if (val.valid) {
                                // Intentar robar un órgano sano/inmunizado y darle uno infectado
                                const myScore = bot.board[myOrgIdx].viruses.length * 10 - bot.board[myOrgIdx].medicines.length * 5;
                                const targetScore = target.board[targetOrgIdx].viruses.length * 10 - target.board[targetOrgIdx].medicines.length * 5;
                                if (myScore >= targetScore) {
                                    return { type: 'play', cardId: card.id, targetPlayerIndex: target.index, targetOrganIndex: targetOrgIdx, extraParams: ep };
                                }
                            }
                        }
                    }
                }
                // Si no hay intercambio ventajoso, intentar cualquiera válido
                for (let target of opponents) {
                    for (let targetOrgIdx = 0; targetOrgIdx < target.board.length; targetOrgIdx++) {
                        for (let myOrgIdx = 0; myOrgIdx < bot.board.length; myOrgIdx++) {
                            ep.myOrganIndex = myOrgIdx;
                            if (game.validateMove(botIndex, card.id, target.index, targetOrgIdx, ep).valid) {
                                return { type: 'play', cardId: card.id, targetPlayerIndex: target.index, targetOrganIndex: targetOrgIdx, extraParams: ep };
                            }
                        }
                    }
                }
            }
            if (card.action === 'steal_organ') {
                for (let target of opponents) {
                    for (let targetOrgIdx = 0; targetOrgIdx < target.board.length; targetOrgIdx++) {
                        const val = game.validateMove(botIndex, card.id, target.index, targetOrgIdx);
                        if (val.valid && game.isOrganHealthy(target.board[targetOrgIdx])) {
                            return { type: 'play', cardId: card.id, targetPlayerIndex: target.index, targetOrganIndex: targetOrgIdx };
                        }
                    }
                }
            }
        }

        // 4. Atacar enemigos (prioridad a los líderes)
        const virusCards = hand.filter(c => c.type === 'virus');
        for (let card of virusCards) {
            for (let target of opponents) {
                if (target.shieldActive) continue;
                for (let i = 0; i < target.board.length; i++) {
                    const val = game.validateMove(botIndex, card.id, target.index, i);
                    if (val.valid) {
                        return { type: 'play', cardId: card.id, targetPlayerIndex: target.index, targetOrganIndex: i };
                    }
                }
            }
        }

        // 5. Vacunar propio cuerpo (como defensa preventiva)
        for (let card of medicineCards) {
            for (let i = 0; i < bot.board.length; i++) {
                const val = game.validateMove(botIndex, card.id, botIndex, i);
                if (val.valid) {
                    return { type: 'play', cardId: card.id, targetPlayerIndex: botIndex, targetOrganIndex: i };
                }
            }
        }

        // 6. Otras cartas especiales
        for (let card of specialCards) {
            const ep = {};
            if (card.action === 'failed_experiment') ep.experimentChoice = 'medicine';
            if (card.action === 'body_swap') ep.direction = 'clockwise';
            
            if (card.action === 'transplant' || card.action === 'steal_organ') continue;

            for (let target of opponents) {
                const val = game.validateMove(botIndex, card.id, target.index, null, ep);
                if (val.valid) {
                    return { type: 'play', cardId: card.id, targetPlayerIndex: target.index, targetOrganIndex: null, extraParams: ep };
                }
            }
        }

        // 7. Descarte estratégico
        if (hand.length > 0) {
            const numToDiscard = Math.floor(Math.random() * Math.min(3, hand.length)) + 1;
            const cardsToDiscard = [...hand].sort(() => 0.5 - Math.random()).slice(0, numToDiscard);
            return { type: 'discard', cardIds: cardsToDiscard.map(c => c.id) };
        }
        return { type: 'discard', cardIds: [] };
    }

    /**
     * Pick the "worst" organ on the bot's board to replace with the Organillo Mutante.
     * Priority: most viruses > least medicines > first non-mutant organ > index 0.
     */
    static pickWorstOrganIndex(game, botIndex) {
        const bot = game.players[botIndex];
        if (!bot || bot.board.length === 0) return 0;

        let worstIdx = 0;
        let worstScore = -Infinity;

        bot.board.forEach((slot, idx) => {
            // Score: higher = worse organ (more viruses, fewer medicines, not immunized)
            let score = slot.viruses.length * 10 - slot.medicines.length * 5;
            // Prefer replacing non-immunized organs
            if (slot.medicines.length >= 2) score -= 100;
            // Prefer replacing non-bionic organs
            if (slot.organ.color === 'bionic') score -= 50;
            if (score > worstScore) {
                worstScore = score;
                worstIdx = idx;
            }
        });

        return worstIdx;
    }
}

if (typeof module !== 'undefined') {
    module.exports = BioDefensaAI;
}
