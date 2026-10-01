// network/friends.js - Friends & Social Management System

class FriendsManager {
    constructor() {
        this.friendsList = [];
        this.pendingRequests = [];
        this.userId = null;
    }

    init(userId) {
        this.userId = userId || sessionStorage.getItem('bd_peer_id');
        if (typeof firebase !== 'undefined' && firebase.database) {
            this.listenToFriends();
        }
    }

    listenToFriends() {
        if (!this.userId) return;
        const ref = firebase.database().ref(`friends/${this.userId}`);
        ref.on('value', snapshot => {
            if (!snapshot.exists()) {
                this.friendsList = [];
                this.pendingRequests = [];
                return;
            }
            const data = snapshot.val();
            this.friendsList = [];
            this.pendingRequests = [];

            Object.entries(data).forEach(([friendId, item]) => {
                if (item.status === 'ACCEPTED') {
                    this.friendsList.push({ friendId, ...item });
                } else if (item.status === 'PENDING') {
                    this.pendingRequests.push({ friendId, ...item });
                }
            });

            if (window.renderFriendsUI) {
                window.renderFriendsUI(this.friendsList, this.pendingRequests);
            }
        });
    }

    async sendFriendRequest(targetPeerId, targetName) {
        if (!this.userId || !targetPeerId) return { success: false, message: "ID no válido" };
        if (targetPeerId === this.userId) return { success: false, message: "No puedes agregarte a ti mismo" };

        const myName = (window.currentProfile && window.currentProfile.nickname) || 'Investigador';
        
        // Add pending to recipient
        await firebase.database().ref(`friends/${targetPeerId}/${this.userId}`).set({
            nickname: myName,
            status: 'PENDING',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        return { success: true, message: "Solicitud de amistad enviada" };
    }

    async acceptFriendRequest(friendId, friendName) {
        if (!this.userId) return;
        
        const myName = (window.currentProfile && window.currentProfile.nickname) || 'Investigador';

        // Set accepted for me
        await firebase.database().ref(`friends/${this.userId}/${friendId}`).set({
            nickname: friendName,
            status: 'ACCEPTED',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        // Set accepted for recipient
        await firebase.database().ref(`friends/${friendId}/${this.userId}`).set({
            nickname: myName,
            status: 'ACCEPTED',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }

    async rejectFriendRequest(friendId) {
        if (!this.userId) return;
        await firebase.database().ref(`friends/${this.userId}/${friendId}`).remove();
    }

    async removeFriend(friendId) {
        if (!this.userId) return;
        await firebase.database().ref(`friends/${this.userId}/${friendId}`).remove();
        await firebase.database().ref(`friends/${friendId}/${this.userId}`).remove();
    }
}

window.friendsManager = new FriendsManager();
