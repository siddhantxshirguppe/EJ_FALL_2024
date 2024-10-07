"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.largeRectInPoly = void 0;
exports.positive = positive;
exports.translate = translate;
exports.create2D = create2D;
exports.linterp = linterp;
exports.asum = asum;
exports.amax = amax;
exports.amin = amin;
exports.arange = arange;
exports.get = get;
exports.deg2rad = deg2rad;
exports.rad2deg = rad2deg;
function positive(x) { return x > 0; }
function translate(x, y) { return `translate(${x}, ${y})`; }
function create2D(width, height, value) {
    let arr = new Array(height);
    for (let i = 0; i < height; ++i)
        arr[i] = new Array(width).fill(value);
    return arr;
}
function linterp(v1, v2, t) {
    return v1 * (1 - t) + v2 * t;
}
function asum(values) {
    let n = values.length;
    var i = -1, value, sum = NaN;
    while (++i < n) { // Find the first comparable value.
        if ((value = values[i]) != null && value >= value) {
            sum = value;
            while (++i < n) { // Compare the remaining values.
                if ((value = values[i]) != null && value >= value) {
                    sum += value;
                }
            }
        }
    }
    return sum;
}
function amax(values) {
    let n = values.length;
    var i = -1, value, max = NaN;
    while (++i < n) { // Find the first comparable value.
        if ((value = values[i]) != null && value >= value) {
            max = value;
            while (++i < n) { // Compare the remaining values.
                if ((value = values[i]) != null && value > max) {
                    max = value;
                }
            }
        }
    }
    return max;
}
function amin(values) {
    let n = values.length;
    var i = -1, value, min = NaN;
    while (++i < n) {
        if ((value = values[i]) != null && value >= value) {
            min = value;
            while (++i < n) { // Compare the remaining values.
                if ((value = values[i]) != null && min > value) {
                    min = value;
                }
            }
        }
    }
    return min;
}
function arange(start, end, step) {
    var n = start;
    if (end == undefined) {
        end = start;
        start = 0;
    }
    else
        n = end - start;
    if (step == undefined)
        step = 1;
    else
        n = n / step;
    n = Math.floor(n);
    let array = new Array(n);
    for (let i = 0; i < n; i++) {
        array[i] = start;
        start += step;
    }
    return array;
}
let ongoing = {};
let cache = {};
function get(url, useCache = true, responseType) {
    if (useCache && cache[url]) {
        return Promise.resolve(cache[url]);
    }
    if (!useCache || !ongoing[url]) {
        ongoing[url] = [];
        const request = new XMLHttpRequest();
        request.onload = function () {
            if (useCache)
                cache[url] = this.response;
            if (this.status === 200) {
                ongoing[url].forEach(f => {
                    f[0](this.response);
                });
            }
            else {
                ongoing[url].forEach(f => {
                    f[1](new Error(this.statusText));
                });
            }
            delete ongoing[url];
        };
        request.onerror = function () {
            ongoing[url].forEach(f => {
                f[1](new Error('XMLHttpRequest Error: ' + this.statusText));
            });
        };
        request.open('GET', url);
        if (responseType)
            request.responseType = responseType;
        request.send();
    }
    return new Promise(function (resolve, reject) {
        ongoing[url].push([resolve, reject]);
    });
}
var largest_rect_in_poly_1 = require("./largest-rect-in-poly");
Object.defineProperty(exports, "largeRectInPoly", { enumerable: true, get: function () { return __importDefault(largest_rect_in_poly_1).default; } });
function deg2rad(degrees) { return degrees * Math.PI / 180; }
function rad2deg(radians) { return radians * 180 / Math.PI; }
//# sourceMappingURL=util.js.map