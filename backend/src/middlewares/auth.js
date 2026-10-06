const { verifyAccessToken } = require('../utils/token');
const db = require('../config/database');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authorization token provided.',
    });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired access token.',
    });
  }

  const stmt = db.prepare('SELECT id, email, full_name, role, tier, phone_number, phone_verified, telegram_chat_id, is_active FROM users WHERE id = ?');
  const user = stmt.get(decoded.id);

  if (!user || !user.is_active) {
    return res.status(401).json({
      success: false,
      message: 'User not found or account is deactivated.',
    });
  }

  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Insufficient permissions.',
      });
    }
    next();
  };
}

module.exports = {
  authenticate,
  requireRole,
};
