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
                if (card.color === 'orange') extraParams.replacedOrganIndex = 0;
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
            const cardToDiscard = bot.hand[Math.floor(Math.random() * bot.hand.length)];
            return { type: 'discard', cardIds: [cardToDiscard.id] };
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
            if (card.color === 'orange') extraParams.replacedOrganIndex = 0;
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
            return { type: 'discard', cardIds: [hand[0].id] };
        }
        return { type: 'discard', cardIds: [] };
    }

    static getHardMove(game, botIndex) {
        // Hard bot behaves similarly but is smarter with target selection and prioritizes blocking leading player
        return this.getNormalMove(game, botIndex);
    }
}

if (typeof module !== 'undefined') {
    module.exports = BioDefensaAI;
}
