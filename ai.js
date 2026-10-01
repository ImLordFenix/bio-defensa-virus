// ai.js - Robust & Bulletproof AI Decision Engine for Bio-Defensa Bots

class BioDefensaAI {
    static getDecision(game, botIndex) {
        const bot = game.players[botIndex];
        if (!bot || bot.hand.length === 0) {
            return { type: 'discard', cardIds: [] };
        }

        const difficulty = bot.difficulty || 'normal';

        try {
            if (difficulty === 'easy') {
                return this.getEasyMove(game, botIndex);
            } else if (difficulty === 'hard') {
                return this.getHardMove(game, botIndex);
            } else {
                return this.getNormalMove(game, botIndex);
            }
        } catch (e) {
            console.error("AI error in getDecision:", e);
            return this.getFallbackDiscard(bot);
        }
    }

    static getFallbackDiscard(bot) {
        if (!bot.hand || bot.hand.length === 0) return { type: 'discard', cardIds: [] };
        // Discard 1 to 3 random cards
        const count = Math.min(3, bot.hand.length);
        const cardIds = bot.hand.slice(0, count).map(c => c.id);
        return { type: 'discard', cardIds };
    }

    static getEasyMove(game, botIndex) {
        const bot = game.players[botIndex];
        const validPlays = this.findAllValidPlays(game, botIndex);

        if (validPlays.length > 0 && Math.random() < 0.75) {
            return validPlays[Math.floor(Math.random() * validPlays.length)];
        }

        return this.getFallbackDiscard(bot);
    }

    static getNormalMove(game, botIndex) {
        const bot = game.players[botIndex];
        const hand = bot.hand;

        // 1. Play organs on own board
        const organCards = hand.filter(c => c.type === 'organ');
        for (let card of organCards) {
            const extraParams = {};
            if (card.color === 'orange') extraParams.replacedOrganIndex = this.pickWorstOrganIndex(game, botIndex);
            const val = game.validateMove(botIndex, card.id, botIndex, null, extraParams);
            if (val.valid) {
                return { type: 'play', cardId: card.id, targetPlayerIndex: botIndex, targetOrganIndex: null, extraParams };
            }
        }

        // 2. Cure own organs
        const medicineCards = hand.filter(c => c.type === 'medicine');
        for (let card of medicineCards) {
            for (let i = 0; i < bot.board.length; i++) {
                const val = game.validateMove(botIndex, card.id, botIndex, i);
                if (val.valid && bot.board[i].viruses.length > 0) {
                    return { type: 'play', cardId: card.id, targetPlayerIndex: botIndex, targetOrganIndex: i };
                }
            }
        }

        // 3. Vaccinate own organs
        for (let card of medicineCards) {
            for (let i = 0; i < bot.board.length; i++) {
                const val = game.validateMove(botIndex, card.id, botIndex, i);
                if (val.valid) {
                    return { type: 'play', cardId: card.id, targetPlayerIndex: botIndex, targetOrganIndex: i };
                }
            }
        }

        // 4. Attack enemies with viruses
        const virusCards = hand.filter(c => c.type === 'virus');
        for (let card of virusCards) {
            for (let target of game.players) {
                if (target.index === botIndex) continue;
                for (let i = 0; i < target.board.length; i++) {
                    const val = game.validateMove(botIndex, card.id, target.index, i);
                    if (val.valid) {
                        return { type: 'play', cardId: card.id, targetPlayerIndex: target.index, targetOrganIndex: i };
                    }
                }
            }
        }

        // 5. Try specials
        const specialMove = this.findValidSpecialMove(game, botIndex);
        if (specialMove) return specialMove;

        // 6. Default fallback discard
        return this.getFallbackDiscard(bot);
    }

    static getHardMove(game, botIndex) {
        const bot = game.players[botIndex];
        const hand = bot.hand;

        // Sort opponents by healthy organs count (leaders first)
        const opponents = game.players.filter(p => p.index !== botIndex).sort((a, b) => {
            const aH = a.board.filter(s => game.isOrganHealthy(s)).length;
            const bH = b.board.filter(s => game.isOrganHealthy(s)).length;
            return bH - aH;
        });

        // 1. Play organs on self
        const organCards = hand.filter(c => c.type === 'organ');
        for (let card of organCards) {
            const extraParams = {};
            if (card.color === 'orange') extraParams.replacedOrganIndex = this.pickWorstOrganIndex(game, botIndex);
            const val = game.validateMove(botIndex, card.id, botIndex, null, extraParams);
            if (val.valid) {
                return { type: 'play', cardId: card.id, targetPlayerIndex: botIndex, targetOrganIndex: null, extraParams };
            }
        }

        // 2. Cure own organs
        const medicineCards = hand.filter(c => c.type === 'medicine');
        for (let card of medicineCards) {
            for (let i = 0; i < bot.board.length; i++) {
                const val = game.validateMove(botIndex, card.id, botIndex, i);
                if (val.valid && bot.board[i].viruses.length > 0) {
                    return { type: 'play', cardId: card.id, targetPlayerIndex: botIndex, targetOrganIndex: i };
                }
            }
        }

        // 3. Attack leading opponents with viruses
        const virusCards = hand.filter(c => c.type === 'virus');
        for (let card of virusCards) {
            for (let target of opponents) {
                for (let i = 0; i < target.board.length; i++) {
                    const val = game.validateMove(botIndex, card.id, target.index, i);
                    if (val.valid) {
                        return { type: 'play', cardId: card.id, targetPlayerIndex: target.index, targetOrganIndex: i };
                    }
                }
            }
        }

        // 4. Vaccinate self
        for (let card of medicineCards) {
            for (let i = 0; i < bot.board.length; i++) {
                const val = game.validateMove(botIndex, card.id, botIndex, i);
                if (val.valid) {
                    return { type: 'play', cardId: card.id, targetPlayerIndex: botIndex, targetOrganIndex: i };
                }
            }
        }

        // 5. Play smart specials
        const specialMove = this.findValidSpecialMove(game, botIndex);
        if (specialMove) return specialMove;

        // 6. Fallback discard
        return this.getFallbackDiscard(bot);
    }

    static findValidSpecialMove(game, botIndex) {
        const bot = game.players[botIndex];
        const specialCards = bot.hand.filter(c => c.type === 'special');

        for (let card of specialCards) {
            const act = card.action;
            const ep = {};

            if (act === 'failed_experiment') ep.experimentChoice = 'medicine';
            if (act === 'body_swap') ep.direction = 'clockwise';
            if (act === 'transplant') ep.myOrganIndex = 0;

            if (act === 'transplant' || act === 'steal_organ' || act === 'steal_color' || act === 'alien_transplant') {
                for (let target of game.players) {
                    if (target.index === botIndex && act !== 'alien_transplant') continue;
                    for (let organIndex = 0; organIndex < target.board.length; organIndex++) {
                        if (act === 'transplant') {
                            for (let myIdx = 0; myIdx < bot.board.length; myIdx++) {
                                ep.myOrganIndex = myIdx;
                                const val = game.validateMove(botIndex, card.id, target.index, organIndex, ep);
                                if (val.valid) return { type: 'play', cardId: card.id, targetPlayerIndex: target.index, targetOrganIndex: organIndex, extraParams: ep };
                            }
                        } else {
                            const val = game.validateMove(botIndex, card.id, target.index, organIndex, ep);
                            if (val.valid) return { type: 'play', cardId: card.id, targetPlayerIndex: target.index, targetOrganIndex: organIndex, extraParams: ep };
                        }
                    }
                }
            } else {
                for (let target of game.players) {
                    const val = game.validateMove(botIndex, card.id, target.index, null, ep);
                    if (val.valid) {
                        return { type: 'play', cardId: card.id, targetPlayerIndex: target.index, targetOrganIndex: null, extraParams: ep };
                    }
                }
            }
        }
        return null;
    }

    static findAllValidPlays(game, botIndex) {
        const bot = game.players[botIndex];
        const validPlays = [];

        bot.hand.forEach(card => {
            game.players.forEach(targetPlayer => {
                const ep = {};
                if (card.color === 'orange') ep.replacedOrganIndex = this.pickWorstOrganIndex(game, botIndex);
                if (card.action === 'failed_experiment') ep.experimentChoice = 'medicine';
                if (card.action === 'body_swap') ep.direction = 'clockwise';
                if (card.action === 'transplant') ep.myOrganIndex = 0;

                let val = game.validateMove(botIndex, card.id, targetPlayer.index, null, ep);
                if (val.valid) {
                    validPlays.push({ type: 'play', cardId: card.id, targetPlayerIndex: targetPlayer.index, targetOrganIndex: null, extraParams: ep });
                }

                for (let organIndex = 0; organIndex < targetPlayer.board.length; organIndex++) {
                    val = game.validateMove(botIndex, card.id, targetPlayer.index, organIndex, ep);
                    if (val.valid) {
                        validPlays.push({ type: 'play', cardId: card.id, targetPlayerIndex: targetPlayer.index, targetOrganIndex: organIndex, extraParams: ep });
                    }
                }
            });
        });

        return validPlays;
    }

    static pickWorstOrganIndex(game, botIndex) {
        const bot = game.players[botIndex];
        if (!bot || bot.board.length === 0) return 0;

        let worstIdx = 0;
        let worstScore = -Infinity;

        bot.board.forEach((slot, idx) => {
            let score = slot.viruses.length * 10 - slot.medicines.length * 5;
            if (slot.medicines.length >= 2) score -= 100;
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
