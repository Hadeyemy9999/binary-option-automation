const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'binary-option-default-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      tier: user.tier,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

function generateNumericOtp(length = 6) {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  generateNumericOtp,
};
