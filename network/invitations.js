// network/invitations.js - Real-time Room Invitations System

class InvitationsManager {
    constructor() {
        this.userId = null;
    }

    init(userId) {
        this.userId = userId || sessionStorage.getItem('bd_peer_id');
        if (typeof firebase !== 'undefined' && firebase.database) {
            this.listenToInvitations();
        }
    }

    listenToInvitations() {
        if (!this.userId) return;
        const ref = firebase.database().ref(`invitations/${this.userId}`);
        ref.on('child_added', snapshot => {
            const inv = snapshot.val();
            if (inv && inv.roomCode) {
                this.showInvitationModal(snapshot.key, inv);
            }
        });
    }

    async sendInvitation(friendId, roomCode) {
        if (!friendId || !roomCode) return;
        const senderName = (window.currentProfile && window.currentProfile.nickname) || 'Un amigo';

        await firebase.database().ref(`invitations/${friendId}`).push({
            senderName,
            roomCode,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }

    showInvitationModal(invId, inv) {
        const old = document.getElementById('invitationOverlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'invitationOverlay';
        overlay.className = 'custom-alert-overlay';
        overlay.style.zIndex = '10000';
        overlay.innerHTML = `
            <div class="custom-alert-modal glass-panel" style="max-width: 420px; border: 2px solid var(--primary);">
                <div style="font-size: 2.5rem; margin-bottom: 10px;">🧬</div>
                <h3 style="color: var(--primary); font-size: 1.3rem; margin-bottom: 8px;">¡INVITACIÓN RECIBIDA!</h3>
                <p style="font-size: 0.95rem; color: var(--text-primary); margin-bottom: 15px;">
                    <strong>${inv.senderName}</strong> te ha invitado a una partida de Bio-Defensa.
                </p>
                <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-glass); border-radius: 8px; padding: 10px; font-weight: 800; font-size: 1.4rem; color: #00F0FF; margin-bottom: 20px; text-align: center;">
                    Sala: ${inv.roomCode}
                </div>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button class="btn btn-secondary" onclick="window.invitationsManager.declineInvitation('${invId}')" style="flex:1;">Rechazar</button>
                    <button class="btn btn-primary" onclick="window.invitationsManager.acceptInvitation('${invId}', '${inv.roomCode}')" style="flex:1;">¡Aceptar!</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    declineInvitation(invId) {
        if (this.userId && invId) {
            firebase.database().ref(`invitations/${this.userId}/${invId}`).remove();
        }
        const el = document.getElementById('invitationOverlay');
        if (el) el.remove();
    }

    acceptInvitation(invId, roomCode) {
        this.declineInvitation(invId);
        window.location.href = `game.html?mode=join&code=${roomCode}`;
    }
}

window.invitationsManager = new InvitationsManager();
