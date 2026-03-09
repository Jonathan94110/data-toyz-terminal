// Postgres lowercases all column names. This remaps them back to camelCase for the frontend.
const COL_MAP = {
    classtie: 'classTie', imagepath: 'imagePath', postid: 'postId',
    targetid: 'targetId', targetname: 'targetName', targettier: 'targetTier',
    mtstotal: 'mtsTotal', approvalscore: 'approvalScore', jsondata: 'jsonData',
    password_hash: 'password_hash', created_at: 'created_at',
    room_id: 'roomId', message_id: 'messageId', created_by: 'createdBy',
    joined_at: 'joinedAt', last_read_at: 'lastReadAt', updated_at: 'updatedAt',
    figure_id: 'figureId', figure_name: 'figureName', class_tie: 'classTie',
    validated_by: 'validatedBy', user_id: 'userId', market_price: 'marketPrice',
    price_high: 'priceHigh', price_avg: 'priceAvg',
    price_low: 'priceLow', submitted_by: 'submittedBy', submission_id: 'submissionId',
    cost_basis: 'costBasis', price_type: 'priceType', market_signal: 'marketSignal',
    market_signal_updated_at: 'marketSignalUpdatedAt',
    edited_at: 'editedAt', post_id: 'postId', flagged_by: 'flaggedBy',
    follower_id: 'followerId', following_id: 'followingId',
    post_author: 'postAuthor', post_content: 'postContent', post_date: 'postDate',
    flag_count: 'flagCount',
    hasimage: 'hasImage', submissioncount: 'submissionCount'
};
function normalizeRow(row) {
    if (!row) return row;
    const out = {};
    for (const key of Object.keys(row)) {
        out[COL_MAP[key] || key] = row[key];
    }
    return out;
}
function normalizeRows(rows) { return rows.map(normalizeRow); }

module.exports = { COL_MAP, normalizeRow, normalizeRows };
