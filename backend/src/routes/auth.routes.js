const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth');

// Public routes
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/refresh', AuthController.refreshToken);
router.post('/logout', AuthController.logout);

// Protected routes
router.get('/me', authenticate, AuthController.getProfile);
router.post('/phone/send-otp', authenticate, AuthController.requestPhoneOtp);
router.post('/phone/verify-otp', authenticate, AuthController.verifyPhoneOtp);
router.post('/telegram/link', authenticate, AuthController.generateTelegramLink);

module.exports = router;
