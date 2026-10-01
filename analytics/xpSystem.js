// analytics/xpSystem.js - Experience & Leveling Logic

class XPSystem {
    constructor() {
        this.baseXPPerLevel = 1000;
    }

    calculateXPEarned(gameStats = {}) {
        let xp = 50; // Base participation
        if (gameStats.isWinner) xp += 300;
        xp += (gameStats.cardsPlayed || 0) * 10;
        xp += (gameStats.organsImmunized || 0) * 25;
        xp += (gameStats.virusesCured || 0) * 20;
        xp += (gameStats.organsDestroyed || 0) * 15;
        return xp;
    }

    getLevelInfo(totalXP = 0) {
        const level = Math.floor(totalXP / this.baseXPPerLevel) + 1;
        const currentLevelXP = totalXP % this.baseXPPerLevel;
        const nextLevelXP = this.baseXPPerLevel;
        const progressPercent = Math.min(100, Math.round((currentLevelXP / nextLevelXP) * 100));

        return {
            level,
            totalXP,
            currentLevelXP,
            nextLevelXP,
            progressPercent
        };
    }
}

window.xpSystem = new XPSystem();
