"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearDirectory = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const clearDirectory = (directoryPath) => {
    const files = fs_1.default.readdirSync(directoryPath);
    for (const file of files) {
        const filePath = path_1.default.join(directoryPath, file);
        fs_1.default.unlinkSync(filePath);
    }
};
exports.clearDirectory = clearDirectory;
