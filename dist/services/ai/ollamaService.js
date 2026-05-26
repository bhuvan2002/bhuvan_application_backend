"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCompletion = void 0;
const axios_1 = __importDefault(require("axios"));
const OLLAMA_BASE_URL = 'http://localhost:11434';
const MODEL = 'mistral';
const generateCompletion = (prompt, systemPrompt) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
        const response = yield axios_1.default.post(`${OLLAMA_BASE_URL}/api/generate`, {
            model: MODEL,
            prompt: fullPrompt,
            stream: false,
            format: 'json', // Ensures Mistral tries to return valid JSON
            options: {
                temperature: 0.2, // Low temperature for more analytical/deterministic output
            }
        }, {
            timeout: 300000 // 5 minutes timeout, complex financial prompts take time on local hardware
        });
        return response.data.response;
    }
    catch (error) {
        const detail = ((_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) || error.message;
        console.error('Ollama Generation Error:', detail);
        throw new Error(`Ollama Error: ${detail}`);
    }
});
exports.generateCompletion = generateCompletion;
