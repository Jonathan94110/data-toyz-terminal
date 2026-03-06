const express = require('express');
const router = express.Router();
const db = require('../db.js');
const log = require('../logger.js');
const { auditLog } = require('../helpers/audit');
const { createNotification } = require('../helpers/notifications');
const { requireAuth } = require('../middleware/auth');
const { messageLimiter } = require('../middleware/rateLimiters');
const { upload } = require('../middleware/upload');

// Room member middleware (inline, with validation)
async function requireRoomMember(req, res, next) {
    try {
        const roomId = parseInt(req.params.roomId);
        if (isNaN(roomId)) return res.status(400).json({ error: 'Invalid channel ID.' });
        const result = await db.query("SELECT * FROM RoomMembers WHERE room_id = $1 AND username = $2", [roomId, req.user.username]);
        if (!result.rows[0]) return res.status(403).json({ error: 'You are not a member of this secure channel.' });
        req.roomMember = result.rows[0];
        next();
    } catch (err) {
        log.error('Room membership check failed', { refId: req.requestId, error: err.message });
        res.status(500).json({ error: 'Failed to verify channel membership.', refId: req.requestId });
    }
}

// Create a new room
router.post('/', requireAuth, async (req, res) => {
    const { name, type, members } = req.body;
    if (!type || !['dm', 'group'].includes(type)) return res.status(400).json({ error: 'Invalid channel type.' });
    if (!members || !Array.isArray(members) || members.length === 0) return res.status(400).json({ error: 'At least one member is required.' });
    if (name && name.length > 100) return res.status(400).json({ error: "Room name must be 100 characters or fewer." });

    try {
        if (type === 'dm') {
            if (members.length !== 1) return res.status(400).json({ error: 'DM channels require exactly one other operative.' });
            const otherUser = members[0];
            const existing = await db.query(`
                SELECT r.id FROM Rooms r
                JOIN RoomMembers rm1 ON r.id = rm1.room_id AND rm1.username = $1
                JOIN RoomMembers rm2 ON r.id = rm2.room_id AND rm2.username = $2
                WHERE r.type = 'dm'
            `, [req.user.username, otherUser]);
            if (existing.rows[0]) {
                const roomId = existing.rows[0].id;
                const membersResult = await db.query("SELECT username, role, joined_at, last_read_at FROM RoomMembers WHERE room_id = $1", [roomId]);
                return res.json({ id: roomId, name: null, type: 'dm', members: membersResult.rows });
            }
        }

        if (type === 'group' && (!name || !name.trim())) {
            return res.status(400).json({ error: 'Group channels require a name.' });
        }

        const now = new Date().toISOString();
        const roomResult = await db.query(
            "INSERT INTO Rooms (name, type, created_by, created_at) VALUES ($1, $2, $3, $4) RETURNING id",
            [type === 'dm' ? null : name.trim(), type, req.user.username, now]
        );
        const roomId = roomResult.rows[0].id;

        await db.query(
            "INSERT INTO RoomMembers (room_id, username, role, joined_at, last_read_at) VALUES ($1, $2, 'owner', $3, $3)",
            [roomId, req.user.username, now]
        );

        for (const member of members) {
            const userCheck = await db.query("SELECT id FROM Users WHERE username = $1", [member]);
            if (userCheck.rows[0]) {
                await db.query(
                    "INSERT INTO RoomMembers (room_id, username, role, joined_at) VALUES ($1, $2, 'member', $3) ON CONFLICT (room_id, username) DO NOTHING",
                    [roomId, member, now]
                );
                const roomDisplayName = type === 'dm' ? 'a secure channel' : `"${name.trim()}"`;
                await createNotification(member, 'message', `${req.user.username} invited you to ${roomDisplayName}`, 'room', roomId, req.user.username);
            }
        }

        await auditLog('ROOM_CREATE', req.user.username, `room_id:${roomId}`, `Created ${type} room${name ? ': ' + name.trim() : ''}`, req.ip);

        const allMembers = await db.query("SELECT username, role, joined_at FROM RoomMembers WHERE room_id = $1", [roomId]);
        res.status(201).json({ id: roomId, name: type === 'dm' ? null : name.trim(), type, createdBy: req.user.username, createdAt: now, members: allMembers.rows });
    } catch (err) {
        log.error('Create room error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// List all rooms (optimized: single query replaces N+1 pattern)
router.get('/', requireAuth, async (req, res) => {
    try {
        const username = req.user.username;

        // Single query: fetch rooms, members, last message, and unread count in one shot
        const roomsRes = await db.query(`
            SELECT r.id, r.name, r.type, r.created_by, r.created_at,
                (SELECT json_agg(json_build_object(
                    'username', rm2.username, 'role', rm2.role,
                    'joined_at', rm2.joined_at, 'avatar', u2.avatar
                )) FROM RoomMembers rm2
                LEFT JOIN Users u2 ON rm2.username = u2.username
                WHERE rm2.room_id = r.id) AS members,
                (SELECT json_build_object('author', m.author, 'content', m.content, 'createdAt', m.created_at)
                 FROM Messages m WHERE m.room_id = r.id ORDER BY m.id DESC LIMIT 1) AS last_message,
                CASE
                    WHEN my.last_read_at IS NOT NULL THEN
                        (SELECT COUNT(*) FROM Messages m WHERE m.room_id = r.id AND m.created_at > my.last_read_at AND m.author != $1)
                    ELSE
                        (SELECT COUNT(*) FROM Messages m WHERE m.room_id = r.id AND m.author != $1)
                END AS unread_count
            FROM Rooms r
            JOIN RoomMembers my ON r.id = my.room_id AND my.username = $1
            ORDER BY (SELECT MAX(m2.created_at) FROM Messages m2 WHERE m2.room_id = r.id) DESC NULLS LAST, r.id DESC
        `, [username]);

        const result = roomsRes.rows.map(room => ({
            id: room.id,
            name: room.name,
            type: room.type,
            createdBy: room.created_by,
            members: room.members || [],
            lastMessage: room.last_message || null,
            unreadCount: parseInt(room.unread_count) || 0
        }));

        res.json(result);
    } catch (err) {
        log.error('List rooms error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Unread total — MUST be before /:roomId
router.get('/unread-total', requireAuth, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT COALESCE(SUM(
                CASE
                    WHEN rm.last_read_at IS NOT NULL THEN (
                        SELECT COUNT(*) FROM Messages m
                        WHERE m.room_id = rm.room_id AND m.created_at > rm.last_read_at AND m.author != $1
                    )
                    ELSE (
                        SELECT COUNT(*) FROM Messages m
                        WHERE m.room_id = rm.room_id AND m.author != $1
                    )
                END
            ), 0) as total
            FROM RoomMembers rm
            WHERE rm.username = $1
        `, [req.user.username]);
        res.json({ unread: parseInt(result.rows[0].total) });
    } catch (err) {
        log.error('Unread total error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Get room details
router.get('/:roomId', requireAuth, requireRoomMember, async (req, res) => {
    try {
        const room = await db.query("SELECT * FROM Rooms WHERE id = $1", [req.params.roomId]);
        if (!room.rows[0]) return res.status(404).json({ error: 'Channel not found.' });

        const members = await db.query(`
            SELECT rm.username, rm.role, rm.joined_at, u.avatar
            FROM RoomMembers rm
            LEFT JOIN Users u ON rm.username = u.username
            WHERE rm.room_id = $1
        `, [req.params.roomId]);

        const r = room.rows[0];
        res.json({ id: r.id, name: r.name, type: r.type, createdBy: r.created_by, members: members.rows });
    } catch (err) {
        log.error('Get room error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Update room name
router.put('/:roomId', requireAuth, requireRoomMember, async (req, res) => {
    if (req.roomMember.role !== 'owner') return res.status(403).json({ error: 'Only the channel commander can modify settings.' });
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Channel name is required.' });
    if (name.length > 100) return res.status(400).json({ error: "Room name must be 100 characters or fewer." });
    try {
        await db.query("UPDATE Rooms SET name = $1 WHERE id = $2", [name.trim(), req.params.roomId]);
        res.json({ message: 'Channel name updated.', name: name.trim() });
    } catch (err) {
        log.error('Update room error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Add member
router.post('/:roomId/members', requireAuth, requireRoomMember, async (req, res) => {
    if (req.roomMember.role !== 'owner') return res.status(403).json({ error: 'Only the channel commander can add operatives.' });
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required.' });

    try {
        const room = await db.query("SELECT type, name FROM Rooms WHERE id = $1", [req.params.roomId]);
        if (room.rows[0].type === 'dm') return res.status(400).json({ error: 'Cannot add members to a DM channel.' });

        const userCheck = await db.query("SELECT id FROM Users WHERE username = $1", [username]);
        if (!userCheck.rows[0]) return res.status(404).json({ error: 'Operative not found.' });

        const now = new Date().toISOString();
        await db.query(
            "INSERT INTO RoomMembers (room_id, username, role, joined_at) VALUES ($1, $2, 'member', $3) ON CONFLICT (room_id, username) DO NOTHING",
            [req.params.roomId, username, now]
        );
        await createNotification(username, 'message', `${req.user.username} added you to "${room.rows[0].name}"`, 'room', parseInt(req.params.roomId), req.user.username);
        res.json({ message: `${username} added to channel.` });
    } catch (err) {
        log.error('Add room member error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Remove member or leave
router.delete('/:roomId/members/:username', requireAuth, requireRoomMember, async (req, res) => {
    const targetUsername = req.params.username;
    const isLeavingSelf = targetUsername === req.user.username;

    try {
        if (!isLeavingSelf && req.roomMember.role !== 'owner') {
            return res.status(403).json({ error: 'Only the channel commander can remove operatives.' });
        }

        await db.query("DELETE FROM RoomMembers WHERE room_id = $1 AND username = $2", [req.params.roomId, targetUsername]);

        const remaining = await db.query("SELECT * FROM RoomMembers WHERE room_id = $1 ORDER BY joined_at ASC", [req.params.roomId]);
        if (remaining.rows.length === 0) {
            await db.query("DELETE FROM Rooms WHERE id = $1", [req.params.roomId]);
            await auditLog('ROOM_DELETE', req.user.username, `room_id:${req.params.roomId}`, 'Room dissolved — all operatives departed', req.ip);
            return res.json({ message: 'Channel dissolved — all operatives have departed.' });
        }

        if (isLeavingSelf && req.roomMember.role === 'owner') {
            const newOwner = remaining.rows[0];
            await db.query("UPDATE RoomMembers SET role = 'owner' WHERE room_id = $1 AND username = $2", [req.params.roomId, newOwner.username]);
        }

        if (!isLeavingSelf) {
            await createNotification(targetUsername, 'message', `You were removed from a secure channel by ${req.user.username}`, 'room', parseInt(req.params.roomId), req.user.username);
        }

        res.json({ message: isLeavingSelf ? 'You have left the channel.' : `${targetUsername} removed from channel.` });
    } catch (err) {
        log.error('Remove room member error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Get messages
router.get('/:roomId/messages', requireAuth, requireRoomMember, async (req, res) => {
    const before = req.query.before;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    try {
        let messagesQuery;
        let params;
        if (before) {
            messagesQuery = "SELECT * FROM Messages WHERE room_id = $1 AND id < $2 ORDER BY id DESC LIMIT $3";
            params = [req.params.roomId, before, limit];
        } else {
            messagesQuery = "SELECT * FROM Messages WHERE room_id = $1 ORDER BY id DESC LIMIT $2";
            params = [req.params.roomId, limit];
        }
        const messages = await db.query(messagesQuery, params);

        const messageIds = messages.rows.map(m => m.id);
        let reactions = [];
        if (messageIds.length > 0) {
            const reactResult = await db.query(
                `SELECT * FROM MessageReactions WHERE message_id = ANY($1)`,
                [messageIds]
            );
            reactions = reactResult.rows;
        }

        const result = messages.rows.map(m => ({
            id: m.id,
            roomId: m.room_id,
            author: m.author,
            content: m.content,
            image: m.image,
            createdAt: m.created_at,
            reactions: reactions.filter(r => r.message_id === m.id).map(r => ({ author: r.author, emoji: r.emoji }))
        }));

        const now = new Date().toISOString();
        await db.query("UPDATE RoomMembers SET last_read_at = $1 WHERE room_id = $2 AND username = $3", [now, req.params.roomId, req.user.username]);

        res.json(result.reverse());
    } catch (err) {
        log.error('Get room messages error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Send message
router.post('/:roomId/messages', requireAuth, requireRoomMember, messageLimiter, upload.single('image'), async (req, res) => {
    const { content } = req.body;
    const image = req.file ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}` : null;

    if (!content && !image) return res.status(400).json({ error: 'Message content or image required.' });
    if (content && content.length > 5000) return res.status(400).json({ error: "Message must be 5000 characters or fewer." });

    try {
        const now = new Date().toISOString();
        const result = await db.query(
            "INSERT INTO Messages (room_id, author, content, image, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [req.params.roomId, req.user.username, content || null, image, now]
        );

        await db.query("UPDATE RoomMembers SET last_read_at = $1 WHERE room_id = $2 AND username = $3", [now, req.params.roomId, req.user.username]);
        await db.query("DELETE FROM TypingIndicators WHERE room_id = $1 AND username = $2", [req.params.roomId, req.user.username]);

        const room = await db.query("SELECT name, type FROM Rooms WHERE id = $1", [req.params.roomId]);
        const members = await db.query("SELECT username FROM RoomMembers WHERE room_id = $1 AND username != $2", [req.params.roomId, req.user.username]);

        const truncated = content ? (content.length > 50 ? content.substring(0, 50) + '...' : content) : '📸 Image';
        const roomName = room.rows[0].type === 'dm' ? 'Secure Channel' : room.rows[0].name;

        for (const row of members.rows) {
            await createNotification(row.username, 'message', `${req.user.username} in ${roomName}: ${truncated}`, 'room', parseInt(req.params.roomId), req.user.username);
        }

        res.status(201).json({
            id: result.rows[0].id, roomId: parseInt(req.params.roomId), author: req.user.username,
            content: content || null, image, createdAt: now, reactions: []
        });
    } catch (err) {
        log.error('Send message error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// React to message
router.post('/:roomId/messages/:messageId/react', requireAuth, requireRoomMember, async (req, res) => {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'Emoji required.' });

    try {
        const existing = await db.query(
            "SELECT * FROM MessageReactions WHERE message_id = $1 AND author = $2",
            [req.params.messageId, req.user.username]
        );

        if (!existing.rows[0]) {
            await db.query(
                "INSERT INTO MessageReactions (message_id, author, emoji) VALUES ($1, $2, $3)",
                [req.params.messageId, req.user.username, emoji]
            );
            res.json({ action: 'added' });
        } else if (existing.rows[0].emoji === emoji) {
            await db.query("DELETE FROM MessageReactions WHERE id = $1", [existing.rows[0].id]);
            res.json({ action: 'removed' });
        } else {
            await db.query("UPDATE MessageReactions SET emoji = $1 WHERE id = $2", [emoji, existing.rows[0].id]);
            res.json({ action: 'updated' });
        }
    } catch (err) {
        log.error('Message react error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Delete message
router.delete('/:roomId/messages/:messageId', requireAuth, requireRoomMember, async (req, res) => {
    try {
        const msg = await db.query("SELECT * FROM Messages WHERE id = $1 AND room_id = $2", [req.params.messageId, req.params.roomId]);
        if (!msg.rows[0]) return res.status(404).json({ error: 'Message not found.' });
        if (msg.rows[0].author !== req.user.username && req.roomMember.role !== 'owner') {
            return res.status(403).json({ error: 'Insufficient clearance to delete this message.' });
        }
        await db.query("DELETE FROM Messages WHERE id = $1", [req.params.messageId]);
        res.json({ message: 'Message redacted.' });
    } catch (err) {
        log.error('Delete message error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Poll for new messages
router.get('/:roomId/poll', requireAuth, requireRoomMember, async (req, res) => {
    const after = parseInt(req.query.after) || 0;

    try {
        const messages = await db.query(
            "SELECT * FROM Messages WHERE room_id = $1 AND id > $2 ORDER BY id ASC",
            [req.params.roomId, after]
        );

        const messageIds = messages.rows.map(m => m.id);
        let reactions = [];
        if (messageIds.length > 0) {
            const reactResult = await db.query("SELECT * FROM MessageReactions WHERE message_id = ANY($1)", [messageIds]);
            reactions = reactResult.rows;
        }

        const formattedMessages = messages.rows.map(m => ({
            id: m.id, roomId: m.room_id, author: m.author, content: m.content,
            image: m.image, createdAt: m.created_at,
            reactions: reactions.filter(r => r.message_id === m.id).map(r => ({ author: r.author, emoji: r.emoji }))
        }));

        const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
        const typing = await db.query(
            "SELECT username FROM TypingIndicators WHERE room_id = $1 AND username != $2 AND updated_at > $3",
            [req.params.roomId, req.user.username, fiveSecondsAgo]
        );

        if (formattedMessages.length > 0) {
            const now = new Date().toISOString();
            await db.query("UPDATE RoomMembers SET last_read_at = $1 WHERE room_id = $2 AND username = $3", [now, req.params.roomId, req.user.username]);
        }

        res.json({ messages: formattedMessages, typing: typing.rows.map(r => r.username) });
    } catch (err) {
        log.error('Room poll error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

// Typing indicator
router.post('/:roomId/typing', requireAuth, requireRoomMember, messageLimiter, async (req, res) => {
    try {
        const now = new Date().toISOString();
        await db.query(
            "INSERT INTO TypingIndicators (room_id, username, updated_at) VALUES ($1, $2, $3) ON CONFLICT (room_id, username) DO UPDATE SET updated_at = $3",
            [req.params.roomId, req.user.username, now]
        );
        res.json({ ok: true });
    } catch (err) {
        log.error('Typing indicator error', { refId: req.requestId, error: err.message || err });
        res.status(500).json({ error: 'An internal error occurred.', refId: req.requestId });
    }
});

module.exports = router;
