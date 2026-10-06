const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const db = require('../config/database');
const {
  generateAccessToken,
  generateRefreshToken,
  generateNumericOtp,
} = require('../utils/token');

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  full_name: z.string().min(2).optional(),
  phone_number: z.string().optional(),
  telegram_username: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

class AuthController {
  static async register(req, res) {
    try {
      const parseResult = registerSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          errors: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const { email, password, full_name, phone_number, telegram_username } = parseResult.data;

      // Check existing user
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email address already exists.',
        });
      }

      const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const passwordHash = await bcrypt.hash(password, 10);

      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, phone_number, telegram_username)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        email.toLowerCase().trim(),
        passwordHash,
        full_name || null,
        phone_number || null,
        telegram_username ? telegram_username.replace('@', '') : null
      );

      const user = db.prepare('SELECT id, email, full_name, role, tier, phone_number, phone_verified, telegram_chat_id, created_at FROM users WHERE id = ?').get(userId);

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken();

      const refreshExpiresDays = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '7', 10);
      const expiresAt = new Date(Date.now() + refreshExpiresDays * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO refresh_tokens (id, user_id, token, expires_at)
        VALUES (?, ?, ?, ?)
      `).run('tok_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), user.id, refreshToken, expiresAt);

      return res.status(201).json({
        success: true,
        message: 'User registered successfully.',
        data: {
          user,
          tokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: 'Bearer',
            expires_in: 900,
          },
        },
      });
    } catch (error) {
      console.error('Registration error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  static async login(req, res) {
    try {
      const parseResult = loginSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          errors: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const { email, password } = parseResult.data;

      const user = db.prepare(`
        SELECT id, email, password_hash, full_name, role, tier, phone_number, phone_verified, telegram_chat_id, is_active
        FROM users WHERE email = ?
      `).get(email.toLowerCase().trim());

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password.',
        });
      }

      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Account has been disabled. Please contact support.',
        });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password.',
        });
      }

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken();

      const refreshExpiresDays = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '7', 10);
      const expiresAt = new Date(Date.now() + refreshExpiresDays * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO refresh_tokens (id, user_id, token, expires_at)
        VALUES (?, ?, ?, ?)
      `).run('tok_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), user.id, refreshToken, expiresAt);

      const safeUser = {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        tier: user.tier,
        phone_number: user.phone_number,
        phone_verified: !!user.phone_verified,
        telegram_chat_id: user.telegram_chat_id,
      };

      return res.status(200).json({
        success: true,
        message: 'Logged in successfully.',
        data: {
          user: safeUser,
          tokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: 'Bearer',
            expires_in: 900,
          },
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  static async refreshToken(req, res) {
    try {
      const { refresh_token } = req.body;
      if (!refresh_token) {
        return res.status(400).json({ success: false, message: 'Refresh token is required.' });
      }

      const tokenRecord = db.prepare(`
        SELECT rt.*, u.id as user_id, u.email, u.role, u.tier, u.is_active
        FROM refresh_tokens rt
        JOIN users u ON rt.user_id = u.id
        WHERE rt.token = ? AND rt.revoked = 0
      `).get(refresh_token);

      if (!tokenRecord) {
        return res.status(401).json({ success: false, message: 'Invalid or revoked refresh token.' });
      }

      if (new Date(tokenRecord.expires_at) < new Date()) {
        return res.status(401).json({ success: false, message: 'Refresh token has expired.' });
      }

      if (!tokenRecord.is_active) {
        return res.status(403).json({ success: false, message: 'User account disabled.' });
      }

      // Rotate refresh token
      db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token = ?').run(refresh_token);

      const newRefreshToken = generateRefreshToken();
      const refreshExpiresDays = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '7', 10);
      const expiresAt = new Date(Date.now() + refreshExpiresDays * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO refresh_tokens (id, user_id, token, expires_at)
        VALUES (?, ?, ?, ?)
      `).run('tok_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), tokenRecord.user_id, newRefreshToken, expiresAt);

      const newAccessToken = generateAccessToken({
        id: tokenRecord.user_id,
        email: tokenRecord.email,
        role: tokenRecord.role,
        tier: tokenRecord.tier,
      });

      return res.status(200).json({
        success: true,
        data: {
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
          token_type: 'Bearer',
          expires_in: 900,
        },
      });
    } catch (error) {
      console.error('Refresh token error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  static async logout(req, res) {
    try {
      const { refresh_token } = req.body;
      if (refresh_token) {
        db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token = ?').run(refresh_token);
      }
      return res.status(200).json({ success: true, message: 'Logged out successfully.' });
    } catch (error) {
      console.error('Logout error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  static async getProfile(req, res) {
    return res.status(200).json({
      success: true,
      data: {
        user: req.user,
      },
    });
  }

  // Request SMS verification OTP
  static async requestPhoneOtp(req, res) {
    try {
      const { phone_number } = req.body;
      const targetPhone = phone_number || req.user.phone_number;

      if (!targetPhone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required to send verification OTP.',
        });
      }

      const otp = generateNumericOtp(6);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

      db.prepare(`
        INSERT INTO verification_codes (id, user_id, type, code, target_value, expires_at)
        VALUES (?, ?, 'PHONE_OTP', ?, ?, ?)
      `).run('otp_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), req.user.id, otp, targetPhone, expiresAt);

      // In production: send via Twilio SMS. In dev mode: also return OTP for fast testing.
      const isDev = process.env.NODE_ENV !== 'production';

      return res.status(200).json({
        success: true,
        message: `OTP sent to ${targetPhone}. Valid for 10 minutes.`,
        ...(isDev ? { dev_otp: otp } : {}),
      });
    } catch (error) {
      console.error('Request Phone OTP error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Verify Phone OTP
  static async verifyPhoneOtp(req, res) {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ success: false, message: 'OTP code is required.' });
      }

      const record = db.prepare(`
        SELECT * FROM verification_codes
        WHERE user_id = ? AND type = 'PHONE_OTP' AND code = ? AND is_used = 0
        ORDER BY created_at DESC LIMIT 1
      `).get(req.user.id, code.trim());

      if (!record) {
        return res.status(400).json({ success: false, message: 'Invalid or expired OTP code.' });
      }

      if (new Date(record.expires_at) < new Date()) {
        return res.status(400).json({ success: false, message: 'OTP code has expired.' });
      }

      db.prepare('UPDATE verification_codes SET is_used = 1 WHERE id = ?').run(record.id);

      db.prepare(`
        UPDATE users
        SET phone_number = ?, phone_verified = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(record.target_value, req.user.id);

      return res.status(200).json({
        success: true,
        message: 'Phone number verified successfully! You will now receive SMS alerts.',
      });
    } catch (error) {
      console.error('Verify Phone OTP error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Generate Telegram Bot connection token
  static async generateTelegramLink(req, res) {
    try {
      const linkToken = crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

      db.prepare(`
        INSERT INTO verification_codes (id, user_id, type, code, expires_at)
        VALUES (?, ?, 'TELEGRAM_LINK', ?, ?)
      `).run('tg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), req.user.id, linkToken, expiresAt);

      return res.status(200).json({
        success: true,
        data: {
          token: linkToken,
          deep_link: `https://t.me/BinarySignalsBot?start=${linkToken}`,
          expires_in_minutes: 30,
        },
      });
    } catch (error) {
      console.error('Telegram Link error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

module.exports = AuthController;
