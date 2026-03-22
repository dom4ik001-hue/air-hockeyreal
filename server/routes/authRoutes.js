/**
 * authRoutes.js — Authentication routes
 */
const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { register, login } = require('../controllers/authController');

const router = express.Router();

// Rate limiter: max 10 auth attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Слишком много попыток. Попробуйте через 15 минут.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Validation rules
const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 16 }).withMessage('Никнейм: 3–16 символов')
    .matches(/^[a-zA-Zа-яА-Я0-9_]+$/).withMessage('Никнейм: только буквы, цифры и _'),
  body('password')
    .isLength({ min: 6 }).withMessage('Пароль: минимум 6 символов')
];

const loginValidation = [
  body('username').trim().notEmpty().withMessage('Введите никнейм'),
  body('password').notEmpty().withMessage('Введите пароль')
];

router.post('/register', authLimiter, registerValidation, register);
router.post('/login',    authLimiter, loginValidation,    login);

module.exports = router;
