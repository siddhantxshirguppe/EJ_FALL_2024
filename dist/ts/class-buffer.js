"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const color_1 = __importDefault(require("./color"));
const util = __importStar(require("./util"));
const Scale = __importStar(require("./scale"));
class ClassBuffer {
    constructor(dataBuffer) {
        this.dataBuffer = dataBuffer;
        this.colorScale = new Scale.LinearColorScale([0, 1], [color_1.default.White, color_1.default.Black]);
        this.color0 = color_1.default.None;
        this.color1 = color_1.default.None;
        this.angle = 0;
        this.name = dataBuffer.name;
    }
    thresholds(n) {
        if (n <= 0)
            return [];
        let scaleTrait = this.colorScale.interpolator;
        return util.arange(scaleTrait.range[0], scaleTrait.range[1], (scaleTrait.range[1] - scaleTrait.range[0]) / (n + 2))
            .slice(1, n + 1)
            .map(v => scaleTrait.invmap(v));
    }
    contours(thresholds, blur = 3) {
        return this.dataBuffer.contours(thresholds, blur);
    }
}
exports.default = ClassBuffer;
//# sourceMappingURL=class-buffer.js.map