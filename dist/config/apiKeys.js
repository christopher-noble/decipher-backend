"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.awsCreds = exports.rapidApiCreds = void 0;
const constants_1 = require("../utils/constants");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.rapidApiCreds = {
    apiUrl: process.env.X_RAPID_API_URL,
    headers: {
        'X-RapidAPI-Key': process.env.X_RAPID_API_KEY,
        'X-RapidAPI-Host': process.env.X_RAPID_API_HOST,
    }
};
exports.awsCreds = {
    region: constants_1.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
};
