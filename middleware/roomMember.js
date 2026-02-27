const db = require('../db.js');

async function requireRoomMember(req, res, next) {
    try {
        const result = await db.query(
            "SELECT * FROM RoomMembers WHERE room_id = $1 AND username = $2",
            [req.params.roomId, req.user.username]
        );
        if (!result.rows[0]) {
            return res.status(403).json({ error: 'You are not a member of this room.' });
        }
        req.roomMember = result.rows[0];
        next();
    } catch (err) {
        return res.status(500).json({ error: 'An internal error occurred.' });
    }
}

module.exports = { requireRoomMember };
