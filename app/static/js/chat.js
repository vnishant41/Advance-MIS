/**
 * Team Chat — channels, direct messages, file attachments (≤10MB), realtime.
 */
import { api } from './api.js';

const MAX_FILE = 10 * 1024 * 1024;  // 10 MB

function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

export default {
    currentChannel: 'general',
    channels: [],
    pendingAttachment: null,   // { filename, original, size, mime } after upload, before send

    async render() {
        return `
            <div class="chat-layout">
                <div class="chat-sidebar glass-card" style="border-radius: 12px 0 0 12px; border-right: 1px solid var(--border); display:flex; flex-direction:column;">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:700;"><i class="fas fa-comments" style="color:var(--accent);margin-right:6px;"></i> Channels</span>
                    </div>

                    <div style="padding: 8px 12px; border-bottom:1px solid var(--border);">
                        <button class="btn btn-primary btn-sm" id="btn-new-dm" style="width:100%; justify-content:center;">
                            <i class="fas fa-user-plus"></i> New DM
                        </button>
                    </div>

                    <div id="chat-channel-list" style="overflow-y:auto; flex:1;">
                        <div class="empty-state" style="padding:16px;"><i class="fas fa-spinner fa-spin"></i></div>
                    </div>
                </div>
                <div class="chat-main glass-card" style="border-radius: 0 12px 12px 0;">
                    <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); font-weight:600; display:flex; justify-content:space-between; align-items:center;">
                        <span id="chat-channel-title"># general</span>
                        <div style="display:flex; gap:8px;">
                            <input type="text" id="chat-search" placeholder="Search messages..." style="font-size:.8rem; padding:6px 12px; width:200px; border-radius:20px;">
                        </div>
                    </div>
                    <div class="chat-messages" id="chat-messages">
                        <div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading messages...</p></div>
                    </div>

                    <div id="chat-attachment-preview" style="display:none; padding:8px 16px; border-top:1px solid var(--border); background:var(--bg-primary);"></div>

                    <div class="chat-input-bar">
                        <button class="btn-icon" id="chat-attach-btn" title="Attach file (max 10 MB)" style="color:var(--text-secondary);">
                            <i class="fas fa-paperclip"></i>
                        </button>
                        <input type="file" id="chat-file-input" hidden>
                        <input type="text" id="chat-input" placeholder="Type a message..." style="flex:1;">
                        <button class="btn btn-primary btn-sm" id="chat-send-btn"><i class="fas fa-paper-plane"></i></button>
                    </div>
                </div>
            </div>
        `;
    },

    async init() {
        this.currentChannel = 'general';
        this.pendingAttachment = null;
        this.messagesEl = document.getElementById('chat-messages');

        // Add event delegation for message deletion
        this.messagesEl?.addEventListener('click', async (e) => {
            const btn = e.target.closest('.chat-delete-btn');
            if (!btn) return;
            e.stopPropagation();
            const msgId = btn.dataset.msgId;
            if (!msgId) return;
            if (msgId.startsWith('tmp-')) {
                App.showToast('Please wait for the message to be sent', 'warning');
                return;
            }
            if (!confirm('Delete this message?')) return;
            try {
                await api.delete(`/chat/message/${msgId}`);
                const el = btn.closest('.chat-message');
                if (el) {
                    el.style.transition = 'opacity .3s';
                    el.style.opacity = '0';
                    setTimeout(() => el.remove(), 300);
                }
                App.showToast('Message deleted', 'success');
            } catch (err) {
                App.showToast(err.message || 'Failed to delete', 'error');
            }
        });

        try {
            const data = await api.get('/chat/channels');
            this.channels = data.channels || [];
        } catch (e) {
            this.channels = [
                { id: 'general', name: '# General', type: 'public' },
                { id: 'research', name: '# Research', type: 'department' },
            ];
        }
        this.renderChannels();

        document.getElementById('chat-channel-list').addEventListener('click', (e) => {
            const ch = e.target.closest('.chat-channel');
            if (!ch) return;
            this.switchChannel(ch.dataset.channel);
        });

        document.getElementById('btn-new-dm').addEventListener('click', () => this.openNewDmPicker());

        // Send (with optional attachment)
        const sendMsg = async () => {
            const input = document.getElementById('chat-input');
            const text = input.value.trim();
            const attachment = this.pendingAttachment;
            if (!text && !attachment) return;

            // Optimistic append
            const tempMsg = {
                id: 'tmp-' + Date.now(),
                senderName: window.currentUser?.name || 'You',
                senderEmail: window.currentUser?.email || '',
                message: text,
                timestamp: new Date().toISOString(),
                channel: this.currentChannel,
                attachment: attachment ? {
                    filename: attachment.original,
                    url: attachment.url,
                    size: attachment.size,
                    mime: attachment.mime,
                } : null,
            };
            this.appendMessage(tempMsg);
            input.value = '';
            this.clearPendingAttachment();

            try {
                const res = await api.post('/chat/send', {
                    channel: this.currentChannel,
                    message: text,
                    attachment: attachment || undefined,
                });
                if (res.success && res.message) {
                    // Update temporary ID with actual DB ID
                    const tempEl = this.messagesEl.querySelector(`[data-id="${tempMsg.id}"]`);
                    if (tempEl) {
                        tempEl.setAttribute('data-id', res.message.id);
                        const deleteBtn = tempEl.querySelector('.chat-delete-btn');
                        if (deleteBtn) {
                            deleteBtn.setAttribute('data-msg-id', res.message.id);
                        }
                    }
                }
            } catch (err) {
                App.showToast('Failed to send message', 'error');
            }
        };

        document.getElementById('chat-send-btn').addEventListener('click', sendMsg);
        document.getElementById('chat-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
        });

        // Attach file
        document.getElementById('chat-attach-btn').addEventListener('click', () => {
            document.getElementById('chat-file-input').click();
        });
        document.getElementById('chat-file-input').addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) this.uploadFile(f);
            e.target.value = '';
        });

        // Search
        document.getElementById('chat-search').addEventListener('input', async (e) => {
            const q = e.target.value.trim();
            if (q.length < 2) { this.loadMessages(); return; }
            try {
                const data = await api.get(`/chat/search?q=${encodeURIComponent(q)}`);
                this.renderMessages(data.results || []);
            } catch (e) { /* ignore */ }
        });

        this.loadMessages();
        this.joinSocketRoom(this.currentChannel);
    },

    switchChannel(channelId) {
        if (!channelId || channelId === this.currentChannel) {
            // still ensure visible-active is correct
            document.querySelectorAll('.chat-channel').forEach(c => c.classList.toggle('active', c.dataset.channel === this.currentChannel));
            return;
        }
        this.currentChannel = channelId;
        const meta = this.channels.find(c => c.id === channelId);
        document.getElementById('chat-channel-title').textContent = meta ? meta.name : channelId;
        document.querySelectorAll('.chat-channel').forEach(c => c.classList.toggle('active', c.dataset.channel === channelId));
        this.clearPendingAttachment();
        this.loadMessages();
        this.joinSocketRoom(channelId);
    },

    joinSocketRoom(channelId) {
        if (window.App.socket) {
            window.App.socket.emit('join', { channel: channelId, email: window.currentUser?.email });
        }
    },

    renderChannels() {
        const list = document.getElementById('chat-channel-list');
        const groupHeader = (label) => `<div style="padding:10px 16px 4px; font-size:.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; font-weight:700;">${label}</div>`;

        const pub = this.channels.filter(c => c.type !== 'dm');
        const dms = this.channels.filter(c => c.type === 'dm');

        const renderOne = (ch) => `
            <div class="chat-channel ${ch.id === this.currentChannel ? 'active' : ''}" data-channel="${ch.id}">
                <span class="chat-channel-name">
                    <i class="fas fa-${ch.type === 'dm' ? 'user' : 'hashtag'}" style="margin-right:6px; color:var(--text-muted);"></i>
                    ${App.escapeHtml(ch.name || ch.id)}
                </span>
            </div>`;

        list.innerHTML = [
            groupHeader('Channels'),
            ...pub.map(renderOne),
            dms.length ? groupHeader('Direct Messages') : '',
            ...dms.map(renderOne),
        ].join('');
    },

    async openNewDmPicker() {
        let users = [];
        try {
            const data = await api.get('/chat/users');
            users = data.users || [];
        } catch (e) {
            App.showToast('Failed to load users', 'error');
            return;
        }
        if (users.length === 0) {
            App.showModal('New Direct Message', '<p>No other users available.</p>',
                '<button class="btn btn-outline" onclick="App.closeModal()">Close</button>');
            return;
        }
        const body = `
            <div class="form-row">
                <label>Pick a teammate to message</label>
                <input type="text" id="dm-search" placeholder="Search by name or email..." style="width:100%;">
            </div>
            <div id="dm-user-list" style="max-height:340px; overflow-y:auto; border:1px solid var(--border); border-radius:8px;">
                ${users.map(u => `
                    <div class="dm-user-row" data-email="${App.escapeHtml(u.email)}" data-name="${App.escapeHtml(u.name)}"
                         style="display:flex; align-items:center; gap:10px; padding:10px 12px; cursor:pointer; border-bottom:1px solid rgba(51,65,85,0.3);">
                        <span class="avatar-sm">${(u.name||'?').charAt(0).toUpperCase()}</span>
                        <div style="min-width:0; flex:1;">
                            <div style="font-weight:600; font-size:.88rem;">${App.escapeHtml(u.name)}</div>
                            <div style="font-size:.72rem; color:var(--text-muted);">${App.escapeHtml(u.email)} · ${u.role}</div>
                        </div>
                    </div>`).join('')}
            </div>
        `;
        App.showModal('New Direct Message', body,
            '<button class="btn btn-outline" onclick="App.closeModal()">Cancel</button>');

        setTimeout(() => {
            const search = document.getElementById('dm-search');
            search?.focus();
            search?.addEventListener('input', () => {
                const q = search.value.toLowerCase().trim();
                document.querySelectorAll('.dm-user-row').forEach(row => {
                    const hay = (row.dataset.name + ' ' + row.dataset.email).toLowerCase();
                    row.style.display = !q || hay.includes(q) ? 'flex' : 'none';
                });
            });
            document.querySelectorAll('.dm-user-row').forEach(row => {
                row.addEventListener('mouseenter', () => row.style.background = 'var(--bg-hover)');
                row.addEventListener('mouseleave', () => row.style.background = '');
                row.addEventListener('click', () => this.startDm(row.dataset.email));
            });
        }, 50);
    },

    async startDm(otherEmail) {
        try {
            const data = await api.post(`/chat/dm/${encodeURIComponent(otherEmail)}`, {});
            const ch = data.channel;
            App.closeModal();
            // Add to channel list if not already there, then switch
            if (!this.channels.find(c => c.id === ch.id)) {
                this.channels.push(ch);
                this.renderChannels();
            }
            this.switchChannel(ch.id);
        } catch (err) {
            App.showToast(err.message || 'Could not open DM', 'error');
        }
    },

    async uploadFile(file) {
        if (file.size > MAX_FILE) {
            App.showToast(`File is too large (${fmtSize(file.size)}). Max 10 MB.`, 'warning');
            return;
        }
        // Show preview row while uploading
        const previewEl = document.getElementById('chat-attachment-preview');
        previewEl.style.display = 'block';
        previewEl.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; font-size:.85rem;">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Uploading ${App.escapeHtml(file.name)} (${fmtSize(file.size)})…</span>
            </div>`;

        try {
            const fd = new FormData();
            fd.append('file', file);
            const data = await api.post('/chat/upload', fd);
            this.pendingAttachment = data.attachment;
            this.renderPendingAttachment();
        } catch (err) {
            App.showToast(err.message || 'Upload failed', 'error');
            this.clearPendingAttachment();
        }
    },

    renderPendingAttachment() {
        const previewEl = document.getElementById('chat-attachment-preview');
        const a = this.pendingAttachment;
        if (!a) { previewEl.style.display = 'none'; previewEl.innerHTML = ''; return; }
        const isImage = (a.mime || '').startsWith('image/');
        previewEl.style.display = 'block';
        previewEl.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                ${isImage ? `<img src="${a.url}" alt="" style="width:42px; height:42px; object-fit:cover; border-radius:6px;">`
                          : `<i class="fas fa-file" style="font-size:1.4rem; color:var(--accent);"></i>`}
                <div style="min-width:0; flex:1;">
                    <div style="font-size:.85rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${App.escapeHtml(a.original)}</div>
                    <div style="font-size:.72rem; color:var(--text-muted);">${fmtSize(a.size)} · ready to send</div>
                </div>
                <button class="btn-icon" id="chat-attach-clear" title="Remove attachment" style="color:var(--danger);">
                    <i class="fas fa-times"></i>
                </button>
            </div>`;
        document.getElementById('chat-attach-clear')?.addEventListener('click', () => this.clearPendingAttachment());
    },

    clearPendingAttachment() {
        this.pendingAttachment = null;
        const previewEl = document.getElementById('chat-attachment-preview');
        if (previewEl) { previewEl.style.display = 'none'; previewEl.innerHTML = ''; }
    },

    async loadMessages() {
        this.messagesEl.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>';
        try {
            const data = await api.get(`/chat/messages/${encodeURIComponent(this.currentChannel)}`);
            this.renderMessages(data.messages || []);
        } catch (err) {
            this.messagesEl.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load messages</p></div>';
        }
    },

    renderMessages(messages) {
        if (!messages || messages.length === 0) {
            this.messagesEl.innerHTML = '<div class="empty-state" style="margin-top:60px;"><i class="fas fa-comments" style="opacity:.3;"></i><p style="margin-top:8px;">No messages yet. Start the conversation!</p></div>';
            return;
        }
        this.messagesEl.innerHTML = messages.map(m => this.renderMessageHtml(m)).join('');
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    },

    renderAttachment(a) {
        if (!a) return '';
        const isImage = (a.mime || '').startsWith('image/');
        if (isImage) {
            return `<div style="margin-top:6px;">
                <a href="${a.url}" target="_blank" rel="noopener">
                    <img src="${a.url}" alt="${App.escapeHtml(a.filename)}"
                         style="max-width:260px; max-height:200px; border-radius:8px; border:1px solid var(--border); display:block;">
                </a>
                <div style="font-size:.7rem; color:var(--text-muted); margin-top:4px;">${App.escapeHtml(a.filename)} · ${fmtSize(a.size)}</div>
            </div>`;
        }
        return `<a href="${a.url}" target="_blank" rel="noopener" download
            style="display:inline-flex; align-items:center; gap:10px; margin-top:6px; padding:8px 12px; background:var(--bg-primary); border:1px solid var(--border); border-radius:8px; text-decoration:none; color:var(--text-primary); max-width:280px;">
            <i class="fas fa-file-${this._fileIcon(a.mime)}" style="font-size:1.3rem; color:var(--accent);"></i>
            <div style="min-width:0; flex:1;">
                <div style="font-size:.82rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${App.escapeHtml(a.filename)}</div>
                <div style="font-size:.7rem; color:var(--text-muted);">${fmtSize(a.size)} · click to download</div>
            </div>
        </a>`;
    },

    _fileIcon(mime) {
        mime = (mime || '').toLowerCase();
        if (mime.includes('pdf')) return 'pdf';
        if (mime.includes('zip') || mime.includes('compressed')) return 'archive';
        if (mime.includes('word')) return 'word';
        if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return 'excel';
        if (mime.includes('presentation') || mime.includes('powerpoint')) return 'powerpoint';
        if (mime.startsWith('audio/')) return 'audio';
        if (mime.startsWith('video/')) return 'video';
        return 'alt';
    },

    renderMessageHtml(msg) {
        const name = msg.senderName || msg.senderEmail || 'Unknown';
        const initial = (name.charAt(0) || '?').toUpperCase();
        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const myEmail = (window.currentUser?.email || '').toLowerCase();
        const isMgr = ['SuperAdmin', 'Manager'].includes(window.currentUser?.role);
        const isOwn = (msg.senderEmail || '').toLowerCase() === myEmail;
        const canDelete = isOwn || isMgr;
        const deleteBtn = canDelete && msg.id
            ? `<div class="chat-msg-actions">
                   <button class="btn-icon chat-delete-btn" data-msg-id="${msg.id}" title="Delete message">
                       <i class="fas fa-trash"></i>
                   </button>
               </div>`
            : '';
        return `
            <div class="chat-message" data-id="${msg.id}">
                <div class="chat-msg-avatar">${initial}</div>
                <div class="chat-msg-body">
                    <div>
                        <span class="chat-msg-name">${App.escapeHtml(name)}</span>
                        <span class="chat-msg-time">${time}</span>
                    </div>
                    ${msg.message ? `<div class="chat-msg-text">${App.escapeHtml(msg.message)}</div>` : ''}
                    ${this.renderAttachment(msg.attachment)}
                </div>
                ${deleteBtn}
            </div>
        `;
    },

    appendMessage(msg) {
        const empty = this.messagesEl.querySelector('.empty-state');
        if (empty) empty.remove();
        const div = document.createElement('div');
        div.innerHTML = this.renderMessageHtml(msg);
        this.messagesEl.appendChild(div.firstElementChild);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    },

    onSocketMessage(msg) {
        if (msg.channel === this.currentChannel && msg.senderEmail !== window.currentUser?.email) {
            this.appendMessage(msg);
        }
    },

    /** Handle real-time message deletion from socket */
    onSocketMessageDeleted(data) {
        if (data.channel === this.currentChannel) {
            const el = this.messagesEl?.querySelector(`[data-id="${data.id}"]`);
            if (el) {
                el.style.transition = 'opacity .3s';
                el.style.opacity = '0';
                setTimeout(() => el.remove(), 300);
            }
        }
    },
};
