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
const path_1 = __importDefault(require("./path"));
const rn = __importStar(require("random-seed"));
class Mask {
    constructor(width, height, default_value = 1, buffer, offset = 0) {
        this.width = width;
        this.height = height;
        if (buffer === undefined)
            buffer = new ArrayBuffer(width * height);
        this.mask = Array(height);
        for (let i = 0; i < height; i++) {
            this.mask[i] = new Uint8ClampedArray(buffer, i * width + offset, width);
            if (default_value != undefined)
                this.mask[i].fill(default_value);
        }
    }
    rowcounts(step = 1) {
        let reducer = (accumulator, currentValue) => accumulator + currentValue;
        let rowcounts = this.mask.map(row => row.reduce(reducer));
        for (let i = 1; i < rowcounts.length; i++)
            rowcounts[i] += rowcounts[i - 1];
        return rowcounts;
    }
    pixcount(step = 1) {
        let cpt = 0;
        for (let j = 0; j < this.mask.length; j += step)
            for (let i = 0; i < this.mask[j].length; i += step)
                cpt += this.mask[j][i];
        return cpt;
    }
    area() {
        let rc = this.rowcounts();
        return rc[rc.length - 1];
    }
    randomPoint(rowcounts) {
        if (rowcounts === undefined)
            rowcounts = this.rowcounts();
        let rand = rn.create('JaeminFredPierreJean-Daniel');
        var pos = rand(rowcounts[rowcounts.length - 1]);
        var r = 0;
        while (rowcounts[r] < pos)
            r++;
        if (r > 0)
            pos -= rowcounts[r - 1];
        let row = this.mask[r];
        for (let c = 0; c < this.width; c++) {
            if (row[c])
                pos--;
            if (pos == 0)
                return [r, c];
        }
        throw new Error('Random point not found as expected');
    }
    //[jdf] For linearize and buffer to work, we need to store the offset in the class
    //buffer() { return this.mask[0].buffer; }
    // linearize():number[] {
    //     // Fool the type system of TS that prevents returning the Float32Array directly
    //     return <number[]><any>new Uint8ClampedArray(this.buffer(), this.width*this.height,
    //                                                 this.offset);
    // }
    getCanvas() {
        if (this.maskCanvas == undefined) {
            this.maskCanvas = document.createElement('canvas');
            this.maskCanvas.width = this.width;
            this.maskCanvas.height = this.height;
        }
        return this.maskCanvas;
    }
    getPath() {
        if (this.path === undefined)
            this.path = new path_1.default();
        return this.path;
    }
    copyFrom(ctx) {
        let imageData = ctx.getImageData(0, 0, this.width, this.height);
        var i = 0;
        for (let r = 0; r < imageData.height; r++) {
            let row = this.mask[r];
            for (let c = 0; c < imageData.width; c++) {
                if (imageData.data[i] > 0) {
                    row[c] = 1;
                }
                i += 4;
            }
        }
    }
    copyTo(ctx) {
        let imageData = ctx.getImageData(0, 0, this.width, this.height);
        var i = 0;
        for (let r = 0; r < imageData.height; r++) {
            let row = this.mask[r];
            for (let c = 0; c < imageData.width; c++) {
                if (row[c] > 0) {
                    imageData.data[i] = 255;
                }
                i += 4;
            }
        }
    }
}
exports.default = Mask;
//# sourceMappingURL=mask.js.map