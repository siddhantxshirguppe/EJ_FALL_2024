import Color from './color';
import Mask from './mask';
import * as util from './util';
import GaussianBlur from './gaussian-blur';
import * as d3 from 'd3-contour';

export default class DataBuffer {
    values: Float32Array[];

    constructor(public name: string, public width: number, public height: number,
        values?: number[][]) {
        let buffer = new ArrayBuffer(width * height * 4); // sizeof float32
        this.values = Array<Float32Array>(height);

        for (let i = 0; i < height; i++) {
            this.values[i] = new Float32Array(buffer, i * width * 4, width);
            if (values)
                this.values[i].set(values[i]);
        }
    }

    buffer() { return this.values[0].buffer; }

    linearize(): number[] {
        // return Array.prototype.concat.apply(this.values[0],
        //                                     this.values.slice(1));
        // return Array.prototype.slice.call(new Float32Array(this.values[0].buffer));
        // Fool the type system of TS that prevents returning the Float32Array directly
        return <number[]><any>new Float32Array(this.buffer());
    }

    // copy() {
    //     return new DataBuffer(this.name, this.width, this.height, <any>this.values);
    // }

    // equals(other:DataBuffer) {
    //     let b1 = this.linearize();
    //     let b2 = other.linearize();
    //     if (b1.length != b2.length) return false;
    //     for (let i = 0; i < b1.length; i++)
    //         if (b1[i] !== b2[i]) return false;
    //     return true;
    // }

    min() {
        return util.amin(this.linearize());
    }

    max() {
        return util.amax(this.linearize());
    }

    rescale(scale: number) {
        let arr = this.linearize();
        for (let i = 0; i < arr.length; i++)
            arr[i] *= scale;
    }

    blur(radius: number = 3): DataBuffer {
        if (radius == 0) return this;
        // Linearize the array
        let source = this.linearize().slice(0), // copy
            dest = new DataBuffer(this.name, this.width, this.height),
            target = <number[]><any>new Float32Array(dest.buffer());
        GaussianBlur(source, target, this.width, this.height, radius);
        return dest;
    }

    contours(thresholds?: number[], blur: number = 1) {
        let contours = d3.contours().size([this.width, this.height]);
        var values = this.linearize();
        if (blur != 0) {
            let target = <number[]><any>new Float32Array(this.width * this.height);
            GaussianBlur(values, target, this.width, this.height, blur);
            values = target;
        }

        if (thresholds != undefined)
            contours.thresholds(thresholds);

        return contours(values);
    }

    // makeContour(contourNumber:number = 12): DataBuffer {
    //     if (contourNumber==0) return this;
    //     let mini = this.min(),
    //         maxi = this.max(),
    //         bandsize = (maxi-mini)/contourNumber,
    //         ids = new DataBuffer(this.name, this.width, this.height);

    //     // compute ids first
    //     for (let y=0; y < this.height; y++) {
    //         let src = this.values[y],
    //             dst = ids.values[y];
    //         for (let x = 0; x < this.width; x++)
    //             dst[x] = Math.floor((src[x]-mini)/bandsize);
    //     }

    //     let ndb = new DataBuffer(this.name, this.width, this.height);
    //     for (let y=0; y < this.height-1; y++) {
    //         let dst = ndb.values[y],
    //             src = this.values[y],
    //             ids0 = ids.values[y],
    //             ids1 = ids.values[y+1];
    //         for (let x=0; x<this.width-1; x++) {
    //             if (ids0[x] != ids1[x] || ids0[x] != ids0[x+1])
    //                 dst[x] = src[x];
    //         }
    //     }

    //     return ndb;
    // }
}
